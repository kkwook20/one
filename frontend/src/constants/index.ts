// frontend/src/constants/index.ts - ping/pong 제거 버전
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
export const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws';

export const GROUPS = {
  Control: ['planner', 'supervisor'],
  Execution: ['worker'],
  IO: ['io-input', 'io-output'],
  Processing: ['animation', 'rendering', 'compositing', 'scripting', 'asset']
} as const;

export const NODE_TYPES = [
  { type: 'planner', label: 'Planner', icon: '📋' },
  { type: 'supervisor', label: 'Supervisor', icon: '👔' },
  { type: 'worker', label: 'Worker', icon: '👷' },
  { type: 'io-input', label: 'Input', icon: '📥' },
  { type: 'io-output', label: 'Output', icon: '📤' },
  { type: 'animation', label: 'Animation', icon: '🎬' },
  { type: 'rendering', label: 'Rendering', icon: '🎨' },
  { type: 'compositing', label: 'Compositing', icon: '🎭' },
  { type: 'scripting', label: 'Scripting', icon: '📝' },
  { type: 'asset', label: 'Asset', icon: '📦' }
] as const;

// Node 실행 상태
export const EXECUTION_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error'
} as const;

// Task 상태
export const TASK_STATUS = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  COMPLETE: 'none' // 'none'은 complete를 의미 (레거시 호환)
} as const;

// 파일 형식
export const OUTPUT_FORMATS = {
  JSON: 'json',
  YAML: 'yaml',
  XML: 'xml'
} as const;

// 기본값들
export const DEFAULTS = {
  NODE_POSITION: { x: 400, y: 200 },
  INPUT_NODE_POSITION: { x: 100, y: 200 },
  OUTPUT_NODE_POSITION: { x: 700, y: 200 },
  GRID_SPACING: { x: 200, y: 150 },
  NODE_OFFSET: 60,
  AUTO_SAVE_INTERVAL: 300000, // 5분
  RECONNECT_TIMEOUT: 3000, // 3초
  EXECUTION_TIMEOUT: 30000, // 30초
  ANIMATION_DURATION: 300, // 300ms
  COMPLETE_STATUS_DURATION: 3000, // 3초
  ACTIVE_EDGE_DURATION: 1000, // 1초
} as const;

// 색상 테마
export const COLORS = {
  PRIMARY: '#3b82f6',
  SUCCESS: '#10b981',
  WARNING: '#f59e0b',
  ERROR: '#ef4444',
  GRAY: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  }
} as const;

// 로그 타입
export const LOG_TYPES = {
  START: 'start',
  PROCESSING: 'processing',
  COMPLETE: 'complete',
  ERROR: 'error',
  FILE_CREATED: 'file_created',
  INFO: 'info'
} as const;

// WebSocket 메시지 타입 (ping/pong 제거됨)
export const WS_MESSAGE_TYPES = {
  // 실행 관련
  PROGRESS: 'progress',
  NODE_OUTPUT_UPDATED: 'node_output_updated',
  NODE_EXECUTION_START: 'node_execution_start',
  NODE_EXECUTION_COMPLETE: 'node_execution_complete',
  NODE_EXECUTION_ERROR: 'node_execution_error',
  NODE_EXECUTION_STOPPED: 'node_execution_stopped',
  FLOW_PROGRESS: 'flow_progress',
  
  // Argosa 관련
  STATE_UPDATE: 'state_update',
  SESSION_UPDATE: 'session_update',
  COLLECTION_RESULT: 'collection_result',
  
  // 시스템 관련
  SYSTEM_METRICS: 'system_metrics',
  TRAINING_PROGRESS: 'training_progress',
} as const;