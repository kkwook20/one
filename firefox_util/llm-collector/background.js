// LLM Conversation Collector Extension - Background Script with Cookie-based Session Management
console.log('[LLM Collector] Extension loaded at', new Date().toISOString());

// Configuration
const DEFAULT_API_URL = 'http://localhost:8000/api/argosa';
let syncCheckInterval = null;
let currentSyncId = null;
let isSyncing = false;
let extensionReady = false;
let sessionMonitorInterval = null;
let cookieCheckInterval = null;

// Platform configurations with cookie domains
const PLATFORMS = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chat.openai.com',
    cookieDomain: '.openai.com',
    sessionCookies: ['__Secure-next-auth.session-token', '_cfuvid'],
    conversationListUrl: 'https://chat.openai.com/backend-api/conversations',
    conversationDetailUrl: (id) => `https://chat.openai.com/backend-api/conversation/${id}`,
    loginSelectors: ['[data-testid="profile-button"]', 'nav button img'],
    loginIndicators: [
      () => window.location.pathname === '/chat' || window.location.pathname.startsWith('/c/'),
      () => !window.location.pathname.includes('auth'),
      () => !!document.querySelector('[data-testid="profile-button"]'),
      () => !!document.querySelector('nav button img')
    ]
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    cookieDomain: '.claude.ai',
    sessionCookies: ['sessionKey', 'intercom-session'],
    conversationListUrl: 'https://claude.ai/api/chat_conversations',
    conversationDetailUrl: (id) => `https://claude.ai/api/chat_conversations/${id}`,
    loginSelectors: ['[class*="chat"]', '[data-testid="user-menu"]'],
    loginIndicators: [
      () => !!document.querySelector('[class*="chat"]'),
      () => !document.querySelector('button:has-text("Log in")')
    ]
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    cookieDomain: '.google.com',
    sessionCookies: ['HSID', 'SSID', 'APISID', 'SAPISID'],
    conversationListUrl: 'https://gemini.google.com/api/conversations',
    conversationDetailUrl: (id) => `https://gemini.google.com/api/conversations/${id}`,
    loginSelectors: ['[aria-label*="Google Account"]', '[data-testid="account-menu"]'],
    loginIndicators: [
      () => !!document.querySelector('[aria-label*="Google Account"]')
    ]
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    cookieDomain: '.deepseek.com',
    sessionCookies: ['token', 'session'],
    conversationListUrl: 'https://chat.deepseek.com/api/v0/chat/conversations',
    conversationDetailUrl: (id) => `https://chat.deepseek.com/api/v0/chat/conversation/${id}`,
    loginSelectors: ['[class*="avatar"]', '[class*="user-menu"]'],
    loginIndicators: [
      () => !!document.querySelector('[class*="avatar"]')
    ]
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.x.ai',
    cookieDomain: '.x.ai',
    sessionCookies: ['auth_token', 'ct0'],
    conversationListUrl: 'https://grok.x.ai/api/conversations',
    conversationDetailUrl: (id) => `https://grok.x.ai/api/conversations/${id}`,
    loginSelectors: ['[data-testid="SideNav_AccountSwitcher_Button"]'],
    loginIndicators: [
      () => !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')
    ]
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://www.perplexity.ai',
    cookieDomain: '.perplexity.ai',
    sessionCookies: ['__session', '_perplexity_session'],
    conversationListUrl: 'https://www.perplexity.ai/api/conversations',
    conversationDetailUrl: (id) => `https://www.perplexity.ai/api/conversations/${id}`,
    loginSelectors: ['[class*="profile"]', '[class*="user-info"]'],
    loginIndicators: [
      () => !!document.querySelector('[class*="profile"]')
    ]
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
    }
    
    // Wait for stabilization
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
    
    // Start periodic checks
    startPeriodicCheck();
    startCookieMonitor();
    
    // Initial session update
    await updateAllSessionsFromCookies();
    
    // Check for pending sync
    await checkForPendingSync();
    
  } catch (error) {
    console.error('[LLM Collector] Initialization error:', error);
  }
}

// ======================== Cookie-Based Session Management ========================

