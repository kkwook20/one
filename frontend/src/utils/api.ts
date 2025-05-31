import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

// API 기본 URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

// Axios 인스턴스 생성
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 요청 인터셉터
apiClient.interceptors.request.use(
  (config) => {
    // 토큰이 있다면 추가
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // 인증 오류 처리
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API 메서드들
export const api = {
  // 노드 관련
  nodes: {
    async getConfig(nodeId: string) {
      const response = await apiClient.get(`/api/nodes/${nodeId}/config`);
      return response.data;
    },

    async updateConfig(nodeId: string, config: any) {
      const response = await apiClient.post(`/api/nodes/${nodeId}/config`, config);
      return response.data;
    },

    async execute(nodeId: string, nodeType: string, data: any) {
      const response = await apiClient.post(`/api/nodes/${nodeId}/execute`, {
        nodeType,
        ...data,
      });
      return response.data;
    },

    async getHistory(nodeId: string) {
      const response = await apiClient.get(`/api/nodes/${nodeId}/history`);
      return response.data;
    },

    async getFiles(nodeId: string) {
      const response = await apiClient.get(`/api/nodes/${nodeId}/files`);
      return response.data;
    },

    async uploadFile(nodeId: string, file: File) {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiClient.post(`/api/nodes/${nodeId}/files`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },

    async deleteFile(nodeId: string, filename: string) {
      const response = await apiClient.delete(`/api/nodes/${nodeId}/files/${filename}`);
      return response.data;
    },
  },

  // 워크플로우 관련
  workflows: {
    async list() {
      const response = await apiClient.get('/api/workflows');
      return response.data;
    },

    async get(workflowId: string) {
      const response = await apiClient.get(`/api/workflows/${workflowId}`);
      return response.data;
    },

    async save(workflowId: string, data: any) {
      const response = await apiClient.post(`/api/workflows/${workflowId}`, data);
      return response.data;
    },

    async delete(workflowId: string) {
      const response = await apiClient.delete(`/api/workflows/${workflowId}`);
      return response.data;
    },

    async export(workflowId: string) {
      const response = await apiClient.get(`/api/workflows/${workflowId}/export`, {
        responseType: 'blob',
      });
      return response.data;
    },

    async import(file: File) {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiClient.post('/api/workflows/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },

    async execute(workflowId: string) {
      const response = await apiClient.post(`/api/workflows/${workflowId}/execute`);
      return response.data;
    },

    async getExecutions(workflowId: string) {
      const response = await apiClient.get(`/api/workflows/${workflowId}/executions`);
      return response.data;
    },
  },

  // 변수 관련
  variables: {
    async list() {
      const response = await apiClient.get('/api/variables');
      return response.data;
    },

    async get(name: string) {
      const response = await apiClient.get(`/api/variables/${name}`);
      return response.data;
    },

    async set(name: string, value: any, persist: boolean = false) {
      const response = await apiClient.post('/api/variables', {
        name,
        value,
        persist
      });
      return response.data;
    },

    async delete(name: string) {
      const response = await apiClient.delete(`/api/variables/${name}`);
      return response.data;
    },

    async search(query: string) {
      const response = await apiClient.get('/api/variables/search', {
        params: { q: query }
      });
      return response.data;
    },

    async bulkSet(variables: Array<{ name: string; value: any }>) {
      const response = await apiClient.post('/api/variables/bulk', { variables });
      return response.data;
    },
  },

  // 스토리지 관련
  storage: {
    async getStats() {
      const response = await apiClient.get('/api/storage/stats');
      return response.data;
    },

    async listFiles(path: string = '', options?: { recursive?: boolean; fileType?: string }) {
      const response = await apiClient.get('/api/storage/files', {
        params: { path, ...options },
      });
      return response.data;
    },

    async uploadFile(file: File, path: string) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      
      const response = await apiClient.post('/api/storage/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          );
          console.log(`Upload progress: ${percentCompleted}%`);
        },
      });
      return response.data;
    },

    async downloadFile(path: string) {
      const response = await apiClient.get(`/api/storage/download`, {
        params: { path },
        responseType: 'blob',
      });
      return response.data;
    },

    async deleteFile(path: string) {
      const response = await apiClient.delete('/api/storage/file', {
        params: { path },
      });
      return response.data;
    },

    async createFolder(path: string) {
      const response = await apiClient.post('/api/storage/folder', { path });
      return response.data;
    },

    async cleanupOldFiles(daysOld: number) {
      const response = await apiClient.post('/api/storage/cleanup', { daysOld });
      return response.data;
    },
  },

  // 시스템 관련
  system: {
    async getStatus() {
      const response = await apiClient.get('/api/system/status');
      return response.data;
    },

    async getResources() {
      const response = await apiClient.get('/api/system/resources');
      return response.data;
    },

    async getLogs(options?: { level?: string; limit?: number; offset?: number }) {
      const response = await apiClient.get('/api/system/logs', {
        params: options,
      });
      return response.data;
    },

    async getMetrics() {
      const response = await apiClient.get('/api/system/metrics');
      return response.data;
    },
  },

  // 웹훅 관련
  webhooks: {
    async list() {
      const response = await apiClient.get('/api/webhooks');
      return response.data;
    },

    async create(data: { name: string; events: string[]; active: boolean }) {
      const response = await apiClient.post('/api/webhooks', data);
      return response.data;
    },

    async get(webhookId: string) {
      const response = await apiClient.get(`/api/webhooks/${webhookId}`);
      return response.data;
    },

    async update(webhookId: string, data: Partial<{ name: string; events: string[]; active: boolean }>) {
      const response = await apiClient.patch(`/api/webhooks/${webhookId}`, data);
      return response.data;
    },

    async delete(webhookId: string) {
      const response = await apiClient.delete(`/api/webhooks/${webhookId}`);
      return response.data;
    },

    async getLogs(webhookId: string) {
      const response = await apiClient.get(`/api/webhooks/${webhookId}/logs`);
      return response.data;
    },
  },
};

// WebSocket 연결 클래스
export class WorkflowWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private clientId: string;
  
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private connectionHandlers: (() => void)[] = [];
  private disconnectionHandlers: (() => void)[] = [];

  constructor(clientId?: string) {
    this.clientId = clientId || `client-${Date.now()}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${WS_BASE_URL}/ws/${this.clientId}`);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.connectionHandlers.forEach(handler => handler());
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const type = data.type;
            
            if (type && this.messageHandlers.has(type)) {
              this.messageHandlers.get(type)?.forEach(handler => handler(data));
            }
            
            // 'all' 핸들러는 모든 메시지를 받음
            if (this.messageHandlers.has('all')) {
              this.messageHandlers.get('all')?.forEach(handler => handler(data));
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.disconnectionHandlers.forEach(handler => handler());
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  on(event: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event)?.push(handler);
  }

  off(event: string, handler: (data: any) => void): void {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  onConnect(handler: () => void): void {
    this.connectionHandlers.push(handler);
  }

  onDisconnect(handler: () => void): void {
    this.disconnectionHandlers.push(handler);
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getClientId(): string {
    return this.clientId;
  }
}

// 파일 업로드 헬퍼
export async function uploadFiles(
  files: FileList | File[],
  path: string,
  onProgress?: (progress: number) => void
): Promise<any[]> {
  const fileArray = Array.from(files);
  const results: any[] = [];
  let completedFiles = 0;

  for (const file of fileArray) {
    try {
      const result = await api.storage.uploadFile(file, path);
      results.push(result);
      completedFiles++;
      
      if (onProgress) {
        onProgress((completedFiles / fileArray.length) * 100);
      }
    } catch (error) {
      console.error(`Failed to upload file ${file.name}:`, error);
      results.push({ error: true, fileName: file.name, message: error });
    }
  }

  return results;
}

// 에러 처리 헬퍼
export function handleApiError(error: any): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      // 서버가 응답을 반환한 경우
      return error.response.data.message || error.response.data.error || 'Server error occurred';
    } else if (error.request) {
      // 요청이 전송되었지만 응답을 받지 못한 경우
      return 'No response from server. Please check your connection.';
    }
  }
  
  // 기타 에러
  return error.message || 'An unexpected error occurred';
}

// 기본 export
export default api;