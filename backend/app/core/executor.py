# backend/app/core/executor.py

import asyncio
import subprocess
import sys
import json
import tempfile
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Callable, List
import psutil
import resource
import os
from enum import Enum

from app.models.node import Node, NodeType
from app.storage.node_storage import node_storage
from app.core.variable_resolver import variable_resolver
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class ExecutionError(Exception):
    """실행 관련 커스텀 예외"""
    pass

class ValidationError(ExecutionError):
    """검증 실패 예외"""
    pass

class TimeoutError(ExecutionError):
    """타임아웃 예외"""
    pass

class ResourceLimitError(ExecutionError):
    """리소스 제한 초과 예외"""
    pass

class ErrorType(Enum):
    """에러 타입 분류"""
    VALIDATION = "validation"
    EXECUTION = "execution"
    TIMEOUT = "timeout"
    RESOURCE_LIMIT = "resource_limit"
    SYSTEM = "system"
    UNKNOWN = "unknown"

class NodeExecutor:
    """노드 실행기 - 글로벌 변수 및 버전 관리 통합"""
    
    def __init__(self):
        self.running_processes: Dict[str, asyncio.subprocess.Process] = {}
        self.execution_contexts: Dict[str, Dict[str, Any]] = {}
        self.max_execution_time = 300  # 5분
        self.max_memory_mb = 1024  # 1GB
        self.max_file_size_mb = 100  # 100MB
        
    async def execute_node(
        self, 
        node: Node,
        input_data: Dict[str, Any],
        log_callback: Optional[Callable] = None,
        nodes_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """노드 실행 - 강화된 에러 핸들링"""
        start_time = datetime.now()
        node_id = node.id
        
        # 실행 컨텍스트 초기화
        execution_context = {
            "node_id": node_id,
            "start_time": start_time.isoformat(),
            "input_data": input_data,
            "status": "initializing"
        }
        
        try:
            # 1. 입력 검증
            await self._validate_inputs(node, input_data)
            execution_context["status"] = "validated"
            
            # 2. 노드 디렉토리 설정
            try:
                await node_storage.setup_node_directory(node_id)
            except Exception as e:
                raise ExecutionError(f"Failed to setup node directory: {e}")
            
            # 3. 코드 검증 및 가져오기
            code = await self._get_and_validate_code(node)
            execution_context["code_hash"] = hash(code)
            
            # 4. 입력 데이터 저장
            try:
                await node_storage.save_data(node_id, "input", input_data)
            except Exception as e:
                logger.warning(f"Failed to save input data: {e}")
                # 입력 데이터 저장 실패는 치명적이지 않으므로 계속 진행
            
            # 5. 글로벌 변수 컨텍스트 구축
            global_context = {}
            if nodes_data:
                try:
                    global_context = await variable_resolver.build_execution_context(code, nodes_data)
                except Exception as e:
                    logger.error(f"Failed to build global context: {e}")
                    # 글로벌 컨텍스트 실패 시 빈 컨텍스트로 계속 진행
                    
            # 6. 작업 항목 정보 구성
            task_info = self._build_task_info(node)
            
            execution_context["status"] = "executing"
            
            # 7. 코드 실행
            result = await self._execute_code_safely(
                node_id=node_id,
                node_type=node.data.type,
                code=code,
                input_data=input_data,
                global_context=global_context,
                task_info=task_info,
                log_callback=log_callback
            )
            
            # 8. 결과 처리
            result = await self._process_execution_result(
                node, result, start_time, execution_context
            )
            
            # 9. 후처리 훅 실행
            await self._execute_post_hooks(node, result)
            
            return result
            
        except ValidationError as e:
            logger.error(f"Validation error for node {node_id}: {e}")
            return self._create_error_result(
                error=str(e),
                error_type=ErrorType.VALIDATION,
                execution_context=execution_context
            )
            
        except TimeoutError as e:
            logger.error(f"Timeout error for node {node_id}: {e}")
            return self._create_error_result(
                error=str(e),
                error_type=ErrorType.TIMEOUT,
                execution_context=execution_context
            )
            
        except ResourceLimitError as e:
            logger.error(f"Resource limit error for node {node_id}: {e}")
            return self._create_error_result(
                error=str(e),
                error_type=ErrorType.RESOURCE_LIMIT,
                execution_context=execution_context
            )
            
        except ExecutionError as e:
            logger.error(f"Execution error for node {node_id}: {e}")
            return self._create_error_result(
                error=str(e),
                error_type=ErrorType.EXECUTION,
                execution_context=execution_context
            )
            
        except Exception as e:
            logger.exception(f"Unexpected error for node {node_id}")
            return self._create_error_result(
                error=str(e),
                error_type=ErrorType.UNKNOWN,
                execution_context=execution_context,
                traceback=traceback.format_exc()
            )
            
        finally:
            # 정리 작업
            await self._cleanup_execution(node_id)
            
    async def _validate_inputs(self, node: Node, input_data: Dict[str, Any]):
        """입력 검증"""
        if not node:
            raise ValidationError("Node object is required")
            
        if not node.id:
            raise ValidationError("Node ID is required")
            
        if not hasattr(node, 'data') or not node.data:
            raise ValidationError("Node data is missing")
            
        if not hasattr(node.data, 'type') or not node.data.type:
            raise ValidationError("Node type is missing")
            
        # NodeType 검증
        if not isinstance(node.data.type, NodeType):
            raise ValidationError(f"Invalid node type: {node.data.type}")
            
        # 입력 데이터 타입 검증
        if input_data is not None and not isinstance(input_data, dict):
            raise ValidationError(f"Input data must be a dictionary, got {type(input_data)}")
            
    async def _get_and_validate_code(self, node: Node) -> str:
        """코드 가져오기 및 검증"""
        try:
            code = await node_storage.get_code(node.id)
        except Exception as e:
            logger.warning(f"Failed to get code from storage: {e}")
            code = None
            
        if not code:
            code = node.data.current_code
            
        if not code:
            raise ValidationError("No code to execute")
            
        # 코드 검증 (위험한 패턴 검사)
        dangerous_patterns = [
            "__import__('os').system",
            "exec(",
            "eval(",
            "__import__('subprocess')",
            "compile("
        ]
        
        for pattern in dangerous_patterns:
            if pattern in code:
                logger.warning(f"Potentially dangerous pattern found in code: {pattern}")
                # 필요 시 여기서 에러를 발생시킬 수 있음
                
        return code
        
    def _build_task_info(self, node: Node) -> Dict[str, Any]:
        """작업 항목 정보 구성"""
        try:
            task_items = [task.dict() for task in node.data.tasks] if hasattr(node.data, 'tasks') else []
            
            status_counts = {
                "in_progress": 0,
                "not_modified": 0,
                "partially_modified": 0
            }
            
            for task in task_items:
                status_value = task.get('status', {}).get('value', '')
                if status_value == "○":
                    status_counts["in_progress"] += 1
                elif status_value == "×":
                    status_counts["not_modified"] += 1
                elif status_value == "△":
                    status_counts["partially_modified"] += 1
                    
            return {
                "items": task_items,
                "status_counts": status_counts
            }
            
        except Exception as e:
            logger.error(f"Failed to build task info: {e}")
            return {"items": [], "status_counts": {}}
            
    async def _execute_code_safely(
        self,
        node_id: str,
        node_type: NodeType,
        code: str,
        input_data: Dict[str, Any],
        global_context: Dict[str, Any],
        task_info: Dict[str, Any],
        log_callback: Optional[Callable]
    ) -> Dict[str, Any]:
        """안전한 코드 실행"""
        
        # 리소스 모니터링 시작
        monitor_task = asyncio.create_task(
            self._monitor_execution(node_id)
        )
        
        try:
            # 타임아웃과 함께 실행
            result = await asyncio.wait_for(
                self._execute_code(
                    node_id=node_id,
                    node_type=node_type,
                    code=code,
                    input_data=input_data,
                    global_context=global_context,
                    task_info=task_info,
                    log_callback=log_callback
                ),
                timeout=self.max_execution_time
            )
            
            return result
            
        except asyncio.TimeoutError:
            # 프로세스 강제 종료
            await self._force_stop_execution(node_id)
            raise TimeoutError(f"Execution exceeded {self.max_execution_time} seconds")
            
        finally:
            # 모니터링 종료
            monitor_task.cancel()
            try:
                await monitor_task
            except asyncio.CancelledError:
                pass
                
    async def _monitor_execution(self, node_id: str):
        """실행 모니터링 (메모리, CPU 등)"""
        while node_id in self.running_processes:
            try:
                process = self.running_processes[node_id]
                if process and process.pid:
                    # psutil을 사용한 리소스 모니터링
                    try:
                        proc = psutil.Process(process.pid)
                        memory_mb = proc.memory_info().rss / 1024 / 1024
                        
                        if memory_mb > self.max_memory_mb:
                            logger.warning(f"Process {node_id} exceeded memory limit: {memory_mb}MB")
                            await self._force_stop_execution(node_id)
                            raise ResourceLimitError(f"Memory limit exceeded: {memory_mb}MB > {self.max_memory_mb}MB")
                            
                    except psutil.NoSuchProcess:
                        pass
                        
                await asyncio.sleep(1)  # 1초마다 체크
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error monitoring execution: {e}")
                await asyncio.sleep(1)
                
    async def _force_stop_execution(self, node_id: str):
        """강제 실행 중지"""
        if node_id in self.running_processes:
            process = self.running_processes[node_id]
            try:
                if os.name == 'nt':
                    process.terminate()
                else:
                    process.kill()  # Unix/Linux에서는 SIGKILL
                    
                # 잠시 대기 후 여전히 실행 중이면 강제 종료
                await asyncio.sleep(0.5)
                if process.returncode is None:
                    process.kill()
                    
            except Exception as e:
                logger.error(f"Error forcing stop: {e}")
                
    async def _process_execution_result(
        self,
        node: Node,
        result: Dict[str, Any],
        start_time: datetime,
        execution_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """실행 결과 처리"""
        
        execution_time = (datetime.now() - start_time).total_seconds()
        result["execution_time"] = execution_time
        result["execution_context"] = execution_context
        
        if result.get("status") == "success":
            try:
                # 출력 데이터 저장
                await node_storage.save_data(node.id, "output", result.get("output", {}))
                
                # 메타데이터 업데이트
                metadata_updates = {
                    "last_execution": datetime.now().isoformat(),
                    "last_execution_status": "success",
                    "execution_count": node.data.metadata.execution_count + 1,
                    "average_execution_time": (
                        (node.data.metadata.average_execution_time * node.data.metadata.execution_count + execution_time) /
                        (node.data.metadata.execution_count + 1)
                    )
                }
                await node_storage.update_metadata(node.id, metadata_updates)
                
            except Exception as e:
                logger.error(f"Failed to save execution results: {e}")
                # 저장 실패는 치명적이지 않으므로 결과는 그대로 반환
                
        return result
        
    async def _execute_post_hooks(self, node: Node, result: Dict[str, Any]):
        """후처리 훅 실행"""
        try:
            if result.get("status") == "success" and node.data.post_success_hook:
                await self._execute_hook(node.id, node.data.post_success_hook, result)
            elif result.get("status") != "success" and node.data.post_failure_hook:
                await self._execute_hook(node.id, node.data.post_failure_hook, result)
        except Exception as e:
            logger.error(f"Post-hook execution failed: {e}")
            # 후처리 훅 실패는 전체 실행에 영향을 주지 않음
            
    def _create_error_result(
        self,
        error: str,
        error_type: ErrorType,
        execution_context: Dict[str, Any],
        traceback: Optional[str] = None
    ) -> Dict[str, Any]:
        """구조화된 에러 결과 생성"""
        result = {
            "status": "error",
            "error": error,
            "error_type": error_type.value,
            "timestamp": datetime.now().isoformat(),
            "execution_context": execution_context,
            "output": {}
        }
        
        if traceback:
            result["traceback"] = traceback
            
        return result
        
    async def _cleanup_execution(self, node_id: str):
        """실행 정리"""
        try:
            # 실행 컨텍스트 제거
            self.execution_contexts.pop(node_id, None)
            
            # 프로세스가 남아있다면 제거
            if node_id in self.running_processes:
                await self.stop_execution(node_id)
                
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
            
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
        script_path = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(script)
                script_path = f.name
                
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
                    try:
                        line = await process.stdout.readline()
                        if not line:
                            break
                        decoded = line.decode().strip()
                        stdout_data.append(decoded)
                        
                        # 로그 콜백
                        if log_callback and not decoded.startswith("==="):
                            await log_callback({
                                "level": "info",
                                "message": decoded,
                                "timestamp": datetime.now().isoformat()
                            })
                    except Exception as e:
                        logger.error(f"Error reading stdout: {e}")
                        break
                        
            async def read_error():
                while True:
                    try:
                        line = await process.stderr.readline()
                        if not line:
                            break
                        decoded = line.decode().strip()
                        stderr_data.append(decoded)
                        
                        if log_callback:
                            await log_callback({
                                "level": "error",
                                "message": decoded,
                                "timestamp": datetime.now().isoformat()
                            })
                    except Exception as e:
                        logger.error(f"Error reading stderr: {e}")
                        break
                        
            # 동시에 출력 읽기
            await asyncio.gather(
                read_output(), 
                read_error(),
                return_exceptions=True  # 예외가 발생해도 계속 진행
            )
            
            # 프로세스 종료 대기
            return_code = await process.wait()
            
            # 결과 파싱
            result = self._parse_execution_result("\n".join(stdout_data))
            
            if result:
                # 프로세스 종료 코드 추가
                result["return_code"] = return_code
                return result
            else:
                # 파싱 실패 시 raw 데이터 반환
                return {
                    "status": "error",
                    "error": "Failed to parse execution result",
                    "stdout": "\n".join(stdout_data),
                    "stderr": "\n".join(stderr_data),
                    "return_code": return_code,
                    "output": {}
                }
                
        except Exception as e:
            logger.exception(f"Execution error: {e}")
            raise ExecutionError(f"Failed to execute code: {e}")
            
        finally:
            # 임시 파일 삭제
            if script_path:
                try:
                    os.unlink(script_path)
                except Exception as e:
                    logger.warning(f"Failed to delete temp file: {e}")
                    
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
        """실행 스크립트 생성 - 에러 처리 강화"""
        
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
warnings = []

# 헬퍼 함수들
def log(message, level="info"):
    """로그 출력"""
    entry = {{
        "timestamp": datetime.now().isoformat(),
        "level": level,
        "message": str(message)
    }}
    logs.append(entry)
    print(f"[{{level.upper()}}] {{message}}")

def warn(message):
    """경고 메시지"""
    warnings.append({{
        "timestamp": datetime.now().isoformat(),
        "message": str(message)
    }})
    log(message, "warning")

def save_file(filename, content):
    """파일 저장 - 에러 처리 포함"""
    try:
        file_path = Path("files") / filename
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        if isinstance(content, str):
            file_path.write_text(content, encoding='utf-8')
        else:
            file_path.write_bytes(content)
            
        generated_files.append(str(file_path))
        log(f"File saved: {{file_path}}")
        return str(file_path)
        
    except Exception as e:
        warn(f"Failed to save file {{filename}}: {{e}}")
        raise

def get_task_items():
    """작업 항목 가져오기"""
    return task_info["items"]

def get_task_status(index):
    """특정 작업 항목 상태 가져오기"""
    if 0 <= index < len(task_info["items"]):
        return task_info["items"][index]["status"]
    return None

def set_output(key, value):
    """출력 데이터 설정"""
    output_data[key] = value
    log(f"Output set: {{key}} = {{type(value).__name__}}")

# 글로벌 변수를 locals에 추가
for var_name, var_value in globals_context.items():
    safe_var_name = var_name.replace(".", "_").replace("-", "_")
    locals()[safe_var_name] = var_value

# 사용자 코드 실행
execution_start = datetime.now()
try:
    # 사용자 코드
    {code}
    
    # 실행 시간 계산
    execution_duration = (datetime.now() - execution_start).total_seconds()
    
    # 결과 출력
    result = {{
        "status": "success",
        "output": output_data,
        "logs": logs,
        "warnings": warnings,
        "generated_files": generated_files,
        "execution_duration": execution_duration
    }}
    
except KeyboardInterrupt:
    result = {{
        "status": "interrupted",
        "error": "Execution interrupted by user",
        "output": output_data,
        "logs": logs,
        "warnings": warnings
    }}
    
except MemoryError:
    result = {{
        "status": "error",
        "error": "Memory limit exceeded",
        "error_type": "resource_limit",
        "output": output_data,
        "logs": logs,
        "warnings": warnings
    }}
    
except TimeoutError:
    result = {{
        "status": "error",
        "error": "Execution timeout",
        "error_type": "timeout",
        "output": output_data,
        "logs": logs,
        "warnings": warnings
    }}
    
except Exception as e:
    result = {{
        "status": "error",
        "error": str(e),
        "error_type": type(e).__name__,
        "traceback": traceback.format_exc(),
        "output": output_data,
        "logs": logs,
        "warnings": warnings
    }}

# JSON으로 결과 출력
print("===EXECUTION_RESULT===")
print(json.dumps(result, ensure_ascii=False, indent=2))
'''
        return script
        
    def _parse_execution_result(self, output: str) -> Optional[Dict[str, Any]]:
        """실행 결과 파싱 - 개선된 에러 처리"""
        try:
            marker = "===EXECUTION_RESULT==="
            if marker in output:
                parts = output.split(marker)
                if len(parts) >= 2:
                    result_json = parts[1].strip()
                    
                    # JSON 파싱 시도
                    try:
                        return json.loads(result_json)
                    except json.JSONDecodeError as e:
                        # JSON이 잘렸을 수 있으므로 부분 파싱 시도
                        logger.error(f"JSON decode error: {e}")
                        logger.debug(f"Raw JSON: {result_json[:200]}...")
                        
                        # 기본 결과 반환
                        return {
                            "status": "error",
                            "error": "Failed to parse result JSON",
                            "raw_output": output[:1000]  # 처음 1000자만
                        }
                        
        except Exception as e:
            logger.error(f"Failed to parse result: {e}")
            
        return None
        
    def _set_resource_limits(self):
        """리소스 제한 설정 (Linux/Unix) - 개선된 버전"""
        if os.name == 'nt':
            return
            
        try:
            # CPU 시간 제한
            resource.setrlimit(resource.RLIMIT_CPU, 
                             (self.max_execution_time, self.max_execution_time))
            
            # 메모리 제한
            memory_limit = self.max_memory_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, 
                             (memory_limit, memory_limit))
            
            # 파일 크기 제한
            file_limit = self.max_file_size_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_FSIZE, 
                             (file_limit, file_limit))
            
            # 프로세스 수 제한
            resource.setrlimit(resource.RLIMIT_NPROC, (50, 50))
            
            # 열린 파일 수 제한
            resource.setrlimit(resource.RLIMIT_NOFILE, (100, 100))
            
        except Exception as e:
            logger.warning(f"Failed to set resource limits: {e}")
            
    async def _execute_hook(self, node_id: str, hook_code: str, execution_result: Dict[str, Any]):
        """후처리 훅 실행 - 격리된 환경"""
        try:
            # 훅 실행도 안전하게 격리
            hook_globals = {
                "execution_result": execution_result,
                "datetime": datetime,
                "json": json,
                "logger": logger
            }
            
            # 제한된 환경에서 실행
            exec(hook_code, hook_globals, {})
            
        except Exception as e:
            logger.error(f"Hook execution error: {e}")
            # 훅 실패는 무시하고 계속 진행
            
    async def stop_execution(self, node_id: str) -> bool:
        """실행 중지 - 개선된 버전"""
        if node_id not in self.running_processes:
            return False
            
        process = self.running_processes[node_id]
        try:
            # 정상 종료 시도
            process.terminate()
            
            # 종료 대기 (최대 5초)
            try:
                await asyncio.wait_for(process.wait(), timeout=5.0)
                logger.info(f"Process {node_id} terminated gracefully")
            except asyncio.TimeoutError:
                # 강제 종료
                logger.warning(f"Process {node_id} did not terminate, forcing kill")
                process.kill()
                await process.wait()
                
            return True
            
        except Exception as e:
            logger.error(f"Error stopping execution: {e}")
            return False
            
        finally:
            # 프로세스 목록에서 제거
            self.running_processes.pop(node_id, None)
            
    def get_running_nodes(self) -> List[str]:
        """실행 중인 노드 목록"""
        return list(self.running_processes.keys())
        
    async def get_execution_status(self, node_id: str) -> Dict[str, Any]:
        """노드 실행 상태 조회"""
        if node_id not in self.running_processes:
            return {"status": "not_running"}
            
        process = self.running_processes[node_id]
        
        try:
            # 프로세스 정보 수집
            if process.pid:
                proc = psutil.Process(process.pid)
                return {
                    "status": "running",
                    "pid": process.pid,
                    "memory_mb": proc.memory_info().rss / 1024 / 1024,
                    "cpu_percent": proc.cpu_percent(),
                    "create_time": datetime.fromtimestamp(proc.create_time()).isoformat()
                }
        except:
            pass
            
        return {"status": "unknown"}

# 싱글톤 인스턴스
node_executor = NodeExecutor()