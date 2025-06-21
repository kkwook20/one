// Firefox Extension - firefox_util\llm-collector\background.js (Native Messaging 전용 버전)
console.log('[LLM Collector] Extension loaded at', new Date().toISOString());

// ======================== Configuration ========================
const NATIVE_HOST_ID = 'com.argosa.native';
const BACKEND_URL = 'http://localhost:8000/api/argosa/data';

// Platform configurations
const PLATFORMS = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chat.openai.com',
    conversationListUrl: 'https://chat.openai.com/backend-api/conversations',
    conversationDetailUrl: (id) => `https://chat.openai.com/backend-api/conversation/${id}`,
    cookieDomain: '.openai.com',
    loginSelectors: ['[data-testid="profile-button"]', 'nav button img'],
    sessionCheckUrl: 'https://chat.openai.com/backend-api/accounts/check',
    sessionCheckMethod: 'GET'
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    conversationListUrl: 'https://claude.ai/api/chat_conversations',
    conversationDetailUrl: (id) => `https://claude.ai/api/chat_conversations/${id}`,
    cookieDomain: '.claude.ai',
    loginSelectors: ['[class*="chat"]', '[data-testid="user-menu"]'],
    sessionCheckUrl: 'https://claude.ai/api/organizations',
    sessionCheckMethod: 'GET'
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    conversationListUrl: 'https://gemini.google.com/api/conversations',
    conversationDetailUrl: (id) => `https://gemini.google.com/api/conversations/${id}`,
    cookieDomain: '.google.com',
    loginSelectors: ['[aria-label*="Google Account"]'],
    sessionCheckUrl: 'https://gemini.google.com/app',
    sessionCheckMethod: 'GET'
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    conversationListUrl: 'https://chat.deepseek.com/api/v0/chat/conversations',
    conversationDetailUrl: (id) => `https://chat.deepseek.com/api/v0/chat/conversation/${id}`,
    cookieDomain: '.deepseek.com',
    loginSelectors: ['[class*="avatar"]'],
    sessionCheckUrl: 'https://chat.deepseek.com/api/v0/user/info',
    sessionCheckMethod: 'GET'
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.x.ai',
    conversationListUrl: 'https://grok.x.ai/api/conversations',
    conversationDetailUrl: (id) => `https://grok.x.ai/api/conversations/${id}`,
    cookieDomain: '.x.ai',
    loginSelectors: ['[data-testid="SideNav_AccountSwitcher_Button"]'],
    sessionCheckUrl: 'https://grok.x.ai/api/user',
    sessionCheckMethod: 'GET'
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    conversationListUrl: 'https://www.perplexity.ai/api/conversations',
    conversationDetailUrl: (id) => `https://www.perplexity.ai/api/conversations/${id}`,
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
        console.error('[Extension] Native port disconnected');
        this.nativePort = null;
        this.nativeConnected = false;
        
        // Backend에 연결 해제 알림
        this.notifyBackendStatus('disconnected');
        
        // 재연결 시도
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
        setTimeout(() => this.connectNative(), this.reconnectDelay);
      });
      
      // 초기화 메시지
      this.sendNativeMessage({
        type: 'init',
        data: {
          version: '2.0',
          platform: 'firefox'
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
      await fetch(`${BACKEND_URL}/native/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: status,
          extension_ready: status === 'connected',
          timestamp: new Date().toISOString(),
          ...additionalData
        })
      });
      console.log(`[Extension] Backend notified: ${status}`);
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
      
      // Extension 초기화 시 자동 세션 체크 제거
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
    else if (type === 'error') {
      console.error('[Extension] Native Host error:', message.data);
    }
    else {
      console.warn('[Extension] Unknown native command:', type);
    }
  }

  // ======================== Session Checking ========================

  async checkSessionInNewTab(platform, url) {
    return new Promise(async (resolve) => {
      try {
        // 새 탭 생성 (백그라운드)
        const tab = await browser.tabs.create({
          url: url,
          active: false
        });
        
        // 탭 로드 대기
        await this.waitForTabLoad(tab.id, 10000);
        
        // 세션 체크 스크립트 실행
        const results = await browser.tabs.executeScript(tab.id, {
          code: this.getSessionCheckCode(platform)
        });
        
        // 탭 닫기
        await browser.tabs.remove(tab.id);
        
        if (results && results[0]) {
          const sessionResult = results[0];
          
          // 쿠키도 확인
          const cookies = await this.getPlatformCookies(platform);
          
          resolve({
            valid: sessionResult.valid,
            status: sessionResult.valid ? 'active' : 'expired',
            expires_at: sessionResult.expires_at,
            cookies: cookies,
            error: sessionResult.error
          });
        } else {
          resolve({ 
            valid: false, 
            status: 'error',
            error: 'Script execution failed' 
          });
        }
        
      } catch (error) {
        console.error(`[Extension] Session check error for ${platform}:`, error);
        resolve({ 
          valid: false, 
          status: 'error',
          error: error.message 
        });
      }
    });
  }

  getSessionCheckCode(platform) {
    const config = PLATFORMS[platform];
    
    return `
      (async function() {
        try {
          // 공통: 페이지 로드 확인
          if (document.readyState !== 'complete') {
            return { valid: false, error: 'Page still loading' };
          }
          
          // 공통: 로그인 페이지 체크
          const loginPaths = ['/auth', '/login', '/signin'];
          const isLoginPage = loginPaths.some(path => window.location.pathname.includes(path));
          if (isLoginPage) {
            return { valid: false, error: 'On login page' };
          }
          
          const platform = '${platform}';
          const sessionCheckUrl = '${config.sessionCheckUrl}';
          const method = '${config.sessionCheckMethod}';
          
          // API 호출
          let apiValid = false;
          let userData = null;
          
          try {
            const response = await fetch(sessionCheckUrl, {
              method: method,
              credentials: 'include',
              redirect: 'manual'
            });
            
            if (response.ok) {
              const data = await response.json();
              
              // 플랫폼별 API 응답 검증
              switch(platform) {
                case 'chatgpt':
                  apiValid = !!(data && data.account && data.account.email);
                  userData = data.account?.email;
                  break;
                case 'claude':
                  apiValid = !!(data && data.length >= 0); // organizations 배열
                  break;
                case 'perplexity':
                  apiValid = !!(data && data.user);
                  break;
                default:
                  apiValid = response.ok;
              }
            }
          } catch (e) {
            // API 실패는 무시하고 DOM 체크로 진행
          }
          
          // DOM 체크 - main content 확인
          const mainContent = document.querySelector('main') || document.querySelector('#app') || document.querySelector('[role="main"]');
          if (!mainContent) {
            return { valid: false, error: 'Main content not loaded' };
          }
          
          // 플랫폼별 UI 요소 체크
          let hasRequiredUI = false;
          
          switch(platform) {
            case 'chatgpt':
              hasRequiredUI = (document.querySelector('[data-testid="profile-button"]') !== null ||
                              document.querySelector('nav button img') !== null) &&
                             (document.querySelector('textarea[data-id="root"]') !== null ||
                              document.querySelector('#prompt-textarea') !== null);
              break;
              
            case 'claude':
              hasRequiredUI = document.querySelector('[data-testid="composer"]') !== null ||
                             document.querySelector('[class*="ChatMessageInput"]') !== null;
              break;
              
            case 'gemini':
              hasRequiredUI = document.querySelector('[aria-label="Message Gemini"]') !== null &&
                             document.querySelector('[aria-label*="Google Account"]') !== null;
              break;
              
            case 'deepseek':
              hasRequiredUI = document.querySelector('[class*="chat-input"]') !== null &&
                             document.querySelector('[class*="avatar"]') !== null;
              break;
              
            case 'grok':
              hasRequiredUI = document.querySelector('[data-testid="MessageComposer"]') !== null &&
                             document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') !== null;
              break;
              
            case 'perplexity':
              hasRequiredUI = document.querySelector('[class*="SearchBar"]') !== null ||
                             document.querySelector('[class*="ThreadView"]') !== null;
              break;
          }
          
          // 추가 검증: 로그인 관련 요소가 있으면 무조건 false
          const loginIndicators = [
            'button[aria-label="Log in"]',
            'button[aria-label="Sign in"]', 
            '[data-testid="login-button"]',
            'input[type="email"][placeholder*="email"]',
            'input[type="password"]'
          ];

          const hasLoginElement = loginIndicators.some(selector => 
            document.querySelector(selector) !== null
          );

          if (hasLoginElement) {
            return { valid: false, error: 'Login elements detected' };
          }
          
          // 최종 판단: API와 UI 모두 확인 (플랫폼별로 다르게)
          let isValid = false;
          
          if (platform === 'chatgpt' || platform === 'claude') {
            // 이 플랫폼들은 API와 UI 모두 필요
            isValid = apiValid && hasRequiredUI;
          } else {
            // 다른 플랫폼은 UI만 체크
            isValid = hasRequiredUI;
          }
          
          return {
            valid: isValid,
            user: userData,
            expires_at: isValid ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null
          };
          
        } catch (error) {
          return { valid: false, error: error.message };
        }
      })();
    `;
  }

  // Firefox 종료 감지를 위한 리스너 추가
  async monitorFirefoxClose() {
    // 윈도우가 모두 닫히면 Firefox가 종료된 것
    browser.windows.onRemoved.addListener(async () => {
      const windows = await browser.windows.getAll();
      if (windows.length === 0) {
        console.log('[Extension] Firefox is closing');
        
        // 모든 플랫폼의 로그인 대기 중인 상태 정리
        for (const [platform, intervalId] of this.loginCheckIntervals) {
          clearInterval(intervalId);
          
          // Native Host로 Firefox 종료 알림
          this.sendNativeMessage({
            type: 'session_update',
            data: {
              platform: platform,
              valid: false,
              source: 'firefox_closed',
              error: 'Firefox is closing'
            }
          });
        }
        
        this.loginCheckIntervals.clear();
      }
    });
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
    
    const targetUrl = url || config.url;
    let tab = null;
    let tabRemovedListener = null;
    
    try {
      // 기존 탭 찾기
      const existingTabs = await browser.tabs.query({ url: `${config.url}/*` });
      
      if (existingTabs.length > 0) {
        // 기존 탭 사용
        tab = existingTabs[0];
        await browser.tabs.update(tab.id, { active: true });
        console.log(`[Extension] Using existing tab for ${platform}`);
      } else {
        // 새 탭 생성
        tab = await browser.tabs.create({
          url: targetUrl,
          active: true
        });
        console.log(`[Extension] Created new tab for ${platform}`);
      }
      
      // 탭 닫힘 리스너 먼저 등록
      tabRemovedListener = (tabId) => {
        if (tabId === tab.id) {
          if (this.loginCheckIntervals.has(platform)) {
            clearInterval(this.loginCheckIntervals.get(platform));
            this.loginCheckIntervals.delete(platform);
          }
          
          this.sendNativeMessage({
            type: 'session_update',
            id: messageId,
            data: {
              platform: platform,
              valid: false,
              source: 'tab_closed',
              error: 'User closed the tab'
            }
          });
          
          browser.tabs.onRemoved.removeListener(tabRemovedListener);
        }
      };
      browser.tabs.onRemoved.addListener(tabRemovedListener);
      
      // 탭 로드 대기 (실패해도 계속 진행)
      try {
        await this.waitForTabLoad(tab.id, 10000);
      } catch (e) {
        console.log(`[Extension] Tab load timeout, continuing anyway`);
      }
      
      // 탭이 아직 존재하는지 확인
      try {
        await browser.tabs.get(tab.id);
      } catch (e) {
        console.log(`[Extension] Tab was closed immediately`);
        return;
      }
      
      await this.humanDelay(2);
      
      // 초기 세션 체크
      try {
        const results = await browser.tabs.executeScript(tab.id, {
          code: this.getSessionCheckCode(platform)
        });
        
        if (results && results[0] && results[0].valid) {
          browser.tabs.onRemoved.removeListener(tabRemovedListener);
          
          const cookies = await this.getPlatformCookies(platform);
          
          // 이미 로그인된 경우 탭 닫기
          await browser.tabs.remove(tab.id);
          
          this.sendNativeMessage({
            type: 'session_update',
            id: messageId,
            data: {
              platform: platform,
              valid: true,
              source: 'already_logged_in',
              cookies: cookies
            }
          });
          return;
        }
      } catch (e) {
        console.log(`[Extension] Initial check failed, starting login detection`);
      }
      
      // 로그인 감지 루프
      let checkCount = 0;
      const maxChecks = 60;
      
      const checkInterval = setInterval(async () => {
        checkCount++;
        
        // 탭 존재 확인
        try {
          await browser.tabs.get(tab.id);
        } catch (e) {
          clearInterval(checkInterval);
          this.loginCheckIntervals.delete(platform);
          return;
        }
        
        // 세션 체크
        try {
          const results = await browser.tabs.executeScript(tab.id, {
            code: this.getSessionCheckCode(platform)
          });
          
          if (results && results[0] && results[0].valid) {
            clearInterval(checkInterval);
            this.loginCheckIntervals.delete(platform);
            browser.tabs.onRemoved.removeListener(tabRemovedListener);
            
            const cookies = await this.getPlatformCookies(platform);
            
            // 로그인 성공 시 탭 닫기
            await browser.tabs.remove(tab.id);
            
            this.sendNativeMessage({
              type: 'session_update',
              id: messageId,
              data: {
                platform: platform,
                valid: true,
                source: 'login_detection',
                cookies: cookies
              }
            });
          }
        } catch (e) {
          // 스크립트 실행 실패는 무시하고 계속
        }
        
        if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
          this.loginCheckIntervals.delete(platform);
          browser.tabs.onRemoved.removeListener(tabRemovedListener);
          
          this.sendNativeMessage({
            type: 'session_update',
            id: messageId,
            data: {
              platform: platform,
              valid: false,
              source: 'timeout',
              error: 'Login timeout'
            }
          });
        }
      }, 5000);
      
      this.loginCheckIntervals.set(platform, checkInterval);
      
    } catch (error) {
      // 탭 생성 실패
      if (tabRemovedListener) {
        browser.tabs.onRemoved.removeListener(tabRemovedListener);
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
  
  // 대화 수집 (LLM 제외)
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
  
  // LLM 질문 실행
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
  
  // 세션 체크
  async handleSessionCheck(messageId, data) {
    const platform = data.platform;
    const force = data.force || false;
    
    // 항상 checkSessionInNewTab 사용
    const result = await this.checkSessionInNewTab(platform, PLATFORMS[platform].url);
    
    this.sendNativeMessage({
      type: 'session_update',
      id: messageId,
      data: {
        platform: platform,
        ...result,
        source: 'session_check'
      }
    });
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
      const cookies = await browser.cookies.getAll({
        domain: config.cookieDomain
      });
      
      // Filter relevant cookies
      return cookies.filter(c => 
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
      
      // Check session using checkSessionInNewTab
      const sessionResult = await this.checkSessionInNewTab(platform, config.url);
      
      if (!sessionResult.valid) {
        console.log(`[Extension] ${platform} session invalid, skipping...`);
        return { conversations: [], excluded: [] };
      }
      
      // Inject collection script with exclusions
      const results = await browser.tabs.executeScript(tab.id, {
        code: this.getCollectionCode(platform, config, settings, excludeIds)
      });
      
      const result = results[0] || { conversations: [], excluded: [] };
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
            const response = await fetch('${config.conversationListUrl}?offset=0&limit=' + limit, {
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
            const response = await fetch('${config.conversationListUrl}', {
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
            const response = await fetch('${config.conversationListUrl}', {
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
            const response = await fetch('${config.conversationListUrl}', {
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
            const response = await fetch('${config.conversationListUrl}', {
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
            const response = await fetch('${config.conversationListUrl}', {
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
          const textarea = document.querySelector('textarea[data-id="root"], #prompt-textarea, textarea[placeholder*="Message"]');
          if (textarea) {
            // 텍스트 입력
            textarea.value = ${JSON.stringify(query)};
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            
            // 전송 버튼 클릭
            const sendButton = document.querySelector('button[data-testid="send-button"], button[aria-label="Send"], button[type="submit"]');
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
}

// ======================== Initialize Extension ========================

const extension = new NativeExtension();

// Firefox 종료 감지 추가
extension.monitorFirefoxClose();

// Export for debugging
window.llmCollectorExtension = extension;