# backend/app/utils/logger.py

import logging
import sys
import json
import time
import traceback
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, Optional, Callable, List
from enum import Enum
from contextvars import ContextVar
from functools import wraps
import asyncio

import structlog
from structlog.processors import CallsiteParameter, CallsiteParameterAdder
from structlog.stdlib import LoggerFactory, BoundLogger
from pythonjsonlogger import jsonlogger

# 로그 컨텍스트 변수
log_context: ContextVar[Dict[str, Any]] = ContextVar('log_context', default={})

class LogLevel(str, Enum):
    """로그 레벨"""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

class LoggerConfig:
    """로거 설정"""
    def __init__(
        self,
        level: str = "INFO",
        console_output: bool = True,
        file_output: bool = True,
        json_output: bool = False,
        log_dir: str = "logs",
        max_file_size: int = 10 * 1024 * 1024,  # 10MB
        backup_count: int = 5,
        include_callsite: bool = True,
        async_mode: bool = False
    ):
        self.level = level
        self.console_output = console_output
        self.file_output = file_output
        self.json_output = json_output
        self.log_dir = Path(log_dir)
        self.max_file_size = max_file_size
        self.backup_count = backup_count
        self.include_callsite = include_callsite
        self.async_mode = async_mode

# 전역 설정
_config = LoggerConfig()
_async_queue: Optional[asyncio.Queue] = None
_async_task: Optional[asyncio.Task] = None

def configure_logging(config: LoggerConfig):
    """로깅 시스템 설정"""
    global _config, _async_queue, _async_task
    _config = config
    
    # 로그 디렉토리 생성
    _config.log_dir.mkdir(exist_ok=True)
    
    # 비동기 모드 설정
    if _config.async_mode:
        _async_queue = asyncio.Queue(maxsize=10000)
        _async_task = asyncio.create_task(_async_log_processor())

def _add_context_processor(logger, method_name, event_dict):
    """컨텍스트 정보 추가"""
    context = log_context.get()
    if context:
        event_dict.update(context)
    return event_dict

def _add_performance_processor(logger, method_name, event_dict):
    """성능 메트릭 추가"""
    event_dict['timestamp_ms'] = int(time.time() * 1000)
    
    # 메모리 사용량 추가 (선택적)
    try:
        import psutil
        process = psutil.Process()
        event_dict['memory_mb'] = process.memory_info().rss / 1024 / 1024
    except:
        pass
        
    return event_dict

def _add_error_details_processor(logger, method_name, event_dict):
    """에러 상세 정보 추가"""
    if method_name in ['error', 'critical', 'exception']:
        # 스택 트레이스 추가
        if 'exc_info' in event_dict and event_dict['exc_info']:
            event_dict['traceback'] = traceback.format_exc()
            
        # 에러 타입 추가
        if 'error' in event_dict and isinstance(event_dict['error'], Exception):
            event_dict['error_type'] = type(event_dict['error']).__name__
            
    return event_dict

def _filter_sensitive_data_processor(logger, method_name, event_dict):
    """민감한 데이터 필터링"""
    sensitive_keys = ['password', 'token', 'secret', 'api_key', 'private_key']
    
    def filter_dict(d):
        if not isinstance(d, dict):
            return d
            
        filtered = {}
        for k, v in d.items():
            if any(sensitive in k.lower() for sensitive in sensitive_keys):
                filtered[k] = '***REDACTED***'
            elif isinstance(v, dict):
                filtered[k] = filter_dict(v)
            else:
                filtered[k] = v
        return filtered
        
    return filter_dict(event_dict)

def _setup_processors(include_callsite: bool = True) -> List:
    """프로세서 설정"""
    processors = [
        structlog.contextvars.merge_contextvars,
        _add_context_processor,
        _add_performance_processor,
        _add_error_details_processor,
        _filter_sensitive_data_processor,
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    
    if include_callsite:
        processors.insert(0, CallsiteParameterAdder(
            parameters=[
                CallsiteParameter.FILENAME,
                CallsiteParameter.FUNC_NAME,
                CallsiteParameter.LINENO,
            ]
        ))
    
    # 출력 형식 선택
    if _config.json_output:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer(
            colors=True,
            exception_formatter=structlog.dev.rich_traceback
        ))
        
    return processors

