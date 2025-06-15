# backend/routers/argosa/collection/llm_query_service.py - LLM 직접 질의응답 서비스 (Native Messaging 통합)

from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional, Any, Union
from enum import Enum
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, validator
import json
import logging
import asyncio
from collections import deque, defaultdict
import hashlib
import uuid

# Shared services import
try:
    from ..shared.cache_manager import cache_manager
    from ..shared.metrics import metrics
    HAS_SHARED_SERVICES = True
except ImportError as e:
    logger.warning(f"[LLM Query] Shared services not available (using legacy mode): {e}")
    cache_manager = None
    metrics = None
    HAS_SHARED_SERVICES = False

logger = logging.getLogger(__name__)

# ======================== Configuration ========================

# 타임아웃 설정
DEFAULT_TIMEOUT = 120  # 2분
MAX_RETRIES = 3

# Rate limiting
RATE_LIMIT_WINDOW = 60  # 1분
RATE_LIMIT_MAX_REQUESTS = 30  # Native를 통한 요청이므로 통합 제한

# Legacy mode 캐시 설정 (shared services 없을 때만 사용)
if not HAS_SHARED_SERVICES:
    CACHE_TTL = 3600  # 1시간
    MAX_CACHE_SIZE = 1000

# ======================== Data Models ========================

class LLMProvider(str, Enum):
    """LLM 제공자"""
    CHATGPT = "chatgpt"
    CLAUDE = "claude"
    GEMINI = "gemini"
    PPLX = "pplx"
    LM_STUDIO = "lm_studio"

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
    provider: LLMProvider = LLMProvider.CHATGPT
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
    conversation_id: Optional[str] = None
    metadata: Dict[str, Any] = {}
    cached: bool = False
    error: Optional[str] = None

class AnalysisRequest(BaseModel):
    """데이터 분석 요청"""
    data: Any
    analysis_type: str = Field(..., regex="^(pattern|statistical|comparative|predictive|diagnostic|prescriptive)$")
    questions: List[str] = []
    output_format: str = Field(default="structured", regex="^(structured|narrative|visual)$")
    provider: LLMProvider = LLMProvider.CHATGPT
    model: Optional[str] = None
    include_recommendations: bool = True

class BatchQueryRequest(BaseModel):
    """배치 질의 요청"""
    queries: List[LLMQueryRequest]
    parallel: bool = True
    max_concurrent: int = Field(default=5, ge=1, le=20)
    stop_on_error: bool = False

# ======================== Rate Limiting ========================

class RateLimiter:
    """Rate limiting 관리"""
    
    def __init__(self):
        self.requests: deque = deque()
        self._lock = asyncio.Lock()
    
    async def check_rate_limit(self) -> bool:
        """Rate limit 확인"""
        async with self._lock:
            now = datetime.now(timezone.utc)
            window_start = now - timedelta(seconds=RATE_LIMIT_WINDOW)
            
            # 오래된 요청 제거
            while self.requests and self.requests[0] < window_start:
                self.requests.popleft()
            
            # 한도 확인
            if len(self.requests) >= RATE_LIMIT_MAX_REQUESTS:
                return False
            
            # 요청 기록
            self.requests.append(now)
            return True
    
    async def wait_if_needed(self):
        """필요시 대기"""
        while not await self.check_rate_limit():
            await asyncio.sleep(1)

# ======================== LLM Query Service ========================

