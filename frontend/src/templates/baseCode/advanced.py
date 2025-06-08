# ========================================================================
# ADVANCED BASE CODE - 고급 기능 포함 공통 실행 코드
# 에러 처리, 재시도, 검증 로직이 포함된 고급 템플릿입니다.
# ========================================================================

import json
import time
import traceback
from typing import Any, Dict, List, Optional

# 설정값
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds
VALIDATE_OUTPUT = True

def log(level: str, message: str, data: Any = None):
    """구조화된 로깅 함수"""
    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
    log_entry = {
        "timestamp": timestamp,
        "level": level,
        "message": message
    }
    if data:
        log_entry["data"] = data
    print(f"[{timestamp}] [{level.upper()}] {message}")
    if data:
        print(json.dumps(data, ensure_ascii=False, indent=2))

def validate_input(data: Dict[str, Any]) -> bool:
    """입력 데이터 검증"""
    if not data:
        log("warning", "No input data provided")
        return False
    
    # 최소한 하나의 유효한 입력이 있는지 확인
    valid_inputs = 0
    for key, value in data.items():
        if value and (isinstance(value, (str, dict, list)) and len(str(value)) > 0):
            valid_inputs += 1
    
    return valid_inputs > 0

def process_input_data(data: Dict[str, Any]) -> str:
    """입력 데이터를 AI 프롬프트용 텍스트로 변환"""
    sections = []
    
    for key, value in data.items():
        if not value:
            continue
            
        header = f"[{key}]"
        content = ""
        
        if isinstance(value, dict):
            # 딕셔너리에서 텍스트 추출
            if 'text' in value:
                content = value['text']
            elif 'content' in value:
                content = value['content']
            elif 'result' in value:
                content = json.dumps(value['result'], ensure_ascii=False, indent=2)
            else:
                content = json.dumps(value, ensure_ascii=False, indent=2)
        elif isinstance(value, str):
            content = value
        elif isinstance(value, list):
            content = json.dumps(value, ensure_ascii=False, indent=2)
        else:
            content = str(value)
        
        if content:
            sections.append(f"{header}\n{content}")
    
    return "\n\n".join(sections)

def build_task_prompt(tasks: List[Dict[str, Any]]) -> str:
    """Task 목록을 프롬프트 텍스트로 변환"""
    if not tasks:
        return "(작업이 정의되지 않았습니다)"
    
    task_lines = []
    for i, task in enumerate(tasks, 1):
        task_text = f"{i}. {task['text']}"
        
        # Task 우선순위에 따른 지시 추가
        status = task.get('taskStatus', 'editable')
        if status == 'locked':
            task_text += " [필수 - 반드시 수행해주세요]"
        elif status == 'low_priority':
            task_text += " [선택적 - 가능한 경우에만 수행]"
        
        # AI 점수가 있는 경우 중요도 표시
        ai_score = task.get('aiScore', 50)
        if ai_score >= 80:
            task_text += " ⭐"
        
        task_lines.append(task_text)
    
    return "\n".join(task_lines)

def call_ai_with_retry(prompt: str, max_retries: int = MAX_RETRIES) -> Any:
    """재시도 로직이 포함된 AI 호출"""
    last_error = None
    
    for attempt in range(max_retries):
        try:
            if attempt > 0:
                log("info", f"Retry attempt {attempt + 1}/{max_retries}")
                time.sleep(RETRY_DELAY * attempt)  # 점진적 지연
            
            response = call_ai_model(prompt)
            
            # 응답 검증
            if isinstance(response, dict) and 'error' in response:
                raise Exception(response['error'])
            
            return response
            
        except Exception as e:
            last_error = str(e)
            log("warning", f"AI call failed (attempt {attempt + 1})", {"error": last_error})
            
            # 특정 오류는 재시도하지 않음
            if "rate limit" in last_error.lower():
                log("error", "Rate limit reached, stopping retries")
                break
    
    raise Exception(f"AI call failed after {max_retries} attempts: {last_error}")

def validate_output(output: Any) -> bool:
    """출력 데이터 검증"""
    if not output:
        return False
    
    if isinstance(output, dict):
        # 에러가 아닌 유효한 결과인지 확인
        if 'error' in output and not output.get('result'):
            return False
        
        # 최소한의 내용이 있는지 확인
        if output.get('result') is not None or output.get('data') is not None:
            return True
    
    # 문자열이나 리스트도 유효한 출력
    return isinstance(output, (str, list)) and len(str(output)) > 0

