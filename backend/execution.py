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
    
    # 컨텍스트에서 입력과 AI 모델 정보 추출
    inputs = context.get('inputs', {}) if context else {}
    model_name = context.get('model', 'none') if context else 'none'
    lm_studio_url = context.get('lmStudioUrl', '') if context else ''
    
    # 임시 디렉토리에서 실행
    with tempfile.TemporaryDirectory() as temp_dir:
        code_file = os.path.join(temp_dir, "node_code.py")
        output_file = os.path.join(temp_dir, "output.json")
        
        # 코드 래핑 - 시스템 필수 기능만 제공
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

# 입력 데이터 (연결된 노드의 출력)
inputs = {json.dumps(inputs, ensure_ascii=False)}

# 글로벌 변수 함수들
def get_connected_outputs():
    \"\"\"연결된 노드의 출력 데이터를 가져옵니다\"\"\"
    return inputs

def get_section_outputs(section_name):
    \"\"\"다른 섹션의 출력을 가져옵니다 (향후 구현)\"\"\"
    return {{}}

# AI 모델 접근 함수
def call_ai_model(prompt, model="{model_name}", url="{lm_studio_url}"):
    \"\"\"AI 모델 호출 함수 - LM Studio API 연동\"\"\"
    
    if model == 'none' or not url:
        return {{"error": "No AI model configured"}}
    
    try:
        print("###AI_REQUEST_START###", flush=True)
        print(f"Calling AI model: {{model}}", flush=True)
        
        response = requests.post(
            f"{{url}}/v1/chat/completions",
            json={{
                "model": model,
                "messages": [{{"role": "user", "content": prompt}}],
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

# 출력 변수 초기화
output = None

# 사용자 코드 실행
try:
    print("###EXECUTION_START###", flush=True)
    
    # 사용자 코드 실행
{chr(10).join('    ' + line for line in code.split(chr(10)))}
    
    print("###EXECUTION_COMPLETE###", flush=True)
    
    # output 변수가 설정되었는지 확인
    if 'output' in locals() and output is not None:
        print(f"###OUTPUT_SET### Output variable detected", flush=True)
        # output을 파일로 저장 (안정적인 전달을 위해)
        with open(r"{output_file}", "w", encoding="utf-8") as f:
            json.dump({{"success": True, "output": output}}, f, ensure_ascii=False)
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
except:
    print("###ERROR_READING_OUTPUT###")
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
            
            # 실행 로그 파싱
            stdout_lines = result.stdout.splitlines()
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
            
            # output.json 파일에서 결과 읽기 (가장 안정적인 방법)
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
                    except:
                        pass
            
            # 그래도 못 찾으면 에러 반환
            return {
                "success": False,
                "error": "Could not capture output from code execution",
                "stdout": result.stdout[-1000:],  # 마지막 1000자만
                "stderr": result.stderr,
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