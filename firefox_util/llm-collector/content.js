// LLM Conversation Collector - Content Script
console.log('[LLM Collector Content] Loaded on:', window.location.hostname);

// Platform detection
const PLATFORM = detectPlatform();

// Session checker instance
let sessionChecker = null;

function detectPlatform() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('chat.openai.com')) return 'chatgpt';
  if (hostname.includes('claude.ai')) return 'claude';
  if (hostname.includes('gemini.google.com')) return 'gemini';
  if (hostname.includes('chat.deepseek.com')) return 'deepseek';
  if (hostname.includes('grok.x.ai')) return 'grok';
  if (hostname.includes('perplexity.ai')) return 'perplexity';
  
  return null;
}

// ======================== Session Checker Class ========================
class SessionChecker {
  constructor() {
    this.platform = PLATFORM;
    this.loginDetectionRunning = false;
    this.lastSessionState = null;
    this.loginDetectionTimeout = null;
    this.sessionCheckDebounce = null;
    
    // Platform-specific configurations
    this.platformConfigs = {
      chatgpt: {
        loginSelectors: ['[data-testid="profile-button"]', 'nav button img'],
        loginPageIndicators: ['[data-testid="login-button"]', '[href*="/auth/login"]', 'input[name="username"]'],
        chatUISelectors: ['textarea[data-id="root"]', '[data-testid="conversation-panel"]', 'main .flex-col'],
        loginUrls: ['/auth/login', '/auth/', '/login'],
        apiEndpoint: 'https://chat.openai.com/backend-api/accounts/check',
        detectLoginSuccess: () => this.detectChatGPTLogin()
      },
      claude: {
        loginSelectors: ['[class*="chat"]', '[data-testid="user-menu"]'],
        loginPageIndicators: ['button[aria-label="Log in"]', '[href*="/login"]', 'input[type="email"]'],
        chatUISelectors: ['[data-testid="composer"]', '.conversation-container', '[class*="ChatMessageInput"]'],
        loginUrls: ['/login', '/'],
        apiEndpoint: 'https://claude.ai/api/organizations',
        detectLoginSuccess: () => this.detectClaudeLogin()
      },
      gemini: {
        loginSelectors: ['[aria-label*="Google Account"]'],
        loginPageIndicators: ['a[href*="accounts.google.com"]'],
        chatUISelectors: ['[aria-label="Message Gemini"]', '.chat-container', '[class*="conversation-turn"]'],
        loginUrls: ['/auth', '/signin'],
        apiEndpoint: 'https://gemini.google.com/app',
        detectLoginSuccess: () => this.detectGeminiLogin()
      },
      deepseek: {
        loginSelectors: ['[class*="avatar"]'],
        loginPageIndicators: ['[class*="login"]', 'input[type="password"]'],
        chatUISelectors: ['[class*="chat-input"]', '[class*="message-list"]'],
        loginUrls: ['/login', '/auth'],
        apiEndpoint: 'https://chat.deepseek.com/api/v0/user/info',
        detectLoginSuccess: () => this.detectDeepSeekLogin()
      },
      grok: {
        loginSelectors: ['[data-testid="SideNav_AccountSwitcher_Button"]'],
        loginPageIndicators: ['[data-testid="LoginForm"]'],
        chatUISelectors: ['[data-testid="MessageComposer"]', '[class*="ConversationView"]'],
        loginUrls: ['/login', '/auth'],
        apiEndpoint: 'https://grok.x.ai/api/user',
        detectLoginSuccess: () => this.detectGrokLogin()
      },
      perplexity: {
        loginSelectors: ['[class*="profile"]'],
        loginPageIndicators: ['button[aria-label="Sign in"]'],
        chatUISelectors: ['[class*="SearchBar"]', '[class*="ThreadView"]'],
        loginUrls: ['/login', '/signin'],
        apiEndpoint: 'https://www.perplexity.ai/api/auth/session',
        detectLoginSuccess: () => this.detectPerplexityLogin()
      }
    };
  }

  // Check current session status with debounce
  async checkCurrentSession() {
    // Skip check if on login page
    if (this.isOnLoginPage()) {
      return { valid: false, source: 'login_page', skipped: true };
    }

    const config = this.platformConfigs[this.platform];
    if (!config) return { valid: false };

    try {
      // Check if chat UI is fully loaded
      const hasChatUI = this.hasChatUI();
      
      // Only check session if chat UI is present
      if (!hasChatUI) {
        return { valid: false, source: 'no_chat_ui' };
      }

      // Try API check if available
      if (config.apiEndpoint) {
        try {
          const response = await fetch(config.apiEndpoint, {
            method: 'GET',
            credentials: 'include',
            redirect: 'manual'
          });
          
          if (response.ok) {
            return { 
              valid: true, 
              source: 'api_check',
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            };
          }
        } catch (e) {
          console.error(`[Content] API check failed:`, e);
        }
      }

      // Check for login indicators only if chat UI exists
      const hasLoginIndicators = this.hasLoginIndicators();
      
      return { 
        valid: hasChatUI && hasLoginIndicators, 
        source: 'dom_check' 
      };
      
    } catch (error) {
      console.error(`[Content] Session check error:`, error);
      return { valid: false, error: error.message };
    }
  }

