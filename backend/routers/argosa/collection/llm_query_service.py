# backend/routers/argosa/data_collection/llm_query_service.py - LLM 직접 질의응답 서비스 (개선된 버전)

from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, List, Optional, Any, Union, Callable
from enum import Enum
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, validator
import json
import logging
import asyncio
import aiohttp
import os
from collections import deque, defaultdict
import hashlib
from contextlib import asynccontextmanager
import backoff
from concurrent.futures import ThreadPoolExecutor

# Firefox 통합 관리자
from backend.services.firefox_manager import firefox_manager, FirefoxMode, managed_firefox

logger = logging.getLogger(__name__)

# ======================== Configuration ========================

# 환경변수 기반 설정
LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://localhost:1234/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_ORG_ID = os.getenv("OPENAI_ORG_ID", "")

# 타임아웃 설정
DEFAULT_TIMEOUT = 120  # 2분
MAX_RETRIES = 3
BACKOFF_MAX_TIME = 60  # 최대 재시도 대기 시간

# 캐시 설정
CACHE_TTL = 3600  # 1시간
MAX_CACHE_SIZE = 1000

# Rate limiting
RATE_LIMIT_WINDOW = 60  # 1분
RATE_LIMIT_MAX_REQUESTS = {
    "lm_studio": 100,
    "openai": 50,
    "anthropic": 30
}

# ======================== Enhanced Data Models ========================

class LLMProvider(str, Enum):
    """LLM 제공자"""
    LM_STUDIO = "lm_studio"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    CUSTOM = "custom"

class QueryType(str, Enum):
    """질의 유형"""
    ANALYSIS = "analysis"
    QUESTION = "question"
    EXTRACTION = "extraction"
    SUMMARY = "summary"
    COMPARISON = "comparison"
    PREDICTION = "prediction"

class LLMQueryRequest(BaseModel):
    """LLM 질의 요청"""
    query: str = Field(..., min_length=1, max_length=10000)
    query_type: QueryType = QueryType.QUESTION
    context: Optional[Dict[str, Any]] = {}
    data: Optional[Any] = None
    provider: LLMProvider = LLMProvider.LM_STUDIO
    model: Optional[str] = None
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2000, ge=1, le=8000)
    system_prompt: Optional[str] = None
    cache_enabled: bool = True
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    @validator('query')
    def validate_query(cls, v):
        if not v.strip():
            raise ValueError("Query cannot be empty")
        return v.strip()

class LLMResponse(BaseModel):
    """LLM 응답"""
    query_id: str
    response: Union[str, Dict[str, Any]]
    query_type: QueryType
    provider: LLMProvider
    model: str
    processing_time: float
    token_usage: Optional[Dict[str, int]] = None
    metadata: Dict[str, Any] = {}
    cached: bool = False
    error: Optional[str] = None

class AnalysisRequest(BaseModel):
    """데이터 분석 요청"""
    data: Any
    analysis_type: str = Field(..., regex="^(pattern|statistical|comparative|predictive|diagnostic|prescriptive)$")
    questions: List[str] = []
    output_format: str = Field(default="structured", regex="^(structured|narrative|visual)$")
    provider: LLMProvider = LLMProvider.LM_STUDIO
    model: Optional[str] = None
    include_recommendations: bool = True

class BatchQueryRequest(BaseModel):
    """배치 질의 요청"""
    queries: List[LLMQueryRequest]
    parallel: bool = True
    max_concurrent: int = Field(default=5, ge=1, le=20)
    stop_on_error: bool = False

# ======================== Security and Rate Limiting ========================

class SecurityConfig:
    """보안 설정 관리"""
    
    def __init__(self):
        self._api_keys = {}
        self._load_keys()
    
    def _load_keys(self):
        """API 키 로드 (환경변수에서)"""
        if OPENAI_API_KEY:
            self._api_keys["openai"] = OPENAI_API_KEY
        if ANTHROPIC_API_KEY:
            self._api_keys["anthropic"] = ANTHROPIC_API_KEY
    
    def get_api_key(self, provider: str) -> str:
        """API 키 가져오기"""
        if provider not in self._api_keys:
            raise ValueError(f"API key for {provider} not configured")
        return self._api_keys[provider]
    
    def mask_api_key(self, key: str) -> str:
        """API 키 마스킹"""
        if len(key) < 8:
            return "*" * len(key)
        return key[:4] + "*" * (len(key) - 8) + key[-4:]

