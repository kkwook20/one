# Fix for Rapid Toggle Issue

## Root Cause
The rapid toggling is caused by WebSocket disconnections and reconnections creating a loop of state updates.

## Solution
1. Prevent aggressive Firefox auto-start on backend initialization
2. Fix WebSocket stability issues
3. Add proper state caching to prevent redundant updates

## Immediate Fix
In the browser console, run this to stop the toggling:

```javascript
// Stop WebSocket reconnections temporarily
if (window.wsRef && window.wsRef.current) {
    window.wsRef.current.close();
    window.wsRef = { current: null };
}

// Clear any reconnect timers
if (window.reconnectTimeoutRef && window.reconnectTimeoutRef.current) {
    clearTimeout(window.reconnectTimeoutRef.current);
}
```

## Permanent Fix
The backend needs to:
1. Not mark extension as disconnected on startup
2. Maintain stable WebSocket connections
3. Only broadcast actual state changes, not metadata updates