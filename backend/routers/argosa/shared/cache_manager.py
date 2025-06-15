# backend/routers/argosa/shared/cache_manager.py
"""중앙 캐시 관리자"""

import asyncio
import json
from typing import Any, Dict, Optional, Tuple
from datetime import datetime, timedelta, timezone
import aioredis
import pickle
import hashlib
import logging

logger = logging.getLogger(__name__)

class CacheManager:
    """Redis 기반 중앙 캐시 관리"""
    
    def __init__(self, redis_url: str = "redis://localhost"):
        self.redis_url = redis_url
        self.redis: Optional[aioredis.Redis] = None
        self._local_cache: Dict[str, Tuple[Any, datetime]] = {}
        self._lock = asyncio.Lock()
        
    async def initialize(self):
        """Redis 연결 초기화"""
        try:
            self.redis = await aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=False  # 바이너리 데이터 처리
            )
            await self.redis.ping()
            logger.info("Redis cache connected")
        except Exception as e:
            logger.warning(f"Redis connection failed, using local cache only: {e}")
            self.redis = None
    
    def _generate_key(self, namespace: str, key: str) -> str:
        """네임스페이스를 포함한 캐시 키 생성"""
        return f"argosa:{namespace}:{key}"
    
    async def get(self, namespace: str, key: str) -> Optional[Any]:
        """캐시에서 값 가져오기"""
        cache_key = self._generate_key(namespace, key)
        
        # 로컬 캐시 먼저 확인
        async with self._lock:
            if cache_key in self._local_cache:
                value, expires_at = self._local_cache[cache_key]
                if datetime.now(timezone.utc) < expires_at:
                    return value
                else:
                    del self._local_cache[cache_key]
        
        # Redis 확인
        if self.redis:
            try:
                data = await self.redis.get(cache_key)
                if data:
                    value = pickle.loads(data)
                    # 로컬 캐시에도 저장
                    async with self._lock:
                        self._local_cache[cache_key] = (
                            value,
                            datetime.now(timezone.utc) + timedelta(minutes=5)
                        )
                    return value
            except Exception as e:
                logger.error(f"Redis get error: {e}")
        
        return None
    
    async def set(self, namespace: str, key: str, value: Any, 
                  ttl_seconds: int = 3600) -> bool:
        """캐시에 값 저장"""
        cache_key = self._generate_key(namespace, key)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        
        # 로컬 캐시 저장
        async with self._lock:
            self._local_cache[cache_key] = (value, expires_at)
        
        # Redis 저장
        if self.redis:
            try:
                data = pickle.dumps(value)
                await self.redis.setex(cache_key, ttl_seconds, data)
                return True
            except Exception as e:
                logger.error(f"Redis set error: {e}")
        
        return True  # 로컬 캐시는 성공
    
    async def delete(self, namespace: str, key: str) -> bool:
        """캐시에서 삭제"""
        cache_key = self._generate_key(namespace, key)
        
        # 로컬 캐시 삭제
        async with self._lock:
            self._local_cache.pop(cache_key, None)
        
        # Redis 삭제
        if self.redis:
            try:
                await self.redis.delete(cache_key)
                return True
            except Exception as e:
                logger.error(f"Redis delete error: {e}")
        
        return True
    
    async def clear_namespace(self, namespace: str):
        """네임스페이스의 모든 캐시 삭제"""
        pattern = self._generate_key(namespace, "*")
        
        # 로컬 캐시 정리
        async with self._lock:
            keys_to_delete = [k for k in self._local_cache if k.startswith(f"argosa:{namespace}:")]
            for key in keys_to_delete:
                del self._local_cache[key]
        
        # Redis 정리
        if self.redis:
            try:
                cursor = 0
                while True:
                    cursor, keys = await self.redis.scan(cursor, match=pattern, count=100)
                    if keys:
                        await self.redis.delete(*keys)
                    if cursor == 0:
                        break
            except Exception as e:
                logger.error(f"Redis clear namespace error: {e}")
    
    async def cleanup(self):
        """리소스 정리"""
        # cleanup task 취소 추가
        if hasattr(self, '_cleanup_task'):
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        if self.redis:
            await self.redis.close()
            
# 싱글톤 인스턴스
cache_manager = CacheManager()

# =======================================================

# backend/routers/argosa/shared/llm_tracker.py
"""중앙 LLM 대화 추적 관리"""

import asyncio
from typing import Set, Dict, Any, List, Optional
from datetime import datetime, timezone
import logging
import json
from pathlib import Path

logger = logging.getLogger(__name__)

