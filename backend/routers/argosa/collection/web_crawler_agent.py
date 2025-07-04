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
import sys
import hashlib
from pathlib import Path
import aiofiles
import uuid

logger = logging.getLogger(__name__)

# 프로젝트 루트를 Python 경로에 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

# 번역 서비스 import
try:
    from ..shared.translation_service import translation_service
    HAS_TRANSLATION = True
except ImportError:
    logger.warning("Translation service not available")
    translation_service = None
    HAS_TRANSLATION = False

# Native Command Manager는 초기화 시점에 WebCrawlerEngine 클래스 내부에서 처리

# ======================== Configuration ========================

# 환경변수 기반 설정
BASE_DATA_PATH = Path(os.getenv("ARGOSA_DATA_PATH", "./data/argosa"))
CRAWLER_DATA_PATH = BASE_DATA_PATH / "web_crawler"
DOWNLOADS_PATH = CRAWLER_DATA_PATH / "downloads"
CACHE_PATH = CRAWLER_DATA_PATH / "cache"

# API 설정
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID", "")
NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET", "")
BING_API_KEY = os.getenv("BING_API_KEY", "")
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "")
SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY", "")
GITHUB_API_KEY = os.getenv("GITHUB_API_KEY", "")
KAGGLE_API_KEY = os.getenv("KAGGLE_API_KEY", "")
KAGGLE_USERNAME = os.getenv("KAGGLE_USERNAME", "")

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
        try:
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
                file_cleanup_now = datetime.now(timezone.utc)  # 파일 정리용 현재 시간
                for cache_file in CACHE_PATH.glob("*.json"):
                    try:
                        async with aiofiles.open(cache_file, 'r') as f:
                            cache_data = json.loads(await f.read())
                            cached_time = datetime.fromisoformat(cache_data['timestamp'])
                            
                            if (file_cleanup_now - cached_time).total_seconds() > CACHE_TTL:
                                cache_file.unlink()
                    except:
                        pass
        except asyncio.CancelledError:
            # 정상적인 종료
            logger.info("Cache cleanup task cancelled")
            raise
    
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
        self._engine = None  # WebCrawlerEngine 참조 저장
    
    def set_engine(self, engine):
        """엔진 참조 설정"""
        self._engine = engine
    
    def update_credentials(self, api_key: str, cse_id: str):
        """API 자격 증명 업데이트"""
        self.api_key = api_key
        self.cse_id = cse_id
        logger.info("Google API credentials updated")
    
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
        
        # 언어 감지 및 번역
        target_language = kwargs.get("target_language", "en")
        translate_results = kwargs.get("translate_results", False)
        
        # 쿼리 언어 감지
        if HAS_TRANSLATION and translation_service:
            detected_lang = translation_service.detect_language(query)
            
            # 영어가 아닌 쿼리를 영어로 번역 (Google은 영어 검색이 더 효과적)
            if detected_lang != "en" and kwargs.get("translate_query", True):
                translation = await translation_service.translate(query, "en", detected_lang)
                if translation.get("translated_text"):
                    original_query = query
                    query = translation["translated_text"]
                    logger.info(f"Translated query from {detected_lang} to en: {original_query} -> {query}")
        
        try:
            # Native Command Manager 가져오기
            if not self._engine:
                raise RuntimeError("Engine not set for GoogleSearchAPI")
            
            ncm = await self._engine._get_native_command_manager()
            
            # Native로 검색 요청
            command_id = await ncm.send_command(
                "search_google",
                {
                    "query": query,
                    "api_key": self.api_key,
                    "cse_id": self.cse_id,
                    "num_results": min(num_results, 10),
                    **kwargs
                }
            )
            
            result = await ncm.wait_for_response(command_id, timeout=30)
            
            if result.get("status") == "success":
                self.used_today += 1
                
                # 결과 번역 (요청된 경우)
                if translate_results and HAS_TRANSLATION and translation_service and target_language != "en":
                    translated_results = []
                    for item in result.get("results", []):
                        # 제목과 설명 번역
                        title_trans = await translation_service.translate(
                            item.get("title", ""), target_language, "en"
                        )
                        snippet_trans = await translation_service.translate(
                            item.get("snippet", ""), target_language, "en"
                        )
                        
                        translated_item = {
                            **item,
                            "title": title_trans.get("translated_text", item.get("title")),
                            "snippet": snippet_trans.get("translated_text", item.get("snippet")),
                            "original_title": item.get("title"),
                            "original_snippet": item.get("snippet")
                        }
                        translated_results.append(translated_item)
                    
                    result["results"] = translated_results
                    result["translation_info"] = {
                        "translated": True,
                        "target_language": target_language,
                        "provider": title_trans.get("provider", "unknown")
                    }
                
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
        self._engine = None  # WebCrawlerEngine 참조 저장
    
    def set_engine(self, engine):
        """엔진 참조 설정"""
        self._engine = engine
    
    def update_credentials(self, api_key: str):
        """API 자격 증명 업데이트"""
        self.api_key = api_key
        logger.info("News API credentials updated")
    
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
            # Native Command Manager 가져오기
            if not self._engine:
                raise RuntimeError("Engine not set for NewsAPI")
            
            ncm = await self._engine._get_native_command_manager()
            
            command_id = await ncm.send_command(
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
            
            result = await ncm.wait_for_response(command_id, timeout=30)
            return result
                
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "results": []
            }

