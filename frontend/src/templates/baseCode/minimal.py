# ========================================================================
# MINIMAL BASE CODE - 최소 기능 템플릿
# 필수 기능만 포함된 간단한 실행 코드입니다.
# ========================================================================

import json

# 입력 데이터 가져오기
input_data = get_connected_outputs()

# AI 모델 확인
model_name = "${MODEL_NAME}"
if model_name == 'none':
    output = {"error": "No AI model configured"}
else:
    # 입력 텍스트 준비
    input_text = ""
    for key, value in input_data.items():
        if isinstance(value, dict) and 'text' in value:
            input_text += value['text'] + "\n"
        elif isinstance(value, str):
            input_text += value + "\n"
    
    # 프롬프트 생성
    prompt = f"""목적: {node_purpose}

입력:
{input_text}

출력 형식: {output_format_description}

위 목적에 맞게 처리하여 지정된 형식으로 결과를 반환하세요."""

    # EXP_CODE_MERGE_POINT
    
    # AI 호출
    try:
        ai_response = call_ai_model(prompt)
        
        # JSON 파싱 시도
        if isinstance(ai_response, str):
            try:
                output = json.loads(ai_response)
            except:
                output = {"result": ai_response}
        else:
            output = ai_response
            
    except Exception as e:
        output = {"error": str(e)}

# 결과 출력
print(json.dumps(output, ensure_ascii=False, indent=2))

globals()['output'] = output