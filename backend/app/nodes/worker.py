# backend/app/nodes/worker.py
from typing import Dict, Any, Optional, List
from app.nodes.base import BaseNode
from app.models.node import TaskItem
import json

class WorkerNode(BaseNode):
    """
    Worker Node - 3패널 편집창 지원
    - 입력 템플릿
    - 실행 코드
    - 출력 템플릿
    """
    
    async def initialize(self):
        """노드 초기화"""
        await super().initialize()
        
        # 3패널 기본 템플릿 설정
        if 'input_template' not in self.data:
            self.data['input_template'] = """# 입력 데이터 템플릿
# 글로벌 변수를 참조하여 입력 데이터 구성
input_data = {
    "reference": "{section}.{nodetype}.{nodeid}.output.data",
    "parameters": {}
}
"""
        
        if 'output_template' not in self.data:
            self.data['output_template'] = """# 출력 데이터 템플릿
# 실행 결과를 구조화하여 출력
output = {
    "result": result,
    "metadata": {
        "processed_at": datetime.now().isoformat(),
        "task_items": task_items
    }
}
"""
    
    async def prepare_execution_context(self) -> Dict[str, Any]:
        """실행 컨텍스트 준비"""
        context = await super().prepare_execution_context()
        
        # 작업 항목 정보 추가
        task_items = self.data.get('task_items', [])
        context['task_items'] = task_items
        context['active_tasks'] = [item for item in task_items if item.get('status') == 'active']
        
        # 입력 템플릿 실행
        if 'input_template' in self.data:
            try:
                # 입력 템플릿을 실행하여 입력 데이터 생성
                input_locals = {'context': context}
                exec(self.data['input_template'], {}, input_locals)
                if 'input_data' in input_locals:
                    context['input_data'] = input_locals['input_data']
            except Exception as e:
                self.logger.error(f"Failed to execute input template: {e}")
        
        return context
    
    async def post_process_output(self, output: Any) -> Any:
        """출력 후처리"""
        # 출력 템플릿 적용
        if 'output_template' in self.data and output is not None:
            try:
                output_locals = {
                    'result': output,
                    'task_items': self.data.get('task_items', []),
                    'datetime': __import__('datetime')
                }
                exec(self.data['output_template'], {}, output_locals)
                if 'output' in output_locals:
                    output = output_locals['output']
            except Exception as e:
                self.logger.error(f"Failed to execute output template: {e}")
        
        # 작업 항목 상태 업데이트
        await self._update_task_status(output)
        
        return await super().post_process_output(output)
    
    async def _update_task_status(self, output: Any):
        """실행 결과를 기반으로 작업 항목 상태 업데이트"""
        if not isinstance(output, dict):
            return
        
        # 작업 항목 상태 업데이트 로직
        task_results = output.get('task_results', {})
        task_items = self.data.get('task_items', [])
        
        for i, item in enumerate(task_items):
            task_id = item.get('id')
            if task_id in task_results:
                result = task_results[task_id]
                if result.get('success'):
                    task_items[i]['status'] = 'completed'  # ×
                elif result.get('partial'):
                    task_items[i]['status'] = 'partial'    # △
                else:
                    task_items[i]['status'] = 'pending'    # ○
        
        self.data['task_items'] = task_items
    
    def get_panel_code(self, panel: str) -> Optional[str]:
        """특정 패널의 코드 반환"""
        if panel == 'input':
            return self.data.get('input_template', '')
        elif panel == 'code':
            return self.code
        elif panel == 'output':
            return self.data.get('output_template', '')
        return None
    
    def set_panel_code(self, panel: str, code: str):
        """특정 패널의 코드 설정"""
        if panel == 'input':
            self.data['input_template'] = code
        elif panel == 'code':
            self.code = code
        elif panel == 'output':
            self.data['output_template'] = code