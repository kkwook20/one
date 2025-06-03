// Related files:
// - frontend/src/App.tsx
// - frontend/src/constants/index.ts
// - frontend/src/types/index.ts
// Location: frontend/src/hooks/useWebSocket.ts

import { useEffect, useRef, useState } from 'react';
import { WS_URL } from '../constants';
import { Section } from '../types';

export interface WebSocketHandlers {
  onProgress?: (nodeId: string, progress: number) => void;
  onNodeOutputUpdated?: (nodeId: string, output: any) => void;
  onNodeSupervised?: (data: any) => void;
  onModificationAccepted?: (data: any) => void;
  onModificationRejected?: (data: any) => void;
  onSectionEvaluated?: (data: any) => void;
  onOutputNodeUpdated?: (data: any) => void;
}

export const useWebSocket = (handlers: WebSocketHandlers) => {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const clientId = `client-${Date.now()}`;
    wsRef.current = new WebSocket(`${WS_URL}/ws/${clientId}`);
    
    wsRef.current.onopen = () => {
      setIsConnected(true);
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
    };
    
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'progress':
          handlers.onProgress?.(data.nodeId, data.progress);
          break;
        
        case 'node_output_updated':
          handlers.onNodeOutputUpdated?.(data.data.nodeId, data.data.output);
          break;
        
        case 'node_supervised':
          handlers.onNodeSupervised?.(data.data);
          break;
        
        case 'modification_accepted':
          handlers.onModificationAccepted?.(data.data);
          break;
        
        case 'modification_rejected':
          handlers.onModificationRejected?.(data.data);
          break;
        
        case 'section_evaluated':
          handlers.onSectionEvaluated?.(data.data);
          break;
        case 'output_node_updated':
          handlers.onOutputNodeUpdated?.(data.data);
          break;
      }
    };
    
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return { isConnected, ws: wsRef.current };
};