  // Check if chat UI is loaded
  hasChatUI() {
    const config = this.platformConfigs[this.platform];
    if (!config || !config.chatUISelectors) return false;

    for (const selector of config.chatUISelectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }
    return false;
  }

  // Check if on login page
  isOnLoginPage() {
    const config = this.platformConfigs[this.platform];
    if (!config) return false;

    // URL-based checks first
    const pathname = window.location.pathname;
    for (const loginUrl of config.loginUrls || []) {
      if (pathname.includes(loginUrl)) {
        return true;
      }
    }

    // DOM-based checks
    for (const selector of config.loginPageIndicators) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    // Platform specific checks
    if (this.platform === 'claude' && pathname === '/' && !this.hasChatUI()) {
      return true; // Claude landing page
    }

    return false;
  }

  // Check for logged-in indicators
  hasLoginIndicators() {
    const config = this.platformConfigs[this.platform];
    if (!config) return false;

    for (const selector of config.loginSelectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    return false;
  }

  // Start monitoring for login with delay
  startLoginDetection() {
    if (this.loginDetectionRunning) return;
    
    const config = this.platformConfigs[this.platform];
    if (!config || !config.detectLoginSuccess) return;

    console.log(`[Content] Starting login detection for ${this.platform}`);
    this.loginDetectionRunning = true;

    // Clear any existing timeout
    if (this.loginDetectionTimeout) {
      clearTimeout(this.loginDetectionTimeout);
    }

    // Add delay before starting detection
    this.loginDetectionTimeout = setTimeout(() => {
      config.detectLoginSuccess().then(success => {
        this.loginDetectionRunning = false;
        
        if (success) {
          console.log(`[Content] Login successful for ${this.platform}`);
          
          // Double check that we have chat UI before confirming login
          if (this.hasChatUI()) {
            browser.runtime.sendMessage({
              type: 'sessionUpdate',
              platform: this.platform,
              valid: true,
              source: 'login_detection'
            }).catch(e => console.error('[Content] Failed to send login success:', e));
          }
        }
      });
    }, 2000); // 2 second delay
  }

  // Platform-specific login detection methods
  detectChatGPTLogin() {
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 120; // 2 minutes
      
      const interval = setInterval(() => {
        checkCount++;
        
        // Check URL first
        if (window.location.pathname.includes('/auth')) {
          // Still on auth page
          return;
        }
        
        // Check for ChatGPT main UI elements
        const mainUI = document.querySelector('textarea[data-id="root"]') || 
                      document.querySelector('[data-testid="conversation-panel"]');
        
        const profileButton = document.querySelector('[data-testid="profile-button"]');
        
        if (mainUI && profileButton && !window.location.pathname.includes('/auth')) {
          console.log('[Content] ChatGPT UI fully loaded');
          clearInterval(interval);
          resolve(true);
        }
        
        if (checkCount >= maxChecks) {
          clearInterval(interval);
          resolve(false);
        }
      }, 1000);
    });
  }

  detectClaudeLogin() {
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 120;
      
      const interval = setInterval(() => {
        checkCount++;
        
        // Skip if still on login page
        if (this.isOnLoginPage()) {
          return;
        }
        
        // Check for Claude chat UI
        const chatUI = document.querySelector('[data-testid="composer"]') ||
                      document.querySelector('[class*="ChatMessageInput"]');
        
        const userMenu = document.querySelector('[data-testid="user-menu"]');
        
        if (chatUI && userMenu) {
          console.log('[Content] Claude UI fully loaded');
          clearInterval(interval);
          resolve(true);
        }
        
        if (checkCount >= maxChecks) {
          clearInterval(interval);
          resolve(false);
        }
      }, 1000);
    });
  }

  detectGeminiLogin() {
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 120;
      
      const interval = setInterval(() => {
        checkCount++;
        
        // Check for Gemini chat UI
        const chatUI = document.querySelector('[aria-label="Message Gemini"]');
        const accountButton = document.querySelector('[aria-label*="Google Account"]');
        
        if (chatUI && accountButton && !document.querySelector('a[href*="accounts.google.com"]')) {
          console.log('[Content] Gemini UI fully loaded');
          clearInterval(interval);
          resolve(true);
        }
        
        if (checkCount >= maxChecks) {
          clearInterval(interval);
          resolve(false);
        }
      }, 1000);
    });
  }

  detectDeepSeekLogin() {
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 120;
      
      const interval = setInterval(() => {
        checkCount++;
        
        const chatUI = document.querySelector('[class*="chat-input"]');
        const avatar = document.querySelector('[class*="avatar"]');
        
        if (chatUI && avatar && !this.isOnLoginPage()) {
          console.log('[Content] DeepSeek UI fully loaded');
          clearInterval(interval);
          resolve(true);
        }
        
        if (checkCount >= maxChecks) {
          clearInterval(interval);
          resolve(false);
        }
      }, 1000);
    });
  }

  detectGrokLogin() {
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 120;
      
      const interval = setInterval(() => {
        checkCount++;
        
        const chatUI = document.querySelector('[data-testid="MessageComposer"]');
        const accountButton = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        
        if (chatUI && accountButton) {
          console.log('[Content] Grok UI fully loaded');
          clearInterval(interval);
          resolve(true);
        }
        
        if (checkCount >= maxChecks) {
          clearInterval(interval);
          resolve(false);
        }
      }, 1000);
    });
  }

  detectPerplexityLogin() {
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 120;
      
      const interval = setInterval(() => {
        checkCount++;
        
        const searchBar = document.querySelector('[class*="SearchBar"]');
        const profile = document.querySelector('[class*="profile"]');
        
        if (searchBar && profile && !document.querySelector('button[aria-label="Sign in"]')) {
          console.log('[Content] Perplexity UI fully loaded');
          clearInterval(interval);
          resolve(true);
        }
        
        if (checkCount >= maxChecks) {
          clearInterval(interval);
          resolve(false);
        }
      }, 1000);
    });
  }

  // Debounced session check
  debouncedSessionCheck() {
    if (this.sessionCheckDebounce) {
      clearTimeout(this.sessionCheckDebounce);
    }

    this.sessionCheckDebounce = setTimeout(() => {
      this.checkCurrentSession().then(result => {
        if (JSON.stringify(result) !== JSON.stringify(this.lastSessionState)) {
          this.lastSessionState = result;
          
          console.log(`[Content] Session state changed:`, result);
          
          // Only send update if not skipped
          if (!result.skipped) {
            browser.runtime.sendMessage({
              type: 'sessionUpdate',
              platform: PLATFORM,
              ...result,
              source: 'content_monitor'
            }).catch(e => console.error('[Content] Failed to send update:', e));
          }
          
          // Start login detection if moved to login page
          if (!result.valid && this.isOnLoginPage() && !this.loginDetectionRunning) {
            this.startLoginDetection();
          }
        }
      });
    }, 1000); // 1 second debounce
  }
}

