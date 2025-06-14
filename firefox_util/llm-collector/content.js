// LLM Conversation Collector - Content Script
console.log('[LLM Collector Content] Script loaded on:', window.location.hostname);

// Platform detection
const PLATFORM = detectPlatform();

function detectPlatform() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('chat.openai.com')) return 'chatgpt';
  if (hostname.includes('claude.ai')) return 'claude';
  if (hostname.includes('gemini.google.com')) return 'gemini';
  if (hostname.includes('chat.deepseek.com')) return 'deepseek';
  if (hostname.includes('grok.x.ai')) return 'grok';
  if (hostname.includes('perplexity.ai')) return 'perplexity';
  
  return null;
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[LLM Collector Content] Received message:', message);
  
  if (message.action === 'collectConversations') {
    collectConversations()
      .then(conversations => {
        sendResponse({ success: true, conversations });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep the message channel open for async response
  }
  
  if (message.action === 'checkSession') {
    const isLoggedIn = checkLoginStatus();
    sendResponse({ loggedIn: isLoggedIn, platform: PLATFORM });
  }
});

// Check login status
function checkLoginStatus() {
  if (!PLATFORM) return false;
  
  switch (PLATFORM) {
    case 'chatgpt':
      return !!(document.querySelector('[data-testid="profile-button"]') || 
                document.querySelector('nav button img'));
      
    case 'claude':
      const loginButton = document.querySelector('button:has-text("Log in")');
      const chatInterface = document.querySelector('[class*="chat"]');
      return !loginButton && !!chatInterface;
      
    case 'gemini':
      return !!document.querySelector('[aria-label*="Google Account"]');
      
    case 'deepseek':
      return !!document.querySelector('[class*="avatar"]');
      
    case 'grok':
      return !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
      
    case 'perplexity':
      return !!document.querySelector('[class*="profile"]');
      
    default:
      return false;
  }
}

// Collect conversations (platform-specific)
async function collectConversations() {
  if (!PLATFORM) {
    throw new Error('Unknown platform');
  }
  
  console.log(`[LLM Collector Content] Collecting conversations for ${PLATFORM}...`);
  
  switch (PLATFORM) {
    case 'chatgpt':
      return collectChatGPTConversations();
    case 'claude':
      return collectClaudeConversations();
    case 'gemini':
      return collectGeminiConversations();
    case 'deepseek':
      return collectDeepSeekConversations();
    case 'grok':
      return collectGrokConversations();
    case 'perplexity':
      return collectPerplexityConversations();
    default:
      throw new Error(`Platform ${PLATFORM} not supported`);
  }
}

// ChatGPT collection
async function collectChatGPTConversations() {
  try {
    // Try to intercept API calls or scrape from DOM
    const conversations = [];
    
    // Look for conversation list in DOM
    const convElements = document.querySelectorAll('[class*="conversation"]');
    
    convElements.forEach((elem, index) => {
      const titleElem = elem.querySelector('[class*="title"], [class*="name"]');
      const title = titleElem ? titleElem.textContent.trim() : `Conversation ${index + 1}`;
      
      conversations.push({
        id: `chatgpt_${Date.now()}_${index}`,
        title: title,
        platform: 'chatgpt',
        created_at: new Date().toISOString(),
        element_index: index
      });
    });
    
    console.log(`[LLM Collector Content] Found ${conversations.length} ChatGPT conversations`);
    return conversations;
    
  } catch (error) {
    console.error('[LLM Collector Content] Error collecting ChatGPT conversations:', error);
    return [];
  }
}

// Claude collection
async function collectClaudeConversations() {
  try {
    const conversations = [];
    
    // Look for conversation elements
    const convElements = document.querySelectorAll('[class*="chat-"], [class*="conversation"]');
    
    convElements.forEach((elem, index) => {
      const titleElem = elem.querySelector('[class*="title"], [class*="name"], h3, h4');
      const title = titleElem ? titleElem.textContent.trim() : `Conversation ${index + 1}`;
      
      conversations.push({
        id: `claude_${Date.now()}_${index}`,
        title: title,
        platform: 'claude',
        created_at: new Date().toISOString(),
        element_index: index
      });
    });
    
    console.log(`[LLM Collector Content] Found ${conversations.length} Claude conversations`);
    return conversations;
    
  } catch (error) {
    console.error('[LLM Collector Content] Error collecting Claude conversations:', error);
    return [];
  }
}

