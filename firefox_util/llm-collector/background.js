// LLM Conversation Collector Extension - Background Script (개선된 버전)
console.log('[LLM Collector] Extension loaded at', new Date().toISOString());

// Configuration - Fixed API URL
const DEFAULT_API_URL = 'http://localhost:8000/api/argosa/llm';
let syncCheckInterval = null;
let currentSyncId = null;
let isSyncing = false;
let extensionReady = false;
let loginCheckInterval = null;
let sessionCheckTimeouts = {};

// Platform configurations
const PLATFORMS = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chat.openai.com',
    conversationListUrl: 'https://chat.openai.com/backend-api/conversations',
    conversationDetailUrl: (id) => `https://chat.openai.com/backend-api/conversation/${id}`,
    loginSelectors: ['[data-testid="profile-button"]', 'nav button img']
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    conversationListUrl: 'https://claude.ai/api/chat_conversations',
    conversationDetailUrl: (id) => `https://claude.ai/api/chat_conversations/${id}`,
    loginSelectors: ['[class*="chat"]', '[data-testid="user-menu"]']
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    conversationListUrl: 'https://gemini.google.com/api/conversations',
    conversationDetailUrl: (id) => `https://gemini.google.com/api/conversations/${id}`,
    loginSelectors: ['[aria-label*="Google Account"]', '[data-testid="account-menu"]']
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    conversationListUrl: 'https://chat.deepseek.com/api/v0/chat/conversations',
    conversationDetailUrl: (id) => `https://chat.deepseek.com/api/v0/chat/conversation/${id}`,
    loginSelectors: ['[class*="avatar"]', '[class*="user-menu"]']
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.x.ai',
    conversationListUrl: 'https://grok.x.ai/api/conversations',
    conversationDetailUrl: (id) => `https://grok.x.ai/api/conversations/${id}`,
    loginSelectors: ['[data-testid="SideNav_AccountSwitcher_Button"]']
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    conversationListUrl: 'https://www.perplexity.ai/api/conversations',
    conversationDetailUrl: (id) => `https://www.perplexity.ai/api/conversations/${id}`,
    loginSelectors: ['[class*="profile"]', '[class*="user-info"]']
  }
};

// ======================== Initialization ========================