class NaverSearchAPI(BaseAPIClient):
    """Naver Search API 클라이언트"""
    
    def __init__(self):
        super().__init__("", "https://openapi.naver.com/v1/search")
        self.client_id = NAVER_CLIENT_ID
        self.client_secret = NAVER_CLIENT_SECRET
        self.daily_limit = 25000
        self.used_today = 0
        self._engine = None
    
    def set_engine(self, engine):
        """엔진 참조 설정"""
        self._engine = engine
    
    def update_credentials(self, client_id: str, client_secret: str):
        """API 자격 증명 업데이트"""
        self.client_id = client_id
        self.client_secret = client_secret
        logger.info("Naver API credentials updated")
    
    async def search(self, query: str, search_type: str = "blog", num_results: int = 10, **kwargs) -> Dict[str, Any]:
        """Naver 검색 실행"""
        
        if not self.client_id or not self.client_secret:
            return {
                "status": "error",
                "error": "Naver API not configured",
                "results": []
            }
        
        if self.used_today >= self.daily_limit:
            return {
                "status": "quota_exceeded",
                "error": "Daily quota exceeded",
                "results": []
            }
        
        try:
            if not self._engine:
                raise RuntimeError("Engine not set for NaverSearchAPI")
            
            ncm = await self._engine._get_native_command_manager()
            
            command_id = await ncm.send_command(
                "search_naver",
                {
                    "query": query,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "search_type": search_type,  # blog, news, cafearticle, kin
                    "display": min(num_results, 100),
                    **kwargs
                }
            )
            
            result = await ncm.wait_for_response(command_id, timeout=30)
            
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

class BingSearchAPI(BaseAPIClient):
    """Bing Search API 클라이언트"""
    
    def __init__(self):
        super().__init__(BING_API_KEY, "https://api.bing.microsoft.com/v7.0/search")
        self.daily_limit = 1000
        self.used_today = 0
        self._engine = None
    
    def set_engine(self, engine):
        """엔진 참조 설정"""
        self._engine = engine
    
    def update_credentials(self, api_key: str):
        """API 자격 증명 업데이트"""
        self.api_key = api_key
        logger.info("Bing API credentials updated")
    
    async def search(self, query: str, num_results: int = 10, **kwargs) -> Dict[str, Any]:
        """Bing 검색 실행"""
        
        if not self.api_key:
            return {
                "status": "error",
                "error": "Bing API not configured",
                "results": []
            }
        
        if self.used_today >= self.daily_limit:
            return {
                "status": "quota_exceeded",
                "error": "Daily quota exceeded",
                "results": []
            }
        
        try:
            if not self._engine:
                raise RuntimeError("Engine not set for BingSearchAPI")
            
            ncm = await self._engine._get_native_command_manager()
            
            command_id = await ncm.send_command(
                "search_bing",
                {
                    "query": query,
                    "api_key": self.api_key,
                    "count": min(num_results, 50),
                    "market": kwargs.get("market", "en-US"),
                    "safeSearch": kwargs.get("safeSearch", "Moderate"),
                    **kwargs
                }
            )
            
            result = await ncm.wait_for_response(command_id, timeout=30)
            
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

