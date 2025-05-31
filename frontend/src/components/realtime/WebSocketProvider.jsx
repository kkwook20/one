// frontend/src/components/realtime/WebSocketProvider.jsx
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';

const WebSocketContext = createContext(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider = ({ 
  children, 
  url = 'ws://localhost:8000/ws',
  reconnectInterval = 3000,
  maxReconnectAttempts = 5
}) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [lastMessage, setLastMessage] = useState(null);
  const [messageQueue, setMessageQueue] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // connecting, connected, disconnected, error
  
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const messageHandlers = useRef(new Map());
  const clientId = useRef(`client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // Register message handler
  const on = useCallback((event, handler) => {
    if (!messageHandlers.current.has(event)) {
      messageHandlers.current.set(event, new Set());
    }
    messageHandlers.current.get(event).add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = messageHandlers.current.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          messageHandlers.current.delete(event);
        }
      }
    };
  }, []);

  // Send message
  const send = useCallback((message) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const messageWithId = {
        ...message,
        clientId: clientId.current,
        timestamp: new Date().toISOString()
      };
      socketRef.current.send(JSON.stringify(messageWithId));
      return true;
    } else {
      // Queue message if not connected
      setMessageQueue(prev => [...prev, message]);
      return false;
    }
  }, []);

  // Subscribe to channel
  const subscribe = useCallback((channel) => {
    return send({
      type: 'subscribe',
      channel
    });
  }, [send]);

  // Unsubscribe from channel
  const unsubscribe = useCallback((channel) => {
    return send({
      type: 'unsubscribe',
      channel
    });
  }, [send]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');
    
    try {
      const ws = new WebSocket(`${url}/${clientId.current}`);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        setReconnectAttempt(0);
        
        // Send queued messages
        if (messageQueue.length > 0) {
          messageQueue.forEach(msg => {
            ws.send(JSON.stringify({
              ...msg,
              clientId: clientId.current,
              timestamp: new Date().toISOString()
            }));
          });
          setMessageQueue([]);
        }
        
        // Send initial ping
        ws.send(JSON.stringify({ type: 'ping' }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessage(message);
          
          // Handle system messages
          if (message.type === 'pong') {
            return;
          }
          
          // Dispatch to registered handlers
          const handlers = messageHandlers.current.get(message.type);
          if (handlers) {
            handlers.forEach(handler => {
              try {
                handler(message);
              } catch (error) {
                console.error('Error in message handler:', error);
              }
            });
          }
          
          // Also dispatch to 'all' handlers
          const allHandlers = messageHandlers.current.get('all');
          if (allHandlers) {
            allHandlers.forEach(handler => {
              try {
                handler(message);
              } catch (error) {
                console.error('Error in all message handler:', error);
              }
            });
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setConnectionStatus('disconnected');
        socketRef.current = null;
        
        // Attempt reconnection
        if (reconnectAttempt < maxReconnectAttempts) {
          const timeout = reconnectInterval * Math.pow(2, reconnectAttempt);
          console.log(`Reconnecting in ${timeout}ms (attempt ${reconnectAttempt + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempt(prev => prev + 1);
            connect();
          }, timeout);
        } else {
          setConnectionStatus('error');
          console.error('Max reconnection attempts reached');
        }
      };

      socketRef.current = ws;
      setSocket(ws);
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setConnectionStatus('error');
    }
  }, [url, reconnectInterval, maxReconnectAttempts, messageQueue]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    
    setSocket(null);
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setReconnectAttempt(0);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    // Heartbeat interval
    const heartbeatInterval = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'ping' });
      }
    }, 30000); // 30 seconds
    
    return () => {
      clearInterval(heartbeatInterval);
      disconnect();
    };
  }, [connect, disconnect, send]);

  const value = {
    socket,
    isConnected,
    connectionStatus,
    lastMessage,
    send,
    on,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
    clientId: clientId.current
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
      
      {/* Connection Status Indicator */}
      <div className="fixed bottom-4 right-4 z-50">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg transition-all ${
          connectionStatus === 'connected' ? 'bg-green-500/20 border border-green-500/50' :
          connectionStatus === 'connecting' ? 'bg-yellow-500/20 border border-yellow-500/50' :
          connectionStatus === 'error' ? 'bg-red-500/20 border border-red-500/50' :
          'bg-gray-500/20 border border-gray-500/50'
        }`}>
          {connectionStatus === 'connected' ? (
            <>
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400">Connected</span>
            </>
          ) : connectionStatus === 'connecting' ? (
            <>
              <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-yellow-400">Connecting...</span>
            </>
          ) : connectionStatus === 'error' ? (
            <>
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400">Connection Error</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-400">Disconnected</span>
            </>
          )}
          
          {reconnectAttempt > 0 && connectionStatus !== 'connected' && (
            <span className="text-xs text-gray-400">
              (Retry {reconnectAttempt}/{maxReconnectAttempts})
            </span>
          )}
        </div>
      </div>
    </WebSocketContext.Provider>
  );
};

export default WebSocketProvider;