async function initialize() {
  console.log('[LLM Collector] Initializing...');
  
  try {
    // Set default API settings
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    if (!apiUrl) {
      await browser.storage.local.set({ 
        useAPI: true, 
        apiUrl: DEFAULT_API_URL 
      });
      console.log('[LLM Collector] Set default API URL:', DEFAULT_API_URL);
    } else {
      console.log('[LLM Collector] Using API URL:', apiUrl);
    }
    
    // Wait a bit for Firefox to fully start
    console.log('[LLM Collector] Waiting for Firefox to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test API connection
    const apiTest = await testAPIConnection();
    if (!apiTest) {
      console.error('[LLM Collector] API connection test failed!');
    } else {
      console.log('[LLM Collector] API connection successful');
    }
    
    extensionReady = true;
    console.log('[LLM Collector] Extension ready!');
    
    // Start periodic sync check
    startPeriodicCheck();
    
    // Check immediately on startup
    await checkForPendingSync();
    
  } catch (error) {
    console.error('[LLM Collector] Initialization error:', error);
  }
}

// ======================== API Connection ========================

async function testAPIConnection() {
  try {
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    console.log('[LLM Collector] Testing API connection to:', url);
    
    const response = await fetch(`${url}/sync/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('[LLM Collector] API test response status:', response.status);
    return response.ok;
    
  } catch (error) {
    console.error('[LLM Collector] API connection test error:', error);
    return false;
  }
}

// ======================== Sync Management ========================

function startPeriodicCheck() {
  if (syncCheckInterval) {
    clearInterval(syncCheckInterval);
  }
  
  // Check every 2 seconds for pending sync
  syncCheckInterval = setInterval(async () => {
    if (!isSyncing && extensionReady) {
      await checkForPendingSync();
    }
  }, 2000);
  
  console.log('[LLM Collector] Started periodic sync check (every 2s)');
}

async function checkForPendingSync() {
  if (!extensionReady) {
    console.log('[LLM Collector] Extension not ready yet, skipping check');
    return;
  }
  
  try {
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    const response = await fetch(`${url}/sync/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      return;
    }
    
    const syncConfig = await response.json();
    
    if (syncConfig.status !== 'no_config' && syncConfig.status === 'pending') {
      console.log('[LLM Collector] 🚀 Found pending sync!', syncConfig);
      
      // Show notification
      await browser.notifications.create({
        type: 'basic',
        iconUrl: browser.extension.getURL('icon.png'),
        title: 'LLM Collector',
        message: 'Starting sync process...'
      });
      
      // Stop periodic check during sync
      if (syncCheckInterval) {
        clearInterval(syncCheckInterval);
        syncCheckInterval = null;
      }
      
      // Start sync process
      await startSyncProcess(syncConfig);
      
      // Resume periodic check after sync
      startPeriodicCheck();
    }
    
  } catch (error) {
    console.error('[LLM Collector] Error checking for sync:', error);
  }
}

async function startSyncProcess(syncConfig) {
  if (isSyncing) {
    console.log('[LLM Collector] Sync already in progress');
    return;
  }
  
  isSyncing = true;
  currentSyncId = syncConfig.id;
  const autoClose = syncConfig.auto_close !== false; // 기본값 true
  
  console.log('[LLM Collector] Starting sync process...', syncConfig);
  
  try {
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    // Update status to syncing
    await updateSyncProgress(url, syncConfig.id, {
      status: 'syncing',
      progress: 0,
      message: 'Initializing sync...',
      collected: 0
    });
    
    // Filter enabled platforms
    const enabledPlatforms = syncConfig.platforms
      .filter(p => p.enabled || p.platform)
      .map(p => p.platform || p);
    
    console.log('[LLM Collector] Enabled platforms:', enabledPlatforms);
    
    if (enabledPlatforms.length === 0) {
      throw new Error('No platforms enabled for sync');
    }
    
    let totalCollected = 0;
    let currentProgress = 0;
    const progressStep = 100 / enabledPlatforms.length;
    
    // Sync each platform
    for (let i = 0; i < enabledPlatforms.length; i++) {
      const platform = enabledPlatforms[i];
      
      if (!PLATFORMS[platform]) {
        console.warn(`[LLM Collector] Unknown platform: ${platform}`);
        continue;
      }
      
      console.log(`[LLM Collector] Syncing ${platform} (${i + 1}/${enabledPlatforms.length})...`);
      
      // Update progress
      await updateSyncProgress(url, syncConfig.id, {
        status: 'syncing',
        progress: Math.round(currentProgress),
        current_platform: platform,
        collected: totalCollected,
        message: `Collecting from ${PLATFORMS[platform].name}...`
      });
      
      try {
        // Perform platform sync with session check
        const result = await performPlatformSyncWithSessionCheck(platform, syncConfig.settings || {});
        if (result && result.collected) {
          totalCollected += result.collected;
          console.log(`[LLM Collector] Collected ${result.collected} from ${platform}`);
        }
      } catch (error) {
        console.error(`[LLM Collector] Error syncing ${platform}:`, error);
        // Continue with next platform even if one fails
      }
      
      currentProgress += progressStep;
      
      // Random delay between platforms
      if (i < enabledPlatforms.length - 1) {
        const delay = (syncConfig.settings?.randomDelay || 5) * 1000;
        const randomDelay = delay + Math.random() * 3000;
        console.log(`[LLM Collector] Waiting ${Math.round(randomDelay/1000)}s before next platform...`);
        await new Promise(resolve => setTimeout(resolve, randomDelay));
      }
    }
    
    // Update final status
    await updateSyncProgress(url, syncConfig.id, {
      status: 'completed',
      progress: 100,
      collected: totalCollected,
      message: 'Sync completed successfully'
    });
    
    console.log(`[LLM Collector] ✅ Sync completed! Collected ${totalCollected} conversations`);
    
    // Show completion notification
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.extension.getURL('icon.png'),
      title: 'LLM Collector',
      message: `Sync completed! Collected ${totalCollected} conversations.`
    });
    
    // Auto close Firefox if configured
    if (autoClose) {
      console.log('[LLM Collector] Auto-closing Firefox in 5 seconds...');
      setTimeout(() => {
        // Close all tabs to trigger Firefox close
        browser.tabs.query({}).then(tabs => {
          tabs.forEach(tab => browser.tabs.remove(tab.id));
        });
      }, 5000);
    }
    
  } catch (error) {
    console.error('[LLM Collector] Sync error:', error);
    
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    await updateSyncProgress(url, currentSyncId, {
      status: 'error',
      progress: 0,
      message: error.message || 'Unknown error occurred',
      error: error.message
    });
    
    // Show error notification
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.extension.getURL('icon.png'),
      title: 'LLM Collector - Error',
      message: `Sync failed: ${error.message}`
    });
    
  } finally {
    isSyncing = false;
    currentSyncId = null;
  }
}

