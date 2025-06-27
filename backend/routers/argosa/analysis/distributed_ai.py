# backend/routers/argosa/analysis/distributed_ai.py
"""분산 AI 실행 시스템"""

import asyncio
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging
from datetime import datetime
import hashlib

from .lm_studio_manager import lm_studio_manager, LMStudioInstance, TaskType, LMStudioManager
from .network_discovery import network_discovery, NetworkDevice, NetworkDiscovery
from .configs import get_distributed_settings, get_enabled_instances

logger = logging.getLogger(__name__)

@dataclass
class DistributedTask:
    """분산 작업"""
    task_id: str
    prompt: str
    model: str
    agent_type: str
    task_type: TaskType
    priority: int = 0
    assigned_instance: Optional[str] = None
    status: str = "pending"
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: datetime = None
    completed_at: Optional[datetime] = None
    retry_count: int = 0
    
    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now()

class DistributedAIExecutor:
    """분산 AI 실행기"""
    
    def __init__(
        self,
        lm_manager: LMStudioManager,
        network_discovery: NetworkDiscovery
    ):
        self.lm_manager = lm_manager
        self.network_discovery = network_discovery
        self.task_queue: asyncio.Queue = asyncio.Queue()
        self.active_tasks: Dict[str, DistributedTask] = {}
        self.completed_tasks: Dict[str, DistributedTask] = {}
        self.worker_tasks: List[asyncio.Task] = []
        self.load_balancer = LoadBalancer()
        self.performance_monitor = PerformanceMonitor()
        self._running = False
        self.initialized = False
        
    async def initialize(self, auto_discover: bool = None):
        """초기화"""
        
        # 분산 설정 로드
        dist_settings = get_distributed_settings()
        
        if auto_discover is None:
            auto_discover = dist_settings.get("auto_discover", False)
        
        # localhost 확인 (정규화된 ID 사용)
        if "localhost:1234" not in self.lm_manager.instances:
            await self.lm_manager.add_instance("localhost", 1234)
        
        # 네트워크 디스커버리 (설정된 경우, localhost 제외)
        if auto_discover:
            devices = await self.network_discovery.scan_network()
            for device in devices:
                # localhost가 아닌 경우만 추가
                if device.ip not in ["127.0.0.1", "localhost"]:
                    instance_id = f"{device.ip}:{device.port}"
                    if instance_id not in self.lm_manager.instances:
                        await self.lm_manager.add_instance(device.ip, device.port)
        
        # 모든 인스턴스 연결 테스트
        for instance in self.lm_manager.instances.values():
            if instance.enabled or instance.is_registered:
                connected = await self.lm_manager.test_connection(instance)
                if connected:
                    await self.lm_manager.get_instance_info(instance)
        
        # 워커 시작
        if dist_settings.get("enabled", True):
            await self.start_workers()
        
        self._running = True
        self.initialized = True
        
        # 성능 모니터링 시작
        asyncio.create_task(self.performance_monitor.start_monitoring(self))
        
        logger.info("Distributed AI Executor initialized")
    
    async def start_workers(self, num_workers: int = None):
        """워커 태스크 시작"""
        
        if num_workers is None:
            # 활성화된 인스턴스 수에 따라 워커 수 결정
            enabled_count = len(self.lm_manager.get_enabled_instances())
            registered_count = len(self.lm_manager.get_registered_instances())
            active_count = max(enabled_count, registered_count)
            num_workers = max(1, min(active_count * 2, 10))  # 최소 1, 최대 10
        
        for i in range(num_workers):
            worker = asyncio.create_task(self._worker(f"worker_{i}"))
            self.worker_tasks.append(worker)
        
        logger.info(f"Started {num_workers} worker tasks")
    
    async def _worker(self, worker_id: str):
        """워커 태스크"""
        
        while self._running:
            try:
                # 작업 가져오기
                task = await asyncio.wait_for(self.task_queue.get(), timeout=1.0)
                
                logger.info(f"{worker_id}: Processing task {task.task_id}")
                
                # 재시도 로직
                max_retries = get_distributed_settings().get("max_retries", 3)
                
                while task.retry_count <= max_retries:
                    # 인스턴스 선택
                    instance = await self._select_instance_for_task(task)
                    if not instance:
                        task.status = "failed"
                        task.error = "No available instance"
                        break
                    
                    task.assigned_instance = instance.id
                    task.status = "executing"
                    
                    # 실행
                    try:
                        # 최적 설정 가져오기
                        settings = await self.lm_manager.get_optimal_settings(
                            task.task_type,
                            task.model,
                            task.agent_type,
                            {"priority": task.priority}
                        )
                        
                        settings["model"] = task.model
                        
                        # 실행
                        result = await self.lm_manager.execute_on_instance(
                            instance,
                            task.prompt,
                            settings
                        )
                        
                        task.result = result
                        task.status = "completed"
                        task.completed_at = datetime.now()
                        
                        # 로드 밸런서 업데이트
                        self.load_balancer.update_instance_load(
                            instance.id,
                            -1  # 작업 완료
                        )
                        
                        # 성능 기록
                        self.performance_monitor.record_task_completion(
                            task,
                            instance
                        )
                        
                        break  # 성공, 재시도 루프 종료
                        
                    except Exception as e:
                        logger.error(f"Task {task.task_id} failed on {instance.id}: {e}")
                        task.retry_count += 1
                        task.error = str(e)
                        
                        # 인스턴스 점수 감소
                        self.load_balancer.penalize_instance(instance.id)
                        
                        if task.retry_count <= max_retries:
                            await asyncio.sleep(2 ** task.retry_count)  # 지수 백오프
                        else:
                            task.status = "failed"
                
                # 완료 처리
                self.completed_tasks[task.task_id] = task
                if task.task_id in self.active_tasks:
                    del self.active_tasks[task.task_id]
                
            except asyncio.TimeoutError:
                continue  # 큐에서 대기 타임아웃, 계속 진행
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"{worker_id} error: {e}")
                await asyncio.sleep(1)
    
    async def _select_instance_for_task(
        self,
        task: DistributedTask
    ) -> Optional[LMStudioInstance]:
        """작업에 적합한 인스턴스 선택"""
        
        # 분산 설정
        dist_settings = get_distributed_settings()
        selection_method = dist_settings.get("instance_selection", "performance")
        
        # 등록된 인스턴스 우선 사용
        registered = self.lm_manager.get_registered_instances()
        candidates = [
            inst for inst in registered
            if inst.status == "connected" and task.model in inst.available_models
        ]
        
        # 등록된 인스턴스가 없으면 활성화된 인스턴스 사용
        if not candidates:
            candidates = [
                inst for inst in self.lm_manager.get_enabled_instances()
                if task.model in inst.available_models
            ]
        
        if not candidates:
            return None
        
        # 선택 방법에 따라
        if selection_method == "round_robin":
            selected = self.load_balancer.select_round_robin(candidates)
        elif selection_method == "manual":
            # 우선순위가 가장 높은 인스턴스
            selected = max(candidates, key=lambda x: x.priority)
        else:  # performance (기본)
            selected = self.load_balancer.select_by_performance(
                candidates,
                task.priority,
                task.task_type
            )
        
        if selected:
            self.load_balancer.update_instance_load(selected.id, 1)
        
        return selected
    
    async def submit_task(
        self,
        prompt: str,
        model: str,
        agent_type: str,
        task_type: TaskType,
        priority: int = 0
    ) -> str:
        """작업 제출"""
        
        # 분산 실행이 비활성화된 경우 에러
        if not get_distributed_settings().get("enabled", True):
            raise Exception("Distributed execution is disabled")
        
        # 작업 ID 생성
        task_data = f"{prompt}_{model}_{datetime.now().isoformat()}"
        task_id = hashlib.md5(task_data.encode()).hexdigest()[:12]
        
        # 작업 생성
        task = DistributedTask(
            task_id=task_id,
            prompt=prompt,
            model=model,
            agent_type=agent_type,
            task_type=task_type,
            priority=priority
        )
        
        # 큐에 추가
        self.active_tasks[task_id] = task
        await self.task_queue.put(task)
        
        logger.info(f"Submitted task {task_id}")
        return task_id
    
    async def get_task_status(self, task_id: str) -> Optional[DistributedTask]:
        """작업 상태 조회"""
        
        if task_id in self.active_tasks:
            return self.active_tasks[task_id]
        elif task_id in self.completed_tasks:
            return self.completed_tasks[task_id]
        
        return None
    
    async def wait_for_task(
        self,
        task_id: str,
        timeout: float = None
    ) -> Optional[DistributedTask]:
        """작업 완료 대기"""
        
        if timeout is None:
            timeout = get_distributed_settings().get("timeout", 300)
        
        start_time = asyncio.get_event_loop().time()
        
        while asyncio.get_event_loop().time() - start_time < timeout:
            task = await self.get_task_status(task_id)
            
            if task and task.status in ["completed", "failed"]:
                return task
            
            await asyncio.sleep(0.5)
        
        return None
    
    def get_cluster_status(self) -> Dict[str, Any]:
        """클러스터 상태"""
        
        registered_instances = self.lm_manager.get_registered_instances()
        enabled_instances = self.lm_manager.get_enabled_instances()
        all_instances = list(self.lm_manager.instances.values())
        
        return {
            "enabled": get_distributed_settings().get("enabled", True),
            "total_instances": len(all_instances),
            "registered_instances": len(registered_instances),
            "enabled_instances": len(enabled_instances),
            "connected_instances": len([i for i in registered_instances if i.status == "connected"]),
            "queued_tasks": self.task_queue.qsize(),
            "active_tasks": len(self.active_tasks),
            "completed_tasks": len(self.completed_tasks),
            "workers": len(self.worker_tasks),
            "instance_details": [
                {
                    "id": inst.id,
                    "host": inst.host,
                    "is_local": inst.is_local,
                    "enabled": inst.enabled,
                    "is_registered": inst.is_registered,
                    "status": inst.status,
                    "models": inst.available_models,
                    "performance_score": inst.performance_score,
                    "current_load": inst.current_load,
                    "max_concurrent_tasks": inst.max_concurrent_tasks,
                    "priority": inst.priority,
                    "tags": inst.tags
                }
                for inst in all_instances
            ],
            "performance_metrics": self.performance_monitor.get_metrics()
        }
    
    async def shutdown(self):
        """종료"""
        self._running = False
        
        # 워커 종료
        for worker in self.worker_tasks:
            worker.cancel()
        
        await asyncio.gather(*self.worker_tasks, return_exceptions=True)
        
        logger.info("Distributed executor shutdown complete")

