# backend/app/nodes/trigger.py

import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Callable
from croniter import croniter
import aiohttp

from app.models.node import Node, NodeData
from app.storage.node_storage import node_storage
from app.core.variable_resolver import variable_resolver
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class TriggerNode:
    """Trigger 노드 - 이벤트 기반 워크플로우 트리거"""
    
    def __init__(self):
        self.trigger_types = {
            "time": self.setup_time_trigger,
            "event": self.setup_event_trigger,
            "webhook": self.setup_webhook_trigger,
            "file": self.setup_file_trigger,
            "data": self.setup_data_trigger,
            "condition": self.setup_condition_trigger
        }
        self.active_triggers = {}
        self.webhook_handlers = {}
        
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Trigger 노드 실행"""
        try:
            operation = data.get('operation', 'setup')  # setup, activate, deactivate, status
            
            if operation == 'setup':
                result = await self.setup_triggers(node_id, data)
            elif operation == 'activate':
                result = await self.activate_triggers(node_id, data)
            elif operation == 'deactivate':
                result = await self.deactivate_triggers(node_id, data)
            elif operation == 'status':
                result = await self.get_trigger_status(node_id)
            elif operation == 'test':
                result = await self.test_trigger(node_id, data)
            elif operation == 'fire':
                # 수동 트리거 실행
                result = await self.fire_trigger(node_id, data)
            else:
                result = {
                    "status": "error",
                    "error": f"Unknown operation: {operation}"
                }
                
            # 트리거 상태 저장
            await self.save_trigger_state(node_id)
            
            return {
                **result,
                "operation": operation,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Trigger node error: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            
    async def setup_triggers(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """트리거 설정"""
        triggers = data.get('triggers', [])
        setup_results = []
        
        for trigger_config in triggers:
            trigger_type = trigger_config.get('type')
            trigger_id = trigger_config.get('id', f"{node_id}_{trigger_type}_{datetime.now().timestamp()}")
            
            if trigger_type in self.trigger_types:
                try:
                    # 트리거 타입별 설정
                    setup_result = await self.trigger_types[trigger_type](
                        node_id,
                        trigger_id,
                        trigger_config
                    )
                    
                    setup_results.append({
                        "trigger_id": trigger_id,
                        "type": trigger_type,
                        "status": "configured",
                        "config": trigger_config,
                        **setup_result
                    })
                    
                except Exception as e:
                    logger.error(f"Failed to setup {trigger_type} trigger: {e}")
                    setup_results.append({
                        "trigger_id": trigger_id,
                        "type": trigger_type,
                        "status": "error",
                        "error": str(e)
                    })
            else:
                setup_results.append({
                    "trigger_id": trigger_id,
                    "type": trigger_type,
                    "status": "error",
                    "error": f"Unknown trigger type: {trigger_type}"
                })
                
        # 트리거 설정 저장
        await node_storage.save_data(node_id, 'trigger_configs', setup_results)
        
        return {
            "status": "success",
            "configured_triggers": len([r for r in setup_results if r['status'] == 'configured']),
            "failed_triggers": len([r for r in setup_results if r['status'] == 'error']),
            "results": setup_results
        }
        
    async def setup_time_trigger(
        self, 
        node_id: str, 
        trigger_id: str, 
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """시간 기반 트리거 설정"""
        schedule_type = config.get('schedule_type', 'interval')  # interval, cron, specific
        
        trigger_info = {
            "node_id": node_id,
            "trigger_id": trigger_id,
            "type": "time",
            "config": config,
            "active": False,
            "last_fired": None,
            "next_fire": None
        }
        
        if schedule_type == 'interval':
            # 간격 기반
            interval_seconds = config.get('interval_seconds', 3600)
            trigger_info['interval_seconds'] = interval_seconds
            trigger_info['next_fire'] = (
                datetime.now() + timedelta(seconds=interval_seconds)
            ).isoformat()
            
        elif schedule_type == 'cron':
            # Cron 표현식
            cron_expression = config.get('cron_expression', '0 * * * *')
            try:
                cron = croniter(cron_expression, datetime.now())
                trigger_info['cron_expression'] = cron_expression
                trigger_info['next_fire'] = cron.get_next(datetime).isoformat()
            except Exception as e:
                return {"error": f"Invalid cron expression: {e}"}
                
        elif schedule_type == 'specific':
            # 특정 시간
            fire_times = config.get('fire_times', [])
            trigger_info['fire_times'] = fire_times
            
            # 다음 실행 시간 찾기
            future_times = [
                datetime.fromisoformat(t) for t in fire_times 
                if datetime.fromisoformat(t) > datetime.now()
            ]
            if future_times:
                trigger_info['next_fire'] = min(future_times).isoformat()
                
        # 트리거 등록
        self.active_triggers[trigger_id] = trigger_info
        
        return {"schedule_type": schedule_type}
        
    async def setup_event_trigger(
        self, 
        node_id: str, 
        trigger_id: str, 
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """이벤트 기반 트리거 설정"""
        event_type = config.get('event_type')  # node_complete, error, custom
        event_source = config.get('event_source')  # 노드 ID 또는 시스템
        
        trigger_info = {
            "node_id": node_id,
            "trigger_id": trigger_id,
            "type": "event",
            "config": config,
            "active": False,
            "event_type": event_type,
            "event_source": event_source,
            "event_count": 0
        }
        
        # 이벤트 필터
        if config.get('event_filter'):
            trigger_info['event_filter'] = config['event_filter']
            
        self.active_triggers[trigger_id] = trigger_info
        
        return {
            "event_type": event_type,
            "event_source": event_source
        }
        
    async def setup_webhook_trigger(
        self, 
        node_id: str, 
        trigger_id: str, 
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """웹훅 트리거 설정"""
        webhook_path = config.get('webhook_path', f'/webhook/{trigger_id}')
        method = config.get('method', 'POST')
        
        trigger_info = {
            "node_id": node_id,
            "trigger_id": trigger_id,
            "type": "webhook",
            "config": config,
            "active": False,
            "webhook_path": webhook_path,
            "method": method,
            "call_count": 0
        }
        
        # 인증 설정
        if config.get('auth'):
            trigger_info['auth'] = config['auth']
            
        # 웹훅 핸들러 등록
        self.webhook_handlers[webhook_path] = trigger_id
        self.active_triggers[trigger_id] = trigger_info
        
        return {
            "webhook_url": f"http://localhost:8000{webhook_path}",
            "method": method
        }
        
    async def setup_file_trigger(
        self, 
        node_id: str, 
        trigger_id: str, 
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """파일 시스템 트리거 설정"""
        watch_path = config.get('watch_path')
        watch_events = config.get('events', ['created', 'modified'])
        file_pattern = config.get('file_pattern', '*')
        
        trigger_info = {
            "node_id": node_id,
            "trigger_id": trigger_id,
            "type": "file",
            "config": config,
            "active": False,
            "watch_path": watch_path,
            "watch_events": watch_events,
            "file_pattern": file_pattern,
            "detected_files": []
        }
        
        self.active_triggers[trigger_id] = trigger_info
        
        return {
            "watch_path": watch_path,
            "events": watch_events
        }
        
    async def setup_data_trigger(
        self, 
        node_id: str, 
        trigger_id: str, 
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """데이터 변경 트리거 설정"""
        data_source = config.get('data_source')  # node_output, global_variable
        source_id = config.get('source_id')
        data_path = config.get('data_path')  # JSON path
        
        trigger_info = {
            "node_id": node_id,
            "trigger_id": trigger_id,
            "type": "data",
            "config": config,
            "active": False,
            "data_source": data_source,
            "source_id": source_id,
            "data_path": data_path,
            "last_value": None,
            "change_count": 0
        }
        
        # 변경 감지 조건
        if config.get('change_condition'):
            trigger_info['change_condition'] = config['change_condition']
            
        self.active_triggers[trigger_id] = trigger_info
        
        return {
            "data_source": data_source,
            "monitoring": f"{source_id}.{data_path}"
        }
        
    async def setup_condition_trigger(
        self, 
        node_id: str, 
        trigger_id: str, 
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """조건 기반 트리거 설정"""
        condition = config.get('condition', {})
        check_interval = config.get('check_interval', 60)  # 초
        
        trigger_info = {
            "node_id": node_id,
            "trigger_id": trigger_id,
            "type": "condition",
            "config": config,
            "active": False,
            "condition": condition,
            "check_interval": check_interval,
            "last_check": None,
            "condition_met_count": 0
        }
        
        self.active_triggers[trigger_id] = trigger_info
        
        return {
            "condition": condition,
            "check_interval": check_interval
        }
        
    async def activate_triggers(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """트리거 활성화"""
        trigger_ids = data.get('trigger_ids', [])
        
        if not trigger_ids:
            # 모든 트리거 활성화
            trigger_ids = [
                tid for tid, info in self.active_triggers.items()
                if info['node_id'] == node_id
            ]
            
        activated = []
        failed = []
        
        for trigger_id in trigger_ids:
            if trigger_id in self.active_triggers:
                try:
                    self.active_triggers[trigger_id]['active'] = True
                    self.active_triggers[trigger_id]['activated_at'] = datetime.now().isoformat()
                    
                    # 트리거 타입별 활성화 처리
                    trigger_type = self.active_triggers[trigger_id]['type']
                    if trigger_type == 'time':
                        # 타이머 시작
                        asyncio.create_task(self.run_time_trigger(trigger_id))
                    elif trigger_type == 'file':
                        # 파일 감시 시작
                        asyncio.create_task(self.run_file_watcher(trigger_id))
                    elif trigger_type == 'condition':
                        # 조건 체크 시작
                        asyncio.create_task(self.run_condition_checker(trigger_id))
                        
                    activated.append(trigger_id)
                    
                except Exception as e:
                    logger.error(f"Failed to activate trigger {trigger_id}: {e}")
                    failed.append(trigger_id)
            else:
                failed.append(trigger_id)
                
        return {
            "status": "success",
            "activated": activated,
            "failed": failed
        }
        
    async def deactivate_triggers(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """트리거 비활성화"""
        trigger_ids = data.get('trigger_ids', [])
        
        if not trigger_ids:
            # 모든 트리거 비활성화
            trigger_ids = [
                tid for tid, info in self.active_triggers.items()
                if info['node_id'] == node_id
            ]
            
        deactivated = []
        
        for trigger_id in trigger_ids:
            if trigger_id in self.active_triggers:
                self.active_triggers[trigger_id]['active'] = False
                self.active_triggers[trigger_id]['deactivated_at'] = datetime.now().isoformat()
                deactivated.append(trigger_id)
                
        return {
            "status": "success",
            "deactivated": deactivated
        }
        
    async def get_trigger_status(self, node_id: str) -> Dict[str, Any]:
        """트리거 상태 조회"""
        node_triggers = [
            info for tid, info in self.active_triggers.items()
            if info['node_id'] == node_id
        ]
        
        status = {
            "total_triggers": len(node_triggers),
            "active_triggers": len([t for t in node_triggers if t['active']]),
            "triggers": []
        }
        
        for trigger in node_triggers:
            status['triggers'].append({
                "trigger_id": trigger['trigger_id'],
                "type": trigger['type'],
                "active": trigger['active'],
                "last_fired": trigger.get('last_fired'),
                "next_fire": trigger.get('next_fire'),
                "fire_count": trigger.get('fire_count', 0)
            })
            
        return {
            "status": "success",
            **status
        }
        
    async def test_trigger(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """트리거 테스트"""
        trigger_id = data.get('trigger_id')
        
        if not trigger_id or trigger_id not in self.active_triggers:
            return {
                "status": "error",
                "error": f"Trigger not found: {trigger_id}"
            }
            
        # 테스트 실행
        test_data = data.get('test_data', {})
        result = await self.execute_triggered_workflow(
            trigger_id,
            test_data,
            is_test=True
        )
        
        return {
            "status": "success",
            "test_result": result
        }
        
    async def fire_trigger(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """수동 트리거 실행"""
        trigger_id = data.get('trigger_id')
        
        if not trigger_id:
            # 노드의 모든 활성 트리거 실행
            trigger_ids = [
                tid for tid, info in self.active_triggers.items()
                if info['node_id'] == node_id and info['active']
            ]
        else:
            trigger_ids = [trigger_id]
            
        results = []
        
        for tid in trigger_ids:
            if tid in self.active_triggers:
                result = await self.execute_triggered_workflow(
                    tid,
                    data.get('trigger_data', {})
                )
                results.append({
                    "trigger_id": tid,
                    "result": result
                })
                
        return {
            "status": "success",
            "fired_triggers": len(results),
            "results": results
        }
        
    async def execute_triggered_workflow(
        self, 
        trigger_id: str, 
        trigger_data: Dict[str, Any],
        is_test: bool = False
    ) -> Dict[str, Any]:
        """트리거된 워크플로우 실행"""
        trigger_info = self.active_triggers.get(trigger_id)
        if not trigger_info:
            return {"error": "Trigger not found"}
            
        # 실행 정보 준비
        execution_data = {
            "trigger_id": trigger_id,
            "trigger_type": trigger_info['type'],
            "trigger_data": trigger_data,
            "triggered_at": datetime.now().isoformat(),
            "is_test": is_test
        }
        
        # 대상 노드들 실행
        target_nodes = trigger_info['config'].get('target_nodes', [])
        
        if not target_nodes:
            return {"error": "No target nodes configured"}
            
        # Flow 노드를 통해 실행 (있는 경우)
        flow_node_id = trigger_info['config'].get('flow_node_id')
        
        if flow_node_id:
            # Flow 노드로 실행 위임
            from app.nodes.flow import flow_node
            result = await flow_node.execute(flow_node_id, {
                "mode": "sequential",
                "targetNodes": target_nodes,
                "triggerData": execution_data
            })
        else:
            # 직접 실행
            results = []
            for node_id in target_nodes:
                try:
                    # 노드 실행
                    from app.core.engine import WorkflowEngine
                    engine = WorkflowEngine()
                    node_result = await engine.execute_node(node_id, execution_data)
                    results.append({
                        "node_id": node_id,
                        "status": "success",
                        "result": node_result
                    })
                except Exception as e:
                    results.append({
                        "node_id": node_id,
                        "status": "error",
                        "error": str(e)
                    })
                    
            result = {
                "executed_nodes": len(results),
                "results": results
            }
            
        # 트리거 실행 기록 업데이트
        if not is_test:
            trigger_info['last_fired'] = datetime.now().isoformat()
            trigger_info['fire_count'] = trigger_info.get('fire_count', 0) + 1
            
            # 실행 이력 저장
            await self.save_trigger_history(trigger_id, execution_data, result)
            
        return result
        
    async def run_time_trigger(self, trigger_id: str):
        """시간 트리거 실행 루프"""
        while trigger_id in self.active_triggers and self.active_triggers[trigger_id]['active']:
            trigger_info = self.active_triggers[trigger_id]
            
            try:
                # 다음 실행 시간 확인
                next_fire = trigger_info.get('next_fire')
                if next_fire:
                    next_fire_dt = datetime.fromisoformat(next_fire)
                    
                    # 대기
                    wait_seconds = max(0, (next_fire_dt - datetime.now()).total_seconds())
                    if wait_seconds > 0:
                        await asyncio.sleep(wait_seconds)
                        
                    # 트리거 실행
                    if self.active_triggers[trigger_id]['active']:
                        await self.execute_triggered_workflow(trigger_id, {
                            "trigger_time": datetime.now().isoformat()
                        })
                        
                        # 다음 실행 시간 계산
                        schedule_type = trigger_info['config'].get('schedule_type')
                        
                        if schedule_type == 'interval':
                            interval = trigger_info['interval_seconds']
                            trigger_info['next_fire'] = (
                                datetime.now() + timedelta(seconds=interval)
                            ).isoformat()
                            
                        elif schedule_type == 'cron':
                            cron = croniter(trigger_info['cron_expression'], datetime.now())
                            trigger_info['next_fire'] = cron.get_next(datetime).isoformat()
                            
                        elif schedule_type == 'specific':
                            # 남은 시간 찾기
                            future_times = [
                                datetime.fromisoformat(t) for t in trigger_info['fire_times']
                                if datetime.fromisoformat(t) > datetime.now()
                            ]
                            if future_times:
                                trigger_info['next_fire'] = min(future_times).isoformat()
                            else:
                                # 모든 시간 실행 완료
                                trigger_info['active'] = False
                                break
                else:
                    # 다음 실행 시간이 없으면 대기
                    await asyncio.sleep(60)
                    
            except Exception as e:
                logger.error(f"Time trigger error: {e}")
                await asyncio.sleep(60)
                
    async def run_file_watcher(self, trigger_id: str):
        """파일 감시 루프"""
        import aionotify
        
        trigger_info = self.active_triggers[trigger_id]
        watch_path = trigger_info['watch_path']
        
        try:
            watcher = aionotify.Watcher()
            watcher.watch(watch_path, aionotify.Flags.CREATE | aionotify.Flags.MODIFY)
            
            await watcher.setup()
            
            while trigger_id in self.active_triggers and self.active_triggers[trigger_id]['active']:
                event = await watcher.get_event()
                
                # 파일 패턴 매칭
                import fnmatch
                if fnmatch.fnmatch(event.name, trigger_info['file_pattern']):
                    # 트리거 실행
                    await self.execute_triggered_workflow(trigger_id, {
                        "file_path": str(event.path),
                        "event_type": str(event.flags)
                    })
                    
                    trigger_info['detected_files'].append({
                        "path": str(event.path),
                        "event": str(event.flags),
                        "timestamp": datetime.now().isoformat()
                    })
                    
        except Exception as e:
            logger.error(f"File watcher error: {e}")
        finally:
            watcher.close()
            
    async def run_condition_checker(self, trigger_id: str):
        """조건 체크 루프"""
        while trigger_id in self.active_triggers and self.active_triggers[trigger_id]['active']:
            trigger_info = self.active_triggers[trigger_id]
            
            try:
                # 조건 평가
                condition = trigger_info['condition']
                condition_met = await self.evaluate_trigger_condition(condition)
                
                if condition_met:
                    # 트리거 실행
                    await self.execute_triggered_workflow(trigger_id, {
                        "condition": condition,
                        "evaluated_at": datetime.now().isoformat()
                    })
                    
                    trigger_info['condition_met_count'] += 1
                    
                trigger_info['last_check'] = datetime.now().isoformat()
                
                # 대기
                await asyncio.sleep(trigger_info['check_interval'])
                
            except Exception as e:
                logger.error(f"Condition checker error: {e}")
                await asyncio.sleep(60)
                
    async def evaluate_trigger_condition(self, condition: Dict[str, Any]) -> bool:
        """트리거 조건 평가"""
        # Flow 노드의 조건 평가 로직 재사용
        from app.nodes.flow import flow_node
        return await flow_node.evaluate_condition(condition, {})
        
    async def save_trigger_state(self, node_id: str):
        """트리거 상태 저장"""
        node_triggers = {
            tid: info for tid, info in self.active_triggers.items()
            if info['node_id'] == node_id
        }
        
        await node_storage.save_data(node_id, 'trigger_state', node_triggers)
        
    async def save_trigger_history(
        self, 
        trigger_id: str, 
        execution_data: Dict[str, Any],
        result: Dict[str, Any]
    ):
        """트리거 실행 이력 저장"""
        trigger_info = self.active_triggers[trigger_id]
        node_id = trigger_info['node_id']
        
        history = await node_storage.get_data(node_id, 'trigger_history') or []
        
        history.append({
            "trigger_id": trigger_id,
            "execution_data": execution_data,
            "result": result,
            "timestamp": datetime.now().isoformat()
        })
        
        # 최대 1000개 유지
        history = history[-1000:]
        
        await node_storage.save_data(node_id, 'trigger_history', history)
        
    def handle_webhook(self, path: str, method: str, data: Any) -> Optional[str]:
        """웹훅 처리 (외부에서 호출)"""
        trigger_id = self.webhook_handlers.get(path)
        
        if trigger_id and trigger_id in self.active_triggers:
            trigger_info = self.active_triggers[trigger_id]
            
            if trigger_info['active'] and trigger_info['method'] == method:
                # 비동기 실행
                asyncio.create_task(self.execute_triggered_workflow(trigger_id, {
                    "webhook_data": data,
                    "method": method,
                    "received_at": datetime.now().isoformat()
                }))
                
                trigger_info['call_count'] += 1
                return trigger_id
                
        return None

# 모듈 레벨 인스턴스  
trigger_node = TriggerNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await trigger_node.execute(node_id, data)