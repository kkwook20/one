# LLM Conversation Collector - Personal Edition

## 🎯 개요
개인용 Firefox extension으로 ChatGPT, Claude, Gemini, DeepSeek, Grok, Perplexity 등의 LLM 플랫폼에서 대화 내용을 자동으로 수집하여 로컬에 저장합니다.

## ⚠️ 중요 사항
- **개인용으로만 사용**: 이 extension은 개인 학습 및 백업 목적으로만 사용하세요
- **봇 감지 방지**: 사람처럼 행동하도록 설계되었지만, 과도한 사용은 피하세요
- **보안 주의**: 로그인 정보는 로컬에만 저장되며, 안전하게 관리하세요

## 🌟 주요 기능
- ✅ 6개 LLM 플랫폼 지원 (ChatGPT, Claude, Gemini, DeepSeek, Grok, Perplexity)
- ✅ 하루 한번 자동 동기화 (새벽 2-5시 랜덤 시간)
- ✅ 사람처럼 자연스러운 행동 패턴
- ✅ 중복 수집 방지 (이미 수집된 대화 제외)
- ✅ 로컬 파일 시스템에 구조적으로 저장
- ✅ 날짜별 대화 통계 표시

## 📁 파일 저장 구조
```
/home/user/llm-conversations/
├── chatgpt/
│   ├── 2024-01-20/
│   │   ├── conversation-abc123.json
│   │   └── conversation-def456.json
│   └── metadata.json
├── claude/
│   ├── 2024-01-20/
│   │   └── conversation-xyz789.json
│   └── metadata.json
├── gemini/
├── deepseek/
├── grok/
└── perplexity/
```

## 🚀 설치 방법

### 1. Extension 파일 준비
```bash
# 프로젝트 폴더 생성
mkdir llm-collector
cd llm-collector

# 필수 파일 생성
touch manifest.json background.js content.js popup.html popup.js options.html options.js

# 아이콘 폴더 생성
mkdir icons
# 아이콘 파일 추가 (16x16, 48x48, 128x128 PNG)
```

### 2. Firefox에 설치
1. Firefox 주소창에 `about:debugging` 입력
2. "This Firefox" 클릭
3. "Load Temporary Add-on" 클릭
4. `manifest.json` 파일 선택

### 3. 초기 설정
1. Extension 아이콘 클릭 → "Settings" 버튼
2. 저장 폴더 경로 설정
3. 사용할 플랫폼 활성화
4. 각 플랫폼의 로그인 정보 입력
5. "Save Settings" 클릭

## 🔧 상세 설정

### 저장 위치
- 기본값: `/home/user/llm-conversations`
- Windows: `C:\Users\YourName\Documents\llm-conversations`
- macOS: `/Users/YourName/Documents/llm-conversations`

### 자동 동기화
- **시간**: 새벽 2-5시 사이 랜덤 (봇 감지 방지)
- **주기**: 24시간 (기본값)
- **옵션**: 6시간, 12시간, 2일, 수동

### 플랫폼별 로그인 정보
각 플랫폼별로 필요한 정보:
- **ChatGPT**: OpenAI 계정 이메일/비밀번호
- **Claude**: Anthropic 계정 이메일/비밀번호
- **Gemini**: Google 계정 이메일/비밀번호
- **DeepSeek**: DeepSeek 계정 이메일/비밀번호
- **Grok**: X(Twitter) 계정 사용자명/비밀번호
- **Perplexity**: Perplexity 계정 이메일/비밀번호

## 📊 사용 방법

### 수동 동기화
1. Extension 아이콘 클릭
2. "Sync Now" 버튼 클릭
3. 진행 상황 확인 (로딩 표시)

### 통계 확인
팝업에서 확인 가능:
- 총 수집된 대화 수
- 오늘 동기화된 대화 수
- 활성화된 플랫폼 수
- 사용된 저장 공간

### 데이터 내보내기
설정 페이지에서 "Export Data" 클릭하여 설정 및 통계 정보를 JSON으로 내보내기

## 🛡️ 안전한 사용을 위한 팁

### 봇 감지 방지
- ✅ 랜덤 지연 시간 (2-8초)
- ✅ 자연스러운 스크롤 동작
- ✅ 실제 사용자처럼 마우스 움직임
- ✅ 플랫폼별 랜덤 접속 순서
- ✅ 각 플랫폼 간 5-15분 대기

### 권장 사항
1. **과도한 사용 금지**: 하루 1회 자동 동기화면 충분
2. **소량씩 수집**: 최근 20개 대화만 확인
3. **정상적인 사용 병행**: Extension만 사용하지 말고 직접도 사용
4. **VPN 사용 고려**: IP 차단 방지

## 🔍 문제 해결

### Extension이 작동하지 않을 때
1. Firefox 버전 확인 (최신 버전 권장)
2. `about:debugging`에서 에러 메시지 확인
3. 권한 설정 확인

### 로그인이 실패할 때
1. 2단계 인증 확인 (일시적으로 비활성화 필요)
2. 올바른 로그인 정보 확인
3. 각 플랫폼에 수동으로 로그인 후 재시도

### 대화가 수집되지 않을 때
1. 플랫폼 UI 변경 확인 (DOM 선택자 업데이트 필요)
2. 저장 폴더 권한 확인
3. 브라우저 콘솔에서 에러 확인

## 📝 개발자 정보

### 플랫폼별 선택자 업데이트
`content.js`에서 각 플랫폼의 DOM 선택자 수정:

```javascript
// ChatGPT 예시
const conversationLinks = document.querySelectorAll('nav a[href^="/c/"]');
const messageElements = document.querySelectorAll('[data-message-author-role]');
```

### 새 플랫폼 추가
1. `manifest.json`에 도메인 추가
2. `background.js`에 플랫폼 설정 추가
3. `content.js`에 수집 함수 구현
4. UI 컴포넌트 업데이트

## ⚖️ 법적 고지
- 이 도구는 개인 백업 및 학습 목적으로만 사용하세요
- 각 플랫폼의 이용 약관을 확인하고 준수하세요
- 수집된 데이터의 상업적 사용은 금지됩니다
- 제작자는 부적절한 사용에 대한 책임을 지지 않습니다

## 🔄 업데이트 내역
- v2.0 (2024.01): 개인용 버전 출시
  - 서버 기능 제거
  - 로컬 파일 저장
  - 6개 플랫폼 지원
  - 봇 감지 방지 강화