# backend/routers/argosa/data_collection/web_crawler_agent.py - Native Messaging 전용 버전

from typing import Dict, Any, List, Optional, TypedDict, Set, Tuple
from enum import Enum
import asyncio
from datetime import datetime, timedelta, timezone
import json
import re
from urllib.parse import urlparse, urljoin
from collections import defaultdict, deque
import logging
import aiohttp
from bs4 import BeautifulSoup
import pandas as pd
from langgraph.graph import StateGraph, END
from langgraph.checkpoint import MemorySaver
import os
import hashlib
from pathlib import Path
import aiofiles
import uuid

# Native Command Manager import
from ..data_collection import native_command_manager

logger = logging.getLogger(__name__)

# ======================== Configuration ========================

# 환경변수 기반 설정
BASE_DATA_PATH = Path(os.getenv("ARGOSA_DATA_PATH", "./data/argosa"))
CRAWLER_DATA_PATH = BASE_DATA_PATH / "web_crawler"
DOWNLOADS_PATH = CRAWLER_DATA_PATH / "downloads"
CACHE_PATH = CRAWLER_DATA_PATH / "cache"

# API 설정
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID", "")
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")

# 크롤링 설정
MAX_CONCURRENT_REQUESTS = 5
REQUEST_TIMEOUT = 30
MAX_RETRIES = 3
BACKOFF_MAX_TIME = 60
CACHE_TTL = 3600 * 24  # 24시간
MAX_CONTENT_SIZE = 10 * 1024 * 1024  # 10MB

# LLM 설정
LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://localhost:1234/v1")
DEFAULT_LLM_MODEL = "Qwen2.5-VL-7B-Instruct"

# 디렉토리 생성
CRAWLER_DATA_PATH.mkdir(parents=True, exist_ok=True)
DOWNLOADS_PATH.mkdir(parents=True, exist_ok=True)
CACHE_PATH.mkdir(parents=True, exist_ok=True)

# ===== 웹 크롤링 상태 정의 =====

class WebCrawlerWorkflowState(TypedDict):
    """웹 크롤링 워크플로우 상태"""
    
    # 검색 정보
    query: str
    context: Dict[str, Any]
    search_strategy: Dict[str, Any]
    apis_to_use: List[str]
    sites_to_focus: List[str]
    
    # 수집된 데이터
    raw_results: Dict[str, Any]
    processed_content: Dict[str, Any]
    downloaded_files: List[str]
    
    # 품질 평가
    quality_scores: Dict[str, float]
    relevance_map: Dict[str, Any]
    
    # 학습 데이터
    effectiveness_metrics: Dict[str, Any]
    improvement_suggestions: List[str]
    
    # 메타데이터
    timestamp: str
    iteration_count: int
    error_log: List[Dict[str, Any]]
    search_id: str

# ===== 웹 크롤러 에이전트 타입 =====

class WebCrawlerAgentType(str, Enum):
    """웹 크롤링 전문 에이전트"""
    SEARCH_PLANNER = "search_planner"
    CONTENT_ANALYZER = "content_analyzer"  
    QUALITY_ASSESSOR = "quality_assessor"
    LEARNING_OPTIMIZER = "learning_optimizer"

# ===== 보안 및 검증 =====

class SecurityValidator:
    """보안 검증 도구"""
    
    @staticmethod
    def is_valid_url(url: str) -> bool:
        """URL 검증"""
        try:
            result = urlparse(url)
            return all([result.scheme in ['http', 'https'], result.netloc])
        except:
            return False
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """파일명 정화"""
        # 위험한 문자 제거
        safe_name = re.sub(r'[^\w\-_\.]', '_', filename)
        # 경로 순회 방지
        safe_name = safe_name.replace('..', '_')
        # 길이 제한
        return safe_name[:255]
    
    @staticmethod
    def is_safe_content_type(content_type: str) -> bool:
        """안전한 콘텐츠 타입 확인"""
        safe_types = [
            'text/html', 'text/plain', 'application/json',
            'application/xml', 'text/xml', 'application/pdf'
        ]
        return any(content_type.startswith(t) for t in safe_types)

# ===== 캐시 관리 =====

