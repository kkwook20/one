// options.js - LLM Collector Settings Page (Native Messaging Version)

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

// Load settings from storage
async function loadSettings() {
  const settings = await browser.storage.local.get([
    'syncInterval',
    'platforms',
    'maxConversations',
    'delayBetweenPlatforms'
  ]);
  
  // Set form values
  document.getElementById('syncInterval').value = settings.syncInterval || 1440;
  document.getElementById('maxConversations').value = settings.maxConversations || 20;
  document.getElementById('delayBetweenPlatforms').value = settings.delayBetweenPlatforms || 5;
  
  // Load platform settings
  if (settings.platforms) {
    Object.entries(settings.platforms).forEach(([platform, config]) => {
      const toggle = document.querySelector(`.toggle-switch[data-platform="${platform}"]`);
      const fields = document.querySelector(`.credentials-fields[data-platform="${platform}"]`);
      
      if (config.enabled) {
        toggle.classList.add('active');
        fields.classList.add('active');
      }
      
      if (config.username) {
        document.getElementById(`${platform}-username`).value = config.username;
      }
      if (config.password) {
        document.getElementById(`${platform}-password`).value = config.password;
      }
    });
  }
}

// Setup event listeners
function setupEventListeners() {
  // Platform toggles
  document.querySelectorAll('.toggle-switch[data-platform]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const platform = toggle.dataset.platform;
      const fields = document.querySelector(`.credentials-fields[data-platform="${platform}"]`);
      
      toggle.classList.toggle('active');
      fields.classList.toggle('active');
    });
  });
  
  // Save button
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  
  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportData);
  
  // Import button
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  
  // Import file handler
  document.getElementById('importFile').addEventListener('change', importData);
}

// Save settings
async function saveSettings() {
  const settings = {
    syncInterval: parseInt(document.getElementById('syncInterval').value),
    maxConversations: parseInt(document.getElementById('maxConversations').value),
    delayBetweenPlatforms: parseInt(document.getElementById('delayBetweenPlatforms').value),
    platforms: {}
  };
  
  // Save platform settings
  const platforms = ['chatgpt', 'claude', 'gemini', 'deepseek', 'grok', 'perplexity'];
  
  platforms.forEach(platform => {
    const toggle = document.querySelector(`.toggle-switch[data-platform="${platform}"]`);
    const username = document.getElementById(`${platform}-username`).value;
    const password = document.getElementById(`${platform}-password`).value;
    
    settings.platforms[platform] = {
      enabled: toggle.classList.contains('active'),
      username: username,
      password: password
    };
  });
  
  // Save to storage
  await browser.storage.local.set(settings);
  
  // Notify background script about settings change
  browser.runtime.sendMessage({ 
    action: 'settingsUpdated', 
    settings: settings 
  });
  
  // Show success message
  showAlert('Settings saved successfully!', 'success');
}

// Export data
async function exportData() {
  const data = await browser.storage.local.get();
  
  // Create export object
  const exportData = {
    exportDate: new Date().toISOString(),
    settings: {
      syncInterval: data.syncInterval,
      maxConversations: data.maxConversations,
      delayBetweenPlatforms: data.delayBetweenPlatforms
    },
    platforms: {}
  };
  
  // Add platform settings (without passwords for security)
  if (data.platforms) {
    Object.entries(data.platforms).forEach(([platform, config]) => {
      exportData.platforms[platform] = {
        enabled: config.enabled,
        username: config.username
        // Password excluded for security
      };
    });
  }
  
  // Create download
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `llm-collector-config-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showAlert('Configuration exported!', 'success');
}

// Import data
async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate import data
    if (!data.settings || !data.platforms) {
      throw new Error('Invalid configuration file');
    }
    
    // Update form fields
    if (data.settings.syncInterval) {
      document.getElementById('syncInterval').value = data.settings.syncInterval;
    }
    if (data.settings.maxConversations) {
      document.getElementById('maxConversations').value = data.settings.maxConversations;
    }
    if (data.settings.delayBetweenPlatforms) {
      document.getElementById('delayBetweenPlatforms').value = data.settings.delayBetweenPlatforms;
    }
    
    // Update platform settings
    Object.entries(data.platforms).forEach(([platform, config]) => {
      const toggle = document.querySelector(`.toggle-switch[data-platform="${platform}"]`);
      const fields = document.querySelector(`.credentials-fields[data-platform="${platform}"]`);
      const usernameField = document.getElementById(`${platform}-username`);
      
      if (toggle && fields && usernameField) {
        if (config.enabled) {
          toggle.classList.add('active');
          fields.classList.add('active');
        } else {
          toggle.classList.remove('active');
          fields.classList.remove('active');
        }
        
        if (config.username) {
          usernameField.value = config.username;
        }
        
        // Note: Passwords are not imported for security
      }
    });
    
    showAlert('Configuration imported! Please re-enter passwords and save.', 'success');
    
  } catch (error) {
    showAlert('Failed to import configuration: ' + error.message, 'error');
  }
  
  // Reset file input
  event.target.value = '';
}

// Show alert message
function showAlert(message, type = 'success') {
  // Remove existing alerts
  const existing = document.querySelector('.success-message');
  if (existing) existing.remove();
  
  // Create new alert
  const alert = document.createElement('div');
  alert.className = 'success-message';
  alert.textContent = message;
  
  // Style based on type
  if (type === 'error') {
    alert.style.background = '#ef4444';
  } else if (type === 'warning') {
    alert.style.background = '#f59e0b';
  }
  
  document.body.appendChild(alert);
  
  // Remove after 3 seconds
  setTimeout(() => {
    alert.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => alert.remove(), 300);
  }, 3000);
}

// Add slide out animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);