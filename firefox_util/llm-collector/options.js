// options.js - LLM Collector Settings Page

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  // Add API status check
  await checkAPIConnection();
});

// Load settings from storage
async function loadSettings() {
  const settings = await browser.storage.local.get([
    'dataFolder',
    'syncInterval',
    'platforms',
    'maxConversations',
    'delayBetweenActions',
    'useAPI',  // Add this
    'apiUrl'   // Add this
  ]);
  
  // Set form values
  document.getElementById('dataFolder').value = settings.dataFolder || '/home/user/llm-conversations';
  document.getElementById('syncInterval').value = settings.syncInterval || 1440;
  document.getElementById('maxConversations').value = settings.maxConversations || 1000;
  document.getElementById('delayBetweenActions').value = settings.delayBetweenActions || 3;
  
  // API settings
  if (settings.useAPI !== undefined) {
    const apiToggle = document.getElementById('apiToggle');
    const apiSettings = document.getElementById('apiSettings');
    
    if (settings.useAPI) {
      apiToggle.classList.add('active');
      apiSettings.style.display = 'block';
    }
  }
  
  if (settings.apiUrl) {
    document.getElementById('apiUrl').value = settings.apiUrl;
  }
  
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
  
  // API toggle
  document.getElementById('apiToggle').addEventListener('click', toggleAPI);
  
  // Test API button
  document.getElementById('testApiBtn').addEventListener('click', testAPIConnection);
  
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

// Toggle API mode
async function toggleAPI() {
  const toggle = document.getElementById('apiToggle');
  const apiSettings = document.getElementById('apiSettings');
  const isActive = toggle.classList.contains('active');
  
  if (!isActive) {
    toggle.classList.add('active');
    apiSettings.style.display = 'block';
    
    // Animate in
    apiSettings.style.opacity = '0';
    apiSettings.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      apiSettings.style.transition = 'all 0.3s ease';
      apiSettings.style.opacity = '1';
      apiSettings.style.transform = 'translateY(0)';
    }, 10);
    
    // Check connection
    await checkAPIConnection();
  } else {
    toggle.classList.remove('active');
    apiSettings.style.transition = 'all 0.3s ease';
    apiSettings.style.opacity = '0';
    setTimeout(() => {
      apiSettings.style.display = 'none';
    }, 300);
  }
}

// Check API connection
async function checkAPIConnection() {
  const statusDot = document.getElementById('apiStatusDot');
  const statusText = document.getElementById('apiStatusText');
  const apiUrl = document.getElementById('apiUrl').value;
  
  if (!document.getElementById('apiToggle').classList.contains('active')) {
    return;
  }
  
  statusText.textContent = 'Checking connection...';
  statusDot.classList.remove('connected');
  
  try {
    // Extract base URL and check status endpoint
    const baseUrl = apiUrl.replace('/llm', '');
    const response = await fetch(baseUrl.replace('/argosa', '/argosa/status'));
    
    if (response.ok) {
      const data = await response.json();
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected to Argosa backend';
      statusText.style.color = '#059669';
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = 'Backend not responding';
      statusText.style.color = '#dc2626';
    }
  } catch (error) {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Cannot connect to backend';
    statusText.style.color = '#dc2626';
  }
}

// Test API connection
async function testAPIConnection() {
  await checkAPIConnection();
  
  const statusText = document.getElementById('apiStatusText').textContent;
  if (statusText.includes('Connected')) {
    showAlert('✅ API connection successful!', 'success');
  } else {
    showAlert('❌ API connection failed. Make sure the backend is running.', 'error');
  }
}

// Save settings
async function saveSettings() {
  const settings = {
    dataFolder: document.getElementById('dataFolder').value,
    syncInterval: parseInt(document.getElementById('syncInterval').value),
    maxConversations: parseInt(document.getElementById('maxConversations').value),
    delayBetweenActions: parseInt(document.getElementById('delayBetweenActions').value),
    useAPI: document.getElementById('apiToggle').classList.contains('active'),
    apiUrl: document.getElementById('apiUrl').value,
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
  
  // Notify background script about API mode change
  if (settings.useAPI) {
    browser.runtime.sendMessage({ 
      action: 'enableAPIMode', 
      apiUrl: settings.apiUrl 
    });
  }
  
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
      dataFolder: data.dataFolder,
      syncInterval: data.syncInterval,
      maxConversations: data.maxConversations,
      delayBetweenActions: data.delayBetweenActions,
      useAPI: data.useAPI,
      apiUrl: data.apiUrl
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
    if (data.settings.dataFolder) {
      document.getElementById('dataFolder').value = data.settings.dataFolder;
    }
    if (data.settings.syncInterval) {
      document.getElementById('syncInterval').value = data.settings.syncInterval;
    }
    if (data.settings.maxConversations) {
      document.getElementById('maxConversations').value = data.settings.maxConversations;
    }
    if (data.settings.delayBetweenActions) {
      document.getElementById('delayBetweenActions').value = data.settings.delayBetweenActions;
    }
    
    // Update API settings
    if (data.settings.useAPI !== undefined) {
      const apiToggle = document.getElementById('apiToggle');
      const apiSettings = document.getElementById('apiSettings');
      
      if (data.settings.useAPI) {
        apiToggle.classList.add('active');
        apiSettings.style.display = 'block';
      } else {
        apiToggle.classList.remove('active');
        apiSettings.style.display = 'none';
      }
    }
    
    if (data.settings.apiUrl) {
      document.getElementById('apiUrl').value = data.settings.apiUrl;
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