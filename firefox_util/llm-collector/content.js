// LLM Conversation Collector - Content Script
console.log('[LLM Collector Content] Loaded on:', window.location.hostname);

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

// Monitor for session changes
if (PLATFORM) {
  console.log(`[LLM Collector Content] Detected platform: ${PLATFORM}`);
  
  // Observe DOM changes to detect login/logout
  const observer = new MutationObserver(() => {
    // Notify background script about potential session change
    browser.runtime.sendMessage({
      action: 'sessionMayHaveChanged',
      platform: PLATFORM,
      url: window.location.href
    }).catch(() => {
      // Extension might not be ready
    });
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Initial report
  browser.runtime.sendMessage({
    action: 'platformDetected',
    platform: PLATFORM,
    url: window.location.href
  }).catch(() => {
    // Extension might not be ready
  });
}

// Listen for collection requests from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ pong: true, platform: PLATFORM });
  }
});