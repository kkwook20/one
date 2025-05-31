# backend/app/services/monitoring.py

import asyncio
import psutil
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from collections import defaultdict, deque
import json

from app.models import WorkflowExecution, NodeExecution, ExecutionStatus
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class SystemMetrics:
    """시스템 메트릭 수집"""
    
    def __init__(self):
        self.cpu_history = deque(maxlen=60)  # 1분 기록
        self.memory_history = deque(maxlen=60)
        self.disk_history = deque(maxlen=60)
        self.network_history = deque(maxlen=60)
        
    async def collect(self) -> Dict[str, Any]:
        """시스템 메트릭 수집"""
        # CPU 사용률
        cpu_percent = psutil.cpu_percent(interval=1)
        cpu_count = psutil.cpu_count()
        
        # 메모리 사용률
        memory = psutil.virtual_memory()
        
        # 디스크 사용률
        disk = psutil.disk_usage('/')
        
        # 네트워크 I/O
        net_io = psutil.net_io_counters()
        
        timestamp = datetime.now()
        
        # 히스토리 업데이트
        self.cpu_history.append((timestamp, cpu_percent))
        self.memory_history.append((timestamp, memory.percent))
        self.disk_history.append((timestamp, disk.percent))
        self.network_history.append((timestamp, {
            'sent': net_io.bytes_sent,
            'recv': net_io.bytes_recv
        }))
        
        return {
            'timestamp': timestamp.isoformat(),
            'cpu': {
                'percent': cpu_percent,
                'count': cpu_count,
                'perCore': psutil.cpu_percent(percpu=True)
            },
            'memory': {
                'total': memory.total,
                'available': memory.available,
                'used': memory.used,
                'percent': memory.percent
            },
            'disk': {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent
            },
            'network': {
                'bytesSent': net_io.bytes_sent,
                'bytesRecv': net_io.bytes_recv,
                'packetsSent': net_io.packets_sent,
                'packetsRecv': net_io.packets_recv
            }
        }
    
    def get_history(self, metric: str, duration: int = 60) -> List[Dict[str, Any]]:
        """메트릭 히스토리 조회"""
        history_map = {
            'cpu': self.cpu_history,
            'memory': self.memory_history,
            'disk': self.disk_history,
            'network': self.network_history
        }
        
        history = history_map.get(metric)
        if not history:
            return []
        
        # 지정된 기간의 데이터만 반환
        cutoff = datetime.now() - timedelta(seconds=duration)
        
        if metric == 'network':
            return [
                {
                    'timestamp': ts.isoformat(),
                    'value': data
                }
                for ts, data in history
                if ts > cutoff
            ]
        else:
            return [
                {
                    'timestamp': ts.isoformat(),
                    'value': value
                }
                for ts, value in history
                if ts > cutoff
            ]

class WorkflowMetrics:
    """워크플로우 메트릭 수집"""
    
    def __init__(self):
        self.execution_count = defaultdict(int)  # 워크플로우별 실행 횟수
        self.success_count = defaultdict(int)    # 성공 횟수
        self.failure_count = defaultdict(int)    # 실패 횟수
        self.total_duration = defaultdict(float) # 총 실행 시간
        
        self.node_execution_count = defaultdict(int)
        self.node_success_count = defaultdict(int)
        self.node_failure_count = defaultdict(int)
        self.node_total_duration = defaultdict(float)
        
        self.active_executions: Dict[str, WorkflowExecution] = {}
        self.recent_executions = deque(maxlen=100)
        
    def record_execution_start(self, execution: WorkflowExecution):
        """실행 시작 기록"""
        self.active_executions[execution.id] = execution
        self.execution_count[execution.workflow_id] += 1
        
    def record_execution_end(self, execution: WorkflowExecution):
        """실행 종료 기록"""
        if execution.id in self.active_executions:
            del self.active_executions[execution.id]
            
        self.recent_executions.append(execution)
        
        # 성공/실패 카운트
        if execution.status == ExecutionStatus.SUCCESS:
            self.success_count[execution.workflow_id] += 1
        else:
            self.failure_count[execution.workflow_id] += 1
            
        # 실행 시간 계산
        if execution.started_at and execution.completed_at:
            duration = (execution.completed_at - execution.started_at).total_seconds()
            self.total_duration[execution.workflow_id] += duration
            
    def record_node_execution(self, node_execution: NodeExecution):
        """노드 실행 기록"""
        self.node_execution_count[node_execution.node_id] += 1
        
        if node_execution.status == 'success':
            self.node_success_count[node_execution.node_id] += 1
        else:
            self.node_failure_count[node_execution.node_id] += 1
            
        # 실행 시간
        if node_execution.started_at and node_execution.completed_at:
            duration = (node_execution.completed_at - node_execution.started_at).total_seconds()
            self.node_total_duration[node_execution.node_id] += duration
            
    def get_workflow_stats(self) -> Dict[str, Any]:
        """워크플로우 통계"""
        stats = []
        
        for workflow_id in self.execution_count:
            total = self.execution_count[workflow_id]
            success = self.success_count[workflow_id]
            failure = self.failure_count[workflow_id]
            
            avg_duration = 0
            if total > 0:
                avg_duration = self.total_duration[workflow_id] / total
                
            stats.append({
                'workflowId': workflow_id,
                'totalExecutions': total,
                'successCount': success,
                'failureCount': failure,
                'successRate': (success / total * 100) if total > 0 else 0,
                'avgDuration': avg_duration
            })
            
        return {
            'workflows': stats,
            'totalActive': len(self.active_executions),
            'recentExecutions': [
                {
                    'id': ex.id,
                    'workflowId': ex.workflow_id,
                    'status': ex.status,
                    'startedAt': ex.started_at.isoformat() if ex.started_at else None,
                    'duration': (
                        (ex.completed_at - ex.started_at).total_seconds()
                        if ex.started_at and ex.completed_at else None
                    )
                }
                for ex in list(self.recent_executions)[-10:]
            ]
        }
        
    def get_node_stats(self) -> List[Dict[str, Any]]:
        """노드 통계"""
        stats = []
        
        for node_id in self.node_execution_count:
            total = self.node_execution_count[node_id]
            success = self.node_success_count[node_id]
            failure = self.node_failure_count[node_id]
            
            avg_duration = 0
            if total > 0:
                avg_duration = self.node_total_duration[node_id] / total
                
            stats.append({
                'nodeId': node_id,
                'totalExecutions': total,
                'successCount': success,
                'failureCount': failure,
                'successRate': (success / total * 100) if total > 0 else 0,
                'avgDuration': avg_duration
            })
            
        return sorted(stats, key=lambda x: x['totalExecutions'], reverse=True)