class SerperAPI(BaseAPIClient):
    """Serper.dev API 클라이언트"""
    
    def __init__(self):
        super().__init__(SERPER_API_KEY, "https://google.serper.dev/search")
        self.daily_limit = 2500  # Free tier
        self.used_today = 0
        self._engine = None
    
    def set_engine(self, engine):
        """엔진 참조 설정"""
        self._engine = engine
    
    def update_credentials(self, api_key: str):
        """API 자격 증명 업데이트"""
        self.api_key = api_key
        logger.info("Serper API credentials updated")
    
    async def search(self, query: str, num_results: int = 10, **kwargs) -> Dict[str, Any]:
        """Serper 검색 실행"""
        
        if not self.api_key:
            return {
                "status": "error",
                "error": "Serper API not configured",
                "results": []
            }
        
        if self.used_today >= self.daily_limit:
            return {
                "status": "quota_exceeded",
                "error": "Daily quota exceeded",
                "results": []
            }
        
        try:
            if not self._engine:
                raise RuntimeError("Engine not set for SerperAPI")
            
            ncm = await self._engine._get_native_command_manager()
            
            command_id = await ncm.send_command(
                "search_serper",
                {
                    "query": query,
                    "api_key": self.api_key,
                    "num": min(num_results, 100),
                    "gl": kwargs.get("gl", "us"),  # country
                    "hl": kwargs.get("hl", "en"),  # language
                    **kwargs
                }
            )
            
            result = await ncm.wait_for_response(command_id, timeout=30)
            
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

class SerpAPI(BaseAPIClient):
    """SerpAPI 클라이언트"""
    
    def __init__(self):
        super().__init__(SERPAPI_API_KEY, "https://serpapi.com/search")
        self.daily_limit = 100  # Free tier
        self.used_today = 0
        self._engine = None
    
    def set_engine(self, engine):
        """엔진 참조 설정"""
        self._engine = engine
    
    def update_credentials(self, api_key: str):
        """API 자격 증명 업데이트"""
        self.api_key = api_key
        logger.info("SerpAPI credentials updated")
    
    async def search(self, query: str, engine: str = "google", num_results: int = 10, **kwargs) -> Dict[str, Any]:
        """SerpAPI 검색 실행"""
        
        if not self.api_key:
            return {
                "status": "error",
                "error": "SerpAPI not configured",
                "results": []
            }
        
        if self.used_today >= self.daily_limit:
            return {
                "status": "quota_exceeded",
                "error": "Daily quota exceeded",
                "results": []
            }
        
        try:
            if not self._engine:
                raise RuntimeError("Engine not set for SerpAPI")
            
            ncm = await self._engine._get_native_command_manager()
            
            command_id = await ncm.send_command(
                "search_serpapi",
                {
                    "query": query,
                    "api_key": self.api_key,
                    "engine": engine,  # google, bing, baidu, etc.
                    "num": min(num_results, 100),
                    **kwargs
                }
            )
            
            result = await ncm.wait_for_response(command_id, timeout=30)
            
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

class GitHubSearchAPI(BaseAPIClient):
    """GitHub Search API 클라이언트"""
    
    def __init__(self):
        super().__init__(GITHUB_API_KEY, "https://api.github.com/search")
        self.daily_limit = 5000  # With auth
        self.used_today = 0
        self._engine = None
    
    def set_engine(self, engine):
        """엔진 참조 설정"""
        self._engine = engine
    
    def update_credentials(self, api_key: str):
        """API 자격 증명 업데이트"""
        self.api_key = api_key
        logger.info("GitHub API credentials updated")
    
    async def search(self, query: str, search_type: str = "repositories", num_results: int = 10, **kwargs) -> Dict[str, Any]:
        """GitHub 검색 실행"""
        
        # GitHub API는 인증 없이도 사용 가능하지만 제한적
        if self.used_today >= self.daily_limit:
            return {
                "status": "quota_exceeded",
                "error": "Daily quota exceeded",
                "results": []
            }
        
        try:
            if not self._engine:
                raise RuntimeError("Engine not set for GitHubSearchAPI")
            
            ncm = await self._engine._get_native_command_manager()
            
            command_id = await ncm.send_command(
                "search_github",
                {
                    "query": query,
                    "api_key": self.api_key,  # Optional
                    "search_type": search_type,  # repositories, code, commits, issues, users
                    "per_page": min(num_results, 100),
                    "sort": kwargs.get("sort", "best-match"),
                    **kwargs
                }
            )
            
            result = await ncm.wait_for_response(command_id, timeout=30)
            
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

