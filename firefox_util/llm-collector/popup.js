// LLM Collector - Popup Script

// Platform configurations
const PLATFORMS = {
  chatgpt: { name: 'ChatGPT', icon: 'GPT', color: '#10a37f' },
  claude: { name: 'Claude', icon: 'C', color: '#6366f1' },
  gemini: { name: 'Gemini', icon: 'G', color: '#4285f4' },
  deepseek: { name: 'DeepSeek', icon: 'DS', color: '#5b21b6' },
  grok: { name: 'Grok', icon: 'X', color: '#1f2937' },
  perplexity: { name: 'Perplexity', icon: 'P', color: '#10b981' }
};

// Get extension instance
let extension = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Get background page
  const backgroundPage = await browser.runtime.getBackgroundPage();
  extension = backgroundPage.llmCollectorExtension;
  
  if (!extension) {
    console.error('[Popup] Extension not found!');
    updateStatus('Error', false);
    return;
  }
  
  // Initial update
  updateUI();
  
  // Setup event listeners
  document.getElementById('syncNowBtn').addEventListener('click', handleSyncNow);
  document.getElementById('dashboardBtn').addEventListener('click', handleOpenDashboard);
  
  // Update UI every second
  setInterval(updateUI, 1000);
});

// Update entire UI
function updateUI() {
  if (!extension) return;
  
  // Update status
  updateStatus(
    extension.mode === 'connected' ? 'Backend Connected' : 'Standalone Mode',
    extension.mode === 'connected'
  );
  
  // Update mode text
  document.getElementById('modeText').textContent = 
    extension.mode === 'connected' ? 'Connected' : 'Standalone';
  
  // Update platforms
  updatePlatforms();
  
  // Update stats
  updateStats();
  
  // Update sync button
  updateSyncButton();
  
  // Update footer
  updateFooter();
}

// Update connection status
function updateStatus(text, connected) {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  statusDot.classList.toggle('disconnected', !connected);
  statusText.textContent = text;
}

// Update platform list
function updatePlatforms() {
  const container = document.getElementById('platformList');
  container.innerHTML = '';
  
  const sessions = extension.state.sessions || {};
  
  Object.entries(PLATFORMS).forEach(([key, config]) => {
    const session = sessions[key] || { valid: false };
    
    const item = document.createElement('div');
    item.className = 'platform-item';
    
    item.innerHTML = `
      <div class="platform-info">
        <div class="platform-icon ${key}" style="background: ${config.color}">
          ${config.icon}
        </div>
        <div>
          <div class="platform-name">${config.name}</div>
          <div class="platform-status">
            ${session.lastChecked ? formatTime(session.lastChecked) : 'Never checked'}
          </div>
        </div>
      </div>
      <span class="badge ${session.valid ? 'active' : 'expired'}">
        ${session.valid ? 'Active' : 'Login required'}
      </span>
    `;
    
    container.appendChild(item);
  });
}

// Update statistics
function updateStats() {
  // Count active sessions
  const sessions = extension.state.sessions || {};
  const activeCount = Object.values(sessions).filter(s => s.valid).length;
  document.getElementById('activeCount').textContent = activeCount;
  
  // Today count (would need to track this properly)
  document.getElementById('todayCount').textContent = '0';
  
  // Total platforms
  document.getElementById('totalCount').textContent = Object.keys(PLATFORMS).length;
}

// Update sync button
function updateSyncButton() {
  const btn = document.getElementById('syncNowBtn');
  const icon = document.getElementById('syncIcon');
  const text = document.getElementById('syncText');
  
  if (extension.collectionLock) {
    btn.disabled = true;
    icon.innerHTML = '<span class="spinner"></span>';
    text.textContent = 'Syncing...';
  } else {
    btn.disabled = false;
    icon.textContent = '↻';
    text.textContent = 'Sync Now';
  }
}

// Update footer
function updateFooter() {
  const footer = document.getElementById('footerText');
  
  // Check if we have scheduled sync info
  const lastHeartbeat = extension.state.lastHeartbeat;
  if (lastHeartbeat) {
    footer.textContent = `Last activity: ${formatTime(lastHeartbeat)}`;
  } else {
    footer.textContent = 'Extension active';
  }
}

// Handle sync now button
async function handleSyncNow() {
  if (!extension || extension.collectionLock) return;
  
  // Get enabled platforms (for now, use all with valid sessions)
  const sessions = extension.state.sessions || {};
  const enabledPlatforms = Object.entries(sessions)
    .filter(([key, session]) => session.valid)
    .map(([key]) => ({ platform: key, enabled: true }));
  
  if (enabledPlatforms.length === 0) {
    alert('No platforms with valid sessions. Please log in first.');
    return;
  }
  
  // Start collection
  await extension.startCollection({
    action: 'sync',
    sync_id: `manual-${Date.now()}`,
    platforms: enabledPlatforms,
    settings: extension.settings
  });
  
  // Update UI
  updateUI();
}

// Handle open dashboard button
async function handleOpenDashboard() {
  await browser.tabs.create({
    url: 'http://localhost:3000'
  });
  window.close();
}

// Helper functions
function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  
  return date.toLocaleDateString();
}