class MonitoringService:
    """모니터링 서비스"""
    
    def __init__(self):
        self.system_metrics = SystemMetrics()
        self.workflow_metrics = WorkflowMetrics()
        self.is_running = False
        self.collect_task = None
        
        # 실시간 데이터 스트림
        self.subscribers: Dict[str, List[asyncio.Queue]] = {
            'system': [],
            'workflow': [],
            'all': []
        }
        
    async def start(self):
        """모니터링 시작"""
        if not self.is_running:
            self.is_running = True
            self.collect_task = asyncio.create_task(self._collect_loop())
            logger.info("Monitoring service started")
            
    async def stop(self):
        """모니터링 중지"""
        self.is_running = False
        if self.collect_task:
            self.collect_task.cancel()
            try:
                await self.collect_task
            except asyncio.CancelledError:
                pass
        logger.info("Monitoring service stopped")
        
    async def _collect_loop(self):
        """메트릭 수집 루프"""
        while self.is_running:
            try:
                # 시스템 메트릭 수집
                system_data = await self.system_metrics.collect()
                await self._broadcast('system', {
                    'type': 'system_metrics',
                    'data': system_data
                })
                
                # 워크플로우 메트릭 브로드캐스트
                workflow_data = self.workflow_metrics.get_workflow_stats()
                await self._broadcast('workflow', {
                    'type': 'workflow_metrics',
                    'data': workflow_data
                })
                
                await asyncio.sleep(1)  # 1초마다 수집
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(5)
                
    async def subscribe(self, channel: str = 'all') -> asyncio.Queue:
        """메트릭 스트림 구독"""
        queue = asyncio.Queue(maxsize=100)
        
        if channel not in self.subscribers:
            self.subscribers[channel] = []
            
        self.subscribers[channel].append(queue)
        return queue
        
    async def unsubscribe(self, queue: asyncio.Queue, channel: str = 'all'):
        """구독 해제"""
        if channel in self.subscribers:
            self.subscribers[channel].remove(queue)
            
    async def _broadcast(self, channel: str, data: Dict[str, Any]):
        """구독자에게 데이터 브로드캐스트"""
        # 채널별 구독자
        for queue in self.subscribers.get(channel, []):
            try:
                await queue.put(data)
            except asyncio.QueueFull:
                # 큐가 가득 찬 경우 오래된 데이터 제거
                try:
                    queue.get_nowait()
                    await queue.put(data)
                except:
                    pass
                    
        # 전체 구독자
        for queue in self.subscribers.get('all', []):
            try:
                await queue.put(data)
            except asyncio.QueueFull:
                try:
                    queue.get_nowait()
                    await queue.put(data)
                except:
                    pass
                    
    def get_dashboard_data(self) -> Dict[str, Any]:
        """대시보드 데이터 조회"""
        return {
            'system': {
                'current': self.system_metrics.collect(),
                'history': {
                    'cpu': self.system_metrics.get_history('cpu'),
                    'memory': self.system_metrics.get_history('memory'),
                    'disk': self.system_metrics.get_history('disk'),
                    'network': self.system_metrics.get_history('network')
                }
            },
            'workflows': self.workflow_metrics.get_workflow_stats(),
            'nodes': self.workflow_metrics.get_node_stats(),
            'timestamp': datetime.now().isoformat()
        }

# 싱글톤 인스턴스
monitoring_service = MonitoringService()