class DuckDuckGoAPI(BaseAPIClient):
    """DuckDuckGo 스크래핑 클라이언트 (API 없음)"""
    
    def __init__(self):
        super().__init__("", "https://duckduckgo.com")
        self.daily_limit = -1  # 무제한 (스크래핑)
        self.used_today = 0
        self._engine = None
    
    def set_engine(self, engine):
        """엔진 참조 설정"""
        self._engine = engine
    
    def update_credentials(self):
        """자격 증명 불필요"""
        pass
    
    async def search(self, query: str, num_results: int = 10, **kwargs) -> Dict[str, Any]:
        """DuckDuckGo 스크래핑 검색"""
        
        try:
            if not self._engine:
                raise RuntimeError("Engine not set for DuckDuckGoAPI")
            
            ncm = await self._engine._get_native_command_manager()
            
            command_id = await ncm.send_command(
                "search_duckduckgo",
                {
                    "query": query,
                    "max_results": min(num_results, 50),
                    "region": kwargs.get("region", "us-en"),
                    "safesearch": kwargs.get("safesearch", "moderate"),
                    **kwargs
                }
            )
            
            result = await ncm.wait_for_response(command_id, timeout=30)
            
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
        
# ===== 웹 크롤링 엔진 (Native Messaging 전용) =====