class CrawlerCache:
    """크롤러 캐시 관리"""
    
    def __init__(self):
        self.memory_cache: Dict[str, Tuple[Any, datetime]] = {}
        self.cache_stats = defaultdict(int)
        self._lock = asyncio.Lock()
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
    
    def _generate_key(self, url: str, params: Dict = None) -> str:
        """캐시 키 생성"""
        key_data = {"url": url}
        if params:
            key_data.update(params)
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.sha256(key_str.encode()).hexdigest()
    
    async def get(self, url: str, params: Dict = None) -> Optional[Any]:
        """캐시에서 가져오기"""
        key = self._generate_key(url, params)
        
        # 메모리 캐시 확인
        async with self._lock:
            if key in self.memory_cache:
                data, cached_time = self.memory_cache[key]
                if (datetime.now(timezone.utc) - cached_time).total_seconds() < CACHE_TTL:
                    self.cache_stats['hits'] += 1
                    return data
                else:
                    del self.memory_cache[key]
        
        # 파일 캐시 확인
        cache_file = CACHE_PATH / f"{key}.json"
        if cache_file.exists():
            try:
                async with aiofiles.open(cache_file, 'r') as f:
                    cache_data = json.loads(await f.read())
                    cached_time = datetime.fromisoformat(cache_data['timestamp'])
                    
                    if (datetime.now(timezone.utc) - cached_time).total_seconds() < CACHE_TTL:
                        self.cache_stats['hits'] += 1
                        # 메모리 캐시에도 추가
                        async with self._lock:
                            self.memory_cache[key] = (cache_data['data'], cached_time)
                        return cache_data['data']
                    else:
                        cache_file.unlink()
            except:
                pass
        
        self.cache_stats['misses'] += 1
        return None
    
    async def set(self, url: str, data: Any, params: Dict = None):
        """캐시에 저장"""
        key = self._generate_key(url, params)
        now = datetime.now(timezone.utc)
        
        # 메모리 캐시 저장
        async with self._lock:
            self.memory_cache[key] = (data, now)
        
        # 파일 캐시 저장
        cache_file = CACHE_PATH / f"{key}.json"
        cache_data = {
            'url': url,
            'params': params,
            'data': data,
            'timestamp': now.isoformat()
        }
        
        try:
            async with aiofiles.open(cache_file, 'w') as f:
                await f.write(json.dumps(cache_data, ensure_ascii=False))
        except Exception as e:
            logger.error(f"Cache write error: {e}")
    
    async def _periodic_cleanup(self):
        """주기적 캐시 정리"""
        while True:
            await asyncio.sleep(3600)  # 1시간마다
            
            # 메모리 캐시 정리
            async with self._lock:
                now = datetime.now(timezone.utc)
                expired_keys = [
                    key for key, (_, cached_time) in self.memory_cache.items()
                    if (now - cached_time).total_seconds() > CACHE_TTL
                ]
                for key in expired_keys:
                    del self.memory_cache[key]
            
            # 파일 캐시 정리
            for cache_file in CACHE_PATH.glob("*.json"):
                try:
                    async with aiofiles.open(cache_file, 'r') as f:
                        cache_data = json.loads(await f.read())
                        cached_time = datetime.fromisoformat(cache_data['timestamp'])
                        
                        if (now - cached_time).total_seconds() > CACHE_TTL:
                            cache_file.unlink()
                except:
                    pass
    
    async def shutdown(self):
        """정리"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

# ===== API 클라이언트들 (Native Messaging 통합) =====

class BaseAPIClient:
    """기본 API 클라이언트"""
    
    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key
        self.base_url = base_url
        self.request_count = 0
        self.error_count = 0
    
    async def search(self, query: str, **kwargs) -> Dict[str, Any]:
        """기본 검색 메서드 - 서브클래스에서 구현"""
        raise NotImplementedError

class GoogleSearchAPI(BaseAPIClient):
    """Google Custom Search API - Native를 통해 실행"""
    
    def __init__(self):
        super().__init__(GOOGLE_API_KEY, "https://www.googleapis.com/customsearch/v1")
        self.cse_id = GOOGLE_CSE_ID
        self.daily_limit = 100
        self.used_today = 0
    
    async def search(self, query: str, num_results: int = 10, **kwargs) -> Dict[str, Any]:
        """Google 검색 실행 - Native 경유"""
        
        if not self.api_key or not self.cse_id:
            return {
                "status": "error",
                "error": "Google API not configured",
                "results": []
            }
        
        # 일일 한도 체크
        if self.used_today >= self.daily_limit:
            return {
                "status": "quota_exceeded",
                "error": "Daily quota exceeded",
                "results": []
            }
        
        try:
            # Native로 검색 요청
            command_id = await native_command_manager.send_command(
                "search_google",
                {
                    "query": query,
                    "api_key": self.api_key,
                    "cse_id": self.cse_id,
                    "num_results": min(num_results, 10),
                    **kwargs
                }
            )
            
            result = await native_command_manager.wait_for_response(command_id, timeout=30)
            
            if result.get("status") == "success":
                self.used_today += 1
                return result
            else:
                return {
                    "status": "error",
                    "error": result.get("error", "Search failed"),
                    "results": []
                }
                
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "query": query,
                "results": []
            }

class NewsAPI(BaseAPIClient):
    """News API 클라이언트 - Native 통합"""
    
    def __init__(self):
        super().__init__(NEWS_API_KEY, "https://newsapi.org/v2")
    
    async def search(self, query: str, from_date: str = None, 
                    sort_by: str = "relevancy", page_size: int = 20) -> Dict[str, Any]:
        """뉴스 검색 - Native 경유"""
        
        if not self.api_key:
            return {
                "status": "error",
                "error": "News API not configured",
                "results": []
            }
        
        # 날짜 기본값 (1주일 전)
        if not from_date:
            from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        
        try:
            command_id = await native_command_manager.send_command(
                "search_news",
                {
                    "query": query,
                    "api_key": self.api_key,
                    "from_date": from_date,
                    "sort_by": sort_by,
                    "page_size": page_size,
                    "language": "en"
                }
            )
            
            result = await native_command_manager.wait_for_response(command_id, timeout=30)
            return result
                
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "results": []
            }

# ===== 웹 크롤링 엔진 (Native Messaging 전용) =====

class WebCrawlerEngine:
    """Native Messaging을 통한 웹 크롤링 엔진"""
    
    def __init__(self):
        self.cache = CrawlerCache()
        self.api_clients = {
            "google": GoogleSearchAPI(),
            "newsapi": NewsAPI(),
        }
        self.llm_model = DEFAULT_LLM_MODEL
        self.lm_studio_url = LM_STUDIO_URL
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def initialize(self):
        """엔진 초기화"""
        # LLM 세션 생성
        if not self._session:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            )
    
    async def search_web(self, query: str, sources: List[str], 
                        options: Dict[str, Any] = {}) -> Dict[str, Any]:
        """웹 검색 실행"""
        results = {}
        
        # 동시 실행을 위한 태스크
        tasks = []
        
        # API 검색
        if "apis" in sources:
            for api_name in options.get("apis", ["google", "newsapi"]):
                if api_name in self.api_clients:
                    tasks.append(self._search_with_api(api_name, query, options))
        
        # 웹사이트 크롤링
        if "websites" in sources and options.get("sites"):
            tasks.append(self._crawl_websites(query, options.get("sites", [])))
        
        # 특정 사이트 집중 검색
        if "focused" in sources and options.get("focused_sites"):
            tasks.append(self._focused_crawl(query, options.get("focused_sites", [])))
        
        # 모든 태스크 실행
        if tasks:
            task_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for result in task_results:
                if isinstance(result, Exception):
                    logger.error(f"Search task error: {result}")
                elif isinstance(result, dict):
                    results.update(result)
        
        return results
    
    async def _search_with_api(self, api_name: str, query: str, 
                              options: Dict[str, Any]) -> Dict[str, Any]:
        """API를 통한 검색"""
        
        # 캐시 확인
        cached = await self.cache.get(f"{api_name}:{query}")
        if cached:
            return {api_name: cached}
        
        # API 호출
        client = self.api_clients.get(api_name)
        if not client:
            return {api_name: {"error": "API client not found"}}
        
        try:
            result = await client.search(query, **options.get(f"{api_name}_params", {}))
            
            # LLM으로 결과 분석
            if result.get("status") == "success":
                processed = await self._process_with_llm(result, "api_result", api_name)
                result["processed"] = processed
            
            # 캐시 저장
            await self.cache.set(f"{api_name}:{query}", result)
            
            return {api_name: result}
            
        except Exception as e:
            logger.error(f"API search error ({api_name}): {e}")
            return {api_name: {"error": str(e)}}
    
    async def _crawl_websites(self, query: str, sites: List[str]) -> Dict[str, Any]:
        """웹사이트 크롤링 - Native 사용"""
        crawl_results = {}
        
        for site in sites:
            if not SecurityValidator.is_valid_url(site):
                crawl_results[site] = {"error": "Invalid URL"}
                continue
            
            try:
                # Native로 크롤링 요청
                result = await self._crawl_with_native(site, query)
                crawl_results[urlparse(site).netloc] = result
                        
            except Exception as e:
                logger.error(f"Error crawling {site}: {e}")
                crawl_results[urlparse(site).netloc] = {"error": str(e)}
        
        return {"websites": crawl_results}
    
    async def _crawl_with_native(self, url: str, query: str) -> Dict[str, Any]:
        """Native Messaging을 사용한 크롤링"""
        
        try:
            # Native로 크롤링 명령 전송
            command_id = await native_command_manager.send_command(
                "crawl_web",
                {
                    "url": url,
                    "search_query": query,
                    "wait_for_element": True,
                    "extract_mode": "smart",  # 스마트 추출 모드
                    "screenshot": True
                }
            )
            
            # 응답 대기
            result = await native_command_manager.wait_for_response(command_id, timeout=30)
            
            if result.get("error"):
                return {
                    "url": url,
                    "status": "error",
                    "error": result["error"]
                }
            
            # 콘텐츠 분석
            content = result.get("content", "")
            extracted_data = result.get("extracted_data", {})
            
            # LLM 분석
            analysis = await self._process_with_llm(
                {
                    "url": url,
                    "content": content,
                    "extracted": extracted_data,
                    "query": query,
                    "screenshot": result.get("screenshot_path")
                },
                "webpage_native",
                url
            )
            
            return {
                "url": url,
                "status": "success",
                "content": content,
                "extracted_data": extracted_data,
                "analysis": analysis,
                "screenshot": result.get("screenshot_path")
            }
            
        except Exception as e:
            logger.error(f"Native crawl error: {e}")
            return {
                "url": url,
                "status": "error",
                "error": str(e)
            }
    
    def _extract_relevant_content(self, soup: BeautifulSoup, query: str, 
                                 max_length: int = 10000) -> str:
        """관련 콘텐츠 추출"""
        
        # 검색어 토큰화
        query_tokens = set(query.lower().split())
        
        # 텍스트 추출 및 관련성 점수 계산
        relevant_texts = []
        
        # 제목
        for tag in soup.find_all(['h1', 'h2', 'h3', 'h4', 'title']):
            text = tag.get_text(strip=True)
            if text and any(token in text.lower() for token in query_tokens):
                relevant_texts.append((text, 2.0))  # 높은 가중치
        
        # 단락
        for tag in soup.find_all(['p', 'div', 'article', 'section']):
            text = tag.get_text(strip=True)
            if text and len(text) > 50:  # 너무 짧은 텍스트 제외
                # 관련성 점수 계산
                text_lower = text.lower()
                score = sum(1 for token in query_tokens if token in text_lower)
                
                if score > 0:
                    relevant_texts.append((text[:500], score))  # 텍스트 길이 제한
        
        # 점수순 정렬
        relevant_texts.sort(key=lambda x: x[1], reverse=True)
        
        # 상위 콘텐츠 결합
        result = []
        total_length = 0
        
        for text, score in relevant_texts:
            if total_length + len(text) > max_length:
                break
            result.append(text)
            total_length += len(text)
        
        return "\n\n".join(result)
    
    async def _focused_crawl(self, query: str, focused_sites: List[Dict[str, Any]]) -> Dict[str, Any]:
        """특정 사이트 집중 크롤링"""
        focused_results = {}
        
        for site_info in focused_sites:
            domain = site_info["domain"]
            valuable_paths = site_info.get("valuable_paths", ["/"])
            
            site_results = {}
            
            for path in valuable_paths[:5]:  # 최대 5개 경로
                url = urljoin(f"https://{domain}", path)
                
                # 캐시 확인
                cached = await self.cache.get(url)
                if cached:
                    site_results[path] = cached
                    continue
                
                # Native 크롤링
                result = await self._crawl_with_native(url, query)
                
                # 캐시 저장
                if result.get("status") == "success":
                    await self.cache.set(url, result)
                
                site_results[path] = result
            
            focused_results[domain] = site_results
        
        return {"focused_sites": focused_results}
    
    async def _process_with_llm(self, content: Any, content_type: str, 
                               source: str = "") -> Dict[str, Any]:
        """LLM으로 콘텐츠 처리"""
        
        prompt = self._create_analysis_prompt(content, content_type, source)
        
        if not self._session:
            await self.initialize()
        
        try:
            payload = {
                "model": self.llm_model,
                "messages": [
                    {
                        "role": "system", 
                        "content": "You are a web content analyzer. Extract valuable information and insights. Be concise and specific."
                    },
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 2000
            }
            
            async with self._session.post(
                f"{self.lm_studio_url}/chat/completions",
                json=payload
            ) as response:
                
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(f"LLM error: {error_text}")
                    return {"error": "LLM processing failed"}
                
                result = await response.json()
                content_str = result["choices"][0]["message"]["content"]
                
                # JSON 파싱 시도
                try:
                    if content_str.strip().startswith("{"):
                        analysis = json.loads(content_str)
                    else:
                        # JSON 블록 추출
                        json_match = re.search(r'```json\s*(.*?)\s*```', content_str, re.DOTALL)
                        if json_match:
                            analysis = json.loads(json_match.group(1))
                        else:
                            analysis = {"text_response": content_str}
                except:
                    analysis = {"text_response": content_str}
                
                return {
                    "source": source,
                    "content_type": content_type,
                    "analysis": analysis,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                
        except Exception as e:
            logger.error(f"LLM processing error: {e}")
            return {
                "source": source,
                "content_type": content_type,
                "error": str(e),
                "raw_content": str(content)[:1000] if content else ""
            }
    
    def _create_analysis_prompt(self, content: Any, content_type: str, source: str) -> str:
        """분석 프롬프트 생성"""
        
        if content_type == "api_result":
            results_summary = json.dumps(content, indent=2)[:5000]
            return f"""Analyze these search results from {source}:

