// LLM Conversation Collector Extension - Background Script
console.log('[LLM Collector] Extension loaded at', new Date().toISOString());

// Configuration
const DEFAULT_API_URL = 'http://localhost:8000/api/argosa/llm';
let syncCheckInterval = null;
let currentSyncId = null;
let isSyncing = false;
let extensionReady = false;

// Platform configurations
const PLATFORMS = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chat.openai.com',
    conversationListUrl: 'https://chat.openai.com/backend-api/conversations',
    conversationDetailUrl: (id) => `https://chat.openai.com/backend-api/conversation/${id}`
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    conversationListUrl: 'https://claude.ai/api/chat_conversations',
    conversationDetailUrl: (id) => `https://claude.ai/api/chat_conversations/${id}`
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    conversationListUrl: 'https://gemini.google.com/api/conversations',
    conversationDetailUrl: (id) => `https://gemini.google.com/api/conversations/${id}`
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    conversationListUrl: 'https://chat.deepseek.com/api/v0/chat/conversations',
    conversationDetailUrl: (id) => `https://chat.deepseek.com/api/v0/chat/conversation/${id}`
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.x.ai',
    conversationListUrl: 'https://grok.x.ai/api/conversations',
    conversationDetailUrl: (id) => `https://grok.x.ai/api/conversations/${id}`
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    conversationListUrl: 'https://www.perplexity.ai/api/conversations',
    conversationDetailUrl: (id) => `https://www.perplexity.ai/api/conversations/${id}`
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
    
    // Schedule initial session check (5 minutes after startup)
    setTimeout(() => {
      dailySessionCheck();
    }, 5 * 60 * 1000);
    
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
    
    console.log('[LLM Collector] Checking for pending sync at:', `${url}/sync/config`);
    
    const response = await fetch(`${url}/sync/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.log('[LLM Collector] No pending sync (status:', response.status, ')');
      return;
    }
    
    const syncConfig = await response.json();
    console.log('[LLM Collector] Sync config received:', syncConfig);
    
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
    console.error('[LLM Collector] Error details:', {
      message: error.message,
      stack: error.stack,
      type: error.name
    });
  }
}

async function startSyncProcess(syncConfig) {
  if (isSyncing) {
    console.log('[LLM Collector] Sync already in progress');
    return;
  }
  
  isSyncing = true;
  currentSyncId = syncConfig.id;
  
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
    
  } catch (error) {
    console.error('[LLM Collector] Sync error:', error);
    
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    await updateSyncProgress(url, currentSyncId, {
      status: 'error',
      progress: 0,
      message: error.message || 'Unknown error occurred'
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
    // Platform-specific session check logic
    const results = await browser.tabs.executeScript(tab.id, {
      code: `
        (function() {
          // Platform-specific login state check
          if ('${platform}' === 'chatgpt') {
            const userMenu = document.querySelector('[data-testid="profile-button"]');
            const loggedIn = !!userMenu || !!document.querySelector('nav button img');
            return { loggedIn, platform: '${platform}' };
          } 
          else if ('${platform}' === 'claude') {
            const loginButton = document.querySelector('button:has-text("Log in")');
            const chatInterface = document.querySelector('[class*="chat"]');
            return { loggedIn: !loginButton && !!chatInterface, platform: '${platform}' };
          }
          else if ('${platform}' === 'gemini') {
            const accountButton = document.querySelector('[aria-label*="Google Account"]');
            return { loggedIn: !!accountButton, platform: '${platform}' };
          }
          else if ('${platform}' === 'deepseek') {
            const userAvatar = document.querySelector('[class*="avatar"]');
            return { loggedIn: !!userAvatar, platform: '${platform}' };
          }
          else if ('${platform}' === 'grok') {
            const userMenu = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
            return { loggedIn: !!userMenu, platform: '${platform}' };
          }
          else if ('${platform}' === 'perplexity') {
            const profileMenu = document.querySelector('[class*="profile"]');
            return { loggedIn: !!profileMenu, platform: '${platform}' };
          }
          
          return { loggedIn: false, platform: '${platform}' };
        })();
      `
    });
    
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

async function syncSessionWithBackend(platform, isLoggedIn) {
  try {
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    await fetch(`${url}/sessions/update?platform=${platform}&valid=${isLoggedIn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`[LLM Collector] Session status updated for ${platform}: ${isLoggedIn}`);
  } catch (error) {
    console.error(`[LLM Collector] Failed to update session status:`, error);
  }
}

