
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