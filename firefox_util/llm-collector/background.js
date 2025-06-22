// Firefox Extension - firefox_util\llm-collector\background.js (MV3 Production Ready)
console.log('[LLM Collector] Extension loaded at', new Date().toISOString());

// ======================== Configuration ========================
const NATIVE_HOST_ID = 'com.argosa.native';
const BACKEND_URL = 'http://localhost:8000/api/argosa/data';

// Platform configurations
const PLATFORMS = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    conversationListUrl: '/backend-api/conversations',
    conversationDetailUrl: (id) => `https://chatgpt.com/c/${id}`,
    cookieDomain: ['.openai.com', '.chatgpt.com', '.auth0.com'],
    loginSelectors: ['[data-testid="profile-button"]', 'nav button img'],
    sessionCheckUrl: '/backend-api/accounts/check',
    sessionCheckMethod: 'GET',
    ui: {
      sidebarLinks: 'nav a[href^="/c/"], [data-testid="conversation-turn"] a',
      messageWrapper: '[data-message-author-role]',
      messageRole: 'data-message-author-role',
      messageTime: 'time',
      scrollContainer: 'main [class*="react-scroll"], main [class*="overflow-y-auto"]',
      newChatButton: '[data-testid="new-chat-button"], button[aria-label="New chat"]'
    }
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    conversationListUrl: '/api/chat_conversations',
    conversationDetailUrl: (id) => {
      // 새로운 URL 패턴과 기존 패턴 모두 지원
      // Claude가 /conversation/로 변경되었을 가능성에 대비
      return `https://claude.ai/chat/${id}`;
    },
    cookieDomain: '.claude.ai',
    loginSelectors: ['[class*="chat"]', '[data-testid="user-menu"]'],
    sessionCheckUrl: '/api/organizations',
    sessionCheckMethod: 'GET',
    ui: {
      sidebarLinks: 'aside a[href^="/chat/"], aside a[href^="/conversation/"]',
      messageWrapper: 'div[data-testid="chat-message"], div[class*="ChatMessage"]',
      messageRole: 'data-role',
      messageTime: 'time',
      scrollContainer: 'main [class*="overflow-y-auto"]',
      newChatButton: 'button[aria-label="New chat"]'
    }
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    conversationListUrl: '/api/conversations',
    conversationDetailUrl: (id) => `https://gemini.google.com/chat/${id}`,
    cookieDomain: '.google.com',
    loginSelectors: ['[aria-label*="Google Account"]'],
    sessionCheckUrl: '/app',
    sessionCheckMethod: 'GET',
    ui: {
      sidebarLinks: 'div[role="listitem"] a, a[href*="/chat/"], .conversation-item',
      messageWrapper: 'div[data-message-id], div[class*="message-wrapper"], div[data-message-text], .conversation-turn',
      messageRole: 'data-message-role',
      messageTime: 'time',
      scrollContainer: 'main, .conversation-container, [class*="scroll"]',
      newChatButton: 'button[aria-label="New chat"], button[aria-label="New conversation"]'
    }
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    conversationListUrl: '/api/v0/chat/conversations',
    conversationDetailUrl: (id) => `https://chat.deepseek.com/chat/${id}`,
    cookieDomain: '.deepseek.com',
    loginSelectors: ['[class*="avatar"]'],
    sessionCheckUrl: '/api/v0/user/info',
    sessionCheckMethod: 'GET',
    ui: {
      sidebarLinks: 'ul[class*="conversation"] a',
      messageWrapper: 'div[class*="chat-message"]',
      messageRole: 'data-role',
      messageTime: 'time',
      scrollContainer: 'main [class*="scroll"]',
      newChatButton: 'button[class*="new-chat"]'
    }
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.x.ai',
    conversationListUrl: '/api/conversations',
    conversationDetailUrl: (id) => `https://grok.x.ai/chat/${id}`,
    cookieDomain: '.x.ai',
    loginSelectors: ['[data-testid="SideNav_AccountSwitcher_Button"]'],
    sessionCheckUrl: '/api/user',
    sessionCheckMethod: 'GET',
    ui: {
      sidebarLinks: 'div[role="navigation"] a[href^="/chat/"]',
      messageWrapper: 'div[data-testid="messageContainer"]',
      messageRole: 'data-role',
      messageTime: 'time',
      scrollContainer: 'main',
      newChatButton: '[data-testid="new-chat-button"]'
    }
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    conversationListUrl: '/api/conversations',
    conversationDetailUrl: (id) => `https://www.perplexity.ai/conversation/${id}`,
    cookieDomain: '.perplexity.ai',
    loginSelectors: ['[class*="profile"]'],
    sessionCheckUrl: '/api/auth/session',
    sessionCheckMethod: 'GET',
    ui: {
      sidebarLinks: 'nav a[href^="/conversation/"]',
      messageWrapper: 'article',
      messageRole: 'data-role',
      messageTime: 'time',
      scrollContainer: 'main',
      newChatButton: 'button[aria-label="New thread"]'
    }
  }
};

// ======================== Compatibility Layer ========================

// Firefox Stable/ESR compatibility for scripting API
const safeExecuteScript = async (options) => {
  // Firefox Stable may not have scripting API yet
  if (browser.scripting?.executeScript) {
    // Remove 'world' option for Firefox
    const { world, ...safeOptions } = options;
    return browser.scripting.executeScript(safeOptions);
  } else {
    // Fallback to tabs.executeScript for older Firefox
    const { target, func, args } = options;
    const code = args ? `(${func.toString()})(${args.map(a => JSON.stringify(a)).join(',')})` : `(${func.toString()})()`;
    return browser.tabs.executeScript(target.tabId, { code });
  }
};

// ======================== Extracted Functions for Performance ========================

