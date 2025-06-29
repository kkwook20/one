# 주기적 상태 변경 문제 디버깅

## 현재 상황
- Firefox와 Extension 상태가 주기적으로 on/off를 반복함
- Frontend에서 "Starting..." 메시지가 빠르게 나타났다 사라짐

## 추적 결과

### 1. Frontend (DataCollection.tsx)
- WebSocket으로 state_update 메시지 수신
- 상태 변경 시 콘솔에 로그 출력
- 추가된 로깅:
  - 타임스탬프와 함께 상태 변경 추적
  - 실제 상태 변경 vs 메타데이터만 변경 구분

### 2. Backend - Firefox Manager
- broadcast_state에서 상태를 WebSocket으로 전송
- 추가된 로깅:
  - 누가 broadcast를 호출했는지 stack trace
  - 실제 상태 변경이 없으면 broadcast 스킵

### 3. Backend - Data Collection
- native/status 엔드포인트가 Extension 상태 업데이트 처리
- Firefox Manager로 모든 처리 위임

### 4. Native Host
- 5초마다 백엔드 명령 polling
- Extension과의 메시지 통신 처리
- init → init_response → init_ack 시퀀스

### 5. Firefox Extension
- Native Host 연결 시 init 메시지 전송
- 연결 해제 시 재연결 시도 (exponential backoff)
- 500ms debounce 추가됨

## 가능한 원인들

1. **Native Messaging 연결 불안정**
   - Extension과 Native Host 간 연결이 반복적으로 끊어짐
   - 재연결 시마다 init 시퀀스 실행

2. **중복 상태 업데이트**
   - init_ack 때 'fully_connected' 상태 전송
   - Firefox Manager에서도 상태 업데이트

3. **Polling 간섭**
   - Native Host의 5초 polling이 연결에 영향?

## 해결 방안

1. **연결 안정성 향상**
   - Native Host와 Extension 간 keep-alive 메커니즘
   - 더 긴 timeout 설정

2. **상태 업데이트 최적화**
   - 중복 상태 업데이트 제거
   - 상태 변경 시에만 broadcast

3. **로깅 강화**
   - init 메시지 빈도 추적
   - 연결 해제 원인 파악

## 다음 단계

1. 로그 모니터링으로 init 메시지 빈도 확인
2. Native Host 연결 안정성 개선
3. 불필요한 상태 업데이트 제거