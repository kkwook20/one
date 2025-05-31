# backend/app/services/error_tracking.py

import traceback
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from collections import defaultdict, deque
import asyncio
import json

from app.utils.logger import setup_logger
from app.models import ExecutionLog

logger = setup_logger(__name__)

class ErrorTracker:
    """에러 추적 시스템"""
    
    def __init__(self):
        self.errors: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self.error_patterns: Dict[str, Dict[str, Any]] = {}
        self.recent_errors = deque(maxlen=1000)
        self.error_counts = defaultdict(int)
        
        # 알림 설정
        self.alert_thresholds = {
            'critical': {
                'count': 5,      # 5회 이상
                'window': 300    # 5분 내
            },
            'warning': {
                'count': 10,
                'window': 600    # 10분 내
            }
        }
        
        self.alert_handlers: List[Any] = []
        
    def track_error(
        self, 
        error: Exception,
        context: Dict[str, Any],
        severity: str = 'error'
    ) -> str:
        """에러 추적"""
        # 에러 정보 수집
        error_data = {
            'id': self._generate_error_id(error),
            'type': type(error).__name__,
            'message': str(error),
            'traceback': traceback.format_exc(),
            'timestamp': datetime.now(),
            'severity': severity,
            'context': context
        }
        
        # 에러 패턴 식별
        pattern_id = self._identify_pattern(error_data)
        error_data['patternId'] = pattern_id
        
        # 저장
        self.errors[pattern_id].append(error_data)
        self.recent_errors.append(error_data)
        self.error_counts[pattern_id] += 1
        
        # 알림 확인
        asyncio.create_task(self._check_alerts(pattern_id))
        
        logger.error(f"Tracked error: {error_data['id']} - {error_data['message']}")
        
        return error_data['id']
        
    def _generate_error_id(self, error: Exception) -> str:
        """에러 ID 생성"""
        content = f"{type(error).__name__}:{str(error)}:{datetime.now().isoformat()}"
        return hashlib.md5(content.encode()).hexdigest()[:12]
        
    def _identify_pattern(self, error_data: Dict[str, Any]) -> str:
        """에러 패턴 식별"""
        # 스택 트레이스의 주요 부분 추출
        tb_lines = error_data['traceback'].split('\n')
        key_lines = [line for line in tb_lines if 'File' in line and 'app/' in line]
        
        # 패턴 키 생성
        pattern_key = f"{error_data['type']}:{':'.join(key_lines[:3])}"
        pattern_id = hashlib.md5(pattern_key.encode()).hexdigest()[:8]
        
        # 패턴 정보 업데이트
        if pattern_id not in self.error_patterns:
            self.error_patterns[pattern_id] = {
                'id': pattern_id,
                'type': error_data['type'],
                'firstSeen': datetime.now(),
                'lastSeen': datetime.now(),
                'count': 0,
                'sample': error_data
            }
        else:
            self.error_patterns[pattern_id]['lastSeen'] = datetime.now()
            
        self.error_patterns[pattern_id]['count'] += 1
        
        return pattern_id
        
    async def _check_alerts(self, pattern_id: str):
        """알림 조건 확인"""
        # 최근 에러 카운트 확인
        for level, threshold in self.alert_thresholds.items():
            cutoff = datetime.now() - timedelta(seconds=threshold['window'])
            recent_count = sum(
                1 for error in self.errors[pattern_id]
                if error['timestamp'] > cutoff
            )
            
            if recent_count >= threshold['count']:
                await self._send_alert(level, pattern_id, recent_count)
                
    async def _send_alert(self, level: str, pattern_id: str, count: int):
        """알림 전송"""
        pattern = self.error_patterns.get(pattern_id)
        if not pattern:
            return
            
        alert = {
            'level': level,
            'patternId': pattern_id,
            'errorType': pattern['type'],
            'count': count,
            'message': f"{level.upper()}: {pattern['type']} occurred {count} times",
            'timestamp': datetime.now().isoformat()
        }
        
        # 알림 핸들러 실행
        for handler in self.alert_handlers:
            try:
                await handler(alert)
            except Exception as e:
                logger.error(f"Alert handler error: {e}")
                
    def add_alert_handler(self, handler):
        """알림 핸들러 추가"""
        self.alert_handlers.append(handler)
        
    def get_error_summary(self, time_window: Optional[int] = None) -> Dict[str, Any]:
        """에러 요약"""
        if time_window:
            cutoff = datetime.now() - timedelta(seconds=time_window)
        else:
            cutoff = datetime.min
            
        # 시간 범위 내 에러 필터링
        recent_errors = [
            error for error in self.recent_errors
            if error['timestamp'] > cutoff
        ]
        
        # 심각도별 분류
        by_severity = defaultdict(int)
        for error in recent_errors:
            by_severity[error['severity']] += 1
            
        # 타입별 분류
        by_type = defaultdict(int)
        for error in recent_errors:
            by_type[error['type']] += 1
            
        # 가장 빈번한 패턴
        pattern_counts = defaultdict(int)
        for error in recent_errors:
            pattern_counts[error['patternId']] += 1
            
        top_patterns = sorted(
            pattern_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]
        
        return {
            'total': len(recent_errors),
            'bySeverity': dict(by_severity),
            'byType': dict(by_type),
            'topPatterns': [
                {
                    'patternId': pattern_id,
                    'count': count,
                    'details': self.error_patterns.get(pattern_id)
                }
                for pattern_id, count in top_patterns
            ],
            'timeWindow': time_window,
            'timestamp': datetime.now().isoformat()
        }
        
    def get_error_details(self, error_id: str) -> Optional[Dict[str, Any]]:
        """에러 상세 정보"""
        for errors in self.errors.values():
            for error in errors:
                if error['id'] == error_id:
                    return error
        return None
        
    def get_pattern_details(self, pattern_id: str) -> Optional[Dict[str, Any]]:
        """패턴 상세 정보"""
        pattern = self.error_patterns.get(pattern_id)
        if not pattern:
            return None
            
        # 최근 발생 에러 샘플
        recent_samples = sorted(
            self.errors[pattern_id],
            key=lambda x: x['timestamp'],
            reverse=True
        )[:5]
        
        return {
            'pattern': pattern,
            'recentSamples': recent_samples,
            'totalOccurrences': len(self.errors[pattern_id])
        }
        
    def clear_old_errors(self, days: int = 7):
        """오래된 에러 정리"""
        cutoff = datetime.now() - timedelta(days=days)
        
        for pattern_id in list(self.errors.keys()):
            self.errors[pattern_id] = [
                error for error in self.errors[pattern_id]
                if error['timestamp'] > cutoff
            ]
            
            # 빈 패턴 제거
            if not self.errors[pattern_id]:
                del self.errors[pattern_id]
                if pattern_id in self.error_patterns:
                    del self.error_patterns[pattern_id]

# 전역 인스턴스
error_tracker = ErrorTracker()

# 에러 추적 데코레이터
def track_errors(severity: str = 'error'):
    """에러 추적 데코레이터"""
    def decorator(func):
        async def async_wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                context = {
                    'function': func.__name__,
                    'args': str(args)[:200],
                    'kwargs': str(kwargs)[:200]
                }
                error_tracker.track_error(e, context, severity)
                raise
                
        def sync_wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                context = {
                    'function': func.__name__,
                    'args': str(args)[:200],
                    'kwargs': str(kwargs)[:200]
                }
                error_tracker.track_error(e, context, severity)
                raise
                
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
            
    return decorator