# backend/app/core/engine.py (개선된 버전)

import asyncio
from typing import Dict, Any, List, Optional, Set, Tuple
from datetime import datetime, timedelta
import importlib
import networkx as nx
from enum import Enum
from collections import defaultdict
import uuid

from app.storage.node_storage import node_storage
from app.core.variable_resolver import global_variable_resolver
from app.core.executor import node_executor
from app.api.websocket import manager as ws_manager
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class ExecutionStatus(Enum):
    """실행 상태"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"
    QUEUED = "queued"

class NodePriority(Enum):
    """노드 우선순위"""
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3

class WorkflowEngine:
    """워크플로우 실행 엔진 - 동시성 제어 및 안정성 강화"""
    
    def __init__(self):
        # 노드 타입 매핑
        self.node_types = {
            'worker': 'app.nodes.worker',
            'supervisor': 'app.nodes.supervisor',
            'planner': 'app.nodes.planner',
            'watcher': 'app.nodes.watcher',
            'flow': 'app.nodes.flow',
            'memory': 'app.nodes.memory',
            'trigger': 'app.nodes.trigger',
            'worker_writer': 'app.nodes.worker_writer',
            'worker_painter': 'app.nodes.worker_painter',
            'scheduler': 'app.nodes.scheduler',
            'storage': 'app.nodes.storage',
            'qa': 'app.nodes.qa'
        }
        
        # 동시성 제어
        self.max_concurrent_executions = 10
        self.execution_semaphore = asyncio.Semaphore(self.max_concurrent_executions)
        self.node_locks: Dict[str, asyncio.Lock] = {}
        self.workflow_locks: Dict[str, asyncio.Lock] = {}
        
        # 실행 상태 관리
        self.running_nodes: Dict[str, Dict[str, Any]] = {}
        self.execution_queue: asyncio.Queue = asyncio.Queue()
        self.execution_history: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        
        # 재시도 설정
        self.max_retries = 3
        self.retry_delay = 1.0  # seconds
        
        # 실행 캐시
        self.execution_cache = {}
        self.cache_ttl = timedelta(minutes=5)
        
        # 실행 큐 워커 시작
        self._start_execution_workers()
        
    def _start_execution_workers(self):
        """실행 큐 워커 시작"""
        for i in range(3):  # 3개의 워커 스레드
            asyncio.create_task(self._execution_worker(f"worker-{i}"))
            
    async def _execution_worker(self, worker_id: str):
        """실행 큐 처리 워커"""
        logger.info(f"Execution worker {worker_id} started")
        
        while True:
            try:
                # 큐에서 작업 가져오기
                task = await self.execution_queue.get()
                
                if task is None:  # 종료 신호
                    break
                    
                # 작업 실행
                node_id = task['node_id']
                context = task['context']
                callback = task.get('callback')
                
                logger.info(f"Worker {worker_id} executing node {node_id}")
                
                try:
                    result = await self._execute_node_with_semaphore(node_id, context)
                    
                    if callback:
                        await callback(result)
                        
                except Exception as e:
                    logger.error(f"Worker {worker_id} error executing {node_id}: {e}")
                    
                finally:
                    self.execution_queue.task_done()
                    
            except Exception as e:
                logger.error(f"Worker {worker_id} error: {e}")
                await asyncio.sleep(1)
                
    async def execute_node(
        self, 
        node_id: str, 
        context: Dict[str, Any] = None,
        use_ai_improvement: bool = False,
        priority: NodePriority = NodePriority.NORMAL,
        timeout: Optional[float] = None,
        retry: bool = True
    ) -> Dict[str, Any]:
        """단일 노드 실행 - 개선된 버전"""
        
        execution_id = str(uuid.uuid4())
        start_time = datetime.now()
        
        # 실행 정보 기록
        execution_info = {
            "execution_id": execution_id,
            "node_id": node_id,
            "start_time": start_time.isoformat(),
            "priority": priority.value,
            "status": ExecutionStatus.PENDING.value
        }
        
        try:
            # 캐시 확인
            cache_key = self._get_cache_key(node_id, context)
            if cache_key in self.execution_cache:
                cached_result, cached_time = self.execution_cache[cache_key]
                if datetime.now() - cached_time < self.cache_ttl:
                    logger.info(f"Using cached result for node {node_id}")
                    cached_result["from_cache"] = True
                    return cached_result
                    
            # 노드 정보 검증
            node_data = await self._validate_and_get_node(node_id)
            
            # 실행 컨텍스트 준비
            execution_context = self._prepare_execution_context(
                node_id, node_data, context, use_ai_improvement, execution_id
            )
            
            # 우선순위에 따른 실행
            if priority == NodePriority.CRITICAL:
                # 즉시 실행
                result = await self._execute_node_with_semaphore(
                    node_id, execution_context, timeout
                )
            else:
                # 큐에 추가
                await self.execution_queue.put({
                    "node_id": node_id,
                    "context": execution_context,
                    "priority": priority
                })
                
                # 비동기 실행이므로 즉시 반환
                return {
                    "status": "queued",
                    "execution_id": execution_id,
                    "message": f"Node {node_id} queued for execution"
                }
                
            # 재시도 로직
            if retry and result.get("status") == "error":
                result = await self._retry_execution(
                    node_id, execution_context, timeout
                )
                
            # 캐시 저장
            if result.get("status") == "success":
                self.execution_cache[cache_key] = (result, datetime.now())
                
            # 실행 기록 저장
            execution_info["end_time"] = datetime.now().isoformat()
            execution_info["duration"] = (datetime.now() - start_time).total_seconds()
            execution_info["status"] = result.get("status", "unknown")
            self.execution_history[node_id].append(execution_info)
            
            return result
            
        except Exception as e:
            logger.exception(f"Node execution failed: {e}")
            return self._create_error_result(str(e), execution_id)
            
    async def _execute_node_with_semaphore(
        self,
        node_id: str,
        context: Dict[str, Any],
        timeout: Optional[float] = None
    ) -> Dict[str, Any]:
        """세마포어를 사용한 노드 실행"""
        
        # 동시 실행 제한
        async with self.execution_semaphore:
            # 노드별 락 확인 및 생성
            if node_id not in self.node_locks:
                self.node_locks[node_id] = asyncio.Lock()
                
            # 중복 실행 방지
            if self.node_locks[node_id].locked():
                return {
                    "status": "error",
                    "error": f"Node {node_id} is already running",
                    "error_type": "duplicate_execution"
                }
                
            async with self.node_locks[node_id]:
                # 실행 상태 등록
                self.running_nodes[node_id] = {
                    "start_time": datetime.now(),
                    "context": context
                }
                
                try:
                    # 실행 시작 알림
                    await self._notify_execution_start(node_id, context)
                    
                    # 타임아웃과 함께 실행
                    if timeout:
                        result = await asyncio.wait_for(
                            self._execute_node_internal(node_id, context),
                            timeout=timeout
                        )
                    else:
                        result = await self._execute_node_internal(node_id, context)
                        
                    # 실행 완료 알림
                    await self._notify_execution_complete(node_id, result)
                    
                    return result
                    
                except asyncio.TimeoutError:
                    logger.error(f"Node {node_id} execution timeout")
                    return {
                        "status": "timeout",
                        "error": f"Execution timeout after {timeout} seconds"
                    }
                    
                finally:
                    # 실행 상태 제거
                    self.running_nodes.pop(node_id, None)
                    
    async def _execute_node_internal(
        self,
        node_id: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """내부 노드 실행 로직"""
        
        node_type = context.get('node_type', 'worker')
        
        # 의존성 체크
        dependencies_met = await self._check_dependencies(node_id)
        if not dependencies_met:
            return {
                "status": "error",
                "error": "Dependencies not met",
                "error_type": "dependency_failure"
            }
            
        # 노드 타입별 실행
        return await self._execute_node_by_type(node_id, node_type, context)
        
    async def _execute_node_by_type(
        self,
        node_id: str,
        node_type: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """노드 타입별 실행 모듈 호출"""
        
        if node_type not in self.node_types:
            return {
                "status": "error",
                "error": f"Unknown node type: {node_type}",
                "error_type": "invalid_node_type"
            }
            
        try:
            # 모듈 동적 로드
            module_path = self.node_types[node_type]
            module = importlib.import_module(module_path)
            
            # execute 함수 호출
            if hasattr(module, 'execute'):
                result = await module.execute(node_id, context)
                
                # 결과 검증
                if not isinstance(result, dict):
                    return {
                        "status": "error",
                        "error": "Invalid result format",
                        "raw_result": str(result)
                    }
                    
                return result
            else:
                return {
                    "status": "error",
                    "error": f"Module {module_path} does not have execute function",
                    "error_type": "module_error"
                }
                
        except ImportError as e:
            logger.error(f"Failed to import module {module_path}: {e}")
            return {
                "status": "error",
                "error": f"Failed to load node type module: {e}",
                "error_type": "import_error"
            }
        except Exception as e:
            logger.exception(f"Execution error for node {node_id}")
            return {
                "status": "error",
                "error": str(e),
                "error_type": "execution_error"
            }
            
    async def execute_workflow(
        self,
        start_node_id: str,
        context: Dict[str, Any] = None,
        parallel: bool = False,
        stop_on_error: bool = True
    ) -> Dict[str, Any]:
        """워크플로우 실행 - 개선된 버전"""
        
        workflow_id = str(uuid.uuid4())
        
        # 워크플로우 락
        if start_node_id not in self.workflow_locks:
            self.workflow_locks[start_node_id] = asyncio.Lock()
            
        async with self.workflow_locks[start_node_id]:
            try:
                # 워크플로우 그래프 구성
                graph = await self._build_workflow_graph(start_node_id)
                
                if not graph:
                    return {
                        "status": "error",
                        "error": "Failed to build workflow graph"
                    }
                    
                # 실행 계획 수립
                execution_plan = await self._create_execution_plan(
                    graph, start_node_id, parallel
                )
                
                # 워크플로우 실행
                results = await self._execute_workflow_plan(
                    execution_plan,
                    context or {},
                    stop_on_error,
                    workflow_id
                )
                
                return {
                    "status": "success",
                    "workflow_id": workflow_id,
                    "start_node": start_node_id,
                    "executed_nodes": len(results),
                    "results": results,
                    "execution_plan": execution_plan
                }
                
            except Exception as e:
                logger.exception(f"Workflow execution failed")
                return {
                    "status": "error",
                    "error": str(e),
                    "workflow_id": workflow_id
                }
                
    async def _create_execution_plan(
        self,
        graph: nx.DiGraph,
        start_node: str,
        parallel: bool
    ) -> List[List[str]]:
        """실행 계획 수립 (병렬 실행 지원)"""
        
        if parallel:
            # 레벨별 병렬 실행 계획
            levels = []
            visited = set()
            current_level = [start_node]
            
            while current_level:
                levels.append(current_level)
                visited.update(current_level)
                
                next_level = []
                for node in current_level:
                    for successor in graph.successors(node):
                        if successor not in visited:
                            # 모든 선행 노드가 방문되었는지 확인
                            predecessors = set(graph.predecessors(successor))
                            if predecessors.issubset(visited):
                                next_level.append(successor)
                                
                current_level = list(set(next_level))
                
            return levels
        else:
            # 순차 실행 계획 (토폴로지컬 정렬)
            try:
                order = list(nx.topological_sort(graph))
                return [[node] for node in order]
            except nx.NetworkXError:
                # 순환 참조가 있는 경우
                return [[start_node]]
                
    async def _execute_workflow_plan(
        self,
        plan: List[List[str]],
        context: Dict[str, Any],
        stop_on_error: bool,
        workflow_id: str
    ) -> Dict[str, Any]:
        """실행 계획에 따른 워크플로우 실행"""
        
        results = {}
        workflow_context = {
            **context,
            "workflow_id": workflow_id,
            "workflow_results": {}
        }
        
        for level_idx, level_nodes in enumerate(plan):
            logger.info(f"Executing workflow level {level_idx}: {level_nodes}")
            
            if len(level_nodes) == 1:
                # 단일 노드 실행
                node_id = level_nodes[0]
                result = await self.execute_node(
                    node_id,
                    workflow_context,
                    priority=NodePriority.HIGH
                )
                results[node_id] = result
                
            else:
                # 병렬 실행
                tasks = []
                for node_id in level_nodes:
                    task = asyncio.create_task(
                        self.execute_node(
                            node_id,
                            workflow_context.copy(),
                            priority=NodePriority.HIGH
                        )
                    )
                    tasks.append((node_id, task))
                    
                # 모든 태스크 완료 대기
                for node_id, task in tasks:
                    try:
                        result = await task
                        results[node_id] = result
                    except Exception as e:
                        results[node_id] = {
                            "status": "error",
                            "error": str(e)
                        }
                        
            # 실패 처리
            level_failed = any(
                r.get("status") == "error" 
                for r in results.values()
            )
            
            if level_failed and stop_on_error:
                logger.warning(f"Workflow stopped at level {level_idx} due to error")
                break
                
            # 결과를 다음 레벨로 전달
            workflow_context["workflow_results"] = results
            workflow_context["previous_level_results"] = {
                node_id: results[node_id] 
                for node_id in level_nodes 
                if node_id in results
            }
            
        return results
        
    async def _retry_execution(
        self,
        node_id: str,
        context: Dict[str, Any],
        timeout: Optional[float] = None,
        attempt: int = 1
    ) -> Dict[str, Any]:
        """실행 재시도"""
        
        if attempt > self.max_retries:
            return {
                "status": "error",
                "error": f"Max retries ({self.max_retries}) exceeded",
                "attempts": attempt
            }
            
        logger.info(f"Retrying node {node_id}, attempt {attempt}")
        
        # 재시도 대기
        await asyncio.sleep(self.retry_delay * attempt)
        
        # 재실행
        result = await self._execute_node_with_semaphore(
            node_id, context, timeout
        )
        
        if result.get("status") == "error":
            # 재귀적 재시도
            return await self._retry_execution(
                node_id, context, timeout, attempt + 1
            )
            
        return result
        
    async def _check_dependencies(self, node_id: str) -> bool:
        """노드 의존성 체크"""
        # TODO: 실제 의존성 체크 로직 구현
        # 예: 필요한 입력 노드들이 실행되었는지 확인
        return True
        
    async def _validate_and_get_node(self, node_id: str) -> Dict[str, Any]:
        """노드 검증 및 데이터 가져오기"""
        node_data = await node_storage.get_data(node_id, 'node')
        
        if not node_data:
            raise ValueError(f"Node {node_id} not found")
            
        if 'type' not in node_data:
            raise ValueError(f"Node {node_id} has no type specified")
            
        return node_data
        
    def _prepare_execution_context(
        self,
        node_id: str,
        node_data: Dict[str, Any],
        context: Optional[Dict[str, Any]],
        use_ai_improvement: bool,
        execution_id: str
    ) -> Dict[str, Any]:
        """실행 컨텍스트 준비"""
        return {
            **(context or {}),
            'node_id': node_id,
            'node_type': node_data.get('type', 'worker'),
            'node_data': node_data,
            'enableAIImprovement': use_ai_improvement,
            'execution_id': execution_id,
            'timestamp': datetime.now().isoformat()
        }
        
    def _get_cache_key(self, node_id: str, context: Optional[Dict[str, Any]]) -> str:
        """캐시 키 생성"""
        # 컨텍스트에서 캐시에 영향을 주는 항목만 선택
        cache_context = {}
        if context:
            for key in ['input_data', 'parameters', 'enableAIImprovement']:
                if key in context:
                    cache_context[key] = context[key]
                    
        return f"{node_id}:{hash(str(sorted(cache_context.items())))}"
        
    def _create_error_result(self, error: str, execution_id: str) -> Dict[str, Any]:
        """에러 결과 생성"""
        return {
            "status": "error",
            "error": error,
            "execution_id": execution_id,
            "timestamp": datetime.now().isoformat()
        }
        
    async def _notify_execution_start(self, node_id: str, context: Dict[str, Any]):
        """실행 시작 알림"""
        await ws_manager.broadcast_event('node_execution_started', {
            'node_id': node_id,
            'execution_id': context.get('execution_id'),
            'timestamp': datetime.now().isoformat()
        })
        
    async def _notify_execution_complete(self, node_id: str, result: Dict[str, Any]):
        """실행 완료 알림"""
        await ws_manager.broadcast_event('node_execution_completed', {
            'node_id': node_id,
            'status': result.get('status', 'unknown'),
            'timestamp': datetime.now().isoformat()
        })
        
    async def _build_workflow_graph(self, start_node_id: str) -> Optional[nx.DiGraph]:
        """워크플로우 그래프 구성"""
        try:
            graph = nx.DiGraph()
            visited = set()
            
            async def add_node_and_edges(node_id: str):
                if node_id in visited:
                    return
                    
                visited.add(node_id)
                
                # 노드 존재 확인
                node_data = await node_storage.get_data(node_id, 'node')
                if not node_data:
                    logger.warning(f"Node {node_id} not found in storage")
                    return
                    
                graph.add_node(node_id, **node_data)
                
                # 연결된 엣지 조회
                edges = await self._get_node_edges(node_id)
                
                for edge in edges:
                    target_id = edge.get('target')
                    if target_id:
                        graph.add_edge(
                            node_id, 
                            target_id,
                            **edge.get('data', {})
                        )
                        await add_node_and_edges(target_id)
                        
            await add_node_and_edges(start_node_id)
            
            # 그래프 검증
            if not graph.has_node(start_node_id):
                logger.error(f"Start node {start_node_id} not in graph")
                return None
                
            return graph
            
        except Exception as e:
            logger.error(f"Failed to build workflow graph: {e}")
            return None
            
    async def _get_node_edges(self, node_id: str) -> List[Dict[str, Any]]:
        """노드의 출력 엣지 조회"""
        # TODO: 실제 엣지 스토리지에서 조회
        # 임시 구현
        edges_data = await node_storage.get_data(node_id, 'edges')
        return edges_data or []
        
    async def _update_execution_stats(self, node_id: str, result: Dict[str, Any]):
        """실행 통계 업데이트"""
        metadata = await node_storage.get_metadata(node_id) or {}
        
        # 기본 통계
        metadata['execution_count'] = metadata.get('execution_count', 0) + 1
        metadata['last_execution'] = datetime.now().isoformat()
        metadata['last_execution_status'] = result.get('status', 'unknown')
        
        # 성공/실패 카운트
        if result.get('status') == 'success':
            metadata['successful_runs'] = metadata.get('successful_runs', 0) + 1
        else:
            metadata['error_count'] = metadata.get('error_count', 0) + 1
            metadata['last_error'] = result.get('error', 'Unknown error')
            
        # 실행 시간 통계
        if 'execution_time' in result:
            exec_times = metadata.get('execution_times', [])
            exec_times.append(result['execution_time'])
            
            # 최근 100개만 유지
            exec_times = exec_times[-100:]
            
            metadata['execution_times'] = exec_times
            metadata['average_execution_time'] = sum(exec_times) / len(exec_times)
            metadata['min_execution_time'] = min(exec_times)
            metadata['max_execution_time'] = max(exec_times)
            
        await node_storage.save_metadata(node_id, metadata)
        
    async def get_running_nodes(self) -> List[Dict[str, Any]]:
        """현재 실행 중인 노드 목록 (상세 정보 포함)"""
        running = []
        
        for node_id, info in self.running_nodes.items():
            running.append({
                "node_id": node_id,
                "start_time": info["start_time"].isoformat(),
                "duration": (datetime.now() - info["start_time"]).total_seconds(),
                "context": info.get("context", {})
            })
            
        return running
        
    async def get_execution_history(
        self, 
        node_id: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """실행 이력 조회"""
        if node_id:
            history = self.execution_history.get(node_id, [])
        else:
            # 모든 노드의 이력
            history = []
            for node_history in self.execution_history.values():
                history.extend(node_history)
                
        # 최신순 정렬
        history.sort(key=lambda x: x['start_time'], reverse=True)
        
        return history[:limit]
        
    async def stop_node(self, node_id: str, force: bool = False) -> Dict[str, Any]:
        """노드 실행 중단"""
        if node_id not in self.running_nodes:
            return {
                "status": "error",
                "error": f"Node {node_id} is not running"
            }
            
        try:
            # 노드 실행기에 중단 요청
            stopped = await node_executor.stop_execution(node_id)
            
            if stopped or force:
                # 강제 중단
                self.running_nodes.pop(node_id, None)
                
                # 락 해제
                if node_id in self.node_locks and self.node_locks[node_id].locked():
                    # 락 해제는 자동으로 됨
                    pass
                    
                return {
                    "status": "success",
                    "message": f"Node {node_id} stopped",
                    "forced": force
                }
            else:
                return {
                    "status": "error",
                    "error": "Failed to stop node execution"
                }
                
        except Exception as e:
            logger.error(f"Error stopping node {node_id}: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
            
    async def cancel_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """워크플로우 취소"""
        # TODO: 워크플로우 취소 로직 구현
        cancelled_nodes = []
        
        # 실행 중인 노드 중 해당 워크플로우의 노드들 찾기
        for node_id, info in list(self.running_nodes.items()):
            if info.get('context', {}).get('workflow_id') == workflow_id:
                result = await self.stop_node(node_id)
                if result.get('status') == 'success':
                    cancelled_nodes.append(node_id)
                    
        return {
            "status": "success",
            "workflow_id": workflow_id,
            "cancelled_nodes": cancelled_nodes
        }
        
    async def get_engine_status(self) -> Dict[str, Any]:
        """엔진 상태 조회"""
        return {
            "running_nodes": len(self.running_nodes),
            "queued_tasks": self.execution_queue.qsize(),
            "max_concurrent": self.max_concurrent_executions,
            "available_slots": self.max_concurrent_executions - len(self.running_nodes),
            "cache_entries": len(self.execution_cache),
            "node_types": list(self.node_types.keys())
        }
        
    async def clear_cache(self, node_id: Optional[str] = None):
        """캐시 클리어"""
        if node_id:
            # 특정 노드의 캐시만 제거
            keys_to_remove = [
                key for key in self.execution_cache 
                if key.startswith(f"{node_id}:")
            ]
            for key in keys_to_remove:
                del self.execution_cache[key]
        else:
            # 전체 캐시 클리어
            self.execution_cache.clear()
            
    async def shutdown(self):
        """엔진 종료"""
        logger.info("Shutting down workflow engine")
        
        # 실행 중인 노드들 중단
        for node_id in list(self.running_nodes.keys()):
            await self.stop_node(node_id, force=True)
            
        # 워커 종료
        for _ in range(3):
            await self.execution_queue.put(None)
            
        logger.info("Workflow engine shutdown complete")

# 전역 엔진 인스턴스
engine = WorkflowEngine()