// ======================== Initialize ========================

if (PLATFORM) {
  console.log(`[LLM Collector Content] Detected platform: ${PLATFORM}`);
  
  // Create session checker
  sessionChecker = new SessionChecker();
  
  // Delay initial check
  setTimeout(() => {
    sessionChecker.checkCurrentSession().then(result => {
      console.log(`[Content] Initial session check:`, result);
      
      // Notify background only if not on login page
      if (!result.skipped) {
        browser.runtime.sendMessage({
          type: 'sessionUpdate',
          platform: PLATFORM,
          ...result,
          source: 'content_init'
        }).catch(e => console.error('[Content] Failed to send initial status:', e));
      }
      
      // Start login detection if needed
      if (!result.valid && sessionChecker.isOnLoginPage()) {
        sessionChecker.startLoginDetection();
      }
    });
  }, 3000); // 3 second initial delay
  
  // Monitor for session changes with debounce
  const observer = new MutationObserver(() => {
    sessionChecker.debouncedSessionCheck();
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Listen for messages from background
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'checkPlatform') {
      sendResponse({ platform: PLATFORM, url: window.location.href });
    }
    
    if (message.action === 'checkSession') {
      sessionChecker.checkCurrentSession().then(result => {
        sendResponse({
          platform: PLATFORM,
          ...result
        });
      });
      return true; // Async response
    }
  });
  
  // Handle visibility changes
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !sessionChecker.isOnLoginPage()) {
      // Re-check session when tab becomes visible (not on login page)
      setTimeout(() => {
        sessionChecker.checkCurrentSession().then(result => {
          if (!result.skipped) {
            browser.runtime.sendMessage({
              type: 'sessionUpdate',
              platform: PLATFORM,
              ...result,
              source: 'visibility_change'
            }).catch(() => {});
          }
        });
      }, 1000);
    }
  });
}