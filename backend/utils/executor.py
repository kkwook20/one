import asyncio
import subprocess
import sys
import os
import tempfile
import json
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List, Callable
import signal
import resource
import psutil

class PythonExecutor:
    """Python 코드 실행 관리자"""
    
    def __init__(self):
        self.running_processes: Dict[str, asyncio.subprocess.Process] = {}
        self.execution_history: List[Dict[str, Any]] = []
        
        # 기본 실행 제한
        self.default_limits = {
            "timeout": 300,  # 5분
            "max_memory": 1024 * 1024 * 1024,  # 1GB
            "max_cpu_time": 300,  # 5분
            "max_file_size": 100 * 1024 * 1024,  # 100MB
            "max_processes": 10
        }
    
    async def execute_code(
        self,
        code: str,
        context: Dict[str, Any] = None,
        limits: Optional[Dict[str, Any]] = None,
        capture_output: bool = True,
        isolated: bool = False
    ) -> Dict[str, Any]:
        """Python 코드 실행"""
        execution_id = f"exec_{datetime.now().timestamp()}"
        start_time = datetime.now()
        
        try:
            if isolated:
                # 격리된 환경에서 실행
                result = await self.execute_isolated(
                    execution_id, code, context, limits
                )
            else:
                # 현재 프로세스에서 실행
                result = await self.execute_inline(
                    code, context, capture_output
                )
            
            # 실행 시간 계산
            execution_time = (datetime.now() - start_time).total_seconds()
            result["executionTime"] = execution_time
            result["executionId"] = execution_id
            
            # 이력 저장
            self.save_execution_history(execution_id, result)
            
            return result
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
                "executionTime": (datetime.now() - start_time).total_seconds(),
                "executionId": execution_id
            }
    
    async def execute_inline(
        self,
        code: str,
        context: Dict[str, Any] = None,
        capture_output: bool = True
    ) -> Dict[str, Any]:
        """현재 프로세스에서 코드 실행"""
        # 실행 컨텍스트 준비
        exec_globals = {
            "__builtins__": __builtins__,
            "asyncio": asyncio,
            "datetime": datetime,
            "json": json,
            "Path": Path,
            "output_data": {},
            "logs": []
        }
        
        # 사용자 컨텍스트 추가
        if context:
            exec_globals.update(context)
        
        # 출력 캡처
        if capture_output:
            import io
            from contextlib import redirect_stdout, redirect_stderr
            
            stdout_buffer = io.StringIO()
            stderr_buffer = io.StringIO()
            
            # print 함수 오버라이드
            original_print = print
            logs = exec_globals["logs"]
            
            def custom_print(*args, **kwargs):
                output = " ".join(str(arg) for arg in args)
                logs.append(output)
                original_print(*args, **kwargs)
            
            exec_globals["print"] = custom_print
        
        try:
            # 코드 실행
            if capture_output:
                with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
                    exec(code, exec_globals)
            else:
                exec(code, exec_globals)
            
            # 결과 수집
            result = {
                "status": "success",
                "output": exec_globals.get("output_data", {}),
                "logs": exec_globals.get("logs", []),
                "variables": {
                    k: v for k, v in exec_globals.items()
                    if not k.startswith("__") and k not in ["output_data", "logs", "print"]
                }
            }
            
            if capture_output:
                result["stdout"] = stdout_buffer.getvalue()
                result["stderr"] = stderr_buffer.getvalue()
            
            return result
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
                "logs": exec_globals.get("logs", [])
            }
    
    async def execute_isolated(
        self,
        execution_id: str,
        code: str,
        context: Dict[str, Any] = None,
        limits: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """격리된 프로세스에서 코드 실행"""
        # 제한 설정
        limits = {**self.default_limits, **(limits or {})}
        
        # 임시 스크립트 생성
        with tempfile.NamedTemporaryFile(
            mode='w',
            suffix='.py',
            delete=False
        ) as script_file:
            # 실행 스크립트 작성
            script = self.create_isolated_script(code, context)
            script_file.write(script)
            script_path = script_file.name
        
        try:
            # 프로세스 실행
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-u",  # Unbuffered output
                script_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=lambda: self.set_process_limits(limits) if os.name != 'nt' else None
            )
            
            # 프로세스 등록
            self.running_processes[execution_id] = process
            
            # 타임아웃 적용하여 실행
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=limits["timeout"]
                )
                
                # 결과 파싱
                result = self.parse_isolated_result(stdout, stderr)
                
            except asyncio.TimeoutError:
                # 타임아웃 발생
                process.kill()
                await process.wait()
                
                result = {
                    "status": "timeout",
                    "error": f"Execution timeout after {limits['timeout']} seconds",
                    "output": {}
                }
            
            finally:
                # 프로세스 제거
                if execution_id in self.running_processes:
                    del self.running_processes[execution_id]
            
            return result
            
        finally:
            # 임시 파일 삭제
            try:
                os.unlink(script_path)
            except:
                pass
    
    def create_isolated_script(self, code: str, context: Dict[str, Any] = None) -> str:
        """격리 실행용 스크립트 생성"""
        context_json = json.dumps(context or {})
        
        script = f"""
import json
import sys
import traceback
from datetime import datetime
from pathlib import Path

# 컨텍스트 로드
context = json.loads('''{context_json}''')

# 실행 환경 설정
output_data = {{}}
logs = []

def print(*args, **kwargs):
    output = " ".join(str(arg) for arg in args)
    logs.append(output)
    __builtins__['print'](*args, **kwargs)

# 글로벌 변수 설정
globals().update(context)
globals()['output_data'] = output_data
globals()['logs'] = logs
globals()['print'] = print

# 사용자 코드 실행
try:
    {code}
    
    # 결과 출력
    result = {{
        "status": "success",
        "output": output_data,
        "logs": logs
    }}
    
except Exception as e:
    result = {{
        "status": "error",
        "error": str(e),
        "traceback": traceback.format_exc(),
        "logs": logs
    }}

# JSON으로 결과 출력
print("===EXECUTION_RESULT===")
print(json.dumps(result))
"""
        return script
    
    def parse_isolated_result(self, stdout: bytes, stderr: bytes) -> Dict[str, Any]:
        """격리 실행 결과 파싱"""
        try:
            output = stdout.decode('utf-8')
            
            # 결과 마커 찾기
            marker = "===EXECUTION_RESULT==="
            if marker in output:
                parts = output.split(marker)
                result_json = parts[1].strip()
                result = json.loads(result_json)
                
                # stdout 추가
                result["stdout"] = parts[0]
                result["stderr"] = stderr.decode('utf-8')
                
                return result
            else:
                # 마커가 없는 경우
                return {
                    "status": "error",
                    "error": "No execution result found",
                    "stdout": output,
                    "stderr": stderr.decode('utf-8')
                }
                
        except Exception as e:
            return {
                "status": "error",
                "error": f"Failed to parse result: {str(e)}",
                "stdout": stdout.decode('utf-8', errors='replace'),
                "stderr": stderr.decode('utf-8', errors='replace')
            }
    
    def set_process_limits(self, limits: Dict[str, Any]):
        """프로세스 리소스 제한 설정 (Linux/Unix)"""
        if os.name == 'nt':
            return  # Windows는 지원하지 않음
        
        # CPU 시간 제한
        if "max_cpu_time" in limits:
            resource.setrlimit(
                resource.RLIMIT_CPU,
                (limits["max_cpu_time"], limits["max_cpu_time"])
            )
        
        # 메모리 제한
        if "max_memory" in limits:
            resource.setrlimit(
                resource.RLIMIT_AS,
                (limits["max_memory"], limits["max_memory"])
            )
        
        # 파일 크기 제한
        if "max_file_size" in limits:
            resource.setrlimit(
                resource.RLIMIT_FSIZE,
                (limits["max_file_size"], limits["max_file_size"])
            )
        
        # 프로세스 수 제한
        if "max_processes" in limits:
            resource.setrlimit(
                resource.RLIMIT_NPROC,
                (limits["max_processes"], limits["max_processes"])
            )
    
    async def execute_file(
        self,
        file_path: str,
        args: List[str] = None,
        env: Dict[str, str] = None,
        cwd: Optional[str] = None,
        timeout: Optional[float] = None
    ) -> Dict[str, Any]:
        """Python 파일 실행"""
        start_time = datetime.now()
        
        try:
            # 명령어 구성
            cmd = [sys.executable, file_path]
            if args:
                cmd.extend(args)
            
            # 환경 변수 설정
            process_env = os.environ.copy()
            if env:
                process_env.update(env)
            
            # 프로세스 실행
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=process_env,
                cwd=cwd
            )
            
            # 타임아웃 적용
            if timeout:
                try:
                    stdout, stderr = await asyncio.wait_for(
                        process.communicate(),
                        timeout=timeout
                    )
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
                    raise TimeoutError(f"Process timeout after {timeout} seconds")
            else:
                stdout, stderr = await process.communicate()
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            return {
                "status": "success" if process.returncode == 0 else "error",
                "returnCode": process.returncode,
                "stdout": stdout.decode('utf-8'),
                "stderr": stderr.decode('utf-8'),
                "executionTime": execution_time
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "executionTime": (datetime.now() - start_time).total_seconds()
            }
    
    async def stop_execution(self, execution_id: str) -> bool:
        """실행 중지"""
        if execution_id in self.running_processes:
            process = self.running_processes[execution_id]
            
            try:
                # SIGTERM 전송
                process.terminate()
                
                # 프로세스 종료 대기 (최대 5초)
                try:
                    await asyncio.wait_for(process.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    # 강제 종료
                    process.kill()
                    await process.wait()
                
                del self.running_processes[execution_id]
                return True
                
            except Exception:
                return False
        
        return False
    
    def save_execution_history(self, execution_id: str, result: Dict[str, Any]):
        """실행 이력 저장"""
        history_entry = {
            "executionId": execution_id,
            "timestamp": datetime.now().isoformat(),
            "status": result.get("status"),
            "executionTime": result.get("executionTime")
        }
        
        self.execution_history.append(history_entry)
        
        # 최근 100개만 유지
        if len(self.execution_history) > 100:
            self.execution_history = self.execution_history[-100:]
    
    def get_execution_stats(self) -> Dict[str, Any]:
        """실행 통계 조회"""
        if not self.execution_history:
            return {
                "totalExecutions": 0,
                "successRate": 0,
                "averageExecutionTime": 0
            }
        
        total = len(self.execution_history)
        successful = sum(1 for h in self.execution_history if h["status"] == "success")
        total_time = sum(h.get("executionTime", 0) for h in self.execution_history)
        
        return {
            "totalExecutions": total,
            "successRate": (successful / total) * 100,
            "averageExecutionTime": total_time / total,
            "runningProcesses": len(self.running_processes)
        }
    
    async def monitor_system_resources(self) -> Dict[str, Any]:
        """시스템 리소스 모니터링"""
        try:
            # CPU 사용률
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # 메모리 사용률
            memory = psutil.virtual_memory()
            
            # 디스크 사용률
            disk = psutil.disk_usage('/')
            
            # 프로세스 정보
            current_process = psutil.Process()
            process_info = {
                "pid": current_process.pid,
                "cpuPercent": current_process.cpu_percent(),
                "memoryMB": current_process.memory_info().rss / 1024 / 1024,
                "threads": current_process.num_threads()
            }
            
            return {
                "system": {
                    "cpuPercent": cpu_percent,
                    "memoryPercent": memory.percent,
                    "memoryAvailableMB": memory.available / 1024 / 1024,
                    "diskPercent": disk.percent,
                    "diskFreeMB": disk.free / 1024 / 1024
                },
                "process": process_info
            }
            
        except Exception as e:
            return {"error": str(e)}


# 싱글톤 인스턴스
executor = PythonExecutor()

# 편의 함수
async def run_code(code: str, **kwargs) -> Dict[str, Any]:
    """코드 실행 편의 함수"""
    return await executor.execute_code(code, **kwargs)