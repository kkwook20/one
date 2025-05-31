# backend/app/nodes/supervisor.py

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import httpx
import difflib

from app.models.node import Node, NodeData
from app.storage.node_storage import node_storage
from app.core.variable_resolver import variable_resolver
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class SupervisorNode:
    """Supervisor 노드 - 다른 노드들의 코드 수정 및 최적화"""
    
    def __init__(self):
        self.lm_studio_url = "http://localhost:1234/v1"
        self.max_modification_history = 20
        
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Supervisor 노드 실행 - 대상 노드들의 코드 수정"""
        try:
            # 설정 로드
            target_nodes = data.get('targetNodes', [])
            modification_mode = data.get('modificationMode', 'auto')  # auto, review, recommend
            planner_evaluation = data.get('plannerEvaluation', {})
            
            if not target_nodes:
                return {
                    "status": "success",
                    "message": "No target nodes to supervise",
                    "modifications": []
                }
                
            # 수정 작업 수행
            modifications = []
            
            for target_node_id in target_nodes:
                # 대상 노드 정보 가져오기
                target_info = await self.get_target_node_info(target_node_id)
                if not target_info:
                    continue
                    
                # 평가 기반 수정 필요성 판단
                evaluation = planner_evaluation.get(target_node_id, {})
                needs_modification = self.check_modification_needed(evaluation)
                
                if not needs_modification and modification_mode == 'auto':
                    continue
                    
                # 코드 수정 수행
                modification_result = await self.modify_node_code(
                    supervisor_node_id=node_id,
                    target_node_id=target_node_id,
                    target_info=target_info,
                    evaluation=evaluation,
                    mode=modification_mode
                )
                
                modifications.append(modification_result)
                
                # API 호출 제한 방지
                await asyncio.sleep(1)
                
            # 수정 이력 저장
            await self.save_modification_history(node_id, modifications)
            
            # 결과 분석
            summary = self.analyze_modifications(modifications)
            
            return {
                "status": "success",
                "modifications": modifications,
                "summary": summary,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Supervisor node error: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            
    async def get_target_node_info(self, node_id: str) -> Optional[Dict[str, Any]]:
        """대상 노드 정보 가져오기"""
        try:
            code = await node_storage.get_code(node_id)
            tasks = await node_storage.get_data(node_id, 'tasks')
            metadata = await node_storage.get_metadata(node_id)
            last_output = await node_storage.get_data(node_id, 'output')
            
            return {
                "node_id": node_id,
                "code": code or "",
                "tasks": tasks or [],
                "metadata": metadata or {},
                "last_output": last_output or {},
                "has_errors": metadata.get('last_error') is not None
            }
        except Exception as e:
            logger.error(f"Failed to get target node info: {e}")
            return None
            
    def check_modification_needed(self, evaluation: Dict[str, Any]) -> bool:
        """수정 필요성 판단"""
        if not evaluation:
            return False
            
        # 점수가 낮은 경우
        if evaluation.get('score', 100) < 70:
            return True
            
        # 특정 메트릭이 낮은 경우
        metrics = evaluation.get('metrics', {})
        if any(value < 50 for value in metrics.values()):
            return True
            
        # 이슈가 있는 경우
        if evaluation.get('issues'):
            return True
            
        return False
        
    async def modify_node_code(
        self,
        supervisor_node_id: str,
        target_node_id: str,
        target_info: Dict[str, Any],
        evaluation: Dict[str, Any],
        mode: str
    ) -> Dict[str, Any]:
        """노드 코드 수정"""
        original_code = target_info['code']
        
        # AI를 통한 코드 개선 제안 생성
        improvement_suggestions = await self.generate_code_improvements(
            original_code,
            target_info['tasks'],
            evaluation
        )
        
        if mode == 'recommend':
            # 추천만 제공
            return {
                "node_id": target_node_id,
                "action": "recommend",
                "original_code": original_code,
                "suggestions": improvement_suggestions,
                "timestamp": datetime.now().isoformat()
            }
            
        # 코드 수정 적용
        modified_code = await self.apply_improvements(
            original_code,
            improvement_suggestions
        )
        
        if mode == 'review':
            # 리뷰 모드 - 변경 사항만 반환
            diff = self.generate_diff(original_code, modified_code)
            
            return {
                "node_id": target_node_id,
                "action": "review",
                "original_code": original_code,
                "modified_code": modified_code,
                "diff": diff,
                "changes": improvement_suggestions,
                "timestamp": datetime.now().isoformat()
            }
            
        elif mode == 'auto':
            # 자동 수정 - 바로 저장
            await node_storage.save_code(
                target_node_id,
                modified_code,
                message=f"Auto-improved by Supervisor {supervisor_node_id}",
                author=f"Supervisor-{supervisor_node_id}"
            )
            
            # 자동 백업
            backup_path = await self.backup_original_code(
                target_node_id,
                original_code
            )
            
            return {
                "node_id": target_node_id,
                "action": "auto_modified",
                "backup_path": backup_path,
                "changes": improvement_suggestions,
                "code_diff": self.generate_diff(original_code, modified_code),
                "timestamp": datetime.now().isoformat()
            }
            
    async def generate_code_improvements(
        self,
        code: str,
        tasks: List[Dict[str, Any]],
        evaluation: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """AI를 통한 코드 개선 제안 생성"""
        try:
            # 작업 항목 상태 분석
            task_status = {
                "in_progress": sum(1 for t in tasks if t.get('status') == '○'),
                "not_modified": sum(1 for t in tasks if t.get('status') == '×'),
                "partially_modified": sum(1 for t in tasks if t.get('status') == '△')
            }
            
            prompt = f"""You are a code optimization expert. Analyze and improve the following Python code.