class LLMTracker:
    """중앙 집중식 LLM 대화 추적"""
    
    def __init__(self):
        self._tracked_ids: Set[str] = set()
        self._metadata: Dict[str, Dict[str, Any]] = {}
        self._platform_stats: Dict[str, int] = {}
        self._lock = asyncio.Lock()
        self._persistence_file = Path("./data/argosa/llm_tracking.json")
        self._load_state()
    
    def _load_state(self):
        """저장된 상태 로드"""
        try:
            if self._persistence_file.exists():
                with open(self._persistence_file, 'r') as f:
                    data = json.load(f)
                    self._tracked_ids = set(data.get('tracked_ids', []))
                    self._metadata = data.get('metadata', {})
                    self._platform_stats = data.get('platform_stats', {})
                    logger.info(f"Loaded {len(self._tracked_ids)} tracked LLM conversations")
        except Exception as e:
            logger.error(f"Failed to load LLM tracking state: {e}")
    
    async def _save_state(self):
        """상태 저장"""
        async with self._lock:
            try:
                self._persistence_file.parent.mkdir(parents=True, exist_ok=True)
                data = {
                    'tracked_ids': list(self._tracked_ids),
                    'metadata': self._metadata,
                    'platform_stats': self._platform_stats,
                    'last_saved': datetime.now(timezone.utc).isoformat()
                }
                
                # 임시 파일에 먼저 저장
                temp_file = self._persistence_file.with_suffix('.tmp')
                with open(temp_file, 'w') as f:
                    json.dump(data, f, indent=2)
                
                # 원자적 교체
                temp_file.replace(self._persistence_file)
                
            except Exception as e:
                logger.error(f"Failed to save LLM tracking state: {e}")
    
    async def track(self, conversation_id: str, platform: str, 
                   metadata: Optional[Dict[str, Any]] = None) -> bool:
        """LLM 대화 추적"""
        async with self._lock:
            if conversation_id in self._tracked_ids:
                logger.debug(f"Conversation {conversation_id} already tracked")
                return False
            
            self._tracked_ids.add(conversation_id)
            self._metadata[conversation_id] = {
                'platform': platform,
                'tracked_at': datetime.now(timezone.utc).isoformat(),
                'source': 'llm_query',
                **(metadata or {})
            }
            
            # 플랫폼별 통계 업데이트
            self._platform_stats[platform] = self._platform_stats.get(platform, 0) + 1
            
            logger.info(f"Tracked LLM conversation: {conversation_id} on {platform}")
        
        # 비동기 저장
        asyncio.create_task(self._save_state())
        return True
    
    async def is_tracked(self, conversation_id: str) -> bool:
        """추적된 대화인지 확인"""
        async with self._lock:
            return conversation_id in self._tracked_ids
    
    async def get_tracked_ids(self, platform: Optional[str] = None) -> List[str]:
        """추적된 ID 목록 반환"""
        async with self._lock:
            if platform:
                return [
                    cid for cid, meta in self._metadata.items()
                    if meta.get('platform') == platform
                ]
            return list(self._tracked_ids)
    
    async def filter_conversations(self, conversations: List[Dict[str, Any]], 
                                 platform: str) -> Dict[str, Any]:
        """LLM 대화 필터링"""
        filtered = []
        excluded_ids = []
        excluded_metadata = []
        
        async with self._lock:
            for conv in conversations:
                conv_id = conv.get('id')
                conv_metadata = conv.get('metadata', {})
                
                # 여러 조건으로 LLM 대화 체크
                is_llm = (
                    conv_id in self._tracked_ids or
                    conv_metadata.get('source') == 'llm_query' or
                    conv_metadata.get('is_llm_query', False) or
                    conv_metadata.get('generated_by') == 'extension_llm'
                )
                
                if is_llm:
                    excluded_ids.append(conv_id)
                    # 새로 발견된 LLM 대화도 추적
                    if conv_id not in self._tracked_ids:
                        self._tracked_ids.add(conv_id)
                        self._metadata[conv_id] = {
                            'platform': platform,
                            'tracked_at': datetime.now(timezone.utc).isoformat(),
                            'source': 'discovered',
                            **conv_metadata
                        }
                else:
                    filtered.append(conv)
        
        # 비동기 저장
        if excluded_ids:
            asyncio.create_task(self._save_state())
        
        return {
            'conversations': filtered,
            'excluded_ids': excluded_ids,
            'excluded_count': len(excluded_ids),
            'total_before_filter': len(conversations),
            'filter_stats': {
                'platform': platform,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
        }
    
    async def get_stats(self) -> Dict[str, Any]:
        """추적 통계 반환"""
        async with self._lock:
            total_tracked = len(self._tracked_ids)
            
            # 시간별 통계
            time_stats = {}
            for meta in self._metadata.values():
                tracked_date = meta.get('tracked_at', '').split('T')[0]
                if tracked_date:
                    time_stats[tracked_date] = time_stats.get(tracked_date, 0) + 1
            
            return {
                'total_tracked': total_tracked,
                'platform_breakdown': dict(self._platform_stats),
                'daily_tracking': time_stats,
                'sources': self._count_sources()
            }
    
    def _count_sources(self) -> Dict[str, int]:
        """소스별 카운트"""
        sources = {}
        for meta in self._metadata.values():
            source = meta.get('source', 'unknown')
            sources[source] = sources.get(source, 0) + 1
        return sources
    
    async def cleanup_old_tracking(self, days: int = 30):
        """오래된 추적 정보 정리"""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        removed_count = 0
        
        async with self._lock:
            ids_to_remove = []
            
            for conv_id, meta in self._metadata.items():
                tracked_at_str = meta.get('tracked_at', '')
                if tracked_at_str:
                    try:
                        tracked_at = datetime.fromisoformat(tracked_at_str.replace('Z', '+00:00'))
                        if tracked_at < cutoff:
                            ids_to_remove.append(conv_id)
                    except:
                        pass
            
            # 제거
            for conv_id in ids_to_remove:
                self._tracked_ids.discard(conv_id)
                platform = self._metadata.pop(conv_id, {}).get('platform')
                if platform and platform in self._platform_stats:
                    self._platform_stats[platform] = max(0, self._platform_stats[platform] - 1)
                removed_count += 1
        
        if removed_count > 0:
            await self._save_state()
            logger.info(f"Cleaned up {removed_count} old LLM tracking records")
        
        return removed_count

# 싱글톤 인스턴스
llm_tracker = LLMTracker()

# =======================================================

# backend/routers/argosa/shared/error_handler.py
"""중앙 에러 처리 및 복구"""

import asyncio
import logging
from typing import Callable, Any, Optional, Dict, Type
from datetime import datetime, timezone
from functools import wraps
import traceback
from enum import Enum

logger = logging.getLogger(__name__)

class ErrorSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class RecoveryStrategy(Enum):
    RETRY = "retry"
    FALLBACK = "fallback"
    CIRCUIT_BREAK = "circuit_break"
    IGNORE = "ignore"

class ErrorHandler:
    """중앙 에러 처리 시스템"""
    
    def __init__(self):
        self.error_history: Dict[str, List[Dict[str, Any]]] = {}
        self.circuit_breakers: Dict[str, Dict[str, Any]] = {}
        self.recovery_strategies: Dict[Type[Exception], RecoveryStrategy] = {
            asyncio.TimeoutError: RecoveryStrategy.RETRY,
            ConnectionError: RecoveryStrategy.CIRCUIT_BREAK,
            ValueError: RecoveryStrategy.FALLBACK,
            KeyError: RecoveryStrategy.FALLBACK
        }
        self._lock = asyncio.Lock()
    
    def with_error_handling(
        self,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        max_retries: int = 3,
        backoff_base: float = 2.0,
        fallback_value: Any = None,
        circuit_break_threshold: int = 5,
        circuit_break_timeout: int = 60
    ):
        """에러 처리 데코레이터"""
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            async def wrapper(*args, **kwargs):
                context_name = f"{func.__module__}.{func.__name__}"
                
                # Circuit breaker 체크
                if await self._is_circuit_open(context_name):
                    logger.warning(f"Circuit breaker OPEN for {context_name}")
                    if fallback_value is not None:
                        return fallback_value
                    raise Exception(f"Circuit breaker open for {context_name}")
                
                retry_count = 0
                last_error = None
                
                while retry_count <= max_retries:
                    try:
                        # 함수 실행
                        result = await func(*args, **kwargs)
                        
                        # 성공시 circuit breaker 리셋
                        await self._reset_circuit_breaker(context_name)
                        
                        return result
                        
                    except Exception as e:
                        last_error = e
                        error_type = type(e)
                        strategy = self.recovery_strategies.get(
                            error_type, 
                            RecoveryStrategy.RETRY
                        )
                        
                        # 에러 기록
                        await self._record_error(
                            context_name, 
                            e, 
                            severity,
                            retry_count
                        )
                        
                        # 전략별 처리
                        if strategy == RecoveryStrategy.IGNORE:
                            logger.debug(f"Ignoring error in {context_name}: {e}")
                            return fallback_value
                            
                        elif strategy == RecoveryStrategy.FALLBACK:
                            logger.warning(f"Using fallback for {context_name}: {e}")
                            return fallback_value
                            
                        elif strategy == RecoveryStrategy.CIRCUIT_BREAK:
                            await self._update_circuit_breaker(
                                context_name,
                                circuit_break_threshold,
                                circuit_break_timeout
                            )
                            
                            if await self._is_circuit_open(context_name):
                                logger.error(f"Circuit breaker triggered for {context_name}")
                                if fallback_value is not None:
                                    return fallback_value
                                raise
                        
                        # 재시도 처리
                        if retry_count < max_retries:
                            wait_time = backoff_base ** retry_count
                            logger.warning(
                                f"Retry {retry_count + 1}/{max_retries} for {context_name} "
                                f"after {wait_time}s. Error: {e}"
                            )
                            await asyncio.sleep(wait_time)
                            retry_count += 1
                        else:
                            # 최대 재시도 초과
                            logger.error(
                                f"Max retries exceeded for {context_name}. "
                                f"Last error: {e}"
                            )
                            
                            if fallback_value is not None:
                                return fallback_value
                            raise
                
                # 이론적으로 도달하지 않음
                if last_error:
                    raise last_error
                    
            return wrapper
        return decorator
    
    async def _record_error(self, context: str, error: Exception, 
                          severity: ErrorSeverity, retry_count: int):
        """에러 기록"""
        async with self._lock:
            if context not in self.error_history:
                self.error_history[context] = []
            
            error_record = {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'error_type': type(error).__name__,
                'error_message': str(error),
                'severity': severity.value,
                'retry_count': retry_count,
                'traceback': traceback.format_exc()
            }
            
            self.error_history[context].append(error_record)
            
            # 최대 100개만 유지
            if len(self.error_history[context]) > 100:
                self.error_history[context] = self.error_history[context][-100:]
    
    async def _is_circuit_open(self, context: str) -> bool:
        """Circuit breaker 상태 확인"""
        async with self._lock:
            if context not in self.circuit_breakers:
                return False
            
            breaker = self.circuit_breakers[context]
            
            # 타임아웃 체크
            if breaker['open_until'] and datetime.now(timezone.utc) > breaker['open_until']:
                # Half-open 상태로 전환
                breaker['state'] = 'half-open'
                breaker['failure_count'] = 0
                return False
            
            return breaker['state'] == 'open'
    
    async def _update_circuit_breaker(self, context: str, threshold: int, timeout: int):
        """Circuit breaker 업데이트"""
        async with self._lock:
            if context not in self.circuit_breakers:
                self.circuit_breakers[context] = {
                    'state': 'closed',
                    'failure_count': 0,
                    'open_until': None
                }
            
            breaker = self.circuit_breakers[context]
            breaker['failure_count'] += 1
            
            if breaker['failure_count'] >= threshold:
                breaker['state'] = 'open'
                breaker['open_until'] = datetime.now(timezone.utc) + timedelta(seconds=timeout)
                logger.error(f"Circuit breaker OPENED for {context}")
    
    async def _reset_circuit_breaker(self, context: str):
        """Circuit breaker 리셋"""
        async with self._lock:
            if context in self.circuit_breakers:
                self.circuit_breakers[context] = {
                    'state': 'closed',
                    'failure_count': 0,
                    'open_until': None
                }
    
    async def get_error_stats(self) -> Dict[str, Any]:
        """에러 통계 반환"""
        async with self._lock:
            stats = {
                'total_contexts': len(self.error_history),
                'total_errors': sum(len(errors) for errors in self.error_history.values()),
                'circuit_breakers': {
                    'open': sum(1 for b in self.circuit_breakers.values() if b['state'] == 'open'),
                    'closed': sum(1 for b in self.circuit_breakers.values() if b['state'] == 'closed'),
                    'half_open': sum(1 for b in self.circuit_breakers.values() if b['state'] == 'half-open')
                },
                'recent_errors': self._get_recent_errors(10)
            }
            return stats
    
    def _get_recent_errors(self, count: int) -> List[Dict[str, Any]]:
        """최근 에러 가져오기"""
        all_errors = []
        for context, errors in self.error_history.items():
            for error in errors:
                all_errors.append({
                    'context': context,
                    **error
                })
        
        # 시간순 정렬
        all_errors.sort(key=lambda x: x['timestamp'], reverse=True)
        return all_errors[:count]

# 싱글톤 인스턴스
error_handler = ErrorHandler()

# 사용 예시를 위한 헬퍼 함수
def with_retry(max_retries: int = 3, backoff: float = 2.0):
    """간단한 재시도 데코레이터"""
    return error_handler.with_error_handling(
        severity=ErrorSeverity.MEDIUM,
        max_retries=max_retries,
        backoff_base=backoff
    )

def with_fallback(fallback_value: Any):
    """폴백 값을 가진 데코레이터"""
    return error_handler.with_error_handling(
        severity=ErrorSeverity.LOW,
        max_retries=0,
        fallback_value=fallback_value
    )