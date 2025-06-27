# backend/routers/argosa/shared/metrics.py
"""시스템 메트릭 수집"""

import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
from collections import defaultdict, deque
import psutil
import logging

logger = logging.getLogger(__name__)

class MetricsCollector:
    """시스템 메트릭 수집기"""
    
    def __init__(self):
        self.metrics: Dict[str, deque] = defaultdict(lambda: deque(maxlen=1000))
        self.counters: Dict[str, int] = defaultdict(int)
        self.gauges: Dict[str, float] = {}
        self._lock = asyncio.Lock()
        self._collection_task: Optional[asyncio.Task] = None
    
    async def initialize(self):
        """메트릭 수집 시작"""
        self._collection_task = asyncio.create_task(self._collect_system_metrics())
        logger.info("Metrics collector initialized")
    
    async def shutdown(self):
        """메트릭 수집 종료"""
        if self._collection_task:
            self._collection_task.cancel()
            try:
                await self._collection_task
            except asyncio.CancelledError:
                pass
    
    async def record_event(self, event_type: str, value: float = 1.0, 
                          tags: Optional[Dict[str, str]] = None):
        """이벤트 기록"""
        async with self._lock:
            metric_name = f"{event_type}"
            if tags:
                tag_str = ",".join(f"{k}={v}" for k, v in tags.items())
                metric_name = f"{event_type},{tag_str}"
            
            self.metrics[metric_name].append({
                'timestamp': datetime.now(timezone.utc),
                'value': value
            })
    
    async def increment_counter(self, counter_name: str, value: int = 1):
        """카운터 증가"""
        async with self._lock:
            self.counters[counter_name] += value
    
    async def set_gauge(self, gauge_name: str, value: float):
        """게이지 설정"""
        async with self._lock:
            self.gauges[gauge_name] = value
    
    async def _collect_system_metrics(self):
        """시스템 메트릭 주기적 수집"""
        while True:
            try:
                # CPU 사용률
                cpu_percent = psutil.cpu_percent(interval=1)
                await self.set_gauge("system.cpu_percent", cpu_percent)
                
                # 메모리 사용률
                memory = psutil.virtual_memory()
                await self.set_gauge("system.memory_percent", memory.percent)
                await self.set_gauge("system.memory_available_mb", memory.available / 1024 / 1024)
                
                # 디스크 사용률
                disk = psutil.disk_usage('/')
                await self.set_gauge("system.disk_percent", disk.percent)
                
                # 프로세스 정보
                process = psutil.Process()
                await self.set_gauge("process.cpu_percent", process.cpu_percent())
                await self.set_gauge("process.memory_mb", process.memory_info().rss / 1024 / 1024)
                await self.set_gauge("process.threads", process.num_threads())
                
                await asyncio.sleep(60)  # 1분마다
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Failed to collect system metrics: {e}")
                await asyncio.sleep(60)
    
    async def get_metrics_summary(self, time_window_minutes: int = 60) -> Dict[str, Any]:
        """메트릭 요약"""
        async with self._lock:
            cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=time_window_minutes)
            
            summary = {
                'counters': dict(self.counters),
                'gauges': dict(self.gauges),
                'events': {}
            }
            
            # 이벤트 메트릭 요약
            for metric_name, values in self.metrics.items():
                recent_values = [
                    v['value'] for v in values 
                    if v['timestamp'] > cutoff_time
                ]
                
                if recent_values:
                    summary['events'][metric_name] = {
                        'count': len(recent_values),
                        'sum': sum(recent_values),
                        'avg': sum(recent_values) / len(recent_values),
                        'min': min(recent_values),
                        'max': max(recent_values)
                    }
            
            return summary
    
    async def get_time_series(self, metric_name: str, 
                            time_window_minutes: int = 60) -> List[Dict[str, Any]]:
        """시계열 데이터 반환"""
        async with self._lock:
            if metric_name not in self.metrics:
                return []
            
            cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=time_window_minutes)
            
            return [
                {
                    'timestamp': v['timestamp'].isoformat(),
                    'value': v['value']
                }
                for v in self.metrics[metric_name]
                if v['timestamp'] > cutoff_time
            ]

# 싱글톤 인스턴스
metrics = MetricsCollector()