Current Code:
```python
{code}
```

Task Status:
- In Progress (○): {task_status['in_progress']}
- Not Modified (×): {task_status['not_modified']}  
- Partially Modified (△): {task_status['partially_modified']}

Evaluation Results:
{json.dumps(evaluation, indent=2)}

Please provide specific improvements for:
1. Performance optimization
2. Error handling
3. Code readability
4. Task completion efficiency
5. Resource usage

Return a JSON array of improvements with format:
[
    {{
        "type": "performance|error_handling|readability|efficiency|resource",
        "description": "Description of the improvement",
        "code_change": "Specific code to add/modify"
    }}
]
"""

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.lm_studio_url}/completions",
                    json={
                        "prompt": prompt,
                        "max_tokens": 2000,
                        "temperature": 0.3
                    },
                    timeout=60.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    text = result.get('choices', [{}])[0].get('text', '').strip()
                    
                    # JSON 파싱 시도
                    try:
                        improvements = json.loads(text)
                        return improvements
                    except:
                        # 파싱 실패 시 기본 제안
                        return [{
                            "type": "general",
                            "description": "AI analysis completed",
                            "code_change": text
                        }]
                        
        except Exception as e:
            logger.error(f"Failed to generate improvements: {e}")
            
        # 폴백: 기본 개선 사항
        return self.get_default_improvements(evaluation)
        
    def get_default_improvements(self, evaluation: Dict[str, Any]) -> List[Dict[str, str]]:
        """기본 개선 사항 제공"""
        improvements = []
        
        metrics = evaluation.get('metrics', {})
        
        if metrics.get('timeEfficiency', 100) < 50:
            improvements.append({
                "type": "performance",
                "description": "Add caching for repeated calculations",
                "code_change": "# Add memoization or caching"
            })
            
        if metrics.get('difficulty', 100) < 50:
            improvements.append({
                "type": "error_handling",
                "description": "Add comprehensive error handling",
                "code_change": "try:\n    # existing code\nexcept Exception as e:\n    log(f'Error: {e}', 'error')"
            })
            
        return improvements
        
    async def apply_improvements(
        self,
        original_code: str,
        improvements: List[Dict[str, str]]
    ) -> str:
        """개선 사항을 코드에 적용"""
        modified_code = original_code
        
        # 개선 사항별로 적용
        for improvement in improvements:
            if improvement['type'] == 'error_handling':
                # 에러 핸들링 추가
                if 'try:' not in modified_code:
                    lines = modified_code.split('\n')
                    # 주요 코드 블록을 try-except로 감싸기
                    modified_lines = ['try:']
                    modified_lines.extend(['    ' + line for line in lines])
                    modified_lines.extend([
                        'except Exception as e:',
                        '    log(f"Error in execution: {e}", "error")',
                        '    output_data["error"] = str(e)'
                    ])
                    modified_code = '\n'.join(modified_lines)
                    
            elif improvement['type'] == 'performance':
                # 성능 개선 코드 추가
                if 'code_change' in improvement:
                    modified_code = f"{improvement['code_change']}\n\n{modified_code}"
                    
            # 기타 개선 사항들...
            
        return modified_code
        
    def generate_diff(self, original: str, modified: str) -> str:
        """코드 차이점 생성"""
        diff = difflib.unified_diff(
            original.splitlines(keepends=True),
            modified.splitlines(keepends=True),
            fromfile='original.py',
            tofile='modified.py',
            n=3
        )
        return ''.join(diff)
        
    async def backup_original_code(
        self,
        node_id: str,
        original_code: str
    ) -> str:
        """원본 코드 백업"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_filename = f"backup_{timestamp}_before_supervisor.py"
        
        backup_path = await node_storage.save_file(
            node_id,
            f"backups/{backup_filename}",
            original_code.encode('utf-8')
        )
        
        return backup_path
        
    async def save_modification_history(
        self,
        node_id: str,
        modifications: List[Dict[str, Any]]
    ):
        """수정 이력 저장"""
        history = await node_storage.get_data(node_id, 'modification_history') or []
        
        # 새 이력 추가
        for mod in modifications:
            history.append({
                "timestamp": datetime.now().isoformat(),
                "target_node": mod['node_id'],
                "action": mod['action'],
                "changes": mod.get('changes', [])
            })
            
        # 최대 개수 유지
        history = history[-self.max_modification_history:]
        
        await node_storage.save_data(node_id, 'modification_history', history)
        
    def analyze_modifications(self, modifications: List[Dict[str, Any]]) -> Dict[str, Any]:
        """수정 결과 분석"""
        total = len(modifications)
        
        actions = {
            "auto_modified": 0,
            "review": 0,
            "recommend": 0
        }
        
        for mod in modifications:
            action = mod.get('action', 'unknown')
            if action in actions:
                actions[action] += 1
                
        return {
            "total_nodes_processed": total,
            "auto_modified": actions['auto_modified'],
            "pending_review": actions['review'],
            "recommendations": actions['recommend'],
            "success_rate": 100.0 if total > 0 else 0
        }

# 모듈 레벨 인스턴스
supervisor_node = SupervisorNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await supervisor_node.execute(node_id, data)