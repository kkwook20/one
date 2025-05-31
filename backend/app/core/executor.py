# backend/app/core/executor.py

import asyncio
import subprocess
import sys
import json
import tempfile
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Callable
import psutil
import resource
import os

from app.models.node import Node, NodeType
from app.storage.node_storage import node_storage
from app.core.variable_resolver import variable_resolver
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class NodeExecutor:
    """노드 실행기 - 글로벌 변수 및 버전 관리 통합"""
    
    def __init__(self):
        self.running_processes: Dict[str, asyncio.subprocess.Process] = {}
        self.execution_contexts: Dict[str, Dict[str, Any]] = {}
        
    async def execute_node(
        self, 
        node: Node,
        input_data: Dict[str, Any],
        log_callback: Optional[Callable] = None,
        nodes_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """노드 실행"""
        start_time = datetime.now()
        node_id = node.id
        
        try:
            # 노드 디렉토리 설정
            await node_storage.setup_node_directory(node_id)
            
            # 현재 코드 가져오기
            code = await node_storage.get_code(node_id)
            if not code:
                code = node.data.current_code
                
            if not code:
                return {
                    "status": "error",
                    "error": "No code to execute",
                    "output": {}
                }
                
            # 입력 데이터 저장
            await node_storage.save_data(node_id, "input", input_data)
            
            # 글로벌 변수 컨텍스트 구축
            global_context = {}
            if nodes_data:
                global_context = await variable_resolver.build_execution_context(code, nodes_data)
                
            # 작업 항목 정보 추가
            task_info = {
                "items": [task.dict() for task in node.data.tasks],
                "status_counts": {
                    "in_progress": sum(1 for t in node.data.tasks if t.status.value == "○"),
                    "not_modified": sum(1 for t in node.data.tasks if t.status.value == "×"),
                    "partially_modified": sum(1 for t in node.data.tasks if t.status.value == "△")
                }
            }
            
            # 실행 결과
            result = await self._execute_code(
                node_id=node_id,
                node_type=node.data.type,
                code=code,
                input_data=input_data,
                global_context=global_context,
                task_info=task_info,
                log_callback=log_callback
            )
            
            # 출력 데이터 저장
            if result.get("status") == "success":
                await node_storage.save_data(node_id, "output", result.get("output", {}))
                
                # 메타데이터 업데이트
                execution_time = (datetime.now() - start_time).total_seconds()
                metadata_updates = {
                    "last_execution": datetime.now().isoformat(),
                    "execution_count": node.data.metadata.execution_count + 1,
                    "average_execution_time": (
                        (node.data.metadata.average_execution_time * node.data.metadata.execution_count + execution_time) /
                        (node.data.metadata.execution_count + 1)
                    )
                }
                await node_storage.update_metadata(node_id, metadata_updates)
                
                # 성공 시 후처리 훅 실행
                if node.data.post_success_hook:
                    await self._execute_hook(node_id, node.data.post_success_hook, result)
            else:
                # 실패 시 후처리 훅 실행
                if node.data.post_failure_hook:
                    await self._execute_hook(node_id, node.data.post_failure_hook, result)
                    
            return result
            
        except Exception as e:
            logger.error(f"Node execution error: {e}")
            return {
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
                "output": {}
            }
            
    async def _execute_code(
        self,
        node_id: str,
        node_type: NodeType,
        code: str,
        input_data: Dict[str, Any],
        global_context: Dict[str, Any],
        task_info: Dict[str, Any],
        log_callback: Optional[Callable]
    ) -> Dict[str, Any]:
        """코드 실행 (격리된 환경)"""
        
        # 실행 스크립트 생성
        script = self._create_execution_script(
            code=code,
            input_data=input_data,
            global_context=global_context,
            task_info=task_info,
            node_id=node_id,
            node_type=node_type
        )
        
        # 임시 스크립트 파일 생성
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write(script)
            script_path = f.name
            
        try:
            # 프로세스 실행
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-u",  # Unbuffered output
                script_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(node_storage.get_node_path(node_id)),
                preexec_fn=self._set_resource_limits if os.name != 'nt' else None
            )
            
            # 프로세스 등록
            self.running_processes[node_id] = process
            
            # 출력 수집
            stdout_data = []
            stderr_data = []
            
            # 비동기 출력 읽기
            async def read_output():
                while True:
                    line = await process.stdout.readline()
                    if not line:
                        break
                    decoded = line.decode().strip()
                    stdout_data.append(decoded)
                    
                    # 로그 콜백
                    if log_callback and not decoded.startswith("==="):
                        await log_callback({
                            "level": "info",
                            "message": decoded
                        })
                        
            async def read_error():
                while True:
                    line = await process.stderr.readline()
                    if not line:
                        break
                    decoded = line.decode().strip()
                    stderr_data.append(decoded)
                    
                    if log_callback:
                        await log_callback({
                            "level": "error",
                            "message": decoded
                        })
                        
            # 동시에 출력 읽기
            await asyncio.gather(read_output(), read_error())
            
            # 프로세스 종료 대기
            await process.wait()
            
            # 결과 파싱
            result = self._parse_execution_result("\n".join(stdout_data))
            
            if result:
                return result
            else:
                return {
                    "status": "error",
                    "error": "Failed to parse execution result",
                    "stdout": "\n".join(stdout_data),
                    "stderr": "\n".join(stderr_data),
                    "output": {}
                }
                
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            return {
                "status": "timeout",
                "error": "Execution timeout",
                "output": {}
            }
        finally:
            # 임시 파일 삭제
            try:
                os.unlink(script_path)
            except:
                pass
                
            # 프로세스 제거
            self.running_processes.pop(node_id, None)
            
    def _create_execution_script(
        self,
        code: str,
        input_data: Dict[str, Any],
        global_context: Dict[str, Any],
        task_info: Dict[str, Any],
        node_id: str,
        node_type: NodeType
    ) -> str:
        """실행 스크립트 생성"""
        
        script = f'''
import json
import sys
import os
import traceback
from datetime import datetime
from pathlib import Path

# 실행 환경 설정
node_id = "{node_id}"
node_type = "{node_type.value}"

# 입력 데이터
input_data = {json.dumps(input_data)}

# 글로벌 변수 컨텍스트
globals_context = {json.dumps(global_context)}

# 작업 항목 정보
task_info = {json.dumps(task_info)}

# 출력 데이터 초기화
output_data = {{}}
logs = []
generated_files = []

# 헬퍼 함수들
def log(message, level="info"):
    """로그 출력"""
    logs.append({{
        "timestamp": datetime.now().isoformat(),
        "level": level,
        "message": str(message)
    }})
    print(f"[{{level.upper()}}] {{message}}")

def save_file(filename, content):
    """파일 저장"""
    file_path = Path("files") / filename
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    if isinstance(content, str):
        file_path.write_text(content, encoding='utf-8')
    else:
        file_path.write_bytes(content)
        
    generated_files.append(str(file_path))
    return str(file_path)

def get_task_items():
    """작업 항목 가져오기"""
    return task_info["items"]

def get_task_status(index):
    """특정 작업 항목 상태 가져오기"""
    if 0 <= index < len(task_info["items"]):
        return task_info["items"][index]["status"]
    return None

# 글로벌 변수를 locals에 추가
for var_name, var_value in globals_context.items():
    locals()[var_name.replace(".", "_")] = var_value

# 사용자 코드 실행
try:
    {code}
    
    # 결과 출력
    result = {{
        "status": "success",
        "output": output_data,
        "logs": logs,
        "generated_files": generated_files
    }}
    
except Exception as e:
    result = {{
        "status": "error",
        "error": str(e),
        "traceback": traceback.format_exc(),
        "output": output_data,
        "logs": logs
    }}

# JSON으로 결과 출력
print("===EXECUTION_RESULT===")
print(json.dumps(result))
'''
        return script
        
    def _parse_execution_result(self, output: str) -> Optional[Dict[str, Any]]:
        """실행 결과 파싱"""
        try:
            marker = "===EXECUTION_RESULT==="
            if marker in output:
                parts = output.split(marker)
                if len(parts) >= 2:
                    result_json = parts[1].strip()
                    return json.loads(result_json)
        except Exception as e:
            logger.error(f"Failed to parse result: {e}")
        return None
        
    def _set_resource_limits(self):
        """리소스 제한 설정 (Linux/Unix)"""
        if os.name == 'nt':
            return
            
        # CPU 시간 제한 (5분)
        resource.setrlimit(resource.RLIMIT_CPU, (300, 300))
        
        # 메모리 제한 (1GB)
        resource.setrlimit(resource.RLIMIT_AS, (1024*1024*1024, 1024*1024*1024))
        
        # 파일 크기 제한 (100MB)
        resource.setrlimit(resource.RLIMIT_FSIZE, (100*1024*1024, 100*1024*1024))
        
    async def _execute_hook(self, node_id: str, hook_code: str, execution_result: Dict[str, Any]):
        """후처리 훅 실행"""
        try:
            hook_script = f'''
import json

execution_result = {json.dumps(execution_result)}

{hook_code}
'''
            # 간단한 실행 (로깅 없이)
            exec(hook_script, {"execution_result": execution_result})
        except Exception as e:
            logger.error(f"Hook execution error: {e}")
            
    async def stop_execution(self, node_id: str) -> bool:
        """실행 중지"""
        if node_id in self.running_processes:
            process = self.running_processes[node_id]
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                
            self.running_processes.pop(node_id, None)
            return True
        return False
        
    def get_running_nodes(self) -> List[str]:
        """실행 중인 노드 목록"""
        return list(self.running_processes.keys())

# 싱글톤 인스턴스
node_executor = NodeExecutor()