async function performActualSessionCheck(platform) {
  const platformConfig = PLATFORMS[platform];
  if (!platformConfig) return false;
  
  console.log(`[LLM Collector] Performing actual session check for ${platform}...`);
  
  // Open platform in new tab
  const tab = await browser.tabs.create({ 
    url: platformConfig.url,
    active: false
  });
  
  try {
    // Wait for page to load
    await waitForTabLoad(tab.id);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check session
    const isLoggedIn = await checkPlatformSession(platform, tab);
    
    // Update backend
    await syncSessionWithBackend(platform, isLoggedIn);
    
    return isLoggedIn;
    
  } catch (error) {
    console.error(`[LLM Collector] Error checking ${platform}:`, error);
    return false;
  } finally {
    await browser.tabs.remove(tab.id);
  }
}

async function dailySessionCheck() {
  console.log('[LLM Collector] Running daily session check...');
  
  const { apiUrl } = await browser.storage.local.get(['apiUrl']);
  const url = apiUrl || DEFAULT_API_URL;
  
  // Check all platform sessions
  for (const platform of Object.keys(PLATFORMS)) {
    try {
      const tab = await browser.tabs.create({ 
        url: PLATFORMS[platform].url,
        active: false
      });
      
      await waitForTabLoad(tab.id);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await checkPlatformSession(platform, tab);
      
      await browser.tabs.remove(tab.id);
      
      // Delay between platforms
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`[LLM Collector] Error checking ${platform}:`, error);
    }
  }
  
  console.log('[LLM Collector] Daily session check completed');
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
    console.log(`[LLM Collector] Injecting collection script for ${platform}...`);
    
    // Inject content script to collect conversations
    const results = await browser.tabs.executeScript(tab.id, {
      code: `
        (async function() {
          console.log('[LLM Collector Content] Starting collection for ${platform}...');
          
          try {
            const conversations = [];
            const collectedIds = new Set();
            
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
                  
                  const limit = ${settings.maxConversations || 20};
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
                  
                  const limit = ${settings.maxConversations || 20};
                  for (let i = 0; i < Math.min(items.length, limit); i++) {
                    const conv = items[i];
                    if (!collectedIds.has(conv.uuid || conv.id)) {
                      collectedIds.add(conv.uuid || conv.id);
                      conversations.push({
                        id: conv.uuid || conv.id,
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
      `
    });
    
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

// Set up alarm for daily session check (every 24 hours)
browser.alarms.create('dailySessionCheck', {
  periodInMinutes: 24 * 60
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailySessionCheck') {
    dailySessionCheck();
  }
});

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
      
    case 'checkSessions':
      // Frontend request for session check
      const platforms = message.platforms || Object.keys(PLATFORMS);
      const results = {};
      
      for (const platform of platforms) {
        results[platform] = await performActualSessionCheck(platform);
        // Delay between platforms
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      sendResponse({ success: true, results });
      break;
  }
  
  return true;
});

// BACKUP: URL trigger detection
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && 
      (changeInfo.url.includes('#sync-trigger') || 
       changeInfo.url.includes('#llm-sync-trigger') ||
       changeInfo.url === 'about:blank#sync')) {
    
    console.log('[LLM Collector] 🎯 URL trigger detected!', changeInfo.url);
    
    // Close the trigger tab
    setTimeout(() => {
      browser.tabs.remove(tabId);
    }, 1000);
    
    // Check for pending sync after a short delay
    setTimeout(async () => {
      if (!isSyncing) {
        await checkForPendingSync();
      }
    }, 2000);
  }
});

// Listen for extension startup/install
browser.runtime.onStartup.addListener(initialize);
browser.runtime.onInstalled.addListener(initialize);

// Initialize immediately
console.log('[LLM Collector] Starting initialization...');
initialize();

// Show console message every 10 seconds to confirm extension is running
setInterval(() => {
  console.log('[LLM Collector] Extension active -', new Date().toISOString(), {
    ready: extensionReady,
    syncing: isSyncing,
    syncId: currentSyncId
  });
}, 10000);

// Cleanup on extension unload
self.addEventListener('unload', () => {
  console.log('[LLM Collector] Extension unloading...');
  if (syncCheckInterval) {
    clearInterval(syncCheckInterval);
  }
});