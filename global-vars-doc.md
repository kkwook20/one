# 글로벌 변수 시스템 문서

## 글로벌 변수 네이밍 규칙

**형식**: `{섹션명}.{노드타입}.{노드ID}.{데이터타입}.{세부항목}`

## 데이터 타입 상세

### 1. output
- **설명**: 노드 실행 결과 JSON
- **예시**: `preproduction.planning.node003.output.character_settings`
- **반환값**: JSON 객체 또는 특정 필드 값

### 2. files
- **설명**: 생성된 파일 경로 목록
- **예시**: `modeling.worker.node005.files`
- **반환값**: 파일명 배열

### 3. code
- **설명**: 현재 Python 소스 코드
- **예시**: `animation.worker.node007.code`
- **반환값**: Python 코드 문자열

### 4. status
- **설명**: 실행 상태 정보
- **예시**: `vfx.worker.node009.status`
- **반환값**: `{running: boolean, deactivated: boolean}`

### 5. config
- **설명**: 노드 설정값
- **예시**: `lighting.worker.node011.config`
- **반환값**: 설정 객체

### 6. tasks
- **설명**: 작업 항목 리스트 (상태 포함)
- **예시**: `rigging.worker.node013.tasks`
- **반환값**: `[{id, text, status: 'pending'|'none'|'partial'}]`

### 7. history
- **설명**: 버전 히스토리 (최대 5개)
- **예시**: `texture.worker.node015.history`
- **반환값**: 버전 객체 배열

### 8. metadata
- **설명**: 실행 메타데이터
- **예시**: `compositing.worker.node017.metadata`
- **반환값**: `{inputHash, outputHash, parameters, modelVersion, modifiedBy}`

## AI 모델 사용법

### 사전 정의된 변수

각 노드 실행 시 다음 변수들이 자동으로 설정됩니다:

```python
# AI 모델 이름 (노드에서 선택한 모델)
model_name = "llama-3.1-8b"  # 또는 "none", "mistral-7b" 등

# LM Studio 엔드포인트 URL
lm_studio_url = "http://localhost:1234"  # 사용자가 연결한 LM Studio URL
```

### LM Studio 모델 사용 예시

```python
import requests
import json

def call_lm_studio(prompt):
    """LM Studio API를 통해 AI 모델 호출"""
    if model_name == 'none' or not lm_studio_url:
        return {"error": "No AI model configured"}
    
    try:
        response = requests.post(
            f"{lm_studio_url}/v1/chat/completions",
            headers={"Content-Type": "application/json"},
            json={
                "model": model_name,
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": 1000
            }
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"API error: {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}

# 사용 예시
result = call_lm_studio("Analyze this script and suggest improvements")
output = {
    "ai_response": result,
    "model_used": model_name
}
```

### 내장 AI 함수 사용

```python
# 미리 정의된 call_ai_model 함수 사용
response = call_ai_model("Your prompt here")

# 다른 모델이나 엔드포인트 사용 시
response = call_ai_model(
    prompt="Your prompt", 
    model="different-model",
    endpoint="http://different-endpoint:5000"
)
```

## 사용 예시

### Python 코드 내에서 사용

```python
# 다른 섹션의 캐릭터 설정 가져오기
character_data = get_global_var("preproduction.planning.node003.output.character_settings")

# 다른 노드의 작업 상태 확인
task_status = get_global_var("section2.worker.node005.tasks.status_list")

# 히스토리 버전 접근
old_code = get_global_var("section1.supervisor.node001.history.version_3")

# 연결된 노드의 출력 가져오기
connected_outputs = get_connected_outputs()

# 특정 섹션의 모든 출력 가져오기
section_outputs = get_section_outputs("preproduction")

# AI 모델을 사용한 스크립트 분석
if model_name != 'none':
    script_data = get_connected_outputs().get("Script Input", {})
    analysis = call_ai_model(f"Analyze this script: {script_data}")
    output = {
        "analysis": analysis,
        "suggestions": extract_suggestions(analysis)
    }
else:
    output = {"message": "No AI model configured for analysis"}
```

### 특수 함수

#### get_connected_outputs()
현재 노드에 연결된 모든 노드의 출력을 딕셔너리 형태로 반환

```python
outputs = get_connected_outputs()
# 반환: {"NodeLabel1": output1, "NodeLabel2": output2}
```

#### get_section_outputs(section_name)
특정 섹션의 모든 노드 출력을 가져옴

```python
preproduction_data = get_section_outputs("preproduction")
```

#### get_supervised_nodes()
Supervisor 노드에서 관리하는 노드 목록 반환

```python
supervised = get_supervised_nodes()
# 반환: ["node_id_1", "node_id_2"]
```

#### call_ai_model(prompt, model=None, endpoint=None)
AI 모델 호출 (간단한 래퍼 함수)

```python
response = call_ai_model("Your prompt here")
# 반환: {"response": "AI generated text"}
```

## AI 모델별 사용 예시

### Supervisor 노드에서 코드 개선

```python
def supervise_nodes():
    # 관리할 노드들의 코드 가져오기
    for node_id in get_supervised_nodes():
        code = get_global_var(f"{section_name}.worker.{node_id}.code")
        
        if code and model_name != 'none':
            # AI를 사용한 코드 개선 제안
            improvement = call_ai_model(
                f"Review this code and suggest improvements:\n{code}"
            )
            
            # 개선 사항 저장
            output = {
                "node_id": node_id,
                "original_code": code,
                "suggestions": improvement,
                "ai_score": calculate_code_quality(code)
            }
```

### Planner 노드에서 워크플로우 최적화

```python
def plan_workflow():
    # 섹션의 모든 노드 정보 수집
    section_data = get_section_outputs(section_name)
    
    if model_name != 'none':
        # AI를 사용한 워크플로우 분석
        analysis = call_ai_model(
            f"Analyze this workflow and suggest optimizations: {json.dumps(section_data)}"
        )
        
        output = {
            "workflow_analysis": analysis,
            "recommendations": parse_recommendations(analysis),
            "efficiency_score": calculate_efficiency(section_data)
        }
```

## 파일 구조

```
node-storage/
├── {node-id}/
│   ├── data.json          # 현재 노드 데이터
│   ├── version_*.json     # 버전 히스토리
│   └── output/           # 생성된 파일들
└── index.json            # 전역 변수 인덱스
```

## 주의사항

1. 글로벌 변수는 읽기 전용으로 사용
2. 순환 참조 주의 (A→B→A)
3. 존재하지 않는 변수 참조 시 None 반환
4. 대소문자 구분 없음 (섹션명은 소문자로 변환됨)
5. Deactivated 노드의 출력은 접근 가능하나 실행되지 않음
6. AI 모델 사용 시 API 제한 및 비용 고려
7. LM Studio가 실행 중이어야 로컬 모델 사용 가능