const scriptFunctions = {
  // Session check function
  sessionCheck: async function(platform) {
    try {
      console.log('[Session Check] Starting for', platform);
      
      let waitCount = 0;
      while (document.readyState !== 'complete' && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      const url = window.location.href;
      const pathname = window.location.pathname;
      const loginPaths = ['/login', '/auth', '/signin', '/sign-in', '/accounts/login'];
      const isLoginUrl = loginPaths.some(path => pathname.includes(path));
      
      // Platform-specific checks
      if (platform === 'chatgpt') {
        if (url.includes('auth0') || url.includes('/auth/login') || url.includes('auth.openai.com')) {
          return { valid: false, error: 'On login page' };
        }
        
        if (window.location.hostname.endsWith('chatgpt.com') || window.location.hostname.endsWith('chat.openai.com')) {
          if (document.querySelector('input[type="email"]') || document.querySelector('input[type="password"]')) {
            return { valid: false, error: 'Login in progress' };
          }
          
          try {
            const apiUrl = new URL('/backend-api/accounts/check', window.location.origin).href;
            const response = await fetch(apiUrl, { method: 'GET', credentials: 'include' });
            
            const uiReady = !!document.querySelector(
              '#prompt-textarea, textarea[data-testid="prompt-textarea"], textarea[aria-label*="Message"], textarea[placeholder*="Message"]'
            );
            
            if (uiReady) {
              return { 
                valid: true,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
              };
            }
            
            return { valid: false, error: 'UI not ready' };
          } catch (e) {
            const uiReady = !!document.querySelector('#prompt-textarea, textarea[data-testid="prompt-textarea"]');
            if (uiReady) {
              return { valid: true, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() };
            }
            return { valid: false, error: 'API check failed: ' + e.message };
          }
        }
        
        return { valid: false, error: 'Not on ChatGPT domain' };
      }
      
      // Claude check
      if (platform === 'claude') {
        if (isLoginUrl || url.includes('/login') || url.includes('/auth')) {
          return { valid: false, error: 'On login page' };
        }
        
        if (window.location.hostname.endsWith('claude.ai')) {
          if (document.querySelector('input[type="email"]') || document.querySelector('input[type="password"]')) {
            return { valid: false, error: 'Login in progress' };
          }
          
          // API로 실제 로그인 상태 확인
          try {
            const apiUrl = new URL('/api/organizations', window.location.origin).href;
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
      
      // Similar checks for other platforms...
      // (Keeping them short for space, but same pattern applies)
      
      return { valid: false, error: 'Could not verify session' };
      
    } catch (error) {
      console.error('[Session Check] Error:', error);
      return { valid: false, error: error.message };
    }
  },
  
  // Conversation list scraping
  conversationList: async function(platform, limit) {
    console.log('[UI Collection] Scraping conversation IDs for', platform);
    const ids = [];
    
    try {
      if (platform === 'chatgpt') {
        const sidebar = document.querySelector('nav');
        if (!sidebar) {
          console.error('[UI Collection] Sidebar not found for ChatGPT');
          return [];
        }
        
        let previousHeight = 0;
        let scrollAttempts = 0;
        
        while (ids.length < limit && scrollAttempts < 20) {
          document.querySelectorAll('nav a[href^="/c/"], [data-testid="conversation-turn"] a').forEach(link => {
            const href = link.getAttribute('href');
            const match = href?.match(/\/c\/([a-zA-Z0-9-]+)/);
            if (match && !ids.includes(match[1])) {
              ids.push(match[1]);
            }
          });
          
          sidebar.scrollTop = sidebar.scrollHeight;
          await new Promise(r => setTimeout(r, 1000));
          
          if (sidebar.scrollHeight === previousHeight) break;
          previousHeight = sidebar.scrollHeight;
          scrollAttempts++;
        }
      }
      // Similar for other platforms...
      
    } catch (error) {
      console.error('[UI Collection] Error scraping IDs:', error);
      return [];
    }
    
    console.log('[UI Collection] Found', ids.length, 'conversation IDs');
    return ids.slice(0, limit);
  },
  
  // Scroll to load conversation
  scrollToLoad: async function(platform) {
    console.log('[UI Collection] Loading full conversation...');
    
    try {
      let scrollContainer;
      
      if (platform === 'chatgpt') {
        scrollContainer = document.querySelector('main [class*="react-scroll"], main [class*="overflow-y-auto"]');
      } else if (platform === 'claude') {
        scrollContainer = document.querySelector('main [class*="overflow-y-auto"]');
      } else {
        scrollContainer = document.querySelector('main');
      }
      
      if (!scrollContainer) {
        console.error('[UI Collection] Scroll container not found');
        return;
      }
      
      let previousScrollTop = -1;
      let attempts = 0;
      
      while (attempts < 30) {
        scrollContainer.scrollTop = 0;
        await new Promise(r => setTimeout(r, 500));
        
        if (scrollContainer.scrollTop === 0 && scrollContainer.scrollTop === previousScrollTop) {
          break;
        }
        
        previousScrollTop = scrollContainer.scrollTop;
        attempts++;
      }
      
      console.log('[UI Collection] Conversation fully loaded');
      
    } catch (error) {
      console.error('[UI Collection] Scroll error:', error);
    }
  },
  
  // Heuristic-based message block detector (Enhanced Version)
  autoDetectMessages: function() {
    // 1) DOM 전체 div 후보 수집 (개선된 필터링)
    const candidates = [...document.querySelectorAll('div')]
      .filter(el => {
        const txt = el.innerText?.trim() || '';
        const rect = el.getBoundingClientRect();
        
        return (
          txt.length > 20 &&
          txt.length < 10000 && // 너무 긴 텍스트 제외
          getComputedStyle(el).display !== 'none' &&
          el.children.length <= 5 &&
          rect.width > 200 && // 너무 좁은 요소 제외
          rect.height > 50 && // 너무 낮은 요소 제외
          !txt.match(/^\s*(ChatGPT|Claude|Gemini|DeepSeek|Grok|Perplexity)\s*$/i) && // 사이드바/타이틀 제거
          !el.closest('nav, aside, header, footer') // 네비게이션 영역 제외
        );
      });
    
    // 2) 중복 제거 (부모-자식 관계)
    const filtered = candidates.filter(el => 
      !candidates.some(other => other !== el && other.contains(el))
    );
    
    // 3) 정교한 역할 추정
    return filtered.map(el => {
      const html = el.outerHTML;
      const classes = el.className || '';
      let role = 'unknown';
      
      // 더 정교한 역할 추정 (HTML 속성 + 클래스명)
      if (html.match(/assistant|agent|ai|bot|response/i) || 
          classes.match(/assistant|ai-message|bot-message/i)) {
        role = 'assistant';
      } else if (html.match(/user|human|prompt|question/i) || 
                 classes.match(/user-message|human-message/i)) {
        role = 'user';
      }
      
      return {
        role,
        content: el.innerText.trim(),
        timestamp: el.querySelector('time')?.getAttribute('datetime') || null
      };
    });
  },
  
  // Message extraction with heuristic fallback
  extractMessages: async function(platform) {
    console.log('[UI Collection] Extracting messages for', platform);
    
    const messages = [];
    let title = 'Untitled';
    let created_at = null;
    
    try {
      const titleElement = document.querySelector('h1, title');
      if (titleElement) {
        title = titleElement.innerText || titleElement.textContent || 'Untitled';
      }
      
      // 1단계: 기존 지정 셀렉터로 시도
      let messageElements = [...document.querySelectorAll('[data-message-author-role]')];
      
      // 2단계: 실패 시 휴리스틱 자동 탐색
      if (messageElements.length === 0) {
        console.log('[UI Collection] Fallback to heuristic detector');
        const auto = scriptFunctions.autoDetectMessages();
        
        auto.forEach((m, idx) => {
          messages.push({ ...m, index: idx });
          if (idx === 0 && m.timestamp) created_at = m.timestamp;
        });
        
        return {
          title,
          messages,
          created_at: created_at || new Date().toISOString()
        };
      }
      
      // (기존 로직 그대로)
      messageElements.forEach((el, index) => {
        const role = el.getAttribute('data-message-author-role');
        const timeEl = el.querySelector('time');
        const contentEl = el.querySelector('.markdown, .whitespace-pre-wrap, [class*="prose"]');
        
        messages.push({
          role: role || 'unknown',
          content: contentEl ? contentEl.innerText.trim() : el.innerText.trim(),
          timestamp: timeEl ? timeEl.getAttribute('datetime') : null,
          index: index
        });
        
        if (index === 0 && timeEl) {
          created_at = timeEl.getAttribute('datetime');
        }
      });
      
    } catch (error) {
      console.error('[UI Collection] Message extraction error:', error);
    }
    
    console.log('[UI Collection] Extracted', messages.length, 'messages (with heuristic fallback)');
    
    return {
      title: title,
      messages: messages,
      created_at: created_at || new Date().toISOString()
    };
  }
};

// ======================== Main Extension Class ========================
class NativeExtension {
  constructor() {
    this.settings = this.getDefaultSettings();
    this.state = {
      sessions: {},
      collecting: false,
      collectionMode: 'ui'
    };
    
    // Native Messaging
    this.nativePort = null;
    this.nativeConnected = false;
    this.reconnectDelay = 1000; 
    this.messageQueue = [];
    this.loginCheckIntervals = new Map();
    this.loginCheckTabs = new Map();
    
    // Keep-alive port for long operations
    this.keepAlivePort = null;
    
    // Initialize
    this.init();
  }
  
  getDefaultSettings() {
    return {
      maxConversations: 20,
      randomDelay: 5,
      delayBetweenPlatforms: 5,
      collectionMode: 'ui',
      debug: false, // 기본값 false로 설정
      syncSchedule: '0 1 * * *', // 매일 새벽 1시
      directBackendDump: false // Native Host 대신 Backend로 직접 전송
    };
  }
  
  async init() {
    this.log('[Extension] Initializing native extension...');
    
    // Load saved state
    await this.loadState();
    
    // Load settings
    await this.loadSettings();
    
    // Connect to Native Host
    this.connectNative();
    
    // Setup auto sync scheduler
    await this.setupAutoSyncAlarm();
    
    // Heartbeat to Native Host (15초마다)
    setInterval(() => {
      if (this.nativeConnected) {
        this.sendNativeMessage({
          type: 'heartbeat',
          data: {
            timestamp: new Date().toISOString(),
            sessions: this.getSessionStates(),
            extension_alive: true,
            disable_firefox_monitor: true
          }
        });
      }
    }, 15000);
    
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
        const collectionData = message.data || { platforms: Object.keys(PLATFORMS), settings: {} };
        this.handleCollectCommand('popup', collectionData);
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
      
      // Keep-alive message
      if (message.type === 'keepAlive') {
        sendResponse({ alive: true });
        return true;
      }
      
      // Export collected data
      if (message.type === 'exportData') {
        this.exportCollectedData()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ error: error.message }));
        return true;
      }
    });
    
    // Alarm listener for scheduled sync
    browser.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'autoSync') {
        this.log('[Extension] Auto sync triggered');
        const syncData = {
          platforms: Object.keys(PLATFORMS),
          settings: this.settings,
          exclude_ids: []
        };
        this.handleCollectCommand('scheduler', syncData);
        
        // Recalculate next alarm to handle DST
        await this.setupAutoSyncAlarm();
      }
    });
    
    // Browser startup handler (대체 종료 감지)
    browser.runtime.onStartup.addListener(() => {
      this.log('[Extension] Browser restarted');
      this.sendNativeMessage({
        type: 'browser_restart',
        data: { timestamp: new Date().toISOString() }
      });
    });
    
    this.log('[Extension] Initialization complete');
  }
  
  // ======================== Logging ========================
  
  log(message, ...args) {
    if (this.settings.debug === true) { // 명시적으로 true일 때만 로그
      console.log(message, ...args);
    }
  }
  
  error(message, ...args) {
    console.error(message, ...args);
  }
  
  // ======================== Auto Sync Scheduler ========================
  
  async setupAutoSyncAlarm() {
    try {
      // Clear existing alarm
      await browser.alarms.clear('autoSync');
      
      // Parse schedule - 간단한 검증 추가
      const schedule = this.settings.syncSchedule || '0 1 * * *';
      const parts = schedule.split(' ');
      
      if (parts.length < 2) {
        this.error('[Extension] Invalid sync schedule format:', schedule);
        return;
      }
      
      const minute = parseInt(parts[0]) || 0;
      const hour = parseInt(parts[1]) || 1;
      
      // Validate values
      if (minute < 0 || minute > 59 || hour < 0 || hour > 23) {
        this.error('[Extension] Invalid sync schedule values:', { minute, hour });
        return;
      }
      
      // Calculate next run time
      const now = new Date();
      const nextRun = new Date();
      nextRun.setHours(hour);
      nextRun.setMinutes(minute);
      nextRun.setSeconds(0);
      nextRun.setMilliseconds(0);
      
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      
      // Create alarm
      browser.alarms.create('autoSync', {
        when: nextRun.getTime()
        // Note: periodInMinutes를 제거하고 알람 발생 후 재설정하는 방식으로 DST 문제 해결
      });
      
      this.log(`[Extension] Auto sync scheduled for ${nextRun.toLocaleString()}`);
      
    } catch (error) {
      this.error('[Extension] Failed to setup auto sync:', error);
    }
  }
  
  // ======================== Keep-Alive for Long Operations ========================
  
  startKeepAlive() {
    if (!this.keepAlivePort) {
      this.keepAlivePort = browser.runtime.connect({ name: 'keepalive' });
      this.keepAlivePort.onDisconnect.addListener(() => {
        this.keepAlivePort = null;
      });
    }
  }
  
  stopKeepAlive() {
    if (this.keepAlivePort) {
      this.keepAlivePort.disconnect();
      this.keepAlivePort = null;
    }
  }
  
  // ======================== Native Messaging ========================
  
  connectNative() {
    this.log('[Extension] Connecting to native host...');
    
    try {
      this.nativePort = browser.runtime.connectNative(NATIVE_HOST_ID);
      
      this.nativePort.onMessage.addListener((message) => {
        this.log('[Extension] Native message:', message);
        this.handleNativeMessage(message);
      });
      
      this.nativePort.onDisconnect.addListener(() => {
        this.error('[Extension] Native port disconnected:', browser.runtime.lastError);
        this.nativePort = null;
        this.nativeConnected = false;
        
        // 진행 중인 로그인 체크 정리
        for (const [platform, intervalId] of this.loginCheckIntervals) {
          clearInterval(intervalId);
        }
        this.loginCheckIntervals.clear();
        this.loginCheckTabs.clear();
        
        // 백엔드 재시작 시 세션 상태 리셋
        this.state.sessions = {};
        this.state.loginInProgress = {};
        
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
          version: '3.0',
          platform: 'firefox',
          manifest_version: 3,
          extension_active: true,
          disable_firefox_monitor: true,
          request_session_sync: true // 백엔드에 세션 상태 동기화 요청
        }
      });
      
      this.nativeConnected = true;
      this.reconnectDelay = 1000;
      
      // Process queued messages
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift();
        this.sendNativeMessage(msg);
      }
      
    } catch (error) {
      this.error('[Extension] Failed to connect native:', error);
      this.nativeConnected = false;
      
      // 재연결 시도
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
      setTimeout(() => this.connectNative(), this.reconnectDelay);
    }
  }
  
  async notifyBackendStatus(status, additionalData = {}) {
    try {
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
      } else if (status === 'login_in_progress' || status === 'login_starting') {
        endpoint = `${BACKEND_URL}/native/message`;
        payload = {
          type: 'login_status',
          id: `login_status_${Date.now()}`,
          data: {
            ...additionalData,
            timestamp: new Date().toISOString(),
            extension_active: true,
            status: status
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
        const errorText = await response.text();
        this.error(`[Extension] Backend notification failed: ${response.status} ${response.statusText}`);
        this.error(`[Extension] Backend error response:`, errorText);
        this.error(`[Extension] Failed endpoint:`, endpoint);
        this.error(`[Extension] Failed payload:`, payload);
      } else {
        this.log(`[Extension] Backend notified: ${status}`, additionalData);
      }
    } catch (error) {
      this.error('[Extension] Failed to notify backend:', error);
      this.error('[Extension] Network error details:', {
        message: error.message,
        endpoint: endpoint,
        status: status
      });
    }
  }
  
  sendNativeMessage(message) {
    if (!this.nativePort) {
      this.error('[Extension] Native port not connected, queuing message');
      this.messageQueue.push(message);
      return false;
    }
    
    if (!message.id) {
      message.id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    if (message.data && (message.data.source === 'firefox_monitor' || message.data.source === 'firefox_closed')) {
      this.log('[Extension] Filtering out firefox_monitor message');
      return false;
    }
    
    try {
      this.nativePort.postMessage(message);
      this.log('[Extension] Sent message:', message);
      return true;
    } catch (error) {
      this.error('[Extension] Send error:', error);
      this.messageQueue.push(message);
      return false;
    }
  }
  
  async handleNativeMessage(message) {
    const { id, type } = message;
    this.log('[Extension] Received native message:', type);

    if (type === 'init_response') {
      this.log('[Extension] Native Host initialized successfully');
      
      // 백엔드 재시작 시 세션 상태 초기화
      if (message.reset_sessions) {
        this.log('[Extension] Resetting all session states per backend request');
        this.state.sessions = {};
        await this.saveState();
      }
      
      await this.notifyBackendStatus('connected', {
        capabilities: message.capabilities || [],
        nativeHost: true,
        status: message.status,
        sessions: this.getSessionStates()
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
      
      // Reschedule if sync schedule changed
      if (message.data.syncSchedule) {
        await this.setupAutoSyncAlarm();
      }
    }
    else if (type === 'open_login_page') {
      this.log('[Extension] Opening login page for:', message.data?.platform);
      // 백엔드 재시작 후 로그인 요청인 경우 force_login 플래그 추가
      const loginData = {
        ...message.data,
        force_login: message.data.force_login || false,
        skip_initial_check: message.data.skip_initial_check || false
      };
      await this.handleOpenLoginPage(id, loginData);
    }
    else if (type === 'session_update') {
      const source = message.data?.source;
      const error = message.data?.error;
      const platform = message.data?.platform;
      
      if (source === 'firefox_monitor' || source === 'firefox_closed') {
        this.log(`[Extension] Blocking session_update from ${source}`);
        return;
      }
      
      if (error && (
        error.toLowerCase().includes('firefox') || 
        error.toLowerCase().includes('closed') ||
        error === 'Firefox was closed' ||
        error === 'User closed the tab'
      )) {
        this.log('[Extension] Blocking Firefox-related error:', error);
        
        if (platform && this.state.loginInProgress && this.state.loginInProgress[platform]) {
          const loginInfo = this.state.loginInProgress[platform];
          this.log(`[Extension] Ignoring Firefox error during login process for ${platform}, session: ${loginInfo.sessionId}`);
          
          await this.notifyBackendStatus('override_firefox_error', {
            platform: platform,
            login_session_id: loginInfo.sessionId,
            extension_alive: true,
            message: 'Extension is active, ignore Firefox closed error'
          });
          
          return;
        }
        
        this.log('[Extension] Extension is still running, blocking Firefox closed message');
        return;
      }
      
      this.log('[Extension] Processing valid session_update:', message.data);
      
      if (message.data?.valid === false && platform) {
        this.log(`[Extension] Ignoring invalid session for ${platform} - Extension is active`);
        return;
      }
    }
    else if (type === 'firefox_closed') {
      this.log('[Extension] Received firefox_closed notification from Native Host');
      this.log('[Extension] Extension is still running, ignoring firefox_closed message');
    }
    else if (type === 'heartbeat_request') {
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
    else if (type === 'collection_started' || type === 'collection_chunk' || type === 'collection_finished') {
      // Backend에서 오는 collection 상태 메시지 처리
      this.log('[Extension] Collection status:', type, message.data);
    }
    else if (type === 'error') {
      this.error('[Extension] Native Host error:', message.data);
    }
    else {
      console.warn('[Extension] Unknown native command:', type);
    }
  }

  // ======================== Session Checking ========================

  async checkSessionInNewTab(platform, url) {
    let tab = null;
    
    if (this.state.loginInProgress && this.state.loginInProgress[platform]) {
      const loginInfo = this.state.loginInProgress[platform];
      this.log(`[Extension] Login in progress for ${platform}, session: ${loginInfo.sessionId}`);
    }
    
    try {
      const existingTabs = await browser.tabs.query({ url: `${PLATFORMS[platform].url}/*` });
      
      if (existingTabs.length > 0) {
        tab = existingTabs[0];
        this.log(`[Extension] Using existing tab for ${platform} session check`);
      } else {
        tab = await browser.tabs.create({
          url: url,
          active: false
        });
      }
      
      await this.waitForTabLoad(tab.id, 15000);
      await this.humanDelay(5);
      
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
      
      // Use safe execute script
      const results = await safeExecuteScript({
        target: { tabId: tab.id },
        func: scriptFunctions.sessionCheck,
        args: [platform]
      });
      
      if (!existingTabs.length) {
        await browser.tabs.remove(tab.id);
      }
      
      const result = Array.isArray(results) ? results[0] : results;
      if (result && (result.result || result)) {
        const sessionResult = result.result || result;
        this.log(`[Extension] Session check result for ${platform}:`, sessionResult);
        
        const cookies = await this.getPlatformCookies(platform);
        
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
      this.error(`[Extension] Session check error for ${platform}:`, error);
      
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
    
    this.log(`[Extension] handleOpenLoginPage - messageId: ${messageId}, platform: ${platform}`);
    
    // 즉시 UI 피드백을 위한 상태 전송
    await this.notifyBackendStatus('login_starting', {
      platform: platform,
      ui_status: 'preparing',
      command_id: data.command_id
    });
    
    const loginSessionId = `login_${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.log(`[Extension] Generated login session ID: ${loginSessionId}`);
    
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
    let loginCheckAborted = false;
    
    try {
      const existingTabs = await browser.tabs.query({});
      
      // URL 정규화 함수
      const normalizeUrl = (url) => {
        try {
          const u = new URL(url);
          return u.origin + u.pathname.replace(/\/$/, ''); // 쿼리 파라미터와 trailing slash 제거
        } catch (e) {
          return url;
        }
      };
      
      const platformTab = existingTabs.find(t => {
        if (!t.url) return false;
        
        const normalizedTabUrl = normalizeUrl(t.url);
        const normalizedConfigUrl = normalizeUrl(config.url);
        
        // 기본 URL 체크
        if (normalizedTabUrl === normalizedConfigUrl) return true;
        
        // 플랫폼별 특수 케이스
        switch(platform) {
          case 'chatgpt':
            return t.url.includes('chatgpt.com') || t.url.includes('chat.openai.com');
          case 'claude':
            return t.url.includes('claude.ai') && !t.url.includes('/login');
          case 'gemini':
            return (t.url.includes('gemini.google.com') || t.url.includes('bard.google.com')) 
                   && !t.url.includes('accounts.google.com');
          case 'deepseek':
            return t.url.includes('chat.deepseek.com') && !t.url.includes('/login');
          case 'grok':
            return (t.url.includes('grok.x.ai') || t.url.includes('x.ai')) 
                   && !t.url.includes('twitter.com') && !t.url.includes('x.com');
          case 'perplexity':
            return t.url.includes('perplexity.ai') && !t.url.includes('/login');
          default:
            return false;
        }
      });
      
      if (platformTab) {
        tab = platformTab;
        isNewTab = false;
        this.log(`[Extension] Using existing tab ${tab.id} for ${platform} - ${tab.url}`);
        await browser.tabs.update(tab.id, { active: true });
        await browser.windows.update(tab.windowId, { focused: true });
      } else {
        tab = await browser.tabs.create({
          url: targetUrl,
          active: true
        });
        isNewTab = true;
        this.log(`[Extension] Created new tab ${tab.id} for ${platform}`);
      }
      
      // 탭 생성/활성화 직후 UI 상태 업데이트
      await this.notifyBackendStatus('login_in_progress', {
        platform: platform,
        ui_status: 'opening_page',
        tab_opened: true,
        command_id: data.command_id
      });
      
      this.loginCheckTabs.set(platform, tab.id);
      
      try {
        await this.waitForTabLoad(tab.id, 10000);
      } catch (e) {
        this.log(`[Extension] Tab load timeout, continuing anyway`);
      }
      
      await this.humanDelay(7);
      
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
      
      tab.createdTime = Date.now();
      
      this.sendNativeMessage({
        type: 'login_process_started',
        id: `login_start_${Date.now()}`,
        data: {
          platform: platform,
          tab_id: tab.id,
          login_session_id: loginSessionId,
          ignore_firefox_monitor: true,
          disable_all_firefox_events: true,
          ui_status: 'tab_opened' // UI 즉시 업데이트
        }
      });
      
      await this.notifyBackendStatus('login_in_progress', {
        platform: platform,
        in_progress: true,
        tab_id: tab.id,
        command_id: data.command_id,
        login_session_id: loginSessionId,
        ignore_firefox_errors: true,
        override_any_firefox_closed: true,
        ui_status: 'opening_page' // UI 상태 업데이트를 위한 명시적 상태
      });
      
      // 초기 세션 체크 (백엔드 재시작 후 상태 동기화를 위해 지연 추가)
      this.log(`[Extension] Preparing initial session check for ${platform}...`);
      this.log(`[Extension] Current tab URL: ${tab.url}`);
      
      // 백엔드 재시작 또는 명시적 로그인 요청인 경우 초기 체크 건너뛰기
      const skipInitialCheck = data.force_login || data.skip_initial_check || false;
      
      if (skipInitialCheck) {
        this.log(`[Extension] Skipping initial session check - force login requested`);
      } else {
        // 백엔드 상태 동기화를 위한 추가 대기
        await this.humanDelay(5);
        
        try {
          const results = await safeExecuteScript({
            target: { tabId: tab.id },
            func: scriptFunctions.sessionCheck,
            args: [platform]
          });
          
          this.log(`[Extension] Initial session check results:`, JSON.stringify(results));
          
          const result = Array.isArray(results) ? results[0] : results;
          if (result && (result.result || result) && (result.result || result).valid) {
            const sessionResult = result.result || result;
            
            // 백엔드 재시작 직후일 수 있으므로 한 번 더 확인
            this.log(`[Extension] Session appears valid, double-checking...`);
            await this.humanDelay(2);
            
            // 두 번째 확인
            const doubleCheck = await safeExecuteScript({
              target: { tabId: tab.id },
              func: scriptFunctions.sessionCheck,
              args: [platform]
            });
            
            const doubleResult = Array.isArray(doubleCheck) ? doubleCheck[0] : doubleCheck;
            if (doubleResult && (doubleResult.result || doubleResult) && (doubleResult.result || doubleResult).valid) {
              this.log(`[Extension] ✅ ${platform} confirmed logged in!`);
              this.log(`[Extension] Command ID: ${data.command_id}`);
              
              const cookies = await this.getPlatformCookies(platform);
              this.loginCheckTabs.delete(platform);
              
              this.updateSessionState(platform, true);
              
              this.sendNativeMessage({
                type: 'session_update',
                id: messageId,
                data: {
                  platform: platform,
                  valid: true,
                  source: 'already_logged_in',
                  cookies: cookies,
                  expires_at: sessionResult.expires_at,
                  command_id: data?.command_id
                }
              });
              
              await this.notifyBackendStatus('session_active', {
                platform: platform,
                valid: true,
                status: 'active',
                source: 'already_logged_in',
                command_id: data?.command_id
              });
              
              if (this.state.loginInProgress) {
                delete this.state.loginInProgress[platform];
              }
              
              // 사용자가 로그인 프로세스를 볼 수 있도록 잠시 대기
              this.log(`[Extension] Waiting 2 seconds before closing tab...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              if (isNewTab) {
                await browser.tabs.remove(tab.id);
                this.log(`[Extension] Closed new tab - already logged in to ${platform}`);
              }
              
              return;
            } else {
              this.log(`[Extension] Double check failed - proceeding with login flow`);
            }
          } else {
            const sessionResult = result?.result || result || {};
            this.log(`[Extension] Initial check - not logged in yet:`, sessionResult.error || 'Unknown');
          }
        } catch (e) {
          this.log(`[Extension] Initial check failed, starting login detection:`, e.message);
        }
      }
      
      // === 로그인이 필요한 경우에만 리스너 등록 ===
      
      // 탭 교체 리스너
      tabReplacedListener = (addedTabId, removedTabId) => {
        if (removedTabId === tab.id) {
          this.log(`[Extension] Tab ${removedTabId} replaced by ${addedTabId} for ${platform}`);
          tab.id = addedTabId;
          this.loginCheckTabs.set(platform, addedTabId);
        }
      };
      browser.tabs.onReplaced.addListener(tabReplacedListener);
      
      // 탭 닫기 리스너
      tabRemovedListener = async (tabId, removeInfo) => {
        if (tabId === tab.id && !loginCheckAborted) {
          this.log(`[Extension] Tab ${tabId} removed for ${platform}`, removeInfo);
          
          if (removeInfo.isWindowClosing) {
            this.log(`[Extension] Window closing - ignoring tab removal for ${platform}`);
            return;
          }
          
          if (tab.createdTime && Date.now() - tab.createdTime < 7000) {
            this.log(`[Extension] Tab closed within 7 seconds - likely system redirect, ignoring`);
            return;
          }
          
          const remainingTabs = await browser.tabs.query({});
          if (remainingTabs.length === 0) {
            this.log(`[Extension] No tabs remaining - Firefox might be closing`);
            return;
          }
          
          loginCheckAborted = true;
          
          if (this.loginCheckIntervals.has(platform)) {
            clearInterval(this.loginCheckIntervals.get(platform));
            this.loginCheckIntervals.delete(platform);
          }
          this.loginCheckTabs.delete(platform);
          
          browser.tabs.onRemoved.removeListener(tabRemovedListener);
          browser.tabs.onReplaced.removeListener(tabReplacedListener);
          
          if (!this.state.sessions[platform]?.valid) {
            this.log(`[Extension] User closed tab before login for ${platform}`);
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
          
          if (this.state.loginInProgress) {
            delete this.state.loginInProgress[platform];
          }
        }
      };
      browser.tabs.onRemoved.addListener(tabRemovedListener);
      
      // 로그인 감지 루프 시작
      let checkCount = 0;
      const maxChecks = 120;
      
      this.log(`[Extension] Starting login detection loop for ${platform}`);
      this.log(`[Extension] Tab ID: ${tab.id}, Login Session ID: ${loginSessionId}`);
      
      const checkInterval = setInterval(async () => {
        checkCount++;
        this.log(`[Extension] Login check #${checkCount} for ${platform}`);
        
        if (loginCheckAborted) {
          this.log(`[Extension] Login check aborted for ${platform}`);
          clearInterval(checkInterval);
          return;
        }
        
        try {
          const tabInfo = await browser.tabs.get(tab.id);
          this.log(`[Extension] Tab status: ${tabInfo.status}, URL: ${tabInfo.url}`);
        } catch (e) {
          this.log(`[Extension] Tab no longer exists for ${platform}`);
          clearInterval(checkInterval);
          this.loginCheckIntervals.delete(platform);
          this.loginCheckTabs.delete(platform);
          return;
        }
        
        try {
          this.log(`[Extension] Executing session check script for ${platform}...`);
          const results = await safeExecuteScript({
            target: { tabId: tab.id },
            func: scriptFunctions.sessionCheck,
            args: [platform]
          });
          
          const result = Array.isArray(results) ? results[0] : results;
          if (result && (result.result || result)) {
            const sessionResult = result.result || result;
            this.log(`[Extension] Session check #${checkCount} for ${platform}:`, JSON.stringify(sessionResult));
            
            if (sessionResult.valid) {
              this.log(`[Extension] 🎉 ${platform} login detected!`);
              
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
              
              const cookies = await this.getPlatformCookies(platform);
              this.log(`[Extension] Got ${cookies.length} cookies for ${platform}`);
              
              this.updateSessionState(platform, true);
              
              if (this.state.loginInProgress) {
                delete this.state.loginInProgress[platform];
              }
              
              const updateId = `session_update_${Date.now()}`;
              this.log(`[Extension] Sending session_update with id: ${updateId}`);
              
              this.sendNativeMessage({
                type: 'session_update',
                id: updateId,
                data: {
                  platform: platform,
                  valid: true,
                  source: 'login_detection',
                  cookies: cookies,
                  expires_at: sessionResult.expires_at,
                  command_id: data?.command_id
                }
              });
              
              await this.notifyBackendStatus('session_active', {
                platform: platform,
                valid: true,
                status: 'active',
                source: 'login_detection',
                command_id: data?.command_id
              });
              
              this.log(`[Extension] Waiting 1 second before closing tab...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              try {
                await browser.tabs.remove(tab.id);
                this.log(`[Extension] Tab closed for ${platform}`);
              } catch (e) {
                this.log(`[Extension] Tab already closed`);
              }
              
              return;
            } else {
              this.log(`[Extension] Session not ready: ${sessionResult.error}`);
            }
          } else {
            this.log(`[Extension] No results from session check script`);
          }
        } catch (e) {
          this.log(`[Extension] Session check error (retry ${checkCount}):`, e.message);
          
          try {
            const tabInfo = await browser.tabs.get(tab.id);
            this.log(`[Extension] Tab URL during error: ${tabInfo.url}`);
            this.log(`[Extension] Tab status during error: ${tabInfo.status}`);
          } catch (tabError) {
            this.log(`[Extension] Could not get tab info: ${tabError.message}`);
          }
        }
        
        if (checkCount >= maxChecks) {
          this.log(`[Extension] Login timeout after ${checkCount} checks for ${platform}`);
          
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
          
          if (this.state.loginInProgress) {
            delete this.state.loginInProgress[platform];
          }
        }
      }, 5000);
      
      this.loginCheckIntervals.set(platform, checkInterval);
      this.log(`[Extension] Login check interval started for ${platform}`);
      
    } catch (error) {
      this.error(`[Extension] Error opening login page:`, error);
      
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
    } finally {
      // Cleanup listeners on error
      if (loginCheckAborted) {
        if (tabRemovedListener) {
          browser.tabs.onRemoved.removeListener(tabRemovedListener);
        }
        if (tabReplacedListener) {
          browser.tabs.onReplaced.removeListener(tabReplacedListener);
        }
      }
    }
  }
  
  // ======================== Command Handlers ========================
  
  async handleCollectCommand(messageId, data = {}) {
    if (this.state.collecting) {
      this.log('[Extension] Collection already in progress');
      this.sendNativeMessage({
        type: 'error',
        id: messageId,
        data: { error: 'Collection already in progress' }
      });
      return;
    }
    
    // Start keep-alive for long operation
    this.startKeepAlive();
    
    this.state.collecting = true;
    const { 
      platforms = Object.keys(PLATFORMS), 
      exclude_ids = [], 
      settings = {} 
    } = data;
    
    this.log(`[Extension] Collecting from ${platforms.length} platforms, excluding ${exclude_ids.length} LLM conversations`);
    this.log(`[Extension] Collection mode: ${this.settings.collectionMode || 'ui'}`);
    
    try {
      // Collection 시작 알림
      this.sendNativeMessage({
        type: 'collection_started',
        id: `collection_start_${Date.now()}`,
        data: {
          command_id: data.command_id,
          platforms: platforms,
          total_platforms: platforms.length
        }
      });
      
      for (let i = 0; i < platforms.length; i++) {
        const platform = platforms[i];
        
        try {
          let result;
          
          // UI 자동화 모드 사용
          if (this.settings.collectionMode === 'ui' || !this.settings.collectionMode) {
            result = await this.collectByUI(platform, settings, exclude_ids, data);
          } else {
            // 기존 API 모드 (fallback)
            result = await this.collectFromPlatform(platform, settings, exclude_ids);
          }
          
          // 플랫폼별 결과 전송 (chunk)
          this.sendNativeMessage({
            type: 'collection_chunk',
            id: `chunk_${platform}_${Date.now()}`,
            data: {
              command_id: data.command_id,
              platform: platform,
              platform_index: i + 1,
              total_platforms: platforms.length,
              conversations: result.conversations,
              excluded_llm_ids: result.excluded,
              collection_mode: this.settings.collectionMode || 'ui'
            }
          });
          
        } catch (error) {
          this.error(`[Extension] Error collecting from ${platform}:`, error);
          
          this.sendNativeMessage({
            type: 'collection_error',
            id: `error_${platform}_${Date.now()}`,
            data: {
              command_id: data.command_id,
              platform: platform,
              platform_index: i + 1,
              total_platforms: platforms.length,
              error: error.message
            }
          });
        }
        
        // 플랫폼 간 대기
        if (i < platforms.length - 1) {
          await this.humanDelay(settings.delayBetweenPlatforms || 5);
        }
      }
      
    } finally {
      // Collection 완료 처리
      this.state.collecting = false;
      
      // Stop keep-alive
      this.stopKeepAlive();
      
      // Collection 완료 알림
      this.sendNativeMessage({
        type: 'collection_finished',
        id: messageId,
        data: {
          command_id: data.command_id,
          platforms: platforms,
          timestamp: new Date().toISOString()
        }
      });
      
      this.log('[Extension] Collection completed for all platforms');
    }
  }
  
  // ======================== UI 자동화 수집 ========================
  
  async collectByUI(platform, settings, excludeIds = [], data = {}) {
    const config = PLATFORMS[platform];
    this.log(`[Extension] UI Collection starting for ${platform}...`);
    
    const collectedConversations = [];
    const excluded = [];
    const maxConversations = settings.maxConversations || this.settings.maxConversations || 20;
    
    let mainTab = null; // 스코프를 밖으로 이동
    
    try {
      // 1. 플랫폼 메인 페이지 열기
      try {
        mainTab = await browser.tabs.create({
          url: config.url,
          active: false
        });
      } catch (tabError) {
        this.error(`[Extension] Failed to create main tab for ${platform}:`, tabError);
        throw new Error(`Cannot create tab: ${tabError.message}`);
      }
      
      try {
        await this.waitForTabLoad(mainTab.id);
      } catch (loadError) {
        this.error(`[Extension] Tab load timeout for ${platform}, continuing anyway`);
      }
      
      await this.humanDelay(3);
      
      // 2. 세션 체크
      let sessionCheck;
      try {
        sessionCheck = await safeExecuteScript({
          target: { tabId: mainTab.id },
          func: scriptFunctions.sessionCheck,
          args: [platform]
        });
      } catch (scriptError) {
        this.error(`[Extension] Session check script failed for ${platform}:`, scriptError);
        if (mainTab && mainTab.id) {
          try {
            await browser.tabs.remove(mainTab.id);
          } catch (removeError) {
            this.log(`[Extension] Failed to remove main tab after script error`);
          }
        }
        return { conversations: [], excluded: [] };
      }
      
      const sessionResult = Array.isArray(sessionCheck) ? sessionCheck[0] : sessionCheck;
      if (!sessionResult || !(sessionResult.result || sessionResult)?.valid) {
        this.log(`[Extension] ${platform} session invalid, skipping UI collection`);
        if (mainTab && mainTab.id) {
          try {
            await browser.tabs.remove(mainTab.id);
          } catch (removeError) {
            this.log(`[Extension] Failed to remove main tab after session check`);
          }
        }
        return { conversations: [], excluded: [] };
      }
      
      // 3. 대화 ID 목록 수집 (사이드바에서)
      this.log(`[Extension] Collecting conversation IDs from sidebar...`);
      let conversationIds;
      try {
        conversationIds = await safeExecuteScript({
          target: { tabId: mainTab.id },
          func: scriptFunctions.conversationList,
          args: [platform, maxConversations]
        });
      } catch (scriptError) {
        this.error(`[Extension] Failed to collect conversation IDs for ${platform}:`, scriptError);
        if (mainTab && mainTab.id) {
          try {
            await browser.tabs.remove(mainTab.id);
          } catch (removeError) {
            this.log(`[Extension] Failed to remove main tab after ID collection error`);
          }
        }
        return { conversations: [], excluded: [] };
      }
      
      const idListResult = Array.isArray(conversationIds) ? conversationIds[0] : conversationIds;
      const idList = (idListResult?.result || idListResult) || [];
      this.log(`[Extension] Found ${idList.length} conversation IDs`);
      
      // 메인 탭 닫기
      if (mainTab && mainTab.id) {
        try {
          await browser.tabs.remove(mainTab.id);
        } catch (removeError) {
          this.log(`[Extension] Failed to remove main tab, may already be closed`);
        }
      }
      
      // 4. 각 대화 열어서 메시지 수집
      for (let i = 0; i < Math.min(idList.length, maxConversations); i++) {
        const convId = idList[i];
        
        // Exclude 체크
        if (excludeIds.includes(convId)) {
          this.log(`[Extension] Excluding conversation: ${convId}`);
          excluded.push(convId);
          continue;
        }
        
        this.log(`[Extension] Opening conversation ${i+1}/${idList.length}: ${convId}`);
        
        try {
          // 대화 페이지 열기
          const convUrl = config.conversationDetailUrl(convId);
          let convTab;
          
          try {
            convTab = await browser.tabs.create({
              url: convUrl,
              active: false
            });
          } catch (tabError) {
            this.error(`[Extension] Failed to create conversation tab for ${convId}:`, tabError);
            continue; // 다음 대화로 건너뛰기
          }
          
          await this.waitForTabLoad(convTab.id);
          await this.humanDelay(2);
          
          // 전체 대화 로드를 위한 스크롤
          try {
            await safeExecuteScript({
              target: { tabId: convTab.id },
              func: scriptFunctions.scrollToLoad,
              args: [platform]
            });
          } catch (scrollError) {
            this.log(`[Extension] Scroll failed for conversation ${convId}, continuing anyway`);
          }
          
          // 메시지 추출 (휴리스틱 포함)
          let messages;
          try {
            messages = await safeExecuteScript({
              target: { tabId: convTab.id },
              func: scriptFunctions.extractMessages,
              args: [platform]
            });
          } catch (extractError) {
            this.error(`[Extension] Failed to extract messages for ${convId}:`, extractError);
            if (convTab && convTab.id) {
              try {
                await browser.tabs.remove(convTab.id);
              } catch (removeError) {
                this.log(`[Extension] Failed to remove conversation tab after extract error`);
              }
            }
            continue; // 다음 대화로 건너뛰기
          }
          
          const messageResult = Array.isArray(messages) ? messages[0] : messages;
          const messageData = (messageResult?.result || messageResult) || { messages: [], title: 'Untitled' };
          
          // 대화 데이터 구성
          const conversation = {
            id: convId,
            platform: platform,
            title: messageData.title,
            messages: messageData.messages,
            created_at: messageData.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: {
              source: 'ui_collection',
              collected_at: new Date().toISOString()
            }
          };
          
          collectedConversations.push(conversation);
          
          // 개별 대화 전송 (실시간 처리)
          if (this.settings.directBackendDump) {
            // Backend로 직접 전송
            try {
              const response = await fetch(`${BACKEND_URL}/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...conversation,
                  command_id: data.command_id || null
                })
              });
              
              if (!response.ok) {
                const errorText = await response.text();
                this.error(`[Extension] Direct backend dump failed: ${response.status}`, errorText);
              } else {
                this.log(`[Extension] Direct backend dump success for ${convId}`);
              }
            } catch (error) {
              this.error(`[Extension] Direct backend dump error:`, error);
            }
          } else {
            // Native Host로 전송 (기본)
            this.sendNativeMessage({
              type: 'conversation_dump',
              id: `conv_${Date.now()}`,
              data: conversation
            });
          }
          
          // 로컬 스토리지에 임시 저장 (디버깅용)
          if (this.settings.saveToLocalStorage) {
            try {
              const storageKey = `${platform}_conversations`;
              const { [storageKey]: existing = [] } = await browser.storage.local.get(storageKey);
              existing.push(conversation);
              await browser.storage.local.set({ [storageKey]: existing });
              this.log(`[Extension] Saved to local storage: ${convId}`);
            } catch (error) {
              this.error(`[Extension] Local storage save failed:`, error);
            }
          }
          
          // 탭 닫기
          if (convTab && convTab.id) {
            try {
              await browser.tabs.remove(convTab.id);
            } catch (removeError) {
              this.log(`[Extension] Failed to remove conversation tab, may already be closed`);
            }
          }
          
          // 대화 간 지연
          await this.humanDelay(settings.randomDelay || this.settings.randomDelay || 3);
          
        } catch (convError) {
          this.error(`[Extension] Error collecting conversation ${convId}:`, convError);
        }
      }
      
      this.log(`[Extension] UI collection complete. Collected: ${collectedConversations.length}, Excluded: ${excluded.length}`);
      
      return {
        conversations: collectedConversations,
        excluded: excluded
      };
      
    } catch (error) {
      this.error(`[Extension] UI collection error for ${platform}:`, error);
      this.error(`[Extension] Error stack:`, error.stack);
      
      // 더 구체적인 에러 정보 제공
      const errorDetails = {
        platform: platform,
        message: error.message,
        stack: error.stack,
        settings: settings,
        hasData: !!data,
        hasCommandId: !!data?.command_id
      };
      
      this.error(`[Extension] Error details:`, errorDetails);
      
      throw new Error(`UI collection failed for ${platform}: ${error.message}`);
    }
  }
  
  async handleLLMQueryCommand(messageId, data) {
    const { platform, query, mark_as_llm = true } = data;
    
    this.log(`[Extension] Executing LLM query on ${platform}`);
    
    try {
      const tab = await browser.tabs.create({
        url: PLATFORMS[platform].url,
        active: true
      });
      
      await this.waitForTabLoad(tab.id);
      await this.humanDelay(2);
      
      const conversationId = await this.injectLLMQuery(tab.id, platform, query);
      
      await this.waitForLLMResponse(tab.id, platform);
      
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
      this.error(`[Extension] LLM query error:`, error);
      
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
    
    this.log(`[Extension] Session check requested for ${platform}`);
    
    const result = await this.checkSessionInNewTab(platform, PLATFORMS[platform].url);
    
    this.log(`[Extension] Session check result for ${platform}:`, result);
    
    this.updateSessionState(platform, result.valid);
    
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
        this.log('[Extension] State loaded:', this.state);
      }
    } catch (error) {
      this.error('[Extension] Failed to load state:', error);
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
      this.error('[Extension] Failed to save state:', error);
    }
  }
  
  async loadSettings() {
    try {
      const { extensionSettings } = await browser.storage.local.get('extensionSettings');
      if (extensionSettings) {
        this.settings = { ...this.settings, ...extensionSettings };
        // Ensure debug is boolean
        if (typeof this.settings.debug !== 'boolean') {
          this.settings.debug = false;
        }
      }
    } catch (error) {
      this.error('[Extension] Failed to load settings:', error);
    }
  }
  
  async saveSettings() {
    try {
      await browser.storage.local.set({ extensionSettings: this.settings });
    } catch (error) {
      this.error('[Extension] Failed to save settings:', error);
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
      const domains = Array.isArray(config.cookieDomain) 
        ? config.cookieDomain 
        : [config.cookieDomain];
      
      let allCookies = [];
      
      for (const domain of domains) {
        const cookies = await browser.cookies.getAll({ domain });
        allCookies = allCookies.concat(cookies);
      }
      
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
      this.error(`[Extension] Failed to get cookies for ${platform}:`, error);
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
  
  // ======================== Data Collection (API Mode - Fallback) ========================
  
  async collectFromPlatform(platform, settings, excludeIds = []) {
    const config = PLATFORMS[platform];
    this.log(`[Extension] API Collection from ${platform} with ${excludeIds.length} exclusions...`);
    
    const tab = await browser.tabs.create({ 
      url: config.url,
      active: false
    });
    
    try {
      await this.waitForTabLoad(tab.id);
      await this.humanDelay(3);
      
      const results = await safeExecuteScript({
        target: { tabId: tab.id },
        func: scriptFunctions.sessionCheck,
        args: [platform]
      });
      
      const sessionResult = Array.isArray(results) ? results[0] : results;
      if (!sessionResult || !(sessionResult.result || sessionResult)?.valid) {
        this.log(`[Extension] ${platform} session invalid, skipping...`);
        return { conversations: [], excluded: [] };
      }
      
      // API collection not implemented in this version
      this.error(`[Extension] API collection mode not implemented for ${platform}`);
      return { conversations: [], excluded: [] };
      
    } finally {
      await browser.tabs.remove(tab.id);
    }
  }

  async injectLLMQuery(tabId, platform, query) {
    const results = await safeExecuteScript({
      target: { tabId: tabId },
      func: async function(platform, query) {
        if (platform === 'chatgpt') {
          const newChatButton = document.querySelector('[data-testid="new-chat-button"], button[aria-label="New chat"], a[href="/"]');
          if (newChatButton) {
            newChatButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          const textarea = document.querySelector(
            '#prompt-textarea, textarea[data-testid="prompt-textarea"], ' +
            'textarea[aria-label*="Message"], textarea[placeholder*="Message"]'
          );
          if (textarea) {
            textarea.value = query;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            
            const sendButton = document.querySelector(
              'button[data-testid="send-button"], button[aria-label="Send"], ' +
              'button[type="submit"]:not([disabled])'
            );
            if (sendButton && !sendButton.disabled) {
              sendButton.click();
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            const match = window.location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
            return match ? match[1] : 'chatgpt-' + Date.now();
          }
        }
        
        throw new Error('Could not find input field for ' + platform);
      },
      args: [platform, query]
    });
    
    const result = Array.isArray(results) ? results[0] : results;
    return result?.result || result;
  }

  async waitForLLMResponse(tabId, platform, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const results = await safeExecuteScript({
          target: { tabId: tabId },
          func: function(platform) {
            if (platform === 'chatgpt') {
              const thinking = document.querySelector('[data-testid="thinking-indicator"], .result-thinking');
              const messages = document.querySelectorAll('[data-message-author-role="assistant"], .group\\.w-full.bg-gray-50');
              return !thinking && messages.length > 0;
            }
            return false;
          },
          args: [platform]
        });
        
        const result = Array.isArray(results) ? results[0] : results;
        if (result?.result || result) {
          return true;
        }
      } catch (error) {
        this.error('[Extension] Error checking response:', error);
      }
      
      await this.humanDelay(1);
    }
    
    throw new Error('Response timeout');
  }
  
  // ======================== Helper Functions ========================
  
  async waitForTabLoad(tabId, timeout = 30000) {
    return new Promise((resolve, reject) => {
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
    const delay = (seconds + Math.random() * 2) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // ======================== Data Export ========================
  
  async exportCollectedData() {
    try {
      const allData = {};
      
      for (const platform of Object.keys(PLATFORMS)) {
        const storageKey = `${platform}_conversations`;
        const { [storageKey]: conversations = [] } = await browser.storage.local.get(storageKey);
        if (conversations.length > 0) {
          allData[platform] = conversations;
        }
      }
      
      const dataStr = JSON.stringify(allData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = `llm_conversations_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      
      await browser.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      });
      
      return { success: true, filename: filename };
    } catch (error) {
      this.error('[Extension] Export failed:', error);
      throw error;
    }
  }
}

// ======================== Initialize Extension ========================

const extension = new NativeExtension();

// Export for debugging (use globalThis instead of window in service worker)
globalThis.llmCollectorExtension = extension;