# ========================================================================
# 메인 실행 로직
# ========================================================================

try:
    # 시작 로그
    log("info", "Starting node execution", {
        "node": current_node.get('label', 'Unknown'),
        "model": "${MODEL_NAME}"
    })
    
    # 연결된 입력 데이터 가져오기
    input_data = get_connected_outputs()
    
    # 입력 데이터 검증
    if not validate_input(input_data):
        log("warning", "Invalid or empty input data")
        output = {
            "error": "No valid input data",
            "hint": "Please connect this node to valid input sources",
            "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
        }
    else:
        # AI 모델 확인
        model_name = "${MODEL_NAME}"
        if model_name == 'none':
            log("error", "No AI model configured")
            output = {
                "error": "No AI model configured",
                "hint": "Please connect to LM Studio and select a model",
                "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
            }
        else:
            # 입력 데이터 처리
            combined_input = process_input_data(input_data)
            log("info", f"Processed input data ({len(combined_input)} characters)")
            
            # Task 목록 처리
            task_prompt = build_task_prompt(current_node.get('tasks', []))
            
            # AI 프롬프트 구성
            base_prompt = f"""당신은 다음 목적을 달성해야 하는 전문 AI 어시스턴트입니다:

**목적 (Purpose):**
{node_purpose}

**입력 데이터:**
{combined_input}

**수행할 작업들 (Tasks):**
{task_prompt}

**기대하는 출력 형식:**
{output_format_description}

위의 목적과 작업들을 체계적으로 수행하고, 지정된 출력 형식에 정확히 맞춰 결과를 생성해주세요.
결과는 명확하고 구조화된 형태로 제공해주세요.
"""

            # ========================================================================
            # Experimental Code 병합 포인트
            # ========================================================================
            # EXP_CODE_MERGE_POINT - 이 부분에서 Exp Code가 병합됩니다
            
            # AI 모델 호출 (재시도 로직 포함)
            log("info", "Calling AI model", {
                "model": model_name,
                "prompt_length": len(base_prompt)
            })
            
            try:
                ai_response = call_ai_with_retry(base_prompt)
                log("info", "AI response received successfully")
                
                # 응답 처리 및 파싱
                if isinstance(ai_response, str):
                    # JSON 추출 시도
                    json_start = ai_response.find('{')
                    json_end = ai_response.rfind('}') + 1
                    
                    if json_start != -1 and json_end > json_start:
                        try:
                            output = json.loads(ai_response[json_start:json_end])
                            log("info", "Successfully parsed JSON from response")
                        except json.JSONDecodeError as e:
                            log("warning", "JSON parsing failed", {"error": str(e)})
                            output = {
                                "result": ai_response,
                                "type": "text",
                                "raw_response": True
                            }
                    else:
                        output = {
                            "result": ai_response,
                            "type": "text"
                        }
                else:
                    output = ai_response
                
                # 출력 검증
                if VALIDATE_OUTPUT and not validate_output(output):
                    log("warning", "Output validation failed")
                    output = {
                        "error": "Invalid output format",
                        "original_response": output,
                        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
                    }
                else:
                    # 메타데이터 추가
                    if isinstance(output, dict):
                        output['_metadata'] = {
                            'model': model_name,
                            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
                            'node': current_node.get('label', 'Unknown'),
                            'execution_time': time.time() - start_time if 'start_time' in locals() else None,
                            'validated': True
                        }
                
            except Exception as e:
                log("error", "AI processing failed", {
                    "error": str(e),
                    "traceback": traceback.format_exc()
                })
                output = {
                    "error": f"AI processing failed: {str(e)}",
                    "type": "error",
                    "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
                    "traceback": traceback.format_exc()
                }

except Exception as e:
    # 전역 에러 처리
    log("critical", "Unexpected error in node execution", {
        "error": str(e),
        "traceback": traceback.format_exc()
    })
    output = {
        "error": f"Critical error: {str(e)}",
        "type": "critical_error",
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
        "traceback": traceback.format_exc()
    }

# ========================================================================
# 최종 출력
# ========================================================================
log("info", "Execution completed", {
    "success": not isinstance(output, dict) or 'error' not in output,
    "output_type": type(output).__name__
})

if isinstance(output, dict) and len(json.dumps(output)) > 1000:
    log("info", "Large output generated", {"size": len(json.dumps(output))})
else:
    log("info", "Final output", output)

print(f"\n✅ Node execution completed")

globals()['output'] = output