def setup_logger(name: str) -> BoundLogger:
    """구조화된 로거 설정"""
    
    # Python 표준 로거 설정
    stdlib_logger = logging.getLogger(name)
    
    if not stdlib_logger.handlers:
        # 로그 레벨 설정
        stdlib_logger.setLevel(getattr(logging, _config.level))
        
        # 콘솔 핸들러
        if _config.console_output:
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(getattr(logging, _config.level))
            
            if _config.json_output:
                formatter = jsonlogger.JsonFormatter(
                    '%(timestamp)s %(level)s %(name)s %(message)s'
                )
            else:
                formatter = logging.Formatter(
                    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
                )
                
            console_handler.setFormatter(formatter)
            stdlib_logger.addHandler(console_handler)
        
        # 파일 핸들러
        if _config.file_output:
            from logging.handlers import RotatingFileHandler
            
            log_file = _config.log_dir / f"{name.replace('.', '_')}.log"
            file_handler = RotatingFileHandler(
                log_file,
                maxBytes=_config.max_file_size,
                backupCount=_config.backup_count
            )
            file_handler.setLevel(logging.DEBUG)  # 파일에는 모든 로그 저장
            
            if _config.json_output:
                formatter = jsonlogger.JsonFormatter(
                    '%(timestamp)s %(level)s %(name)s %(message)s %(pathname)s %(funcName)s %(lineno)d'
                )
            else:
                formatter = logging.Formatter(
                    '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(funcName)s() - %(message)s'
                )
                
            file_handler.setFormatter(formatter)
            stdlib_logger.addHandler(file_handler)
            
            # 에러 전용 파일
            error_file = _config.log_dir / "errors.log"
            error_handler = RotatingFileHandler(
                error_file,
                maxBytes=_config.max_file_size,
                backupCount=_config.backup_count
            )
            error_handler.setLevel(logging.ERROR)
            error_handler.setFormatter(formatter)
            stdlib_logger.addHandler(error_handler)
    
    # Structlog 설정
    structlog.configure(
        processors=_setup_processors(_config.include_callsite),
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    
    # 구조화된 로거 반환
    return structlog.get_logger(name)

# 로깅 데코레이터
def log_execution(
    level: LogLevel = LogLevel.INFO,
    include_args: bool = True,
    include_result: bool = False,
    include_timing: bool = True
):
    """함수 실행 로깅 데코레이터"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            logger = setup_logger(func.__module__)
            start_time = time.time()
            
            # 실행 시작 로그
            log_data = {
                'event': 'function_start',
                'function': func.__name__,
            }
            
            if include_args:
                log_data['args'] = args
                log_data['kwargs'] = kwargs
                
            logger.log(level.value, "Function execution started", **log_data)
            
            try:
                result = await func(*args, **kwargs)
                
                # 실행 완료 로그
                end_time = time.time()
                log_data = {
                    'event': 'function_end',
                    'function': func.__name__,
                    'status': 'success'
                }
                
                if include_timing:
                    log_data['duration_ms'] = (end_time - start_time) * 1000
                    
                if include_result:
                    log_data['result'] = result
                    
                logger.log(level.value, "Function execution completed", **log_data)
                
                return result
                
            except Exception as e:
                # 에러 로그
                end_time = time.time()
                logger.exception(
                    "Function execution failed",
                    event='function_error',
                    function=func.__name__,
                    error=str(e),
                    duration_ms=(end_time - start_time) * 1000 if include_timing else None
                )
                raise
                
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            logger = setup_logger(func.__module__)
            start_time = time.time()
            
            # 실행 시작 로그
            log_data = {
                'event': 'function_start',
                'function': func.__name__,
            }
            
            if include_args:
                log_data['args'] = args
                log_data['kwargs'] = kwargs
                
            logger.log(level.value, "Function execution started", **log_data)
            
            try:
                result = func(*args, **kwargs)
                
                # 실행 완료 로그
                end_time = time.time()
                log_data = {
                    'event': 'function_end',
                    'function': func.__name__,
                    'status': 'success'
                }
                
                if include_timing:
                    log_data['duration_ms'] = (end_time - start_time) * 1000
                    
                if include_result:
                    log_data['result'] = result
                    
                logger.log(level.value, "Function execution completed", **log_data)
                
                return result
                
            except Exception as e:
                # 에러 로그
                end_time = time.time()
                logger.exception(
                    "Function execution failed",
                    event='function_error',
                    function=func.__name__,
                    error=str(e),
                    duration_ms=(end_time - start_time) * 1000 if include_timing else None
                )
                raise
                
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
        
    return decorator

# 컨텍스트 관리자
class LogContext:
    """로그 컨텍스트 관리자"""
    def __init__(self, **kwargs):
        self.context = kwargs
        self.token = None
        
    def __enter__(self):
        current_context = log_context.get().copy()
        current_context.update(self.context)
        self.token = log_context.set(current_context)
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.token:
            log_context.reset(self.token)
            
    async def __aenter__(self):
        return self.__enter__()
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return self.__exit__(exc_type, exc_val, exc_tb)

# 성능 로깅 클래스
class PerformanceLogger:
    """성능 메트릭 로깅"""
    def __init__(self, name: str, logger: Optional[BoundLogger] = None):
        self.name = name
        self.logger = logger or setup_logger(__name__)
        self.start_time = None
        self.checkpoints = []
        
    def start(self):
        """측정 시작"""
        self.start_time = time.time()
        self.checkpoints = []
        self.logger.info(f"Performance measurement started: {self.name}")
        
    def checkpoint(self, name: str):
        """체크포인트 기록"""
        if self.start_time is None:
            self.start()
            
        current_time = time.time()
        elapsed = (current_time - self.start_time) * 1000
        
        checkpoint = {
            'name': name,
            'elapsed_ms': elapsed,
            'timestamp': current_time
        }
        
        self.checkpoints.append(checkpoint)
        
        self.logger.info(
            f"Performance checkpoint",
            measurement=self.name,
            checkpoint=name,
            elapsed_ms=elapsed
        )
        
    def end(self, include_checkpoints: bool = True):
        """측정 종료 및 결과 로깅"""
        if self.start_time is None:
            self.logger.warning("Performance measurement not started")
            return
            
        end_time = time.time()
        total_elapsed = (end_time - self.start_time) * 1000
        
        log_data = {
            'measurement': self.name,
            'total_elapsed_ms': total_elapsed,
            'checkpoint_count': len(self.checkpoints)
        }
        
        if include_checkpoints and self.checkpoints:
            log_data['checkpoints'] = self.checkpoints
            
        self.logger.info("Performance measurement completed", **log_data)
        
        # 리셋
        self.start_time = None
        self.checkpoints = []

# 비동기 로그 프로세서
async def _async_log_processor():
    """비동기 로그 처리"""
    while True:
        try:
            log_record = await _async_queue.get()
            if log_record is None:  # 종료 신호
                break
                
            # 실제 로깅 처리
            logger_name, level, message, kwargs = log_record
            logger = setup_logger(logger_name)
            logger.log(level, message, **kwargs)
            
        except Exception as e:
            # 로깅 중 에러는 stderr로 출력
            print(f"Async logging error: {e}", file=sys.stderr)

# 비동기 로거 래퍼
class AsyncLogger:
    """비동기 로거 래퍼"""
    def __init__(self, name: str):
        self.name = name
        self._sync_logger = setup_logger(name)
        
    async def log(self, level: str, message: str, **kwargs):
        """비동기 로그"""
        if _config.async_mode and _async_queue:
            await _async_queue.put((self.name, level, message, kwargs))
        else:
            self._sync_logger.log(level, message, **kwargs)
            
    async def debug(self, message: str, **kwargs):
        await self.log('debug', message, **kwargs)
        
    async def info(self, message: str, **kwargs):
        await self.log('info', message, **kwargs)
        
    async def warning(self, message: str, **kwargs):
        await self.log('warning', message, **kwargs)
        
    async def error(self, message: str, **kwargs):
        await self.log('error', message, **kwargs)
        
    async def critical(self, message: str, **kwargs):
        await self.log('critical', message, **kwargs)

# 로그 집계 클래스
class LogAggregator:
    """로그 집계 및 통계"""
    def __init__(self):
        self.counters = {}
        self.timings = {}
        
    def increment(self, metric: str, value: int = 1):
        """카운터 증가"""
        if metric not in self.counters:
            self.counters[metric] = 0
        self.counters[metric] += value
        
    def timing(self, metric: str, duration_ms: float):
        """타이밍 기록"""
        if metric not in self.timings:
            self.timings[metric] = []
        self.timings[metric].append(duration_ms)
        
    def get_stats(self) -> Dict[str, Any]:
        """통계 반환"""
        stats = {
            'counters': self.counters.copy(),
            'timings': {}
        }
        
        for metric, values in self.timings.items():
            if values:
                stats['timings'][metric] = {
                    'count': len(values),
                    'min': min(values),
                    'max': max(values),
                    'avg': sum(values) / len(values),
                    'total': sum(values)
                }
                
        return stats
        
    def reset(self):
        """통계 리셋"""
        self.counters.clear()
        self.timings.clear()

# 전역 집계기
log_aggregator = LogAggregator()

# 사용 예시를 위한 헬퍼 함수
def get_logger(name: str) -> BoundLogger:
    """로거 가져오기 (별칭)"""
    return setup_logger(name)

def get_async_logger(name: str) -> AsyncLogger:
    """비동기 로거 가져오기"""
    return AsyncLogger(name)

# 모듈 초기화 시 기본 설정 적용
configure_logging(LoggerConfig())