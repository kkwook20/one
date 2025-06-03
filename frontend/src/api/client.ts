// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/*.tsx
// - frontend/src/types/index.ts
// - frontend/src/constants/index.ts
// Location: frontend/src/api/client.ts

import axios from 'axios';
import { API_URL } from '../constants';
import { Section, Node } from '../types';

export const apiClient = {
  // Models
  getModels: () => axios.get(`${API_URL}/models`),

  // Sections
  updateSection: (sectionId: string, data: Section) => 
    axios.put(`${API_URL}/sections/${sectionId}`, data),

  // Nodes
  executeNode: (nodeId: string, sectionId: string, code: string, inputs: any) =>
    axios.post(`${API_URL}/execute`, { nodeId, sectionId, code, inputs }),
  
  stopNode: (nodeId: string) =>
    axios.post(`${API_URL}/stop/${nodeId}`),
  
  deactivateNode: (nodeId: string, sectionId: string) =>
    axios.post(`${API_URL}/node/${nodeId}/deactivate`, { sectionId }),

  // Supervisor
  executeSupervisor: (sectionId: string, supervisorId: string, targetNodeId: string) =>
    axios.post(`${API_URL}/supervisor/execute`, { sectionId, supervisorId, targetNodeId }),
  
  acceptModification: (supervisorId: string, modificationId: string) =>
    axios.post(`${API_URL}/supervisor/accept-modification`, { supervisorId, modificationId }),
  
  rejectModification: (supervisorId: string, modificationId: string, targetNodeId: string) =>
    axios.post(`${API_URL}/supervisor/reject-modification`, { supervisorId, modificationId, targetNodeId }),

  // Planner
  evaluateSection: (sectionId: string, plannerId: string) =>
    axios.post(`${API_URL}/planner/evaluate-section`, { sectionId, plannerId }),
  
  acceptEvaluation: (plannerId: string, evaluationId: string) =>
    axios.post(`${API_URL}/planner/accept-evaluation`, { plannerId, evaluationId }),
  
  rejectEvaluation: (plannerId: string, evaluationId: string) =>
    axios.post(`${API_URL}/planner/reject-evaluation`, { plannerId, evaluationId }),

  // Version
  getVersions: (nodeId: string) =>
    axios.get(`${API_URL}/versions/${nodeId}`),
  
  restoreVersion: (nodeId: string, versionId: string) =>
    axios.post(`${API_URL}/restore-version`, { nodeId, versionId }),

  // Flow
  executeFlow: (sectionId: string) =>
    axios.post(`${API_URL}/execute-flow/${sectionId}`),

  // Export
  exportOutput: (sectionId: string) =>
    axios.post(`${API_URL}/export-output/${sectionId}`)
};