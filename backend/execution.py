# backend/execution.py - 수정된 버전

import asyncio
import json
import os
import subprocess
import sys
import tempfile
import requests
from typing import Dict, Any, List
from models import Node, Section
from storage import get_global_var, get_section_outputs

async def execute_python_code(node_id: str, code: str, context: Dict[str, Any] = None, section_id: str = None) -> Dict[str, Any]:
    """Python 코드 실행"""
    
    # 빈 코드 처리
    if not code or code.strip() == '':
        return {"success": True, "output": {"message": "No code to execute", "status": "empty"}}
    
    # 컨텍스트에서 정보 추출
    inputs = context.get('inputs', {}) if context else {}
    
    # 노드 정보 가져오기
    node_purpose = ''
    output_format_description = ''
    current_node_data = {}
    section_name = ''
    model_name = 'none'
    lm_studio_url = ''
    
    if section_id:
        from storage import sections_db
        section = sections_db.get(section_id)
        if section:
            section_name = section.name.lower()
            node = next((n for n in section.nodes if n.id == node_id), None)
            if node:
                node_purpose = node.purpose or ''
                output_format_description = node.outputFormat or ''
                # 노드에서 모델 정보 가져오기
                model_name = node.model or 'none'
                lm_studio_url = node.lmStudioUrl or ''
                current_node_data = {
                    'id': node.id,
                    'type': node.type,
                    'label': node.label,
                    'purpose': node.purpose,
                    'outputFormat': node.outputFormat,
                    'tasks': [task.dict() if hasattr(task, 'dict') else task for task in (node.tasks or [])],
                    'model': node.model,
                    'lmStudioUrl': node.lmStudioUrl,
                    'connectedFrom': node.connectedFrom,
                    'supervised': node.type in ['supervisor', 'planner'],  
                    'running': node.isRunning,
                    'deactivated': node.isDeactivated
                }
    
    # 임시 디렉토리에서 실행
    with tempfile.TemporaryDirectory() as temp_dir:
        code_file = os.path.join(temp_dir, "node_code.py")
        output_file = os.path.join(temp_dir, "output.json")
        
        # 코드 래핑 - 모든 글로벌 변수 제공
        wrapped_code = f"""# -*- coding: utf-8 -*-
import json
import sys
import requests
import time
import os

# UTF-8 인코딩 설정
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# === 시스템 제공 변수들 ===

# 1. 현재 노드 정보
current_node_json = {repr(json.dumps(current_node_data, ensure_ascii=False))}
current_node = json.loads(current_node_json)

# 2. 노드 목적 (직접 접근 가능)
node_purpose = {repr(node_purpose)}

# 3. 출력 형식 설명 (직접 접근 가능)
output_format_description = {repr(output_format_description)}

# 4. 연결된 노드의 출력 (직접 접근 가능)
inputs_json = {repr(json.dumps(inputs, ensure_ascii=False))}
inputs = json.loads(inputs_json)

# 5. AI 모델 설정
model_name = {repr(model_name)}
lm_studio_url = {repr(lm_studio_url)}

# 6. 섹션 정보
section_name = {repr(section_name)}
node_id = {repr(node_id)}

# === 시스템 제공 함수들 ===

def get_connected_outputs():
    \"\"\"연결된 노드의 출력 데이터를 가져옵니다\"\"\"
    return inputs

def get_global_var(path):
    \"\"\"글로벌 변수 접근 - 예: 'section.type.id.output'\"\"\"
    # 실제 구현은 storage 모듈에서 처리
    # 여기서는 시뮬레이션
    return None

def get_section_outputs(section_name):
    \"\"\"특정 섹션의 모든 출력을 가져옵니다\"\"\"
    # 실제 구현은 storage 모듈에서 처리
    return {{}}

def get_supervised_nodes():
    \"\"\"Supervisor 노드에서 관리하는 노드 목록 반환\"\"\"
    if current_node.get('type') == 'supervisor':
        return current_node.get('supervised', [])
    return []

def call_ai_model(prompt, model=None, url=None):
    \"\"\"AI 모델 호출 함수 - LM Studio API 연동\"\"\"
    model_to_use = model or model_name
    url_to_use = url or lm_studio_url
    
    if model_to_use == 'none' or not url_to_use:
        return {{"error": "No AI model configured", "message": "Please select an AI model in node settings"}}
    
    try:
        print("###AI_REQUEST_START###", flush=True)
        print(f"Calling AI model: {{model_to_use}}", flush=True)
        print(f"Using URL: {{url_to_use}}", flush=True)
        
        response = requests.post(
            f"{{url_to_use}}/v1/chat/completions",
            json={{
                "model": model_to_use,
                "messages": [
                    {{"role": "system", "content": "You are a helpful assistant."}},
                    {{"role": "user", "content": prompt}}
                ],
                "temperature": 0.7,
                "max_tokens": 2000,
                "stream": False
            }},
            timeout=60
        )
        
        if response.status_code == 200:
            result = response.json()
            content = result['choices'][0]['message']['content']
            print("###AI_RESPONSE_RECEIVED###", flush=True)
            print(f"Response length: {{len(content)}} characters", flush=True)
            print("###AI_COMPLETE###", flush=True)
            return content
        else:
            print(f"###AI_ERROR### Status code: {{response.status_code}}", flush=True)
            return {{"error": f"AI model returned status {{response.status_code}}"}}
            
    except Exception as e:
        print(f"###AI_ERROR### {{str(e)}}", flush=True)
        return {{"error": f"AI model error: {{str(e)}}"}}

# === 헬퍼 함수들 ===

def update_task_status(task_id, status):
    \"\"\"작업 상태 업데이트 (pending/none/partial)\"\"\"
    for task in current_node.get('tasks', []):
        if task['id'] == task_id:
            task['status'] = status
            print(f"###TASK_UPDATE### {{task_id}} -> {{status}}", flush=True)
            break

def log_progress(message):
    \"\"\"진행 상황 로깅\"\"\"
    print(f"###PROGRESS### {{message}}", flush=True)

# === 사용자 코드 실행 영역 ===

# 출력 변수 초기화 (전역 스코프에서)
output = None

# 사용자 코드를 실행하는 함수
def execute_user_code():
    global output  # 전역 output 변수 사용 선언
    
{chr(10).join('    ' + line for line in code.split(chr(10)))}
    
    return output

try:
    print("###EXECUTION_START###", flush=True)
    print(f"Executing: {{current_node.get('label', 'Unknown Node')}}", flush=True)
    
    # 사용자 코드 실행
    result = execute_user_code()
    if result is not None:
        output = result
    
    print("###EXECUTION_COMPLETE###", flush=True)
    
    # output 변수가 설정되었는지 확인 (전역 및 로컬 모두 체크)
    output_value = None
    
    # 먼저 전역 변수 체크
    if 'output' in globals() and globals()['output'] is not None:
        output_value = globals()['output']
        print(f"###OUTPUT_SET### Output variable detected in globals", flush=True)
    # 로컬 변수 체크
    elif 'output' in locals() and locals()['output'] is not None:
        output_value = locals()['output']
        print(f"###OUTPUT_SET### Output variable detected in locals", flush=True)
    
    if output_value is not None:
        # output을 파일로 저장
        with open(r"{output_file}", "w", encoding="utf-8") as f:
            json.dump({{"success": True, "output": output_value}}, f, ensure_ascii=False)
        print(f"###OUTPUT_SAVED### Output saved to file", flush=True)
    else:
        print("###NO_OUTPUT### No output variable set", flush=True)
        with open(r"{output_file}", "w", encoding="utf-8") as f:
            json.dump({{"success": True, "output": {{"message": "No output set", "status": "no_output"}}}}, f, ensure_ascii=False)
            
except Exception as e:
    print(f"###EXECUTION_ERROR### {{str(e)}}", flush=True)
    import traceback
    traceback.print_exc()
    with open(r"{output_file}", "w", encoding="utf-8") as f:
        json.dump({{"success": False, "error": str(e), "type": str(type(e).__name__)}}, f, ensure_ascii=False)

# 결과 확인을 위한 최종 출력
try:
    with open(r"{output_file}", "r", encoding="utf-8") as f:
        final_result = json.load(f)
        print("###FINAL_OUTPUT###", json.dumps(final_result, ensure_ascii=False))
except Exception as e:
    print(f"###ERROR_READING_OUTPUT### {{str(e)}}")
"""
        
        with open(code_file, "w", encoding='utf-8') as f:
            f.write(wrapped_code)
        
        # 코드 실행
        try:
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            
            result = subprocess.run(
                [sys.executable, code_file],
                capture_output=True,
                text=True,
                encoding='utf-8',
                timeout=120,
                cwd=temp_dir,
                env=env
            )
            
            # 디버깅을 위해 stdout과 stderr 출력
            if result.stdout:
                print(f"[Execution] STDOUT:\n{result.stdout}")
            if result.stderr:
                print(f"[Execution] STDERR:\n{result.stderr}")
            
            # 실행 로그 파싱
            stdout_lines = result.stdout.splitlines() if result.stdout else []
            execution_logs = []
            
            for line in stdout_lines:
                if line.startswith("###AI_REQUEST_START###"):
                    execution_logs.append({"type": "ai_request", "message": "Sending request to AI model"})
                elif line.startswith("###AI_RESPONSE_RECEIVED###"):
                    execution_logs.append({"type": "ai_response", "message": "Received response from AI model"})
                elif line.startswith("###AI_COMPLETE###"):
                    execution_logs.append({"type": "ai_complete", "message": "AI processing completed"})
                elif line.startswith("###OUTPUT_SET###"):
                    execution_logs.append({"type": "info", "message": "Output variable detected"})
                elif line.startswith("###OUTPUT_SAVED###"):
                    execution_logs.append({"type": "info", "message": "Output saved successfully"})
                elif line.startswith("###NO_OUTPUT###"):
                    execution_logs.append({"type": "warning", "message": "No output variable set by code"})
                elif line.startswith("###TASK_UPDATE###"):
                    task_info = line.replace("###TASK_UPDATE###", "").strip()
                    execution_logs.append({"type": "task_update", "message": f"Task updated: {task_info}"})
                elif line.startswith("###PROGRESS###"):
                    progress_msg = line.replace("###PROGRESS###", "").strip()
                    execution_logs.append({"type": "progress", "message": progress_msg})
                elif line.startswith("###EXECUTION_ERROR###"):
                    error_msg = line.replace("###EXECUTION_ERROR###", "").strip()
                    execution_logs.append({"type": "error", "message": f"Execution error: {error_msg}"})
            
            # output.json 파일에서 결과 읽기
            output_path = os.path.join(temp_dir, "output.json")
            if os.path.exists(output_path):
                try:
                    with open(output_path, "r", encoding="utf-8") as f:
                        result_data = json.load(f)
                        result_data["execution_logs"] = execution_logs
                        
                        # 디버깅 정보 추가
                        print(f"[Execution] Successfully loaded output from file: {json.dumps(result_data)[:100]}...")
                        
                        return result_data
                except Exception as e:
                    print(f"[Execution] Error reading output file: {e}")
            
            # 파일이 없으면 stdout에서 FINAL_OUTPUT 찾기
            for line in stdout_lines:
                if line.startswith("###FINAL_OUTPUT###"):
                    try:
                        json_str = line.replace("###FINAL_OUTPUT###", "").strip()
                        result_data = json.loads(json_str)
                        result_data["execution_logs"] = execution_logs
                        return result_data
                    except Exception as e:
                        print(f"[Execution] Error parsing FINAL_OUTPUT: {e}")
            
            # 그래도 못 찾으면 에러 반환
            return {
                "success": False,
                "error": "Could not capture output from code execution",
                "stdout": result.stdout[-1000:] if result.stdout else "",
                "stderr": result.stderr if result.stderr else "",
                "execution_logs": execution_logs
            }
                
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Code execution timeout (120s)"}
        except Exception as e:
            return {"success": False, "error": str(e)}

def get_connected_outputs(node: Node, section: Section, all_sections: List[Section]) -> Dict[str, Any]:
    """연결된 노드의 출력 가져오기"""
    if not node.connectedFrom:
        return {}
    
    outputs = {}
    for conn_id in node.connectedFrom:
        for n in section.nodes:
            if n.id == conn_id and n.output:
                outputs[n.label] = n.output
                break
    
    return outputs