async function checkPlatformCookies(platform) {
  const config = PLATFORMS[platform];
  if (!config) return false;
  
  console.log(`[Cookie Check] Checking cookies for ${platform}...`);
  
  try {
    const cookiePromises = config.sessionCookies.map(cookieName => 
      browser.cookies.get({
        url: config.url,
        name: cookieName
      })
    );
    
    const cookies = await Promise.all(cookiePromises);
    const validCookies = cookies.filter(cookie => cookie && cookie.value);
    
    console.log(`[Cookie Check] ${platform}: Found ${validCookies.length}/${config.sessionCookies.length} session cookies`);
    
    // Platform-specific validation
    let isValid = false;
    let sessionData = {};
    
    switch (platform) {
      case 'chatgpt':
        // ChatGPT needs the session token
        const sessionToken = validCookies.find(c => c.name.includes('session-token'));
        isValid = !!sessionToken;
        if (sessionToken) {
          sessionData = {
            hasSessionToken: true,
            expiresAt: sessionToken.expirationDate ? new Date(sessionToken.expirationDate * 1000).toISOString() : null
          };
        }
        break;
        
      case 'claude':
        // Claude needs sessionKey
        const sessionKey = validCookies.find(c => c.name === 'sessionKey');
        isValid = !!sessionKey;
        if (sessionKey) {
          sessionData = {
            hasSessionKey: true,
            expiresAt: sessionKey.expirationDate ? new Date(sessionKey.expirationDate * 1000).toISOString() : null
          };
        }
        break;
        
      case 'gemini':
        // Google needs multiple auth cookies
        const hasGoogleAuth = validCookies.some(c => ['HSID', 'SSID', 'APISID'].includes(c.name));
        isValid = hasGoogleAuth;
        if (hasGoogleAuth) {
          sessionData = {
            hasGoogleAuth: true,
            cookieCount: validCookies.length
          };
        }
        break;
        
      default:
        // For others, any valid cookie means logged in
        isValid = validCookies.length > 0;
        if (isValid) {
          sessionData = {
            cookieCount: validCookies.length
          };
        }
    }
    
    console.log(`[Cookie Check] ${platform} session valid: ${isValid}`, sessionData);
    
    return {
      valid: isValid,
      cookies: validCookies.map(c => ({
        name: c.name,
        domain: c.domain,
        expires: c.expirationDate
      })),
      sessionData
    };
    
  } catch (error) {
    console.error(`[Cookie Check] Error checking ${platform} cookies:`, error);
    return { valid: false, error: error.message };
  }
}

