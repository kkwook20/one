export type NodeStatus = 'idle' | 'running' | 'completed' | 'error';
export type TaskStatus = 'todo' | 'skip' | 'partial';

export interface Task {
  id: string;
  text: string;
  status: TaskStatus;
  progress: number;
  completedAt?: Date;
}

export interface NodeNote {
  id: string;
  nodeId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkerNodeData {
  label: string;
  tasks: Task[];
  code: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  status: NodeStatus;
  logs: string[];
}

export interface SupervisorNodeData {
  label: string;
  targetNodes: string[];
  modificationHistory: ModificationEntry[];
  pendingModifications: string[];
  status: NodeStatus;
}

export interface ModificationEntry {
  nodeId: string;
  timestamp: Date;
  changes: string;
  result: 'success' | 'failed';
}

export interface PlannerNodeData {
  label: string;
  goals: Goal[];
  evaluations: Record<string, Evaluation>;
  status: NodeStatus;
}

export interface Goal {
  id: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  assignedNodes: string[];
}

export interface Evaluation {
  nodeId: string;
  score: number; // 0-100
  metrics: {
    timeEfficiency: number;
    workload: number;
    difficulty: number;
    progress: number;
  };
  timestamp: Date;
}

export interface WatcherNodeData {
  label: string;
  searchQueries: SearchQuery[];
  collectedData: CollectedData[];
  loraTrainingData: LoraData[];
  status: NodeStatus;
}

export interface SearchQuery {
  id: string;
  query: string;
  sources: string[];
  results: number;
}

export interface CollectedData {
  id: string;
  source: string;
  type: string;
  size: number;
  timestamp: Date;
}

export interface LoraData {
  id: string;
  datasetSize: number;
  estimatedImprovement: number;
  trainingTime: number;
  status: 'pending' | 'training' | 'completed';
}

export interface SchedulerNodeData {
  label: string;
  scheduledTasks: ScheduledTask[];
  timeline: TimelineEntry[];
  status: NodeStatus;
}

export interface ScheduledTask {
  id: string;
  nodeId: string;
  taskName: string;
  estimatedTime: number;
  actualTime?: number;
  startTime: Date;
  endTime?: Date;
  dependencies: string[];
}

export interface TimelineEntry {
  nodeId: string;
  taskId: string;
  start: Date;
  end: Date;
  status: 'scheduled' | 'running' | 'completed' | 'delayed';
}

export interface FlowNodeData {
  label: string;
  executionList: ExecutionItem[];
  managerNodes: string[];
  isRunning: boolean;
  totalProgress: number;
  estimatedCompletionTime: Date | null;
}

export interface ExecutionItem {
  nodeId: string;
  order: number;
  status: 'waiting' | 'running' | 'completed' | 'error';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
}

export interface StorageNodeData {
  label: string;
  storageCategories: StorageCategory[];
  totalSize: number;
  cleanupTasks: CleanupTask[];
  status: NodeStatus;
}

export interface StorageCategory {
  name: string;
  path: string;
  size: number;
  fileCount: number;
  lastModified: Date;
  retentionPolicy: 'permanent' | 'temporary' | 'archive';
}

export interface CleanupTask {
  id: string;
  category: string;
  action: 'delete' | 'archive' | 'compress';
  targetSize: number;
  scheduledFor: Date;
  status: 'pending' | 'running' | 'completed';
}

export interface ProjectTab {
  id: string;
  name: string;
  category: 'preproduction' | 'postproduction' | 'director';
  nodes: string[];
  isActive: boolean;
}

export interface WorkflowState {
  nodes: any[];
  edges: any[];
  tabs: ProjectTab[];
  activeTab: string;
  globalSettings: {
    autoSave: boolean;
    debugMode: boolean;
    aiModel: string;
  };
}