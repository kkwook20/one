// Firefox Extension - background.js (Native Messaging 전용 버전)
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
    loginIndicators: [
      () => window.location.pathname === '/chat' || window.location.pathname.startsWith('/c/'),
      () => !window.location.pathname.includes('auth'),
      () => !!document.querySelector('[data-testid="profile-button"]')
    ]
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    conversationListUrl: 'https://claude.ai/api/chat_conversations',
    conversationDetailUrl: (id) => `https://claude.ai/api/chat_conversations/${id}`,
    cookieDomain: '.claude.ai',
    loginSelectors: ['[class*="chat"]', '[data-testid="user-menu"]'],
    loginIndicators: [
      () => !!document.querySelector('[class*="chat"]'),
      () => !document.querySelector('button:has-text("Log in")')
    ]
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    conversationListUrl: 'https://gemini.google.com/api/conversations',
    conversationDetailUrl: (id) => `https://gemini.google.com/api/conversations/${id}`,
    cookieDomain: '.google.com',
    loginSelectors: ['[aria-label*="Google Account"]'],
    loginIndicators: [
      () => !!document.querySelector('[aria-label*="Google Account"]')
    ]
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    conversationListUrl: 'https://chat.deepseek.com/api/v0/chat/conversations',
    conversationDetailUrl: (id) => `https://chat.deepseek.com/api/v0/chat/conversation/${id}`,
    cookieDomain: '.deepseek.com',
    loginSelectors: ['[class*="avatar"]'],
    loginIndicators: [
      () => !!document.querySelector('[class*="avatar"]')
    ]
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.x.ai',
    conversationListUrl: 'https://grok.x.ai/api/conversations',
    conversationDetailUrl: (id) => `https://grok.x.ai/api/conversations/${id}`,
    cookieDomain: '.x.ai',
    loginSelectors: ['[data-testid="SideNav_AccountSwitcher_Button"]'],
    loginIndicators: [
      () => !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
    ]
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    conversationListUrl: 'https://www.perplexity.ai/api/conversations',
    conversationDetailUrl: (id) => `https://www.perplexity.ai/api/conversations/${id}`,
    cookieDomain: '.perplexity.ai',
    loginSelectors: ['[class*="profile"]'],
    loginIndicators: [
      () => !!document.querySelector('[class*="profile"]')
    ]
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
      console.error(`[Extension] Unknown platform: ${platform}`);
      this.sendNativeMessage({
        type: 'error',
        id: messageId,
        data: { error: `Unknown platform: ${platform}` }
      });
      return;
    }
    
    // URL이 data에 포함되어 있으면 그것을 사용, 아니면 config의 URL 사용
    const targetUrl = url || config.url;
    
    console.log(`[Extension] Opening ${platform} at ${targetUrl}`);
    
    try {
      // Firefox에서 새 탭 열기
      const tab = await browser.tabs.create({
        url: targetUrl,
        active: true
      });
      
      console.log(`[Extension] Opened ${platform} in tab ${tab.id}`);
      
      // 탭 닫힘 감지를 위한 리스너 - 먼저 등록
      const tabRemovedListener = (tabId) => {
        if (tabId === tab.id) {
          console.log(`[Extension] Tab closed for ${platform}`);
          
          // 로그인 체크 인터벌 정리
          if (this.loginCheckIntervals.has(platform)) {
            clearInterval(this.loginCheckIntervals.get(platform));
            this.loginCheckIntervals.delete(platform);
          }
          
          // 탭이 닫혔음을 알림
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
          
          // 리스너 제거
          browser.tabs.onRemoved.removeListener(tabRemovedListener);
        }
      };
      
      // 리스너 등록
      browser.tabs.onRemoved.addListener(tabRemovedListener);
      
      // 로그인 감지 시작
      let checkCount = 0;
      const maxChecks = 60; // 5분
      
      const checkInterval = setInterval(async () => {
        checkCount++;
        
        // 탭이 여전히 존재하는지 확인
        try {
          await browser.tabs.get(tab.id);
        } catch (e) {
          // 탭이 이미 닫혔으면 인터벌 정리 (리스너가 처리하므로 여기서는 정리만)
          clearInterval(checkInterval);
          this.loginCheckIntervals.delete(platform);
          return;
        }
        
        // 세션 체크
        const isValid = await this.checkSession(platform);
        
        if (isValid) {
          console.log(`✅ [Extension] ${platform} login detected!`);
          
          clearInterval(checkInterval);
          this.loginCheckIntervals.delete(platform);
          
          // 리스너 제거
          browser.tabs.onRemoved.removeListener(tabRemovedListener);
          
          // Native Host로 세션 업데이트 전송
          this.sendNativeMessage({
            type: 'session_update',
            id: messageId,
            data: {
              platform: platform,
              valid: true,
              source: 'login_detection',
              cookies: await this.getPlatformCookies(platform)
            }
          });
        }
        
        if (checkCount >= maxChecks) {
          console.log(`⏱️ [Extension] Login timeout for ${platform}`);
          clearInterval(checkInterval);
          this.loginCheckIntervals.delete(platform);
          
          // 리스너 제거
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
      
      // 인터벌 저장
      this.loginCheckIntervals.set(platform, checkInterval);
      
    } catch (error) {
      console.error(`[Extension] Failed to open login page:`, error);
      
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
    const isValid = await this.checkSession(data.platform);
    
    this.sendNativeMessage({
      type: 'session_check_result',
      id: messageId,
      data: {
        platform: data.platform,
        valid: isValid,
        checked_at: new Date().toISOString()
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
  
  async checkSession(platform) {
    const config = PLATFORMS[platform];
    if (!config) return false;
    
    // Check cookies first
    try {
      const cookies = await browser.cookies.getAll({
        domain: config.cookieDomain
      });
      
      const hasAuthCookie = cookies.some(c => 
        c.name.includes('session') || 
        c.name.includes('auth') || 
        c.name.includes('token') ||
        c.name.includes('login')
      );
      
      if (hasAuthCookie) {
        this.updateSessionState(platform, true);
        return true;
      }
    } catch (error) {
      console.error(`[Extension] Cookie check failed for ${platform}:`, error);
    }
    
    this.updateSessionState(platform, false);
    return false;
  }
  
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
  
  async checkTabSession(tabId, platform) {
    try {
      const results = await browser.tabs.executeScript(tabId, {
        code: `(${this.checkSessionInPage.toString()})('${platform}')`
      });
      
      return results[0] || false;
    } catch (error) {
      console.error(`[Extension] Failed to check session in tab:`, error);
      return false;
    }
  }
  
  checkSessionInPage(platform) {
    // This runs in the page context
    const config = {
      chatgpt: {
        selectors: ['[data-testid="profile-button"]', 'nav button img'],
        urlCheck: () => window.location.pathname === '/chat' || window.location.pathname.startsWith('/c/')
      },
      claude: {
        selectors: ['[class*="chat"]', '[data-testid="user-menu"]'],
        urlCheck: () => !window.location.pathname.includes('auth')
      },
      gemini: {
        selectors: ['[aria-label*="Google Account"]'],
        urlCheck: () => true
      },
      deepseek: {
        selectors: ['[class*="avatar"]'],
        urlCheck: () => true
      },
      grok: {
        selectors: ['[data-testid="SideNav_AccountSwitcher_Button"]'],
        urlCheck: () => true
      },
      perplexity: {
        selectors: ['[class*="profile"]'],
        urlCheck: () => true
      }
    };
    
    const platformConfig = config[platform];
    if (!platformConfig) return false;
    
    // Check URL
    if (!platformConfig.urlCheck()) return false;
    
    // Check for login indicators
    for (const selector of platformConfig.selectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }
    
    return false;
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
      
      // Check session
      const isLoggedIn = await this.checkTabSession(tab.id, platform);
      
      if (!isLoggedIn) {
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