// frontend/src/hooks/useWebSocket.ts - ping/pong 제거 버전

import { useEffect, useRef, useCallback } from 'react';

// WebSocket 메시지 타입
interface WebSocketMessage {
  type: string;
  nodeId?: string;
  progress?: number;
  output?: any;
  error?: string;
  sourceId?: string;
  targetId?: string;
  message?: string;
  data?: any;
}

// WebSocket 핸들러 타입 정의
export interface WebSocketHandlers {
  onProgress?: (nodeId: string, progress: number) => void;
  onNodeOutputUpdated?: (nodeId: string, output: any) => void;
  onNodeExecutionStart?: (nodeId: string) => void;
  onNodeExecutionComplete?: (nodeId: string) => void;
  onNodeExecutionError?: (nodeId: string, error: string) => void;
  onFlowProgress?: (sourceId: string, targetId: string) => void;
  onSystemMetrics?: (metrics: any) => void;
  onTrainingProgress?: (data: any) => void;
}

// 시스템별 전역 WebSocket 인스턴스 (싱글톤)
const globalConnections: {
  [key: string]: {
    ws: WebSocket | null;
    connectionCount: number;
    reconnectTimeout: NodeJS.Timeout | null;
  }
} = {};

export function useWebSocket(
  handlers: WebSocketHandlers,
  system: 'oneai' | 'argosa' | 'neuronet' = 'oneai'
) {
  const handlersRef = useRef(handlers);
  const isConnectedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  // handlers를 ref에 저장하여 최신 상태 유지
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const connect = useCallback(() => {
    // 시스템별 연결 정보 초기화
    if (!globalConnections[system]) {
      globalConnections[system] = {
        ws: null,
        connectionCount: 0,
        reconnectTimeout: null
      };
    }

    const systemConnection = globalConnections[system];

    // 이미 연결되어 있으면 재사용
    if (systemConnection.ws && systemConnection.ws.readyState === WebSocket.OPEN) {
      isConnectedRef.current = true;
      return;
    }

    // 재연결 타임아웃 정리
    if (systemConnection.reconnectTimeout) {
      clearTimeout(systemConnection.reconnectTimeout);
      systemConnection.reconnectTimeout = null;
    }

    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const wsUrl = system === 'oneai' 
      ? `ws://localhost:8000/ws/${clientId}`  // OneAI는 기존 경로 유지 (호환성)
      : `ws://localhost:8000/api/${system}/ws/${clientId}`;
    
    console.log(`[WebSocket] Connecting to ${system} at ${wsUrl}...`);
    
    try {
      // 기존 연결이 있다면 정리
      if (systemConnection.ws) {
        systemConnection.ws.close();
        systemConnection.ws = null;
      }

      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log(`[WebSocket] Connected to ${system}`);
        isConnectedRef.current = true;
        systemConnection.ws = ws;
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          
          // ping/pong 처리 제거됨
          
          // *** 중요: 모든 메시지를 window 이벤트로 전달 ***
          const customEvent = new CustomEvent('websocket_message', {
            detail: { ...data, system }
          });
          window.dispatchEvent(customEvent);
          
          // 현재 handlers ref 사용
          const currentHandlers = handlersRef.current;

          // Route messages to appropriate handlers
          switch (data.type) {
            case 'progress':
              if (currentHandlers.onProgress && data.nodeId && typeof data.progress === 'number') {
                currentHandlers.onProgress(data.nodeId, data.progress);
              }
              break;
              
            case 'node_output_updated':
            case 'output':
            case 'result':
            case 'response':
              if (currentHandlers.onNodeOutputUpdated && data.nodeId && data.output !== undefined) {
                currentHandlers.onNodeOutputUpdated(data.nodeId, data.output);
              }
              break;
              
            case 'node_execution_start':
              if (currentHandlers.onNodeExecutionStart && data.nodeId) {
                currentHandlers.onNodeExecutionStart(data.nodeId);
              }
              break;
              
            case 'node_execution_complete':
            case 'execution_complete':
            case 'execution_end':
            case 'node_execution_end':
            case 'complete':
            case 'done':
            case 'finished':
            case 'ai_complete':
            case 'ai_finished':
            case 'ai_done':
              if (currentHandlers.onNodeExecutionComplete && data.nodeId) {
                currentHandlers.onNodeExecutionComplete(data.nodeId);
              }
              // output이 있으면 함께 처리
              if (data.output !== undefined && currentHandlers.onNodeOutputUpdated && data.nodeId) {
                currentHandlers.onNodeOutputUpdated(data.nodeId, data.output);
              }
              break;
              
            case 'node_execution_error':
            case 'ai_error':
              if (currentHandlers.onNodeExecutionError && data.nodeId) {
                currentHandlers.onNodeExecutionError(data.nodeId, data.error || 'Unknown error');
              }
              break;
              
            case 'flow_progress':
              if (currentHandlers.onFlowProgress && data.sourceId && data.targetId) {
                currentHandlers.onFlowProgress(data.sourceId, data.targetId);
              }
              break;
              
            case 'system_metrics':
              if (currentHandlers.onSystemMetrics && data.data) {
                currentHandlers.onSystemMetrics(data.data);
              }
              break;
              
            case 'training_progress':
              if (currentHandlers.onTrainingProgress) {
                currentHandlers.onTrainingProgress(data);
              }
              break;
              
            // AI 관련 메시지 타입들 (WorkerEditModal 등에서 사용)
            case 'ai_request':
            case 'ai_response':
            case 'ai_streaming':
            case 'ai_thinking':
            case 'processing':
            case 'ai_working':
            case 'keep_alive':
              // 이미 window 이벤트로 전달했으므로 추가 처리 불필요
              console.debug(`[WebSocket] Message type '${data.type}' dispatched to window`);
              break;
              
            // Argosa 관련 메시지 (ping/pong 제거)
            case 'state_update':
              // Argosa state update는 window 이벤트로만 처리
              console.debug(`[WebSocket] State update dispatched to window`);
              break;
              
            default:
              console.debug(`[WebSocket] Unknown message type: ${data.type}`);
              // 알 수 없는 메시지도 이미 window 이벤트로 전달됨
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error(`[WebSocket] Error in ${system}:`, error);
        isConnectedRef.current = false;
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] Disconnected from ${system}:`, event.code, event.reason);
        systemConnection.ws = null;
        isConnectedRef.current = false;
        
        // 비정상 종료 시 재연결
        if (event.code !== 1000 && event.code !== 1001) {
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current += 1;
            console.log(`[WebSocket] Reconnecting to ${system}... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
            
            systemConnection.reconnectTimeout = setTimeout(() => {
              connect();
            }, reconnectDelay);
          } else {
            console.error(`[WebSocket] Max reconnection attempts reached for ${system}`);
          }
        }
      };
      
    } catch (error) {
      console.error(`[WebSocket] Failed to create WebSocket for ${system}:`, error);
      systemConnection.reconnectTimeout = setTimeout(connect, reconnectDelay);
    }
  }, [system]);

  useEffect(() => {
    // 시스템별 연결 정보 초기화
    if (!globalConnections[system]) {
      globalConnections[system] = {
        ws: null,
        connectionCount: 0,
        reconnectTimeout: null
      };
    }

    const systemConnection = globalConnections[system];
    
    // 연결 카운트 증가
    systemConnection.connectionCount++;

    // 연결 시작
    connect();

    // Cleanup 함수
    return () => {
      systemConnection.connectionCount--;
      
      // 마지막 컴포넌트가 언마운트될 때만 연결 종료
      if (systemConnection.connectionCount === 0) {
        if (systemConnection.reconnectTimeout) {
          clearTimeout(systemConnection.reconnectTimeout);
          systemConnection.reconnectTimeout = null;
        }
        
        if (systemConnection.ws) {
          console.log(`[WebSocket] Closing ${system} connection...`);
          systemConnection.ws.close(1000, 'All components unmounted');
          systemConnection.ws = null;
        }
      }
    };
  }, [connect, system]);

  // 수동으로 메시지 전송이 필요한 경우를 위해
  const sendMessage = useCallback((message: any) => {
    const systemConnection = globalConnections[system];
    if (systemConnection?.ws && systemConnection.ws.readyState === WebSocket.OPEN) {
      systemConnection.ws.send(JSON.stringify(message));
    } else {
      console.warn(`[WebSocket] Cannot send message - ${system} not connected`);
    }
  }, [system]);

  return {
    isConnected: isConnectedRef.current && globalConnections[system]?.ws?.readyState === WebSocket.OPEN,
    reconnect: connect,
    sendMessage
  };
}