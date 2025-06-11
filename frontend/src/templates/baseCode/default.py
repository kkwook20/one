# BASE CODE - Worker 노드 공통 실행 코드
# 프로젝트 정보 출력
print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Project root: {project_root}")
print(f"Node: {current_node.get('label', 'Unknown')}")

# 입력 데이터 가져오기
input_data = get_connected_outputs()

# AI 모델 확인
if model_name == 'none' or not model_name or not lm_studio_url:
    output = {
        "error": "No AI model configured",
        "hint": "Please connect to LM Studio and select a model"
    }
else:
    # 입력 데이터 통합
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
    
    # AI 프롬프트 구성
    base_prompt = f"""You are an AI assistant that must achieve the following purpose:

**Purpose:**
{node_purpose}

**Input Data:**
{combined_input.strip()}

**Tasks to Perform:**"""
    
    # Tasks 추가
    if 'tasks' in current_node and current_node['tasks']:
        for i, task in enumerate(current_node['tasks'], 1):
            base_prompt += f"\n{i}. {task['text']}"
    else:
        base_prompt += "\n(No tasks defined)"
    
    base_prompt += f"""\n\n**Expected Output Format:**
{output_format_description}

Please perform the above purpose and tasks, and generate results according to the specified output format.
"""

    # ========================================================================
    # Experimental Code 병합 지점
    # ========================================================================
    # EXP_CODE_MERGE_POINT - 이 부분에서 Exp Code가 병합됩니다
    
    # exp_prompt_addition이 있으면 프롬프트에 추가
    if 'exp_prompt_addition' in locals() or 'exp_prompt_addition' in globals():
        exp_addition = locals().get('exp_prompt_addition') or globals().get('exp_prompt_addition')
        if exp_addition:
            base_prompt += "\n\n**Additional Instructions:**\n" + exp_addition
    
    # AI 모델 호출
    try:
        print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Calling AI model...")
        ai_response = call_ai_model(base_prompt)
        
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
                        "type": "text"
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
        
        # 디버깅: EXP_POST_PROCESS_FUNCTION 확인
        print(f"\n[DEBUG] Checking for EXP_POST_PROCESS_FUNCTION...")
        print(f"[DEBUG] In locals: {'EXP_POST_PROCESS_FUNCTION' in locals()}")
        print(f"[DEBUG] In globals: {'EXP_POST_PROCESS_FUNCTION' in globals()}")
        
        # 후처리 함수 실행 (Experimental Code에서 정의된 경우)
        if 'EXP_POST_PROCESS_FUNCTION' in globals() and callable(globals()['EXP_POST_PROCESS_FUNCTION']):
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Running post-process function...")
            try:
                output = globals()['EXP_POST_PROCESS_FUNCTION'](output)
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Post-process completed")
            except Exception as e:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Post-process error: {str(e)}")
                import traceback
                traceback.print_exc()
        else:
            print(f"[DEBUG] EXP_POST_PROCESS_FUNCTION not found or not callable")
        if isinstance(output, dict):
            output['_metadata'] = {
                'model': model_name,
                'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
                'node': current_node.get('label', 'Unknown')
            }
            
    except Exception as e:
        output = {
            "error": f"AI processing failed: {str(e)}",
            "type": "error"
        }