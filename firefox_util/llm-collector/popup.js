// popup.js - LLM Collector popup with API support

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
  
  // Update platform cards
  if (platforms) {
    let enabledCount = 0;
    
    Object.entries(platforms).forEach(([platform, config]) => {
      const card = document.querySelector(`.platform-card[data-platform="${platform}"]`);
      if (card) {
        if (config.enabled) {
          card.classList.add('enabled');
          enabledCount++;
        }
        
        const status = card.querySelector('.platform-status');
        if (config.enabled && config.username) {
          status.textContent = 'Configured';
          status.style.color = '#10b981';
        } else if (config.enabled) {
          status.textContent = 'Missing credentials';
          status.style.color = '#f59e0b';
        } else {
          status.textContent = 'Not configured';
          status.style.color = '#6b7280';
        }
      }
    });
    
    document.getElementById('enabledPlatforms').textContent = enabledCount;
  }
  
  // Update last sync
  if (lastSync) {
    updateLastSync(new Date(lastSync));
  }
  
  // Load statistics
  await updateStats();
}

// Update statistics
async function updateStats() {
  try {
    // Check if using API mode
    const { useAPI } = await browser.storage.local.get(['useAPI']);
    
    if (useAPI) {
      // Get stats from background script (which gets from API)
      const response = await browser.runtime.sendMessage({ action: 'getStats' });
      
      if (response && response.stats) {
        const stats = response.stats;
        
        // Update total conversations
        let totalConversations = 0;
        let todayCount = 0;
        const today = new Date().toISOString().split('T')[0];
        
        // Calculate totals from daily_stats
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
        
        // Update storage size estimate
        const avgSizePerConv = 5 * 1024; // 5KB average
        const totalSize = (totalConversations * avgSizePerConv) / (1024 * 1024);
        document.getElementById('storageSize').textContent = `${totalSize.toFixed(1)} MB`;
      }
    } else {
      // Local storage mode - get from local data
      const { conversations } = await browser.storage.local.get(['conversations']);
      
      if (conversations) {
        const totalConversations = Object.values(conversations).reduce((sum, platformConvs) => 
          sum + (Array.isArray(platformConvs) ? platformConvs.length : 0), 0
        );
        
        document.getElementById('totalConversations').textContent = totalConversations;
        
        // Today's count (simplified)
        document.getElementById('todayCount').textContent = '0';
        
        // Storage size
        const storageSize = JSON.stringify(conversations).length / (1024 * 1024);
        document.getElementById('storageSize').textContent = `${storageSize.toFixed(1)} MB`;
      }
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Update UI elements
function updateUI() {
  // Update next sync time
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
  
  // Platform cards
  document.querySelectorAll('.platform-card').forEach(card => {
    card.addEventListener('click', () => {
      const platform = card.dataset.platform;
      // Open settings page with platform pre-selected
      browser.runtime.openOptionsPage();
      window.close();
    });
  });
}

// Handle sync now
async function handleSyncNow() {
  const btn = document.getElementById('syncNowBtn');
  const loading = document.getElementById('loading');
  const { platforms, useAPI } = await browser.storage.local.get(['platforms', 'useAPI']);
  
  if (useAPI) {
    // API mode - open dashboard
    showAlert('Opening Argosa dashboard...', 'info');
    window.open('http://localhost:3000', '_blank');
    window.close();
    return;
  }
  
  // Check if any platform is enabled
  const enabledPlatforms = Object.entries(platforms || {})
    .filter(([_, config]) => config.enabled && config.username && config.password);
  
  if (enabledPlatforms.length === 0) {
    showAlert('Please configure at least one platform in settings first!', 'warning');
    browser.runtime.openOptionsPage();
    return;
  }
  
  // Disable button and show loading
  btn.disabled = true;
  loading.classList.add('active');
  
  try {
    // Start manual sync
    const result = await browser.runtime.sendMessage({ action: 'startManualSync' });
    
    if (result && result.success) {
      // Update last sync time
      const now = new Date();
      await browser.storage.local.set({ lastSync: now.toISOString() });
      updateLastSync(now);
      
      // Update stats
      await updateStats();
      
      // Show success message
      const message = `Sync completed!\n\nCollected: ${result.totalCollected || 0} conversations\nDuplicates: ${result.totalDuplicates || 0}`;
      showAlert(message, 'success');
    } else {
      showAlert('Sync failed: ' + (result?.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Sync error:', error);
    showAlert('Failed to start sync. Please check the console for details.', 'error');
  } finally {
    // Re-enable button and hide loading
    btn.disabled = false;
    loading.classList.remove('active');
  }
}

// Update last sync display
function updateLastSync(date) {
  const element = document.getElementById('lastSync');
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) { // Less than 1 minute
    element.textContent = 'Just synced';
  } else if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    element.textContent = `Last sync: ${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diff < 86400000) { // Less than 1 day
    const hours = Math.floor(diff / 3600000);
    element.textContent = `Last sync: ${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    element.textContent = `Last sync: ${date.toLocaleDateString()}`;
  }
}

// Show alert message
function showAlert(message, type = 'info') {
  // Create alert element
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
    text-align: center;
    animation: slideDown 0.3s ease;
  `;
  
  // Style based on type
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
  
  // Remove after 3 seconds
  setTimeout(() => {
    alert.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => alert.remove(), 300);
  }, 3000);
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
`;
document.head.appendChild(style);

// Auto-refresh stats every 30 seconds
setInterval(updateStats, 30000);