{results_summary}

Extract and return as JSON:
{{
    "key_findings": ["list of main findings"],
    "relevant_urls": ["list of most relevant URLs"],
    "source_quality": "assessment of source credibility",
    "data_freshness": "how recent is the information",
    "insights": ["key insights from the results"],
    "limitations": ["any limitations or biases"]
}}"""
        
        elif content_type == "webpage_native":
            return f"""Analyze this webpage content crawled via Native:

URL: {content.get('url', 'Unknown')}
Query: {content.get('query', '')}
Has Screenshot: {bool(content.get('screenshot'))}
Content Extract:
{content.get('content', '')[:3000]}

Extracted Data:
{json.dumps(content.get('extracted', {}), indent=2)[:1000]}

Extract and return as JSON:
{{
    "main_topic": "primary topic of the page",
    "key_points": ["main points related to the query"],
    "data_points": ["specific data or facts"],
    "quality_score": 0.0-1.0,
    "relevance_score": 0.0-1.0,
    "visual_elements": ["if screenshot available, note important visual elements"],
    "recommended_actions": ["next steps or related pages to explore"]
}}"""
        
        elif content_type == "focused_content":
            return f"""Analyze this focused crawl content:

Domain: {source}
URL: {content.get('url', '')}
Priority: {content.get('site_priority', 0)}
Query: {content.get('query', '')}
Content:
{content.get('content', '')[:4000]}

