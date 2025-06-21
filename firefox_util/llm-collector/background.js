// Firefox Extension - firefox_util\llm-collector\background.js (Native Messaging 전용 버전)
console.log('[LLM Collector] Extension loaded at', new Date().toISOString());

// ======================== Configuration ========================
const NATIVE_HOST_ID = 'com.argosa.native';
const BACKEND_URL = 'http://localhost:8000/api/argosa/data';

// Platform configurations
const PLATFORMS = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com', // chat.openai.com 대신 chatgpt.com 사용
    conversationListUrl: 'https://chatgpt.com/backend-api/conversations',
    conversationDetailUrl: (id) => `/backend-api/conversation/${id}`,
    cookieDomain: ['.openai.com', '.chatgpt.com', '.auth0.com'], // 세 도메인 모두 확인
    loginSelectors: ['[data-testid="profile-button"]', 'nav button img'],
    sessionCheckUrl: 'https://chatgpt.com/backend-api/accounts/check',
    sessionCheckMethod: 'GET'
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    conversationListUrl: 'https://claude.ai/api/chat_conversations',
    conversationDetailUrl: (id) => `/api/chat_conversations/${id}`,
    cookieDomain: '.claude.ai',
    loginSelectors: ['[class*="chat"]', '[data-testid="user-menu"]'],
    sessionCheckUrl: 'https://claude.ai/api/organizations',
    sessionCheckMethod: 'GET'
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    conversationListUrl: 'https://gemini.google.com/api/conversations',
    conversationDetailUrl: (id) => `/api/conversations/${id}`,
    cookieDomain: '.google.com',
    loginSelectors: ['[aria-label*="Google Account"]'],
    sessionCheckUrl: 'https://gemini.google.com/app',
    sessionCheckMethod: 'GET'
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    conversationListUrl: 'https://chat.deepseek.com/api/v0/chat/conversations',
    conversationDetailUrl: (id) => `/api/v0/chat/conversation/${id}`,
    cookieDomain: '.deepseek.com',
    loginSelectors: ['[class*="avatar"]'],
    sessionCheckUrl: 'https://chat.deepseek.com/api/v0/user/info',
    sessionCheckMethod: 'GET'
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.x.ai',
    conversationListUrl: 'https://grok.x.ai/api/conversations',
    conversationDetailUrl: (id) => `/api/conversations/${id}`,
    cookieDomain: '.x.ai',
    loginSelectors: ['[data-testid="SideNav_AccountSwitcher_Button"]'],
    sessionCheckUrl: 'https://grok.x.ai/api/user',
    sessionCheckMethod: 'GET'
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    conversationListUrl: 'https://www.perplexity.ai/api/conversations',
    conversationDetailUrl: (id) => `/api/conversations/${id}`,
    cookieDomain: '.perplexity.ai',
    loginSelectors: ['[class*="profile"]'],
    sessionCheckUrl: 'https://www.perplexity.ai/api/auth/session',
    sessionCheckMethod: 'GET'
  }
};

// ======================== Main Extension Class ========================
class NativeExtension {
  constructor() {
    this.settings = this.getDefaultSettings();
    this.state = {
      sessions: {},
      collecting: false
    };
    
    // Native Messaging
    this.nativePort = null;
    this.nativeConnected = false;
    this.reconnectDelay = 1000; 
    this.messageQueue = [];
    this.loginCheckIntervals = new Map(); // 로그인 체크 인터벌 관리
    this.loginCheckTabs = new Map(); // 로그인 체크 중인 탭 추적
    
    // Initialize
    this.init();
  }
  
  getDefaultSettings() {
    return {
      maxConversations: 20,
      randomDelay: 5,
      delayBetweenPlatforms: 5
    };
  }
  
  async init() {
    console.log('[Extension] Initializing native extension...');
    
    // Load saved state
    await this.loadState();
    
    // Load settings
    await this.loadSettings();
    
    // Connect to Native Host
    this.connectNative();
    
    // Heartbeat to Native Host (15초마다 - 더 자주)
    setInterval(() => {
      if (this.nativeConnected) {
        this.sendNativeMessage({
          type: 'heartbeat',
          data: {
            timestamp: new Date().toISOString(),
            sessions: this.getSessionStates(),
            extension_alive: true,
            disable_firefox_monitor: true  // 계속 비활성화 요청
          }
        });
      }
    }, 15000);  // 15초로 단축
    
    // Backend에 직접 생존 신호 (20초마다)
    setInterval(async () => {
      await this.notifyBackendStatus('extension_alive', {
        alive: true,
        sessions: this.getSessionStates(),
        override_firefox_monitor: true
      });
    }, 20000);
    
    // 메시지 핸들러 추가
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'getState') {
        sendResponse({
          nativeConnected: this.nativeConnected,
          sessions: this.state.sessions,
          collecting: this.state.collecting,
          savedAt: this.state.savedAt
        });
        return true;
      }
      
      if (message.type === 'startCollection') {
        this.handleCollectCommand('popup', message.data);
        sendResponse({ success: true });
        return true;
      }
      
