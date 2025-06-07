// frontend/src/hooks/useWebSocket.ts - 수정된 버전
import { useEffect, useRef } from 'react';
import { WS_URL } from '../constants';

// WebSocket 메시지 타입
interface WebSocketMessage {
  type: string;
  nodeId?: string;
  progress?: number;
  output?: any;
  error?: string;
  sourceId?: string;
  targetId?: string;
}

// WebSocket 핸들러 타입 정의
export interface WebSocketHandlers {
  onProgress?: (nodeId: string, progress: number) => void;
  onNodeOutputUpdated?: (nodeId: string, output: any) => void;
  onNodeExecutionStart?: (nodeId: string) => void;
  onNodeExecutionComplete?: (nodeId: string) => void;
  onNodeExecutionError?: (nodeId: string, error: string) => void;
  onFlowProgress?: (sourceId: string, targetId: string) => void;
}

// 전역 WebSocket 인스턴스 (싱글톤)
let globalWs: WebSocket | null = null;
let connectionCount = 0;
let reconnectTimeout: NodeJS.Timeout | null = null;

export const useWebSocket = (handlers: WebSocketHandlers) => {
  const handlersRef = useRef(handlers);
  const isConnectedRef = useRef(false);

  // handlers를 ref에 저장하여 최신 상태 유지
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    // 이미 연결되어 있으면 재사용
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      isConnectedRef.current = true;
      return;
    }

    // 연결 카운트 증가
    connectionCount++;

    // 클라이언트 ID 생성
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const connect = () => {
      try {
        // 기존 연결이 있다면 정리
        if (globalWs) {
          globalWs.close();
          globalWs = null;
        }

        // 재연결 타임아웃 정리
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }

        const ws = new WebSocket(`${WS_URL}/${clientId}`);
        
        ws.onopen = () => {
          console.log('WebSocket connected');
          isConnectedRef.current = true;
          globalWs = ws;
        };

        ws.onmessage = (event) => {
          try {
            const data: WebSocketMessage = JSON.parse(event.data);
            
            // ping 메시지는 무시
            if (data.type === 'ping') {
              return;
            }
            
            // *** 중요: 모든 메시지를 window 이벤트로 전달 ***
            const customEvent = new CustomEvent('websocket_message', {
              detail: data
            });
            window.dispatchEvent(customEvent);
            
            // 현재 handlers ref 사용
            const currentHandlers = handlersRef.current;
            
            switch (data.type) {
              case 'progress':
                if (currentHandlers.onProgress && data.nodeId && typeof data.progress === 'number') {
                  currentHandlers.onProgress(data.nodeId, data.progress);
                }
                break;
                
              case 'node_output_updated':
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
                if (currentHandlers.onNodeExecutionComplete && data.nodeId) {
                  currentHandlers.onNodeExecutionComplete(data.nodeId);
                }
                break;
                
              case 'node_execution_error':
                if (currentHandlers.onNodeExecutionError && data.nodeId) {
                  currentHandlers.onNodeExecutionError(data.nodeId, data.error || 'Unknown error');
                }
                break;
                
              case 'flow_progress':
                if (currentHandlers.onFlowProgress && data.sourceId && data.targetId) {
                  currentHandlers.onFlowProgress(data.sourceId, data.targetId);
                }
                break;
                
              // 추가 메시지 타입들 (WorkerEditModal에서 사용)
              case 'ai_request':
              case 'ai_response':
              case 'ai_complete':
              case 'ai_finished':
              case 'ai_done':
              case 'ai_error':
              case 'ai_streaming':
              case 'ai_thinking':
              case 'processing':
              case 'ai_working':
              case 'execution_complete':
              case 'execution_end':
              case 'node_execution_end':
              case 'complete':
              case 'done':
              case 'finished':
              case 'output':
              case 'result':
              case 'response':
              case 'heartbeat':
              case 'keep_alive':
                // 이미 window 이벤트로 전달했으므로 추가 처리 불필요
                console.debug(`WebSocket message type '${data.type}' dispatched to window`);
                break;
                
              default:
                console.debug('Unknown WebSocket message type:', data.type);
                // 알 수 없는 메시지도 이미 window 이벤트로 전달됨
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          isConnectedRef.current = false;
        };

        ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          globalWs = null;
          isConnectedRef.current = false;
          
          // 비정상 종료 시 재연결
          if (event.code !== 1000 && event.code !== 1001) {
            console.log('Attempting to reconnect in 3 seconds...');
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
        
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    // 연결 시작
    connect();

    // Cleanup 함수
    return () => {
      connectionCount--;
      
      // 마지막 컴포넌트가 언마운트될 때만 연결 종료
      if (connectionCount === 0) {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        
        if (globalWs) {
          console.log('Closing WebSocket connection...');
          globalWs.close(1000, 'All components unmounted');
          globalWs = null;
        }
      }
    };
  }, []); // 빈 의존성 배열 - 한 번만 실행

  return {
    isConnected: isConnectedRef.current && globalWs?.readyState === WebSocket.OPEN,
    // 수동으로 메시지 전송이 필요한 경우를 위해
    sendMessage: (message: any) => {
      if (globalWs && globalWs.readyState === WebSocket.OPEN) {
        globalWs.send(JSON.stringify(message));
      }
    }
  };
};