import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional
import importlib

class FlowNode:
    """Flow 노드 - 워크플로우 실행 관리"""
    
    def __init__(self):
        self.config_dir = Path("config/nodes")
        self.data_dir = Path("data/flow")
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # 실행 상태 관리
        self.execution_status: Dict[str, Any] = {}
        self.execution_queue: List[Dict[str, Any]] = []
        self.is_running: bool = False
    
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Flow 노드 실행"""
        try:
            # 설정 로드
            config = await self.load_config(node_id)
            
            # 실행 목록
            execution_list = data.get('executionList', [])
            manager_nodes = data.get('managerNodes', [])
            
            if not execution_list and not manager_nodes:
                return {
                    "status": "success",
                    "message": "No nodes to execute",
                    "results": []
                }
            
            # 실행 계획 생성
            execution_plan = await self.create_execution_plan(
                execution_list, 
                manager_nodes,
                config
            )
            
            # 실행
            self.is_running = True
            execution_results = await self.execute_workflow(
                node_id,
                execution_plan,
                data
            )
            self.is_running = False
            
            # 결과 분석
            summary = self.analyze_results(execution_results)
            
            # 결과 저장
            result = {
                "executionPlan": execution_plan,
                "results": execution_results,
                "summary": summary,
                "totalExecutionTime": sum(r.get('executionTime', 0) for r in execution_results),
                "timestamp": datetime.now().isoformat()
            }
            
            await self.save_results(node_id, result)
            
            return {
                "status": "success",
                "result": result
            }
            
        except Exception as e:
            self.is_running = False
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
            "executionMode": "sequential",  # sequential, parallel, mixed
            "errorHandling": "continue",    # stop, continue, retry
            "maxRetries": 3,
            "retryDelay": 5,  # seconds
            "timeout": 300,   # seconds per node
            "managerExecutionInterval": 10  # Execute managers every N nodes
        }
    
    async def create_execution_plan(
        self, 
        execution_list: List[Dict[str, Any]], 
        manager_nodes: List[str],
        config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """실행 계획 생성"""
        plan = []
        
        # 기본 실행 목록 추가
        for idx, item in enumerate(execution_list):
            plan.append({
                "order": idx,
                "nodeId": item.get('nodeId'),
                "nodeType": item.get('type', 'worker'),
                "isManager": False,
                "dependencies": item.get('dependencies', []),
                "estimatedTime": item.get('estimatedTime', 30)
            })
            
            # 매니저 노드 실행 간격 확인
            interval = config.get('managerExecutionInterval', 10)
            if (idx + 1) % interval == 0 and manager_nodes:
                # 매니저 노드 삽입
                for manager_id in manager_nodes:
                    plan.append({
                        "order": len(plan),
                        "nodeId": manager_id,
                        "nodeType": self.get_manager_type(manager_id),
                        "isManager": True,
                        "dependencies": [],
                        "estimatedTime": 60
                    })
        
        # 의존성 검증
        plan = self.validate_dependencies(plan)
        
        return plan
    
    def get_manager_type(self, node_id: str) -> str:
        """매니저 노드 타입 추론"""
        if 'supervisor' in node_id.lower():
            return 'supervisor'
        elif 'planner' in node_id.lower():
            return 'planner'
        elif 'watcher' in node_id.lower():
            return 'watcher'
        elif 'scheduler' in node_id.lower():
            return 'scheduler'
        else:
            return 'manager'
    
    def validate_dependencies(self, plan: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """의존성 검증 및 순서 조정"""
        # 노드 ID to 인덱스 매핑
        node_index = {item['nodeId']: idx for idx, item in enumerate(plan)}
        
        # 의존성 기반 순서 조정
        validated = []
        visited = set()
        
        def visit(item):
            if item['nodeId'] in visited:
                return
                
            visited.add(item['nodeId'])
            
            # 의존성 먼저 방문
            for dep in item['dependencies']:
                if dep in node_index and dep not in visited:
                    visit(plan[node_index[dep]])
            
            validated.append(item)
        
        # 모든 노드 방문
        for item in plan:
            visit(item)
        
        # 순서 재할당
        for idx, item in enumerate(validated):
            item['order'] = idx
        
        return validated
    
    async def execute_workflow(
        self, 
        flow_node_id: str,
        execution_plan: List[Dict[str, Any]], 
        data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """워크플로우 실행"""
        results = []
        execution_mode = data.get('executionMode', 'sequential')
        
        if execution_mode == 'sequential':
            results = await self.execute_sequential(flow_node_id, execution_plan, data)
        elif execution_mode == 'parallel':
            results = await self.execute_parallel(flow_node_id, execution_plan, data)
        else:  # mixed
            results = await self.execute_mixed(flow_node_id, execution_plan, data)
        
        return results
    
    async def execute_sequential(
        self,
        flow_node_id: str,
        execution_plan: List[Dict[str, Any]], 
        data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """순차 실행"""
        results = []
        previous_output = {}
        
        for item in execution_plan:
            if not self.is_running:
                break
                
            # 실행 상태 업데이트
            await self.update_execution_status(flow_node_id, item['nodeId'], 'running')
            
            # 노드 실행
            start_time = datetime.now()
            
            try:
                result = await self.execute_single_node(
                    item['nodeId'],
                    item['nodeType'],
                    {**data, 'inputData': previous_output}
                )
                
                execution_time = (datetime.now() - start_time).total_seconds()
                
                results.append({
                    "nodeId": item['nodeId'],
                    "nodeType": item['nodeType'],
                    "status": "success",
                    "result": result,
                    "executionTime": execution_time,
                    "timestamp": datetime.now().isoformat()
                })
                
                # 다음 노드를 위한 출력 저장
                if result.get('output'):
                    previous_output = result['output']
                
                await self.update_execution_status(flow_node_id, item['nodeId'], 'completed')
                
            except Exception as e:
                execution_time = (datetime.now() - start_time).total_seconds()
                
                results.append({
                    "nodeId": item['nodeId'],
                    "nodeType": item['nodeType'],
                    "status": "error",
                    "error": str(e),
                    "executionTime": execution_time,
                    "timestamp": datetime.now().isoformat()
                })
                
                await self.update_execution_status(flow_node_id, item['nodeId'], 'error')
                
                # 에러 처리 정책
                if data.get('errorHandling', 'continue') == 'stop':
                    break
        
        return results
    
    async def execute_parallel(
        self,
        flow_node_id: str,
        execution_plan: List[Dict[str, Any]], 
        data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """병렬 실행"""
        # 의존성 없는 노드들을 동시에 실행
        groups = self.group_by_dependencies(execution_plan)
        results = []
        
        for group in groups:
            if not self.is_running:
                break
                
            # 그룹 내 노드들을 병렬 실행
            tasks = []
            for item in group:
                task = asyncio.create_task(
                    self.execute_single_node_async(flow_node_id, item, data)
                )
                tasks.append((item, task))
            
            # 모든 태스크 완료 대기
            for item, task in tasks:
                try:
                    result = await task
                    results.append(result)
                except Exception as e:
                    results.append({
                        "nodeId": item['nodeId'],
                        "nodeType": item['nodeType'],
                        "status": "error",
                        "error": str(e),
                        "timestamp": datetime.now().isoformat()
                    })
        
        return results
    
    async def execute_mixed(
        self,
        flow_node_id: str,
        execution_plan: List[Dict[str, Any]], 
        data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """혼합 실행 (의존성에 따라 순차/병렬)"""
        # 실제로는 더 복잡한 로직 필요
        return await self.execute_sequential(flow_node_id, execution_plan, data)
    
    def group_by_dependencies(self, execution_plan: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """의존성에 따라 그룹화"""
        groups = []
        completed = set()
        
        while len(completed) < len(execution_plan):
            group = []
            
            for item in execution_plan:
                if item['nodeId'] in completed:
                    continue
                    
                # 모든 의존성이 완료되었는지 확인
                if all(dep in completed for dep in item['dependencies']):
                    group.append(item)
            
            if group:
                groups.append(group)
                for item in group:
                    completed.add(item['nodeId'])
            else:
                # 순환 의존성 방지
                break
        
        return groups
    
    async def execute_single_node(
        self, 
        node_id: str, 
        node_type: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """단일 노드 실행"""
        # 동적으로 노드 모듈 로드
        try:
            module = importlib.import_module(f'nodes.{node_type}')
            execute_func = getattr(module, 'execute')
            
            result = await execute_func(node_id, data)
            return result
            
        except ImportError:
            raise Exception(f"Unknown node type: {node_type}")
        except Exception as e:
            raise Exception(f"Error executing node {node_id}: {str(e)}")
    
    async def execute_single_node_async(
        self,
        flow_node_id: str,
        item: Dict[str, Any],
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """비동기 단일 노드 실행"""
        await self.update_execution_status(flow_node_id, item['nodeId'], 'running')
        
        start_time = datetime.now()
        
        try:
            result = await self.execute_single_node(
                item['nodeId'],
                item['nodeType'],
                data
            )
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            await self.update_execution_status(flow_node_id, item['nodeId'], 'completed')
            
            return {
                "nodeId": item['nodeId'],
                "nodeType": item['nodeType'],
                "status": "success",
                "result": result,
                "executionTime": execution_time,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            execution_time = (datetime.now() - start_time).total_seconds()
            
            await self.update_execution_status(flow_node_id, item['nodeId'], 'error')
            
            return {
                "nodeId": item['nodeId'],
                "nodeType": item['nodeType'],
                "status": "error",
                "error": str(e),
                "executionTime": execution_time,
                "timestamp": datetime.now().isoformat()
            }
    
    async def update_execution_status(self, flow_node_id: str, node_id: str, status: str):
        """실행 상태 업데이트"""
        if flow_node_id not in self.execution_status:
            self.execution_status[flow_node_id] = {}
        
        self.execution_status[flow_node_id][node_id] = {
            "status": status,
            "timestamp": datetime.now().isoformat()
        }
        
        # WebSocket으로 상태 브로드캐스트 (실제 구현에서)
        # await broadcast_status_update(flow_node_id, node_id, status)
    
    def analyze_results(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """실행 결과 분석"""
        total = len(results)
        successful = sum(1 for r in results if r['status'] == 'success')
        failed = sum(1 for r in results if r['status'] == 'error')
        
        total_time = sum(r.get('executionTime', 0) for r in results)
        avg_time = total_time / total if total > 0 else 0
        
        # 노드 타입별 통계
        type_stats = {}
        for result in results:
            node_type = result['nodeType']
            if node_type not in type_stats:
                type_stats[node_type] = {"success": 0, "error": 0, "total": 0}
            
            type_stats[node_type]['total'] += 1
            if result['status'] == 'success':
                type_stats[node_type]['success'] += 1
            else:
                type_stats[node_type]['error'] += 1
        
        return {
            "total": total,
            "successful": successful,
            "failed": failed,
            "successRate": (successful / total * 100) if total > 0 else 0,
            "totalExecutionTime": total_time,
            "averageExecutionTime": avg_time,
            "typeStatistics": type_stats,
            "errors": [
                {"nodeId": r['nodeId'], "error": r.get('error')}
                for r in results if r['status'] == 'error'
            ]
        }
    
    async def save_results(self, node_id: str, results: Dict[str, Any]):
        """결과 저장"""
        result_file = self.data_dir / f"{node_id}_results.json"
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        # 실행 이력 저장
        history_file = self.data_dir / f"{node_id}_history.json"
        history = []
        
        if history_file.exists():
            with open(history_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
        
        history.append({
            "timestamp": results['timestamp'],
            "summary": results['summary'],
            "executionCount": len(results['results'])
        })
        
        # 최근 100개 실행 이력만 유지
        history = history[-100:]
        
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    
    async def stop_execution(self, node_id: str):
        """실행 중지"""
        self.is_running = False
        
        # 실행 중인 노드들에 중지 신호 전송
        if node_id in self.execution_status:
            for node_id, status in self.execution_status[node_id].items():
                if status['status'] == 'running':
                    await self.update_execution_status(node_id, node_id, 'stopped')


# 모듈 레벨 인스턴스
flow_node = FlowNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await flow_node.execute(node_id, data)