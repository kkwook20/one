// frontend/src/types/index.ts
export interface Position {
  x: number;
  y: number;
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

export interface Node {
  id: string;
  type: 'worker' | 'supervisor' | 'planner' | 'input' | 'output';
  label: string;
  position: Position;
  isRunning: boolean;
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
  from: string;
  to: string;
}

export interface Section {
  id: string;
  name: string;
  group: 'preproduction' | 'postproduction' | 'director';
  nodes: Node[];
  inputConfig?: { 
    sources: string[]; 
    selectedItems: string[];
    projectId?: string; // 추가됨
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

// Execution Log Type
export interface ExecutionLog {
  id: string;
  timestamp: string;
  nodeId: string;
  nodeLabel: string;
  type: 'start' | 'processing' | 'complete' | 'error' | 'file_created' | 'info';
  message: string;
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