# Rapid Toggle Fix Summary

## Issue
The Firefox and Extension connection status indicators were rapidly toggling between on/off states in the frontend.

## Root Causes Identified

1. **Multiple State Update Sources**: Both `handle_native_status` and `handle_native_message` were updating the same states
2. **WebSocket Import Error**: The WebSocket handler was trying to import a non-existent function
3. **No Debouncing**: Status changes were being broadcast immediately without any debouncing
4. **Native Connection Instability**: The native messaging connection might be dropping and reconnecting rapidly
5. **Frontend Effect Dependency**: The main initialization effect had dependencies that could cause it to re-run

## Changes Made

### 1. Backend - Firefox Manager (`/backend/routers/argosa/shared/firefox_manager.py`)
- Added detailed logging to track state changes
- Removed duplicate state updates in `handle_native_status`
- Added broadcast state logging to track when state updates are sent
- Removed redundant firefox_status updates when extension connects

### 2. Backend - Data Collection (`/backend/routers/argosa/data_collection.py`)
- Fixed WebSocket handler to use correct method name (`websocket_handler` instead of `handle_websocket`)
- Delegated all native status handling to Firefox Manager to avoid duplication
- Removed duplicate state update logic

### 3. Frontend - DataCollection Component (`/frontend/src/components/Argosa/function/DataCollection.tsx`)
- Fixed useEffect dependency array to prevent re-initialization
- Added timestamps to WebSocket state update logs for better debugging

### 4. Extension - Background Script (`/firefox_util/llm-collector/background.js`)
- Added 500ms debouncing to `notifyBackendStatus` to prevent rapid notifications
- Added rapid disconnect detection (disconnects within 2 seconds of connection)
- Increased reconnection delay when rapid disconnects are detected
- Added connection time tracking to detect unstable connections

## Testing

To verify the fix works:

1. Start the backend server
2. Start the frontend
3. Load the Firefox extension
4. Monitor the browser console and backend logs
5. The status indicators should change smoothly without rapid toggling

## Monitoring

Look for these patterns in the logs:
- `🔥 [FirefoxManager] State updated:` - Shows when state changes occur
- `🔥🔥🔥 [FirefoxManager] BROADCASTING STATE:` - Shows when state is broadcast to WebSocket clients
- `[Extension] Rapid disconnect detected!` - Indicates connection instability
- WebSocket timestamps in frontend console - Shows frequency of updates

## Future Improvements

1. Consider implementing a more robust connection health check
2. Add metrics to track connection stability
3. Implement exponential backoff with jitter for reconnections
4. Consider using a state machine for more predictable state transitions