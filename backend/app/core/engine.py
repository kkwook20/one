
# backend/app/core/engine.py

import asyncio
from typing import Dict, List, Optional, Any, Set
from datetime import datetime
import json
from pathlib import Path
import uuid

from app.models import (
    Workflow, WorkflowExecution, NodeExecution, ExecutionLog,
    ExecutionStatus, NodeExecutionStatus
)
from app.core.executor import NodeExecutor
from app.utils.logger import setup_logger
from app.config import settings

logger = setup_logger(__name__)

class WorkflowEngine:
    """워크플로우 실행 엔진"""
    
    def __init__(self, connection_manager):
        self.connection_manager = connection_manager
        self.executor = NodeExecutor()
        self.workflows: Dict[str, Workflow] = {}
        self.executions: Dict[str, WorkflowExecution] = {}
        self.subscriptions: Dict[str, Set[str]] = {}  # workflow_id -> client_ids
        
        # 워크플로우 로드
        self._load_workflows()
        
    def _load_workflows(self):
        """저장된 워크플로우 로드"""
        workflows_dir = Path(settings.WORKFLOWS_PATH)
        for workflow_file in workflows_dir.glob("*.json"):
            try:
                with open(workflow_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    workflow = Workflow(**data)
                    self.workflows[workflow.id] = workflow
                    logger.info(f"Loaded workflow: {workflow.metadata.name}")
            except Exception as e:
                logger.error(f"Failed to load workflow {workflow_file}: {e}")
                
    def save_workflow(self, workflow: Workflow):
        """워크플로우 저장"""
        self.workflows[workflow.id] = workflow
        
        # 파일로 저장
        workflow_file = Path(settings.WORKFLOWS_PATH) / f"{workflow.id}.json"
        with open(workflow_file, "w", encoding="utf-8") as f:
            json.dump(workflow.dict(), f, indent=2, default=str)
            
        logger.info(f"Saved workflow: {workflow.metadata.name}")
        
    async def execute_workflow(
        self, 
        workflow_id: str, 
        client_id: Optional[str] = None,
        mode: str = "manual",
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """워크플로우 실행"""
        
        # 워크플로우 확인
        workflow = self.workflows.get(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")
            
        # 실행 인스턴스 생성
        execution = WorkflowExecution(
            workflow_id=workflow_id,
            mode=mode,
            triggered_by=client_id,
            context=context or {},
            started_at=datetime.now()
        )
        
        # 노드 실행 정보 초기화
        for node in workflow.nodes:
            execution.node_executions[node.id] = NodeExecution(
                node_id=node.id,
                status=NodeExecutionStatus.WAITING
            )
            
        self.executions[execution.id] = execution
        
        # 실행 시작 알림
        await self._notify_execution_update(execution)
        
        # 비동기로 워크플로우 실행
        asyncio.create_task(self._run_workflow(execution, workflow))
        
        return execution.id
        
    async def _run_workflow(self, execution: WorkflowExecution, workflow: Workflow):
        """워크플로우 실행 (비동기)"""
        try:
            execution.status = ExecutionStatus.RUNNING
            await self._notify_execution_update(execution)
            
            # 실행 순서 결정 (토폴로지 정렬)
            execution_order = self._get_execution_order(workflow)
            
            # 노드별 출력 저장
            node_outputs: Dict[str, Any] = {}
            
            # 순서대로 노드 실행
            for node_id in execution_order:
                node = next(n for n in workflow.nodes if n.id == node_id)
                node_execution = execution.node_executions[node_id]
                
                try:
                    # 입력 데이터 수집
                    input_data = await self._collect_input_data(
                        node, workflow, node_outputs, execution.context
                    )
                    node_execution.input_data = input_data
                    
                    # 노드 실행
                    node_execution.status = NodeExecutionStatus.RUNNING
                    node_execution.started_at = datetime.now()
                    await self._notify_node_update(execution, node_execution)
                    
                    # 실행
                    output_data = await self.executor.execute_node(
                        node, 
                        input_data,
                        lambda log: asyncio.create_task(
                            self._add_node_log(execution, node_id, log)
                        )
                    )
                    
                    # 결과 저장
                    node_outputs[node_id] = output_data
                    node_execution.output_data = output_data
                    node_execution.status = NodeExecutionStatus.SUCCESS
                    node_execution.completed_at = datetime.now()
                    
                except Exception as e:
                    # 노드 실행 실패
                    node_execution.status = NodeExecutionStatus.FAILED
                    node_execution.error = str(e)
                    node_execution.completed_at = datetime.now()
                    
                    await self._add_log(
                        execution, 
                        "error",
                        f"Node {node.data.label} failed: {e}",
                        {"node_id": node_id}
                    )
                    
                    # 실패 시 중단 (설정에 따라)
                    if not workflow.settings.get("continueOnError", False):
                        raise
                        
                finally:
                    await self._notify_node_update(execution, node_execution)
                    
            # 실행 완료
            execution.status = ExecutionStatus.SUCCESS
            execution.completed_at = datetime.now()
            
        except asyncio.CancelledError:
            # 취소됨
            execution.status = ExecutionStatus.CANCELLED
            execution.completed_at = datetime.now()
            await self._add_log(execution, "info", "Execution cancelled")
            
        except Exception as e:
            # 실행 실패
            execution.status = ExecutionStatus.FAILED
            execution.error = str(e)
            execution.completed_at = datetime.now()
            await self._add_log(execution, "error", f"Execution failed: {e}")
            
        finally:
            await self._notify_execution_update(execution)
            
    def _get_execution_order(self, workflow: Workflow) -> List[str]:
        """노드 실행 순서 결정 (토폴로지 정렬)"""
        # 의존성 그래프 구성
        dependencies: Dict[str, Set[str]] = {node.id: set() for node in workflow.nodes}
        
        for edge in workflow.edges:
            dependencies[edge.target].add(edge.source)
            
        # 토폴로지 정렬
        order = []
        visited = set()
        
        def visit(node_id: str):
            if node_id in visited:
                return
            visited.add(node_id)
            
            # 선행 노드들 먼저 방문
            for dep_id in dependencies[node_id]:
                visit(dep_id)
                
            order.append(node_id)
            
        for node in workflow.nodes:
            visit(node.id)
            
        return order
        
    async def _collect_input_data(
        self, 
        node: Any, 
        workflow: Workflow, 
        node_outputs: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """노드 입력 데이터 수집"""
        input_data = {}
        
        # 연결된 엣지에서 입력 수집
        for edge in workflow.edges:
            if edge.target == node.id:
                source_output = node_outputs.get(edge.source, {})
                
                # 특정 포트 연결인 경우
                if edge.sourceHandle and edge.targetHandle:
                    if edge.sourceHandle in source_output:
                        input_data[edge.targetHandle] = source_output[edge.sourceHandle]
                else:
                    # 전체 출력 연결
                    input_data.update(source_output)
                    
        # 컨텍스트 변수 추가
        input_data["_context"] = context
        
        return input_data
        
    async def _add_log(
        self, 
        execution: WorkflowExecution, 
        level: str, 
        message: str,
        data: Optional[Dict[str, Any]] = None
    ):
        """실행 로그 추가"""
        log = ExecutionLog(
            level=level,
            message=message,
            data=data
        )
        execution.logs.append(log)
        
        # 실시간 전송
        await self._notify_log(execution, log)
        
    async def _add_node_log(
        self,
        execution: WorkflowExecution,
        node_id: str,
        log_data: Dict[str, Any]
    ):
        """노드 로그 추가"""
        node_execution = execution.node_executions[node_id]
        log = ExecutionLog(
            level=log_data.get("level", "info"),
            node_id=node_id,
            message=log_data.get("message", ""),
            data=log_data.get("data")
        )
        node_execution.logs.append(log)
        
        # 실시간 전송
        await self._notify_log(execution, log)
        
    async def _notify_execution_update(self, execution: WorkflowExecution):
        """실행 상태 업데이트 알림"""
        message = {
            "type": "execution_update",
            "execution": execution.dict()
        }
        
        # 구독한 클라이언트에게 전송
        if execution.workflow_id in self.subscriptions:
            for client_id in self.subscriptions[execution.workflow_id]:
                await self.connection_manager.send_message(client_id, message)
                
    async def _notify_node_update(
        self, 
        execution: WorkflowExecution, 
        node_execution: NodeExecution
    ):
        """노드 실행 상태 업데이트 알림"""
        message = {
            "type": "node_update",
            "executionId": execution.id,
            "nodeExecution": node_execution.dict()
        }
        
        if execution.workflow_id in self.subscriptions:
            for client_id in self.subscriptions[execution.workflow_id]:
                await self.connection_manager.send_message(client_id, message)
                
    async def _notify_log(self, execution: WorkflowExecution, log: ExecutionLog):
        """로그 알림"""
        message = {
            "type": "log",
            "executionId": execution.id,
            "log": log.dict()
        }
        
        if execution.workflow_id in self.subscriptions:
            for client_id in self.subscriptions[execution.workflow_id]:
                await self.connection_manager.send_message(client_id, message)
                
    def subscribe_client(self, client_id: str, workflow_id: str):
        """클라이언트 구독"""
        if workflow_id not in self.subscriptions:
            self.subscriptions[workflow_id] = set()
        self.subscriptions[workflow_id].add(client_id)
        
    def unsubscribe_client(self, client_id: str, workflow_id: str):
        """클라이언트 구독 해제"""
        if workflow_id in self.subscriptions:
            self.subscriptions[workflow_id].discard(client_id)
            
    def unsubscribe_all(self, client_id: str):
        """모든 구독 해제"""
        for workflow_id in self.subscriptions:
            self.subscriptions[workflow_id].discard(client_id)
            
    async def stop_execution(self, execution_id: str):
        """실행 중지"""
        execution = self.executions.get(execution_id)
        if execution and execution.status == ExecutionStatus.RUNNING:
            execution.status = ExecutionStatus.CANCELLED
            # 실행 중인 태스크 취소 로직 추가 필요
            
    def get_execution_logs(self, execution_id: str) -> List[Dict[str, Any]]:
        """실행 로그 조회"""
        execution = self.executions.get(execution_id)
        if execution:
            return [log.dict() for log in execution.logs]
        return []
        
    def get_status(self) -> Dict[str, Any]:
        """엔진 상태"""
        return {
            "workflows": len(self.workflows),
            "active_executions": sum(
                1 for e in self.executions.values() 
                if e.status == ExecutionStatus.RUNNING
            ),
            "total_executions": len(self.executions)
        }
        
    async def start_background_tasks(self):
        """백그라운드 태스크 시작"""
        # 스케줄된 워크플로우 실행 등
        pass
        
    async def shutdown(self):
        """엔진 종료"""
        # 실행 중인 워크플로우 정리
        for execution in self.executions.values():
            if execution.status == ExecutionStatus.RUNNING:
                await self.stop_execution(execution.id)
