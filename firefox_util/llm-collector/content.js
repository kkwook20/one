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
    
    // Platform-specific configurations
    this.platformConfigs = {
      chatgpt: {
        loginSelectors: ['[data-testid="profile-button"]', 'nav button img'],
        loginPageIndicators: ['[data-testid="login-button"]', '[href*="/auth/login"]'],
        apiEndpoint: 'https://chat.openai.com/backend-api/accounts/check',
        detectLoginSuccess: () => this.detectChatGPTLogin()
      },
      claude: {
        loginSelectors: ['[class*="chat"]', '[data-testid="user-menu"]'],
        loginPageIndicators: ['button[aria-label="Log in"]', '[href*="/login"]'],
        apiEndpoint: 'https://claude.ai/api/organizations',
        detectLoginSuccess: () => this.detectClaudeLogin()
      },
      gemini: {
        loginSelectors: ['[aria-label*="Google Account"]'],
        loginPageIndicators: ['a[href*="accounts.google.com"]'],
        apiEndpoint: 'https://gemini.google.com/app',
        detectLoginSuccess: () => this.detectGeminiLogin()
      },
      deepseek: {
        loginSelectors: ['[class*="avatar"]'],
        loginPageIndicators: ['[class*="login"]'],
        apiEndpoint: 'https://chat.deepseek.com/api/v0/user/info',
        detectLoginSuccess: () => this.detectDeepSeekLogin()
      },
      grok: {
        loginSelectors: ['[data-testid="SideNav_AccountSwitcher_Button"]'],
        loginPageIndicators: ['[data-testid="LoginForm"]'],
        apiEndpoint: 'https://grok.x.ai/api/user',
        detectLoginSuccess: () => this.detectGrokLogin()
      },
      perplexity: {
        loginSelectors: ['[class*="profile"]'],
        loginPageIndicators: ['button[aria-label="Sign in"]'],
        apiEndpoint: 'https://www.perplexity.ai/api/auth/session',
        detectLoginSuccess: () => this.detectPerplexityLogin()
      }
    };
  }

  // Check current session status
  async checkCurrentSession() {
    const config = this.platformConfigs[this.platform];
    if (!config) return { valid: false };

    try {
      // First check DOM for login indicators
      const isLoginPage = this.isOnLoginPage();
      if (isLoginPage) {
        return { valid: false, source: 'login_page' };
      }

      // Check for logged-in indicators
      const hasLoginIndicators = this.hasLoginIndicators();
      
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

      return { 
        valid: hasLoginIndicators, 
        source: 'dom_check' 
      };
      
    } catch (error) {
      console.error(`[Content] Session check error:`, error);
      return { valid: false, error: error.message };
    }
  }

  // Check if on login page
  isOnLoginPage() {
    const config = this.platformConfigs[this.platform];
    if (!config) return false;

    for (const selector of config.loginPageIndicators) {
      if (document.querySelector(selector)) {
        return true;
      }
    }

    // URL-based checks
    const pathname = window.location.pathname;
    if (this.platform === 'chatgpt' && pathname.includes('/auth')) return true;
    if (this.platform === 'claude' && pathname === '/') {
      // Claude specific: check if it's the landing page
      return !document.querySelector('[class*="conversation"]');
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

  // Start monitoring for login
  startLoginDetection() {
    if (this.loginDetectionRunning) return;
    
    const config = this.platformConfigs[this.platform];
    if (!config || !config.detectLoginSuccess) return;

    console.log(`[Content] Starting login detection for ${this.platform}`);
    this.loginDetectionRunning = true;

    config.detectLoginSuccess().then(success => {
      this.loginDetectionRunning = false;
      
      if (success) {
        console.log(`[Content] Login successful for ${this.platform}`);
        
        // Send update to background
        browser.runtime.sendMessage({
          type: 'sessionUpdate',
          platform: this.platform,
          valid: true,
          source: 'login_detection'
        }).catch(e => console.error('[Content] Failed to send login success:', e));
      }
    });
  }

  // Platform-specific login detection methods
  detectChatGPTLogin() {
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 60; // 1 minute
      
      const interval = setInterval(() => {
        checkCount++;
        
        // Check for ChatGPT main UI elements
        const mainUI = document.querySelector('main .flex-col') || 
                      document.querySelector('[data-testid="conversation-panel"]') ||
                      document.querySelector('textarea[data-id="root"]');
        
        if (mainUI) {
          console.log('[Content] ChatGPT UI detected');
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
      const maxChecks = 60;
      
      const interval = setInterval(() => {
        checkCount++;
        
        // Check for Claude chat UI
        const chatUI = document.querySelector('[data-testid="composer"]') ||
                      document.querySelector('.conversation-container') ||
                      document.querySelector('[class*="ChatMessageInput"]');
        
        if (chatUI) {
          console.log('[Content] Claude UI detected');
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
      const maxChecks = 60;
      
      const interval = setInterval(() => {
        checkCount++;
        
        // Check for Gemini chat UI
        const chatUI = document.querySelector('[aria-label="Message Gemini"]') ||
                      document.querySelector('.chat-container') ||
                      document.querySelector('[class*="conversation-turn"]');
        
        if (chatUI && !document.querySelector('a[href*="accounts.google.com"]')) {
          console.log('[Content] Gemini UI detected');
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
      const maxChecks = 60;
      
      const interval = setInterval(() => {
        checkCount++;
        
        const chatUI = document.querySelector('[class*="chat-input"]') ||
                      document.querySelector('[class*="message-list"]');
        
        if (chatUI) {
          console.log('[Content] DeepSeek UI detected');
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
      const maxChecks = 60;
      
      const interval = setInterval(() => {
        checkCount++;
        
        const chatUI = document.querySelector('[data-testid="MessageComposer"]') ||
                      document.querySelector('[class*="ConversationView"]');
        
        if (chatUI) {
          console.log('[Content] Grok UI detected');
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
      const maxChecks = 60;
      
      const interval = setInterval(() => {
        checkCount++;
        
        const chatUI = document.querySelector('[class*="SearchBar"]') ||
                      document.querySelector('[class*="ThreadView"]');
        
        if (chatUI && !document.querySelector('button[aria-label="Sign in"]')) {
          console.log('[Content] Perplexity UI detected');
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
}

// ======================== Initialize ========================

if (PLATFORM) {
  console.log(`[LLM Collector Content] Detected platform: ${PLATFORM}`);
  
  // Create session checker
  sessionChecker = new SessionChecker();
  
  // Initial session check
  sessionChecker.checkCurrentSession().then(result => {
    console.log(`[Content] Initial session check:`, result);
    
    // Notify background
    browser.runtime.sendMessage({
      type: 'sessionUpdate',
      platform: PLATFORM,
      ...result,
      source: 'content_init'
    }).catch(e => console.error('[Content] Failed to send initial status:', e));
    
    // Start login detection if needed
    if (!result.valid && sessionChecker.isOnLoginPage()) {
      sessionChecker.startLoginDetection();
    }
  });
  
  // Monitor for session changes
  const observer = new MutationObserver(() => {
    // Check if session state might have changed
    sessionChecker.checkCurrentSession().then(result => {
      if (JSON.stringify(result) !== JSON.stringify(sessionChecker.lastSessionState)) {
        sessionChecker.lastSessionState = result;
        
        console.log(`[Content] Session state changed:`, result);
        
        // Notify background
        browser.runtime.sendMessage({
          type: 'sessionUpdate',
          platform: PLATFORM,
          ...result,
          source: 'content_monitor'
        }).catch(e => console.error('[Content] Failed to send update:', e));
        
        // Start login detection if moved to login page
        if (!result.valid && sessionChecker.isOnLoginPage() && !sessionChecker.loginDetectionRunning) {
          sessionChecker.startLoginDetection();
        }
      }
    });
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
    if (!document.hidden) {
      // Re-check session when tab becomes visible
      sessionChecker.checkCurrentSession().then(result => {
        browser.runtime.sendMessage({
          type: 'sessionUpdate',
          platform: PLATFORM,
          ...result,
          source: 'visibility_change'
        }).catch(() => {});
      });
    }
  });
}