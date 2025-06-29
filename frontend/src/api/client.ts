// frontend/src/api/client.ts - 병합된 버전

import axios from 'axios';
import { API_URL } from '../constants';
import { Section, LMStudioModel } from '../types'; // Node 제거

// Create axios instances for each system
const oneAIApi = axios.create({
  baseURL: `${API_URL}/api/oneai`,
  headers: {
    'Content-Type': 'application/json',
  },
});

const argosaApi = axios.create({
  baseURL: `${API_URL}/api/argosa`,
  headers: {
    'Content-Type': 'application/json',
  },
});

const neuroNetApi = axios.create({
  baseURL: `${API_URL}/api/neuronet`,
  headers: {
    'Content-Type': 'application/json',
  },
});

const projectsApi = axios.create({
  baseURL: `${API_URL}/projects`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
[oneAIApi, argosaApi, neuroNetApi, projectsApi].forEach(api => {
  api.interceptors.response.use(
    response => response,
    error => {
      console.error('API Error:', error.response?.data || error.message);
      return Promise.reject(error);
    }
  );
});

// One AI API methods (기존 기능 포함)
export const oneAIClient = {
  // Projects
  getProjects: () =>
    oneAIApi.get('/projects'),
  
  createProject: (data: any) =>
    oneAIApi.post('/projects', data),
  
  deleteProject: (projectId: string) =>
    oneAIApi.delete(`/projects/${projectId}`),
  
  getProject: (projectId: string) =>
    oneAIApi.get(`/projects/${projectId}`),
  
  updateProject: (projectId: string, data: any) =>
    oneAIApi.put(`/projects/${projectId}`, data),

  // Models
  getModels: () => 
    oneAIApi.get('/models'),

  // LM Studio
  connectLMStudio: (url: string) =>
    oneAIApi.post<{
      success: boolean;
      connectionId: string;
      models: LMStudioModel[];
      url: string;
    }>('/lmstudio/connect', { url }),
  
  getLMStudioModels: (connectionId: string) =>
    oneAIApi.get<{
      models: LMStudioModel[];
      url: string;
    }>(`/lmstudio/models/${connectionId}`),

  // Sections
  getSections: () => 
    oneAIApi.get<Section[]>('/sections'),
  
  getSection: (sectionId: string) =>
    oneAIApi.get<Section>(`/sections/${sectionId}`),
  
  updateSection: (sectionId: string, data: Section) => 
    oneAIApi.put(`/sections/${sectionId}`, data),

  // Nodes
  executeNode: (nodeId: string, sectionId: string, code: string, inputs: any = {}) =>
    oneAIApi.post('/execute', { 
      nodeId, 
      sectionId, 
      code, 
      inputs 
    }),
  
  executeNodeWithCode: (nodeId: string, sectionId: string, code: string, connectedOutputs: any) =>
    oneAIApi.post('/execute', {
      nodeId,
      sectionId,
      code,
      inputs: connectedOutputs
    }),
  
  stopNode: (nodeId: string) =>
    oneAIApi.post(`/stop/${nodeId}`),
  
  deactivateNode: (nodeId: string, sectionId: string) =>
    oneAIApi.post(`/node/${nodeId}/deactivate`, { sectionId }),

  // Flow
  executeFlow: (sectionId: string) =>
    oneAIApi.post('/execute-flow', {
      sectionId,
      startNodeId: null // Will be determined by backend
    }),

  // Supervisor (기존 기능 유지)
  executeSupervisor: (sectionId: string, supervisorId: string, targetNodeId: string) =>
    oneAIApi.post('/supervisor/execute', { 
      sectionId, 
      supervisorId, 
      targetNodeId 
    }),
  
  acceptModification: (supervisorId: string, modificationId: string) =>
    oneAIApi.post('/supervisor/accept-modification', { 
      supervisorId, 
      modificationId 
    }),
  
  rejectModification: (supervisorId: string, modificationId: string, targetNodeId: string) =>
    oneAIApi.post('/supervisor/reject-modification', { 
      supervisorId, 
      modificationId, 
      targetNodeId 
    }),

  // Planner (기존 기능 유지)
  evaluateSection: (sectionId: string, plannerId: string) =>
    oneAIApi.post('/planner/evaluate-section', { 
      sectionId, 
      plannerId 
    }),
  
  acceptEvaluation: (plannerId: string, evaluationId: string) =>
    oneAIApi.post('/planner/accept-evaluation', { 
      plannerId, 
      evaluationId 
    }),
  
  rejectEvaluation: (plannerId: string, evaluationId: string) =>
    oneAIApi.post('/planner/reject-evaluation', { 
      plannerId, 
      evaluationId 
    }),

  // Version (기존 기능 유지)
  getVersions: (nodeId: string) =>
    oneAIApi.get(`/versions/${nodeId}`),
  
  restoreVersion: (nodeId: string, versionId: string) =>
    oneAIApi.post('/restore-version', { 
      nodeId, 
      versionId 
    }),

  // Export (기존 기능 유지)
  exportOutput: (sectionId: string) =>
    oneAIApi.post(`/sections/export-output/${sectionId}`),
  
  // Project Files
  getProjectFiles: (projectId: string) =>
    oneAIApi.get(`/projects/${projectId}/files`),
  
  getFileContent: (projectId: string, filePath: string) =>
    oneAIApi.post(`/projects/${projectId}/file-content`, {
      file_path: filePath
    }),
  
  // System
  save: () => oneAIApi.post('/save'),
  getSystemStatus: () => oneAIApi.get('/system/status'),
};

// Argosa API methods (새로운 기능)
export const argosaClient = {
  // Information Sources
  getSources: () => argosaApi.get('/sources'),
  createSource: (source: any) => argosaApi.post('/sources', source),
  updateSource: (sourceId: string, source: any) => argosaApi.put(`/sources/${sourceId}`, source),
  deleteSource: (sourceId: string) => argosaApi.delete(`/sources/${sourceId}`),
  
  // Analysis
  getAnalysisTasks: () => argosaApi.get('/analysis'),
  createAnalysisTask: (task: any) => argosaApi.post('/analysis', task),
  getAnalysisTask: (taskId: string) => argosaApi.get(`/analysis/${taskId}`),
  
  // Predictions
  getPredictionModels: () => argosaApi.get('/predictions'),
  createPredictionModel: (model: any) => argosaApi.post('/predictions', model),
  trainPredictionModel: (modelId: string) => argosaApi.post(`/predictions/${modelId}/train`),
  
  // Schedules
  getSchedules: () => argosaApi.get('/schedules'),
  createSchedule: (schedule: any) => argosaApi.post('/schedules', schedule),
  
  // Code Analysis
  analyzeCode: (code: string, language: string = 'python') => 
    argosaApi.post('/code-analysis', { code, language }),
  
  // User Input
  submitUserInput: (type: string, content: string, metadata?: any) =>
    argosaApi.post('/user-input', { type, content, metadata }),
  
  // System
  getStatus: () => argosaApi.get('/status'),
};

// NeuroNet API methods (새로운 기능)
export const neuroNetClient = {
  // Datasets
  getDatasets: () => neuroNetApi.get('/datasets'),
  uploadDataset: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return neuroNetApi.post('/datasets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  crawlDataset: (url: string, name: string) => 
    neuroNetApi.post('/datasets/crawl', { url, name }),
  
  // Data Processing
  getProcessors: () => neuroNetApi.get('/processors'),
  createProcessor: (processor: any) => neuroNetApi.post('/processors', processor),
  
  // Training
  getTrainingJobs: () => neuroNetApi.get('/training'),
  createTrainingJob: (job: any) => neuroNetApi.post('/training', job),
  
  // Labeling
  getLabelingTasks: () => neuroNetApi.get('/labeling'),
  createLabelingTask: (task: any) => neuroNetApi.post('/labeling', task),
  
  // Optimization
  getOptimizations: () => neuroNetApi.get('/optimizations'),
  createOptimization: (optimization: any) => neuroNetApi.post('/optimizations', optimization),
  
  // Deployment
  deployModel: (modelId: string, type: string = 'api') => 
    neuroNetApi.post(`/deploy/${modelId}`, { type }),
  
  // Vectors
  storeVectors: (datasetId: string, vectors: any[]) =>
    neuroNetApi.post('/vectors/store', { dataset_id: datasetId, vectors }),
  queryVectors: (vector: any[], topK: number = 10) =>
    neuroNetApi.post('/vectors/query', { vector, top_k: topK }),
  
  // System
  getStatus: () => neuroNetApi.get('/status'),
};

// Projects API methods (기존 + 새로운 기능)
export const projectsClient = {
  getProjects: () => projectsApi.get('/'),
  getProject: (projectId: string) => projectsApi.get(`/${projectId}`),
  createProject: (project: any) => projectsApi.post('/', project),
  updateProject: (projectId: string, project: any) => projectsApi.put(`/${projectId}`, project),
  deleteProject: (projectId: string) => projectsApi.delete(`/${projectId}`),
  getDefaultProjectPath: () => projectsApi.get('/default-path'), // 기존 기능 유지
};

// Legacy API client for backward compatibility
// 기존 apiClient 사용 코드와의 호환성 유지
export const apiClient = {
  // OneAI 기능들
  ...oneAIClient,
  
  // Projects 기능들 (기존 방식 유지)
  getProjects: projectsClient.getProjects,
  createProject: projectsClient.createProject,
  updateProject: projectsClient.updateProject,
  deleteProject: projectsClient.deleteProject,
  getDefaultProjectPath: projectsClient.getDefaultProjectPath,
};

// Export all clients as named export
export const allClients = {
  oneAI: oneAIClient,
  argosa: argosaClient,
  neuroNet: neuroNetClient,
  projects: projectsClient,
};

// Export default
export default allClients;