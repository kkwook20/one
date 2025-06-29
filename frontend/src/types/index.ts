// frontend/src/types/index.ts
export interface Position {
  x: number;
  y: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  type?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  stats?: {
    nodes: number;
    sections: number;
    completedTasks: number;
  };
}

export interface TaskItem {
  id: string;
  text: string;
  status: 'pending' | 'none' | 'partial';
  taskStatus?: 'locked' | 'editable' | 'low_priority'; // 새로 추가: × 잠금, ○ 수정가능, △ 우선순위낮음
  aiScore?: number; // AI 평가 점수
}

export interface UpdateHistory {
  timestamp: string;
  type: 'execution' | 'supervised';
  by?: string;
  score?: number;
  output?: any;
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  type: 'info' | 'warning' | 'error' | 'success' | 'start' | 'complete' | 'file_created' | 'processing';
  message: string;
  nodeId?: string;
  nodeName?: string;
  nodeLabel?: string;
  details?: any;
}

export interface Node {
  id: string;
  type: string; // More flexible node types for shadcn components
  name?: string;
  label?: string; // Legacy compatibility
  position: Position;
  data: {
    label: string;
    description?: string;
    config?: any;
  };
  status?: 'idle' | 'running' | 'completed' | 'error';
  
  // Legacy fields for compatibility
  isRunning?: boolean;
  isDeactivated?: boolean;
  tasks?: TaskItem[];
  connectedTo?: string[];
  connectedFrom?: string[];
  code?: string;
  output?: any;
  error?: string;
  model?: string;
  vectorDB?: { name: string; table: string };
  supervisedNodes?: string[];
  updateHistory?: UpdateHistory[];
  aiScore?: number;
  
  // Worker 노드 전용 필드
  purpose?: string; // 노드의 목적
  outputFormat?: string; // output 형식 설명 (AI에게 요청할 텍스트)
  
  // Base/Exp Code 분리 관련 필드 (추가됨)
  expCode?: string; // Experimental Code
  baseCodeTemplate?: string; // Base Code 템플릿 ID
  
  // AI Model Configuration
  lmStudioUrl?: string;
  lmStudioConnectionId?: string;
  
  // Additional fields for modals
  availableModels?: any[];
  inputConfig?: any;
  outputConfig?: any;
  
  // Supervisor/Planner specific
  modificationHistory?: any[];
  evaluationHistory?: any[];
  plannerRecommendations?: string[];
  
  // Execution tracking (추가됨)
  executionHistory?: any[];
  currentExecutionStartTime?: string | null;
  
  // Project related (추가됨)
  projectId?: string; // Input 노드에서 선택한 프로젝트 ID
}

export interface Connection {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  animated?: boolean;
  style?: any;
  // Legacy fields
  from?: string;
  to?: string;
}

export interface Section {
  id: string;
  name: string;
  description?: string;
  nodes: Node[]; // Changed to Node[] to match actual usage
  group?: 'Control' | 'Execution' | 'IO' | 'Processing';
  position?: Position;
  expanded?: boolean;
  // Legacy fields
  inputConfig?: { 
    sources: string[]; 
    selectedItems: string[];
    projectId?: string;
  };
  outputConfig?: { format: string; autoSave: boolean };
}

export interface Version {
  id: string;
  timestamp: string;
  data: any;
  metadata: {
    inputHash: string;
    outputHash: string;
    parameters: any;
    modelVersion: string;
    modifiedBy: string;
  };
}


// LM Studio Types
export interface LMStudioModel {
  id: string;
  name: string;
  type: 'lmstudio' | 'builtin';
}

export interface LMStudioConnection {
  connectionId: string;
  url: string;
  models: LMStudioModel[];
}