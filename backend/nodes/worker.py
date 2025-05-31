# backend/app/nodes/worker.py

import asyncio
import json
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
import subprocess
import tempfile
import httpx

from app.models.node import Node, NodeData, TaskItem, TaskStatus, VersionHistory
from app.storage.node_storage import node_storage
from app.core.variable_resolver import variable_resolver
from app.core.executor import node_executor
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class WorkerNode:
    """Worker 노드 - Python 코드 실행 및 작업 처리 (3패널 구조)"""
    
    def __init__(self):
        # AI 모델 통합 (LM Studio)
        self.ai_enabled = os.getenv("ENABLE_AI_IMPROVEMENT", "false").lower() == "true"
        self.lm_studio_url = os.getenv("LM_STUDIO_URL", "http://localhost:1234/v1")
        
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Worker 노드 실행 - 3패널 구조 지원"""
        try:
            # 노드 데이터 로드
            node_data = data.get('nodeData', {})
            
            # 입력 패널 데이터
            input_data = data.get('inputData', {})
            
            # 코드 패널 데이터 (현재 코드)
            code = data.get('code')
            if not code:
                code = await node_storage.get_code(node_id)
                
            if not code:
                return {
                    "status": "error",
                    "error": "No code to execute",
                    "output": {},
                    "panel_data": {
                        "input": input_data,
                        "code": "",
                        "output": {}
                    }
                }
                
            # AI 자동 개선 (활성화된 경우)
            if self.ai_enabled and data.get('enableAIImprovement', False):
                improved_code = await self.improve_code_with_ai(code, input_data, node_data)
                if improved_code and improved_code != code:
                    # 개선된 코드 저장
                    await node_storage.save_code(
                        node_id, 
                        improved_code,
                        message="AI auto-improvement",
                        author="AI Assistant"
                    )
                    code = improved_code
                    
            # 코드 실행 준비
            execution_context = await self.prepare_execution_context(node_id, input_data, data)
            
            # 실행
            result = await self.execute_code(
                node_id=node_id,
                code=code,
                context=execution_context,
                log_callback=lambda log: asyncio.create_task(
                    self.stream_log(node_id, log)
                )
            )
            
            # 작업 항목 업데이트
            if result.get('status') == 'success':
                await self.update_task_progress(node_id, result.get('task_updates', {}))
                
            # 3패널 데이터 준비
            panel_data = {
                "input": input_data,
                "code": code,
                "output": result.get('output', {}),
                "logs": result.get('logs', [])
            }
            
            return {
                "status": result.get('status', 'error'),
                "output": result.get('output', {}),
                "panel_data": panel_data,
                "execution_time": result.get('execution_time', 0),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Worker node execution error: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
                "panel_data": {
                    "input": data.get('inputData', {}),
                    "code": data.get('code', ''),
                    "output": {}
                }
            }
            
    async def prepare_execution_context(
        self, 
        node_id: str, 
        input_data: Dict[str, Any],
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """실행 컨텍스트 준비"""
        context = {
            "node_id": node_id,
            "input_data": input_data,
            "output_data": {},
            "logs": []
        }
        
        # 이전 노드 출력 가져오기
        if data.get('previousNodeId'):
            previous_output = await node_storage.get_data(
                data['previousNodeId'], 
                'output'
            )
            if previous_output:
                context['previous_output'] = previous_output
                
        # 글로벌 변수 컨텍스트
        if data.get('globalVariables'):
            for var_path in data['globalVariables']:
                try:
                    value = await variable_resolver.resolve(
                        var_path, 
                        data.get('allNodes', {})
                    )
                    context[var_path] = value
                except Exception as e:
                    logger.warning(f"Failed to resolve variable {var_path}: {e}")
                    
        # 작업 항목 정보
        tasks = await node_storage.get_data(node_id, 'tasks')
        if tasks:
            context['tasks'] = tasks
            
        return context
        
    async def execute_code(
        self,
        node_id: str,
        code: str,
        context: Dict[str, Any],
        log_callback: Optional[Any] = None
    ) -> Dict[str, Any]:
        """코드 실행"""
        start_time = datetime.now()
        
        # 실행 스크립트 생성
        script = self.create_execution_script(code, context)
        
        # 임시 파일에 저장
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(script)
            script_path = f.name
            
        try:
            # 프로세스 실행
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-u",
                script_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(node_storage.get_node_path(node_id))
            )
            
            # 출력 수집
            stdout_lines = []
            stderr_lines = []
            
            # stdout 읽기
            async for line in process.stdout:
                decoded = line.decode().strip()
                stdout_lines.append(decoded)
                if log_callback and not decoded.startswith("==="):
                    await log_callback({
                        "level": "info",
                        "message": decoded,
                        "timestamp": datetime.now().isoformat()
                    })
                    
            # stderr 읽기 (에러)
            stderr = await process.stderr.read()
            if stderr:
                stderr_text = stderr.decode()
                stderr_lines.append(stderr_text)
                if log_callback:
                    await log_callback({
                        "level": "error",
                        "message": stderr_text,
                        "timestamp": datetime.now().isoformat()
                    })
                    
            # 프로세스 종료 대기
            await process.wait()
            
            # 결과 파싱
            result = self.parse_execution_result(stdout_lines)
            
            if result:
                result['execution_time'] = (datetime.now() - start_time).total_seconds()
                return result
            else:
                return {
                    "status": "error",
                    "error": "Failed to parse execution result",
                    "logs": stdout_lines + stderr_lines,
                    "execution_time": (datetime.now() - start_time).total_seconds()
                }
                
        finally:
            # 임시 파일 삭제
            try:
                os.unlink(script_path)
            except:
                pass
                
    def create_execution_script(self, code: str, context: Dict[str, Any]) -> str:
        """실행 스크립트 생성"""
        return f'''
import json
import sys
import traceback
from datetime import datetime
from pathlib import Path

# 컨텍스트 설정
context = {json.dumps(context)}
input_data = context.get('input_data', {{}})
output_data = {{}}
logs = []
task_updates = {{}}

# 헬퍼 함수
def log(message, level="info"):
    """로그 출력"""
    logs.append({{
        "timestamp": datetime.now().isoformat(),
        "level": level,
        "message": str(message)
    }})
    print(f"[{{level.upper()}}] {{message}}")

def update_task(task_index, status=None, progress=None):
    """작업 항목 업데이트"""
    if task_index not in task_updates:
        task_updates[task_index] = {{}}
    if status:
        task_updates[task_index]['status'] = status
    if progress is not None:
        task_updates[task_index]['progress'] = progress

def save_output(key, value):
    """출력 데이터 저장"""
    output_data[key] = value

# 글로벌 변수 설정
for key, value in context.items():
    if key not in ['input_data', 'output_data', 'logs', 'node_id']:
        globals()[key] = value

# 사용자 코드 실행
try:
    {code}
    
    result = {{
        "status": "success",
        "output": output_data,
        "logs": logs,
        "task_updates": task_updates
    }}
    
except Exception as e:
    result = {{
        "status": "error",
        "error": str(e),
        "traceback": traceback.format_exc(),
        "output": output_data,
        "logs": logs
    }}

# 결과 출력
print("===EXECUTION_RESULT===")
print(json.dumps(result))
'''
        
    def parse_execution_result(self, output_lines: List[str]) -> Optional[Dict[str, Any]]:
        """실행 결과 파싱"""
        try:
            output = '\n'.join(output_lines)
            marker = "===EXECUTION_RESULT==="
            if marker in output:
                parts = output.split(marker)
                if len(parts) >= 2:
                    result_json = parts[1].strip()
                    return json.loads(result_json)
        except Exception as e:
            logger.error(f"Failed to parse result: {e}")
        return None
        
    async def improve_code_with_ai(
        self, 
        code: str, 
        input_data: Dict[str, Any],
        node_data: Dict[str, Any]
    ) -> Optional[str]:
        """AI를 사용한 코드 개선"""
        if not self.ai_enabled:
            return None
            
        try:
            # LM Studio API 호출
            async with httpx.AsyncClient() as client:
                prompt = f"""You are a Python code optimizer. Improve the following code for better performance and readability.

