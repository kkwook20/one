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
  error?: string; // 추가
  model?: string;
  vectorDB?: { name: string; table: string };
  supervisedNodes?: string[];
  updateHistory?: UpdateHistory[];
  aiScore?: number;
  
  // React Flow callbacks
  onEdit?: (node: Node) => void;
  onUpdate?: (node: Node) => void;
  onDelete?: (nodeId: string) => void;
  onDeactivate?: (nodeId: string) => void;
  onToggleRun?: () => void;
  progress?: number;
  isExecuting?: boolean;
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