class WebCrawlerEngine:
    """Native Messaging을 통한 웹 크롤링 엔진"""
    
    def __init__(self):
        self.cache = CrawlerCache()
        # API 클라이언트 초기화는 나중에
        self.api_clients = {}
        self.llm_model = DEFAULT_LLM_MODEL
        self.lm_studio_url = LM_STUDIO_URL
        self._session: Optional[aiohttp.ClientSession] = None
        self._native_command_manager = None  # 초기화 시 설정
    
    async def initialize(self):
        """엔진 초기화"""
        # LLM 세션 생성
        if not self._session:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            )
        
        # Native Command Manager 가져오기
        try:
            from ..data_collection import native_command_manager
            self._native_command_manager = native_command_manager
            logger.info("Native Command Manager connected")
        except ImportError:
            logger.warning("Native Command Manager not available - some features will be limited")
        
        # API 클라이언트 초기화 및 엔진 참조 설정
        google_api = GoogleSearchAPI()
        google_api.set_engine(self)
        news_api = NewsAPI()
        news_api.set_engine(self)
        
        self.api_clients = {
            "google": google_api,
            "newsapi": news_api,
        }
    
    async def _get_native_command_manager(self):
        """Native Command Manager 가져오기"""
        if not self._native_command_manager:
            raise RuntimeError("Native Command Manager not initialized. Call initialize() first.")
        return self._native_command_manager
    
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
            # 번역 옵션 추가
            api_params = options.get(f"{api_name}_params", {})
            api_params.update({
                "target_language": options.get("target_language", "ko"),
                "translate_results": options.get("translate_results", False),
                "translate_query": options.get("translate_query", True)
            })
            
            result = await client.search(query, **api_params)
            
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
    
    async def _crawl_with_native(self, url: str, query: str, **kwargs) -> Dict[str, Any]:
        """Native Messaging을 사용한 크롤링"""
        
        # 번역 옵션
        target_language = kwargs.get("target_language", "ko")
        translate_content = kwargs.get("translate_content", False)
        
        try:
            # Native Command Manager 가져오기
            ncm = await self._get_native_command_manager()
            
            # Native로 크롤링 명령 전송
            command_id = await ncm.send_command(
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
            result = await ncm.wait_for_response(command_id, timeout=30)
            
            if result.get("error"):
                return {
                    "url": url,
                    "status": "error",
                    "error": result["error"]
                }
            
            # 콘텐츠 분석
            content = result.get("content", "")
            extracted_data = result.get("extracted_data", {})
            
            # 언어 감지 및 번역
            if translate_content and HAS_TRANSLATION and translation_service and content:
                detected_lang = translation_service.detect_language(content)
                
                if detected_lang != target_language:
                    # 콘텐츠가 너무 길면 요약 부분만 번역
                    content_to_translate = content[:3000] if len(content) > 3000 else content
                    
                    translation = await translation_service.translate(
                        content_to_translate, 
                        target_language, 
                        detected_lang
                    )
                    
                    if translation.get("translated_text"):
                        # 번역된 콘텐츠 추가
                        extracted_data["translated_content"] = translation["translated_text"]
                        extracted_data["original_language"] = detected_lang
                        extracted_data["translation_provider"] = translation.get("provider")
                        
                        # 제목도 번역 (있는 경우)
                        if extracted_data.get("title"):
                            title_trans = await translation_service.translate(
                                extracted_data["title"],
                                target_language,
                                detected_lang
                            )
                            if title_trans.get("translated_text"):
                                extracted_data["translated_title"] = title_trans["translated_text"]
                                extracted_data["original_title"] = extracted_data["title"]
                                extracted_data["title"] = title_trans["translated_text"]
            
            # LLM 분석
            analysis = await self._process_with_llm(
                {
                    "url": url,
                    "content": content,
                    "extracted": extracted_data,
                    "query": query,
                    "screenshot": result.get("screenshot_path"),
                    "language_info": {
                        "detected": detected_lang if 'detected_lang' in locals() else None,
                        "translated": translate_content and 'translation' in locals()
                    }
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
                "screenshot": result.get("screenshot_path"),
                "language_info": {
                    "detected": detected_lang if 'detected_lang' in locals() else None,
                    "translated": translate_content and 'translation' in locals(),
                    "target_language": target_language
                }
            }
            
        except Exception as e:
            logger.error(f"Native crawl error: {e}")
            return {
                "url": url,
                "status": "error",
                "error": str(e)
            }
    
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
            # Native Command Manager 가져오기
            ncm = await self._get_native_command_manager()
            
            command_id = await ncm.send_command(
                "download_file",
                {
                    "url": url,
                    "filename": filename,
                    "save_path": str(DOWNLOADS_PATH)
                }
            )
            
            result = await ncm.wait_for_response(command_id, timeout=60)
            
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
    
    async def _focused_crawl(self, query: str, focused_sites: List[Dict[str, Any]], **kwargs) -> Dict[str, Any]:
        """특정 사이트 집중 크롤링"""
        focused_results = {}
        
        # 번역 옵션 추출
        target_language = kwargs.get("target_language", "ko")
        translate_content = kwargs.get("translate_content", False)
        
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
                
                # Native 크롤링 (번역 옵션 전달)
                result = await self._crawl_with_native(
                    url, 
                    query,
                    target_language=target_language,
                    translate_content=translate_content
                )
                
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
    
    
    async def search_web(self, query: str, sources: List[str], options: Dict[str, Any]) -> Dict[str, Any]:
        """웹 검색 실행"""
        results = {}
        
        # API 검색
        if "apis" in sources:
            for api_name in options.get("apis", []):
                api_results = await self._search_with_api(api_name, query, options)
                results.update(api_results)
        
        # 집중 크롤링
        if "focused" in sources and options.get("focused_sites"):
            # 번역 옵션 전달
            focused_results = await self._focused_crawl(
                query, 
                options["focused_sites"],
                target_language=options.get("target_language", "ko"),
                translate_content=options.get("translate_content", False)
            )
            results.update(focused_results)
        
        return results
    
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
        self.crawler_engine = None  # 초기화에서 생성
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
        # 크롤러 엔진 생성 및 초기화
        self.crawler_engine = WebCrawlerEngine()
        await self.crawler_engine.initialize()
        
        # 학습 시스템 초기화
        await self.learning_system.initialize()
        
        if not self._session:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=60)
            )
        
        logger.info("WebCrawlerAgentSystem initialized")

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
        
        # 번역 옵션 추가
        translation_opts = state.get("context", {}).get("translation", {})
        if translation_opts:
            options.update({
                "target_language": translation_opts.get("target_language", "ko"),
                "translate_results": translation_opts.get("translate_results", False),
                "translate_content": translation_opts.get("translate_content", False)
            })
        
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
                    {
                        "success": data.get("status") == "success", 
                        "relevance_score": 0.5,
                        "status": "success" if "error" not in data else "error"
                    }
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
Average quality score: {(sum(state['quality_scores'].values()) / len(state['quality_scores'])) if state.get('quality_scores') else 0:.2f}

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
        quality_scores = state.get("quality_scores", {})
        avg_quality = (sum(quality_scores.values()) / len(quality_scores)) if quality_scores else 0.0
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
    
    async def execute_search(self, query: str, context: Dict[str, Any] = {}, **kwargs) -> Dict[str, Any]:
        """외부에서 호출하는 검색 실행"""
        
        search_id = f"search_{uuid.uuid4()}"
        logger.info(f"Starting search {search_id}: {query}")
        
        # 번역 옵션을 context에 추가
        if "target_language" in kwargs:
            context["target_language"] = kwargs["target_language"]
        if "translate_results" in kwargs:
            context["translate_results"] = kwargs["translate_results"]
        if "translate_content" in kwargs:
            context["translate_content"] = kwargs["translate_content"]
        
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
                quality_score = (sum(final_state["quality_scores"].values()) / len(final_state["quality_scores"])) if final_state.get("quality_scores") else 0.0
            
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

crawler_router = APIRouter(tags=["web_crawler"])

# 전역 인스턴스
web_crawler_system = WebCrawlerAgentSystem()

# 설정 검증 (여기 추가)
if not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY not set - Google search will not work")
if not NEWS_API_KEY:
    logger.warning("NEWS_API_KEY not set - News search will not work")

