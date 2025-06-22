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
        
    async def initialize(self, auto_discover: bool = True):
        """초기화"""
        
        # 로컬 인스턴스 추가
        await self.lm_manager.add_instance("localhost", 1234)
        
        # 네트워크 디스커버리
        if auto_discover:
            devices = await self.network_discovery.scan_network()
            for device in devices:
                await self.lm_manager.add_instance(device.ip, device.port)
        
        # 워커 시작
        await self.start_workers()
    
    async def start_workers(self, num_workers: int = 3):
        """워커 태스크 시작"""
        
        for i in range(num_workers):
            worker = asyncio.create_task(self._worker(f"worker_{i}"))
            self.worker_tasks.append(worker)
        
        logger.info(f"Started {num_workers} worker tasks")
    
    async def _worker(self, worker_id: str):
        """워커 태스크"""
        
        while True:
            try:
                # 작업 가져오기
                task = await self.task_queue.get()
                
                logger.info(f"{worker_id}: Processing task {task.task_id}")
                
                # 인스턴스 선택
                instance = await self._select_instance_for_task(task)
                if not instance:
                    task.status = "failed"
                    task.error = "No available instance"
                    self.completed_tasks[task.task_id] = task
                    continue
                
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
                    
                except Exception as e:
                    logger.error(f"Task {task.task_id} failed: {e}")
                    task.status = "failed"
                    task.error = str(e)
                
                # 완료 처리
                self.completed_tasks[task.task_id] = task
                del self.active_tasks[task.task_id]
                
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
        
        # 모델을 가진 인스턴스들
        candidates = [
            inst for inst in self.lm_manager.instances.values()
            if inst.status == "connected" and 
            task.model in inst.available_models
        ]
        
        if not candidates:
            return None
        
        # 로드 밸런싱
        selected = self.load_balancer.select_instance(
            candidates,
            task.priority
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
        timeout: float = 300
    ) -> Optional[DistributedTask]:
        """작업 완료 대기"""
        
        start_time = asyncio.get_event_loop().time()
        
        while asyncio.get_event_loop().time() - start_time < timeout:
            task = await self.get_task_status(task_id)
            
            if task and task.status in ["completed", "failed"]:
                return task
            
            await asyncio.sleep(0.5)
        
        return None
    
    def get_cluster_status(self) -> Dict[str, Any]:
        """클러스터 상태"""
        
        active_instances = [
            inst for inst in self.lm_manager.instances.values()
            if inst.status == "connected"
        ]
        
        return {
            "total_instances": len(self.lm_manager.instances),
            "active_instances": len(active_instances),
            "queued_tasks": self.task_queue.qsize(),
            "active_tasks": len(self.active_tasks),
            "completed_tasks": len(self.completed_tasks),
            "instance_details": [
                {
                    "id": inst.id,
                    "host": inst.host,
                    "models": inst.available_models,
                    "performance_score": inst.performance_score,
                    "current_load": self.load_balancer.get_instance_load(inst.id)
                }
                for inst in active_instances
            ]
        }

class LoadBalancer:
    """로드 밸런서"""
    
    def __init__(self):
        self.instance_loads: Dict[str, int] = {}
        self.instance_history: Dict[str, List[float]] = {}
        
    def select_instance(
        self,
        candidates: List[LMStudioInstance],
        priority: int
    ) -> Optional[LMStudioInstance]:
        """인스턴스 선택"""
        
        if not candidates:
            return None
        
        # 점수 계산
        scored = []
        for inst in candidates:
            # 현재 부하
            load = self.instance_loads.get(inst.id, 0)
            
            # 성능 점수와 부하를 고려
            score = inst.performance_score / (1 + load)
            
            # 높은 우선순위 작업은 고성능 인스턴스 선호
            if priority > 5:
                score *= inst.performance_score
            
            scored.append((score, inst))
        
        # 최고 점수 선택
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]
    
    def update_instance_load(self, instance_id: str, delta: int):
        """인스턴스 부하 업데이트"""
        current = self.instance_loads.get(instance_id, 0)
        self.instance_loads[instance_id] = max(0, current + delta)
    
    def get_instance_load(self, instance_id: str) -> int:
        """인스턴스 부하 조회"""
        return self.instance_loads.get(instance_id, 0)

# 전역 인스턴스
distributed_executor = DistributedAIExecutor(
    lm_studio_manager,
    network_discovery
)