// ======================== Session Management ========================

async function checkPlatformSession(platform, tab) {
  console.log(`[LLM Collector] Checking session for ${platform}...`);
  
  const platformConfig = PLATFORMS[platform];
  if (!platformConfig) return false;
  
  try {
    // Try multiple selectors
    const selectors = platformConfig.loginSelectors || [];
    const checkCode = `
      (function() {
        const selectors = ${JSON.stringify(selectors)};
        let loggedIn = false;
        
        for (const selector of selectors) {
          try {
            const element = document.querySelector(selector);
            if (element) {
              loggedIn = true;
              break;
            }
          } catch (e) {}
        }
        
        // Platform-specific checks
        if (!loggedIn) {
          if ('${platform}' === 'chatgpt') {
            loggedIn = !!document.querySelector('[data-testid="profile-button"]') || 
                      !!document.querySelector('nav button img');
          } else if ('${platform}' === 'claude') {
            const hasChat = !!document.querySelector('[class*="chat"]');
            const noLogin = !document.querySelector('button:has-text("Log in")');
            loggedIn = hasChat && noLogin;
          }
        }
        
        return { loggedIn, platform: '${platform}' };
      })();
    `;
    
    const results = await browser.tabs.executeScript(tab.id, { code: checkCode });
    
    const sessionStatus = results[0];
    console.log(`[LLM Collector] ${platform} session status:`, sessionStatus);
    
    // Update backend with session status
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    await fetch(`${url}/sessions/update?platform=${platform}&valid=${sessionStatus.loggedIn}`, {
      method: 'POST'
    });
    
    return sessionStatus.loggedIn;
    
  } catch (error) {
    console.error(`[LLM Collector] Error checking ${platform} session:`, error);
    return false;
  }
}