class LoadBalancer:
    """로드 밸런서"""
    
    def __init__(self):
        self.instance_loads: Dict[str, int] = {}
        self.instance_scores: Dict[str, float] = {}
        self.round_robin_index: Dict[str, int] = {}
        
    def select_by_performance(
        self,
        candidates: List[LMStudioInstance],
        priority: int,
        task_type: TaskType
    ) -> Optional[LMStudioInstance]:
        """성능 기반 인스턴스 선택"""
        
        if not candidates:
            return None
        
        # 점수 계산
        scored = []
        for inst in candidates:
            # 현재 부하
            load = self.instance_loads.get(inst.id, 0)
            load_factor = 1 - (load / inst.max_concurrent_tasks)
            
            # 성능 점수
            score = inst.performance_score * inst.priority * load_factor
            
            # 태스크 타입별 가중치
            if task_type == TaskType.CODE_GENERATION and "gpu" in inst.tags:
                score *= 1.5
            elif task_type == TaskType.ANALYSIS and "high-memory" in inst.tags:
                score *= 1.3
            
            # 높은 우선순위 작업은 고성능 인스턴스 선호
            if priority > 5:
                score *= inst.performance_score
            
            # 최근 실패 페널티
            penalty = self.instance_scores.get(inst.id, 1.0)
            score *= penalty
            
            scored.append((score, inst))
        
        # 최고 점수 선택
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]
    
    def select_round_robin(self, candidates: List[LMStudioInstance]) -> Optional[LMStudioInstance]:
        """라운드 로빈 선택"""
        
        if not candidates:
            return None
        
        key = ",".join(sorted([c.id for c in candidates]))
        index = self.round_robin_index.get(key, 0)
        
        selected = candidates[index % len(candidates)]
        self.round_robin_index[key] = index + 1
        
        return selected
    
    def update_instance_load(self, instance_id: str, delta: int):
        """인스턴스 부하 업데이트"""
        current = self.instance_loads.get(instance_id, 0)
        self.instance_loads[instance_id] = max(0, current + delta)
    
    def penalize_instance(self, instance_id: str):
        """인스턴스 페널티 부여"""
        current = self.instance_scores.get(instance_id, 1.0)
        self.instance_scores[instance_id] = max(0.1, current * 0.9)
    
    def reward_instance(self, instance_id: str):
        """인스턴스 보상"""
        current = self.instance_scores.get(instance_id, 1.0)
        self.instance_scores[instance_id] = min(1.0, current * 1.1)