class RateLimiter:
    """Rate limiting 관리"""
    
    def __init__(self):
        self.requests: Dict[str, deque] = defaultdict(lambda: deque())
        self._lock = asyncio.Lock()
    
    async def check_rate_limit(self, provider: str) -> bool:
        """Rate limit 확인"""
        async with self._lock:
            now = datetime.now(timezone.utc)
            window_start = now - timedelta(seconds=RATE_LIMIT_WINDOW)
            
            # 오래된 요청 제거
            requests = self.requests[provider]
            while requests and requests[0] < window_start:
                requests.popleft()
            
            # 한도 확인
            limit = RATE_LIMIT_MAX_REQUESTS.get(provider, 100)
            if len(requests) >= limit:
                return False
            
            # 요청 기록
            requests.append(now)
            return True
    
    async def wait_if_needed(self, provider: str):
        """필요시 대기"""
        while not await self.check_rate_limit(provider):
            await asyncio.sleep(1)

# ======================== Response Cache ========================

class ResponseCache:
    """응답 캐시 관리"""
    
    def __init__(self):
        self.cache: Dict[str, Tuple[Any, datetime]] = {}
        self.access_times: Dict[str, datetime] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
    
    def _generate_key(self, request: LLMQueryRequest) -> str:
        """캐시 키 생성"""
        key_data = {
            "query": request.query,
            "query_type": request.query_type,
            "provider": request.provider,
            "model": request.model,
            "temperature": request.temperature,
            "system_prompt": request.system_prompt
        }
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.sha256(key_str.encode()).hexdigest()
    
    async def get(self, request: LLMQueryRequest) -> Optional[Any]:
        """캐시에서 가져오기"""
        if not request.cache_enabled:
            return None
        
        key = self._generate_key(request)
        async with self._lock:
            if key in self.cache:
                response, cached_time = self.cache[key]
                
                # TTL 확인
                if (datetime.now(timezone.utc) - cached_time).total_seconds() < CACHE_TTL:
                    self.access_times[key] = datetime.now(timezone.utc)
                    logger.info(f"Cache hit for query: {request.query[:50]}...")
                    return response
                else:
                    # 만료된 항목 제거
                    del self.cache[key]
                    del self.access_times[key]
        
        return None
    
    async def set(self, request: LLMQueryRequest, response: Any):
        """캐시에 저장"""
        if not request.cache_enabled:
            return
        
        key = self._generate_key(request)
        async with self._lock:
            # 크기 제한 확인
            if len(self.cache) >= MAX_CACHE_SIZE:
                await self._evict_lru()
            
            self.cache[key] = (response, datetime.now(timezone.utc))
            self.access_times[key] = datetime.now(timezone.utc)
    
    async def _evict_lru(self):
        """LRU 항목 제거"""
        if not self.access_times:
            return
        
        # 가장 오래된 항목 찾기
        lru_key = min(self.access_times.items(), key=lambda x: x[1])[0]
        del self.cache[lru_key]
        del self.access_times[lru_key]
    
    async def _periodic_cleanup(self):
        """주기적 정리"""
        while True:
            await asyncio.sleep(300)  # 5분마다
            
            async with self._lock:
                now = datetime.now(timezone.utc)
                expired_keys = []
                
                for key, (_, cached_time) in self.cache.items():
                    if (now - cached_time).total_seconds() > CACHE_TTL:
                        expired_keys.append(key)
                
                for key in expired_keys:
                    del self.cache[key]
                    self.access_times.pop(key, None)
                
                if expired_keys:
                    logger.info(f"Cleaned up {len(expired_keys)} expired cache entries")
    
    async def shutdown(self):
        """정리"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

# ======================== LLM Query Service ========================

class LLMQueryService:
    """LLM 직접 질의응답 서비스"""
    
    def __init__(self):
        self.providers = {
            LLMProvider.LM_STUDIO: self._query_lm_studio,
            LLMProvider.OPENAI: self._query_openai,
            LLMProvider.ANTHROPIC: self._query_anthropic,
        }
        
        self.default_models = {
            LLMProvider.LM_STUDIO: "Qwen2.5-VL-7B-Instruct",
            LLMProvider.OPENAI: "gpt-4",
            LLMProvider.ANTHROPIC: "claude-3-opus-20240229"
        }
        
        # 관리 컴포넌트
        self.security = SecurityConfig()
        self.rate_limiter = RateLimiter()
        self.cache = ResponseCache()
        
        # 통계
        self.query_history = deque(maxlen=1000)
        self.provider_stats = {
            provider: {"total": 0, "success": 0, "errors": 0, "avg_time": 0.0} 
            for provider in LLMProvider
        }
        
        # HTTP 세션 (연결 재사용)
        self._sessions: Dict[str, aiohttp.ClientSession] = {}
        self._executor = ThreadPoolExecutor(max_workers=4)
    
    async def initialize(self):
        """서비스 초기화"""
        # HTTP 세션 생성
        for provider in [LLMProvider.LM_STUDIO, LLMProvider.OPENAI, LLMProvider.ANTHROPIC]:
            connector = aiohttp.TCPConnector(limit=10, limit_per_host=5)
            self._sessions[provider] = aiohttp.ClientSession(
                connector=connector,
                timeout=aiohttp.ClientTimeout(total=DEFAULT_TIMEOUT)
            )
    
    async def process_query(self, request: LLMQueryRequest) -> LLMResponse:
        """질의 처리"""
        
        start_time = datetime.now(timezone.utc)
        
        try:
            # 캐시 확인
            cached_response = await self.cache.get(request)
            if cached_response:
                return LLMResponse(
                    query_id=request.request_id,
                    response=cached_response["response"],
                    query_type=request.query_type,
                    provider=request.provider,
                    model=cached_response.get("model", "unknown"),
                    processing_time=0.0,
                    token_usage=cached_response.get("usage"),
                    cached=True
                )
            
            # Rate limiting
            await self.rate_limiter.wait_if_needed(request.provider.value)
            
            # 프롬프트 생성
            prompt = await self._create_prompt(request)
            
            # LLM 호출 (재시도 포함)
            response_data = await self._query_with_retry(request, prompt)
            
            # 응답 처리
            processed_response = await self._process_response(response_data, request)
            
            # 통계 업데이트
            processing_time = (datetime.now(timezone.utc) - start_time).total_seconds()
            await self._update_stats(request.provider, success=True, time=processing_time)
            
            # 캐시 저장
            cache_data = {
                "response": processed_response,
                "model": request.model or self.default_models[request.provider],
                "usage": response_data.get("usage")
            }
            await self.cache.set(request, cache_data)
            
            # 응답 생성
            response = LLMResponse(
                query_id=request.request_id,
                response=processed_response,
                query_type=request.query_type,
                provider=request.provider,
                model=request.model or self.default_models[request.provider],
                processing_time=processing_time,
                token_usage=response_data.get("usage"),
                metadata={
                    "timestamp": start_time.isoformat(),
                    "context_size": len(str(request.context)) if request.context else 0,
                    "data_size": len(str(request.data)) if request.data else 0
                }
            )
            
            # 히스토리 저장
            self._save_to_history(request, response)
            
            return response
            
        except Exception as e:
            logger.error(f"Query processing error: {e}", exc_info=True)
            
            processing_time = (datetime.now(timezone.utc) - start_time).total_seconds()
            await self._update_stats(request.provider, success=False, time=processing_time)
            
            # 에러 응답
            return LLMResponse(
                query_id=request.request_id,
                response="",
                query_type=request.query_type,
                provider=request.provider,
                model=request.model or self.default_models[request.provider],
                processing_time=processing_time,
                error=str(e)
            )
    
    async def _query_with_retry(self, request: LLMQueryRequest, prompt: Dict[str, Any]) -> Dict[str, Any]:
        """재시도 로직이 포함된 쿼리"""
        
        @backoff.on_exception(
            backoff.expo,
            (aiohttp.ClientError, asyncio.TimeoutError),
            max_tries=MAX_RETRIES,
            max_time=BACKOFF_MAX_TIME
        )
        async def query():
            if request.provider in self.providers:
                return await self.providers[request.provider](prompt, request)
            else:
                raise ValueError(f"Unsupported provider: {request.provider}")
        
        return await query()
    
    async def _create_prompt(self, request: LLMQueryRequest) -> Dict[str, Any]:
        """프롬프트 생성"""
        
        # 시스템 프롬프트
        system_prompts = {
            QueryType.ANALYSIS: "You are a data analysis expert. Provide detailed, insightful analysis. Be specific and actionable.",
            QueryType.QUESTION: "You are a helpful AI assistant. Answer questions accurately and clearly.",
            QueryType.EXTRACTION: "You are an information extraction specialist. Extract relevant information precisely and completely.",
            QueryType.SUMMARY: "You are a summarization expert. Create concise, comprehensive summaries that capture key points.",
            QueryType.COMPARISON: "You are a comparison analyst. Compare items objectively with clear criteria and balanced perspective.",
            QueryType.PREDICTION: "You are a predictive analyst. Make informed predictions based on available data with confidence levels."
        }
        
        system_prompt = request.system_prompt or system_prompts.get(
            request.query_type,
            "You are a helpful AI assistant."
        )
        
        # 사용자 프롬프트 구성
        user_prompt_parts = []
        
        # 컨텍스트 추가
        if request.context:
            context_str = json.dumps(request.context, indent=2, ensure_ascii=False)
            user_prompt_parts.append(f"Context:\n{context_str}")
        
        # 데이터 추가
        if request.data:
            if isinstance(request.data, (dict, list)):
                data_str = json.dumps(request.data, indent=2, ensure_ascii=False)
            else:
                data_str = str(request.data)
            
            # 데이터 크기 제한
            if len(data_str) > 50000:
                data_str = data_str[:50000] + "\n... (data truncated for length)"
            
            user_prompt_parts.append(f"Data:\n{data_str}")
        
        # 실제 쿼리 추가
        user_prompt_parts.append(f"Query: {request.query}")
        
        user_prompt = "\n\n".join(user_prompt_parts)
        
        return {
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens
        }
    
    async def _query_lm_studio(self, prompt: Dict[str, Any], request: LLMQueryRequest) -> Dict[str, Any]:
        """LM Studio 질의"""
        
        model = request.model or self.default_models[LLMProvider.LM_STUDIO]
        session = self._sessions.get(LLMProvider.LM_STUDIO)
        
        if not session:
            raise RuntimeError("LM Studio session not initialized")
        
        try:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": prompt["system_prompt"]},
                    {"role": "user", "content": prompt["user_prompt"]}
                ],
                "temperature": prompt["temperature"],
                "max_tokens": prompt["max_tokens"],
                "stream": False
            }
            
            async with session.post(f"{LM_STUDIO_URL}/chat/completions", json=payload) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"LM Studio error (status {response.status}): {error_text}")
                
                data = await response.json()
                
                return {
                    "content": data["choices"][0]["message"]["content"],
                    "usage": data.get("usage"),
                    "model": model
                }
                
        except asyncio.TimeoutError:
            raise Exception("LM Studio request timeout")
        except Exception as e:
            logger.error(f"LM Studio query error: {e}")
            raise
    
    async def _query_openai(self, prompt: Dict[str, Any], request: LLMQueryRequest) -> Dict[str, Any]:
        """OpenAI API 질의"""
        
        try:
            api_key = self.security.get_api_key("openai")
        except ValueError as e:
            raise Exception(f"OpenAI configuration error: {e}")
        
        model = request.model or self.default_models[LLMProvider.OPENAI]
        session = self._sessions.get(LLMProvider.OPENAI)
        
        if not session:
            raise RuntimeError("OpenAI session not initialized")
        
        try:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            if OPENAI_ORG_ID:
                headers["OpenAI-Organization"] = OPENAI_ORG_ID
            
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": prompt["system_prompt"]},
                    {"role": "user", "content": prompt["user_prompt"]}
                ],
                "temperature": prompt["temperature"],
                "max_tokens": prompt["max_tokens"]
            }
            
            async with session.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload
            ) as response:
                
                if response.status == 429:
                    raise Exception("OpenAI rate limit exceeded")
                elif response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"OpenAI error (status {response.status}): {error_text}")
                
                data = await response.json()
                
                return {
                    "content": data["choices"][0]["message"]["content"],
                    "usage": data.get("usage"),
                    "model": model
                }
                
        except asyncio.TimeoutError:
            raise Exception("OpenAI request timeout")
        except Exception as e:
            logger.error(f"OpenAI query error: {e}")
            raise
    
    async def _query_anthropic(self, prompt: Dict[str, Any], request: LLMQueryRequest) -> Dict[str, Any]:
        """Anthropic Claude API 질의"""
        
        try:
            api_key = self.security.get_api_key("anthropic")
        except ValueError as e:
            raise Exception(f"Anthropic configuration error: {e}")
        
        model = request.model or self.default_models[LLMProvider.ANTHROPIC]
        session = self._sessions.get(LLMProvider.ANTHROPIC)
        
        if not session:
            raise RuntimeError("Anthropic session not initialized")
        
        try:
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
            
            payload = {
                "model": model,
                "messages": [
                    {"role": "user", "content": prompt["user_prompt"]}
                ],
                "system": prompt["system_prompt"],
                "max_tokens": prompt["max_tokens"],
                "temperature": prompt["temperature"]
            }
            
            async with session.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json=payload
            ) as response:
                
                if response.status == 429:
                    raise Exception("Anthropic rate limit exceeded")
                elif response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Anthropic error (status {response.status}): {error_text}")
                
                data = await response.json()
                
                return {
                    "content": data["content"][0]["text"],
                    "usage": data.get("usage"),
                    "model": model
                }
                
        except asyncio.TimeoutError:
            raise Exception("Anthropic request timeout")
        except Exception as e:
            logger.error(f"Anthropic query error: {e}")
            raise
    
    async def _process_response(self, response_data: Dict[str, Any], request: LLMQueryRequest) -> Union[str, Dict[str, Any]]:
        """응답 후처리"""
        
        content = response_data.get("content", "")
        
        # JSON 응답 시도 (특정 쿼리 타입)
        if request.query_type in [QueryType.ANALYSIS, QueryType.EXTRACTION]:
            try:
                # JSON 블록 추출
                json_start = -1
                json_end = -1
                
                # ```json 블록 찾기
                if "```json" in content:
                    json_start = content.find("```json") + 7
                    json_end = content.find("```", json_start)
                # { 로 시작하는 JSON 찾기
                elif content.strip().startswith("{"):
                    json_start = 0
                    json_end = len(content)
                
                if json_start >= 0 and json_end > json_start:
                    json_str = content[json_start:json_end].strip()
                    return json.loads(json_str)
                
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse JSON response: {e}")
                # JSON 파싱 실패시 원본 반환
        
        return content
    
    async def _update_stats(self, provider: LLMProvider, success: bool, time: float):
        """통계 업데이트"""
        stats = self.provider_stats[provider]
        stats["total"] += 1
        
        if success:
            stats["success"] += 1
            # 이동평균 계산
            stats["avg_time"] = (stats["avg_time"] * (stats["success"] - 1) + time) / stats["success"]
        else:
            stats["errors"] += 1
    
    def _save_to_history(self, request: LLMQueryRequest, response: LLMResponse):
        """질의 히스토리 저장"""
        
        history_entry = {
            "query_id": response.query_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "query": request.query[:200],  # 처음 200자만
            "query_type": request.query_type.value,
            "provider": request.provider.value,
            "model": response.model,
            "processing_time": response.processing_time,
            "cached": response.cached,
            "success": response.error is None
        }
        
        self.query_history.append(history_entry)
    
    async def analyze_data(self, request: AnalysisRequest) -> Dict[str, Any]:
        """데이터 분석 전문 처리"""
        
        # 분석 유형별 프롬프트 템플릿
        analysis_templates = {
            "pattern": "Analyze the following data and identify patterns, trends, and anomalies. Look for regularities, outliers, and correlations.",
            "statistical": "Perform statistical analysis on this data including mean, median, mode, standard deviation, distribution characteristics, and significance tests where applicable.",
            "comparative": "Compare and contrast the different elements in this data. Identify similarities, differences, and unique characteristics.",
            "predictive": "Based on this data, make predictions about future trends. Include confidence levels and key assumptions.",
            "diagnostic": "Diagnose issues or problems evident in this data. Identify root causes and contributing factors.",
            "prescriptive": "Provide actionable recommendations based on the analysis of this data. Prioritize by impact and feasibility."
        }
        
        # 기본 분석 프롬프트
        base_prompt = analysis_templates.get(
            request.analysis_type,
            "Analyze the following data comprehensively."
        )
        
        # 질문들 추가
        if request.questions:
            questions_text = "\n".join([f"{i+1}. {q}" for i, q in enumerate(request.questions)])
            base_prompt += f"\n\nSpecifically answer these questions:\n{questions_text}"
        
        # 추천사항 포함 여부
        if request.include_recommendations:
            base_prompt += "\n\nInclude specific, actionable recommendations based on your analysis."
        
        # 출력 형식 지정
        if request.output_format == "structured":
            base_prompt += "\n\nProvide the analysis in a structured JSON format with clear sections: summary, key_findings, detailed_analysis, and recommendations (if applicable)."
        elif request.output_format == "narrative":
            base_prompt += "\n\nProvide the analysis as a clear, well-structured narrative with headings and subheadings."
        
        # LLM 질의 생성
        llm_request = LLMQueryRequest(
            query=base_prompt,
            query_type=QueryType.ANALYSIS,
            data=request.data,
            provider=request.provider,
            model=request.model,
            temperature=0.3,  # 분석은 일관성 있게
            max_tokens=4000   # 분석은 더 긴 응답 허용
        )
        
        # 처리
        response = await self.process_query(llm_request)
        
        if response.error:
            raise HTTPException(status_code=500, detail=response.error)
        
        return {
            "analysis_type": request.analysis_type,
            "results": response.response,
            "questions_answered": len(request.questions),
            "processing_time": response.processing_time,
            "model_used": response.model,
            "token_usage": response.token_usage
        }
    
    async def batch_process(self, batch_request: BatchQueryRequest) -> List[Dict[str, Any]]:
        """배치 처리"""
        results = []
        
        if batch_request.parallel:
            # 병렬 처리
            semaphore = asyncio.Semaphore(batch_request.max_concurrent)
            
            async def process_with_semaphore(query: LLMQueryRequest):
                async with semaphore:
                    return await self.process_query(query)
            
            tasks = [process_with_semaphore(query) for query in batch_request.queries]
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            for query, response in zip(batch_request.queries, responses):
                if isinstance(response, Exception):
                    if batch_request.stop_on_error:
                        raise response
                    results.append({
                        "success": False,
                        "query_id": query.request_id,
                        "error": str(response)
                    })
                else:
                    results.append({
                        "success": True,
                        "response": response.dict()
                    })
        else:
            # 순차 처리
            for query in batch_request.queries:
                try:
                    response = await self.process_query(query)
                    results.append({
                        "success": True,
                        "response": response.dict()
                    })
                except Exception as e:
                    if batch_request.stop_on_error:
                        raise
                    results.append({
                        "success": False,
                        "query_id": query.request_id,
                        "error": str(e)
                    })
        
        return results
    
    async def get_provider_stats(self) -> Dict[str, Any]:
        """제공자별 통계"""
        
        return {
            provider.value: {
                "total_queries": stats["total"],
                "successful_queries": stats["success"],
                "error_count": stats["errors"],
                "success_rate": (stats["success"] / stats["total"] * 100) if stats["total"] > 0 else 0,
                "average_response_time": round(stats["avg_time"], 2)
            }
            for provider, stats in self.provider_stats.items()
        }
    
    async def get_query_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """질의 히스토리 조회"""
        
        return list(self.query_history)[-limit:]
    
    async def shutdown(self):
        """정리"""
        # HTTP 세션 정리
        for session in self._sessions.values():
            await session.close()
        
        # 캐시 정리
        await self.cache.shutdown()
        
        # Executor 정리
        self._executor.shutdown(wait=True)

# ======================== Specialized Services ========================

class DataAnalysisService:
    """데이터 분석 전문 서비스"""
    
    def __init__(self, llm_service: LLMQueryService):
        self.llm_service = llm_service
    
    async def analyze_conversation_data(self, conversations: List[Dict[str, Any]], 
                                      analysis_goals: List[str]) -> Dict[str, Any]:
        """대화 데이터 분석"""
        
        analysis_prompt = """Analyze the following conversation data comprehensively:

