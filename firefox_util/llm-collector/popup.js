// popup.js - LLM Collector popup with Cookie Status

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  updateUI();
  setupEventListeners();
});

// Load data from storage and API
async function loadData() {
  const { platforms, lastSync, useAPI, dataFolder } = await browser.storage.local.get(['platforms', 'lastSync', 'useAPI', 'dataFolder']);
  
  // Update data folder display
  if (dataFolder) {
    document.getElementById('dataFolder').textContent = dataFolder;
  }
  
  // Update platform cards with cookie status
  if (platforms) {
    let enabledCount = 0;
    
    for (const [platform, config] of Object.entries(platforms)) {
      const card = document.querySelector(`.platform-card[data-platform="${platform}"]`);
      if (card) {
        if (config.enabled) {
          card.classList.add('enabled');
          enabledCount++;
        }
        
        // Check cookie status
        try {
          const cookieStatus = await browser.runtime.sendMessage({ 
            action: 'checkCookies', 
            platform: platform 
          });
          
          const status = card.querySelector('.platform-status');
          if (cookieStatus && cookieStatus.valid) {
            status.textContent = 'Session Active';
            status.style.color = '#10b981';
            
            // Show cookie count
            if (cookieStatus.cookies) {
              status.textContent += ` (${cookieStatus.cookies.length} cookies)`;
            }
          } else {
            status.textContent = 'Login Required';
            status.style.color = '#f59e0b';
          }
        } catch (error) {
          console.error(`Error checking ${platform} cookies:`, error);
        }
      }
    }
    
    document.getElementById('enabledPlatforms').textContent = enabledCount;
  }
  
  // Update last sync
  if (lastSync) {
    updateLastSync(new Date(lastSync));
  }
  
  // Load statistics
  await updateStats();
  
  // Check connection status
  await checkConnectionStatus();
}

// Check backend connection
async function checkConnectionStatus() {
  try {
    const response = await browser.runtime.sendMessage({ action: 'testConnection' });
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-indicator span:last-child');
    
    if (response && response.connected) {
      statusDot.style.background = '#10b981';
      statusText.textContent = 'Connected';
      
      // Also update session status
      await browser.runtime.sendMessage({ action: 'updateSessions' });
    } else {
      statusDot.style.background = '#ef4444';
      statusText.textContent = 'Disconnected';
    }
  } catch (error) {
    console.error('Connection check error:', error);
  }
}

// Update statistics
async function updateStats() {
  try {
    const { useAPI } = await browser.storage.local.get(['useAPI']);
    
    if (useAPI !== false) {
      console.log('[Popup] Getting stats from API...');
      
      try {
        const response = await browser.runtime.sendMessage({ action: 'getStats' });
        console.log('[Popup] Stats response:', response);
        
        if (response && response.stats) {
          const stats = response.stats;
          
          let totalConversations = 0;
          let todayCount = 0;
          const today = new Date().toISOString().split('T')[0];
          
          if (stats.daily_stats) {
            Object.values(stats.daily_stats).forEach(platformStats => {
              Object.entries(platformStats).forEach(([date, count]) => {
                totalConversations += count;
                if (date === today) {
                  todayCount += count;
                }
              });
            });
          }
          
          document.getElementById('totalConversations').textContent = totalConversations;
          document.getElementById('todayCount').textContent = todayCount;
          
          const avgSizePerConv = 5 * 1024;
          const totalSize = (totalConversations * avgSizePerConv) / (1024 * 1024);
          document.getElementById('storageSize').textContent = `${totalSize.toFixed(1)} MB`;
        }
      } catch (error) {
        console.error('[Popup] Failed to get stats:', error);
      }
    }
  } catch (error) {
    console.error('[Popup] Error loading stats:', error);
  }
}

