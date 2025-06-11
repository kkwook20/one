# backend/execution.py - Backend 디렉토리에서 실행하도록 수정된 전체 코드

import asyncio
import json
import os
import subprocess
import sys
import tempfile
import requests
from typing import Dict, Any, List
from models import Node, Section

# storage 모듈은 나중에 필요할 때 import
# from storage import get_global_var, get_section_outputs

# 더미 함수들 (storage 모듈이 없는 경우를 위해)
def get_global_var(path):
    """글로벌 변수 접근 - 더미 구현"""
    return None

def get_section_outputs(section_name):
    """특정 섹션의 모든 출력을 가져옵니다 - 더미 구현"""
    return {}

def get_project_info(project_id: str) -> Dict[str, Any]:
    """프로젝트 정보 가져오기"""
    print(f"[Execution] Getting project info for ID: {project_id}")
    try:
        # 프로젝트 API에서 정보 가져오기 - 타임아웃 추가
        response = requests.get(
            f'http://localhost:8000/projects/{project_id}',
            timeout=5.0  # 5초 타임아웃
        )
        if response.status_code == 200:
            print(f"[Execution] Project info retrieved successfully")
            return response.json()
        else:
            print(f"[Execution] Project API returned status: {response.status_code}")
    except requests.exceptions.Timeout:
        print(f"[Warning] Project API timeout")
    except Exception as e:
        print(f"[Warning] Failed to get project info from API: {str(e)}")
    
    # 로컬 프로젝트 데이터 디렉토리에서 찾기 (백업)
    project_data_file = f'./data/projects/{project_id}.json'
    if os.path.exists(project_data_file):
        try:
            with open(project_data_file, 'r', encoding='utf-8') as f:
                print(f"[Execution] Project info loaded from file")
                return json.load(f)
        except Exception as e:
            print(f"[Warning] Failed to load project from file: {str(e)}")
    
    print(f"[Execution] No project info found")
    return None

def get_project_root_for_node(node_id: str, section_id: str) -> str:
    """노드와 섹션에 기반한 프로젝트 루트 경로 반환"""
    print(f"[Execution] get_project_root_for_node called for node: {node_id}, section: {section_id}")
    
    try:
        from storage import sections_db
        print(f"[Execution] sections_db imported in get_project_root_for_node")
    except ImportError as e:
        print(f"[Warning] Failed to import sections_db: {str(e)}")
        return './default_output'
    
    # 섹션 정보 가져오기
    section = sections_db.get(section_id)
    if not section:
        print(f"[Execution] Section not found in get_project_root_for_node")
        return './default_output'
    
    print(f"[Execution] Looking for input node...")
    # Input 노드에서 프로젝트 ID 찾기
    input_node = next((n for n in section.nodes if n.type == 'input'), None)
    if input_node and hasattr(input_node, 'projectId') and input_node.projectId:
        print(f"[Execution] Input node found with projectId: {input_node.projectId}")
        # 프로젝트 정보 가져오기
        project_info = get_project_info(input_node.projectId)
        
        if project_info:
            project_path = project_info.get('path', './projects')
            project_name = project_info.get('name', 'default')
            
            # 프로젝트 루트 경로 구성
            base_path = os.path.join(project_path, project_name)
            section_name_clean = section.name.lower().replace(' ', '-')
            section_path = os.path.join(base_path, section.group, section_name_clean)
            
            print(f"[Execution] Creating project path: {section_path}")
            # 경로가 없으면 생성
            try:
                os.makedirs(section_path, exist_ok=True)
                print(f"[Execution] Project path created successfully")
                return section_path
            except PermissionError:
                print(f"[Warning] Permission denied creating directory: {section_path}")
                return './default_output'
    else:
        print(f"[Execution] No input node with projectId found")
    
    # 기본 경로
    section_name_clean = section.name.lower().replace(' ', '-')
    default_path = f'./default_output/{section.group}/{section_name_clean}'
    print(f"[Execution] Using default path: {default_path}")
    try:
        os.makedirs(default_path, exist_ok=True)
    except:
        pass
    return default_path

