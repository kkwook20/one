// Firefox Extension - background.js (Native Messaging 전용 버전)
console.log('[LLM Collector] Extension loaded at', new Date().toISOString());

// ======================== Configuration ========================
const NATIVE_HOST_ID = 'com.argosa.native';

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
    
    // Start heartbeat
    this.startHeartbeat();
    
    console.log('[Extension] Initialization complete');
  }
  
  async loadSettings() {
    try {
      const settings = await browser.storage.local.get([
        'maxConversations',
        'delayBetweenPlatforms',
        'syncInterval'
      ]);
      
      if (settings.maxConversations) {
        this.settings.maxConversations = settings.maxConversations;
      }
      if (settings.delayBetweenPlatforms) {
        this.settings.randomDelay = settings.delayBetweenPlatforms;
        this.settings.delayBetweenPlatforms = settings.delayBetweenPlatforms;
      }
    } catch (error) {
      console.error('[Extension] Failed to load settings:', error);
    }
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
      
    } catch (error) {
      console.error('[Extension] Failed to connect native:', error);
      this.nativeConnected = false;
      
      // 재연결 시도
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
      setTimeout(() => this.connectNative(), this.reconnectDelay);
    }
  }
  
  sendNativeMessage(message) {
    if (!this.nativePort) {
      console.error('[Extension] Native port not connected');
      return false;
    }
    
    // ID 추가
    if (!message.id) {
      message.id = `msg_${Date.now()}_${Math.random()}`;
    }
    
    try {
      this.nativePort.postMessage(message);
      return true;
    } catch (error) {
      console.error('[Extension] Send error:', error);
      return false;
    }
  }
  
  async handleNativeMessage(message) {
    const { id, type, data } = message;
    
    switch (type) {
      case 'collect_conversations':
        await this.handleCollectCommand(id, data);
        break;
        
      case 'execute_llm_query':
        await this.handleLLMQueryCommand(id, data);
        break;
        
      case 'check_session':
        await this.handleSessionCheck(id, data);
        break;
        
      case 'update_settings':
        this.settings = { ...this.settings, ...data };
        await this.saveSettings();
        break;
        
      default:
        console.warn('[Extension] Unknown native command:', type);
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
        active: true  // LLM 질문은 사용자가 볼 수 있게
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
  
  async saveSettings() {
    try {
      await browser.storage.local.set({ extensionSettings: this.settings });
    } catch (error) {
      console.error('[Extension] Failed to save settings:', error);
    }
  }
  
  // ======================== Heartbeat ========================
  
  startHeartbeat() {
    setInterval(() => {
      if (this.nativeConnected) {
        this.sendNativeMessage({
          type: 'heartbeat',
          data: {
            sessions: this.getSessionStates(),
            timestamp: new Date().toISOString(),
            collecting: this.state.collecting
          }
        });
      }
    }, 10000);
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
  
  // getCollectionCode 함수 수정 - 모든 플랫폼 구현
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
              // Grok uses Twitter's API structure
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

  // injectLLMQuery 함수 완성
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
          else if ('${platform}' === 'claude') {
            // Claude-specific implementation
            const newChatBtn = document.querySelector('button[aria-label="New chat"], button[data-testid="new-chat-button"]');
            if (newChatBtn) {
              newChatBtn.click();
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            const input = document.querySelector('div[contenteditable="true"], textarea[placeholder*="Talk to Claude"]');
            if (input) {
              // contenteditable의 경우
              if (input.contentEditable === 'true') {
                input.textContent = ${JSON.stringify(query)};
                input.dispatchEvent(new Event('input', { bubbles: true }));
              } else {
                // textarea의 경우
                input.value = ${JSON.stringify(query)};
                input.dispatchEvent(new Event('input', { bubbles: true }));
              }
              
              const sendBtn = document.querySelector('button[aria-label="Send"], button[type="submit"]');
              if (sendBtn) {
                sendBtn.click();
              }
              
              await new Promise(resolve => setTimeout(resolve, 2000));
              return 'claude-conv-' + Date.now();
            }
          }
          else if ('${platform}' === 'gemini') {
            // Gemini-specific implementation
            const input = document.querySelector('rich-textarea textarea, textarea[aria-label*="Talk to Gemini"]');
            if (input) {
              input.value = ${JSON.stringify(query)};
              input.dispatchEvent(new Event('input', { bubbles: true }));
              
              const sendBtn = document.querySelector('button[aria-label="Send"], button[mattooltip="Send message"]');
              if (sendBtn) {
                sendBtn.click();
              }
              
              await new Promise(resolve => setTimeout(resolve, 2000));
              return 'gemini-' + Date.now();
            }
          }
          else if ('${platform}' === 'deepseek') {
            // DeepSeek-specific implementation
            const textarea = document.querySelector('textarea[placeholder*="Ask me anything"], #chat-input');
            if (textarea) {
              textarea.value = ${JSON.stringify(query)};
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              
              const sendBtn = document.querySelector('button[type="submit"], button.send-button');
              if (sendBtn) {
                sendBtn.click();
              }
              
              await new Promise(resolve => setTimeout(resolve, 2000));
              return 'deepseek-' + Date.now();
            }
          }
          else if ('${platform}' === 'grok') {
            // Grok-specific implementation
            const input = document.querySelector('textarea[placeholder*="Ask Grok"], div[contenteditable="true"]');
            if (input) {
              if (input.tagName === 'TEXTAREA') {
                input.value = ${JSON.stringify(query)};
              } else {
                input.textContent = ${JSON.stringify(query)};
              }
              input.dispatchEvent(new Event('input', { bubbles: true }));
              
              const sendBtn = document.querySelector('button[aria-label="Send"], div[role="button"][tabindex="0"]');
              if (sendBtn) {
                sendBtn.click();
              }
              
              await new Promise(resolve => setTimeout(resolve, 2000));
              return 'grok-' + Date.now();
            }
          }
          else if ('${platform}' === 'perplexity') {
            // Perplexity-specific implementation
            const textarea = document.querySelector('textarea[placeholder*="Ask anything"], textarea[name="query"]');
            if (textarea) {
              textarea.value = ${JSON.stringify(query)};
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              
              // Perplexity는 Enter 키로 전송
              const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
              });
              textarea.dispatchEvent(enterEvent);
              
              await new Promise(resolve => setTimeout(resolve, 2000));
              return 'perplexity-' + Date.now();
            }
          }
          
          throw new Error('Could not find input field for ' + '${platform}');
        })();
      `;
      
      const results = await browser.tabs.executeScript(tabId, { code });
      return results[0];
    }

  // waitForLLMResponse 함수 완성
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
                else if ('${platform}' === 'claude') {
                  const thinking = document.querySelector('.loading-indicator, [data-testid="message-loading"]');
                  const messages = document.querySelectorAll('[data-testid="assistant-message"], .assistant-message');
                  return !thinking && messages.length > 0;
                }
                else if ('${platform}' === 'gemini') {
                  const loading = document.querySelector('mat-spinner, .loading-indicator');
                  const messages = document.querySelectorAll('.model-response, [data-message-author="assistant"]');
                  return !loading && messages.length > 0;
                }
                else if ('${platform}' === 'deepseek') {
                  const loading = document.querySelector('.loading, .thinking-indicator');
                  const messages = document.querySelectorAll('.assistant-message, .chat-message.assistant');
                  return !loading && messages.length > 0;
                }
                else if ('${platform}' === 'grok') {
                  const loading = document.querySelector('[data-testid="loading"], .spinner');
                  const messages = document.querySelectorAll('[data-testid="grok-message"], .message-grok');
                  return !loading && messages.length > 0;
                }
                else if ('${platform}' === 'perplexity') {
                  const loading = document.querySelector('.generating, .loading-dots');
                  const messages = document.querySelectorAll('.prose, .answer-content');
                  return !loading && messages.length > 0;
                }
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

// Export for debugging
window.llmCollectorExtension = extension;

// Status check every 30 seconds
setInterval(() => {
  console.log('[Extension] Status:', {
    nativeConnected: extension.nativeConnected,
    sessions: extension.getSessionStates(),
    collecting: extension.state.collecting
  });
}, 30000);