// Update UI elements
function updateUI() {
  const now = new Date();
  const nextSync = new Date();
  nextSync.setHours(3, Math.floor(Math.random() * 60), 0, 0);
  if (nextSync <= now) {
    nextSync.setDate(nextSync.getDate() + 1);
  }
  
  const hours = nextSync.getHours();
  const minutes = nextSync.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  
  document.getElementById('nextSync').textContent = 
    `Next: ${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Setup event listeners
function setupEventListeners() {
  // Sync now button
  document.getElementById('syncNowBtn').addEventListener('click', handleSyncNow);
  
  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
  });
  
  // Platform cards - show cookie details
  document.querySelectorAll('.platform-card').forEach(card => {
    card.addEventListener('click', async () => {
      const platform = card.dataset.platform;
      
      // Get detailed cookie info
      const cookieStatus = await browser.runtime.sendMessage({ 
        action: 'checkCookies', 
        platform: platform 
      });
      
      if (cookieStatus && cookieStatus.cookies) {
        let message = `${platform} cookies:\n\n`;
        cookieStatus.cookies.forEach(cookie => {
          message += `• ${cookie.name}\n`;
          if (cookie.expires) {
            const expDate = new Date(cookie.expires * 1000);
            message += `  Expires: ${expDate.toLocaleDateString()}\n`;
          }
        });
        
        showAlert(message, 'info');
      } else {
        showAlert(`No cookies found for ${platform}. Please log in.`, 'warning');
      }
    });
  });
  
  // Refresh button
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn btn-secondary';
  refreshBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; padding: 5px;';
  refreshBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>';
  refreshBtn.onclick = async () => {
    refreshBtn.disabled = true;
    refreshBtn.style.animation = 'spin 1s linear';
    
    await checkConnectionStatus();
    await loadData();
    
    setTimeout(() => {
      refreshBtn.disabled = false;
      refreshBtn.style.animation = '';
    }, 1000);
  };
  document.body.appendChild(refreshBtn);
}

// Handle sync now
async function handleSyncNow() {
  const btn = document.getElementById('syncNowBtn');
  const loading = document.getElementById('loading');
  const { platforms, useAPI } = await browser.storage.local.get(['platforms', 'useAPI']);
  
  if (useAPI !== false) {
    showAlert('Opening Argosa dashboard...', 'info');
    window.open('http://localhost:3000', '_blank');
    window.close();
    return;
  }
  
  const enabledPlatforms = Object.entries(platforms || {})
    .filter(([_, config]) => config.enabled);
  
  if (enabledPlatforms.length === 0) {
    showAlert('Please configure at least one platform in settings!', 'warning');
    browser.runtime.openOptionsPage();
    return;
  }
  
  btn.disabled = true;
  loading.classList.add('active');
  
  try {
    console.log('[Popup] Starting manual sync...');
    const result = await browser.runtime.sendMessage({ action: 'startManualSync' });
    
    if (result && result.success) {
      const now = new Date();
      await browser.storage.local.set({ lastSync: now.toISOString() });
      updateLastSync(now);
      
      await updateStats();
      
      const message = `Sync completed!\n\nCollected: ${result.totalCollected || 0} conversations`;
      showAlert(message, 'success');
    } else {
      showAlert('Sync failed: ' + (result?.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('[Popup] Sync error:', error);
    showAlert('Failed to start sync. Please check the console.', 'error');
  } finally {
    btn.disabled = false;
    loading.classList.remove('active');
  }
}

// Update last sync display
function updateLastSync(date) {
  const element = document.getElementById('lastSync');
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) {
    element.textContent = 'Just synced';
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    element.textContent = `Last sync: ${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    element.textContent = `Last sync: ${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    element.textContent = `Last sync: ${date.toLocaleDateString()}`;
  }
}

// Show alert message
function showAlert(message, type = 'info') {
  const alert = document.createElement('div');
  alert.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 1000;
    max-width: 350px;
    text-align: left;
    animation: slideDown 0.3s ease;
    white-space: pre-line;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  
  switch (type) {
    case 'success':
      alert.style.background = '#10b981';
      alert.style.color = 'white';
      break;
    case 'error':
      alert.style.background = '#ef4444';
      alert.style.color = 'white';
      break;
    case 'warning':
      alert.style.background = '#f59e0b';
      alert.style.color = 'white';
      break;
    default:
      alert.style.background = '#3b82f6';
      alert.style.color = 'white';
  }
  
  alert.textContent = message;
  document.body.appendChild(alert);
  
  setTimeout(() => {
    alert.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => alert.remove(), 300);
  }, 5000);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translate(-50%, -20px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
  
  @keyframes slideUp {
    from {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    to {
      opacity: 0;
      transform: translate(-50%, -20px);
    }
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// Auto-refresh every 30 seconds
setInterval(() => {
  checkConnectionStatus();
  updateStats();
}, 30000);

// Initial connection test
browser.runtime.sendMessage({ action: 'testConnection' }).then(response => {
  console.log('[Popup] Extension connection test:', response);
}).catch(error => {
  console.error('[Popup] Extension not responding:', error);
});