# 요청/응답 모델
class WebSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    context: Optional[Dict[str, Any]] = {}
    timeout: int = Field(default=300, ge=30, le=600)  # 5분 기본값
    target_language: str = Field(default="ko", description="목표 언어 코드")
    translate_results: bool = Field(default=True, description="검색 결과 번역 여부")
    translate_content: bool = Field(default=True, description="웹 페이지 콘텐츠 번역 여부")

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

class SearchEngineConfig(BaseModel):
    enabled: bool
    api_key: Optional[str] = None
    cse_id: Optional[str] = None  # For Google
    client_id: Optional[str] = None  # For Naver
    client_secret: Optional[str] = None  # For Naver

class CrawlerSettingsUpdate(BaseModel):
    search_engines: Optional[Dict[str, Dict[str, Any]]] = None
    crawler_settings: Optional[Dict[str, Any]] = None
    ai_search_settings: Optional[Dict[str, Any]] = None
    translation_settings: Optional[Dict[str, Any]] = None

# Settings management
SETTINGS_FILE = Path(__file__).parent / "settings" / "crawler_settings.json"

def load_crawler_settings():
    """Load crawler settings from file with defaults"""
    if SETTINGS_FILE.exists():
        with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    # 기본 설정 반환
    return {
        "search_engines": {
            "google": {"enabled": False, "api_key": "", "cse_id": ""},
            "naver": {"enabled": False, "client_id": "", "client_secret": ""},
            "duckduckgo": {"enabled": True},
            "bing": {"enabled": False, "api_key": ""},
            "serper": {"enabled": False, "api_key": ""},
            "serpapi": {"enabled": False, "api_key": ""},
            "github": {"enabled": False, "api_key": ""},
            "huggingface": {"enabled": True},
            "kaggle": {"enabled": False, "api_key": ""},
            "arxiv": {"enabled": True},
            "paperswithcode": {"enabled": True},
            "dockerhub": {"enabled": True}
        },
        "crawler_settings": {
            "max_concurrent_requests": 5,
            "request_timeout": 30,
            "cache_ttl": 86400
        },
        "ai_search_settings": {
            "auto_search_enabled": True,
            "quality_threshold": 0.7,
            "max_iterations": 3
        },
        "translation_settings": {
            "enabled": True,
            "default_target_language": "ko",
            "auto_translate": True
        }
    }