async def execute_python_code(node_id: str, code: str, context: Dict[str, Any] = None, section_id: str = None) -> Dict[str, Any]:
    """Python 코드 실행"""
    
    print(f"[Execution] Starting code execution for node: {node_id}")
    print(f"[Execution] Context received: {context}")
    
    # 빈 코드 처리
    if not code or code.strip() == '':
        print(f"[Execution] Empty code for node: {node_id}")
        return {"success": True, "output": {"message": "No code to execute", "status": "empty"}}
    
    print(f"[Execution] Code is not empty, processing context...")
    
    # 컨텍스트에서 정보 추출
    inputs = context.get('inputs', {}) if context else {}
    
    print(f"[Execution] Context extracted, preparing node info...")
    
    # 노드 정보 가져오기
    node_purpose = ''
    output_format_description = ''
    current_node_data = {}
    section_name = ''
    model_name = 'none'
    lm_studio_url = ''
    project_root = './default_output'
    project_info = None
    
    print(f"[Execution] Checking section_id: {section_id}")
    print(f"[Execution] Context projectId: {context.get('projectId', 'NOT FOUND') if context else 'NO CONTEXT'}")
    
    # 백엔드의 실제 경로 얻기
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"[Execution] Backend directory: {backend_dir}")
    
    # 프로젝트 루트를 실제 경로로 설정
    if context and 'projectId' in context and context['projectId']:
        project_id = context['projectId']
        print(f"[Execution] Found projectId: {project_id}")
        
        # 프로젝트 정보 가져오기 (이름 포함)
        project_info = get_project_info(project_id)
        
        if project_info and 'name' in project_info:
            # 프로젝트 이름 사용
            project_name = project_info['name']
            print(f"[Execution] Project name from info: {project_name}")
            project_base = os.path.join(backend_dir, "projects", project_name)
        else:
            # 프로젝트 정보가 없으면 ID 사용
            print(f"[Execution] No project info found, using ID")
            project_base = os.path.join(backend_dir, "projects", project_id)
        
        # 섹션 정보가 있으면 추가
        if section_id:
            section_parts = section_id.split('-')
            if len(section_parts) >= 2:
                group = section_parts[0]
                name = '-'.join(section_parts[1:])
                project_root = os.path.join(project_base, group, name)
            else:
                project_root = os.path.join(project_base, section_id)
        else:
            project_root = project_base
            
        # 절대 경로로 변환
        project_root = os.path.abspath(project_root)
        print(f"[Execution] Calculated absolute project root: {project_root}")
    else:
        # 기본 경로도 절대 경로로
        print(f"[Execution] No projectId found, using default path")
        if section_id:
            section_parts = section_id.split('-')
            if len(section_parts) >= 2:
                group = section_parts[0]
                name = '-'.join(section_parts[1:])
                project_root = os.path.join(backend_dir, "default_output", group, name)
            else:
                project_root = os.path.join(backend_dir, "default_output", section_id)
        else:
            project_root = os.path.join(backend_dir, "default_output")
            
        project_root = os.path.abspath(project_root)
        print(f"[Execution] Using default absolute project root: {project_root}")
    
    # 디버깅: project_root 최종 확인
    print(f"[Execution] FINAL project_root: {project_root}")
    print(f"[Execution] Is absolute path: {os.path.isabs(project_root)}")
    
    # 프로젝트 디렉토리 생성
    try:
        os.makedirs(project_root, exist_ok=True)
        print(f"[Execution] Project directory created/verified: {project_root}")
        
        # 디렉토리 존재 확인
        if os.path.exists(project_root):
            print(f"[Execution] Directory exists: {project_root}")
            # 디렉토리 내용 확인
            try:
                contents = os.listdir(project_root)
                print(f"[Execution] Directory contents ({len(contents)} items): {contents[:5]}...")  # 처음 5개만
            except Exception as e:
                print(f"[Execution] Cannot list directory contents: {str(e)}")
    except Exception as e:
        print(f"[Execution] Error creating project directory: {str(e)}")
        # 에러가 발생하면 임시 디렉토리 사용하지 않고 계속 시도
    
    # 노드 정보 설정 (sections_db 사용 없이)
    if context:
        model_name = context.get('model', 'none')
        lm_studio_url = context.get('lmStudioUrl', '')
        print(f"[Execution] Model info from context - model: {model_name}, url: {lm_studio_url}")
    
    # 기본 노드 데이터
    current_node_data = {
        'id': node_id,
        'type': 'worker',
        'label': 'Worker Node',
        'model': model_name,
        'lmStudioUrl': lm_studio_url
    }
    
    print(f"[Execution] Checking file system permissions...")
    
    # 파일 시스템 권한 체크
    try:
        # 프로젝트 루트 디렉토리에 쓰기 권한이 있는지 확인
        test_file = os.path.join(project_root, '.test_write_permission')
        with open(test_file, 'w') as f:
            f.write('test')
        os.remove(test_file)
        print(f"[Execution] Write permission confirmed for: {project_root}")
    except Exception as e:
        print(f"[Warning] Write permission test failed for {project_root}: {str(e)}")
        # 권한이 없어도 계속 진행 (나중에 실제 파일 쓰기 시 에러 처리)
    
    # 임시 디렉토리에서 실행
    print(f"[Execution] Creating temporary directory for node: {node_id}")
    with tempfile.TemporaryDirectory() as temp_dir:
        code_file = os.path.join(temp_dir, "node_code.py")
        output_file = os.path.join(temp_dir, "output.json")
        user_code_file = os.path.join(temp_dir, "user_code.py")
        
        print(f"[Execution] Writing code to file: {code_file}")
        print(f"[Execution] Temp directory: {temp_dir}")
        
        # 사용자 코드를 별도 파일로 저장
        with open(user_code_file, "w", encoding='utf-8') as f:
            f.write(code)
        
        # wrapped_code 생성 직전 디버깅
        print(f"[Execution] project_root before wrapping: {project_root}")
        print(f"[Execution] repr(project_root): {repr(project_root)}")
        
        # 코드 래핑 - 모든 글로벌 변수 제공
        wrapped_code = f"""# -*- coding: utf-8 -*-
import json
import sys
import requests
import time
import os
import shutil
from pathlib import Path

# UTF-8 인코딩 설정
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 디버깅: 현재 작업 디렉토리 확인
print("[WRAPPED CODE] Current working directory: " + os.getcwd())
print("[WRAPPED CODE] Script location: " + os.path.abspath(__file__))

# 디버깅: 전달된 project_root 확인
print("[WRAPPED CODE DEBUG] Raw project_root: {repr(project_root)}")
print("[WRAPPED CODE DEBUG] Is absolute: " + str(os.path.isabs({repr(project_root)})))
print("[WRAPPED CODE DEBUG] Exists: " + str(os.path.exists({repr(project_root)})))

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

# 7. 프로젝트 루트 경로 (절대 경로)
project_root = {repr(project_root)}

# 프로젝트 경로 확인 및 생성
print("[WRAPPED CODE] Ensuring project directory exists...")
try:
    os.makedirs(project_root, exist_ok=True)
    print("[WRAPPED CODE] Project directory ready: " + project_root)
except Exception as e:
    print("[WRAPPED CODE] Error creating project directory: " + str(e))

# 8. 프로젝트 정보
project_info = {repr(project_info)}

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

def get_project_path(*subdirs):
    \"\"\"프로젝트 경로 생성 헬퍼\"\"\"
    if subdirs:
        path = os.path.join(project_root, *subdirs)
        Path(path).mkdir(parents=True, exist_ok=True)
        return path
    return project_root

def call_ai_model(prompt, model=None, url=None, **kwargs):
    \"\"\"AI 모델 호출 함수 - LM Studio API 연동
    
    Args:
        prompt: AI에게 보낼 프롬프트
        model: 사용할 모델명 (기본값: 노드 설정의 모델)
        url: LM Studio URL (기본값: 노드 설정의 URL)
        **kwargs: 추가 파라미터들 (temperature, max_tokens, system_message 등)
    \"\"\"
    model_to_use = model or model_name
    url_to_use = url or lm_studio_url
    
    if model_to_use == 'none' or not url_to_use:
        return {{"error": "No AI model configured", "message": "Please select an AI model in node settings"}}
    
    try:
        print("###AI_REQUEST_START###", flush=True)
        print("Calling AI model: " + str(model_to_use), flush=True)
        print("Using URL: " + str(url_to_use), flush=True)
        
        # 기본 메시지 구성
        messages = kwargs.get('messages', [])
        if not messages:
            # messages가 제공되지 않은 경우에만 기본 구성 사용
            system_message = kwargs.get('system_message', None)
            if system_message:
                messages = [
                    {{"role": "system", "content": system_message}},
                    {{"role": "user", "content": prompt}}
                ]
            else:
                # system message도 없으면 user message만
                messages = [{{"role": "user", "content": prompt}}]
        
        # API 요청 본문 구성 - 필수 파라미터만 포함
        request_body = {{
            "model": model_to_use,
            "messages": messages
        }}
        
        # 선택적 파라미터들 - 제공된 경우에만 추가
        optional_params = ['temperature', 'max_tokens', 'top_p', 'top_k', 
                          'stream', 'stop', 'presence_penalty', 'frequency_penalty',
                          'logit_bias', 'repeat_penalty', 'seed']
        
        for param in optional_params:
            if param in kwargs:
                request_body[param] = kwargs[param]
        
        # stream 파라미터는 항상 False (결과를 한번에 받기 위해)
        request_body['stream'] = False
        
        url_full = str(url_to_use) + "/v1/chat/completions"
        response = requests.post(
            url_full,
            json=request_body,
            timeout=kwargs.get('timeout', 300)  # 기본 5분, 사용자 지정 가능
        )
        
        if response.status_code == 200:
            result = response.json()
            content = result['choices'][0]['message']['content']
            print("###AI_RESPONSE_RECEIVED###", flush=True)
            print("Response length: " + str(len(content)) + " characters", flush=True)
            print("###AI_COMPLETE###", flush=True)
            
            # 전체 응답을 반환하려면 return_full_response=True 사용
            if kwargs.get('return_full_response', False):
                return result
            return content
        else:
            print("###AI_ERROR### Status code: " + str(response.status_code), flush=True)
            error_detail = ""
            try:
                error_detail = response.json()
                error_detail = ": " + str(error_detail)
            except:
                error_detail = ": " + str(response.text[:200])
            return {{"error": "AI model returned status " + str(response.status_code) + error_detail}}
            
    except requests.exceptions.Timeout:
        print("###AI_ERROR### Request timeout", flush=True)
        return {{"error": "AI model request timeout"}}
    except Exception as e:
        print("###AI_ERROR### " + str(e), flush=True)
        return {{"error": "AI model error: " + str(e)}}

# === 파일 시스템 헬퍼 함수들 ===

def ensure_directory(path):
    \"\"\"디렉토리가 없으면 생성\"\"\"
    try:
        Path(path).mkdir(parents=True, exist_ok=True)
        return True
    except Exception as e:
        print("Failed to create directory " + str(path) + ": " + str(e))
        return False

def save_to_project(filename, content, subdir=None):
    \"\"\"프로젝트 디렉토리에 파일 저장\"\"\"
    try:
        if subdir:
            full_path = os.path.join(project_root, subdir)
            ensure_directory(full_path)
            file_path = os.path.join(full_path, filename)
        else:
            file_path = os.path.join(project_root, filename)
        
        print("[SAVE] Saving to: " + str(file_path))
        
        # 파일 확장자에 따라 처리
        if filename.endswith('.json'):
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(content, f, ensure_ascii=False, indent=2)
        elif isinstance(content, (dict, list)):
            # dict/list인데 json이 아닌 경우
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(content, f, ensure_ascii=False, indent=2)
        else:
            # 텍스트 파일
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(str(content))
        
        print("[SAVE] File saved successfully: " + str(file_path))
        return file_path
    except Exception as e:
        print("[SAVE] Failed to save file " + str(filename) + ": " + str(e))
        import traceback
        traceback.print_exc()
        return None

def read_from_project(filename, subdir=None):
    \"\"\"프로젝트 디렉토리에서 파일 읽기\"\"\"
    try:
        if subdir:
            file_path = os.path.join(project_root, subdir, filename)
        else:
            file_path = os.path.join(project_root, filename)
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # JSON 파일인 경우 파싱
        if filename.endswith('.json'):
            return json.loads(content)
        return content
    except Exception as e:
        print("Failed to read file " + str(filename) + ": " + str(e))
        return None

def list_project_files(subdir=None, pattern='*'):
    \"\"\"프로젝트 디렉토리의 파일 목록 가져오기\"\"\"
    try:
        if subdir:
            search_path = Path(project_root) / subdir
        else:
            search_path = Path(project_root)
        
        if not search_path.exists():
            return []
        
        files = list(search_path.glob(pattern))
        return [str(f.relative_to(search_path)) for f in files if f.is_file()]
    except Exception as e:
        print("Failed to list files: " + str(e))
        return []

# === 헬퍼 함수들 ===

def update_task_status(task_id, status):
    \"\"\"작업 상태 업데이트 (pending/none/partial)\"\"\"
    for task in current_node.get('tasks', []):
        if task['id'] == task_id:
            task['status'] = status
            print("###TASK_UPDATE### " + str(task_id) + " -> " + str(status), flush=True)
            break

def log_progress(message):
    \"\"\"진행 상황 로깅\"\"\"
    print("###PROGRESS### " + str(message), flush=True)

# === 사용자 코드 실행 영역 ===

# 출력 변수 초기화 (전역 스코프에서)
output = None

try:
    print("###EXECUTION_START###", flush=True)
    print("Executing: " + str(current_node.get('label', 'Unknown Node')), flush=True)
    print("Project root: " + str(project_root), flush=True)
    if project_info:
        print("Project: " + str(project_info.get('name', 'Unknown')), flush=True)
    
    # 사용자 코드를 파일에서 읽어서 실행
    with open(r'{user_code_file}', 'r', encoding='utf-8') as f:
        user_code = f.read()
    
    # 사용자 코드를 exec로 실행
    exec(user_code, globals())
    
    print("###EXECUTION_COMPLETE###", flush=True)
    
    # output 변수가 설정되었는지 확인 (전역 및 로컬 모두 체크)
    output_value = None
    
    # 먼저 전역 변수 체크
    if 'output' in globals() and globals()['output'] is not None:
        output_value = globals()['output']
        print("###OUTPUT_SET### Output variable detected in globals", flush=True)
    # 로컬 변수 체크
    elif 'output' in locals() and locals()['output'] is not None:
        output_value = locals()['output']
        print("###OUTPUT_SET### Output variable detected in locals", flush=True)
    
    if output_value is not None:
        # output을 파일로 저장
        with open(r"{output_file}", "w", encoding="utf-8") as f:
            json.dump({{"success": True, "output": output_value}}, f, ensure_ascii=False)
        print("###OUTPUT_SAVED### Output saved to file", flush=True)
    else:
        print("###NO_OUTPUT### No output variable set", flush=True)
        with open(r"{output_file}", "w", encoding="utf-8") as f:
            json.dump({{"success": True, "output": {{"message": "No output set", "status": "no_output"}}}}, f, ensure_ascii=False)
            
except Exception as e:
    print("###EXECUTION_ERROR### " + str(e), flush=True)
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
    print("###ERROR_READING_OUTPUT### " + str(e))
"""
        
        with open(code_file, "w", encoding='utf-8') as f:
            f.write(wrapped_code)
        
        print(f"[Execution] Code file written, size: {os.path.getsize(code_file)} bytes")
        print(f"[Execution] Now attempting to execute...")
        
        # 코드 실행
        try:
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            
            # 프로젝트 경로를 환경 변수로도 전달
            env['PROJECT_ROOT'] = project_root
            env['ONE_AI_BACKEND_PATH'] = backend_dir
            
            print(f"[Execution] Creating subprocess for node: {node_id}")
            print(f"[Execution] Python executable: {sys.executable}")
            
            # ★★★ 핵심 수정: cwd를 backend_dir로 변경 ★★★
            print(f"[Execution] Working directory: {backend_dir}")  # temp_dir 대신 backend_dir
            
            # Windows에서는 동기 방식 사용
            returncode = -1  # 기본값
            
            if sys.platform == 'win32':
                print(f"[Execution] Using sync subprocess on Windows...")
                
                # asyncio 이벤트 루프에서 동기 코드 실행
                loop = asyncio.get_event_loop()
                
                def run_sync():
                    result = subprocess.run(
                        [sys.executable, code_file],
                        capture_output=True,
                        text=True,
                        encoding='utf-8',
                        timeout=120,
                        cwd=backend_dir,  # ★★★ temp_dir 대신 backend_dir 사용 ★★★
                        env=env
                    )
                    return result.stdout, result.stderr, result.returncode
                
                try:
                    stdout, stderr, returncode = await loop.run_in_executor(None, run_sync)
                    print(f"[Execution] Process completed with return code: {returncode}")
                except subprocess.TimeoutExpired:
                    print(f"[Execution] Process timeout")
                    return {"success": False, "error": "Code execution timeout (120s)"}
                
            else:
                # Linux/Mac에서는 asyncio subprocess 사용
                try:
                    process = await asyncio.create_subprocess_exec(
                        sys.executable, code_file,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                        cwd=backend_dir,  # ★★★ temp_dir 대신 backend_dir 사용 ★★★
                        env=env
                    )
                    
                    print(f"[Execution] Subprocess created, waiting for completion...")
                    
                    # 120초 타임아웃으로 프로세스 완료 대기
                    stdout_bytes, stderr_bytes = await asyncio.wait_for(
                        process.communicate(),
                        timeout=120.0
                    )
                    
                    # 바이트를 문자열로 디코드
                    stdout = stdout_bytes.decode('utf-8', errors='replace') if stdout_bytes else ""
                    stderr = stderr_bytes.decode('utf-8', errors='replace') if stderr_bytes else ""
                    returncode = process.returncode
                    
                except asyncio.TimeoutError:
                    print(f"[Execution] Process timeout, terminating...")
                    process.terminate()
                    await asyncio.sleep(0.5)
                    if process.returncode is None:
                        process.kill()
                    return {"success": False, "error": "Code execution timeout (120s)"}
            
            # stdout의 전체 내용 출력 (디버깅용)
            print(f"[Execution] STDOUT length: {len(stdout) if stdout else 0}")
            if stdout:
                print("[Execution] === FULL STDOUT START ===")
                print(stdout)
                print("[Execution] === FULL STDOUT END ===")
            else:
                print("[Execution] No stdout captured")
                
            if stderr:
                print(f"[Execution] STDERR:\n{stderr}")
            
            # 실행 로그 파싱
            stdout_lines = stdout.splitlines() if stdout else []
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
                "stdout": stdout[-1000:] if stdout else "",
                "stderr": stderr if stderr else "",
                "execution_logs": execution_logs
            }
                
        except Exception as e:
            print(f"[Execution] Exception during subprocess execution: {str(e)}")
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