async function monitorLoginPage(tabId, platform) {
  console.log(`[LLM Collector] Monitoring login page for ${platform}...`);
  
  // Clear any existing interval
  if (loginCheckInterval) {
    clearInterval(loginCheckInterval);
    loginCheckInterval = null;
  }
  
  let checkCount = 0;
  const maxChecks = 60; // 5 minutes (5 seconds * 60)
  
  loginCheckInterval = setInterval(async () => {
    checkCount++;
    
    try {
      const tab = await browser.tabs.get(tabId);
      
      // Tab closed
      if (!tab) {
        clearInterval(loginCheckInterval);
        loginCheckInterval = null;
        return;
      }
      
      // Check if logged in
      const isLoggedIn = await checkPlatformSession(platform, tab);
      
      if (isLoggedIn) {
        console.log(`[LLM Collector] ${platform} login detected!`);
        
        // Clear interval
        clearInterval(loginCheckInterval);
        loginCheckInterval = null;
        
        // Show notification
        await browser.notifications.create({
          type: 'basic',
          iconUrl: browser.extension.getURL('icon.png'),
          title: 'Login Successful',
          message: `${PLATFORMS[platform].name} session is now active. You can close this tab.`
        });
        
        // Auto close tab after 3 seconds
        setTimeout(() => {
          browser.tabs.remove(tabId).catch(() => {});
        }, 3000);
      }
      
      // Timeout check
      if (checkCount >= maxChecks) {
        console.log(`[LLM Collector] Login monitoring timeout for ${platform}`);
        clearInterval(loginCheckInterval);
        loginCheckInterval = null;
      }
      
    } catch (error) {
      console.error(`[LLM Collector] Error monitoring login:`, error);
      clearInterval(loginCheckInterval);
      loginCheckInterval = null;
    }
  }, 5000); // Check every 5 seconds
}

// ======================== Platform Sync ========================