async function updateAllSessionsFromCookies() {
  console.log('[Session Update] Checking all platform sessions via cookies...');
  
  for (const platform of Object.keys(PLATFORMS)) {
    try {
      const cookieStatus = await checkPlatformCookies(platform);
      
      // Update backend with detailed session info
      const { apiUrl } = await browser.storage.local.get(['apiUrl']);
      const url = apiUrl || DEFAULT_API_URL;
      
      const updateData = {
        platform: platform,
        valid: cookieStatus.valid,
        cookies: cookieStatus.cookies,
        sessionData: cookieStatus.sessionData,
        checkedAt: new Date().toISOString(),
        checkedBy: 'cookie_check'
      };
      
      console.log(`[Session Update] Sending update for ${platform}:`, updateData);
      
      const updateResponse = await fetch(`${url}/llm/sessions/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      if (updateResponse.ok) {
        console.log(`[Session Update] ✅ Updated ${platform} session status`);
      } else {
        console.error(`[Session Update] Failed to update ${platform}:`, updateResponse.status);
      }
      
    } catch (error) {
      console.error(`[Session Update] Error updating ${platform}:`, error);
    }
  }
}

function startCookieMonitor() {
  if (cookieCheckInterval) {
    clearInterval(cookieCheckInterval);
  }
  
  // Check cookies every 15 seconds
  cookieCheckInterval = setInterval(async () => {
    if (!extensionReady || isSyncing) return;
    await updateAllSessionsFromCookies();
  }, 15000);
  
  console.log('[Cookie Monitor] Started monitoring cookies every 15s');
}

// ======================== API Connection ========================

async function testAPIConnection() {
  try {
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    console.log('[API Test] Testing connection to:', url);
    
    const response = await fetch(`${url}/llm/sync/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('[API Test] Response status:', response.status);
    return response.ok;
    
  } catch (error) {
    console.error('[API Test] Connection error:', error);
    return false;
  }
}

// ======================== Sync Management ========================

function startPeriodicCheck() {
  if (syncCheckInterval) {
    clearInterval(syncCheckInterval);
  }
  
  syncCheckInterval = setInterval(async () => {
    if (!isSyncing && extensionReady) {
      await checkForPendingSync();
    }
  }, 2000);
  
  console.log('[Sync Check] Started periodic check every 2s');
}

async function checkForPendingSync() {
  if (!extensionReady) {
    console.log('[Sync Check] Extension not ready');
    return;
  }
  
  try {
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    const response = await fetch(`${url}/llm/sync/config`, {
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
      console.log('[Sync] 🚀 Found pending sync!', syncConfig);
      
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
      
      // Start sync
      await startSyncProcess(syncConfig);
      
      // Resume periodic check
      startPeriodicCheck();
    }
    
  } catch (error) {
    console.error('[Sync Check] Error:', error);
  }
}

async function startSyncProcess(syncConfig) {
  if (isSyncing) {
    console.log('[Sync] Already in progress');
    return;
  }
  
  isSyncing = true;
  currentSyncId = syncConfig.id;
  const autoClose = syncConfig.auto_close !== false;
  
  console.log('[Sync] Starting process...', syncConfig);
  
  try {
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    // Update status
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
    
    console.log('[Sync] Enabled platforms:', enabledPlatforms);
    
    if (enabledPlatforms.length === 0) {
      throw new Error('No platforms enabled');
    }
    
    // Final cookie check before sync
    console.log('[Sync] Final session check before sync...');
    await updateAllSessionsFromCookies();
    
    let totalCollected = 0;
    let currentProgress = 0;
    const progressStep = 100 / enabledPlatforms.length;
    
    // Sync each platform
    for (let i = 0; i < enabledPlatforms.length; i++) {
      const platform = enabledPlatforms[i];
      
      if (!PLATFORMS[platform]) {
        console.warn(`[Sync] Unknown platform: ${platform}`);
        continue;
      }
      
      console.log(`[Sync] Processing ${platform} (${i + 1}/${enabledPlatforms.length})...`);
      
      // Update progress
      await updateSyncProgress(url, syncConfig.id, {
        status: 'syncing',
        progress: Math.round(currentProgress),
        current_platform: platform,
        collected: totalCollected,
        message: `Collecting from ${PLATFORMS[platform].name}...`
      });
      
      try {
        // Check cookies one more time for this platform
        const cookieStatus = await checkPlatformCookies(platform);
        
        if (!cookieStatus.valid) {
          console.warn(`[Sync] ${platform} session invalid, skipping...`);
          continue;
        }
        
        // Perform sync
        const result = await performPlatformSync(platform, syncConfig.settings || {});
        if (result && result.collected) {
          totalCollected += result.collected;
          console.log(`[Sync] Collected ${result.collected} from ${platform}`);
        }
      } catch (error) {
        console.error(`[Sync] Error with ${platform}:`, error);
      }
      
      currentProgress += progressStep;
      
      // Delay between platforms
      if (i < enabledPlatforms.length - 1) {
        const delay = (syncConfig.settings?.randomDelay || 5) * 1000;
        const randomDelay = delay + Math.random() * 3000;
        console.log(`[Sync] Waiting ${Math.round(randomDelay/1000)}s...`);
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
    
    console.log(`[Sync] ✅ Completed! Collected ${totalCollected} conversations`);
    
    // Show notification
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.extension.getURL('icon.png'),
      title: 'Sync Complete',
      message: `Collected ${totalCollected} conversations.`
    });
    
    // Auto close if configured
    if (autoClose) {
      console.log('[Sync] Auto-closing in 5 seconds...');
      setTimeout(() => {
        browser.tabs.query({}).then(tabs => {
          tabs.forEach(tab => browser.tabs.remove(tab.id));
        });
      }, 5000);
    }
    
  } catch (error) {
    console.error('[Sync] Error:', error);
    
    const { apiUrl } = await browser.storage.local.get(['apiUrl']);
    const url = apiUrl || DEFAULT_API_URL;
    
    await updateSyncProgress(url, currentSyncId, {
      status: 'error',
      progress: 0,
      message: error.message || 'Unknown error',
      error: error.message
    });
    
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.extension.getURL('icon.png'),
      title: 'Sync Failed',
      message: error.message
    });
    
  } finally {
    isSyncing = false;
    currentSyncId = null;
  }
}

async function performPlatformSync(platform, settings) {
  const platformConfig = PLATFORMS[platform];
  if (!platformConfig) {
    throw new Error(`Unknown platform: ${platform}`);
  }
  
  console.log(`[Platform Sync] Opening ${platform}...`);
  
  const tab = await browser.tabs.create({ 
    url: platformConfig.url,
    active: settings.debug !== false
  });
  
  try {
    // Wait for load
    await waitForTabLoad(tab.id);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Inject collection code
    const collectionCode = getCollectionCode(platform, platformConfig, settings);
    const results = await browser.tabs.executeScript(tab.id, { code: collectionCode });
    
    const result = results[0];
    console.log(`[Platform Sync] Result for ${platform}:`, result);
    
    // Save to backend
    if (result.collected > 0) {
      const { apiUrl } = await browser.storage.local.get(['apiUrl']);
      const url = apiUrl || DEFAULT_API_URL;
      
      console.log(`[Platform Sync] Saving ${result.collected} conversations...`);
      
      const saveResponse = await fetch(`${url}/llm/conversations/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platform,
          conversations: result.conversations,
          timestamp: new Date().toISOString()
        })
      });
      
      if (!saveResponse.ok) {
        console.error('[Platform Sync] Save failed:', saveResponse.status);
      } else {
        console.log('[Platform Sync] Saved successfully');
      }
    }
    
    return result;
    
  } catch (error) {
    console.error(`[Platform Sync] Error:`, error);
    throw error;
    
  } finally {
    await browser.tabs.remove(tab.id);
  }
}

// ======================== Collection Code Generation ========================

function getCollectionCode(platform, platformConfig, settings) {
  return `
    (async function() {
      console.log('[Collector] Starting collection for ${platform}...');
      
      try {
        const conversations = [];
        const collectedIds = new Set();
        const limit = ${settings.maxConversations || 20};
        
        // Platform-specific collection
        if ('${platform}' === 'chatgpt') {
          try {
            const response = await fetch('${platformConfig.conversationListUrl}', {
              credentials: 'include',
              headers: {
                'Accept': 'application/json',
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const items = data.items || [];
              
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
            console.error('[Collector] API error:', err);
          }
        }
        else if ('${platform}' === 'claude') {
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
            console.error('[Collector] API error:', err);
          }
        }
        // Add other platforms...
        
        console.log('[Collector] Collected', conversations.length, 'conversations');
        
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
          error: error.message
        };
      }
    })();
  `;
}

// ======================== Helper Functions ========================

async function updateSyncProgress(apiUrl, syncId, progress) {
  try {
    const response = await fetch(`${apiUrl}/llm/sync/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sync_id: syncId,
        ...progress,
        updated_at: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      console.error('[Progress] Update failed:', response.status);
    }
    
  } catch (error) {
    console.error('[Progress] Error:', error);
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

// ======================== Message Handling ========================

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('[Message] Received:', message);
  
  switch (message.action) {
    case 'startSync':
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
      
    case 'testConnection':
      const result = await testAPIConnection();
      sendResponse({ connected: result });
      break;
      
    case 'checkCookies':
      const cookieStatus = await checkPlatformCookies(message.platform);
      sendResponse(cookieStatus);
      break;
      
    case 'updateSessions':
      await updateAllSessionsFromCookies();
      sendResponse({ success: true });
      break;
      
    case 'getStats':
      try {
        const { apiUrl } = await browser.storage.local.get(['apiUrl']);
        const url = apiUrl || DEFAULT_API_URL;
        
        const response = await fetch(`${url}/llm/conversations/stats`);
        if (response.ok) {
          const stats = await response.json();
          sendResponse({ stats: stats });
        } else {
          sendResponse({ stats: null });
        }
      } catch (error) {
        sendResponse({ stats: null });
      }
      break;
  }
  
  return true;
});

// ======================== Tab Monitoring ========================

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  
  const url = changeInfo.url;
  
  // Detect platform visits
  for (const [platform, config] of Object.entries(PLATFORMS)) {
    if (url.includes(config.url) && !url.includes('#')) {
      console.log(`[Tab Monitor] ${platform} detected`);
      
      // Check cookies after page loads
      setTimeout(async () => {
        const cookieStatus = await checkPlatformCookies(platform);
        console.log(`[Tab Monitor] ${platform} cookie status:`, cookieStatus);
        
        // Update backend
        const { apiUrl } = await browser.storage.local.get(['apiUrl']);
        const apiEndpoint = apiUrl || DEFAULT_API_URL;
        
        await fetch(`${apiEndpoint}/llm/sessions/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: platform,
            valid: cookieStatus.valid,
            cookies: cookieStatus.cookies,
            sessionData: cookieStatus.sessionData
          })
        });
      }, 5000);
      
      break;
    }
  }
  
  // Sync trigger
  if (url.includes('#llm-sync-trigger') || url.includes('about:blank#llm-sync-trigger')) {
    console.log('[Tab Monitor] 🎯 Sync trigger detected!');
    
    setTimeout(() => {
      browser.tabs.remove(tabId).catch(() => {});
    }, 1000);
    
    setTimeout(async () => {
      if (!isSyncing) {
        await checkForPendingSync();
      }
    }, 2000);
  }
  
  // Login detection
  else if (url.includes('#llm-collector-login')) {
    console.log('[Tab Monitor] 🔐 Login page detected!');
    
    let platform = null;
    for (const [key, config] of Object.entries(PLATFORMS)) {
      if (url.includes(config.url)) {
        platform = key;
        break;
      }
    }
    
    if (platform) {
      console.log(`[Tab Monitor] Monitoring ${platform} login...`);
      
      // Monitor cookies for login
      let checkCount = 0;
      const maxChecks = 60;
      
      const loginInterval = setInterval(async () => {
        checkCount++;
        
        const cookieStatus = await checkPlatformCookies(platform);
        
        if (cookieStatus.valid) {
          console.log(`[Tab Monitor] ✅ ${platform} login detected!`);
          
          clearInterval(loginInterval);
          
          // Update backend
          const { apiUrl } = await browser.storage.local.get(['apiUrl']);
          const apiEndpoint = apiUrl || DEFAULT_API_URL;
          
          await fetch(`${apiEndpoint}/llm/sessions/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: platform,
              valid: true,
              cookies: cookieStatus.cookies,
              sessionData: cookieStatus.sessionData
            })
          });
          
          // Show notification
          await browser.notifications.create({
            type: 'basic',
            iconUrl: browser.extension.getURL('icon.png'),
            title: 'Login Successful',
            message: `${PLATFORMS[platform].name} session is now active.`
          });
          
          // Close tab
          setTimeout(() => {
            browser.tabs.remove(tabId).catch(() => {});
          }, 3000);
        }
        
        if (checkCount >= maxChecks) {
          clearInterval(loginInterval);
        }
      }, 5000);
    }
  }
});

