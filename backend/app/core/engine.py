# backend/app/core/engine.py (업데이트)

import asyncio
from typing import Dict, Any, List, Optional, Set
from datetime import datetime
import importlib
import networkx as nx

from app.storage.node_storage import node_storage
from app.core.variable_resolver import global_variable_resolver
from app.core.executor import node_executor
from app.api.websocket import manager as ws_manager
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class WorkflowEngine:
    """워크플로우 실행 엔진 - 모든 노드 타입 지원"""
    
    def __init__(self):
        self.node_types = {
            'worker': 'app.nodes.worker',
            'supervisor': 'app.nodes.supervisor',
            'planner': 'app.nodes.planner',
            'watcher': 'app.nodes.watcher',
            'flow': 'app.nodes.flow',
            'memory': 'app.nodes.memory',
            'trigger': 'app.nodes.trigger',
            # 누락된 노드들 추가:
            'worker_writer': 'app.nodes.worker_writer',
            'worker_painter': 'app.nodes.worker_painter',
            'scheduler': 'app.nodes.scheduler',
            'storage': 'app.nodes.storage',
            'qa': 'app.nodes.qa'
        }
        self.execution_cache = {}
        self.running_nodes: Set[str] = set()
        
    async def execute_node(
        self, 
        node_id: str, 
        context: Dict[str, Any] = None,
        use_ai_improvement: bool = False
    ) -> Dict[str, Any]:
        """단일 노드 실행"""
        if node_id in self.running_nodes:
            return {
                "status": "error",
                "error": f"Node {node_id} is already running"
            }
            
        self.running_nodes.add(node_id)
        
        try:
            # 노드 정보 로드
            node_data = await node_storage.get_data(node_id, 'node')
            if not node_data:
                return {
                    "status": "error",
                    "error": f"Node {node_id} not found"
                }
                
            node_type = node_data.get('type', 'worker')
            
            # 실행 컨텍스트 준비
            execution_context = {
                **(context or {}),
                'node_id': node_id,
                'node_type': node_type,
                'node_data': node_data,
                'enableAIImprovement': use_ai_improvement,
                'execution_id': f"exec_{datetime.now().timestamp()}"
            }
            
            # 실행 시작 이벤트
            await ws_manager.broadcast_event('node_execution_started', {
                'node_id': node_id,
                'execution_id': execution_context['execution_id']
            })
            
            # 노드 타입별 실행
            result = await self._execute_node_by_type(
                node_id,
                node_type,
                execution_context
            )
            
            # 실행 완료 이벤트
            await ws_manager.broadcast_event('node_execution_completed', {
                'node_id': node_id,
                'execution_id': execution_context['execution_id'],
                'status': result.get('status', 'unknown')
            })
            
            # 실행 통계 업데이트
            await self._update_execution_stats(node_id, result)
            
            return result
            
        except Exception as e:
            logger.error(f"Node execution failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "node_id": node_id
            }
        finally:
            self.running_nodes.discard(node_id)
            
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
                "error": f"Unknown node type: {node_type}"
            }
            
        try:
            # 모듈 동적 로드
            module_path = self.node_types[node_type]
            module = importlib.import_module(module_path)
            
            # execute 함수 호출
            if hasattr(module, 'execute'):
                result = await module.execute(node_id, context)
                return result
            else:
                return {
                    "status": "error",
                    "error": f"Module {module_path} does not have execute function"
                }
                
        except ImportError as e:
            logger.error(f"Failed to import module {module_path}: {e}")
            return {
                "status": "error",
                "error": f"Failed to load node type module: {e}"
            }
            
    async def execute_workflow(
        self,
        start_node_id: str,
        context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """워크플로우 실행 (연결된 노드들 순차 실행)"""
        try:
            # 워크플로우 그래프 구성
            graph = await self._build_workflow_graph(start_node_id)
            
            if not graph:
                return {
                    "status": "error",
                    "error": "Failed to build workflow graph"
                }
                
            # 실행 순서 결정 (토폴로지컬 정렬)
            try:
                execution_order = list(nx.topological_sort(graph))
            except nx.NetworkXError:
                # 순환 참조가 있는 경우
                execution_order = [start_node_id]
                
            # 노드들 순차 실행
            results = {}
            workflow_context = context or {}
            
            for node_id in execution_order:
                # 이전 노드들의 출력을 입력으로 전달
                node_context = {
                    **workflow_context,
                    'previous_results': results
                }
                
                # 노드 실행
                result = await self.execute_node(node_id, node_context)
                results[node_id] = result
                
                # 실패 시 중단 옵션
                if result.get('status') == 'error' and workflow_context.get('stop_on_error', True):
                    break
                    
                # 출력을 다음 노드의 입력으로
                if result.get('output'):
                    workflow_context['previous_output'] = result['output']
                    
            return {
                "status": "success",
                "workflow_id": start_node_id,
                "executed_nodes": len(results),
                "results": results,
                "execution_order": execution_order
            }
            
        except Exception as e:
            logger.error(f"Workflow execution failed: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
            
    async def _build_workflow_graph(self, start_node_id: str) -> Optional[nx.DiGraph]:
        """워크플로우 그래프 구성"""
        try:
            graph = nx.DiGraph()
            visited = set()
            
            async def add_node_and_edges(node_id: str):
                if node_id in visited:
                    return
                    
                visited.add(node_id)
                graph.add_node(node_id)
                
                # 연결된 엣지 조회
                edges = await self._get_node_edges(node_id)
                
                for edge in edges:
                    target_id = edge.get('target')
                    if target_id:
                        graph.add_edge(node_id, target_id)
                        await add_node_and_edges(target_id)
                        
            await add_node_and_edges(start_node_id)
            return graph
            
        except Exception as e:
            logger.error(f"Failed to build workflow graph: {e}")
            return None
            
    async def _get_node_edges(self, node_id: str) -> List[Dict[str, Any]]:
        """노드의 출력 엣지 조회"""
        # 실제로는 엣지 스토리지에서 조회
        # 여기서는 간단한 구현
        return []
        
    async def _update_execution_stats(self, node_id: str, result: Dict[str, Any]):
        """실행 통계 업데이트"""
        metadata = await node_storage.get_metadata(node_id) or {}
        
        metadata['execution_count'] = metadata.get('execution_count', 0) + 1
        metadata['last_execution'] = datetime.now().isoformat()
        
        if result.get('status') == 'success':
            metadata['successful_runs'] = metadata.get('successful_runs', 0) + 1
        else:
            metadata['error_count'] = metadata.get('error_count', 0) + 1
            metadata['last_error'] = result.get('error', 'Unknown error')
            
        # 평균 실행 시간 업데이트
        if 'execution_time' in result:
            exec_times = metadata.get('execution_times', [])
            exec_times.append(result['execution_time'])
            exec_times = exec_times[-100:]  # 최근 100개만 유지
            
            metadata['execution_times'] = exec_times
            metadata['average_execution_time'] = sum(exec_times) / len(exec_times)
            
        await node_storage.save_metadata(node_id, metadata)
        
    async def get_running_nodes(self) -> List[str]:
        """현재 실행 중인 노드 목록"""
        return list(self.running_nodes)
        
    async def stop_node(self, node_id: str) -> Dict[str, Any]:
        """노드 실행 중단"""
        if node_id not in self.running_nodes:
            return {
                "status": "error",
                "error": f"Node {node_id} is not running"
            }
            
        # 실제 중단 로직은 각 노드 타입에서 구현
        # 여기서는 플래그만 제거
        self.running_nodes.discard(node_id)
        
        return {
            "status": "success",
            "message": f"Node {node_id} stop requested"
        }

# 전역 엔진 인스턴스
engine = WorkflowEngine()