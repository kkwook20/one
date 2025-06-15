// Firefox Extension - background.js (완전 자율 동작 버전)
console.log('[LLM Collector] Extension loaded at', new Date().toISOString());

// ======================== Configuration ========================
const DEFAULT_API_URL = 'http://localhost:8000/api/argosa';

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
class AutonomousExtension {
  constructor() {
    this.mode = 'standalone';  // standalone, connected
    this.backendUrl = DEFAULT_API_URL;
    this.settings = this.getDefaultSettings();
    this.state = {
      sessions: {},
      syncStatus: null,
      lastHeartbeat: null
    };
    this.processedCommands = new Set();
    this.collectionLock = false;
    
    // Initialize
    this.init();
  }
  
  getDefaultSettings() {
    return {
      maxConversations: 20,
      randomDelay: 5,
      minCheckGap: 30000,
      heartbeatInterval: 10000,
      backendCheckInterval: 5000
    };
  }
  
  async init() {
    console.log('[Extension] Initializing autonomous extension...');
    
    // Load saved state
    await this.loadState();
    
    // Start backend connection attempts
    this.startBackendConnection();
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Setup URL command listener
    this.setupCommandListener();
    
    // Setup scheduled collection (3 days)
    this.setupScheduledCollection();
    
    // Start resource management
    this.startResourceManagement();
    
    console.log('[Extension] Initialization complete');
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
  
  // ======================== Backend Connection ========================
  
  async startBackendConnection() {
    // Try to connect to backend
    await this.checkBackendConnection();
    
    // Keep trying periodically
    setInterval(() => {
      if (this.mode === 'standalone') {
        this.checkBackendConnection();
      }
    }, this.settings.backendCheckInterval);
  }
  
  async checkBackendConnection() {
    try {
      const response = await fetch(`${this.backendUrl}/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        if (this.mode === 'standalone') {
          console.log('[Extension] Backend connection established');
          this.mode = 'connected';
          await this.onBackendReconnected();
        }
        return true;
      }
    } catch (error) {
      // Silent fail - backend not available
    }
    
    if (this.mode === 'connected') {
      console.log('[Extension] Backend connection lost');
      this.mode = 'standalone';
    }
    return false;
  }
  
  async onBackendReconnected() {
    console.log('[Extension] Syncing with backend...');
    
    // Update settings
    await this.updateSettings();
    
    // Send current session states
    await this.reportAllSessions();
    
    // Process any pending data
    await this.processPendingData();
  }
  
  // ======================== Heartbeat System ========================
  
  async startHeartbeat() {
    setInterval(() => {
      this.sendHeartbeat();
    }, this.settings.heartbeatInterval);
  }
  
  async sendHeartbeat() {
    const heartbeat = {
      timestamp: new Date().toISOString(),
      status: 'active',
      firefox_pid: null, // Would need native messaging for real PID
      sessions: this.getSessionStates(),
      version: '2.0'
    };
    
    this.state.lastHeartbeat = heartbeat.timestamp;
    
    if (this.mode === 'connected') {
      try {
        await fetch(`${this.backendUrl}/extension/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(heartbeat)
        });
      } catch (error) {
        // Silent fail
      }
    }
  }
  
  getSessionStates() {
    const states = {};
    for (const platform of Object.keys(PLATFORMS)) {
      states[platform] = this.state.sessions[platform]?.valid || false;
    }
    return states;
  }
  
  // ======================== Command Handling ========================
  
  setupCommandListener() {
    // Listen for URL commands
    browser.tabs.onCreated.addListener(async (tab) => {
      if (!tab.url || !tab.url.includes('#llm-sync-')) {
        return;
      }
      
      try {
        // Extract and decode command
        const encodedCommand = tab.url.split('#llm-sync-')[1];
        const command = JSON.parse(atob(encodedCommand));
        
        // Close the tab immediately
        await browser.tabs.remove(tab.id);
        
        // Validate and execute command
        if (this.validateCommand(command)) {
          await this.executeCommand(command);
        }
      } catch (error) {
        console.error('[Extension] Invalid command:', error);
      }
    });
    
    // Also check for commands from backend (fallback)
    if (this.mode === 'connected') {
      setInterval(() => this.checkBackendCommands(), 2000);
    }
  }
  
  validateCommand(command) {
    // Check timestamp (5 minutes window)
    const commandTime = new Date(command.timestamp);
    const now = new Date();
    if (now - commandTime > 300000) {
      console.log('[Extension] Command expired');
      return false;
    }
    
    // Check if already processed
    const commandKey = `${command.action}-${command.sync_id || command.timestamp}`;
    if (this.processedCommands.has(commandKey)) {
      console.log('[Extension] Command already processed');
      return false;
    }
    
    this.processedCommands.add(commandKey);
    return true;
  }
  
  async executeCommand(command) {
    console.log('[Extension] Executing command:', command.action);
    
    switch (command.action) {
      case 'sync':
        await this.startCollection(command);
        break;
        
      case 'check_session':
        await this.checkSessionCommand(command.data.platform);
        break;
        
      case 'update_settings':
        this.settings = { ...this.settings, ...command.data };
        await this.saveSettings();
        break;
        
      default:
        console.warn('[Extension] Unknown command:', command.action);
    }
  }
  
  async checkBackendCommands() {
    if (this.mode !== 'connected') return;
    
    try {
      const response = await fetch(`${this.backendUrl}/commands/next`);
      if (response.ok) {
        const command = await response.json();
        if (command.type !== 'none') {
          await this.handleBackendCommand(command);
        }
      }
    } catch (error) {
      // Silent fail
    }
  }
  
  async handleBackendCommand(command) {
    console.log('[Extension] Backend command:', command.type);
    
    let result = null;
    
    switch (command.type) {
      case 'check_session_now':
        const isValid = await this.checkSessionDirect(command.data.platform);
        result = {
          valid: isValid,
          checked_at: new Date().toISOString()
        };
        break;
        
      case 'cancel_sync':
        this.collectionLock = false;
        result = { cancelled: true };
        break;
    }
    
    // Send response
    if (result && command.id) {
      try {
        await fetch(`${this.backendUrl}/commands/response/${command.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        });
      } catch (error) {
        // Silent fail
      }
    }
  }
  
  // ======================== Session Management ========================
  
  async checkSessionDirect(platform) {
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
    
    // Report to backend if connected
    if (this.mode === 'connected') {
      this.reportSessionUpdate(platform, valid);
    }
  }
  
  async reportSessionUpdate(platform, valid) {
    try {
      await fetch(`${this.backendUrl}/sessions/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, valid })
      });
    } catch (error) {
      // Silent fail
    }
  }
  
  async reportAllSessions() {
    for (const platform of Object.keys(PLATFORMS)) {
      const session = this.state.sessions[platform];
      if (session) {
        await this.reportSessionUpdate(platform, session.valid);
      }
    }
  }
  
  // ======================== Data Collection ========================
  
  async startCollection(command) {
    if (this.collectionLock) {
      console.log('[Extension] Collection already in progress');
      return;
    }
    
    this.collectionLock = true;
    console.log('[Extension] Starting collection...', command);
    
    const syncId = command.sync_id || `manual-${Date.now()}`;
    const platforms = command.platforms || [];
    const settings = command.settings || {};
    
    try {
      await this.updateProgress(syncId, {
        status: 'starting',
        progress: 0,
        message: 'Initializing collection...'
      });
      
      let totalCollected = 0;
      const progressPerPlatform = 100 / platforms.length;
      
      for (let i = 0; i < platforms.length; i++) {
        const platformConfig = platforms[i];
        const platform = platformConfig.platform || platformConfig;
        
        if (!PLATFORMS[platform]) {
          console.warn(`[Extension] Unknown platform: ${platform}`);
          continue;
        }
        
        await this.updateProgress(syncId, {
          status: 'collecting',
          progress: Math.round(i * progressPerPlatform),
          current_platform: platform,
          collected: totalCollected,
          message: `Collecting from ${PLATFORMS[platform].name}...`
        });
        
        try {
          const result = await this.collectFromPlatform(platform, settings);
          totalCollected += result.collected;
          
          // Save conversations
          if (result.collected > 0) {
            await this.saveConversations(platform, result.conversations);
          }
        } catch (error) {
          console.error(`[Extension] Error collecting from ${platform}:`, error);
        }
        
        // Delay between platforms
        if (i < platforms.length - 1) {
          await this.humanDelay(settings.randomDelay || 5);
        }
      }
      
      await this.updateProgress(syncId, {
        status: 'completed',
        progress: 100,
        collected: totalCollected,
        message: 'Collection completed successfully'
      });
      
      console.log(`[Extension] Collection completed. Total: ${totalCollected}`);
      
    } catch (error) {
      console.error('[Extension] Collection error:', error);
      
      await this.updateProgress(syncId, {
        status: 'error',
        progress: 0,
        message: error.message || 'Collection failed'
      });
      
    } finally {
      this.collectionLock = false;
    }
  }
  
  async collectFromPlatform(platform, settings) {
    const config = PLATFORMS[platform];
    console.log(`[Extension] Collecting from ${platform}...`);
    
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
        return { collected: 0, conversations: [] };
      }
      
      // Inject collection script
      const results = await browser.tabs.executeScript(tab.id, {
        code: this.getCollectionCode(platform, config, settings)
      });
      
      const result = results[0] || { collected: 0, conversations: [] };
      console.log(`[Extension] Collected ${result.collected} from ${platform}`);
      
      return result;
      
    } finally {
      // Close tab
      await browser.tabs.remove(tab.id);
    }
  }
  
  getCollectionCode(platform, config, settings) {
    return `
      (async function() {
        console.log('[Collector] Starting collection for ${platform}...');
        
        const conversations = [];
        const limit = ${settings.maxConversations || 20};
        
        try {
          // Platform-specific collection logic
          if ('${platform}' === 'chatgpt') {
            // Try API first
            try {
              const response = await fetch('${config.conversationListUrl}', {
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
              });
              
              if (response.ok) {
                const data = await response.json();
                const items = data.items || [];
                
                for (let i = 0; i < Math.min(items.length, limit); i++) {
                  conversations.push({
                    id: items[i].id,
                    title: items[i].title || 'Untitled',
                    created_at: items[i].create_time || items[i].created_at,
                    updated_at: items[i].update_time || items[i].updated_at
                  });
                }
              }
            } catch (err) {
              console.error('[Collector] API fetch failed:', err);
            }
          }
          else if ('${platform}' === 'claude') {
            try {
              const response = await fetch('${config.conversationListUrl}', {
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
              });
              
              if (response.ok) {
                const data = await response.json();
                const items = data.chats || data.conversations || [];
                
                for (let i = 0; i < Math.min(items.length, limit); i++) {
                  conversations.push({
                    id: items[i].uuid || items[i].id,
                    title: items[i].name || items[i].title || 'Untitled',
                    created_at: items[i].created_at,
                    updated_at: items[i].updated_at
                  });
                }
              }
            } catch (err) {
              console.error('[Collector] API fetch failed:', err);
            }
          }
          // Add other platforms...
          
          return {
            platform: '${platform}',
            collected: conversations.length,
            conversations: conversations
          };
          
        } catch (error) {
          console.error('[Collector] Error:', error);
          return {
            platform: '${platform}',
            collected: 0,
            conversations: [],
            error: error.message
          };
        }
      })();
    `;
  }
  
  async checkTabSession(tabId, platform) {
    try {
      const results = await browser.tabs.executeScript(tabId, {
        code: `
          (function() {
            const config = ${JSON.stringify({
              loginSelectors: PLATFORMS[platform].loginSelectors,
              loginIndicators: PLATFORMS[platform].loginIndicators.map(fn => fn.toString())
            })};
            
            // Check selectors
            for (const selector of config.loginSelectors) {
              try {
                if (document.querySelector(selector)) {
                  return true;
                }
              } catch (e) {}
            }
            
            // Check indicators
            for (const fnStr of config.loginIndicators) {
              try {
                const fn = new Function('return ' + fnStr)();
                if (fn()) return true;
              } catch (e) {}
            }
            
            return false;
          })();
        `
      });
      
      const isLoggedIn = results[0] || false;
      this.updateSessionState(platform, isLoggedIn);
      return isLoggedIn;
      
    } catch (error) {
      console.error(`[Extension] Session check error for ${platform}:`, error);
      return false;
    }
  }
  
  // ======================== Progress Reporting ========================
  
  async updateProgress(syncId, progressData) {
    const fullProgress = {
      sync_id: syncId,
      ...progressData,
      timestamp: new Date().toISOString()
    };
    
    this.state.syncStatus = fullProgress;
    
    if (this.mode === 'connected') {
      try {
        await fetch(`${this.backendUrl}/sync/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullProgress)
        });
      } catch (error) {
        // Queue for later
        await this.queuePendingData('progress', fullProgress);
      }
    }
  }
  
  // ======================== Data Storage ========================
  
  async saveConversations(platform, conversations) {
    const data = {
      platform: platform,
      conversations: conversations,
      timestamp: new Date().toISOString()
    };
    
    if (this.mode === 'connected') {
      try {
        const response = await fetch(`${this.backendUrl}/llm/conversations/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        if (!response.ok) {
          throw new Error(`Save failed: ${response.status}`);
        }
        
        console.log(`[Extension] Saved ${conversations.length} conversations for ${platform}`);
        return;
        
      } catch (error) {
        console.error('[Extension] Failed to save to backend:', error);
      }
    }
    
    // Save locally as fallback
    await this.saveLocally(data);
  }
  
  async saveLocally(data) {
    try {
      const { pendingData = [] } = await browser.storage.local.get('pendingData');
      pendingData.push({
        id: `${Date.now()}-${Math.random()}`,
        type: 'conversations',
        data: data,
        timestamp: new Date().toISOString()
      });
      
      // Keep only last 100 items
      const trimmed = pendingData.slice(-100);
      await browser.storage.local.set({ pendingData: trimmed });
      
      console.log('[Extension] Saved data locally for later sync');
    } catch (error) {
      console.error('[Extension] Failed to save locally:', error);
    }
  }
  
  async queuePendingData(type, data) {
    try {
      const { pendingQueue = [] } = await browser.storage.local.get('pendingQueue');
      pendingQueue.push({
        type: type,
        data: data,
        timestamp: new Date().toISOString()
      });
      
      await browser.storage.local.set({ pendingQueue: pendingQueue.slice(-50) });
    } catch (error) {
      console.error('[Extension] Failed to queue data:', error);
    }
  }
  
  async processPendingData() {
    try {
      const { pendingData = [], pendingQueue = [] } = 
        await browser.storage.local.get(['pendingData', 'pendingQueue']);
      
      // Process pending conversations
      for (const item of pendingData) {
        if (item.type === 'conversations') {
          try {
            await this.saveConversations(item.data.platform, item.data.conversations);
            // Remove if successful
            const index = pendingData.indexOf(item);
            pendingData.splice(index, 1);
          } catch (error) {
            console.error('[Extension] Failed to sync pending data:', error);
          }
        }
      }
      
      // Process other pending items
      for (const item of pendingQueue) {
        // Handle based on type
      }
      
      // Update storage
      await browser.storage.local.set({ pendingData, pendingQueue: [] });
      
    } catch (error) {
      console.error('[Extension] Error processing pending data:', error);
    }
  }
  
  // ======================== Scheduled Collection ========================
  
  setupScheduledCollection() {
    // Use browser alarms for scheduling
    browser.alarms.create('scheduledCollection', {
      periodInMinutes: 60 * 24 * 3  // 3 days
    });
    
    browser.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'scheduledCollection') {
        console.log('[Extension] Scheduled collection triggered');
        
        // Get enabled platforms from saved settings
        const enabledPlatforms = await this.getEnabledPlatforms();
        
        if (enabledPlatforms.length > 0) {
          await this.startCollection({
            action: 'sync',
            sync_id: `scheduled-${Date.now()}`,
            platforms: enabledPlatforms,
            settings: this.settings
          });
        }
      }
    });
  }
  
  async getEnabledPlatforms() {
    // In real implementation, this would come from saved settings
    return ['chatgpt', 'claude'];  // Default enabled platforms
  }
  
  // ======================== Settings Management ========================
  
  async updateSettings() {
    if (this.mode !== 'connected') return;
    
    try {
      const response = await fetch(`${this.backendUrl}/settings/current`);
      if (response.ok) {
        const newSettings = await response.json();
        this.settings = { ...this.settings, ...newSettings };
        await this.saveSettings();
        console.log('[Extension] Settings updated:', this.settings);
      }
    } catch (error) {
      console.error('[Extension] Failed to update settings:', error);
    }
  }
  
  async saveSettings() {
    try {
      await browser.storage.local.set({ extensionSettings: this.settings });
    } catch (error) {
      console.error('[Extension] Failed to save settings:', error);
    }
  }
  
  // ======================== Resource Management ========================
  
  startResourceManagement() {
    // Clean up old processed commands periodically
    setInterval(() => {
      if (this.processedCommands.size > 1000) {
        // Keep only last 100 commands
        const commands = Array.from(this.processedCommands);
        this.processedCommands = new Set(commands.slice(-100));
      }
    }, 3600000); // Every hour
    
    // Clean up old data
    setInterval(() => {
      this.cleanupOldData();
    }, 86400000); // Daily
  }
  
  async cleanupOldData() {
    try {
      const { pendingData = [] } = await browser.storage.local.get('pendingData');
      
      // Remove data older than 7 days
      const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const filtered = pendingData.filter(item => {
        const timestamp = new Date(item.timestamp).getTime();
        return timestamp > cutoff;
      });
      
      if (filtered.length < pendingData.length) {
        await browser.storage.local.set({ pendingData: filtered });
        console.log(`[Extension] Cleaned up ${pendingData.length - filtered.length} old items`);
      }
    } catch (error) {
      console.error('[Extension] Cleanup error:', error);
    }
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

const extension = new AutonomousExtension();

// Export for debugging
window.llmCollectorExtension = extension;

// Status check every 30 seconds
setInterval(() => {
  console.log('[Extension] Status:', {
    mode: extension.mode,
    sessions: extension.getSessionStates(),
    collecting: extension.collectionLock
  });
}, 30000);