// ======================== Cookie Change Monitoring ========================

browser.cookies.onChanged.addListener(async (changeInfo) => {
  if (!extensionReady) return;
  
  // Check if this cookie belongs to any monitored platform
  for (const [platform, config] of Object.entries(PLATFORMS)) {
    if (changeInfo.cookie.domain.includes(config.cookieDomain) ||
        config.cookieDomain.includes(changeInfo.cookie.domain)) {
      
      console.log(`[Cookie Change] ${platform} cookie changed:`, changeInfo.cookie.name);
      
      // Debounce cookie updates
      setTimeout(async () => {
        const cookieStatus = await checkPlatformCookies(platform);
        
        // Update backend
        const { apiUrl } = await browser.storage.local.get(['apiUrl']);
        const url = apiUrl || DEFAULT_API_URL;
        
        await fetch(`${url}/llm/sessions/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: platform,
            valid: cookieStatus.valid,
            cookies: cookieStatus.cookies,
            sessionData: cookieStatus.sessionData,
            reason: 'cookie_change'
          })
        });
      }, 1000);
      
      break;
    }
  }
});

// ======================== Startup & Cleanup ========================

browser.runtime.onStartup.addListener(initialize);
browser.runtime.onInstalled.addListener(initialize);

// Initialize
console.log('[LLM Collector] Starting initialization...');
initialize();

// Status log
setInterval(() => {
  console.log('[LLM Collector] Status:', {
    ready: extensionReady,
    syncing: isSyncing,
    syncId: currentSyncId,
    time: new Date().toISOString()
  });
}, 30000);

// Cleanup
self.addEventListener('unload', () => {
  console.log('[LLM Collector] Unloading...');
  if (syncCheckInterval) clearInterval(syncCheckInterval);
  if (cookieCheckInterval) clearInterval(cookieCheckInterval);
});