async function performPlatformSyncWithSessionCheck(platform, settings) {
  const platformConfig = PLATFORMS[platform];
  if (!platformConfig) {
    throw new Error(`Unknown platform: ${platform}`);
  }
  
  console.log(`[LLM Collector] Opening ${platform} at ${platformConfig.url}...`);
  
  // Open platform in new tab
  const tab = await browser.tabs.create({ 
    url: platformConfig.url,
    active: settings.debug !== false
  });
  
  try {
    // Wait for page to load
    console.log(`[LLM Collector] Waiting for ${platform} to load...`);
    await waitForTabLoad(tab.id);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check session
    const isLoggedIn = await checkPlatformSession(platform, tab);
    
    if (!isLoggedIn) {
      console.log(`[LLM Collector] ${platform} session expired, skipping...`);
      
      const { apiUrl } = await browser.storage.local.get(['apiUrl']);
      const url = apiUrl || DEFAULT_API_URL;
      
      await updateSyncProgress(url, currentSyncId, {
        status: 'error',
        progress: 0,
        message: `${platform} session expired. Please log in first.`,
        error: 'session_expired'
      });
      
      return {
        platform: platform,
        collected: 0,
        error: 'Session expired'
      };
    }
    
    // Session is valid, proceed with collection
    console.log(`[LLM Collector] ${platform} session valid, proceeding with collection...`);
    
    // Inject content script to collect conversations
    const collectionCode = getCollectionCode(platform, platformConfig, settings);
    const results = await browser.tabs.executeScript(tab.id, { code: collectionCode });
    
    const result = results[0];
    console.log(`[LLM Collector] Collection result for ${platform}:`, result);
    
    // Save conversations to backend
    if (result.collected > 0) {
      const { apiUrl } = await browser.storage.local.get(['apiUrl']);
      const url = apiUrl || DEFAULT_API_URL;
      
      console.log(`[LLM Collector] Saving ${result.collected} conversations to backend...`);
      
      const saveResponse = await fetch(`${url}/conversations/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platform,
          conversations: result.conversations,
          timestamp: new Date().toISOString()
        })
      });
      
      if (!saveResponse.ok) {
        console.error('[LLM Collector] Failed to save conversations:', saveResponse.status);
      } else {
        console.log('[LLM Collector] Conversations saved successfully');
      }
    }
    
    return result;
    
  } catch (error) {
    console.error(`[LLM Collector] Error in ${platform} sync:`, error);
    throw error;
    
  } finally {
    // Close tab
    console.log(`[LLM Collector] Closing ${platform} tab...`);
    await browser.tabs.remove(tab.id);
  }
}

function getCollectionCode(platform, platformConfig, settings) {
  return `
    (async function() {
      console.log('[LLM Collector Content] Starting collection for ${platform}...');
      
      try {
        const conversations = [];
        const collectedIds = new Set();
        const limit = ${settings.maxConversations || 20};
        
        // Platform-specific collection logic
        if ('${platform}' === 'chatgpt') {
          console.log('[LLM Collector Content] Fetching ChatGPT conversations...');
          
          try {
            const response = await fetch('${platformConfig.conversationListUrl}', {
              credentials: 'include',
              headers: {
                'Accept': 'application/json',
              }
            });
            
            console.log('[LLM Collector Content] Response status:', response.status);
            
            if (response.ok) {
              const data = await response.json();
              const items = data.items || [];
              console.log('[LLM Collector Content] Found', items.length, 'conversations');
              
              for (let i = 0; i < Math.min(items.length, limit); i++) {
                const conv = items[i];
                if (!collectedIds.has(conv.id)) {
                  collectedIds.add(conv.id);
                  conversations.push({
                    id: conv.id,
                    title: conv.title || 'Untitled',
                    created_at: conv.create_time || conv.created_at,
                    updated_at: conv.update_time || conv.updated_at,
                    platform: 'chatgpt'
                  });
                }
              }
            }
          } catch (err) {
            console.error('[LLM Collector Content] ChatGPT fetch error:', err);
            
            // Fallback: try to scrape from DOM
            const convElements = document.querySelectorAll('[data-testid="conversation-list-item"]');
            convElements.forEach((elem, idx) => {
              if (idx < limit) {
                const titleElem = elem.querySelector('[class*="title"]');
                conversations.push({
                  id: 'chatgpt_' + Date.now() + '_' + idx,
                  title: titleElem ? titleElem.textContent : 'Conversation ' + (idx + 1),
                  created_at: new Date().toISOString(),
                  platform: 'chatgpt'
                });
              }
            });
          }
        }
        else if ('${platform}' === 'claude') {
          console.log('[LLM Collector Content] Fetching Claude conversations...');
          
          try {
            const response = await fetch('${platformConfig.conversationListUrl}', {
              credentials: 'include',
              headers: {
                'Accept': 'application/json',
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const items = data.chats || data.conversations || [];
              
              for (let i = 0; i < Math.min(items.length, limit); i++) {
                const conv = items[i];
                const convId = conv.uuid || conv.id;
                if (!collectedIds.has(convId)) {
                  collectedIds.add(convId);
                  conversations.push({
                    id: convId,
                    title: conv.name || conv.title || 'Untitled',
                    created_at: conv.created_at,
                    updated_at: conv.updated_at,
                    platform: 'claude'
                  });
                }
              }
            }
          } catch (err) {
            console.error('[LLM Collector Content] Claude fetch error:', err);
          }
        }
        // Add other platforms as needed...
        
        console.log('[LLM Collector Content] Collected', conversations.length, 'conversations');
        
        return {
          platform: '${platform}',
          collected: conversations.length,
          conversations: conversations
        };
        
      } catch (error) {
        console.error('[LLM Collector Content] Collection error:', error);
        return {
          platform: '${platform}',
          collected: 0,
          error: error.message
        };
      }
    })();
  `;
}

// ======================== Helper Functions ========================

async function updateSyncProgress(apiUrl, syncId, progress) {
  try {
    console.log('[LLM Collector] Updating progress:', progress);
    
    const response = await fetch(`${apiUrl}/sync/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sync_id: syncId,
        ...progress,
        updated_at: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      console.error('[LLM Collector] Failed to update progress:', response.status);
    }
    
  } catch (error) {
    console.error('[LLM Collector] Failed to update progress:', error);
  }
}

async function waitForTabLoad(tabId, timeout = 30000) {
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

async function getStats() {
  try {
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    const response = await fetch(`${url}/conversations/stats`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('[LLM Collector] Failed to get stats:', error);
  }
  return { daily_stats: {} };
}

// ======================== Event Listeners ========================

// Listen for messages from popup or content scripts
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('[LLM Collector] Received message:', message);
  
  switch (message.action) {
    case 'startSync':
      // Manual sync trigger from popup
      if (!isSyncing) {
        await checkForPendingSync();
      }
      sendResponse({ success: true });
      break;
      
    case 'getStatus':
      sendResponse({
        isSyncing: isSyncing,
        currentSyncId: currentSyncId,
        extensionReady: extensionReady
      });
      break;
      
    case 'stopSync':
      // Cancel current sync
      if (isSyncing && currentSyncId) {
        const { apiUrl } = await browser.storage.local.get(['apiUrl']);
        const url = apiUrl || DEFAULT_API_URL;
        
        await fetch(`${url}/sync/cancel/${currentSyncId}`, {
          method: 'POST'
        });
        
        isSyncing = false;
        currentSyncId = null;
        sendResponse({ success: true });
      }
      break;
      
    case 'testConnection':
      const result = await testAPIConnection();
      sendResponse({ connected: result });
      break;
    
    case 'getStats':
      // Return stats to popup
      const stats = await getStats();
      sendResponse({ stats: stats });
      break;
  }
  
  return true;
});

// URL trigger detection - 개선된 버전
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  
  const url = changeInfo.url;
  
  // Sync trigger detection
  if (url.includes('#sync-trigger') || 
      url.includes('#llm-sync-trigger') ||
      url === 'about:blank#sync' ||
      url.includes('about:blank#llm-sync-trigger')) {
    
    console.log('[LLM Collector] 🎯 Sync trigger detected!', url);
    
    // Close the trigger tab after delay
    setTimeout(() => {
      browser.tabs.remove(tabId).catch(() => {});
    }, 1000);
    
    // Check for pending sync after a short delay
    setTimeout(async () => {
      if (!isSyncing) {
        await checkForPendingSync();
      }
    }, 2000);
  }
  
  // Login page detection
  else if (url.includes('#llm-collector-login')) {
    console.log('[LLM Collector] 🔐 Login page detected!', url);
    
    // Detect which platform
    let platform = null;
    for (const [key, config] of Object.entries(PLATFORMS)) {
      if (url.includes(config.url)) {
        platform = key;
        break;
      }
    }
    
    if (platform) {
      console.log(`[LLM Collector] Monitoring ${platform} login...`);
      
      // Start monitoring for login
      setTimeout(() => {
        monitorLoginPage(tabId, platform);
      }, 5000); // Wait 5 seconds for page to load
    }
  }
  
  // Session check trigger
  else if (url.includes('#check-session-')) {
    console.log('[LLM Collector] 🔍 Session check trigger detected!', url);
    
    // Extract platform from URL
    const match = url.match(/#check-session-(\w+)/);
    if (match && match[1]) {
      const platform = match[1];
      
      // Wait for page load
      setTimeout(async () => {
        try {
          const tab = await browser.tabs.get(tabId);
          const isLoggedIn = await checkPlatformSession(platform, tab);
          
          console.log(`[LLM Collector] ${platform} session check result:`, isLoggedIn);
          
          // Close tab after check
          setTimeout(() => {
            browser.tabs.remove(tabId).catch(() => {});
          }, 2000);
        } catch (error) {
          console.error('[LLM Collector] Session check error:', error);
        }
      }, 5000);
    }
  }
});

// Listen for extension startup/install
browser.runtime.onStartup.addListener(initialize);
browser.runtime.onInstalled.addListener(initialize);

// Initialize immediately
console.log('[LLM Collector] Starting initialization...');
initialize();

// Show console message every 30 seconds to confirm extension is running
setInterval(() => {
  console.log('[LLM Collector] Extension active -', new Date().toISOString(), {
    ready: extensionReady,
    syncing: isSyncing,
    syncId: currentSyncId
  });
}, 30000);

// Cleanup on extension unload
self.addEventListener('unload', () => {
  console.log('[LLM Collector] Extension unloading...');
  if (syncCheckInterval) {
    clearInterval(syncCheckInterval);
  }
  if (loginCheckInterval) {
    clearInterval(loginCheckInterval);
  }
});