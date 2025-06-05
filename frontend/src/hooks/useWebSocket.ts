// frontend/src/hooks/useWebSocket.ts

import { useEffect, useRef } from 'react';

// WebSocket 핸들러 타입 정의
export interface WebSocketHandlers {
  onProgress?: (nodeId: string, progress: number) => void;
  onNodeOutputUpdated?: (nodeId: string, output: string) => void;
  onNodeExecutionStart?: (nodeId: string) => void;
  onNodeExecutionComplete?: (nodeId: string) => void;
  onNodeExecutionError?: (nodeId: string, error: string) => void;
}

// 전역 WebSocket 인스턴스 (싱글톤)
let globalWs: WebSocket | null = null;
let connectionCount = 0;

export const useWebSocket = (handlers: WebSocketHandlers) => {
  const handlersRef = useRef(handlers);
  const isConnectedRef = useRef(false);

  // handlers를 ref에 저장하여 최신 상태 유지
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    // 이미 연결되어 있으면 스킵
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected, reusing existing connection');
      isConnectedRef.current = true;
      return;
    }

    // 연결 카운트 증가
    connectionCount++;
    console.log(`WebSocket connection attempt ${connectionCount}`);

    // 클라이언트 ID 생성 (한 번만)
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const connect = () => {
      try {
        // 기존 연결이 있다면 닫기
        if (globalWs) {
          globalWs.close();
          globalWs = null;
        }

        console.log('Creating new WebSocket connection...');
        const ws = new WebSocket(`ws://localhost:8000/ws/${clientId}`);
        
        ws.onopen = () => {
          console.log('WebSocket connected successfully');
          isConnectedRef.current = true;
          globalWs = ws;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // ping 메시지는 무시
            if (data.type === 'ping') {
              return;
            }
            
            // 현재 handlers ref 사용
            const currentHandlers = handlersRef.current;
            
            switch (data.type) {
              case 'progress':
                if (currentHandlers.onProgress && data.nodeId && typeof data.progress === 'number') {
                  currentHandlers.onProgress(data.nodeId, data.progress);
                }
                break;
                
              case 'node_output_updated':
                if (currentHandlers.onNodeOutputUpdated && data.nodeId && data.output) {
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
                
              default:
                console.log('Unknown WebSocket message type:', data.type);
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
            setTimeout(connect, 3000);
          }
        };
        
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setTimeout(connect, 3000);
      }
    };

    // 연결 시작
    connect();

    // Cleanup 함수 - 컴포넌트 언마운트 시에만 실행
    return () => {
      connectionCount--;
      console.log(`Component unmounting, remaining connections: ${connectionCount}`);
      
      // 마지막 컴포넌트가 언마운트될 때만 연결 종료
      if (connectionCount === 0 && globalWs) {
        console.log('Closing WebSocket connection...');
        globalWs.close(1000, 'All components unmounted');
        globalWs = null;
      }
    };
  }, []); // 빈 의존성 배열 - 한 번만 실행

  return {
    isConnected: isConnectedRef.current && globalWs?.readyState === WebSocket.OPEN
  };
};