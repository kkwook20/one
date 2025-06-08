# ========================================================================
# BASE CODE - 공통 실행 코드 (수정 불가)
# 이 코드는 모든 Worker 노드가 공통으로 사용하는 기본 실행 코드입니다.
# ========================================================================

import json
import time

# 연결된 입력 데이터 가져오기
input_data = get_connected_outputs()
print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Connected inputs received")
print(json.dumps(input_data, ensure_ascii=False, indent=2))

# 현재 노드 정보 출력
print(f"\nNode: {current_node.get('label', 'Unknown')}")
print(f"Purpose: {node_purpose}")
print(f"Expected Output Format: {output_format_description}")

# AI 모델 설정 확인 - execution.py에서 노드 설정으로부터 제공됨
print(f"\n[DEBUG] model_name: {model_name}")
print(f"[DEBUG] lm_studio_url: {lm_studio_url}")
print(f"[DEBUG] current_node['model']: {current_node.get('model', 'Not found')}")
print(f"[DEBUG] current_node['lmStudioUrl']: {current_node.get('lmStudioUrl', 'Not found')}")

if model_name == 'none' or not model_name or not lm_studio_url:
    print("\n⚠️  No AI model configured!")
    output = {
        "error": "No AI model configured",
        "hint": "Please connect to LM Studio and select a model",
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
    }
else:
    print(f"\n✅ Using AI model: {model_name}")
    
    # ========================================================================
    # 입력 데이터 통합
    # ========================================================================
    combined_input = ""
    for key, value in input_data.items():
        if isinstance(value, dict):
            if 'text' in value:
                combined_input += f"[{key}]\n{value['text']}\n\n"
            elif 'content' in value:
                combined_input += f"[{key}]\n{value['content']}\n\n"
            else:
                combined_input += f"[{key}]\n{json.dumps(value, ensure_ascii=False, indent=2)}\n\n"
        elif isinstance(value, str):
            combined_input += f"[{key}]\n{value}\n\n"
        else:
            combined_input += f"[{key}]\n{str(value)}\n\n"
    
    # ========================================================================
    # AI 프롬프트 구성
    # ========================================================================
    base_prompt = f"""당신은 다음 목적을 달성해야 하는 AI 어시스턴트입니다:

**목적 (Purpose):**
{node_purpose}

**입력 데이터:**
{combined_input.strip()}

**수행할 작업들 (Tasks):**"""
    
    # Tasks 추가
    if 'tasks' in current_node and current_node['tasks']:
        for i, task in enumerate(current_node['tasks'], 1):
            base_prompt += f"\n{i}. {task['text']}"
            # Task status에 따른 추가 지시
            if task.get('taskStatus') == 'locked':
                base_prompt += " [필수 - 반드시 수행]"
            elif task.get('taskStatus') == 'low_priority':
                base_prompt += " [선택적 - 가능한 경우 수행]"
    else:
        base_prompt += "\n(작업이 정의되지 않았습니다)"
    
    base_prompt += f"""\n\n**기대하는 출력 형식:**
{output_format_description}

위의 목적과 작업들을 수행하고, 지정된 출력 형식에 맞춰 결과를 생성해주세요.
"""

    # ========================================================================
    # Experimental Code 병합 (있는 경우)
    # ========================================================================
    # EXP_CODE_MERGE_POINT - 이 부분에서 Exp Code가 병합됩니다
    
    # ========================================================================
    # AI 모델 호출
    # ========================================================================
    try:
        print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Sending request to AI model...")
        print(f"Prompt length: {len(base_prompt)} characters")
        
        # AI 응답 받기
        ai_response = call_ai_model(base_prompt)
        print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] AI response received")
        
        # 응답 처리
        if isinstance(ai_response, dict) and 'error' in ai_response:
            output = ai_response
        elif isinstance(ai_response, str):
            # JSON 추출 시도
            json_start = ai_response.find('{')
            json_end = ai_response.rfind('}') + 1
            
            if json_start != -1 and json_end > json_start:
                try:
                    output = json.loads(ai_response[json_start:json_end])
                except json.JSONDecodeError:
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
            
        # 메타데이터 추가
        if isinstance(output, dict):
            output['_metadata'] = {
                'model': model_name,
                'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
                'node': current_node.get('label', 'Unknown')
            }
            
    except Exception as e:
        print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] ❌ Error: {str(e)}")
        output = {
            "error": f"AI processing failed: {str(e)}",
            "type": "error",
            "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
        }

# ========================================================================
# 최종 출력
# ========================================================================
print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Final output:")
print(json.dumps(output, ensure_ascii=False, indent=2))
print(f"\n✅ Execution completed successfully")

# output 변수가 설정되었음을 확인
print(f"\n[DEBUG] Output is set: {'output' in locals()}")
print(f"[DEBUG] Output value type: {type(output)}")
print(f"[DEBUG] Output is None: {output is None}")