Extract and return as JSON:
{{
    "domain_expertise": "what this domain specializes in",
    "query_relevance": ["how content relates to query"],
    "unique_insights": ["insights not found elsewhere"],
    "data_quality": "assessment of data quality",
    "follow_up_paths": ["other valuable paths on this domain"],
    "extraction_success": true/false
}}"""
        
        else:
            return f"""Analyze this content:

Type: {content_type}
Source: {source}
Content: {str(content)[:3000]}

Extract key information and return as structured JSON."""
    
    async def download_file(self, url: str, filename: str = None) -> Optional[str]:
        """파일 다운로드 - Native 사용"""
        
        if not SecurityValidator.is_valid_url(url):
            logger.error(f"Invalid URL for download: {url}")
            return None
        
        if not filename:
            filename = SecurityValidator.sanitize_filename(
                url.split('/')[-1] or f"download_{datetime.now().timestamp()}"
            )
        
        try:
            command_id = await native_command_manager.send_command(
                "download_file",
                {
                    "url": url,
                    "filename": filename,
                    "save_path": str(DOWNLOADS_PATH)
                }
            )
            
            result = await native_command_manager.wait_for_response(command_id, timeout=60)
            
            if result.get("status") == "success":
                file_path = result.get("file_path")
                logger.info(f"Downloaded file: {file_path}")
                return file_path
            else:
                logger.error(f"Download failed: {result.get('error')}")
                return None
                
        except Exception as e:
            logger.error(f"Download error: {e}")
            return None
    
    async def cleanup(self):
        """리소스 정리"""
        # 캐시 정리
        await self.cache.shutdown()
        
        # LLM 세션 정리
        if self._session:
            await self._session.close()
            self._session = None

# ===== 메인 시스템 클래스 (Native 통합) =====

class APIQuotaManager:
    """API 한도를 최대한 활용하는 관리자"""
    
    def __init__(self):
        self.quotas = {
            "google": {"daily_limit": 100, "used": 0, "reset_time": None},
            "newsapi": {"daily_limit": 500, "used": 0, "reset_time": None},
        }
        self.usage_history = defaultdict(lambda: deque(maxlen=100))
        self._lock = asyncio.Lock()
        self._load_usage()
    
    def _load_usage(self):
        """사용량 로드"""
        usage_file = CRAWLER_DATA_PATH / "api_usage.json"
        if usage_file.exists():
            try:
                with open(usage_file, 'r') as f:
                    data = json.load(f)
                    for api, usage in data.items():
                        if api in self.quotas:
                            self.quotas[api].update(usage)
            except Exception as e:
                logger.error(f"Failed to load API usage: {e}")
    
    async def _save_usage(self):
        """사용량 저장"""
        usage_file = CRAWLER_DATA_PATH / "api_usage.json"
        try:
            async with aiofiles.open(usage_file, 'w') as f:
                await f.write(json.dumps(self.quotas, indent=2))
        except Exception as e:
            logger.error(f"Failed to save API usage: {e}")
    
    async def should_use_api(self, api_name: str) -> bool:
        """API 사용 가능 여부"""
        async with self._lock:
            quota = self.quotas.get(api_name, {})
            
            # 리셋 시간 체크
            if quota.get("reset_time"):
                reset_time = datetime.fromisoformat(quota["reset_time"])
                if datetime.now(timezone.utc) > reset_time:
                    quota["used"] = 0
                    quota["reset_time"] = None
            
            # 한도 체크
            limit = quota.get("daily_limit") or quota.get("monthly_limit", 0)
            return quota.get("used", 0) < limit
    
    async def update_usage(self, api_name: str, usefulness_score: float = 0.5):
        """API 사용량 업데이트"""
        async with self._lock:
            if api_name in self.quotas:
                self.quotas[api_name]["used"] += 1
                
                # 히스토리 기록
                self.usage_history[api_name].append({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "usefulness_score": usefulness_score
                })
                
                await self._save_usage()
    
    async def get_optimal_search_strategy(self, query: str) -> List[str]:
        """최적의 검색 전략 결정"""
        available_apis = []
        
        # 사용 가능한 API 확인
        for api_name in self.quotas.keys():
            if await self.should_use_api(api_name):
                # 평균 유용성 점수 계산
                history = list(self.usage_history[api_name])
                if history:
                    avg_score = sum(h["usefulness_score"] for h in history) / len(history)
                else:
                    avg_score = 0.5  # 기본값
                
                available_apis.append((api_name, avg_score))
        
        # 점수순 정렬
        available_apis.sort(key=lambda x: x[1], reverse=True)
        
        return [api[0] for api in available_apis]

class SiteAccessibilityTracker:
    """사이트별 접근성 추적"""
    
    def __init__(self):
        self.site_stats = defaultdict(lambda: {
            "success_rate": 1.0,
            "avg_relevance_score": 0.0,
            "total_visits": 0,
            "requires_login": False,
            "requires_javascript": False,
            "valuable_paths": [],
            "last_updated": datetime.now(timezone.utc)
        })
        self._lock = asyncio.Lock()
        self._load_stats()
    
    def _load_stats(self):
        """통계 로드"""
        stats_file = CRAWLER_DATA_PATH / "site_stats.json"
        if stats_file.exists():
            try:
                with open(stats_file, 'r') as f:
                    data = json.load(f)
                    for domain, stats in data.items():
                        self.site_stats[domain].update(stats)
            except Exception as e:
                logger.error(f"Failed to load site stats: {e}")
    
    async def _save_stats(self):
        """통계 저장"""
        stats_file = CRAWLER_DATA_PATH / "site_stats.json"
        
        # datetime 객체를 문자열로 변환
        save_data = {}
        for domain, stats in self.site_stats.items():
            save_data[domain] = {**stats}
            if isinstance(save_data[domain].get("last_updated"), datetime):
                save_data[domain]["last_updated"] = save_data[domain]["last_updated"].isoformat()
        
        try:
            async with aiofiles.open(stats_file, 'w') as f:
                await f.write(json.dumps(save_data, indent=2))
        except Exception as e:
            logger.error(f"Failed to save site stats: {e}")
    
    async def update_site_stats(self, url: str, result: Dict[str, Any]):
        """사이트 통계 업데이트"""
        
        domain = urlparse(url).netloc
        
        async with self._lock:
            stats = self.site_stats[domain]
            
            # 방문 횟수 증가
            stats["total_visits"] += 1
            
            # 성공률 업데이트
            if result.get("success") or result.get("status") == "success":
                new_success = 1.0
            else:
                new_success = 0.0
            
            stats["success_rate"] = (
                (stats["success_rate"] * (stats["total_visits"] - 1) + new_success) /
                stats["total_visits"]
            )
            
            # 관련성 점수 업데이트
            if result.get("relevance_score") is not None:
                old_total = stats["avg_relevance_score"] * (stats["total_visits"] - 1)
                stats["avg_relevance_score"] = (old_total + result["relevance_score"]) / stats["total_visits"]
            
            # 특별 요구사항 체크
            if result.get("error_type") == "login_required":
                stats["requires_login"] = True
            
            if result.get("requires_javascript"):
                stats["requires_javascript"] = True
            
            # 가치 있는 경로 기록
            if result.get("relevance_score", 0) > 0.7:
                path = urlparse(url).path
                if path not in stats["valuable_paths"]:
                    stats["valuable_paths"].append(path)
            
            stats["last_updated"] = datetime.now(timezone.utc)
            
            await self._save_stats()
    
    async def get_focused_search_sites(self, query: str) -> List[Dict[str, Any]]:
        """집중 검색할 사이트 선정"""
        
        focused_sites = []
        
        async with self._lock:
            for domain, stats in self.site_stats.items():
                # 선정 기준: 성공률 높고, 관련성 높고, 충분한 방문 기록
                if (stats["success_rate"] > 0.7 and 
                    stats["avg_relevance_score"] > 0.6 and
                    stats["total_visits"] >= 3):
                    
                    focused_sites.append({
                        "domain": domain,
                        "priority": stats["avg_relevance_score"] * stats["success_rate"],
                        "valuable_paths": stats["valuable_paths"][:5],
                        "requires_login": stats["requires_login"],
                        "requires_javascript": stats["requires_javascript"]
                    })
        
        # 우선순위 순으로 정렬
        focused_sites.sort(key=lambda x: x["priority"], reverse=True)
        
        return focused_sites[:10]  # 상위 10개

class SearchLearningSystem:
    """검색 학습 시스템"""
    
    def __init__(self):
        self.search_patterns = defaultdict(list)
        self.effective_queries = deque(maxlen=1000)
        self.llm_model = DEFAULT_LLM_MODEL
        self.lm_studio_url = LM_STUDIO_URL
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def initialize(self):
        """초기화"""
        if not self._session:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=60)
            )
    
    async def evaluate_search_results(self, query: str, results: Dict[str, Any],
                                    objective: str) -> Dict[str, float]:
        """검색 결과 평가"""
        
        if not self._session:
            await self.initialize()
        
        evaluation_prompt = f"""Evaluate the usefulness of these search results:

Query: {query}
Objective: {objective}
Number of Results: {sum(len(v.get('results', [])) if isinstance(v, dict) else 0 for v in results.values())}

For each source, evaluate:
1. Relevance (0-1): How relevant to the objective?
2. Completeness (0-1): Does it provide complete information?
3. Freshness (0-1): Is the information current?
4. Credibility (0-1): Is this from a credible source?
5. Actionability (0-1): Can we use this effectively?

Provide an overall score (0-1) for each source.

Return as JSON:
{{
    "source_name": overall_score,
    ...
}}"""
        
        try:
            # 결과 요약 (LLM 컨텍스트 제한 고려)
            results_summary = {}
            for source, data in results.items():
                if isinstance(data, dict):
                    results_summary[source] = {
                        "status": data.get("status", "unknown"),
                        "result_count": len(data.get("results", [])),
                        "sample": data.get("results", [])[:2] if data.get("results") else []
                    }
            
            payload = {
                "model": self.llm_model,
                "messages": [
                    {"role": "system", "content": "You are a search result evaluator."},
                    {"role": "user", "content": evaluation_prompt + f"\n\nResults Summary:\n{json.dumps(results_summary, indent=2)[:5000]}"}
                ],
                "temperature": 0.3,
                "max_tokens": 500
            }
            
            async with self._session.post(
                f"{self.lm_studio_url}/chat/completions",
                json=payload
            ) as response:
                
                if response.status != 200:
                    logger.error(f"LLM evaluation error: {response.status}")
                    # 폴백: 기본 점수
                    return {source: 0.5 for source in results.keys()}
                
                result = await response.json()
                content = result["choices"][0]["message"]["content"]
                
                # JSON 파싱
                try:
                    if "```json" in content:
                        json_match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
                        if json_match:
                            scores = json.loads(json_match.group(1))
                        else:
                            scores = json.loads(content)
                    else:
                        scores = json.loads(content)
                    
                    # 점수 검증
                    validated_scores = {}
                    for source, score in scores.items():
                        if isinstance(score, (int, float)) and 0 <= score <= 1:
                            validated_scores[source] = float(score)
                        else:
                            validated_scores[source] = 0.5
                    
                    return validated_scores
                    
                except json.JSONDecodeError:
                    logger.error("Failed to parse evaluation scores")
                    return {source: 0.5 for source in results.keys()}
                    
        except Exception as e:
            logger.error(f"Evaluation error: {e}")
            return {source: 0.5 for source in results.keys()}
    
    async def suggest_improved_query(self, original_query: str, 
                                   results_evaluation: Dict[str, float]) -> str:
        """개선된 검색 쿼리 제안"""
        
        # 평균 점수가 낮으면 개선 제안
        avg_score = sum(results_evaluation.values()) / len(results_evaluation) if results_evaluation else 0
        
        if avg_score >= 0.7:
            return original_query  # 결과가 충분히 좋음
        
        if not self._session:
            await self.initialize()
        
        improvement_prompt = f"""The search query "{original_query}" returned poor results.

Average relevance score: {avg_score:.2f}
Individual scores: {json.dumps(results_evaluation, indent=2)}

Suggest a better search query that might yield more relevant results.
Consider:
1. More specific keywords
2. Technical terminology
3. Adding context or constraints
4. Alternative phrasings

