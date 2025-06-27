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

// State cache
let extensionState = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] Initializing...');
  
  // Setup event listeners
  document.getElementById('syncNowBtn').addEventListener('click', handleSyncNow);
  document.getElementById('dashboardBtn').addEventListener('click', handleOpenDashboard);
  
  // Initial update when popup opens
  await updateUI();
  
  // Listen for storage changes - only update when state actually changes
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.extensionState) {
      console.log('[Popup] Storage changed, updating UI');
      updateUI();
    }
  });
  
  // No more setInterval - only update on demand
});

// Get extension state via message
async function getExtensionState() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'getState' });
    return response;
  } catch (error) {
    console.error('[Popup] Failed to get state:', error);
    return null;
  }
}

// Update entire UI
async function updateUI() {
  // Get current state
  const state = await getExtensionState();
  
  if (!state) {
    updateStatus('Extension Error', false);
    return;
  }
  
  extensionState = state;
  
  // Update status
  updateStatus(
    state.nativeConnected ? 'Native Connected' : 'Disconnected',
    state.nativeConnected
  );
  
  // Update mode text
  document.getElementById('modeText').textContent = 
    state.nativeConnected ? 'Connected' : 'Standalone';
  
  // Update platforms
  updatePlatforms(state.sessions);
  
  // Update stats
  updateStats(state.sessions);
  
  // Update sync button
  updateSyncButton(state.collecting);
  
  // Update footer
  updateFooter(state);
}

// Update connection status
function updateStatus(text, connected) {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  statusDot.classList.toggle('disconnected', !connected);
  statusText.textContent = text;
}

// Update platform list
function updatePlatforms(sessions = {}) {
  const container = document.getElementById('platformList');
  container.innerHTML = '';
  
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
function updateStats(sessions = {}) {
  // Count active sessions
  const activeCount = Object.values(sessions).filter(s => s.valid).length;
  document.getElementById('activeCount').textContent = activeCount;
  
  // Today count (would need to track this properly)
  document.getElementById('todayCount').textContent = '0';
  
  // Total platforms
  document.getElementById('totalCount').textContent = Object.keys(PLATFORMS).length;
}

// Update sync button
function updateSyncButton(collecting = false) {
  const btn = document.getElementById('syncNowBtn');
  const icon = document.getElementById('syncIcon');
  const text = document.getElementById('syncText');
  
  if (collecting) {
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
function updateFooter(state) {
  const footer = document.getElementById('footerText');
  
  if (state.savedAt) {
    footer.textContent = `Last activity: ${formatTime(state.savedAt)}`;
  } else {
    footer.textContent = 'Extension active';
  }
}

// Handle sync now button
async function handleSyncNow() {
  if (!extensionState || extensionState.collecting) return;
  
  // Get enabled platforms
  const sessions = extensionState.sessions || {};
  const enabledPlatforms = Object.entries(sessions)
    .filter(([key, session]) => session.valid)
    .map(([key]) => key);
  
  if (enabledPlatforms.length === 0) {
    alert('No platforms with valid sessions. Please log in first.');
    return;
  }
  
  try {
    // Send collection request via message
    await browser.runtime.sendMessage({
      type: 'startCollection',
      data: {
        platforms: enabledPlatforms,
        settings: {
          maxConversations: 20,
          delayBetweenPlatforms: 5
        }
      }
    });
    
    // Update UI after starting collection
    await updateUI();
  } catch (error) {
    console.error('[Popup] Failed to start collection:', error);
    alert('Failed to start collection. Please check console.');
  }
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