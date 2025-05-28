import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional
import heapq
from dataclasses import dataclass, field

@dataclass
class ScheduledTask:
    """스케줄된 작업"""
    id: str
    node_id: str
    task_name: str
    estimated_time: int  # minutes
    actual_time: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    dependencies: List[str] = field(default_factory=list)
    priority: int = 50
    status: str = 'scheduled'
    
    def __lt__(self, other):
        # 우선순위가 높을수록 먼저 실행
        return self.priority > other.priority

class SchedulerNode:
    """Scheduler 노드 - 작업 스케줄링 및 시간 관리"""
    
    def __init__(self):
        self.config_dir = Path("config/nodes")
        self.data_dir = Path("data/scheduler")
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # 작업 큐
        self.task_queue: List[ScheduledTask] = []
        self.running_tasks: Dict[str, ScheduledTask] = {}
        self.completed_tasks: List[ScheduledTask] = []
    
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Scheduler 노드 실행"""
        try:
            # 설정 로드
            config = await self.load_config(node_id)
            
            # 현재 실행 상태 로드
            await self.load_execution_state(node_id)
            
            # 새로운 작업 추가
            new_tasks = data.get('newTasks', [])
            for task_data in new_tasks:
                task = await self.create_scheduled_task(task_data)
                heapq.heappush(self.task_queue, task)
            
            # 스케줄 최적화
            optimized_schedule = await self.optimize_schedule()
            
            # 타임라인 생성
            timeline = await self.generate_timeline(optimized_schedule)
            
            # 대량 작업 분석
            batch_operations = await self.analyze_batch_operations()
            
            # 지연 작업 확인
            delayed_tasks = await self.check_delayed_tasks()
            
            # 결과 준비
            result = {
                "scheduledTasks": [self._task_to_dict(t) for t in optimized_schedule],
                "timeline": timeline,
                "batchOperations": batch_operations,
                "delayedTasks": delayed_tasks,
                "totalEstimatedTime": sum(t.estimated_time for t in optimized_schedule),
                "runningTasksCount": len(self.running_tasks),
                "completedTasksCount": len(self.completed_tasks),
                "timestamp": datetime.now().isoformat()
            }
            
            # 상태 저장
            await self.save_execution_state(node_id)
            await self.save_results(node_id, result)
            
            return {
                "status": "success",
                "result": result
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    async def load_config(self, node_id: str) -> Dict[str, Any]:
        """노드 설정 로드"""
        config_path = self.config_dir / f"{node_id}.json"
        
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return {
            "maxConcurrentTasks": 5,
            "schedulingAlgorithm": "priority_fcfs",  # Priority + First Come First Served
            "timeBuffer": 1.2,  # 20% 시간 버퍼
            "workHours": {
                "start": "09:00",
                "end": "18:00"
            },
            "batchThreshold": 10  # 대량 작업 임계값
        }
    
    async def create_scheduled_task(self, task_data: Dict[str, Any]) -> ScheduledTask:
        """스케줄된 작업 생성"""
        return ScheduledTask(
            id=task_data.get('id', f"task_{datetime.now().timestamp()}"),
            node_id=task_data['nodeId'],
            task_name=task_data.get('taskName', 'Unnamed Task'),
            estimated_time=task_data.get('estimatedTime', 30),
            dependencies=task_data.get('dependencies', []),
            priority=task_data.get('priority', 50)
        )
    
    async def optimize_schedule(self) -> List[ScheduledTask]:
        """스케줄 최적화"""
        # 의존성 그래프 생성
        dependency_graph = self.build_dependency_graph()
        
        # 위상 정렬로 실행 순서 결정
        execution_order = self.topological_sort(dependency_graph)
        
        # 우선순위와 의존성을 고려한 최적화
        optimized = []
        for task_id in execution_order:
            task = self.find_task_by_id(task_id)
            if task and task.status == 'scheduled':
                optimized.append(task)
        
        # 우선순위로 추가 정렬
        optimized.sort(key=lambda t: t.priority, reverse=True)
        
        return optimized
    
    def build_dependency_graph(self) -> Dict[str, List[str]]:
        """의존성 그래프 생성"""
        graph = {}
        all_tasks = self.task_queue + list(self.running_tasks.values())
        
        for task in all_tasks:
            graph[task.id] = task.dependencies
        
        return graph
    
    def topological_sort(self, graph: Dict[str, List[str]]) -> List[str]:
        """위상 정렬"""
        # 진입 차수 계산
        in_degree = {node: 0 for node in graph}
        for node in graph:
            for dep in graph[node]:
                if dep in in_degree:
                    in_degree[dep] += 1
        
        # 진입 차수가 0인 노드로 시작
        queue = [node for node, degree in in_degree.items() if degree == 0]
        result = []
        
        while queue:
            node = queue.pop(0)
            result.append(node)
            
            # 인접 노드의 진입 차수 감소
            for next_node, deps in graph.items():
                if node in deps:
                    in_degree[next_node] -= 1
                    if in_degree[next_node] == 0:
                        queue.append(next_node)
        
        return result
    
    def find_task_by_id(self, task_id: str) -> Optional[ScheduledTask]:
        """ID로 작업 찾기"""
        for task in self.task_queue:
            if task.id == task_id:
                return task
        
        return self.running_tasks.get(task_id)
    
    async def generate_timeline(self, tasks: List[ScheduledTask]) -> List[Dict[str, Any]]:
        """타임라인 생성"""
        timeline = []
        current_time = datetime.now()
        
        for task in tasks[:10]:  # 최대 10개 표시
            start_time = current_time
            end_time = current_time + timedelta(minutes=task.estimated_time)
            
            timeline.append({
                "nodeId": task.node_id,
                "taskId": task.id,
                "taskName": task.task_name,
                "start": start_time.isoformat(),
                "end": end_time.isoformat(),
                "status": task.status,
                "duration": task.estimated_time
            })
            
            current_time = end_time
        
        return timeline
    
    async def analyze_batch_operations(self) -> List[Dict[str, Any]]:
        """대량 작업 분석"""
        batch_ops = []
        
        # 노드별로 작업 그룹화
        node_tasks = {}
        for task in self.task_queue:
            if task.node_id not in node_tasks:
                node_tasks[task.node_id] = []
            node_tasks[task.node_id].append(task)
        
        # 대량 작업 식별
        for node_id, tasks in node_tasks.items():
            if len(tasks) >= 5:  # 5개 이상을 대량으로 간주
                total_time = sum(t.estimated_time for t in tasks)
                batch_ops.append({
                    "name": f"Batch operation for {node_id}",
                    "nodeId": node_id,
                    "taskCount": len(tasks),
                    "estimatedTime": total_time,
                    "avgTimePerTask": total_time / len(tasks),
                    "canParallelize": self.can_parallelize_tasks(tasks)
                })
        
        return batch_ops
    
    def can_parallelize_tasks(self, tasks: List[ScheduledTask]) -> bool:
        """작업들이 병렬화 가능한지 확인"""
        task_ids = {t.id for t in tasks}
        
        # 서로 의존성이 있는지 확인
        for task in tasks:
            if any(dep in task_ids for dep in task.dependencies):
                return False
        
        return True
    
    async def check_delayed_tasks(self) -> List[Dict[str, Any]]:
        """지연된 작업 확인"""
        delayed = []
        current_time = datetime.now()
        
        for task_id, task in self.running_tasks.items():
            if task.start_time:
                expected_end = task.start_time + timedelta(minutes=task.estimated_time)
                if current_time > expected_end and task.status == 'running':
                    delay_minutes = int((current_time - expected_end).total_seconds() / 60)
                    delayed.append({
                        "taskId": task.id,
                        "taskName": task.task_name,
                        "nodeId": task.node_id,
                        "delayMinutes": delay_minutes,
                        "estimatedTime": task.estimated_time,
                        "startTime": task.start_time.isoformat()
                    })
        
        return delayed
    
    def _task_to_dict(self, task: ScheduledTask) -> Dict[str, Any]:
        """ScheduledTask를 딕셔너리로 변환"""
        return {
            "id": task.id,
            "nodeId": task.node_id,
            "taskName": task.task_name,
            "estimatedTime": task.estimated_time,
            "actualTime": task.actual_time,
            "startTime": task.start_time.isoformat() if task.start_time else None,
            "endTime": task.end_time.isoformat() if task.end_time else None,
            "dependencies": task.dependencies,
            "priority": task.priority,
            "status": task.status
        }
    
    async def load_execution_state(self, node_id: str):
        """실행 상태 로드"""
        state_file = self.data_dir / f"{node_id}_state.json"
        
        if state_file.exists():
            with open(state_file, 'r', encoding='utf-8') as f:
                state = json.load(f)
                
                # 작업 큐 복원
                self.task_queue = []
                for task_data in state.get('taskQueue', []):
                    task = ScheduledTask(**task_data)
                    if task.start_time:
                        task.start_time = datetime.fromisoformat(task.start_time)
                    if task.end_time:
                        task.end_time = datetime.fromisoformat(task.end_time)
                    self.task_queue.append(task)
                
                # 실행 중인 작업 복원
                self.running_tasks = {}
                for task_id, task_data in state.get('runningTasks', {}).items():
                    task = ScheduledTask(**task_data)
                    if task.start_time:
                        task.start_time = datetime.fromisoformat(task.start_time)
                    self.running_tasks[task_id] = task
    
    async def save_execution_state(self, node_id: str):
        """실행 상태 저장"""
        state = {
            "taskQueue": [self._task_to_dict(t) for t in self.task_queue],
            "runningTasks": {
                task_id: self._task_to_dict(task) 
                for task_id, task in self.running_tasks.items()
            },
            "completedTasksCount": len(self.completed_tasks),
            "lastUpdated": datetime.now().isoformat()
        }
        
        state_file = self.data_dir / f"{node_id}_state.json"
        with open(state_file, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
    
    async def save_results(self, node_id: str, results: Dict[str, Any]):
        """결과 저장"""
        result_file = self.data_dir / f"{node_id}_schedule.json"
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        # 스케줄 이력 저장
        history_file = self.data_dir / f"{node_id}_history.json"
        history = []
        
        if history_file.exists():
            with open(history_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
        
        history.append({
            "timestamp": results['timestamp'],
            "scheduledCount": len(results['scheduledTasks']),
            "totalTime": results['totalEstimatedTime'],
            "delayedCount": len(results['delayedTasks'])
        })
        
        # 최근 30일 데이터만 유지
        cutoff = datetime.now() - timedelta(days=30)
        history = [
            h for h in history 
            if datetime.fromisoformat(h['timestamp']) > cutoff
        ]
        
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    
    async def start_task(self, task_id: str):
        """작업 시작"""
        task = self.find_task_by_id(task_id)
        if task:
            task.status = 'running'
            task.start_time = datetime.now()
            self.running_tasks[task_id] = task
            
            # 큐에서 제거
            self.task_queue = [t for t in self.task_queue if t.id != task_id]
    
    async def complete_task(self, task_id: str, actual_time: int):
        """작업 완료"""
        if task_id in self.running_tasks:
            task = self.running_tasks[task_id]
            task.status = 'completed'
            task.end_time = datetime.now()
            task.actual_time = actual_time
            
            self.completed_tasks.append(task)
            del self.running_tasks[task_id]


# 모듈 레벨 인스턴스
scheduler_node = SchedulerNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await scheduler_node.execute(node_id, data)