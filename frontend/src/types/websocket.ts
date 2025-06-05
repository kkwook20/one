// frontend/src/types/websocket.ts

export interface WebSocketHandlers {
  onProgress?: (nodeId: string, progress: number) => void;
  onNodeOutputUpdated?: (nodeId: string, output: string) => void;
  onNodeExecutionStart?: (nodeId: string) => void;
  onNodeExecutionComplete?: (nodeId: string) => void;
  onNodeExecutionError?: (nodeId: string, error: string) => void;
}