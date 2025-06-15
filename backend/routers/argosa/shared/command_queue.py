# backend/routers/argosa/shared/command_queue.py
"""개선된 중앙 명령 큐 시스템"""

import asyncio
import json
import uuid
from typing import Dict, Any, Optional, List, Callable, Awaitable
from datetime import datetime, timezone, timedelta
from enum import IntEnum
from pathlib import Path
import logging
from dataclasses import dataclass, asdict
import heapq

logger = logging.getLogger(__name__)

class CommandPriority(IntEnum):
    """명령 우선순위"""
    LOW = 0
    NORMAL = 1
    HIGH = 2
    URGENT = 3
    CRITICAL = 4

class CommandStatus:
    """명령 상태"""
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"

@dataclass
class Command:
    """명령 데이터 클래스"""
    id: str
    type: str
    priority: CommandPriority
    data: Dict[str, Any]
    created_at: datetime
    status: str = CommandStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    timeout_seconds: int = 60
    
    def __lt__(self, other):
        """우선순위 비교 (힙 정렬용)"""
        # 우선순위가 높을수록, 생성시간이 빠를수록 앞에 위치
        return (-self.priority, self.created_at) < (-other.priority, other.created_at)

class ImprovedCommandQueue:
    """개선된 명령 큐"""
    
    def __init__(self):
        self._queue: List[Command] = []  # 힙 큐
        self._processing: Dict[str, Command] = {}  # 처리 중인 명령
        self._completed: Dict[str, Command] = {}  # 완료된 명령 (제한된 수만 유지)
        self._handlers: Dict[str, Callable[[Command], Awaitable[Dict[str, Any]]]] = {}
        self._futures: Dict[str, asyncio.Future] = {}  # 응답 대기용
        self._lock = asyncio.Lock()
        self._worker_task: Optional[asyncio.Task] = None
        self._persistence_file = Path("./data/argosa/command_queue.json")
        self._stats = {
            "total_queued": 0,
            "total_processed": 0,
            "total_failed": 0,
            "total_timeout": 0,
            "processing_times": []
        }
    
    async def initialize(self):
        """큐 초기화 및 워커 시작"""
        await self._load_state()
        self._worker_task = asyncio.create_task(self._worker_loop())
        logger.info("Command queue initialized")
    
    async def shutdown(self):
        """큐 종료"""
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        
        await self._save_state()
        logger.info("Command queue shutdown")
    
    def register_handler(self, command_type: str, 
                        handler: Callable[[Command], Awaitable[Dict[str, Any]]]):
        """명령 핸들러 등록"""
        self._handlers[command_type] = handler
        logger.info(f"Registered handler for command type: {command_type}")
    
    async def enqueue(
        self,
        command_type: str,
        data: Dict[str, Any],
        priority: CommandPriority = CommandPriority.NORMAL,
        timeout_seconds: int = 60,
        max_retries: int = 3
    ) -> str:
        """명령 큐에 추가"""
        command = Command(
            id=str(uuid.uuid4()),
            type=command_type,
            priority=priority,
            data=data,
            created_at=datetime.now(timezone.utc),
            timeout_seconds=timeout_seconds,
            max_retries=max_retries
        )
        
        async with self._lock:
            command.status = CommandStatus.QUEUED
            heapq.heappush(self._queue, command)
            self._stats["total_queued"] += 1
            
            # Future 생성 (응답 대기용)
            future = asyncio.Future()
            self._futures[command.id] = future
        
        # 상태 저장
        asyncio.create_task(self._save_state())
        
        logger.info(f"Enqueued command {command.id} of type {command_type} with priority {priority}")
        return command.id
    
    async def wait_for_result(self, command_id: str, timeout: Optional[int] = None) -> Dict[str, Any]:
        """명령 결과 대기"""
        future = self._futures.get(command_id)
        if not future:
            # 이미 완료된 명령 확인
            if command_id in self._completed:
                cmd = self._completed[command_id]
                if cmd.status == CommandStatus.COMPLETED:
                    return cmd.result or {}
                else:
                    raise Exception(f"Command failed: {cmd.error}")
            
            raise ValueError(f"Command {command_id} not found")
        
        try:
            result = await asyncio.wait_for(future, timeout=timeout)
            return result
        except asyncio.TimeoutError:
            raise TimeoutError(f"Command {command_id} timed out")
        finally:
            # Future 정리
            self._futures.pop(command_id, None)
    
    async def get_status(self, command_id: str) -> Optional[Dict[str, Any]]:
        """명령 상태 조회"""
        async with self._lock:
            # 처리 중인 명령 확인
            if command_id in self._processing:
                cmd = self._processing[command_id]
                return self._command_to_dict(cmd)
            
            # 완료된 명령 확인
            if command_id in self._completed:
                cmd = self._completed[command_id]
                return self._command_to_dict(cmd)
            
            # 큐에서 확인
            for cmd in self._queue:
                if cmd.id == command_id:
                    return self._command_to_dict(cmd)
        
        return None
    
    async def cancel(self, command_id: str) -> bool:
        """명령 취소"""
        async with self._lock:
            # 큐에서 제거
            for i, cmd in enumerate(self._queue):
                if cmd.id == command_id:
                    self._queue.pop(i)
                    heapq.heapify(self._queue)
                    
                    cmd.status = CommandStatus.CANCELLED
                    cmd.completed_at = datetime.now(timezone.utc)
                    self._completed[cmd.id] = cmd
                    
                    # Future 취소
                    future = self._futures.pop(command_id, None)
                    if future and not future.done():
                        future.cancel()
                    
                    logger.info(f"Cancelled command {command_id}")
                    return True
            
            # 처리 중인 명령은 취소할 수 없음
            if command_id in self._processing:
                logger.warning(f"Cannot cancel processing command {command_id}")
                return False
        
        return False
    
    async def get_pending_commands(self, limit: int = 10) -> List[Dict[str, Any]]:
        """대기 중인 명령 목록"""
        async with self._lock:
            # 우선순위 순으로 정렬된 명령들
            sorted_commands = sorted(self._queue)[:limit]
            return [self._command_to_dict(cmd) for cmd in sorted_commands]
    
    async def _worker_loop(self):
        """명령 처리 워커"""
        while True:
            try:
                # 다음 명령 가져오기
                command = await self._get_next_command()
                if not command:
                    await asyncio.sleep(0.1)  # 큐가 비어있으면 대기
                    continue
                
                # 명령 처리
                await self._process_command(command)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker loop error: {e}", exc_info=True)
                await asyncio.sleep(1)
    
    async def _get_next_command(self) -> Optional[Command]:
        """다음 처리할 명령 가져오기"""
        async with self._lock:
            if not self._queue:
                return None
            
            # 타임아웃된 명령 정리
            now = datetime.now(timezone.utc)
            for cmd_id, cmd in list(self._processing.items()):
                if cmd.started_at:
                    elapsed = (now - cmd.started_at).total_seconds()
                    if elapsed > cmd.timeout_seconds:
                        # 타임아웃 처리
                        cmd.status = CommandStatus.TIMEOUT
                        cmd.completed_at = now
                        cmd.error = f"Command timed out after {elapsed:.1f} seconds"
                        
                        self._completed[cmd_id] = cmd
                        del self._processing[cmd_id]
                        self._stats["total_timeout"] += 1
                        
                        # Future 처리
                        future = self._futures.pop(cmd_id, None)
                        if future and not future.done():
                            future.set_exception(TimeoutError(cmd.error))
                        
                        logger.error(f"Command {cmd_id} timed out")
            
            # 다음 명령 가져오기
            if self._queue:
                command = heapq.heappop(self._queue)
                command.status = CommandStatus.PROCESSING
                command.started_at = datetime.now(timezone.utc)
                self._processing[command.id] = command
                return command
        
        return None
    
    async def _process_command(self, command: Command):
        """명령 처리"""
        logger.info(f"Processing command {command.id} of type {command.type}")
        
        try:
            # 핸들러 찾기
            handler = self._handlers.get(command.type)
            if not handler:
                raise ValueError(f"No handler registered for command type: {command.type}")
            
            # 타임아웃과 함께 실행
            result = await asyncio.wait_for(
                handler(command),
                timeout=command.timeout_seconds
            )
            
            # 성공 처리
            async with self._lock:
                command.status = CommandStatus.COMPLETED
                command.completed_at = datetime.now(timezone.utc)
                command.result = result
                
                # 처리 시간 기록
                processing_time = (command.completed_at - command.started_at).total_seconds()
                self._stats["processing_times"].append(processing_time)
                if len(self._stats["processing_times"]) > 100:
                    self._stats["processing_times"] = self._stats["processing_times"][-100:]
                
                self._stats["total_processed"] += 1
                
                # 완료 목록으로 이동
                del self._processing[command.id]
                self._completed[command.id] = command
                
                # 완료 목록 크기 제한
                if len(self._completed) > 1000:
                    oldest_id = min(self._completed.keys(), 
                                  key=lambda k: self._completed[k].completed_at)
                    del self._completed[oldest_id]
            
            # Future 완료
            future = self._futures.pop(command.id, None)
            if future and not future.done():
                future.set_result(result)
            
            logger.info(f"Command {command.id} completed successfully in {processing_time:.2f}s")
            
        except asyncio.TimeoutError:
            await self._handle_command_failure(
                command, 
                f"Command timed out after {command.timeout_seconds} seconds"
            )
            
        except Exception as e:
            await self._handle_command_failure(command, str(e))
    
    async def _handle_command_failure(self, command: Command, error: str):
        """명령 실패 처리"""
        logger.error(f"Command {command.id} failed: {error}")
        
        async with self._lock:
            command.error = error
            command.retry_count += 1
            
            if command.retry_count < command.max_retries:
                # 재시도
                command.status = CommandStatus.QUEUED
                command.started_at = None
                
                # 낮은 우선순위로 다시 큐에 추가
                new_priority = max(CommandPriority.LOW, command.priority - 1)
                command.priority = new_priority
                
                heapq.heappush(self._queue, command)
                del self._processing[command.id]
                
                logger.info(f"Retrying command {command.id} (attempt {command.retry_count + 1}/{command.max_retries})")
                
            else:
                # 최종 실패
                command.status = CommandStatus.FAILED
                command.completed_at = datetime.now(timezone.utc)
                
                self._stats["total_failed"] += 1
                
                del self._processing[command.id]
                self._completed[command.id] = command
                
                # Future 실패
                future = self._futures.pop(command.id, None)
                if future and not future.done():
                    future.set_exception(Exception(error))
    
    def _command_to_dict(self, command: Command) -> Dict[str, Any]:
        """Command를 딕셔너리로 변환"""
        data = asdict(command)
        # datetime 객체 변환
        for key in ['created_at', 'started_at', 'completed_at']:
            if data[key]:
                data[key] = data[key].isoformat()
        return data
    
    async def _save_state(self):
        """상태 저장"""
        try:
            state = {
                'queue': [self._command_to_dict(cmd) for cmd in self._queue],
                'processing': {k: self._command_to_dict(v) for k, v in self._processing.items()},
                'stats': self._stats,
                'saved_at': datetime.now(timezone.utc).isoformat()
            }
            
            self._persistence_file.parent.mkdir(parents=True, exist_ok=True)
            
            # 임시 파일에 저장 후 원자적 교체
            temp_file = self._persistence_file.with_suffix('.tmp')
            with open(temp_file, 'w') as f:
                json.dump(state, f, indent=2)
            
            temp_file.replace(self._persistence_file)
            
        except Exception as e:
            logger.error(f"Failed to save command queue state: {e}")
    
    async def _load_state(self):
        """상태 로드"""
        try:
            if self._persistence_file.exists():
                with open(self._persistence_file, 'r') as f:
                    state = json.load(f)
                
                # 큐 복원 (PENDING/QUEUED 상태만)
                for cmd_data in state.get('queue', []):
                    if cmd_data['status'] in [CommandStatus.PENDING, CommandStatus.QUEUED]:
                        cmd = self._dict_to_command(cmd_data)
                        heapq.heappush(self._queue, cmd)
                
                # 통계 복원
                self._stats.update(state.get('stats', {}))
                
                logger.info(f"Loaded {len(self._queue)} pending commands from state")
                
        except Exception as e:
            logger.error(f"Failed to load command queue state: {e}")
    
    def _dict_to_command(self, data: Dict[str, Any]) -> Command:
        """딕셔너리를 Command로 변환"""
        # datetime 문자열 변환
        for key in ['created_at', 'started_at', 'completed_at']:
            if data.get(key):
                data[key] = datetime.fromisoformat(data[key])
        
        # priority를 CommandPriority로 변환
        data['priority'] = CommandPriority(data['priority'])
        
        return Command(**data)
    
    async def get_stats(self) -> Dict[str, Any]:
        """큐 통계 반환"""
        async with self._lock:
            avg_processing_time = 0
            if self._stats["processing_times"]:
                avg_processing_time = sum(self._stats["processing_times"]) / len(self._stats["processing_times"])
            
            return {
                "queue_size": len(self._queue),
                "processing_count": len(self._processing),
                "completed_count": len(self._completed),
                "total_queued": self._stats["total_queued"],
                "total_processed": self._stats["total_processed"],
                "total_failed": self._stats["total_failed"],
                "total_timeout": self._stats["total_timeout"],
                "avg_processing_time": round(avg_processing_time, 2),
                "handlers_registered": list(self._handlers.keys())
            }

# 싱글톤 인스턴스
command_queue = ImprovedCommandQueue()

# =======================================================

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