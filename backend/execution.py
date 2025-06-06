# backend/execution.py - 정리된 버전

import asyncio
import json
import os
import subprocess
import sys
import tempfile
from typing import Dict, Any, List
from models import Node, Section
from storage import get_global_var, get_section_outputs

async def execute_python_code(node_id: str, code: str, inputs: Dict[str, Any] = None, section_id: str = None) -> Dict[str, Any]:
    """Python 코드 실행"""
    
    # 빈 코드 처리
    if not code or code.strip() == '':
        return {"success": True, "output": {"message": "No code to execute", "status": "empty"}}
    
    # 임시 디렉토리에서 실행
    with tempfile.TemporaryDirectory() as temp_dir:
        code_file = os.path.join(temp_dir, "node_code.py")
        
        # 코드 래핑
        wrapped_code = f"""
import json
import sys

# 입력 데이터
inputs = {json.dumps(inputs or {})}

# 글로벌 변수 접근 함수 (더미 - 실제 환경에서는 API 호출로 대체)
def get_global_var(var_path):
    # 실제 환경에서는 API를 통해 가져와야 함
    return None

def get_connected_outputs():
    return inputs

def get_section_outputs(section_name):
    # 실제 환경에서는 API를 통해 가져와야 함
    return {{}}

# 출력 변수 초기화
output = None

# 사용자 코드 실행
try:
{chr(10).join('    ' + line for line in code.split(chr(10)))}
except Exception as e:
    output = {{"error": str(e), "type": str(type(e).__name__)}}

# 결과 출력
if output is not None:
    print(json.dumps({{"success": True, "output": output}}))
else:
    print(json.dumps({{"success": True, "output": {{"message": "Code executed successfully"}}}}))
"""
        
        with open(code_file, "w", encoding='utf-8') as f:
            f.write(wrapped_code)
        
        # 코드 실행
        try:
            result = subprocess.run(
                [sys.executable, code_file],
                capture_output=True,
                text=True,
                timeout=30,  # 30초 타임아웃
                cwd=temp_dir
            )
            
            if result.returncode == 0:
                try:
                    return json.loads(result.stdout)
                except json.JSONDecodeError:
                    return {"success": True, "output": result.stdout.strip() or "No output"}
            else:
                return {"success": False, "error": result.stderr or "Unknown error"}
                
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Code execution timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

def get_connected_outputs(node: Node, section: Section, all_sections: List[Section]) -> Dict[str, Any]:
    """연결된 노드의 출력 가져오기"""
    if not node.connectedFrom:
        return {}
    
    outputs = {}
    for conn_id in node.connectedFrom:
        # 현재 섹션에서 찾기
        for n in section.nodes:
            if n.id == conn_id and n.output:
                outputs[n.label] = n.output
                break
        
        # 다른 섹션에서도 찾기 (cross-section connections)
        if conn_id not in outputs:
            for other_section in all_sections:
                if other_section.id != section.id:
                    for n in other_section.nodes:
                        if n.id == conn_id and n.output:
                            outputs[n.label] = n.output
                            break
    
    return outputs