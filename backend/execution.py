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

async def execute_python_code(node_id: str, code: str, context: Dict[str, Any] = None, section_id: str = None) -> Dict[str, Any]:
    """Python 코드 실행"""
    
    # 빈 코드 처리
    if not code or code.strip() == '':
        return {"success": True, "output": {"message": "No code to execute", "status": "empty"}}
    
    # 컨텍스트에서 입력과 AI 모델 정보 추출
    inputs = context.get('inputs', {}) if context else {}
    model_name = context.get('model', 'none') if context else 'none'
    lm_studio_url = context.get('lmStudioUrl', '') if context else ''
    
    # 노드 정보 가져오기 (purpose와 outputFormat을 위해)
    node_purpose = ''
    output_format_description = ''
    current_node_data = {}
    global_vars_data = {}
    section_outputs_data = {}
    
    if section_id:
        from storage import sections_db, get_global_var as storage_get_global_var, get_section_outputs as storage_get_section_outputs
        section = sections_db.get(section_id)
        if section:
            node = next((n for n in section.nodes if n.id == node_id), None)
            if node:
                node_purpose = node.purpose or ''
                output_format_description = node.outputFormat or ''
                # 현재 노드의 전체 데이터
                current_node_data = {
                    'id': node.id,
                    'type': node.type,
                    'label': node.label,
                    'purpose': node.purpose,
                    'outputFormat': node.outputFormat,
                    'tasks': [task.dict() if hasattr(task, 'dict') else task for task in (node.tasks or [])],
                    'model': node.model,
                    'lmStudioUrl': node.lmStudioUrl
                }
                
                # 자주 사용되는 global variables 미리 준비
                # 예: 같은 섹션의 다른 노드 정보들
                for n in section.nodes:
                    if n.id != node_id and n.output:
                        var_path = f"{section.name.lower()}.{n.type}.{n.id}.output"
                        global_vars_data[var_path] = n.output
    
    # 임시 디렉토리에서 실행
    with tempfile.TemporaryDirectory() as temp_dir:
        code_file = os.path.join(temp_dir, "node_code.py")
        
        # 코드 래핑 - UTF-8 인코딩 설정 추가
        wrapped_code = f"""# -*- coding: utf-8 -*-
import json
import sys

# UTF-8 인코딩 설정
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 입력 데이터
inputs = {json.dumps(inputs, ensure_ascii=False)}

# AI 모델 설정
model_name = "{model_name}"
lm_studio_url = "{lm_studio_url}"

# 현재 노드 정보
current_node = {json.dumps(current_node_data, ensure_ascii=False)}

# 노드 목적
node_purpose = '''{node_purpose}'''

# 출력 형식 설명
output_format_description = '''{output_format_description}'''

# 미리 로드된 global variables
_global_vars = {json.dumps(global_vars_data, ensure_ascii=False)}

# 글로벌 변수 접근 함수
def get_global_var(var_path):
    # 미리 로드된 데이터에서 찾기
    if var_path in _global_vars:
        return _global_vars[var_path]
    # TODO: 없으면 실제 storage에서 가져오는 로직 추가 필요
    return None

def get_connected_outputs():
    return inputs

def get_section_outputs(section_name):
    # TODO: 실제 구현 필요
    return {{}}

# AI 모델 접근 함수 (예시)
def call_ai_model(prompt, model=None, endpoint=None):
    \"\"\"AI 모델 호출 함수 (실제 구현은 사용자가 작성)\"\"\"
    model_to_use = model or model_name
    endpoint_to_use = endpoint or lm_studio_url
    
    # 여기에 실제 AI 모델 호출 로직 구현
    # 예: requests를 사용한 API 호출
    return {{"response": f"Mock response from {{model_to_use}}"}}

# 출력 변수 초기화
output = None

# 사용자 코드 실행
try:
{chr(10).join('    ' + line for line in code.split(chr(10)))}
except Exception as e:
    output = {{"error": str(e), "type": str(type(e).__name__)}}
    import traceback
    traceback.print_exc()

# 결과 출력
if output is not None:
    print(json.dumps({{"success": True, "output": output}}, ensure_ascii=False))
else:
    print(json.dumps({{"success": True, "output": {{"message": "Code executed successfully"}}}}, ensure_ascii=False))
"""
        
        # UTF-8로 파일 저장
        with open(code_file, "w", encoding='utf-8') as f:
            f.write(wrapped_code)
        
        # 코드 실행 - UTF-8 인코딩 명시
        try:
            # Windows에서 UTF-8 사용을 위한 환경 변수 설정
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            
            result = subprocess.run(
                [sys.executable, code_file],
                capture_output=True,
                text=True,
                timeout=30,  # 30초 타임아웃
                cwd=temp_dir,
                encoding='utf-8',  # UTF-8 인코딩 명시
                env=env  # 환경 변수 전달
            )
            
            if result.returncode == 0:
                try:
                    return json.loads(result.stdout)
                except json.JSONDecodeError:
                    # stdout이 비어있거나 JSON이 아닌 경우
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