Return only the improved query string, nothing else."""
        
        try:
            payload = {
                "model": self.llm_model,
                "messages": [
                    {"role": "system", "content": "You are a search query optimizer."},
                    {"role": "user", "content": improvement_prompt}
                ],
                "temperature": 0.5,
                "max_tokens": 100
            }
            
            async with self._session.post(
                f"{self.lm_studio_url}/chat/completions",
                json=payload
            ) as response:
                
                if response.status == 200:
                    result = await response.json()
                    improved_query = result["choices"][0]["message"]["content"].strip()
                    
                    # 기록
                    self.search_patterns[original_query].append({
                        "improved": improved_query,
                        "reason": "low_score",
                        "original_score": avg_score
                    })
                    
                    return improved_query
                    
        except Exception as e:
            logger.error(f"Query improvement error: {e}")
        
        return original_query
    
    async def cleanup(self):
        """정리"""
        if self._session:
            await self._session.close()
            self._session = None

# ===== 웹 크롤러 에이전트 시스템 =====

class WebCrawlerAgentSystem:
    """웹 크롤링 에이전트 시스템"""
    
    def __init__(self):
        self.crawler_engine = WebCrawlerEngine()
        self.quota_manager = APIQuotaManager()
        self.site_tracker = SiteAccessibilityTracker()
        self.learning_system = SearchLearningSystem()
        self.agents = {}
        self.workflow = None
        self.active_searches: Dict[str, WebCrawlerWorkflowState] = {}
        
        # AI 모델 설정
        self.llm_model = DEFAULT_LLM_MODEL
        self.lm_studio_url = LM_STUDIO_URL
        self._session: Optional[aiohttp.ClientSession] = None
        
        self._initialize_agents()
        self._create_workflow()
    
    async def initialize(self):
        """시스템 초기화"""
        await self.crawler_engine.initialize()
        await self.learning_system.initialize()
        
        if not self._session:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=60)
            )
    
    def _initialize_agents(self):
        """에이전트 초기화"""
        
        self.agents[WebCrawlerAgentType.SEARCH_PLANNER] = {
            "name": "Search Strategy Planner",
            "role": "Plan optimal search strategy based on available resources",
            "temperature": 0.5
        }
        
        self.agents[WebCrawlerAgentType.CONTENT_ANALYZER] = {
            "name": "Content Analysis Expert",
            "role": "Analyze and extract value from collected content",
            "temperature": 0.3
        }
        
        self.agents[WebCrawlerAgentType.QUALITY_ASSESSOR] = {
            "name": "Quality Assessment Expert",
            "role": "Assess quality and completeness of collected data",
            "temperature": 0.3
        }
        
        self.agents[WebCrawlerAgentType.LEARNING_OPTIMIZER] = {
            "name": "Learning and Optimization Expert",
            "role": "Learn from results and optimize future searches",
            "temperature": 0.4
        }
    
    def _create_workflow(self):
        """크롤링 워크플로우 생성"""
        workflow = StateGraph(WebCrawlerWorkflowState)
        
        # 노드 정의
        workflow.add_node("plan", self._plan_node)
        workflow.add_node("execute", self._execute_node)
        workflow.add_node("analyze", self._analyze_node)
        workflow.add_node("assess", self._assess_node)
        workflow.add_node("optimize", self._optimize_node)
        
        # 엣지 정의
        workflow.add_edge("plan", "execute")
        workflow.add_edge("execute", "analyze")
        workflow.add_edge("analyze", "assess")
        
        # 조건부 엣지
        def quality_check(state):
            avg_quality = sum(state.get("quality_scores", {}).values()) / max(len(state.get("quality_scores", {})), 1)
            
            # 최대 반복 횟수 체크
            if state.get("iteration_count", 0) >= 3:
                return "optimize"
            
            # 품질이 낮으면 다시 계획
            if avg_quality < 0.6:
                return "plan"
            
            return "optimize"
        
        workflow.add_conditional_edges(
            "assess",
            quality_check,
            {
                "plan": "plan",
                "optimize": "optimize"
            }
        )
        
        workflow.add_edge("optimize", END)
        workflow.set_entry_point("plan")
        
        # 메모리 체크포인트
        memory = MemorySaver()
        self.workflow = workflow.compile(checkpointer=memory)
    
    async def _plan_node(self, state: WebCrawlerWorkflowState) -> WebCrawlerWorkflowState:
        """검색 계획 수립"""
        logger.info(f"[WebCrawler] Planning search strategy for: {state['query']}")
        
        # 최적 API 전략
        optimal_apis = await self.quota_manager.get_optimal_search_strategy(state["query"])
        
        # 집중 검색 사이트
        focused_sites = await self.site_tracker.get_focused_search_sites(state["query"])
        
        # SEARCH_PLANNER 에이전트로 전략 수립
        planning_prompt = f"""Plan a search strategy for the query: "{state['query']}"

Context: {json.dumps(state.get('context', {}), indent=2)}
Available APIs: {optimal_apis}
Focused sites with high relevance: {len(focused_sites)} sites
Previous iterations: {state.get('iteration_count', 0)}

Create a search plan including:
1. Which APIs to use and in what order
2. Which specific websites to crawl
3. Search query variations to try
4. Expected content types
5. Priority of sources

Return as JSON:
{{
    "apis": ["api1", "api2", ...],
    "websites": ["url1", "url2", ...],
    "query_variations": ["variation1", "variation2", ...],
    "expected_content": ["type1", "type2", ...],
    "source_priorities": {{"source": priority_score}},
    "search_depth": "shallow|medium|deep"
}}"""
        
        planning_result = await self._execute_agent(
            WebCrawlerAgentType.SEARCH_PLANNER,
            planning_prompt
        )
        
        # 결과 파싱
        if isinstance(planning_result, dict) and "apis" in planning_result:
            state["search_strategy"] = planning_result
            state["apis_to_use"] = planning_result.get("apis", optimal_apis)
            state["sites_to_focus"] = [s["domain"] for s in focused_sites[:5]]
        else:
            # 폴백
            state["search_strategy"] = {
                "apis": optimal_apis,
                "websites": [],
                "query_variations": [state["query"]],
                "search_depth": "medium"
            }
            state["apis_to_use"] = optimal_apis
            state["sites_to_focus"] = [s["domain"] for s in focused_sites[:3]]
        
        state["iteration_count"] = state.get("iteration_count", 0) + 1
        
        return state
    
    async def _execute_node(self, state: WebCrawlerWorkflowState) -> WebCrawlerWorkflowState:
        """실제 크롤링 실행"""
        logger.info(f"[WebCrawler] Executing search for: {state['query']}")
        
        # 검색 소스 준비
        sources = []
        if state.get("apis_to_use"):
            sources.append("apis")
        if state.get("sites_to_focus"):
            sources.append("focused")
        
        # 크롤링 옵션
        options = {
            "apis": state.get("apis_to_use", []),
            "focused_sites": [{"domain": s} for s in state.get("sites_to_focus", [])]
        }
        
        # 쿼리 변형 처리
        all_results = {}
        query_variations = state.get("search_strategy", {}).get("query_variations", [state["query"]])
        
        for query_var in query_variations[:3]:  # 최대 3개 변형
            try:
                results = await self.crawler_engine.search_web(
                    query=query_var,
                    sources=sources,
                    options=options
                )
                
                # 결과 병합
                for key, value in results.items():
                    if key not in all_results:
                        all_results[key] = value
                    elif isinstance(value, dict) and isinstance(all_results[key], dict):
                        # 딕셔너리 병합
                        all_results[key].update(value)
                    elif isinstance(value, list) and isinstance(all_results[key], list):
                        # 리스트 병합
                        all_results[key].extend(value)
                        
            except Exception as e:
                logger.error(f"Search execution error for '{query_var}': {e}")
                state["error_log"].append({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "error": str(e),
                    "query": query_var
                })
        
        state["raw_results"] = all_results
        
        # 사이트 통계 업데이트
        for source, data in all_results.items():
            if isinstance(data, dict) and "url" in data:
                await self.site_tracker.update_site_stats(
                    data["url"],
                    {"success": "error" not in data, "relevance_score": 0.5}
                )
        
        # API 사용량 업데이트
        for api in state.get("apis_to_use", []):
            await self.quota_manager.update_usage(api, 0.5)  # 초기 점수
        
        return state
    
    async def _analyze_node(self, state: WebCrawlerWorkflowState) -> WebCrawlerWorkflowState:
        """콘텐츠 분석"""
        logger.info("[WebCrawler] Analyzing collected content")
        
        # CONTENT_ANALYZER로 분석
        analysis_prompt = f"""Analyze the collected search results for the query: "{state['query']}"

