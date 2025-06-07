// frontend/src/types/index.ts
export interface Position {
  x: number;
  y: number;
}

export interface TaskItem {
  id: string;
  text: string;
  status: 'pending' | 'none' | 'partial';
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
  inputConfig?: { sources: string[]; selectedItems: string[] };
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