Current code:
```python
{code}
```

Input data structure: {json.dumps(input_data, indent=2)}
Task items: {json.dumps(node_data.get('tasks', []), indent=2)}

Requirements:
1. Optimize for performance
2. Add proper error handling
3. Improve code readability
4. Maintain the same input/output interface
5. Keep helper functions (log, update_task, save_output)

Return only the improved Python code without any explanation."""

                response = await client.post(
                    f"{self.lm_studio_url}/completions",
                    json={
                        "prompt": prompt,
                        "max_tokens": 2000,
                        "temperature": 0.3
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    improved_code = result.get('choices', [{}])[0].get('text', '').strip()
                    
                    # 코드 유효성 검사
                    try:
                        compile(improved_code, '<string>', 'exec')
                        return improved_code
                    except SyntaxError:
                        logger.warning("AI generated invalid Python code")
                        return None
                        
        except Exception as e:
            logger.error(f"AI code improvement failed: {e}")
            
        return None
        
    async def update_task_progress(self, node_id: str, task_updates: Dict[int, Dict[str, Any]]):
        """작업 항목 진행률 업데이트"""
        if not task_updates:
            return
            
        tasks = await node_storage.get_data(node_id, 'tasks')
        if not tasks:
            return
            
        for task_index, updates in task_updates.items():
            if 0 <= task_index < len(tasks):
                task = tasks[task_index]
                
                if 'status' in updates:
                    task['status'] = updates['status']
                if 'progress' in updates:
                    task['progress'] = updates['progress']
                    
                task['updated_at'] = datetime.now().isoformat()
                
        await node_storage.save_data(node_id, 'tasks', tasks)
        
    async def stream_log(self, node_id: str, log_data: Dict[str, Any]):
        """로그 스트리밍 (WebSocket으로 전송)"""
        # WebSocket 매니저를 통해 실시간 로그 전송
        # 실제 구현은 WebSocket 매니저와 연동
        pass
        
    async def get_panel_data(self, node_id: str) -> Dict[str, Any]:
        """3패널 데이터 가져오기"""
        input_data = await node_storage.get_data(node_id, 'input') or {}
        code = await node_storage.get_code(node_id) or ""
        output_data = await node_storage.get_data(node_id, 'output') or {}
        
        return {
            "input": input_data,
            "code": code,
            "output": output_data
        }

# 모듈 레벨 인스턴스
worker_node = WorkerNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await worker_node.execute(node_id, data)