class PerformanceMonitor:
    """성능 모니터"""
    
    def __init__(self):
        self.task_metrics: List[Dict[str, Any]] = []
        self.instance_metrics: Dict[str, List[Dict[str, Any]]] = {}
        
    async def start_monitoring(self, executor: DistributedAIExecutor):
        """모니터링 시작"""
        
        while executor._running:
            # 인스턴스 상태 체크
            for instance in executor.lm_manager.instances.values():
                if (instance.enabled or instance.is_registered) and instance.status == "connected":
                    # 연결 상태 재확인
                    connected = await executor.lm_manager.test_connection(instance)
                    if not connected:
                        logger.warning(f"Instance {instance.id} lost connection")
            
            # 30초마다
            await asyncio.sleep(30)
    
    def record_task_completion(self, task: DistributedTask, instance: LMStudioInstance):
        """작업 완료 기록"""
        
        if task.completed_at and task.created_at:
            elapsed = (task.completed_at - task.created_at).total_seconds()
            
            metric = {
                "task_id": task.task_id,
                "instance_id": instance.id,
                "model": task.model,
                "task_type": task.task_type.value,
                "elapsed_time": elapsed,
                "success": task.status == "completed",
                "timestamp": datetime.now().isoformat()
            }
            
            self.task_metrics.append(metric)
            
            # 인스턴스별 메트릭
            if instance.id not in self.instance_metrics:
                self.instance_metrics[instance.id] = []
            
            self.instance_metrics[instance.id].append(metric)
            
            # 최근 1000개만 유지
            self.task_metrics = self.task_metrics[-1000:]
            self.instance_metrics[instance.id] = self.instance_metrics[instance.id][-100:]
    
    def get_metrics(self) -> Dict[str, Any]:
        """메트릭 조회"""
        
        # 전체 통계
        total_tasks = len(self.task_metrics)
        successful_tasks = len([m for m in self.task_metrics if m["success"]])
        
        avg_time = 0
        if total_tasks > 0:
            avg_time = sum(m["elapsed_time"] for m in self.task_metrics) / total_tasks
        
        # 인스턴스별 통계
        instance_stats = {}
        for instance_id, metrics in self.instance_metrics.items():
            if metrics:
                success_count = len([m for m in metrics if m["success"]])
                instance_stats[instance_id] = {
                    "total_tasks": len(metrics),
                    "success_rate": success_count / len(metrics),
                    "avg_time": sum(m["elapsed_time"] for m in metrics) / len(metrics)
                }
        
        return {
            "total_tasks": total_tasks,
            "success_rate": successful_tasks / total_tasks if total_tasks > 0 else 0,
            "avg_completion_time": avg_time,
            "instance_stats": instance_stats
        }

# 전역 인스턴스
distributed_executor = DistributedAIExecutor(
    lm_studio_manager,
    network_discovery
)