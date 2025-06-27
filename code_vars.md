markdown# 노드 실행 환경 변수 가이드

## 필수 사용 변수
- `inputs` - 연결된 노드들의 출력 데이터 (dict)
- `output` - 노드 실행 결과 저장 (반드시 설정!)

## 노드 정보 변수
- `current_node` - 현재 노드의 모든 정보 (dict)
- `node_purpose` - 노드의 목적 (string)
- `output_format_description` - 출력 형식 설명 (string)
- `node_id` - 현재 노드 ID
- `section_name` - 현재 섹션 이름

## AI 모델 변수
- `model_name` - 선택된 AI 모델 이름
- `lm_studio_url` - LM Studio URL
- `call_ai_model(prompt, model=None, url=None)` - AI 호출 함수

## 데이터 접근 함수
- `get_connected_outputs()` - inputs와 동일
- `get_global_var(path)` - 글로벌 변수 접근
- `get_section_outputs(section_name)` - 섹션 출력
- `get_supervised_nodes()` - 관리 노드 목록 (Supervisor용)

## 헬퍼 함수
- `update_task_status(task_id, status)` - 작업 상태 업데이트
- `log_progress(message)` - 진행 상황 로깅

자유롭게 Python 코드를 작성하되, inputs에서 데이터를 읽고 output에 결과를 저장하세요.