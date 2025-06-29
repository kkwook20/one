// Stop Toggle Script - paste this in browser console
// This script will prevent rapid state toggling

(function() {
    console.log("🛑 Installing toggle prevention...");
    
    // Find the WebSocket connection
    let ws = null;
    const originalWS = window.WebSocket;
    
    window.WebSocket = function(...args) {
        const instance = new originalWS(...args);
        
        // Intercept messages
        const originalOnMessage = instance.onmessage;
        instance.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                
                // Block rapid state changes
                if (data.type === 'system_state') {
                    const now = Date.now();
                    if (!window.lastStateUpdate || now - window.lastStateUpdate > 5000) {
                        // Only allow state updates every 5 seconds
                        window.lastStateUpdate = now;
                        console.log("✅ Allowing state update");
                        originalOnMessage.call(this, event);
                    } else {
                        console.log("🚫 Blocking rapid state update");
                    }
                } else {
                    originalOnMessage.call(this, event);
                }
            } catch (e) {
                originalOnMessage.call(this, event);
            }
        };
        
        ws = instance;
        console.log("✅ WebSocket intercepted");
        return instance;
    };
    
    console.log("✅ Toggle prevention installed!");
    console.log("Reload the page for it to take effect");
})();