Goals:
{goals}

Data Summary:
- Total conversations: {total}
- Date range: {date_range}
- Platforms: {platforms}
- Sample size: {sample_size}

Sample Conversations:
{sample_data}

Provide insights on:
1. Main topics and themes discussed
2. User behavior patterns and preferences
3. Common questions and pain points
4. Sentiment analysis and emotional patterns
5. Usage patterns across time and platforms
6. Knowledge gaps and learning opportunities
7. Specific insights related to the analysis goals

Return a structured analysis with these sections: executive_summary, detailed_findings, patterns_identified, recommendations, and metrics."""
        
        # 데이터 요약
        total = len(conversations)
        platforms = list(set(conv.get("platform", "unknown") for conv in conversations))
        dates = [conv.get("created_at", "") for conv in conversations if conv.get("created_at")]
        date_range = f"{min(dates)} to {max(dates)}" if dates else "Unknown"
        
        # 샘플 추출 (메모리 효율적)
        sample_size = min(20, len(conversations))
        sample_convs = conversations[:sample_size]
        
        # 샘플 데이터 포맷팅
        sample_data = json.dumps(sample_convs, indent=2, ensure_ascii=False)[:10000]
        
        # 프롬프트 완성
        prompt = analysis_prompt.format(
            goals="\n".join([f"- {goal}" for goal in analysis_goals]),
            total=total,
            date_range=date_range,
            platforms=", ".join(platforms),
            sample_size=sample_size,
            sample_data=sample_data
        )
        
        request = LLMQueryRequest(
            query=prompt,
            query_type=QueryType.ANALYSIS,
            temperature=0.3,
            max_tokens=4000
        )
        
        response = await self.llm_service.process_query(request)
        
        if response.error:
            raise HTTPException(status_code=500, detail=response.error)
        
        return {
            "analysis": response.response,
            "conversations_analyzed": total,
            "sample_size": sample_size,
            "model_used": response.model,
            "processing_time": response.processing_time
        }
    
    async def compare_platforms(self, platform_data: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
        """플랫폼 간 비교 분석"""
        
        comparison_prompt = """Compare the usage patterns across different LLM platforms:

Platform Summaries:
{platform_summaries}

Analyze and compare:
1. Usage frequency and patterns for each platform
2. Types of queries and use cases per platform
3. Unique strengths and specializations of each platform
4. User behavior and preference differences
5. Quality and depth of responses
6. Technical capabilities and limitations
7. Recommendations for optimal platform selection based on use case

Provide a comprehensive comparison with clear criteria and actionable insights."""
        
        # 플랫폼별 요약 생성
        summaries = []
        for platform, data in platform_data.items():
            # 기본 통계
            total_convs = len(data)
            total_msgs = sum(len(d.get('messages', [])) for d in data)
            avg_msgs = total_msgs / total_convs if total_convs > 0 else 0
            
            # 시간 분포
            hours = defaultdict(int)
            for conv in data:
                if conv.get('created_at'):
                    try:
                        dt = datetime.fromisoformat(conv['created_at'].replace('Z', '+00:00'))
                        hours[dt.hour] += 1
                    except:
                        pass
            
            peak_hour = max(hours.items(), key=lambda x: x[1])[0] if hours else "N/A"
            
            summary = f"""Platform: {platform}
- Total conversations: {total_convs}
- Total messages: {total_msgs}
- Average messages per conversation: {avg_msgs:.1f}
- Peak usage hour: {peak_hour}
- Sample topics: {', '.join([d.get('title', '')[:30] for d in data[:5]])}"""
            
            summaries.append(summary)
        
        request = LLMQueryRequest(
            query=comparison_prompt.format(platform_summaries="\n\n".join(summaries)),
            query_type=QueryType.COMPARISON,
            temperature=0.4,
            max_tokens=3000
        )
        
        response = await self.llm_service.process_query(request)
        
        if response.error:
            raise HTTPException(status_code=500, detail=response.error)
        
        return {
            "comparison": response.response,
            "platforms_compared": list(platform_data.keys()),
            "total_conversations": sum(len(data) for data in platform_data.values()),
            "model_used": response.model,
            "processing_time": response.processing_time
        }

# ======================== API Router ========================

router = APIRouter(prefix="/llm/query", tags=["llm_query"])

# 서비스 인스턴스
llm_service = LLMQueryService()
analysis_service = DataAnalysisService(llm_service)

# 초기화
@router.on_event("startup")
async def startup():
    """서비스 시작 시 초기화"""
    await llm_service.initialize()
    logger.info("LLM Query Service initialized")

@router.on_event("shutdown")
async def shutdown():
    """서비스 종료 시 정리"""
    await llm_service.shutdown()
    logger.info("LLM Query Service shutdown")

@router.post("/process", response_model=LLMResponse)
async def process_query(request: LLMQueryRequest):
    """일반 LLM 질의 처리"""
    return await llm_service.process_query(request)

@router.post("/analyze")
async def analyze_data(request: AnalysisRequest):
    """데이터 분석 요청"""
    return await llm_service.analyze_data(request)

@router.post("/analyze/conversations")
async def analyze_conversations(
    conversations: List[Dict[str, Any]], 
    analysis_goals: List[str] = None
):
    """대화 데이터 분석"""
    if not analysis_goals:
        analysis_goals = [
            "Identify common user needs and pain points",
            "Extract learning patterns and knowledge gaps",
            "Analyze platform usage preferences"
        ]
    
    return await analysis_service.analyze_conversation_data(conversations, analysis_goals)

@router.post("/compare/platforms")
async def compare_platforms(platform_data: Dict[str, List[Dict[str, Any]]]):
    """플랫폼 비교 분석"""
    if not platform_data:
        raise HTTPException(status_code=400, detail="No platform data provided")
    
    return await analysis_service.compare_platforms(platform_data)

@router.get("/stats/providers")
async def get_provider_statistics():
    """LLM 제공자 통계"""
    return await llm_service.get_provider_stats()

@router.get("/history")
async def get_query_history(limit: int = 100):
    """질의 히스토리"""
    if limit > 1000:
        raise HTTPException(status_code=400, detail="Limit cannot exceed 1000")
    
    return {
        "history": await llm_service.get_query_history(limit),
        "total": len(llm_service.query_history)
    }

@router.post("/batch")
async def batch_queries(batch_request: BatchQueryRequest):
    """배치 질의 처리"""
    if len(batch_request.queries) > 100:
        raise HTTPException(status_code=400, detail="Batch size cannot exceed 100")
    
    try:
        results = await llm_service.batch_process(batch_request)
        
        successful = sum(1 for r in results if r["success"])
        
        return {
            "total": len(batch_request.queries),
            "successful": successful,
            "failed": len(batch_request.queries) - successful,
            "results": results
        }
    except Exception as e:
        logger.error(f"Batch processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/cache/stats")
async def get_cache_statistics():
    """캐시 통계"""
    cache = llm_service.cache
    
    return {
        "total_entries": len(cache.cache),
        "cache_size_limit": MAX_CACHE_SIZE,
        "ttl_seconds": CACHE_TTL,
        "oldest_entry": min(cache.access_times.values()).isoformat() if cache.access_times else None,
        "newest_entry": max(cache.access_times.values()).isoformat() if cache.access_times else None
    }

@router.post("/test/{provider}")
async def test_provider_connection(provider: LLMProvider):
    """LLM 제공자 연결 테스트"""
    
    test_request = LLMQueryRequest(
        query="Hello, this is a connection test. Please respond with 'Connection successful' and the current date.",
        query_type=QueryType.QUESTION,
        provider=provider,
        max_tokens=50,
        cache_enabled=False  # 테스트는 캐시 사용 안함
    )
    
    try:
        response = await llm_service.process_query(test_request)
        
        if response.error:
            return {
                "status": "error",
                "provider": provider.value,
                "error": response.error
            }
        
        return {
            "status": "connected",
            "provider": provider.value,
            "model": response.model,
            "response": response.response,
            "latency": response.processing_time
        }
    except Exception as e:
        return {
            "status": "error",
            "provider": provider.value,
            "error": str(e)
        }

# ======================== Helper Functions ========================

import uuid

async def test_all_providers() -> Dict[str, Any]:
    """모든 LLM 제공자 연결 테스트"""
    
    results = {}
    
    for provider in LLMProvider:
        if provider == LLMProvider.CUSTOM:
            continue
        
        try:
            test_result = await test_provider_connection(provider)
            results[provider.value] = test_result
        except Exception as e:
            results[provider.value] = {
                "status": "error",
                "error": str(e)
            }
    
    return results