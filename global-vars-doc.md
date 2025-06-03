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

## 파일 구조

```
node-storage/
├── {node-id}/
│   ├── data.json          # 현재 노드 데이터
│   ├── version_*.json     # 버전 히스토리
│   └── output/           # 생성된 파일들
└── index.json            # 전역 변수 인덱스
```

## 섹션별 변수 예시

### Preproduction
- `preproduction.planning.{id}.output.story_outline`
- `preproduction.script.{id}.output.dialogue`
- `preproduction.storyboard.{id}.output.scenes`

### Post-production
- `postproduction.modeling.{id}.output.mesh_data`
- `postproduction.rigging.{id}.output.skeleton`
- `postproduction.texture.{id}.output.materials`
- `postproduction.animation.{id}.output.keyframes`
- `postproduction.vfx.{id}.output.effects`
- `postproduction.lighting.{id}.output.light_setup`
- `postproduction.sound.{id}.output.audio_tracks`
- `postproduction.compositing.{id}.output.final_render`

### Director
- `director.direction.{id}.output.creative_notes`
- `director.review.{id}.output.feedback`

## 버전 관리

각 노드의 변경사항은 자동으로 버전화되며, 다음 정보가 저장됨:

- **timestamp**: 수정 시간
- **inputHash**: 입력 데이터 해시
- **outputHash**: 출력 데이터 해시
- **parameters**: 실행 파라미터
- **modelVersion**: 사용된 AI 모델
- **modifiedBy**: 수정자 (사용자 또는 supervisor 노드 ID)

## 주의사항

1. 글로벌 변수는 읽기 전용으로 사용
2. 순환 참조 주의 (A→B→A)
3. 존재하지 않는 변수 참조 시 None 반환
4. 대소문자 구분 없음 (섹션명은 소문자로 변환됨)
5. Deactivated 노드의 출력은 접근 가능하나 실행되지 않음