Objective: {state.get('context', {}).get('objective', 'General information gathering')}
Number of sources: {len(state.get('raw_results', {}))}

Focus on:
1. Extracting key information relevant to the objective
2. Identifying patterns across sources
3. Finding unique insights
4. Assessing information quality
5. Detecting any contradictions or inconsistencies

Provide a structured analysis with:
- Main findings
- Cross-source patterns
- Information gaps
- Quality assessment
- Recommended next steps"""
        
        # 결과 요약 (LLM 컨텍스트 제한)
        results_summary = self._summarize_results(state["raw_results"])
        
        analysis = await self._execute_agent(
            WebCrawlerAgentType.CONTENT_ANALYZER,
            analysis_prompt + f"\n\nResults Summary:\n{results_summary}"
        )
        
        state["processed_content"] = analysis
        
        return state
    
    async def _assess_node(self, state: WebCrawlerWorkflowState) -> WebCrawlerWorkflowState:
        """품질 평가"""
        logger.info("[WebCrawler] Assessing content quality")
        
        # 검색 결과 유용성 평가
        quality_scores = await self.learning_system.evaluate_search_results(
            state["query"],
            state["raw_results"],
            state.get("context", {}).get("objective", "")
        )
        
        state["quality_scores"] = quality_scores
        
        # QUALITY_ASSESSOR로 추가 평가
        assessment_prompt = f"""Assess the quality of collected data for: "{state['query']}"

Quality scores by source: {json.dumps(quality_scores, indent=2)}
Objective: {state.get('context', {}).get('objective', '')}

Evaluate:
1. Completeness (0-1): Is the information complete?
2. Accuracy indicators: Signs of reliable information
3. Relevance (0-1): How well does it match the objective?
4. Timeliness: Is the information current?
5. Overall quality (0-1): Combined assessment

Provide specific feedback for improvement if quality is low."""
        
        assessment = await self._execute_agent(
            WebCrawlerAgentType.QUALITY_ASSESSOR,
            assessment_prompt
        )
        
        state["quality_assessment"] = assessment
        
        # API 사용량 업데이트 (실제 유용성 점수로)
        for api, score in quality_scores.items():
            if api in state.get("apis_to_use", []):
                await self.quota_manager.update_usage(api, score)
        
        return state
    
    async def _optimize_node(self, state: WebCrawlerWorkflowState) -> WebCrawlerWorkflowState:
        """학습 및 최적화"""
        logger.info("[WebCrawler] Optimizing search strategy")
        
        # LEARNING_OPTIMIZER로 학습
        optimization_prompt = f"""Based on the search results and quality assessment for: "{state['query']}"

Iterations completed: {state.get('iteration_count', 1)}
Average quality score: {sum(state['quality_scores'].values()) / len(state['quality_scores']) if state['quality_scores'] else 0:.2f}