// Gemini collection
async function collectGeminiConversations() {
  try {
    const conversations = [];
    
    // Look for conversation elements
    const convElements = document.querySelectorAll('[class*="conversation"], [class*="chat"]');
    
    convElements.forEach((elem, index) => {
      const titleElem = elem.querySelector('[class*="title"], span, div');
      const title = titleElem ? titleElem.textContent.trim() : `Conversation ${index + 1}`;
      
      conversations.push({
        id: `gemini_${Date.now()}_${index}`,
        title: title,
        platform: 'gemini',
        created_at: new Date().toISOString(),
        element_index: index
      });
    });
    
    console.log(`[LLM Collector Content] Found ${conversations.length} Gemini conversations`);
    return conversations;
    
  } catch (error) {
    console.error('[LLM Collector Content] Error collecting Gemini conversations:', error);
    return [];
  }
}

// DeepSeek collection
async function collectDeepSeekConversations() {
  try {
    const conversations = [];
    
    // Look for conversation elements
    const convElements = document.querySelectorAll('[class*="chat"], [class*="conversation"]');
    
    convElements.forEach((elem, index) => {
      const titleElem = elem.querySelector('[class*="title"], [class*="name"]');
      const title = titleElem ? titleElem.textContent.trim() : `Conversation ${index + 1}`;
      
      conversations.push({
        id: `deepseek_${Date.now()}_${index}`,
        title: title,
        platform: 'deepseek',
        created_at: new Date().toISOString(),
        element_index: index
      });
    });
    
    console.log(`[LLM Collector Content] Found ${conversations.length} DeepSeek conversations`);
    return conversations;
    
  } catch (error) {
    console.error('[LLM Collector Content] Error collecting DeepSeek conversations:', error);
    return [];
  }
}

// Grok collection
async function collectGrokConversations() {
  try {
    const conversations = [];
    
    // Look for conversation elements
    const convElements = document.querySelectorAll('[class*="chat"], [class*="conversation"]');
    
    convElements.forEach((elem, index) => {
      const titleElem = elem.querySelector('[class*="title"], span');
      const title = titleElem ? titleElem.textContent.trim() : `Conversation ${index + 1}`;
      
      conversations.push({
        id: `grok_${Date.now()}_${index}`,
        title: title,
        platform: 'grok',
        created_at: new Date().toISOString(),
        element_index: index
      });
    });
    
    console.log(`[LLM Collector Content] Found ${conversations.length} Grok conversations`);
    return conversations;
    
  } catch (error) {
    console.error('[LLM Collector Content] Error collecting Grok conversations:', error);
    return [];
  }
}

// Perplexity collection
async function collectPerplexityConversations() {
  try {
    const conversations = [];
    
    // Look for conversation elements
    const convElements = document.querySelectorAll('[class*="thread"], [class*="query"]');
    
    convElements.forEach((elem, index) => {
      const titleElem = elem.querySelector('[class*="title"], [class*="question"], h3');
      const title = titleElem ? titleElem.textContent.trim() : `Query ${index + 1}`;
      
      conversations.push({
        id: `perplexity_${Date.now()}_${index}`,
        title: title,
        platform: 'perplexity',
        created_at: new Date().toISOString(),
        element_index: index
      });
    });
    
    console.log(`[LLM Collector Content] Found ${conversations.length} Perplexity conversations`);
    return conversations;
    
  } catch (error) {
    console.error('[LLM Collector Content] Error collecting Perplexity conversations:', error);
    return [];
  }
}

// Auto-report platform when page loads
if (PLATFORM) {
  console.log(`[LLM Collector Content] Detected platform: ${PLATFORM}`);
  
  // Send platform info to background script
  browser.runtime.sendMessage({
    action: 'platformDetected',
    platform: PLATFORM,
    url: window.location.href
  });
}