def save_crawler_settings(settings):
    """Save crawler settings to file"""
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)

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
        # 번역 옵션을 context에 추가
        context = request.context or {}
        context["translation"] = {
            "enabled": request.translate_results or request.translate_content,
            "target_language": request.target_language,
            "translate_results": request.translate_results,
            "translate_content": request.translate_content
        }
        
        result = await web_crawler_system.execute_search(
            request.query,
            context,
            target_language=request.target_language,
            translate_results=request.translate_results,
            translate_content=request.translate_content
        )
        
        # 검색 통계 기록
        await record_search({
            "query": request.query,
            "engine": "ai_multi",  # AI가 여러 엔진을 사용
            "results_count": len(result.get("results", {})),
            "quality_score": result.get("quality_score", 0),
            "context": str(context),
            "ai_reasoning": "WebCrawlerAgentSystem multi-engine search"
        })
        
        return WebSearchResponse(**result)
        
    except Exception as e:
        logger.error(f"Web search error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@crawler_router.get("/settings")
async def get_crawler_settings():
    """Get current crawler settings with API key masking"""
    settings = load_crawler_settings()
    
    # API 키 마스킹 (보안)
    if "search_engines" in settings:
        search_engines = settings["search_engines"].copy()
        for engine, config in search_engines.items():
            if "api_key" in config and config["api_key"]:
                # API 키의 처음 4자와 마지막 4자만 표시
                key = config["api_key"]
                if len(key) > 8:
                    config["api_key"] = f"{key[:4]}...{key[-4:]}"
                else:
                    config["api_key"] = "****"
            if "client_secret" in config and config["client_secret"]:
                secret = config["client_secret"]
                if len(secret) > 8:
                    config["client_secret"] = f"{secret[:4]}...{secret[-4:]}"
                else:
                    config["client_secret"] = "****"
        settings["search_engines"] = search_engines
    
    return settings

@crawler_router.put("/settings")
async def update_crawler_settings(settings_update: CrawlerSettingsUpdate):
    """Update crawler settings with API key preservation"""
    try:
        current_settings = load_crawler_settings()
        
        # API 키가 마스킹된 경우 기존 키 유지
        if settings_update.search_engines is not None:
            for engine, config in settings_update.search_engines.items():
                if engine in current_settings.get("search_engines", {}):
                    existing_config = current_settings["search_engines"][engine]
                    # API 키가 마스킹되어 있으면 기존 키 사용
                    if "api_key" in config and "..." in config.get("api_key", ""):
                        config["api_key"] = existing_config.get("api_key", "")
                    if "client_secret" in config and "..." in config.get("client_secret", ""):
                        config["client_secret"] = existing_config.get("client_secret", "")
                    if "cse_id" in config and "..." in config.get("cse_id", ""):
                        config["cse_id"] = existing_config.get("cse_id", "")
        
        # Update only provided fields
        if settings_update.search_engines is not None:
            current_settings["search_engines"] = settings_update.search_engines
        if settings_update.crawler_settings is not None:
            current_settings["crawler_settings"] = settings_update.crawler_settings
        if settings_update.ai_search_settings is not None:
            current_settings["ai_search_settings"] = settings_update.ai_search_settings
        if settings_update.translation_settings is not None:
            current_settings["translation_settings"] = settings_update.translation_settings
        
        save_crawler_settings(current_settings)
        
        # Apply API keys from settings
        global GOOGLE_API_KEY, GOOGLE_CSE_ID
        if "search_engines" in current_settings:
            google_config = current_settings["search_engines"].get("google", {})
            if google_config.get("api_key"):
                GOOGLE_API_KEY = google_config["api_key"]
            if google_config.get("cse_id"):
                GOOGLE_CSE_ID = google_config["cse_id"]
        
        # Update API client instances with new credentials
        if web_crawler_system and web_crawler_system.crawler_engine:
            api_clients = web_crawler_system.crawler_engine.api_clients
            
            # Update Google API client
            if "google" in api_clients and "search_engines" in current_settings:
                google_config = current_settings["search_engines"].get("google", {})
                if google_config.get("api_key") and google_config.get("cse_id"):
                    api_clients["google"].update_credentials(
                        google_config["api_key"], 
                        google_config["cse_id"]
                    )
            
        
        logger.info("Crawler settings updated successfully")
        return {"status": "success", "settings": current_settings}
    except Exception as e:
        logger.error(f"Failed to update crawler settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@crawler_router.put("/settings/search-engine/{engine_id}")
async def update_search_engine_config(engine_id: str, config: SearchEngineConfig):
    """Update specific search engine configuration"""
    try:
        settings = load_crawler_settings()
        
        if "search_engines" not in settings:
            settings["search_engines"] = {}
        
        if engine_id not in settings["search_engines"]:
            return {"error": f"Unknown search engine: {engine_id}"}
        
        # Update the specific engine config
        settings["search_engines"][engine_id].update(config.dict(exclude_none=True))
        
        save_crawler_settings(settings)
        
        # Apply changes if it's Google
        if engine_id == "google":
            global GOOGLE_API_KEY, GOOGLE_CSE_ID
            if config.api_key:
                GOOGLE_API_KEY = config.api_key
            if config.cse_id:
                GOOGLE_CSE_ID = config.cse_id
        
        return {"status": "success", "engine": engine_id, "config": settings["search_engines"][engine_id]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@crawler_router.get("/quota")
async def get_api_quota():
    """API 할당량 조회 - includes all configured search engines"""
    settings = load_crawler_settings()
    stats = load_search_stats()
    quota_status = {}
    
    # 오늘 사용량 가져오기
    today_usage = stats.get("searches_today_by_engine", {})
    
    # Get quota for each enabled search engine
    if "search_engines" in settings:
        for engine_id, engine_config in settings["search_engines"].items():
            if engine_config.get("enabled", False):
                # 기본 한도 설정
                daily_limits = {
                    "google": 100,  # Google Custom Search API 무료 한도
                    "newsapi": 500,  # News API 무료 한도
                    "naver": 25000,  # Naver API 일일 한도
                    "bing": 1000,  # Bing API 예상 한도
                }
                
                limit = engine_config.get("daily_limit", daily_limits.get(engine_id, -1))
                used = today_usage.get(engine_id, 0)
                
                quota_status[engine_id] = {
                    "used": used,
                    "limit": limit,
                    "remaining": max(0, limit - used) if limit > 0 else -1,
                    "percentage_used": (used / limit * 100) if limit > 0 else 0
                }
    
    # WebCrawlerAgentSystem의 quota manager에서도 정보 가져오기
    if web_crawler_system:
        system_quota = await web_crawler_system.get_quota_status()
        # 시스템 할당량 정보와 병합
        for engine, status in system_quota.items():
            if engine in quota_status:
                # 더 높은 사용량 사용 (둘 중 정확한 것)
                quota_status[engine]["used"] = max(
                    quota_status[engine]["used"],
                    status["used"]
                )
    
    return quota_status

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

# Search statistics tracking
SEARCH_STATS_FILE = CRAWLER_DATA_PATH / "search_stats.json"

def load_search_stats():
    """Load search statistics from file"""
    if SEARCH_STATS_FILE.exists():
        with open(SEARCH_STATS_FILE, 'r', encoding='utf-8') as f:
            stats = json.load(f)
            
        # 오늘 날짜 체크 및 초기화
        today = datetime.now().date().isoformat()
        if "last_reset_date" not in stats or stats["last_reset_date"] != today:
            # 새로운 날이면 오늘 통계 초기화
            stats["searches_today_by_engine"] = {}
            stats["last_reset_date"] = today
            save_search_stats(stats)
        return stats
    else:
        return {
            "total_searches": 0,
            "searches_by_engine": {},
            "searches_today_by_engine": {},
            "recent_searches": [],
            "last_reset_date": datetime.now().date().isoformat()
        }

def save_search_stats(stats):
    """Save search statistics to file"""
    SEARCH_STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SEARCH_STATS_FILE, 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

@crawler_router.get("/stats")
async def get_search_engine_stats():
    """Get search engine usage statistics"""
    try:
        return load_search_stats()
    except Exception as e:
        logger.error(f"Failed to get search stats: {e}")
        return {
            "total_searches": 0,
            "searches_by_engine": {},
            "searches_today_by_engine": {},
            "recent_searches": []
        }

@crawler_router.post("/stats/record")
async def record_search(search_data: Dict[str, Any]):
    """Record search statistics"""
    try:
        stats = load_search_stats()
        
        # 통계 업데이트
        engine = search_data.get("engine")
        if engine:
            stats["total_searches"] += 1
            stats["searches_by_engine"][engine] = stats["searches_by_engine"].get(engine, 0) + 1
            stats["searches_today_by_engine"][engine] = stats["searches_today_by_engine"].get(engine, 0) + 1
        
        # 최근 검색에 추가 (최대 50개 유지)
        stats["recent_searches"].insert(0, {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat(),
            "query": search_data.get("query", ""),
            "engine": engine,
            "results_count": search_data.get("results_count", 0),
            "ai_reasoning": search_data.get("ai_reasoning", ""),
            "context": search_data.get("context", ""),
            "quality_score": search_data.get("quality_score", 0)
        })
        
        # 최근 검색을 50개로 제한
        stats["recent_searches"] = stats["recent_searches"][:50]
        
        save_search_stats(stats)
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Failed to record search: {e}")
        return {"success": False, "error": str(e)}

@crawler_router.get("/ai/activities")
async def get_ai_search_activities(limit: int = 50):
    """Get recent AI search activities"""
    try:
        stats = load_search_stats()
        activities = stats.get("recent_searches", [])
        
        # limit 적용
        activities = activities[:limit]
        
        return {
            "activities": activities,
            "total": len(activities)
        }
    except Exception as e:
        logger.error(f"Failed to get AI activities: {e}")
        return {
            "activities": [],
            "total": 0
        }

@crawler_router.get("/ai/status")
async def get_ai_search_status():
    """Get current AI search status"""
    settings = load_crawler_settings()
    ai_settings = settings.get("ai_search_settings", {})
    stats = load_search_stats()
    
    # 오늘 검색 횟수 계산
    searches_today = sum(stats.get("searches_today_by_engine", {}).values())
    
    # 마지막 검색 시간
    last_search_time = None
    if stats.get("recent_searches"):
        last_search_time = stats["recent_searches"][0].get("timestamp")
    
    # 현재 활성 검색 확인
    current_analysis = None
    if web_crawler_system and web_crawler_system.active_searches:
        # 가장 최근 활성 검색
        active_search_ids = list(web_crawler_system.active_searches.keys())
        if active_search_ids:
            current_analysis = {
                "search_id": active_search_ids[-1],
                "status": "running"
            }
    
    return {
        "auto_search_enabled": ai_settings.get("auto_search_enabled", True),
        "current_analysis": current_analysis,
        "searches_today": searches_today,
        "searches_this_session": stats.get("total_searches", 0),  # 전체 검색 수
        "quality_threshold": ai_settings.get("quality_threshold", 0.7),
        "last_search_time": last_search_time
    }

# 중복된 startup/shutdown 이벤트 핸들러 제거 (이미 위에 정의됨)