Provide:
1. What worked well in this search
2. What didn't work and why
3. Specific improvements for similar future searches
4. Patterns discovered
5. Recommended strategy updates"""
        
        optimization = await self._execute_agent(
            WebCrawlerAgentType.LEARNING_OPTIMIZER,
            optimization_prompt
        )
        
        if isinstance(optimization, dict):
            state["improvement_suggestions"] = optimization.get("improvements", [])
        else:
            state["improvement_suggestions"] = [str(optimization)]
        
        # 개선된 쿼리 제안
        avg_quality = sum(state["quality_scores"].values()) / max(len(state["quality_scores"]), 1)
        if avg_quality < 0.6:
            improved_query = await self.learning_system.suggest_improved_query(
                state["query"],
                state["quality_scores"]
            )
            state["improved_query"] = improved_query
        
        return state
    
    async def _execute_agent(self, agent_type: WebCrawlerAgentType, prompt: str) -> Dict[str, Any]:
        """에이전트 실행"""
        
        agent = self.agents.get(agent_type)
        if not agent:
            raise ValueError(f"Agent {agent_type} not found")
        
        if not self._session:
            await self.initialize()
        
        try:
            payload = {
                "model": self.llm_model,
                "messages": [
                    {
                        "role": "system",
                        "content": f"You are {agent['name']}. {agent['role']}"
                    },
                    {"role": "user", "content": prompt}
                ],
                "temperature": agent.get("temperature", 0.3),
                "max_tokens": 2000
            }
            
            async with self._session.post(
                f"{self.lm_studio_url}/chat/completions",
                json=payload
            ) as response:
                
                if response.status != 200:
                    logger.error(f"Agent {agent_type} LLM error: {response.status}")
                    return {"error": "LLM request failed"}
                
                result = await response.json()
                content = result["choices"][0]["message"]["content"]
                
                # JSON 파싱 시도
                try:
                    if "```json" in content:
                        json_match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
                        if json_match:
                            return json.loads(json_match.group(1))
                    
                    # 직접 JSON 파싱
                    content = content.strip()
                    if content.startswith("{"):
                        return json.loads(content)
                    
                    return {"response": content}
                    
                except json.JSONDecodeError:
                    return {"response": content}
                    
        except Exception as e:
            logger.error(f"Agent {agent_type} execution failed: {e}")
            return {"error": str(e)}
    
    def _summarize_results(self, results: Dict[str, Any], max_length: int = 5000) -> str:
        """결과 요약 (LLM 입력용)"""
        summary_parts = []
        current_length = 0
        
        for source, data in results.items():
            if current_length >= max_length:
                break
            
            if isinstance(data, dict):
                # 주요 필드만 추출
                summary = {
                    "source": source,
                    "status": data.get("status", "unknown"),
                    "error": data.get("error"),
                    "result_count": len(data.get("results", [])) if "results" in data else None,
                    "key_findings": data.get("analysis", {}).get("key_findings", [])[:3] if "analysis" in data else None
                }
                
                summary_str = json.dumps(summary, indent=2)
                if current_length + len(summary_str) < max_length:
                    summary_parts.append(summary_str)
                    current_length += len(summary_str)
        
        return "\n\n".join(summary_parts)
    
    async def execute_search(self, query: str, context: Dict[str, Any] = {}) -> Dict[str, Any]:
        """외부에서 호출하는 검색 실행"""
        
        search_id = f"search_{uuid.uuid4()}"
        logger.info(f"Starting search {search_id}: {query}")
        
        initial_state = WebCrawlerWorkflowState(
            query=query,
            context=context,
            search_strategy={},
            apis_to_use=[],
            sites_to_focus=[],
            raw_results={},
            processed_content={},
            downloaded_files=[],
            quality_scores={},
            relevance_map={},
            effectiveness_metrics={},
            improvement_suggestions=[],
            timestamp=datetime.now(timezone.utc).isoformat(),
            iteration_count=0,
            error_log=[],
            search_id=search_id
        )
        
        # 워크플로우 설정
        config = {"configurable": {"thread_id": search_id}}
        
        try:
            # 시스템 초기화
            await self.initialize()
            
            # 워크플로우 실행
            final_state = None
            async for state in self.workflow.astream(initial_state, config):
                final_state = state
                self.active_searches[search_id] = state
            
            # 결과 정리
            quality_score = 0.0
            if final_state and final_state.get("quality_scores"):
                quality_score = sum(final_state["quality_scores"].values()) / len(final_state["quality_scores"])
            
            result = {
                "search_id": search_id,
                "query": query,
                "results": final_state.get("processed_content", {}) if final_state else {},
                "quality_score": quality_score,
                "improved_query": final_state.get("improved_query") if final_state else None,
                "metadata": {
                    "iterations": final_state.get("iteration_count", 0) if final_state else 0,
                    "apis_used": final_state.get("apis_to_use", []) if final_state else [],
                    "sites_crawled": final_state.get("sites_to_focus", []) if final_state else [],
                    "timestamp": final_state.get("timestamp") if final_state else datetime.now(timezone.utc).isoformat(),
                    "errors": len(final_state.get("error_log", [])) if final_state else 0
                }
            }
            
            logger.info(f"Search {search_id} completed with quality score: {quality_score:.2f}")
            return result
            
        except Exception as e:
            logger.error(f"Search execution error: {e}", exc_info=True)
            return {
                "search_id": search_id,
                "query": query,
                "error": str(e),
                "results": {},
                "quality_score": 0.0
            }
        finally:
            # 정리
            if search_id in self.active_searches:
                del self.active_searches[search_id]
    
    async def get_quota_status(self) -> Dict[str, Any]:
        """API 할당량 상태"""
        status = {}
        
        for api_name, quota in self.quota_manager.quotas.items():
            limit = quota.get("daily_limit") or quota.get("monthly_limit", 0)
            used = quota.get("used", 0)
            
            status[api_name] = {
                "used": used,
                "limit": limit,
                "remaining": max(0, limit - used),
                "percentage_used": (used / limit * 100) if limit > 0 else 0
            }
        
        return status
    
    async def train(self, training_data: Dict[str, Any]) -> Dict[str, Any]:
        """시스템 학습"""
        
        # 사이트 통계 업데이트
        if "site_feedback" in training_data:
            for site, feedback in training_data["site_feedback"].items():
                await self.site_tracker.update_site_stats(site, feedback)
        
        # 검색 패턴 학습
        if "search_patterns" in training_data:
            for pattern in training_data["search_patterns"]:
                query = pattern.get("query", "")
                self.learning_system.search_patterns[query].append(pattern)
        
        return {
            "status": "trained",
            "message": "System updated with new training data",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    
    async def cleanup(self):
        """시스템 정리"""
        await self.crawler_engine.cleanup()
        await self.learning_system.cleanup()
        
        if self._session:
            await self._session.close()
            self._session = None

# ===== API 엔드포인트 =====

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

crawler_router = APIRouter(prefix="/api/crawler", tags=["web_crawler"])

# 전역 인스턴스
web_crawler_system = WebCrawlerAgentSystem()

# 요청/응답 모델
class WebSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    context: Optional[Dict[str, Any]] = {}
    timeout: int = Field(default=300, ge=30, le=600)  # 5분 기본값

class WebSearchResponse(BaseModel):
    search_id: str
    query: str
    results: Dict[str, Any]
    quality_score: float
    improved_query: Optional[str] = None
    metadata: Dict[str, Any]
    error: Optional[str] = None

class TrainingDataRequest(BaseModel):
    site_feedback: Optional[Dict[str, Dict[str, Any]]] = None
    search_patterns: Optional[List[Dict[str, Any]]] = None

@crawler_router.on_event("startup")
async def startup():
    """시작 시 초기화"""
    await web_crawler_system.initialize()
    logger.info("Web crawler system initialized")

@crawler_router.on_event("shutdown")
async def shutdown():
    """종료 시 정리"""
    await web_crawler_system.cleanup()
    logger.info("Web crawler system shutdown")

@crawler_router.post("/search", response_model=WebSearchResponse)
async def web_search(request: WebSearchRequest, background_tasks: BackgroundTasks):
    """웹 검색 API"""
    
    try:
        result = await web_crawler_system.execute_search(
            request.query,
            request.context
        )
        
        return WebSearchResponse(**result)
        
    except Exception as e:
        logger.error(f"Web search error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@crawler_router.get("/quota")
async def get_api_quota():
    """API 할당량 조회"""
    return await web_crawler_system.get_quota_status()

@crawler_router.post("/train")
async def train_crawler(training_data: TrainingDataRequest):
    """크롤러 학습"""
    return await web_crawler_system.train(training_data.dict(exclude_none=True))

@crawler_router.get("/sites/stats")
async def get_site_statistics():
    """사이트별 통계 조회"""
    
    stats = {}
    for domain, data in web_crawler_system.site_tracker.site_stats.items():
        # datetime 객체 처리
        stats[domain] = {
            "success_rate": data["success_rate"],
            "avg_relevance": data["avg_relevance_score"],
            "visits": data["total_visits"],
            "requires_login": data["requires_login"],
            "requires_javascript": data["requires_javascript"],
            "valuable_paths": data["valuable_paths"][:5]  # 상위 5개만
        }
    
    return stats

@crawler_router.get("/search/{search_id}/status")
async def get_search_status(search_id: str):
    """검색 상태 조회"""
    
    if search_id in web_crawler_system.active_searches:
        state = web_crawler_system.active_searches[search_id]
        return {
            "status": "running",
            "iteration": state.get("iteration_count", 0),
            "current_phase": "processing"
        }
    else:
        return {
            "status": "completed",
            "message": "Search completed or not found"
        }

@crawler_router.delete("/cache/clear")
async def clear_cache():
    """캐시 정리"""
    
    cache_files = list(CACHE_PATH.glob("*.json"))
    deleted = 0
    
    for file in cache_files:
        try:
            file.unlink()
            deleted += 1
        except:
            pass
    
    return {
        "deleted_files": deleted,
        "message": "Cache cleared successfully"
    }