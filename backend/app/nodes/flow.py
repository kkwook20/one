# backend/app/nodes/flow.py

import asyncio
import json
from datetime import datetime
from typing import Dict, Any, List, Optional, Set
import networkx as nx

from app.models.node import Node, NodeData
from app.storage.node_storage import node_storage
from app.core.variable_resolver import variable_resolver
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class FlowNode:
    """Flow 노드 - 실행 흐름 제어 및 조건부 실행"""
    
    def __init__(self):
        self.execution_modes = {
            "sequential": self.execute_sequential,
            "parallel": self.execute_parallel,
            "conditional": self.execute_conditional,
            "loop": self.execute_loop,
            "schedule": self.execute_schedule
        }
        
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Flow 노드 실행 - 워크플로우 제어"""
        try:
            # 실행 모드
            mode = data.get('mode', 'sequential')
            
            # 실행 대상 노드들
            target_nodes = data.get('targetNodes', [])
            if not target_nodes:
                return {
                    "status": "success",
                    "message": "No target nodes to execute",
                    "executed_nodes": [],
                    "timestamp": datetime.now().isoformat()
                }
                
            # 실행 조건
            conditions = data.get('conditions', {})
            
            # 루프 설정
            loop_config = data.get('loopConfig', {})
            
            # 실행 이력 초기화
            execution_log = []
            
            # 모드별 실행
            if mode in self.execution_modes:
                result = await self.execution_modes[mode](
                    node_id,
                    target_nodes,
                    conditions,
                    loop_config,
                    data,
                    execution_log
                )
            else:
                result = {
                    "status": "error",
                    "error": f"Unknown execution mode: {mode}"
                }
                
            # 실행 이력 저장
            await self.save_execution_history(node_id, execution_log)
            
            # 실행 통계 업데이트
            await self.update_execution_stats(node_id, result)
            
            return {
                **result,
                "execution_log": execution_log,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Flow node error: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            
    async def execute_sequential(
        self,
        node_id: str,
        target_nodes: List[str],
        conditions: Dict[str, Any],
        loop_config: Dict[str, Any],
        data: Dict[str, Any],
        execution_log: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """순차 실행"""
        executed_nodes = []
        failed_nodes = []
        
        for target_node_id in target_nodes:
            # 실행 조건 확인
            if not await self.check_conditions(target_node_id, conditions, data):
                execution_log.append({
                    "node_id": target_node_id,
                    "status": "skipped",
                    "reason": "Condition not met",
                    "timestamp": datetime.now().isoformat()
                })
                continue
                
            # 노드 실행
            try:
                result = await self.execute_node(target_node_id, data)
                
                execution_log.append({
                    "node_id": target_node_id,
                    "status": result.get('status', 'unknown'),
                    "output": result.get('output'),
                    "execution_time": result.get('execution_time'),
                    "timestamp": datetime.now().isoformat()
                })
                
                if result.get('status') == 'success':
                    executed_nodes.append(target_node_id)
                    
                    # 출력을 다음 노드의 입력으로 전달
                    if data.get('passOutput', True):
                        data['previousOutput'] = result.get('output', {})
                else:
                    failed_nodes.append(target_node_id)
                    
                    # 실패 시 중단 옵션
                    if data.get('stopOnError', True):
                        break
                        
            except Exception as e:
                logger.error(f"Failed to execute node {target_node_id}: {e}")
                failed_nodes.append(target_node_id)
                
                execution_log.append({
                    "node_id": target_node_id,
                    "status": "error",
                    "error": str(e),
                    "timestamp": datetime.now().isoformat()
                })
                
                if data.get('stopOnError', True):
                    break
                    
        return {
            "status": "success" if not failed_nodes else "partial",
            "executed_nodes": executed_nodes,
            "failed_nodes": failed_nodes,
            "total_nodes": len(target_nodes)
        }
        
    async def execute_parallel(
        self,
        node_id: str,
        target_nodes: List[str],
        conditions: Dict[str, Any],
        loop_config: Dict[str, Any],
        data: Dict[str, Any],
        execution_log: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """병렬 실행"""
        # 실행할 노드 필터링
        nodes_to_execute = []
        for target_node_id in target_nodes:
            if await self.check_conditions(target_node_id, conditions, data):
                nodes_to_execute.append(target_node_id)
            else:
                execution_log.append({
                    "node_id": target_node_id,
                    "status": "skipped",
                    "reason": "Condition not met",
                    "timestamp": datetime.now().isoformat()
                })
                
        # 병렬 실행
        tasks = []
        for target_node_id in nodes_to_execute:
            task = asyncio.create_task(
                self.execute_node_with_logging(target_node_id, data, execution_log)
            )
            tasks.append((target_node_id, task))
            
        # 모든 작업 완료 대기
        executed_nodes = []
        failed_nodes = []
        outputs = {}
        
        for target_node_id, task in tasks:
            try:
                result = await task
                if result.get('status') == 'success':
                    executed_nodes.append(target_node_id)
                    outputs[target_node_id] = result.get('output', {})
                else:
                    failed_nodes.append(target_node_id)
                    
            except Exception as e:
                logger.error(f"Parallel execution failed for {target_node_id}: {e}")
                failed_nodes.append(target_node_id)
                
        return {
            "status": "success" if not failed_nodes else "partial",
            "executed_nodes": executed_nodes,
            "failed_nodes": failed_nodes,
            "outputs": outputs,
            "total_nodes": len(target_nodes)
        }
        
    async def execute_conditional(
        self,
        node_id: str,
        target_nodes: List[str],
        conditions: Dict[str, Any],
        loop_config: Dict[str, Any],
        data: Dict[str, Any],
        execution_log: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """조건부 실행"""
        executed_nodes = []
        skipped_nodes = []
        
        # 조건별 노드 그룹
        condition_groups = conditions.get('groups', [])
        
        for group in condition_groups:
            # 그룹 조건 평가
            if await self.evaluate_condition(group.get('condition', {}), data):
                # 해당 그룹의 노드들 실행
                group_nodes = group.get('nodes', [])
                
                for target_node_id in group_nodes:
                    if target_node_id in target_nodes:
                        try:
                            result = await self.execute_node(target_node_id, data)
                            
                            execution_log.append({
                                "node_id": target_node_id,
                                "status": result.get('status', 'unknown'),
                                "group": group.get('name', 'default'),
                                "timestamp": datetime.now().isoformat()
                            })
                            
                            if result.get('status') == 'success':
                                executed_nodes.append(target_node_id)
                                
                        except Exception as e:
                            logger.error(f"Conditional execution failed: {e}")
                            
                # 배타적 실행 모드
                if group.get('exclusive', False):
                    break
            else:
                # 조건 미충족 노드들
                skipped_nodes.extend(group.get('nodes', []))
                
        return {
            "status": "success",
            "executed_nodes": executed_nodes,
            "skipped_nodes": skipped_nodes,
            "total_nodes": len(target_nodes)
        }
        
    async def execute_loop(
        self,
        node_id: str,
        target_nodes: List[str],
        conditions: Dict[str, Any],
        loop_config: Dict[str, Any],
        data: Dict[str, Any],
        execution_log: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """반복 실행"""
        max_iterations = loop_config.get('maxIterations', 10)
        loop_type = loop_config.get('type', 'count')  # count, while, foreach
        
        executed_nodes = []
        iteration_results = []
        
        if loop_type == 'count':
            # 횟수 기반 반복
            count = loop_config.get('count', 1)
            
            for i in range(min(count, max_iterations)):
                iteration_data = {**data, 'iteration': i}
                
                for target_node_id in target_nodes:
                    result = await self.execute_node(target_node_id, iteration_data)
                    
                    execution_log.append({
                        "node_id": target_node_id,
                        "iteration": i,
                        "status": result.get('status', 'unknown'),
                        "timestamp": datetime.now().isoformat()
                    })
                    
                    if result.get('status') == 'success':
                        executed_nodes.append(f"{target_node_id}_{i}")
                        
                iteration_results.append({
                    "iteration": i,
                    "results": result
                })
                
        elif loop_type == 'while':
            # 조건 기반 반복
            iteration = 0
            while iteration < max_iterations:
                # 반복 조건 평가
                if not await self.evaluate_condition(loop_config.get('condition', {}), data):
                    break
                    
                iteration_data = {**data, 'iteration': iteration}
                
                for target_node_id in target_nodes:
                    result = await self.execute_node(target_node_id, iteration_data)
                    
                    execution_log.append({
                        "node_id": target_node_id,
                        "iteration": iteration,
                        "status": result.get('status', 'unknown'),
                        "timestamp": datetime.now().isoformat()
                    })
                    
                    # 결과를 다음 반복의 입력으로
                    if result.get('output'):
                        data.update(result['output'])
                        
                iteration_results.append({
                    "iteration": iteration,
                    "results": result
                })
                
                iteration += 1
                
        elif loop_type == 'foreach':
            # 컬렉션 기반 반복
            items = loop_config.get('items', [])
            item_key = loop_config.get('itemKey', 'item')
            
            for i, item in enumerate(items[:max_iterations]):
                iteration_data = {**data, item_key: item, 'index': i}
                
                for target_node_id in target_nodes:
                    result = await self.execute_node(target_node_id, iteration_data)
                    
                    execution_log.append({
                        "node_id": target_node_id,
                        "iteration": i,
                        "item": str(item)[:100],  # 로그용 요약
                        "status": result.get('status', 'unknown'),
                        "timestamp": datetime.now().isoformat()
                    })
                    
                iteration_results.append({
                    "iteration": i,
                    "item": item,
                    "results": result
                })
                
        return {
            "status": "success",
            "executed_nodes": executed_nodes,
            "total_iterations": len(iteration_results),
            "iteration_results": iteration_results
        }
        
    async def execute_schedule(
        self,
        node_id: str,
        target_nodes: List[str],
        conditions: Dict[str, Any],
        loop_config: Dict[str, Any],
        data: Dict[str, Any],
        execution_log: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """스케줄 기반 실행 (설정만 저장)"""
        schedule_config = data.get('scheduleConfig', {})
        
        # 스케줄 작업 생성
        scheduled_tasks = []
        
        for target_node_id in target_nodes:
            task = {
                "node_id": target_node_id,
                "schedule": schedule_config,
                "conditions": conditions,
                "created_at": datetime.now().isoformat(),
                "enabled": True
            }
            scheduled_tasks.append(task)
            
        # 스케줄 저장
        existing_schedules = await node_storage.get_data(node_id, 'schedules') or []
        existing_schedules.extend(scheduled_tasks)
        await node_storage.save_data(node_id, 'schedules', existing_schedules)
        
        return {
            "status": "success",
            "message": f"Scheduled {len(scheduled_tasks)} tasks",
            "scheduled_tasks": scheduled_tasks
        }
        
    async def check_conditions(
        self,
        target_node_id: str,
        conditions: Dict[str, Any],
        data: Dict[str, Any]
    ) -> bool:
        """실행 조건 확인"""
        # 노드별 조건
        node_conditions = conditions.get(target_node_id, {})
        if not node_conditions:
            return True
            
        return await self.evaluate_condition(node_conditions, data)
        
    async def evaluate_condition(
        self,
        condition: Dict[str, Any],
        data: Dict[str, Any]
    ) -> bool:
        """조건 평가"""
        condition_type = condition.get('type', 'simple')
        
        if condition_type == 'simple':
            # 단순 비교
            field = condition.get('field')
            operator = condition.get('operator', '==')
            value = condition.get('value')
            
            # 필드 값 가져오기
            field_value = data
            for part in field.split('.'):
                if isinstance(field_value, dict):
                    field_value = field_value.get(part)
                else:
                    break
                    
            # 연산자별 비교
            if operator == '==':
                return field_value == value
            elif operator == '!=':
                return field_value != value
            elif operator == '>':
                return field_value > value
            elif operator == '<':
                return field_value < value
            elif operator == '>=':
                return field_value >= value
            elif operator == '<=':
                return field_value <= value
            elif operator == 'in':
                return field_value in value
            elif operator == 'not_in':
                return field_value not in value
            elif operator == 'exists':
                return field_value is not None
            elif operator == 'not_exists':
                return field_value is None
                
        elif condition_type == 'complex':
            # 복합 조건 (AND/OR)
            logic = condition.get('logic', 'AND')
            sub_conditions = condition.get('conditions', [])
            
            results = []
            for sub_condition in sub_conditions:
                result = await self.evaluate_condition(sub_condition, data)
                results.append(result)
                
            if logic == 'AND':
                return all(results)
            elif logic == 'OR':
                return any(results)
                
        elif condition_type == 'script':
            # Python 표현식
            expression = condition.get('expression', 'True')
            try:
                # 안전한 평가를 위한 제한된 환경
                safe_globals = {
                    '__builtins__': {},
                    'data': data,
                    'len': len,
                    'str': str,
                    'int': int,
                    'float': float,
                    'bool': bool
                }
                return eval(expression, safe_globals)
            except Exception as e:
                logger.warning(f"Failed to evaluate expression: {e}")
                return False
                
        return True
        
    async def execute_node(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """단일 노드 실행"""
        try:
            # 노드 타입 확인
            node_data = await node_storage.get_data(node_id, 'node')
            if not node_data:
                return {
                    "status": "error",
                    "error": f"Node not found: {node_id}"
                }
                
            node_type = node_data.get('type', 'worker')
            
            # 노드 타입별 실행 모듈 동적 로드
            module_name = f"app.nodes.{node_type}"
            try:
                module = __import__(module_name, fromlist=['execute'])
                execute_func = getattr(module, 'execute')
                
                # 노드 실행
                result = await execute_func(node_id, data)
                return result
                
            except ImportError:
                logger.error(f"Node type module not found: {module_name}")
                return {
                    "status": "error",
                    "error": f"Unknown node type: {node_type}"
                }
                
        except Exception as e:
            logger.error(f"Node execution failed: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
            
    async def execute_node_with_logging(
        self,
        node_id: str,
        data: Dict[str, Any],
        execution_log: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """로깅과 함께 노드 실행"""
        start_time = datetime.now()
        
        try:
            result = await self.execute_node(node_id, data)
            
            execution_log.append({
                "node_id": node_id,
                "status": result.get('status', 'unknown'),
                "output": result.get('output'),
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "timestamp": datetime.now().isoformat()
            })
            
            return result
            
        except Exception as e:
            execution_log.append({
                "node_id": node_id,
                "status": "error",
                "error": str(e),
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "timestamp": datetime.now().isoformat()
            })
            raise
            
    async def save_execution_history(
        self,
        node_id: str,
        execution_log: List[Dict[str, Any]]
    ):
        """실행 이력 저장"""
        history = await node_storage.get_data(node_id, 'execution_history') or []
        
        # 실행 요약 생성
        summary = {
            "executed_at": datetime.now().isoformat(),
            "total_nodes": len(set(log['node_id'] for log in execution_log)),
            "successful": sum(1 for log in execution_log if log.get('status') == 'success'),
            "failed": sum(1 for log in execution_log if log.get('status') == 'error'),
            "skipped": sum(1 for log in execution_log if log.get('status') == 'skipped'),
            "logs": execution_log
        }
        
        history.append(summary)
        
        # 최대 100개 유지
        history = history[-100:]
        
        await node_storage.save_data(node_id, 'execution_history', history)
        
    async def update_execution_stats(self, node_id: str, result: Dict[str, Any]):
        """실행 통계 업데이트"""
        stats = await node_storage.get_data(node_id, 'execution_stats') or {
            "total_executions": 0,
            "successful_executions": 0,
            "failed_executions": 0,
            "total_nodes_executed": 0
        }
        
        stats['total_executions'] += 1
        
        if result.get('status') == 'success':
            stats['successful_executions'] += 1
        else:
            stats['failed_executions'] += 1
            
        stats['total_nodes_executed'] += len(result.get('executed_nodes', []))
        stats['last_execution'] = datetime.now().isoformat()
        
        await node_storage.save_data(node_id, 'execution_stats', stats)

# 모듈 레벨 인스턴스
flow_node = FlowNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await flow_node.execute(node_id, data)