// frontend/src/api/client.ts - 정리된 버전
import axios from 'axios';
import { API_URL } from '../constants';
import { Section, LMStudioConnection, LMStudioModel } from '../types';

// Axios 인스턴스 생성
const axiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
axiosInstance.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const apiClient = {
  // Models
  getModels: () => 
    axiosInstance.get('/models'),

  // LM Studio
  connectLMStudio: (url: string) =>
    axiosInstance.post<{
      success: boolean;
      connectionId: string;
      models: LMStudioModel[];
      url: string;
    }>('/lmstudio/connect', { url }),
  
  getLMStudioModels: (connectionId: string) =>
    axiosInstance.get<{
      models: LMStudioModel[];
      url: string;
    }>(`/lmstudio/models/${connectionId}`),

  // Sections
  getSections: () => 
    axiosInstance.get<Section[]>('/sections'),
  
  getSection: (sectionId: string) =>
    axiosInstance.get<Section>(`/sections/${sectionId}`),
  
  updateSection: (sectionId: string, data: Section) => 
    axiosInstance.put(`/sections/${sectionId}`, data),

  // Nodes
  executeNode: (nodeId: string, sectionId: string, code: string, inputs: any = {}) =>
    axiosInstance.post('/execute', { 
      nodeId, 
      sectionId, 
      code, 
      inputs 
    }),
  
  stopNode: (nodeId: string) =>
    axiosInstance.post(`/stop/${nodeId}`),
  
  deactivateNode: (nodeId: string, sectionId: string) =>
    axiosInstance.post(`/node/${nodeId}/deactivate`, { sectionId }),

  // Flow
  executeFlow: (sectionId: string) =>
    axiosInstance.post('/execute-flow', {
      sectionId,
      startNodeId: null // Will be determined by backend
    }),

  // Supervisor (Future implementation)
  executeSupervisor: (sectionId: string, supervisorId: string, targetNodeId: string) =>
    axiosInstance.post('/supervisor/execute', { 
      sectionId, 
      supervisorId, 
      targetNodeId 
    }),
  
  acceptModification: (supervisorId: string, modificationId: string) =>
    axiosInstance.post('/supervisor/accept-modification', { 
      supervisorId, 
      modificationId 
    }),
  
  rejectModification: (supervisorId: string, modificationId: string, targetNodeId: string) =>
    axiosInstance.post('/supervisor/reject-modification', { 
      supervisorId, 
      modificationId, 
      targetNodeId 
    }),

  // Planner (Future implementation)
  evaluateSection: (sectionId: string, plannerId: string) =>
    axiosInstance.post('/planner/evaluate-section', { 
      sectionId, 
      plannerId 
    }),
  
  acceptEvaluation: (plannerId: string, evaluationId: string) =>
    axiosInstance.post('/planner/accept-evaluation', { 
      plannerId, 
      evaluationId 
    }),
  
  rejectEvaluation: (plannerId: string, evaluationId: string) =>
    axiosInstance.post('/planner/reject-evaluation', { 
      plannerId, 
      evaluationId 
    }),

  // Version (Future implementation)
  getVersions: (nodeId: string) =>
    axiosInstance.get(`/versions/${nodeId}`),
  
  restoreVersion: (nodeId: string, versionId: string) =>
    axiosInstance.post('/restore-version', { 
      nodeId, 
      versionId 
    }),

  // Export (Future implementation)
  exportOutput: (sectionId: string) =>
    axiosInstance.post(`/sections/export-output/${sectionId}`)
};