      // Session check from content script
      if (message.action === 'checkSessionInTab') {
        this.checkSessionInNewTab(message.platform, message.url)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ valid: false, error: error.message }));
        return true;
      }
    });
    
    console.log('[Extension] Initialization complete');
  }
  
  // ======================== Native Messaging ========================
  
  connectNative() {
    console.log('[Extension] Connecting to native host...');
    
    try {
      this.nativePort = browser.runtime.connectNative(NATIVE_HOST_ID);
      
      this.nativePort.onMessage.addListener((message) => {
        console.log('[Extension] Native message:', message);
        this.handleNativeMessage(message);
      });
      
      this.nativePort.onDisconnect.addListener(() => {
        console.error('[Extension] Native port disconnected:', browser.runtime.lastError);
        this.nativePort = null;
        this.nativeConnected = false;
        
        // 진행 중인 로그인 체크 정리
        for (const [platform, intervalId] of this.loginCheckIntervals) {
          clearInterval(intervalId);
        }
        this.loginCheckIntervals.clear();
        this.loginCheckTabs.clear();
        
        // Backend에 연결 해제 알림
        this.notifyBackendStatus('disconnected');
        
        // 재연결 시도
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
        setTimeout(() => this.connectNative(), this.reconnectDelay);
      });
      
      // 초기화 메시지
      this.sendNativeMessage({
        type: 'init',
        id: 'init_' + Date.now(),
        data: {
          version: '2.0',
          platform: 'firefox',
          extension_active: true,
          disable_firefox_monitor: true  // Firefox Monitor 비활성화 요청
        }
      });
      
      this.nativeConnected = true;
      this.reconnectDelay = 1000; // Reset delay on successful connection
      
      // Process queued messages
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift();
        this.sendNativeMessage(msg);
      }
      
    } catch (error) {
      console.error('[Extension] Failed to connect native:', error);
      this.nativeConnected = false;
      
      // 재연결 시도
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
      setTimeout(() => this.connectNative(), this.reconnectDelay);
    }
  }
  
  async notifyBackendStatus(status, additionalData = {}) {
    try {
      // status별 엔드포인트 결정
      let endpoint = `${BACKEND_URL}/native/status`;
      let payload = {
        status: status,
        extension_ready: status === 'connected',
        timestamp: new Date().toISOString(),
        ...additionalData
      };
      
      if (status === 'session_active') {
        endpoint = `${BACKEND_URL}/native/message`;
        payload = {
          type: 'session_update',
          id: `direct_${Date.now()}`,
          data: {
            ...additionalData,
            timestamp: new Date().toISOString()
          }
        };
      } else if (status === 'login_in_progress') {
        endpoint = `${BACKEND_URL}/native/message`;
        payload = {
          type: 'login_status',
          id: `login_status_${Date.now()}`,
          data: {
            ...additionalData,
            timestamp: new Date().toISOString(),
            extension_active: true
          }
        };
      } else if (status === 'extension_alive') {
        endpoint = `${BACKEND_URL}/native/message`;
        payload = {
          type: 'extension_heartbeat',
          id: `heartbeat_${Date.now()}`,
          data: {
            alive: true,
            timestamp: new Date().toISOString(),
            ...additionalData
          }
        };
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        console.error(`[Extension] Backend notification failed: ${response.status}`);
      } else {
        console.log(`[Extension] Backend notified: ${status}`, additionalData);
      }
    } catch (error) {
      console.error('[Extension] Failed to notify backend:', error);
    }
  }
  
  sendNativeMessage(message) {
    if (!this.nativePort) {
      console.error('[Extension] Native port not connected, queuing message');
      this.messageQueue.push(message);
      return false;
    }
    
    // ID 추가
    if (!message.id) {
      message.id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Firefox Monitor 관련 메시지 필터링
    if (message.data && (message.data.source === 'firefox_monitor' || message.data.source === 'firefox_closed')) {
      console.log('[Extension] Filtering out firefox_monitor message');
      return false;
    }
    
    try {
      this.nativePort.postMessage(message);
      console.log('[Extension] Sent message:', message);
      return true;
    } catch (error) {
      console.error('[Extension] Send error:', error);
      this.messageQueue.push(message);
      return false;
    }
  }
  
  async handleNativeMessage(message) {
    const { id, type } = message;
    console.log('[Extension] Received native message:', type);

    if (type === 'init_response') {
      console.log('[Extension] Native Host initialized successfully');
      
      await this.notifyBackendStatus('connected', {
        capabilities: message.capabilities || [],
        nativeHost: true,
        status: message.status
      });
      
      this.sendNativeMessage({ type: 'init_ack', id: id });
    }
    else if (type === 'collect_conversations') {
      await this.handleCollectCommand(id, message.data);
    }
    else if (type === 'execute_llm_query') {
      await this.handleLLMQueryCommand(id, message.data);
    }
    else if (type === 'check_session') {
      await this.handleSessionCheck(id, message.data);
    }
    else if (type === 'update_settings') {
      this.settings = { ...this.settings, ...message.data };
      await this.saveSettings();
    }
    else if (type === 'open_login_page') {
      console.log('[Extension] Opening login page for:', message.data?.platform);
      await this.handleOpenLoginPage(id, message.data);
    }
    else if (type === 'session_update') {
      // Firefox 관련 메시지 완전 차단
      const source = message.data?.source;
      const error = message.data?.error;
      const platform = message.data?.platform;
      
      // Firefox Monitor나 firefox_closed source는 무시
      if (source === 'firefox_monitor' || source === 'firefox_closed') {
        console.log(`[Extension] Blocking session_update from ${source}`);
        return;
      }
      
      // Firefox 관련 에러 메시지 차단
      if (error && (
        error.toLowerCase().includes('firefox') || 
        error.toLowerCase().includes('closed') ||
        error === 'Firefox was closed' ||
        error === 'User closed the tab'
      )) {
        console.log('[Extension] Blocking Firefox-related error:', error);
        
        // 로그인이 필요한 플랫폼이면 무시
        if (platform && this.state.loginInProgress && this.state.loginInProgress[platform]) {
          const loginInfo = this.state.loginInProgress[platform];
          console.log(`[Extension] Ignoring Firefox error during login process for ${platform}, session: ${loginInfo.sessionId}`);
          
          // Backend에 Extension이 살아있음을 알림
          await this.notifyBackendStatus('override_firefox_error', {
            platform: platform,
            login_session_id: loginInfo.sessionId,
            extension_alive: true,
            message: 'Extension is active, ignore Firefox closed error'
          });
          
          return;
        }
        
        // Extension이 여전히 실행 중이면 무시
        console.log('[Extension] Extension is still running, blocking Firefox closed message');
        return;
      }
      
      // 정상적인 session_update 처리
      console.log('[Extension] Processing valid session_update:', message.data);
      
      // Backend로 전달 (Native Host 우회)
      if (message.data?.valid === false && platform) {
        // 실제로 Extension이 살아있으므로 무시
        console.log(`[Extension] Ignoring invalid session for ${platform} - Extension is active`);
        return;
      }
    }
    else if (type === 'firefox_closed') {
      // Native Host로부터 Firefox 종료 알림을 받았을 때
      console.log('[Extension] Received firefox_closed notification from Native Host');
      // Extension이 아직 살아있다면 무시
      console.log('[Extension] Extension is still running, ignoring firefox_closed message');
    }
    else if (type === 'heartbeat_request') {
      // Native Host가 heartbeat 요청
      this.sendNativeMessage({
        type: 'heartbeat_response',
        id: id,
        data: {
          timestamp: new Date().toISOString(),
          sessions: this.getSessionStates(),
          alive: true
        }
      });
    }
    else if (type === 'error') {
      console.error('[Extension] Native Host error:', message.data);
    }
    else {
      console.warn('[Extension] Unknown native command:', type);
    }
  }

  // ======================== Session Checking ========================

  async checkSessionInNewTab(platform, url) {
    let tab = null;
    
    // 로그인 프로세스 중이면 Firefox Monitor 메시지 무시
    if (this.state.loginInProgress && this.state.loginInProgress[platform]) {
      const loginInfo = this.state.loginInProgress[platform];
      console.log(`[Extension] Login in progress for ${platform}, session: ${loginInfo.sessionId}`);
    }
    
    try {
      // 이미 열려있는 탭 확인
      const existingTabs = await browser.tabs.query({ url: `${PLATFORMS[platform].url}/*` });
      
      if (existingTabs.length > 0) {
        // 기존 탭 사용
        tab = existingTabs[0];
        console.log(`[Extension] Using existing tab for ${platform} session check`);
      } else {
        // 새 탭 생성 (백그라운드)
        tab = await browser.tabs.create({
          url: url,
          active: false
        });
      }
      
      // 탭 로드 대기
      await this.waitForTabLoad(tab.id, 15000);
      
      // 페이지가 완전히 로드될 때까지 추가 대기
      await this.humanDelay(5);
      
      // 플랫폼별 UI 로딩 추가 대기
      const platformDelays = {
        'claude': 3,
        'gemini': 2,
        'deepseek': 2,
        'grok': 3,
        'perplexity': 2
      };
      
      if (platformDelays[platform]) {
        await this.humanDelay(platformDelays[platform]);
      }
      
      // 세션 체크 스크립트 실행
      const results = await browser.tabs.executeScript(tab.id, {
        code: this.getSessionCheckCode(platform)
      });
      
      // 기존 탭이 아니었으면 닫기
      if (!existingTabs.length) {
        await browser.tabs.remove(tab.id);
      }
      
      if (results && results[0]) {
        const sessionResult = results[0];
        console.log(`[Extension] Session check result for ${platform}:`, sessionResult);
        
        // 쿠키도 확인
        const cookies = await this.getPlatformCookies(platform);
        
        // 세션 상태 업데이트
        this.updateSessionState(platform, sessionResult.valid);
        
        return {
          valid: sessionResult.valid,
          status: sessionResult.valid ? 'active' : 'expired',
          expires_at: sessionResult.expires_at,
          cookies: cookies,
          error: sessionResult.error
        };
      } else {
        return { 
          valid: false, 
          status: 'error',
          error: 'Script execution failed' 
        };
      }
      
    } catch (error) {
      console.error(`[Extension] Session check error for ${platform}:`, error);
      
      // 탭이 생성되었으면 정리
      if (tab && tab.id) {
        try {
          await browser.tabs.remove(tab.id);
        } catch (e) {
          // 이미 닫혔을 수 있음
        }
      }
      
      return { 
        valid: false, 
        status: 'error',
        error: error.message 
      };
    }
  }

  getSessionCheckCode(platform) {
    const config = PLATFORMS[platform];
    
    return `
      (async function() {
        try {
          console.log('[Session Check] Starting for ${platform}');
          
          // 페이지 로드 완료 대기 (최대 5초)
          let waitCount = 0;
          while (document.readyState !== 'complete' && waitCount < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
          }
          
          // URL 체크 - 로그인 페이지인지 확인
          const url = window.location.href;
          const pathname = window.location.pathname;
          
          // 로그인 페이지 감지 강화
          const loginPaths = ['/login', '/auth', '/signin', '/sign-in', '/accounts/login'];
          const isLoginUrl = loginPaths.some(path => pathname.includes(path));
          
          // ChatGPT 특별 처리 - 수정된 부분
          if ('${platform}' === 'chatgpt') {
            const currentUrl = window.location.href;
            
            // 로그인 페이지 명확히 체크
            if (currentUrl.includes('auth0') || 
                currentUrl.includes('/auth/login') ||
                currentUrl.includes('auth.openai.com')) {
              return { valid: false, error: 'On login page' };
            }
            
            // chatgpt.com과 chat.openai.com 둘 다 허용 (endsWith로 더 유연하게)
            if (window.location.hostname.endsWith('chatgpt.com') || 
                window.location.hostname.endsWith('chat.openai.com')) {
              // 이메일/비밀번호 입력 필드가 있으면 로그인 중
              if (document.querySelector('input[type="email"]') || 
                  document.querySelector('input[type="password"]')) {
                return { valid: false, error: 'Login in progress' };
              }
              
              // API로 실제 로그인 상태 확인
              try {
                const apiUrl = '/backend-api/accounts/check';
                let response = await fetch(apiUrl, {
                  method: 'GET',
                  credentials: 'include'
                });
                
                // 403은 무시하고 계속 진행 (이미 로그인된 상태에서 403이 발생할 수 있음)
                if (!response.ok && response.status !== 403) {
                  return { valid: false, error: 'HTTP ' + response.status };
                }
                
                let jsonData = {};
                if (response.ok) {
                  jsonData = await response.json();
                  console.log('[Session Check] ChatGPT API response:', jsonData);
                }
                
                // UI 로딩 확인 (다양한 selector)
                const uiReady = !!document.querySelector(
                  '#prompt-textarea, textarea[data-testid="prompt-textarea"], ' +
                  'textarea[aria-label*="Message"], textarea[placeholder*="Message"], ' +
                  'textarea[data-id="root"], .relative.flex.h-full.max-w-full.flex-1'
                );
                
                if (uiReady) {
                  return { 
                    valid: true,
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: response.status === 403 ? 'API 403 but UI ready' : undefined
                  };
                } else if (response.ok && jsonData.user) {
                  // API는 성공했지만 UI가 아직 로드되지 않은 경우
                  return { valid: false, error: 'UI not ready yet' };
                } else {
                  return { valid: false, error: 'Not authenticated' };
                }
                
              } catch (e) {
                // API 호출 실패시 최후의 수단: UI가 뜨면 OK
                const uiReady = !!document.querySelector(
                  '#prompt-textarea, textarea[data-testid="prompt-textarea"], ' +
                  'textarea[aria-label*="Message"], textarea[placeholder*="Message"]'
                );
                
                if (uiReady) {
                  return { 
                    valid: true,
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: 'API failed but UI ready'
                  };
                }
                
                return { valid: false, error: 'API check failed: ' + e.message };
              }
            }
            
            return { valid: false, error: 'Not on ChatGPT domain' };
          }
          
          // Claude 특별 처리
          if ('${platform}' === 'claude') {
            const currentUrl = window.location.href;
            
            // 로그인 페이지 체크
            if (isLoginUrl || currentUrl.includes('/login') || currentUrl.includes('/auth')) {
              return { valid: false, error: 'On login page' };
            }
            
            // claude.ai 도메인 확인 (서브도메인 포함)
            if (window.location.hostname.endsWith('claude.ai')) {
              // 로그인 폼이 있으면 로그인 중
              if (document.querySelector('input[type="email"]') || 
                  document.querySelector('input[type="password"]') ||
                  document.querySelector('button[type="submit"]')) {
                return { valid: false, error: 'Login in progress' };
              }
              
              // API로 실제 로그인 상태 확인
              try {
                // 상대 경로로 API 호출
                const apiUrl = '/api/organizations';
                const response = await fetch(apiUrl, {
                  method: 'GET',
                  credentials: 'include'
                });
                
                // 401은 명확한 미인증
                if (response.status === 401) {
                  return { valid: false, error: 'Not authenticated (401)' };
                }
                
                // 403은 무시하고 UI로 판단
                if (!response.ok && response.status !== 403) {
                  console.log('[Session Check] Claude API returned:', response.status);
                }
                
                // UI 로딩 확인 (더 많은 셀렉터)
                const hasUI = !!(
                  document.querySelector('[data-testid="composer"]') ||
                  document.querySelector('[class*="ChatMessageInput"]') ||
                  document.querySelector('textarea[placeholder*="Talk to Claude"]') ||
                  document.querySelector('div[contenteditable="true"]') ||
                  document.querySelector('.ProseMirror') ||
                  document.querySelector('[class*="ComposerInput"]') ||
                  document.querySelector('[class*="chat-input"]')
                );
                
                if (hasUI) {
                  return { 
                    valid: true, 
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: !response.ok ? 'API ' + response.status + ' but UI ready' : undefined
                  };
                }
                
                // API는 성공했지만 UI가 아직 없는 경우
                if (response.ok) {
                  return { valid: false, error: 'UI not ready yet' };
                }
                
                return { valid: false, error: 'Not authenticated' };
                
              } catch (e) {
                // API 실패시 UI 확인
                console.log('[Session Check] Claude API error:', e.message);
                
                const hasUI = !!(
                  document.querySelector('[data-testid="composer"]') ||
                  document.querySelector('[class*="ChatMessageInput"]') ||
                  document.querySelector('textarea[placeholder*="Talk to Claude"]') ||
                  document.querySelector('div[contenteditable="true"]') ||
                  document.querySelector('.ProseMirror')
                );
                
                if (hasUI) {
                  return { 
                    valid: true, 
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: 'API failed but UI ready'
                  };
                }
                
                return { valid: false, error: 'API check failed: ' + e.message };
              }
            }
            
            return { valid: false, error: 'Not on Claude domain' };
          }
          
          // Gemini 특별 처리
          if ('${platform}' === 'gemini') {
            const currentUrl = window.location.href;
            
            // 로그인 페이지 체크
            if (isLoginUrl || currentUrl.includes('accounts.google.com')) {
              return { valid: false, error: 'On login page' };
            }
            
            // gemini.google.com 도메인 확인
            if (window.location.hostname.endsWith('gemini.google.com') || 
                window.location.hostname.endsWith('bard.google.com')) {
              // 로그인 폼이 있으면 로그인 중
              if (document.querySelector('input[type="email"]') || 
                  document.querySelector('input[type="password"]')) {
                return { valid: false, error: 'Login in progress' };
              }
              
              // API로 실제 로그인 상태 확인
              try {
                // 상대 경로로 API 호출
                const apiUrl = '/app';
                const response = await fetch(apiUrl, {
                  method: 'GET',
                  credentials: 'include'
                });
                
                // 401은 명확한 미인증
                if (response.status === 401) {
                  return { valid: false, error: 'Not authenticated (401)' };
                }
                
                // UI 로딩 확인 (더 많은 셀렉터)
                const hasUI = !!(
                  document.querySelector('[aria-label="Message Gemini"]') ||
                  document.querySelector('[class*="chat-input"]') ||
                  document.querySelector('input[placeholder*="Enter a prompt"]') ||
                  document.querySelector('[class*="ql-editor"]') ||
                  document.querySelector('[contenteditable="true"]') ||
                  document.querySelector('[class*="message-input"]') ||
                  document.querySelector('textarea[aria-label*="Talk"]')
                );
                
                if (hasUI) {
                  return { 
                    valid: true, 
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: !response.ok ? 'API ' + response.status + ' but UI ready' : undefined
                  };
                }
                
                // API는 성공했지만 UI가 아직 없는 경우
                if (response.ok) {
                  return { valid: false, error: 'UI not ready yet' };
                }
                
                return { valid: false, error: 'Not authenticated' };
                
              } catch (e) {
                // API 실패시 UI 확인
                console.log('[Session Check] Gemini API error:', e.message);
                
                const hasUI = !!(
                  document.querySelector('[aria-label="Message Gemini"]') ||
                  document.querySelector('[class*="chat-input"]') ||
                  document.querySelector('input[placeholder*="Enter a prompt"]') ||
                  document.querySelector('[contenteditable="true"]')
                );
                
                if (hasUI) {
                  return { 
                    valid: true, 
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: 'API failed but UI ready'
                  };
                }
                
                return { valid: false, error: 'Session check failed' };
              }
            }
            
            return { valid: false, error: 'Not on Gemini domain' };
          }
          
          // DeepSeek 특별 처리
          if ('${platform}' === 'deepseek') {
            const currentUrl = window.location.href;
            
            // 로그인 페이지 체크
            if (isLoginUrl || currentUrl.includes('/login') || currentUrl.includes('/auth')) {
              return { valid: false, error: 'On login page' };
            }
            
            // deepseek.com 도메인 확인
            if (window.location.hostname.endsWith('deepseek.com')) {
              // 로그인 폼이 있으면 로그인 중
              if (document.querySelector('input[type="email"]') || 
                  document.querySelector('input[type="password"]') ||
                  document.querySelector('[class*="login"]')) {
                return { valid: false, error: 'Login in progress' };
              }
              
              // API로 실제 로그인 상태 확인
              try {
                // 상대 경로로 API 호출
                const apiUrl = '/api/v0/user/info';
                const response = await fetch(apiUrl, {
                  method: 'GET',
                  credentials: 'include',
                  headers: {
                    'Accept': 'application/json'
                  }
                });
                
                // 401은 명확한 미인증
                if (response.status === 401) {
                  return { valid: false, error: 'Not authenticated (401)' };
                }
                
                // UI 로딩 확인 (더 많은 셀렉터)
                const hasUI = !!(
                  document.querySelector('[class*="chat-input"]') ||
                  document.querySelector('textarea[placeholder*="输入"]') ||
                  document.querySelector('textarea[placeholder*="Message"]') ||
                  document.querySelector('[class*="message-input"]') ||
                  document.querySelector('[class*="input-box"]') ||
                  document.querySelector('[contenteditable="true"]') ||
                  document.querySelector('[class*="composer"]')
                );
                
                if (hasUI) {
                  return { 
                    valid: true, 
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: !response.ok ? 'API ' + response.status + ' but UI ready' : undefined
                  };
                }
                
                // API 응답 확인
                if (response.ok) {
                  try {
                    const data = await response.json();
                    if (data && (data.user || data.email || data.username)) {
                      // API는 성공했지만 UI가 아직 로딩 중
                      return { valid: false, error: 'UI not ready yet' };
                    }
                  } catch (e) {
                    // JSON 파싱 실패
                  }
                }
                
                return { valid: false, error: 'Not authenticated' };
                
              } catch (e) {
                // API 실패시 UI 확인
                console.log('[Session Check] DeepSeek API error:', e.message);
                
                const hasUI = !!(
                  document.querySelector('[class*="chat-input"]') ||
                  document.querySelector('textarea[placeholder*="输入"]') ||
                  document.querySelector('textarea[placeholder*="Message"]') ||
                  document.querySelector('[contenteditable="true"]')
                );
                
                if (hasUI) {
                  return { 
                    valid: true, 
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: 'API failed but UI ready'
                  };
                }
                
                return { valid: false, error: 'Session check failed' };
              }
            }
            
            return { valid: false, error: 'Not on DeepSeek domain' };
          }
          
          // Grok 특별 처리
          if ('${platform}' === 'grok') {
            const currentUrl = window.location.href;
            
            // 로그인 페이지 체크 (X/Twitter 로그인)
            if (isLoginUrl || currentUrl.includes('x.com') || currentUrl.includes('twitter.com')) {
              return { valid: false, error: 'On login page' };
            }
            
            // grok.x.ai 도메인 확인
            if (window.location.hostname.endsWith('x.ai') || 
                window.location.hostname.endsWith('grok.x.ai')) {
              // 로그인 폼이 있으면 로그인 중
              if (document.querySelector('input[type="email"]') || 
                  document.querySelector('input[type="password"]') ||
                  document.querySelector('[data-testid="LoginForm"]')) {
                return { valid: false, error: 'Login in progress' };
              }
              
              // API로 실제 로그인 상태 확인
              try {
                // 상대 경로로 API 호출
                const apiUrl = '/api/user';
                const response = await fetch(apiUrl, {
                  method: 'GET',
                  credentials: 'include',
                  headers: {
                    'Accept': 'application/json'
                  }
                });
                
                // 401은 명확한 미인증
                if (response.status === 401) {
                  return { valid: false, error: 'Not authenticated (401)' };
                }
                
                // UI 로딩 확인 (더 많은 셀렉터)
                const hasUI = !!(
                  document.querySelector('[data-testid="grok-input"]') ||
                  document.querySelector('[class*="chat-input"]') ||
                  document.querySelector('textarea[placeholder*="Ask Grok"]') ||
                  document.querySelector('textarea[placeholder*="Type a message"]') ||
                  document.querySelector('[contenteditable="true"]') ||
                  document.querySelector('[class*="composer"]') ||
                  document.querySelector('[class*="message-input"]')
                );
                
                if (hasUI) {
                  return { 
                    valid: true, 
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: !response.ok ? 'API ' + response.status + ' but UI ready' : undefined
                  };
                }
                
                // API 응답 확인
                if (response.ok) {
                  try {
                    const data = await response.json();
                    if (data && data.user) {
                      // API는 성공했지만 UI가 아직 로딩 중
                      return { valid: false, error: 'UI not ready yet' };
                    }
                  } catch (e) {
                    // JSON 파싱 실패
                  }
                }
                
                return { valid: false, error: 'Not authenticated' };
                
              } catch (e) {
                // API 실패시 UI 확인
                console.log('[Session Check] Grok API error:', e.message);
                
                const hasUI = !!(
                  document.querySelector('[data-testid="grok-input"]') ||
                  document.querySelector('[class*="chat-input"]') ||
                  document.querySelector('textarea[placeholder*="Ask Grok"]') ||
                  document.querySelector('[contenteditable="true"]')
                );
                
                if (hasUI) {
                  return { 
                    valid: true, 
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: 'API failed but UI ready'
                  };
                }
                
                return { valid: false, error: 'Session check failed' };
              }
            }
            
            return { valid: false, error: 'Not on Grok domain' };
          }
          
          // Perplexity 특별 처리
          if ('${platform}' === 'perplexity') {
            const currentUrl = window.location.href;
            
            // 로그인 페이지 체크
            if (isLoginUrl || currentUrl.includes('/login') || currentUrl.includes('/auth')) {
              return { valid: false, error: 'On login page' };
            }
            
            // perplexity.ai 도메인 확인
            if (window.location.hostname.endsWith('perplexity.ai')) {
              // 로그인 폼이 있으면 로그인 중
              if (document.querySelector('input[type="email"]') || 
                  document.querySelector('input[type="password"]') ||
                  document.querySelector('[class*="auth"]')) {
                return { valid: false, error: 'Login in progress' };
              }
              
              // API로 실제 로그인 상태 확인
              try {
                // 상대 경로로 API 호출
                const apiUrl = '/api/auth/session';
                const response = await fetch(apiUrl, {
                  method: 'GET',
                  credentials: 'include',
                  headers: {
                    'Accept': 'application/json'
                  }
                });
                
                // 401은 명확한 미인증
                if (response.status === 401) {
                  return { valid: false, error: 'Not authenticated (401)' };
                }
                
                // UI 로딩 확인 (더 많은 셀렉터)
                const hasUI = !!(
                  document.querySelector('textarea[placeholder*="Ask"]') ||
                  document.querySelector('textarea[placeholder*="Search"]') ||
                  document.querySelector('[class*="search-input"]') ||
                  document.querySelector('[class*="query-input"]') ||
                  document.querySelector('[contenteditable="true"]') ||
                  document.querySelector('[class*="composer"]') ||
                  document.querySelector('input[type="search"]') ||
                  document.querySelector('[aria-label*="Search"]')
                );
                
                if (hasUI) {
                  return { 
                    valid: true, 
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: !response.ok ? 'API ' + response.status + ' but UI ready' : undefined
                  };
                }
                
                // API 응답 확인
                if (response.ok) {
                  try {
                    const data = await response.json();
                    if (data && data.user) {
                      // API는 성공했지만 UI가 아직 로딩 중
                      return { valid: false, error: 'UI not ready yet' };
                    }
                  } catch (e) {
                    // JSON 파싱 실패
                  }
                }
                
                return { valid: false, error: 'Not authenticated' };
                
              } catch (e) {
                // API 실패시 UI 확인
                console.log('[Session Check] Perplexity API error:', e.message);
                
                const hasUI = !!(
                  document.querySelector('textarea[placeholder*="Ask"]') ||
                  document.querySelector('textarea[placeholder*="Search"]') ||
                  document.querySelector('[class*="search-input"]') ||
                  document.querySelector('input[type="search"]')
                );
                
                if (hasUI) {
                  return { 
                    valid: true, 
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    note: 'API failed but UI ready'
                  };
                }
                
                return { valid: false, error: 'Session check failed' };
              }
            }
            
            return { valid: false, error: 'Not on Perplexity domain' };
          }
          
          // 기본값
          return { valid: false, error: 'Could not verify session' };
          
        } catch (error) {
          console.error('[Session Check] Error:', error);
          return { valid: false, error: error.message };
        }
      })();
    `;
  }

  async handleOpenLoginPage(messageId, data) {
    const { platform, url } = data;
    const config = PLATFORMS[platform];
    
    if (!config) {
      this.sendNativeMessage({
        type: 'error',
        id: messageId,
        data: { error: `Unknown platform: ${platform}` }
      });
      return;
    }
    
    console.log(`[Extension] handleOpenLoginPage - messageId: ${messageId}, platform: ${platform}`);
    
    // 고유한 로그인 세션 ID 생성
    const loginSessionId = `login_${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[Extension] Generated login session ID: ${loginSessionId}`);
    
    // Firefox Monitor 간섭 방지를 위한 플래그 설정
    this.state.loginInProgress = this.state.loginInProgress || {};
    this.state.loginInProgress[platform] = {
      active: true,
      sessionId: loginSessionId,
      startTime: Date.now()
    };
    
    const targetUrl = url || config.url;
    let tab = null;
    let tabRemovedListener = null;
    let tabReplacedListener = null;
    let isNewTab = false;
    let loginCheckAborted = false; // 로그인 체크 중단 플래그
    
    try {
      // 기존 탭 찾기 - URL 패턴 개선
      const existingTabs = await browser.tabs.query({});
      const platformTab = existingTabs.find(t => {
        if (!t.url) return false;
        
        // 기본 URL 체크
        if (t.url.startsWith(config.url)) return true;
        
        // 플랫폼별 특수 케이스
        switch(platform) {
          case 'chatgpt':
            return t.url.includes('chatgpt.com') || t.url.includes('chat.openai.com');
          case 'claude':
            return t.url.includes('claude.ai');
          case 'gemini':
            return t.url.includes('gemini.google.com') || t.url.includes('bard.google.com');
          case 'deepseek':
            return t.url.includes('deepseek.com');
          case 'grok':
            return t.url.includes('grok.x.ai') || t.url.includes('x.ai');
          case 'perplexity':
            return t.url.includes('perplexity.ai');
          default:
            return false;
        }
      });
      
      if (platformTab) {
        // 기존 탭 사용 및 활성화
        tab = platformTab;
        isNewTab = false;
        console.log(`[Extension] Using existing tab ${tab.id} for ${platform} - ${tab.url}`);
        await browser.tabs.update(tab.id, { active: true });
        await browser.windows.update(tab.windowId, { focused: true });
      } else {
        // 새 탭 생성
        tab = await browser.tabs.create({
          url: targetUrl,
          active: true
        });
        isNewTab = true;
        console.log(`[Extension] Created new tab ${tab.id} for ${platform}`);
      }
      
      // 로그인 체크 탭으로 등록
      this.loginCheckTabs.set(platform, tab.id);
      
      // 탭 로드 대기
      try {
        await this.waitForTabLoad(tab.id, 10000);
      } catch (e) {
        console.log(`[Extension] Tab load timeout, continuing anyway`);
      }
      
      // 7초 대기 - SPA 리다이렉트 및 UI 로딩 완료 대기
      await this.humanDelay(7);
      
      // 플랫폼별 추가 대기 (리다이렉트 완료 보장)
      const platformDelays = {
        'chatgpt': 2,
        'claude': 3,
        'gemini': 3,
        'deepseek': 2,
        'grok': 3,
        'perplexity': 2
      };
      
      if (platformDelays[platform]) {
        await this.humanDelay(platformDelays[platform]);
      }
      
      // 탭 생성 시간 기록 (자동 닫힘 구분용)
      tab.createdTime = Date.now();
      
      // Native Host에 로그인 프로세스 시작 알림
      this.sendNativeMessage({
        type: 'login_process_started',
        id: `login_start_${Date.now()}`,
        data: {
          platform: platform,
          tab_id: tab.id,
          login_session_id: loginSessionId,
          ignore_firefox_monitor: true,
          disable_all_firefox_events: true
        }
      });
      
      // Backend에 직접 로그인 진행 상태 알림
      await this.notifyBackendStatus('login_in_progress', {
        platform: platform,
        in_progress: true,
        tab_id: tab.id,
        command_id: data.command_id,
        login_session_id: loginSessionId,
        ignore_firefox_errors: true,
        override_any_firefox_closed: true
      });
      
      // 초기 세션 체크
      console.log(`[Extension] Checking initial session for ${platform}...`);
      try {
        const results = await browser.tabs.executeScript(tab.id, {
          code: this.getSessionCheckCode(platform)
        });
        
        console.log(`[Extension] Initial session check results:`, results);
        
        if (results && results[0] && results[0].valid) {
          console.log(`[Extension] ${platform} already logged in!`);
          console.log(`[Extension] Command ID: ${data.command_id}`);
          
          const cookies = await this.getPlatformCookies(platform);
          this.loginCheckTabs.delete(platform);
          
          // 세션 상태 업데이트
          this.updateSessionState(platform, true);
          
          this.sendNativeMessage({
            type: 'session_update',
            id: messageId,
            data: {
              platform: platform,
              valid: true,
              source: 'already_logged_in',
              cookies: cookies,
              expires_at: results[0].expires_at
            }
          });
          
          // 로그인 프로세스 완료
          if (this.state.loginInProgress) {
            delete this.state.loginInProgress[platform];
          }
          
          // 이미 로그인된 경우에도 탭 닫기 (새로 생성한 탭인 경우만)
          if (isNewTab) {
            await browser.tabs.remove(tab.id);
            console.log(`[Extension] Closed new tab - already logged in to ${platform}`);
          }
          
          return; // 이미 로그인된 경우 여기서 종료 (리스너 등록 안함)
        }
      } catch (e) {
        console.log(`[Extension] Initial check failed, starting login detection`);
      }
      
      // === 로그인이 필요한 경우에만 리스너 등록 ===
      
      // 탭 교체 리스너 (리다이렉트 감지)
      tabReplacedListener = (addedTabId, removedTabId) => {
        if (removedTabId === tab.id) {
          console.log(`[Extension] Tab ${removedTabId} replaced by ${addedTabId} for ${platform}`);
          // 새 탭 ID로 업데이트
          tab.id = addedTabId;
          this.loginCheckTabs.set(platform, addedTabId);
          console.log(`[Extension] Updated tracking to new tab ${addedTabId}`);
        }
      };
      browser.tabs.onReplaced.addListener(tabReplacedListener);
      
      // 탭 닫기 리스너
      tabRemovedListener = async (tabId, removeInfo) => {
        if (tabId === tab.id && !loginCheckAborted) {
          console.log(`[Extension] Tab ${tabId} removed for ${platform}`, removeInfo);
          
          // 윈도우가 닫히는 경우는 Firefox 종료로 간주하고 무시
          if (removeInfo.isWindowClosing) {
            console.log(`[Extension] Window closing - ignoring tab removal for ${platform}`);
            return;
          }
          
          // 7초 유예 - 자동으로 닫힌 탭은 무시
          if (tab.createdTime && Date.now() - tab.createdTime < 7000) {
            console.log(`[Extension] Tab closed within 7 seconds - likely system redirect, ignoring`);
            return;
          }
          
          // 다른 탭들이 남아있는지 확인
          const remainingTabs = await browser.tabs.query({});
          if (remainingTabs.length === 0) {
            console.log(`[Extension] No tabs remaining - Firefox might be closing`);
            return;
          }
          
          // 정리 작업
          loginCheckAborted = true;
          
          if (this.loginCheckIntervals.has(platform)) {
            clearInterval(this.loginCheckIntervals.get(platform));
            this.loginCheckIntervals.delete(platform);
          }
          this.loginCheckTabs.delete(platform);
          
          // 리스너 제거
          browser.tabs.onRemoved.removeListener(tabRemovedListener);
          browser.tabs.onReplaced.removeListener(tabReplacedListener);
          
          // 로그인 성공 여부 확인
          if (!this.state.sessions[platform]?.valid) {
            console.log(`[Extension] User closed tab before login for ${platform}`);
            // 사용자가 탭을 닫은 경우 메시지 전송
            this.sendNativeMessage({
              type: 'session_update',
              id: `session_update_${Date.now()}`,
              data: {
                platform: platform,
                valid: false,
                source: 'tab_closed',
                error: 'User closed the tab'
              }
            });
          }
          
          // 로그인 프로세스 정리
          if (this.state.loginInProgress) {
            delete this.state.loginInProgress[platform];
          }
        }
      };
      browser.tabs.onRemoved.addListener(tabRemovedListener);
      
      // 로그인 감지 루프 시작
      let checkCount = 0;
      const maxChecks = 120; // 10분 (5초 * 120)
      
      const checkInterval = setInterval(async () => {
        checkCount++;
        
        // 중단 플래그 체크
        if (loginCheckAborted) {
          clearInterval(checkInterval);
          return;
        }
        
        // 탭 존재 확인
        try {
          await browser.tabs.get(tab.id);
        } catch (e) {
          // 탭이 닫혔음
          console.log(`[Extension] Tab no longer exists for ${platform}`);
          clearInterval(checkInterval);
          this.loginCheckIntervals.delete(platform);
          this.loginCheckTabs.delete(platform);
          return;
        }
        
        // 세션 체크
        try {
          const results = await browser.tabs.executeScript(tab.id, {
            code: this.getSessionCheckCode(platform)
          });
          
          if (results && results[0]) {
            console.log(`[Extension] Session check #${checkCount} for ${platform}:`, results[0]);
            
            if (results[0].valid) {
              console.log(`[Extension] ${platform} login detected!`);
              
              // 로그인 체크 중단
              loginCheckAborted = true;
              clearInterval(checkInterval);
              this.loginCheckIntervals.delete(platform);
              this.loginCheckTabs.delete(platform);
              
              // 리스너 제거
              if (tabRemovedListener) {
                browser.tabs.onRemoved.removeListener(tabRemovedListener);
              }
              if (tabReplacedListener) {
                browser.tabs.onReplaced.removeListener(tabReplacedListener);
              }
              
              const cookies = await this.getPlatformCookies(platform);
              
              // 세션 상태 업데이트
              this.updateSessionState(platform, true);
              
              // 로그인 프로세스 완료
              if (this.state.loginInProgress) {
                delete this.state.loginInProgress[platform];
              }
              
              // 메시지 전송
              const updateId = `session_update_${Date.now()}`;
              console.log(`[Extension] Sending session_update with id: ${updateId}`);
              
              this.sendNativeMessage({
                type: 'session_update',
                id: updateId,
                data: {
                  platform: platform,
                  valid: true,
                  source: 'login_detection',
                  cookies: cookies,
                  expires_at: results[0].expires_at,
                  command_id: data?.command_id  // Backend command ID 포함
                }
              });
              
              // Backend에 직접 알림 (추가 보장)
              await this.notifyBackendStatus('session_active', {
                platform: platform,
                valid: true,
                status: 'active',
                source: 'login_detection',
                command_id: data?.command_id
              });
              
              // 잠시 대기 후 탭 닫기
              await new Promise(resolve => setTimeout(resolve, 1000));
              try {
                await browser.tabs.remove(tab.id);
                console.log(`[Extension] Tab closed for ${platform}`);
              } catch (e) {
                console.log(`[Extension] Tab already closed`);
              }
              
              return;
            }
          }
        } catch (e) {
          console.log(`[Extension] Session check error (retry ${checkCount}):`, e.message);
        }
        
        if (checkCount >= maxChecks) {
          loginCheckAborted = true;
          clearInterval(checkInterval);
          this.loginCheckIntervals.delete(platform);
          this.loginCheckTabs.delete(platform);
          
          if (tabRemovedListener) {
            browser.tabs.onRemoved.removeListener(tabRemovedListener);
          }
          if (tabReplacedListener) {
            browser.tabs.onReplaced.removeListener(tabReplacedListener);
          }
          
          this.sendNativeMessage({
            type: 'session_update',
            id: messageId,
            data: {
              platform: platform,
              valid: false,
              source: 'timeout',
              error: 'Login timeout after 10 minutes'
            }
          });
          
          // 로그인 프로세스 완료
          if (this.state.loginInProgress) {
            delete this.state.loginInProgress[platform];
          }
        }
      }, 5000); // 5초마다 체크
      
      this.loginCheckIntervals.set(platform, checkInterval);
      
    } catch (error) {
      console.error(`[Extension] Error opening login page:`, error);
      
      if (tabRemovedListener) {
        browser.tabs.onRemoved.removeListener(tabRemovedListener);
      }
      if (tabReplacedListener) {
        browser.tabs.onReplaced.removeListener(tabReplacedListener);
      }
      
      this.sendNativeMessage({
        type: 'error',
        id: messageId,
        data: { 
          platform: platform,
          error: error.message 
        }
      });
    }
  }
  
  // ======================== Command Handlers ========================
  
  async handleCollectCommand(messageId, data) {
    if (this.state.collecting) {
      console.log('[Extension] Collection already in progress');
      this.sendNativeMessage({
        type: 'error',
        id: messageId,
        data: { error: 'Collection already in progress' }
      });
      return;
    }
    
    this.state.collecting = true;
    const { platforms, exclude_ids = [], settings = {} } = data;
    
    console.log(`[Extension] Collecting from ${platforms.length} platforms, excluding ${exclude_ids.length} LLM conversations`);
    
    for (const platform of platforms) {
      try {
        const result = await this.collectFromPlatform(platform, settings, exclude_ids);
        
        // Native로 결과 전송
        this.sendNativeMessage({
          type: 'collection_result',
          id: messageId,
          data: {
            command_id: data.command_id,
            platform: platform,
            conversations: result.conversations,
            excluded_llm_ids: result.excluded
          }
        });
        
      } catch (error) {
        console.error(`[Extension] Error collecting from ${platform}:`, error);
        
        this.sendNativeMessage({
          type: 'error',
          id: messageId,
          data: {
            command_id: data.command_id,
            platform: platform,
            error: error.message
          }
        });
      }
      
      // 플랫폼 간 대기
      await this.humanDelay(settings.delayBetweenPlatforms || 5);
    }
    
    this.state.collecting = false;
  }
  
  async handleLLMQueryCommand(messageId, data) {
    const { platform, query, mark_as_llm = true } = data;
    
    console.log(`[Extension] Executing LLM query on ${platform}`);
    
    try {
      // 플랫폼 열기
      const tab = await browser.tabs.create({
        url: PLATFORMS[platform].url,
        active: true
      });
      
      // 페이지 로드 대기
      await this.waitForTabLoad(tab.id);
      await this.humanDelay(2);
      
      // 질문 입력 및 전송
      const conversationId = await this.injectLLMQuery(tab.id, platform, query);
      
      // 응답 대기
      await this.waitForLLMResponse(tab.id, platform);
      
      // 결과 전송
      this.sendNativeMessage({
        type: 'llm_query_result',
        id: messageId,
        data: {
          command_id: data.command_id,
          platform: platform,
          conversation_id: conversationId,
          query: query,
          response: 'Response captured',
          metadata: {
            source: 'llm_query',
            created_at: new Date().toISOString()
          }
        }
      });
      
    } catch (error) {
      console.error(`[Extension] LLM query error:`, error);
      
      this.sendNativeMessage({
        type: 'error',
        id: messageId,
        data: {
          command_id: data.command_id,
          error: error.message
        }
      });
    }
  }
  
  async handleSessionCheck(messageId, data) {
    const platform = data.platform;
    const force = data.force || false;
    
    console.log(`[Extension] Session check requested for ${platform}`);
    
    // 항상 checkSessionInNewTab 사용
    const result = await this.checkSessionInNewTab(platform, PLATFORMS[platform].url);
    
    console.log(`[Extension] Session check result for ${platform}:`, result);
    
    // 세션 상태 업데이트
    this.updateSessionState(platform, result.valid);
    
    // Native Host로 전송
    this.sendNativeMessage({
      type: 'session_update',
      id: messageId,
      data: {
        platform: platform,
        ...result,
        source: 'session_check',
        command_id: data.command_id
      }
    });
    
    // Backend에 직접 알림 (세션이 valid한 경우)
    if (result.valid) {
      await this.notifyBackendStatus('session_active', {
        platform: platform,
        valid: true,
        status: 'active',
        source: 'session_check',
        command_id: data.command_id
      });
    }
  }
  
  // ======================== State Management ========================
  
  async loadState() {
    try {
      const { extensionState } = await browser.storage.local.get('extensionState');
      if (extensionState) {
        this.state = { ...this.state, ...extensionState };
        console.log('[Extension] State loaded:', this.state);
      }
    } catch (error) {
      console.error('[Extension] Failed to load state:', error);
    }
  }
  
  async saveState() {
    try {
      await browser.storage.local.set({ 
        extensionState: {
          ...this.state,
          savedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[Extension] Failed to save state:', error);
    }
  }
  
  async loadSettings() {
    try {
      const { extensionSettings } = await browser.storage.local.get('extensionSettings');
      if (extensionSettings) {
        this.settings = { ...this.settings, ...extensionSettings };
      }
    } catch (error) {
      console.error('[Extension] Failed to load settings:', error);
    }
  }
  
  async saveSettings() {
    try {
      await browser.storage.local.set({ extensionSettings: this.settings });
    } catch (error) {
      console.error('[Extension] Failed to save settings:', error);
    }
  }
  
  getSessionStates() {
    const states = {};
    for (const platform of Object.keys(PLATFORMS)) {
      states[platform] = this.state.sessions[platform]?.valid || false;
    }
    return states;
  }
  
  // ======================== Session Management ========================
  
  async getPlatformCookies(platform) {
    const config = PLATFORMS[platform];
    if (!config) return [];
    
    try {
      // cookieDomain이 배열인지 확인
      const domains = Array.isArray(config.cookieDomain) 
        ? config.cookieDomain 
        : [config.cookieDomain];
      
      let allCookies = [];
      
      // 각 도메인에서 쿠키 가져오기
      for (const domain of domains) {
        const cookies = await browser.cookies.getAll({ domain });
        allCookies = allCookies.concat(cookies);
      }
      
      // Filter relevant cookies
      return allCookies.filter(c => 
        c.name.includes('session') || 
        c.name.includes('auth') || 
        c.name.includes('token') ||
        c.name.includes('login')
      ).map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expirationDate,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite
      }));
    } catch (error) {
      console.error(`[Extension] Failed to get cookies for ${platform}:`, error);
      return [];
    }
  }
  
  updateSessionState(platform, valid) {
    this.state.sessions[platform] = {
      valid: valid,
      lastChecked: new Date().toISOString()
    };
    
    this.saveState();
  }
  
  // ======================== Data Collection ========================
  
  async collectFromPlatform(platform, settings, excludeIds = []) {
    const config = PLATFORMS[platform];
    console.log(`[Extension] Collecting from ${platform} with ${excludeIds.length} exclusions...`);
    
    // Open platform in new tab
    const tab = await browser.tabs.create({ 
      url: config.url,
      active: false
    });
    
    try {
      // Wait for page load
      await this.waitForTabLoad(tab.id);
      await this.humanDelay(3);
      
      // Check session in the SAME tab
      const results = await browser.tabs.executeScript(tab.id, {
        code: this.getSessionCheckCode(platform)
      });
      
      if (!results || !results[0] || !results[0].valid) {
        console.log(`[Extension] ${platform} session invalid, skipping...`);
        return { conversations: [], excluded: [] };
      }
      
      // Inject collection script with exclusions
      const collectionResults = await browser.tabs.executeScript(tab.id, {
        code: this.getCollectionCode(platform, config, settings, excludeIds)
      });
      
      const result = collectionResults[0] || { conversations: [], excluded: [] };
      console.log(`[Extension] Collected ${result.conversations.length} from ${platform}, excluded ${result.excluded.length}`);
      
      return result;
      
    } finally {
      // Close tab
      await browser.tabs.remove(tab.id);
    }
  }
  
  getCollectionCode(platform, config, settings, excludeIds) {
    return `
      (async function() {
        const excludeSet = new Set(${JSON.stringify(excludeIds)});
        const conversations = [];
        const excluded = [];
        const limit = ${settings.maxConversations || 20};
        
        try {
          // Platform-specific collection logic
          if ('${platform}' === 'chatgpt') {
            // 현재 도메인에 맞게 API URL 구성
            const apiUrl = window.location.origin + '/backend-api/conversations?offset=0&limit=' + limit;
            const response = await fetch(apiUrl, {
              credentials: 'include'
            });
            
            if (response.ok) {
              const data = await response.json();
              
              for (const item of data.items || []) {
                if (excludeSet.has(item.id)) {
                  excluded.push(item.id);
                  continue;
                }
                
                conversations.push({
                  id: item.id,
                  title: item.title || 'Untitled',
                  created_at: item.create_time,
                  updated_at: item.update_time
                });
              }
            }
          }
          else if ('${platform}' === 'claude') {
            // 현재 도메인에 맞게 API URL 구성
            const apiUrl = window.location.origin + '/api/chat_conversations';
            const response = await fetch(apiUrl, {
              credentials: 'include'
            });
            
            if (response.ok) {
              const data = await response.json();
              
              for (const item of data.chats || data.conversations || []) {
                const id = item.uuid || item.id;
                if (excludeSet.has(id)) {
                  excluded.push(id);
                  continue;
                }
                
                conversations.push({
                  id: id,
                  title: item.name || item.title || 'Untitled',
                  created_at: item.created_at,
                  updated_at: item.updated_at
                });
              }
            }
          }
          else if ('${platform}' === 'gemini') {
            // 현재 도메인에 맞게 API URL 구성
            const apiUrl = window.location.origin + '/api/conversations';
            const response = await fetch(apiUrl, {
              credentials: 'include'
            });
            
            if (response.ok) {
              const data = await response.json();
              
              for (const item of data.conversations || data.threads || []) {
                if (excludeSet.has(item.id)) {
                  excluded.push(item.id);
                  continue;
                }
                
                conversations.push({
                  id: item.id,
                  title: item.title || item.name || 'Untitled',
                  created_at: item.created_at || item.created_time,
                  updated_at: item.updated_at || item.modified_time
                });
              }
            }
          }
          else if ('${platform}' === 'deepseek') {
            // 현재 도메인에 맞게 API URL 구성
            const apiUrl = window.location.origin + '/api/v0/chat/conversations';
            const response = await fetch(apiUrl, {
              credentials: 'include',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const items = data.data || data.conversations || [];
              
              for (const item of items) {
                if (excludeSet.has(item.id)) {
                  excluded.push(item.id);
                  continue;
                }
                
                conversations.push({
                  id: item.id,
                  title: item.title || 'Untitled',
                  created_at: item.created_at || item.create_time,
                  updated_at: item.updated_at || item.update_time
                });
              }
            }
          }
          else if ('${platform}' === 'grok') {
            // 현재 도메인에 맞게 API URL 구성
            const apiUrl = window.location.origin + '/api/conversations';
            const response = await fetch(apiUrl, {
              credentials: 'include',
              headers: {
                'Accept': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const items = data.conversations || [];
              
              for (const item of items) {
                if (excludeSet.has(item.conversation_id)) {
                  excluded.push(item.conversation_id);
                  continue;
                }
                
                conversations.push({
                  id: item.conversation_id,
                  title: item.title || 'Grok Conversation',
                  created_at: item.created_at,
                  updated_at: item.updated_at
                });
              }
            }
          }
          else if ('${platform}' === 'perplexity') {
            // 현재 도메인에 맞게 API URL 구성
            const apiUrl = window.location.origin + '/api/conversations';
            const response = await fetch(apiUrl, {
              credentials: 'include'
            });
            
            if (response.ok) {
              const data = await response.json();
              const items = data.threads || data.conversations || [];
              
              for (const item of items) {
                if (excludeSet.has(item.id)) {
                  excluded.push(item.id);
                  continue;
                }
                
                conversations.push({
                  id: item.id,
                  title: item.query || item.title || 'Perplexity Thread',
                  created_at: item.created_at || item.timestamp,
                  updated_at: item.updated_at || item.timestamp
                });
              }
            }
          }
          
        } catch (error) {
          console.error('[Collector] Error:', error);
        }
        
        return { conversations, excluded };
      })();
    `;
  }

  async injectLLMQuery(tabId, platform, query) {
    const code = `
      (async function() {
        // Platform-specific query injection
        if ('${platform}' === 'chatgpt') {
          // 새 대화 시작
          const newChatButton = document.querySelector('[data-testid="new-chat-button"], button[aria-label="New chat"], a[href="/"]');
          if (newChatButton) {
            newChatButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // 입력 필드 찾기
          const textarea = document.querySelector(
            '#prompt-textarea, textarea[data-testid="prompt-textarea"], ' +
            'textarea[aria-label*="Message"], textarea[placeholder*="Message"], ' +
            'textarea[data-id="root"]'
          );
          if (textarea) {
            // 텍스트 입력
            textarea.value = ${JSON.stringify(query)};
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            
            // 전송 버튼 클릭
            const sendButton = document.querySelector(
              'button[data-testid="send-button"], button[aria-label="Send"], ' +
              'button[type="submit"]:not([disabled]), button:has(svg[class*="submit"])'
            );
            if (sendButton && !sendButton.disabled) {
              sendButton.click();
            }
            
            // conversation ID 추출 (URL에서)
            await new Promise(resolve => setTimeout(resolve, 2000));
            const match = window.location.pathname.match(/\\/c\\/([a-zA-Z0-9-]+)/);
            return match ? match[1] : 'chatgpt-' + Date.now();
          }
        }
        // ... other platforms ...
        
        throw new Error('Could not find input field for ' + '${platform}');
      })();
    `;
    
    const results = await browser.tabs.executeScript(tabId, { code });
    return results[0];
  }

  async waitForLLMResponse(tabId, platform, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const results = await browser.tabs.executeScript(tabId, {
          code: `
            (function() {
              // Check for response indicators
              if ('${platform}' === 'chatgpt') {
                const thinking = document.querySelector('[data-testid="thinking-indicator"], .result-thinking');
                const messages = document.querySelectorAll('[data-message-author-role="assistant"], .group\\\\.w-full.bg-gray-50');
                return !thinking && messages.length > 0;
              }
              // ... other platforms ...
              return false;
            })();
          `
        });
        
        if (results[0]) {
          return true;
        }
      } catch (error) {
        console.error('[Extension] Error checking response:', error);
      }
      
      await this.humanDelay(1);
    }
    
    throw new Error('Response timeout');
  }
  
  // ======================== Helper Functions ========================
  
  async waitForTabLoad(tabId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      // 먼저 탭 상태 확인
      browser.tabs.get(tabId).then(tab => {
        if (tab.status === 'complete') {
          resolve();
          return;
        }
        
        const timeoutId = setTimeout(() => {
          browser.tabs.onUpdated.removeListener(listener);
          reject(new Error('Tab load timeout'));
        }, timeout);
        
        const listener = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            clearTimeout(timeoutId);
            browser.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        
        browser.tabs.onUpdated.addListener(listener);
      }).catch(error => {
        reject(error);
      });
    });
  }
  
  async humanDelay(seconds) {
    // Add some randomness to make it more human-like
    const delay = (seconds + Math.random() * 2) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // Firefox 종료 감지를 위한 리스너
  async monitorFirefoxClose() {
    // Extension 자체의 종료만 감지
    browser.runtime.onSuspend.addListener(() => {
      console.log('[Extension] Browser is actually shutting down');
      
      // 진행 중인 로그인 프로세스 정리
      if (this.state.loginInProgress) {
        for (const platform in this.state.loginInProgress) {
          if (this.loginCheckIntervals.has(platform)) {
            clearInterval(this.loginCheckIntervals.get(platform));
          }
        }
        this.state.loginInProgress = {};
      }
      
      this.loginCheckIntervals.clear();
      this.loginCheckTabs.clear();
    });
  }
}

// ======================== Initialize Extension ========================

const extension = new NativeExtension();

// Firefox 종료 감지 추가
extension.monitorFirefoxClose();

// Export for debugging
window.llmCollectorExtension = extension;