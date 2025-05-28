import asyncio
import json
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
import subprocess
import tempfile

class WorkerNode:
    """Worker 노드 - Python 코드 실행 및 작업 처리"""
    
    def __init__(self):
        self.config_dir = Path("config/nodes")
        self.data_dir = Path("data/projects")
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)
    
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Worker 노드 실행"""
        try:
            # 설정 로드
            config = await self.load_config(node_id)
            
            # 입력 데이터 준비
            input_data = data.get('inputData', {})
            
            # 이전 노드의 출력 데이터 가져오기
            if 'previousNodeId' in data:
                previous_output = await self.load_previous_output(data['previousNodeId'])
                input_data.update(previous_output)
            
            # Python 코드 실행
            result = await self.run_python_code(
                node_id,
                config.get('code', ''),
                input_data
            )
            
            # 결과 저장
            await self.save_output(node_id, result)
            
            # 작업 상태 업데이트
            await self.update_task_status(node_id, config.get('tasks', []))
            
            return {
                "status": "success",
                "output": result.get('output_data', {}),
                "logs": result.get('logs', []),
                "executionTime": result.get('executionTime', 0),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
                "timestamp": datetime.now().isoformat()
            }
    
    async def load_config(self, node_id: str) -> Dict[str, Any]:
        """노드 설정 로드"""
        config_path = self.config_dir / f"{node_id}.json"
        
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        # 기본 설정
        return {
            "tasks": [],
            "code": "",
            "inputs": {},
            "outputs": {},
            "settings": {
                "timeout": 300,  # 5분
                "maxMemory": "1GB",
                "allowFileAccess": True,
                "allowNetworkAccess": False
            }
        }
    
    async def run_python_code(
        self, 
        node_id: str, 
        code: str, 
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Python 코드 실행"""
        if not code:
            return {
                "output_data": {},
                "logs": ["No code to execute"],
                "executionTime": 0
            }
        
        logs = []
        start_time = datetime.now()
        
        # 실행 환경 준비
        exec_globals = {
            'input_data': input_data,
            'output_data': {},
            'node_id': node_id,
            'logs': logs,
            'print': lambda *args, **kwargs: logs.append(' '.join(map(str, args))),
            
            # 유용한 라이브러리들
            'json': json,
            'Path': Path,
            'datetime': datetime,
            'os': os,
            'sys': sys
        }
        
        # 추가 라이브러리 로드 (설치되어 있는 경우)
        try:
            import numpy as np
            exec_globals['np'] = np
        except ImportError:
            pass
        
        try:
            import pandas as pd
            exec_globals['pd'] = pd
        except ImportError:
            pass
        
        try:
            import requests
            exec_globals['requests'] = requests
        except ImportError:
            pass
        
        # 코드 실행
        try:
            exec(code, exec_globals)
            output_data = exec_globals.get('output_data', {})
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            return {
                "output_data": output_data,
                "logs": logs,
                "executionTime": execution_time
            }
            
        except Exception as e:
            logs.append(f"Error: {str(e)}")
            logs.append(traceback.format_exc())
            
            return {
                "output_data": {},
                "logs": logs,
                "executionTime": (datetime.now() - start_time).total_seconds(),
                "error": str(e)
            }
    
    async def load_previous_output(self, previous_node_id: str) -> Dict[str, Any]:
        """이전 노드의 출력 데이터 로드"""
        output_path = self.data_dir / previous_node_id / "output.json"
        
        if output_path.exists():
            with open(output_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return {}
    
    async def save_output(self, node_id: str, result: Dict[str, Any]):
        """실행 결과 저장"""
        output_dir = self.data_dir / node_id
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # 출력 데이터 저장
        output_path = output_dir / "output.json"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result.get('output_data', {}), f, indent=2, ensure_ascii=False)
        
        # 실행 로그 저장
        log_path = output_dir / f"execution_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        with open(log_path, 'w', encoding='utf-8') as f:
            f.write(f"Execution Time: {result.get('executionTime', 0):.2f}s\n")
            f.write("-" * 50 + "\n")
            for log in result.get('logs', []):
                f.write(f"{log}\n")
    
    async def update_task_status(self, node_id: str, tasks: list):
        """작업 상태 업데이트"""
        # 작업 진행률 계산 및 저장
        status_path = self.data_dir / node_id / "task_status.json"
        
        task_status = []
        for task in tasks:
            # 실제로는 코드 실행 결과를 분석하여 진행률 계산
            # 여기서는 시뮬레이션
            progress = 50 if task.get('status') == 'todo' else 100
            
            task_status.append({
                "id": task.get('id'),
                "text": task.get('text'),
                "status": task.get('status'),
                "progress": progress,
                "lastUpdated": datetime.now().isoformat()
            })
        
        with open(status_path, 'w', encoding='utf-8') as f:
            json.dump(task_status, f, indent=2, ensure_ascii=False)
    
    async def execute_with_isolation(
        self, 
        node_id: str, 
        code: str, 
        input_data: Dict[str, Any],
        settings: Dict[str, Any]
    ) -> Dict[str, Any]:
        """격리된 환경에서 코드 실행 (보안 강화)"""
        # 임시 스크립트 파일 생성
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            # 실행 스크립트 작성
            script = f"""
import json
import sys

# 입력 데이터 로드
input_data = {json.dumps(input_data)}

# 출력 데이터 초기화
output_data = {{}}

# 사용자 코드 실행
{code}

# 결과 출력
print(json.dumps({{'output_data': output_data}}))
"""
            f.write(script)
            script_path = f.name
        
        try:
            # 별도 프로세스에서 실행
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                script_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(self.data_dir / node_id)
            )
            
            # 타임아웃 설정
            timeout = settings.get('timeout', 300)
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout
                )
                
                if process.returncode == 0:
                    result = json.loads(stdout.decode())
                    return {
                        "output_data": result.get('output_data', {}),
                        "logs": [stderr.decode()] if stderr else [],
                        "executionTime": 0
                    }
                else:
                    return {
                        "output_data": {},
                        "logs": [f"Process exited with code {process.returncode}", stderr.decode()],
                        "executionTime": 0,
                        "error": "Execution failed"
                    }
                    
            except asyncio.TimeoutError:
                process.kill()
                return {
                    "output_data": {},
                    "logs": [f"Execution timeout after {timeout} seconds"],
                    "executionTime": timeout,
                    "error": "Timeout"
                }
                
        finally:
            # 임시 파일 삭제
            try:
                os.unlink(script_path)
            except:
                pass


# 모듈 레벨 인스턴스
worker_node = WorkerNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await worker_node.execute(node_id, data)