class LLMQueryService:
    """LLM 직접 질의응답 서비스 (Native Messaging 통합)"""
    
    def __init__(self):
        self.default_models = {
            LLMProvider.CHATGPT: "gpt-4",
            LLMProvider.CLAUDE: "claude-3-opus",
            LLMProvider.GEMINI: "gemini-pro",
            LLMProvider.PPLX: "pplx-70b",
            LLMProvider.LM_STUDIO: "local-model"
        }
        
        # 관리 컴포넌트
        self.rate_limiter = RateLimiter()
        
        # 캐시 설정 (Shared services 우선, 없으면 legacy)
        if HAS_SHARED_SERVICES and cache_manager:
            self.cache = cache_manager
            self._using_shared_cache = True
            logger.info("Using shared cache system")
        else:
            # ImportError 대신 경고만
            logger.warning("Shared cache not available, some features may be limited")
            self._using_shared_cache = False
            # 캐시 비활성화
            class DummyCache:
                async def get(self, *args): return None
                async def set(self, *args): return True
            self.cache = DummyCache()
        
        # 통계 (Shared services 사용 시 metrics로 대체)
        self.query_history = deque(maxlen=1000)
        if not HAS_SHARED_SERVICES:
            self.provider_stats = {
                provider: {"total": 0, "success": 0, "errors": 0, "avg_time": 0.0} 
                for provider in LLMProvider
            }
    
    def _generate_cache_key(self, request: LLMQueryRequest) -> str:
        """캐시 키 생성 (shared cache용)"""
        key_data = {
            "query": request.query,
            "query_type": request.query_type,
            "provider": request.provider,
            "model": request.model,
            "temperature": request.temperature,
            "system_prompt": request.system_prompt
        }
        key_str = json.dumps(key_data, sort_keys=True)
        return f"llm_query:{hashlib.sha256(key_str.encode()).hexdigest()}"
    
    async def process_query(self, request: LLMQueryRequest) -> LLMResponse:
        """질의 처리"""
        
        start_time = datetime.now(timezone.utc)
        
        try:
            # 캐시 확인
            cached_response = None
            if self._using_shared_cache and request.cache_enabled:
                cache_key = self._generate_cache_key(request)
                cached_response = await self.cache.get(cache_key)
            else:
                cached_response = await self.cache.get(request)
            
            if cached_response:
                return LLMResponse(
                    query_id=request.request_id,
                    response=cached_response["response"],
                    query_type=request.query_type,
                    provider=request.provider,
                    model=cached_response.get("model", "unknown"),
                    processing_time=0.0,
                    conversation_id=cached_response.get("conversation_id"),
                    cached=True
                )
            
            # Rate limiting
            await self.rate_limiter.wait_if_needed()
            
            # 프롬프트 생성
            prompt = await self._create_prompt(request)
            
            # Native Messaging을 통한 LLM 호출
            response_data = await self._query_with_firefox(prompt, request)
            
            # 응답 처리
            processed_response = await self._process_response(response_data, request)
            
            # 통계 업데이트
            processing_time = (datetime.now(timezone.utc) - start_time).total_seconds()
            await self._update_stats(request.provider, success=True, time=processing_time)
            
            # 캐시 저장
            cache_data = {
                "response": processed_response,
                "model": request.model or self.default_models[request.provider],
                "conversation_id": response_data.get("conversation_id")
            }
            
            if self._using_shared_cache and request.cache_enabled:
                cache_key = self._generate_cache_key(request)
                await self.cache.set(cache_key, cache_data, ttl=3600)
            else:
                await self.cache.set(request, cache_data)
            
            # 응답 생성
            response = LLMResponse(
                query_id=request.request_id,
                response=processed_response,
                query_type=request.query_type,
                provider=request.provider,
                model=request.model or self.default_models[request.provider],
                processing_time=processing_time,
                conversation_id=response_data.get("conversation_id"),
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
    
    async def _query_with_firefox(self, prompt: Dict[str, Any], request: LLMQueryRequest) -> Dict[str, Any]:
        """Firefox를 통한 LLM 질의"""
        
        # Native Messaging으로 전달
        from ..data_collection import native_command_manager
        
        # 전체 프롬프트 구성
        full_prompt = prompt["user_prompt"]
        if prompt.get("system_prompt"):
            full_prompt = f"System: {prompt['system_prompt']}\n\nUser: {full_prompt}"
        
        command_id = await native_command_manager.send_command(
            "execute_llm_query",
            {
                "platform": request.provider.value,
                "query": full_prompt,
                "model": request.model or self.default_models[request.provider],
                "temperature": prompt.get("temperature", 0.3),
                "max_tokens": prompt.get("max_tokens", 2000),
                "mark_as_llm": True
            }
        )
        
        # 응답 대기 (LLM은 시간이 걸림)
        response = await native_command_manager.wait_for_response(command_id, timeout=DEFAULT_TIMEOUT)
        
        if not response.get("success", False):
            raise Exception(response.get("error", "LLM query failed"))
        
        return {
            "content": response.get("response", ""),
            "model": request.model or self.default_models[request.provider],
            "conversation_id": response.get("conversation_id")
        }
    
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
        if HAS_SHARED_SERVICES and metrics:
            # Shared metrics 사용
            await metrics.increment(f"llm_query.{provider.value}.total")
            if success:
                await metrics.increment(f"llm_query.{provider.value}.success")
                await metrics.observe(f"llm_query.{provider.value}.response_time", time)
            else:
                await metrics.increment(f"llm_query.{provider.value}.errors")
        else:
            # Legacy 통계
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
            "success": response.error is None,
            "conversation_id": response.conversation_id
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
            "conversation_id": response.conversation_id
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
        
        if HAS_SHARED_SERVICES and metrics:
            # Shared metrics에서 가져오기
            stats = {}
            for provider in LLMProvider:
                provider_name = provider.value
                stats[provider_name] = {
                    "total_queries": await metrics.get(f"llm_query.{provider_name}.total") or 0,
                    "successful_queries": await metrics.get(f"llm_query.{provider_name}.success") or 0,
                    "error_count": await metrics.get(f"llm_query.{provider_name}.errors") or 0,
                    "average_response_time": await metrics.get_average(f"llm_query.{provider_name}.response_time") or 0
                }
                total = stats[provider_name]["total_queries"]
                success = stats[provider_name]["successful_queries"]
                stats[provider_name]["success_rate"] = (success / total * 100) if total > 0 else 0
            
            return stats
        else:
            # Legacy 통계
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
        # 캐시 정리 (legacy mode일 때만)
        if not self._using_shared_cache and hasattr(self.cache, 'shutdown'):
            await self.cache.shutdown()

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
            "processing_time": response.processing_time,
            "conversation_id": response.conversation_id
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
            "processing_time": response.processing_time,
            "conversation_id": response.conversation_id
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
    logger.info("LLM Query Service (Native) initialized")
    if HAS_SHARED_SERVICES:
        logger.info("Using shared services (cache_manager, metrics)")
    else:
        logger.info("Using legacy mode (no shared services)")

@router.on_event("shutdown")
async def shutdown():
    """서비스 종료 시 정리"""
    await llm_service.shutdown()
    logger.info("LLM Query Service (Native) shutdown")

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
    if HAS_SHARED_SERVICES and cache_manager:
        # Shared cache 통계
        return await cache_manager.get_stats("llm_query")
    else:
        # Legacy cache 통계
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
            "latency": response.processing_time,
            "conversation_id": response.conversation_id
        }
    except Exception as e:
        return {
            "status": "error",
            "provider": provider.value,
            "error": str(e)
        }

# ======================== Helper Functions ========================

async def test_all_providers() -> Dict[str, Any]:
    """모든 LLM 제공자 연결 테스트"""
    
    results = {}
    
    for provider in LLMProvider:
        try:
            test_result = await test_provider_connection(provider)
            results[provider.value] = test_result
        except Exception as e:
            results[provider.value] = {
                "status": "error",
                "error": str(e)
            }
    
    return results