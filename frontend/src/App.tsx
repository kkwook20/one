// frontend/src/App.tsx - 노드 위치 저장 개선 버전
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactFlow, {
  Node as FlowNode,
  Edge,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  addEdge,
  Connection as FlowConnection,
  NodeTypes,
  EdgeTypes,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  MarkerType,
  EdgeChange,
  NodeChange,
  Position as FlowPosition,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  NodeProps,
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
} from 'reactflow';
import { 
  Play, 
  Settings, 
  ChevronDown, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  RefreshCw,
  Square, 
  Trash2, 
  Power, 
  FileInput, 
  FileOutput,
  Loader2,
  X
} from 'lucide-react';

// ResizeObserver 에러 방지
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (e.message === 'ResizeObserver loop completed with undelivered notifications.' ||
        e.message === 'ResizeObserver loop limit exceeded') {
      e.stopImmediatePropagation();
    }
  });
  
  const ro = window.ResizeObserver;
  window.ResizeObserver = class ResizeObserver extends ro {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        requestAnimationFrame(() => {
          callback(entries, observer);
        });
      });
    }
  };
}

// Add ReactFlow CSS
if (typeof document !== 'undefined') {
  if (!document.querySelector('link[href*="reactflow"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/reactflow@11/dist/style.css';
    document.head.appendChild(link);
  }

  if (!document.querySelector('style[data-custom-styles]')) {
    const style = document.createElement('style');
    style.setAttribute('data-custom-styles', 'true');
    style.textContent = `
      .react-flow {
        height: 100%;
        width: 100%;
      }
      .react-flow__renderer {
        width: 100% !important;
        height: 100% !important;
      }
      .react-flow__node {
        z-index: 10 !important;
      }
      .react-flow__node.selected {
        z-index: 20 !important;
      }
      .react-flow__node:hover {
        z-index: 25 !important;
      }
      .react-flow__edge-label {
        z-index: 30 !important;
      }
      .react-flow__panel {
        z-index: 5 !important;
      }
      .react-flow__handle {
        width: 16px !important;
        height: 16px !important;
        border: 2px solid white !important;
        background: #3b82f6 !important;
        cursor: crosshair !important;
        transform: none !important;
        transition: none !important;
      }
      .react-flow__handle:hover {
        transform: none !important;
        width: 16px !important;
        height: 16px !important;
      }
      .execution-logs {
        position: relative;
        z-index: 40;
      }
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-track {
        background: #f1f1f1;
      }
      ::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 4px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #555;
      }
    `;
    document.head.appendChild(style);
  }
}

// Types
interface Position {
  x: number;
  y: number;
}

interface TaskItem {
  id: string;
  text: string;
  status: 'pending' | 'none' | 'partial';
}

interface UpdateHistory {
  timestamp: string;
  type: 'execution' | 'supervised';
  by?: string;
  score?: number;
  output?: any;
}

interface Node {
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
  lmStudioUrl?: string;
  availableModels?: any[];
  vectorDB?: { name: string; table: string };
  supervisedNodes?: string[];
  updateHistory?: UpdateHistory[];
  aiScore?: number;
  inputConfig?: any;
  outputConfig?: any;
}

interface CustomNodeData extends Node {
  onEdit?: () => void;
  onDeactivate?: () => void;
  onToggleRun?: () => void;
  onDelete?: (nodeId: string) => void;
  onUpdate?: (node: Node) => void;
  progress?: number;
  isExecuting?: boolean;
  isCompleted?: boolean;
}

interface Section {
  id: string;
  name: string;
  group: 'preproduction' | 'postproduction' | 'director';
  nodes: Node[];
  inputConfig?: { sources: string[]; selectedItems: string[] };
  outputConfig?: { format: string; autoSave: boolean };
}

const API_URL = 'http://localhost:8000';

const GROUPS = {
  preproduction: ['Script', 'Storyboard', 'Planning'],
  postproduction: ['Modeling', 'Rigging', 'Texture', 'Animation', 'VFX', 'Lighting & Rendering', 'Sound Design', 'Compositing'],
  director: ['Direction', 'Review']
};

const NODE_TYPES = [
  { type: 'worker', label: 'Worker', icon: '⚙️' },
  { type: 'supervisor', label: 'Supervisor', icon: '👁️' },
  { type: 'planner', label: 'Planner', icon: '📋' },
  { type: 'input', label: 'Input', icon: '➡️' },
  { type: 'output', label: 'Output', icon: '⬅️' }
];

// API helper
const apiCall = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
};

// Debounce helper
// function debounce<T extends (...args: any[]) => any>(
//   func: T,
//   wait: number
// ): (...args: Parameters<T>) => void {
//   let timeout: NodeJS.Timeout;
  
//   return function executedFunction(...args: Parameters<T>) {
//     const later = () => {
//       clearTimeout(timeout);
//       func(...args);
//     };
    
//     clearTimeout(timeout);
//     timeout = setTimeout(later, wait);
//   };
// }

// Execution Log Type
interface ExecutionLog {
  id: string;
  timestamp: string;
  nodeId: string;
  nodeLabel: string;
  type: 'start' | 'processing' | 'complete' | 'error' | 'file_created' | 'info';
  message: string;
}

// WebSocket Hook Interface
interface WebSocketHandlers {
  onProgress?: (nodeId: string, progress: number) => void;
  onNodeOutputUpdated?: (nodeId: string, output: string) => void;
  onNodeExecutionStart?: (nodeId: string) => void;
  onNodeExecutionComplete?: (nodeId: string) => void;
  onNodeExecutionError?: (nodeId: string, error: string) => void;
  onFlowProgress?: (sourceId: string, targetId: string) => void;
}

// Global WebSocket instance
let globalWs: WebSocket | null = null;
let connectionCount = 0;

// WebSocket Hook
const useWebSocket = (handlers: WebSocketHandlers) => {
  const handlersRef = useRef(handlers);
  const isConnectedRef = useRef(false);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      isConnectedRef.current = true;
      return;
    }

    connectionCount++;
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const connect = () => {
      try {
        if (globalWs) {
          globalWs.close();
          globalWs = null;
        }

        const ws = new WebSocket(`ws://localhost:8000/ws/${clientId}`);
        
        ws.onopen = () => {
          isConnectedRef.current = true;
          globalWs = ws;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'ping') {
              return;
            }
            
            const currentHandlers = handlersRef.current;
            
            switch (data.type) {
              case 'progress':
                if (currentHandlers.onProgress && data.nodeId && typeof data.progress === 'number') {
                  currentHandlers.onProgress(data.nodeId, data.progress);
                }
                break;
                
              case 'node_output_updated':
                if (currentHandlers.onNodeOutputUpdated && data.nodeId && data.output) {
                  currentHandlers.onNodeOutputUpdated(data.nodeId, data.output);
                }
                break;
                
              case 'node_execution_start':
                if (currentHandlers.onNodeExecutionStart && data.nodeId) {
                  currentHandlers.onNodeExecutionStart(data.nodeId);
                }
                break;
                
              case 'node_execution_complete':
                if (currentHandlers.onNodeExecutionComplete && data.nodeId) {
                  currentHandlers.onNodeExecutionComplete(data.nodeId);
                }
                break;
                
              case 'node_execution_error':
                if (currentHandlers.onNodeExecutionError && data.nodeId) {
                  currentHandlers.onNodeExecutionError(data.nodeId, data.error || 'Unknown error');
                }
                break;
                
              case 'flow_progress':
                if (currentHandlers.onFlowProgress && data.sourceId && data.targetId) {
                  currentHandlers.onFlowProgress(data.sourceId, data.targetId);
                }
                break;
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          isConnectedRef.current = false;
        };

        ws.onclose = (event) => {
          globalWs = null;
          isConnectedRef.current = false;
          
          if (event.code !== 1000 && event.code !== 1001) {
            setTimeout(connect, 3000);
          }
        };
        
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      connectionCount--;
      
      if (connectionCount === 0 && globalWs) {
        globalWs.close(1000, 'All components unmounted');
        globalWs = null;
      }
    };
  }, []);

  return {
    isConnected: isConnectedRef.current && globalWs?.readyState === WebSocket.OPEN
  };
};

// Custom Node Component
const CustomNode: React.FC<NodeProps<CustomNodeData>> = ({ data, id, selected }) => {
  const getNodeIcon = () => {
    switch (data.type) {
      case 'input':
        return <FileInput className="w-5 h-5" />;
      case 'output':
        return <FileOutput className="w-5 h-5" />;
      case 'worker':
        return <span className="text-xl">👷</span>;
      case 'supervisor':
        return <span className="text-xl">👔</span>;
      case 'planner':
        return <span className="text-xl">📋</span>;
      default:
        return null;
    }
  };

  const getBorderColor = () => {
    if (data.isExecuting) return 'border-blue-500';
    if (data.isCompleted) return 'border-green-500';
    if (selected) return 'border-blue-400';
    return 'border-gray-300';
  };

  const getBorderWidth = () => {
    if (data.isExecuting || data.isCompleted) return 'border-4';
    return 'border-2';
  };

  const getShadow = () => {
    if (data.isExecuting) return 'shadow-lg shadow-blue-500/30';
    if (data.isCompleted) return 'shadow-lg shadow-green-500/30';
    return 'shadow-md';
  };

  return (
    <div 
      className={`
        relative bg-white rounded-lg ${getShadow()} ${getBorderWidth()} ${getBorderColor()} 
        transition-all duration-300 hover:shadow-lg min-w-[200px]
        ${data.isDeactivated ? 'opacity-50' : ''}
      `}
    >
      {data.type !== 'input' && (
        <Handle
          type="target"
          position={FlowPosition.Left}
          className="w-4 h-4 bg-blue-400 border-2 border-white"
          style={{ left: -8 }}
        />
      )}
      
      {data.type !== 'output' && (
        <Handle
          type="source"
          position={FlowPosition.Right}
          className="w-4 h-4 bg-blue-400 border-2 border-white"
          style={{ right: -8 }}
        />
      )}

      {data.isExecuting && (
        <div className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        </div>
      )}

      {data.isCompleted && !data.isExecuting && (
        <div className="absolute -top-3 -right-3 bg-green-500 rounded-full p-1 shadow-lg">
          <svg className="w-4 h-4 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
      )}

      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          {getNodeIcon()}
          <span className="font-semibold text-sm">{data.label || data.type}</span>
        </div>
        
        <div className="flex items-center gap-1">
          {(data.type === 'worker' || data.type === 'supervisor' || data.type === 'planner') && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onToggleRun?.();
                }}
                className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                  data.isExecuting ? 'text-red-500' : 'text-green-500'
                }`}
                title={data.isExecuting ? 'Stop' : 'Run'}
              >
                {data.isExecuting ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onDeactivate?.();
                }}
                className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                  data.isDeactivated ? 'text-red-500' : 'text-gray-600'
                }`}
                title={data.isDeactivated ? 'Activate' : 'Deactivate'}
              >
                <Power className="w-4 h-4" />
              </button>
            </>
          )}
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onEdit?.();
            }}
            className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-600"
            title="Edit"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete?.(id);
            }}
            className="p-1 rounded hover:bg-gray-100 transition-colors text-red-500"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-3">
        {data.progress !== undefined && data.progress > 0 && data.progress < 1 && (
          <div className="mb-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${data.progress * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {Math.round(data.progress * 100)}%
            </p>
          </div>
        )}
        
        {data.type === 'input' && (
          <div className="text-sm text-gray-600">
            {data.inputConfig?.type || 'No input configured'}
          </div>
        )}
        
        {data.type === 'output' && (
          <div className="text-sm text-gray-600">
            {data.outputConfig?.type || 'No output configured'}
          </div>
        )}
        
        {data.type === 'worker' && (
          <div className="space-y-1">
            {data.tasks?.map((task: TaskItem, index: number) => (
              <div key={task.id} className="flex items-center gap-2 text-sm">
                <span className={`
                  w-2 h-2 rounded-full flex-shrink-0
                  ${['complete', 'completed'].includes(task.status as string) ? 'bg-green-500' : 
                    ['partial', 'inProgress'].includes(task.status as string) ? 'bg-blue-500' : 
                    'bg-gray-300'}
                `} />
                <span className="truncate text-gray-700">
                  {task.text || `Task ${index + 1}`}
                </span>
              </div>
            ))}
          </div>
        )}
        
        {(data.type === 'supervisor' || data.type === 'planner') && (
          <div className="text-sm text-gray-600">
            {data.code ? 'Code configured' : 'No code configured'}
          </div>
        )}
        
        {data.output && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
            Output: {typeof data.output === 'string' && data.output.length > 50 
              ? data.output.substring(0, 50) + '...' 
              : JSON.stringify(data.output)}
          </div>
        )}
      </div>
    </div>
  );
};

// Custom Edge Component
interface CustomEdgeData {
  onDelete?: (edgeId: string) => void;
  isActive?: boolean;
}

const CustomEdge: React.FC<EdgeProps<CustomEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (data?.onDelete) {
      data.onDelete(id);
    }
  };

  return (
    <>
      {data?.isActive && (
        <path
          style={{
            ...style,
            stroke: '#10b981',
            strokeWidth: 6,
            opacity: 0.3,
            filter: 'blur(4px)',
          }}
          className="react-flow__edge-path animate-pulse"
          d={edgePath}
          markerEnd={markerEnd}
        />
      )}
      
      <path
        id={id}
        style={style}
        className={`react-flow__edge-path ${data?.isActive ? 'animate-pulse' : ''}`}
        d={edgePath}
        markerEnd={markerEnd}
      />
      
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            onClick={handleDelete}
            className="group relative flex items-center justify-center w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all duration-200 shadow-md hover:shadow-lg border-2 border-white"
            style={{
              cursor: 'pointer',
              zIndex: 1000,
              pointerEvents: 'all',
            }}
            type="button"
            aria-label="Delete connection"
          >
            <X className="w-4 h-4" />
            <span className="absolute invisible group-hover:visible bg-gray-800 text-white text-xs rounded py-1 px-2 -top-8 whitespace-nowrap z-[1001]">
              Delete connection
            </span>
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

// Node types
const nodeTypes: NodeTypes = {
  worker: CustomNode,
  supervisor: CustomNode,
  planner: CustomNode,
  input: CustomNode,
  output: CustomNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

function AIPipelineFlow() {
  // ResizeObserver 에러 핸들링
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      if (e.message.includes('ResizeObserver')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };
    
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  // Core states
  const [selectedGroup, setSelectedGroup] = useState<keyof typeof GROUPS>('preproduction');
  const [selectedSection, setSelectedSection] = useState<string>('Script');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReactFlowReady, setIsReactFlowReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // React Flow states
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  
  // UI states
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showJsonViewer, setShowJsonViewer] = useState(false);
  const [nodeProgress, setNodeProgress] = useState<{ [key: string]: number }>({});
  const [runningNodes, setRunningNodes] = useState<Set<string>>(new Set());
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logsHeight, setLogsHeight] = useState(200);
  const [completedNodes, setCompletedNodes] = useState<Set<string>>(new Set());
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());
  
  // Refs
  const isUpdatingRef = useRef(false);
  const sectionEdgesRef = useRef<{ [sectionId: string]: Edge[] }>({});
  const sectionNodesRef = useRef<{ [sectionId: string]: FlowNode[] }>({});  // 섹션별 노드 캐시
  const pendingUpdatesRef = useRef<{ [sectionId: string]: Section }>({});
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { project } = useReactFlow();

  // 현재 섹션 가져오기
  const currentSection = useMemo(() => {
    return sections.find(s => s.name === selectedSection);
  }, [sections, selectedSection]);

  // 로그 추가
  const addLog = useCallback((log: Omit<ExecutionLog, 'id' | 'timestamp'>) => {
    setExecutionLogs(prev => [...prev, {
      ...log,
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString()
    }]);
  }, []);

  // 백엔드 업데이트 (디바운스 적용)
  const updateSectionInBackend = useCallback(async (section: Section) => {
    if (isUpdatingRef.current) return;
    
    // 펜딩 업데이트 저장
    pendingUpdatesRef.current[section.id] = section;
    
    // 기존 타임아웃 클리어
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // 500ms 후에 저장 실행
    saveTimeoutRef.current = setTimeout(async () => {
      const sectionsToUpdate = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      
      setIsSaving(true);
      
      for (const [sectionId, sectionData] of Object.entries(sectionsToUpdate)) {
        isUpdatingRef.current = true;
        try {
          // 전송할 데이터 확인
          const dataToSend = {
            ...sectionData,
            nodes: sectionData.nodes.map(node => ({
              ...node,
              position: {
                x: Number(node.position.x),
                y: Number(node.position.y)
              }
            }))
          };
          
          console.log('Saving section update to backend:', {
            id: sectionId,
            name: dataToSend.name,
            nodes: dataToSend.nodes.map(n => ({
              id: n.id,
              label: n.label,
              position: n.position,
              type: n.type
            }))
          });
          
          // 전체 데이터도 확인
          console.log('Full data being sent:', JSON.stringify(dataToSend, null, 2));
          
          await apiCall(`${API_URL}/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify(dataToSend)
          });
          
          console.log('Section saved successfully');
        } catch (error) {
          console.error('Failed to update section:', error);
          addLog({
            nodeId: 'system',
            nodeLabel: 'System',
            type: 'error',
            message: `Failed to save section ${sectionData.name}`
          });
        } finally {
          isUpdatingRef.current = false;
        }
      }
      
      setIsSaving(false);
    }, 500);
  }, [addLog]);

  // 디버깅을 위한 전역 노출
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).debugPipeline = {
        sections,
        nodes,
        currentSection: sections.find(s => s.name === selectedSection),
        sectionNodesRef: sectionNodesRef.current,
        sectionEdgesRef: sectionEdgesRef.current,
        printPositions: () => {
          const current = sections.find(s => s.name === selectedSection);
          if (current) {
            console.log('=== Current Section Node Positions ===');
            current.nodes.forEach(n => {
              console.log(`${n.id}: ${JSON.stringify(n.position)}`);
            });
            console.log('=== React Flow Node Positions ===');
            nodes.forEach(n => {
              console.log(`${n.id}: ${JSON.stringify(n.position)}`);
            });
            console.log('=== Cached Node Positions ===');
            Object.entries(sectionNodesRef.current).forEach(([sectionId, nodes]) => {
              console.log(`Section ${sectionId}:`);
              nodes.forEach(n => {
                console.log(`  ${n.id}: ${JSON.stringify(n.position)}`);
              });
            });
          }
        },
        saveNow: async () => {
          console.log('Forcing save...');
          // saveCurrentSection이 나중에 정의되므로 직접 호출하지 않음
          const current = sections.find(s => s.name === selectedSection);
          if (current) {
            await updateSectionInBackend(current);
          }
        }
      };
    }
  }, [sections, nodes, selectedSection, updateSectionInBackend]);

  // Edge 삭제 핸들러
  const handleEdgeDelete = useCallback((edgeId: string) => {
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;
    
    const { source: sourceId, target: targetId } = edge;
    
    // edges 상태 업데이트
    setEdges(prevEdges => {
      const filtered = prevEdges.filter(e => e.id !== edgeId);
      
      if (currentSection) {
        sectionEdgesRef.current[currentSection.id] = filtered;
      }
      
      return filtered;
    });
    
    // 섹션 데이터 업데이트
    setSections(prevSections => {
      return prevSections.map(section => {
        if (section.name === selectedSection) {
          const updatedSection = {
            ...section,
            nodes: section.nodes.map(node => {
              if (node.id === sourceId && node.connectedTo) {
                return { 
                  ...node,
                  connectedTo: node.connectedTo.filter(id => id !== targetId) 
                };
              }
              if (node.id === targetId && node.connectedFrom) {
                return { 
                  ...node,
                  connectedFrom: node.connectedFrom.filter(id => id !== sourceId) 
                };
              }
              return node;
            })
          };
          
          updateSectionInBackend(updatedSection);
          
          return updatedSection;
        }
        return section;
      });
    });
    
    addLog({
      nodeId: 'system',
      nodeLabel: 'System',
      type: 'info',
      message: `Connection removed: ${sourceId} → ${targetId}`
    });
  }, [edges, currentSection, selectedSection, updateSectionInBackend, addLog]);

  // 콜백 함수들
  const nodeCallbacks = useMemo(() => ({
    onEdit: (node: Node) => setEditingNode(node),
    onDeactivate: (nodeId: string) => {
      const section = sections.find(s => s.name === selectedSection);
      if (!section) return;
      
      apiCall(`${API_URL}/node/${nodeId}/deactivate`, {
        method: 'POST',
        body: JSON.stringify({ sectionId: section.id })
      }).then(() => {
        const node = section.nodes.find(n => n.id === nodeId);
        if (node) {
          setSections(prev => prev.map(s => {
            if (s.id === section.id) {
              return {
                ...s,
                nodes: s.nodes.map(n => n.id === nodeId ? { ...n, isDeactivated: !n.isDeactivated } : n)
              };
            }
            return s;
          }));
        }
      }).catch(error => {
        console.error('Failed to toggle deactivation:', error);
      });
    },
    onToggleRun: (nodeId: string) => {
      const section = sections.find(s => s.name === selectedSection);
      const node = section?.nodes.find(n => n.id === nodeId);
      
      if (!node || !section) return;

      if (runningNodes.has(nodeId)) {
        apiCall(`${API_URL}/stop/${nodeId}`, { method: 'POST' })
          .then(() => {
            setRunningNodes(prev => {
              const newSet = new Set(prev);
              newSet.delete(nodeId);
              return newSet;
            });
            setCompletedNodes(prev => {
              const newSet = new Set(prev);
              newSet.delete(nodeId);
              return newSet;
            });
          })
          .catch(error => console.error('Failed to stop node:', error));
      } else {
        setRunningNodes(prev => new Set([...prev, nodeId]));
        setCompletedNodes(prev => {
          const newSet = new Set(prev);
          newSet.delete(nodeId);
          return newSet;
        });
        
        addLog({
          nodeId: node.id,
          nodeLabel: node.label,
          type: 'start',
          message: `Starting ${node.type} execution...`
        });
        
        apiCall(`${API_URL}/execute`, {
          method: 'POST',
          body: JSON.stringify({
            nodeId,
            sectionId: section.id,
            code: node.code || '',
            inputs: {}
          })
        }).catch(error => {
          console.error('Node execution failed:', error);
          setRunningNodes(prev => {
            const newSet = new Set(prev);
            newSet.delete(nodeId);
            return newSet;
          });
          addLog({
            nodeId: node.id,
            nodeLabel: node.label,
            type: 'error',
            message: `Execution failed: ${error.message}`
          });
        });
      }
    },
    onDelete: (nodeId: string) => {
      const section = sections.find(s => s.name === selectedSection);
      if (!section) return;
      
      // React Flow 상태 즉시 업데이트
      setNodes(prev => prev.filter(n => n.id !== nodeId));
      setEdges(prev => {
        const filtered = prev.filter(e => e.source !== nodeId && e.target !== nodeId);
        if (currentSection) {
          sectionEdgesRef.current[currentSection.id] = filtered;
        }
        return filtered;
      });
      
      const updatedSection = {
        ...section,
        nodes: section.nodes
          .filter(n => n.id !== nodeId)
          .map(n => {
            const updatedNode = { ...n };
            if (updatedNode.connectedTo) {
              updatedNode.connectedTo = updatedNode.connectedTo.filter(id => id !== nodeId);
            }
            if (updatedNode.connectedFrom) {
              updatedNode.connectedFrom = updatedNode.connectedFrom.filter(id => id !== nodeId);
            }
            return updatedNode;
          })
      };
      
      setSections(prev => prev.map(s => s.id === updatedSection.id ? updatedSection : s));
      updateSectionInBackend(updatedSection);
      
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'info',
        message: `Node "${section.nodes.find(n => n.id === nodeId)?.label}" deleted`
      });
    },
    onUpdate: (node: Node) => {
      setSections(prev => prev.map(section => {
        const current = sections.find(s => s.name === selectedSection);
        if (section.id === current?.id) {
          const updatedSection = {
            ...section,
            nodes: section.nodes.map(n => n.id === node.id ? node : n)
          };
          updateSectionInBackend(updatedSection);
          return updatedSection;
        }
        return section;
      }));
    },
  }), [sections, selectedSection, runningNodes, updateSectionInBackend, currentSection, addLog]);

  // 노드 위치 업데이트 함수
  const updateNodePosition = useCallback((nodeId: string, newPosition: { x: number; y: number }) => {
    console.log(`updateNodePosition called for ${nodeId}:`, newPosition);
    
    setSections(prevSections => {
      const updatedSections = prevSections.map(section => {
        if (section.name === selectedSection) {
          const updatedNodes = section.nodes.map(node => {
            if (node.id === nodeId) {
              console.log(`Updating node ${nodeId} in section ${section.name}`);
              console.log(`  Old position:`, node.position);
              console.log(`  New position:`, newPosition);
              return { ...node, position: { ...newPosition } };
            }
            return node;
          });
          
          const updatedSection = { ...section, nodes: updatedNodes };
          
          // 백엔드 업데이트 (디바운스 적용됨)
          updateSectionInBackend(updatedSection);
          
          return updatedSection;
        }
        return section;
      });
      
      return updatedSections;
    });
  }, [selectedSection, updateSectionInBackend]);

  // 주기적 자동 저장 (5분마다)
  useEffect(() => {
    const interval = setInterval(() => {
      const current = sections.find(s => s.name === selectedSection);
      if (current && nodes.length > 0) {
        // 현재 React Flow 상태를 섹션에 반영
        const updatedNodes = current.nodes.map(sectionNode => {
          const flowNode = nodes.find(n => n.id === sectionNode.id);
          if (flowNode) {
            return {
              ...sectionNode,
              position: {
                x: flowNode.position.x,
                y: flowNode.position.y
              }
            };
          }
          return sectionNode;
        });
        
        const updatedSection = {
          ...current,
          nodes: updatedNodes
        };
        
        // 변경사항이 있는지 확인
        const hasChanges = updatedNodes.some((node, index) => {
          const originalNode = current.nodes[index];
          return originalNode && (
            originalNode.position.x !== node.position.x ||
            originalNode.position.y !== node.position.y
          );
        });
        
        if (hasChanges) {
          console.log('Auto-saving section changes...');
          updateSectionInBackend(updatedSection);
        }
      }
    }, 300000); // 5분마다
    
    return () => clearInterval(interval);
  }, [sections, selectedSection, nodes, updateSectionInBackend]);

  // 노드 변경 핸들러
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    changes.forEach(change => {
      if (change.type === 'position' && 'position' in change && change.position) {
        if ('dragging' in change && change.dragging === false) {
          // 드래그 완료 시 위치 업데이트
          console.log(`Node ${change.id} drag completed at position:`, change.position);
          updateNodePosition(change.id, {
            x: Math.round(change.position.x),
            y: Math.round(change.position.y)
          });
        }
      }
    });
    
    setNodes((currentNodes) => {
      const updatedNodes = applyNodeChanges(changes, currentNodes);
      
      // 캐시 업데이트
      const currentSection = sections.find(s => s.name === selectedSection);
      if (currentSection) {
        sectionNodesRef.current[currentSection.id] = updatedNodes;
      }
      
      return updatedNodes;
    });
  }, [updateNodePosition, sections, selectedSection]);

  // Edge 변경 핸들러
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => {
      const updatedEdges = applyEdgeChanges(changes, eds);
      if (currentSection) {
        sectionEdgesRef.current[currentSection.id] = updatedEdges;
      }
      return updatedEdges;
    });
  }, [currentSection]);

  // 섹션 변경 시 React Flow 업데이트
  useEffect(() => {
    if (!currentSection) return;
    
    console.log('=== Section changed to:', currentSection.name, '===');
    
    // 이전 섹션의 노드 상태 저장
    const prevSectionId = Object.keys(sectionNodesRef.current).find(id => 
      sectionNodesRef.current[id].length > 0 && id !== currentSection.id
    );
    if (prevSectionId && nodes.length > 0) {
      sectionNodesRef.current[prevSectionId] = [...nodes];
    }
    
    // 캐시된 노드가 있으면 사용
    const cachedNodes = sectionNodesRef.current[currentSection.id];
    if (cachedNodes && cachedNodes.length > 0) {
      console.log('Using cached nodes for section:', currentSection.id);
      setNodes(cachedNodes);
      
      // 엣지 복원
      const savedEdges = sectionEdgesRef.current[currentSection.id];
      if (savedEdges) {
        setEdges(savedEdges.map(edge => ({
          ...edge,
          data: {
            ...edge.data,
            onDelete: (edgeId: string) => {
              handleEdgeDelete(edgeId);
            },
            isActive: activeEdges.has(edge.id)
          },
          animated: activeEdges.has(edge.id),
          style: {
            stroke: activeEdges.has(edge.id) ? '#10b981' : '#94a3b8',
            strokeWidth: activeEdges.has(edge.id) ? 3 : 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: activeEdges.has(edge.id) ? '#10b981' : '#94a3b8',
          },
        })));
      }
      return;
    }
    
    // 캐시가 없으면 섹션 데이터에서 노드 생성
    console.log('Creating nodes from section data');
    
    // 노드 위치 검증
    const hasValidPositions = currentSection.nodes.every(node => 
      node.position && 
      typeof node.position.x === 'number' && 
      typeof node.position.y === 'number' &&
      !isNaN(node.position.x) && 
      !isNaN(node.position.y)
    );
    
    if (!hasValidPositions) {
      console.error('Invalid node positions detected!');
      currentSection.nodes.forEach(node => {
        console.error(`Node ${node.id}:`, node.position);
      });
    }
    
    // 노드 변환
    const flowNodes: FlowNode[] = currentSection.nodes.map((node, index) => {
      // 안전한 position 처리
      let position = { x: 0, y: 0 };
      let hasValidPosition = false;
      
      if (node.position && typeof node.position === 'object' && 'x' in node.position && 'y' in node.position) {
        const x = Number(node.position.x);
        const y = Number(node.position.y);
        
        // 유효한 position인지 확인 (0,0이 아니고 NaN이 아닌 경우)
        if (!isNaN(x) && !isNaN(y) && (x !== 0 || y !== 0)) {
          position = { x, y };
          hasValidPosition = true;
        }
      }
      
      // position이 없거나 유효하지 않은 경우에만 기본 위치 할당
      if (!hasValidPosition) {
        if (node.type === 'input') {
          position = { x: 100, y: 200 };
        } else if (node.type === 'output') {
          position = { x: 700, y: 200 };
        } else {
          // 다른 노드들은 격자 형태로 배치
          const col = index % 3;
          const row = Math.floor(index / 3);
          position = {
            x: 250 + col * 200,
            y: 100 + row * 150
          };
        }
        
        console.warn(`Node ${node.id} has no valid position, using default:`, position);
        
        // 기본 위치가 할당된 경우, 섹션 데이터도 업데이트
        const updatedSection = {
          ...currentSection,
          nodes: currentSection.nodes.map(n => 
            n.id === node.id ? { ...n, position } : n
          )
        };
        updateSectionInBackend(updatedSection);
      }
      
      const flowNode: FlowNode = {
        id: node.id,
        type: node.type,
        position: position,
        data: {
          ...node,
          onEdit: () => setEditingNode(node),
          onDeactivate: () => nodeCallbacks.onDeactivate(node.id),
          onToggleRun: () => nodeCallbacks.onToggleRun(node.id),
          onDelete: nodeCallbacks.onDelete,
          onUpdate: nodeCallbacks.onUpdate,
          progress: nodeProgress[node.id] || 0,
          isExecuting: runningNodes.has(node.id),
          isCompleted: completedNodes.has(node.id),
        },
        selected: selectedNodeId === node.id,
        style: {
          opacity: node.isDeactivated ? 0.5 : 1,
        },
        sourcePosition: FlowPosition.Right,
        targetPosition: FlowPosition.Left,
      };
      
      console.log(`Flow node created: ${node.id} at position:`, flowNode.position);
      
      return flowNode;
    });
    
    // 엣지 변환
    const savedEdges = sectionEdgesRef.current[currentSection.id];
    
    if (savedEdges) {
      setEdges(savedEdges.map(edge => ({
        ...edge,
        data: {
          ...edge.data,
          onDelete: (edgeId: string) => {
            handleEdgeDelete(edgeId);
          },
          isActive: activeEdges.has(edge.id)
        },
        animated: activeEdges.has(edge.id),
        style: {
          stroke: activeEdges.has(edge.id) ? '#10b981' : '#94a3b8',
          strokeWidth: activeEdges.has(edge.id) ? 3 : 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: activeEdges.has(edge.id) ? '#10b981' : '#94a3b8',
        },
      })));
    } else {
      const flowEdges: Edge[] = [];
      currentSection.nodes.forEach(node => {
        if (node.connectedFrom && Array.isArray(node.connectedFrom)) {
          node.connectedFrom.forEach(fromId => {
            const edgeId = `${fromId}-${node.id}`;
            flowEdges.push({
              id: edgeId,
              source: fromId,
              target: node.id,
              type: 'custom',
              animated: activeEdges.has(edgeId),
              data: { 
                onDelete: (edgeId: string) => {
                  handleEdgeDelete(edgeId);
                },
                isActive: activeEdges.has(edgeId)
              },
              style: {
                stroke: activeEdges.has(edgeId) ? '#10b981' : '#94a3b8',
                strokeWidth: activeEdges.has(edgeId) ? 3 : 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: activeEdges.has(edgeId) ? '#10b981' : '#94a3b8',
              },
            });
          });
        }
      });
      
      setEdges(flowEdges);
      sectionEdgesRef.current[currentSection.id] = flowEdges;
    }
    
    console.log('Setting flow nodes:', flowNodes);
    setNodes(flowNodes);
    
    // 캐시에 저장
    sectionNodesRef.current[currentSection.id] = flowNodes;
  }, [currentSection?.id, selectedSection]); // 최소한의 dependencies만 사용

  // 동적 상태 업데이트를 위한 별도 effect (position 제외)
  useEffect(() => {
    if (!currentSection) return;
    
    setNodes(prevNodes => prevNodes.map(node => {
      const sectionNode = currentSection.nodes.find(n => n.id === node.id);
      if (!sectionNode) return node;
      
      // position은 업데이트하지 않음 - 이미 설정된 position 유지
      return {
        ...node,
        // position은 변경하지 않음!
        data: {
          ...node.data,
          ...sectionNode,
          position: node.position, // 기존 position 유지
          onEdit: () => setEditingNode(sectionNode),
          onDeactivate: () => nodeCallbacks.onDeactivate(node.id),
          onToggleRun: () => nodeCallbacks.onToggleRun(node.id),
          onDelete: nodeCallbacks.onDelete,
          onUpdate: nodeCallbacks.onUpdate,
          progress: nodeProgress[node.id],
          isExecuting: runningNodes.has(node.id),
          isCompleted: completedNodes.has(node.id),
        },
        selected: selectedNodeId === node.id,
        style: {
          opacity: sectionNode.isDeactivated ? 0.5 : 1,
        },
      };
    }));
    
    // Active edges 업데이트
    setEdges(prevEdges => prevEdges.map(edge => ({
      ...edge,
      animated: activeEdges.has(edge.id),
      data: {
        ...edge.data,
        onDelete: (edgeId: string) => {
          handleEdgeDelete(edgeId);
        },
        isActive: activeEdges.has(edge.id)
      },
      style: {
        stroke: activeEdges.has(edge.id) ? '#10b981' : '#94a3b8',
        strokeWidth: activeEdges.has(edge.id) ? 3 : 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: activeEdges.has(edge.id) ? '#10b981' : '#94a3b8',
      },
    })));
  }, [selectedNodeId, nodeProgress, runningNodes, completedNodes, activeEdges, currentSection?.nodes, nodeCallbacks, handleEdgeDelete]);

  // 연결 생성
  const onConnect = useCallback((params: FlowConnection) => {
    const section = sections.find(s => s.name === selectedSection);
    if (!section || params.source === params.target) return;
    
    const edgeId = `${params.source}-${params.target}`;
    const existingEdge = edges.find(e => e.id === edgeId);
    if (existingEdge) {
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'info',
        message: 'Connection already exists'
      });
      return;
    }
    
    // React Flow에 edge 추가
    const newEdge = {
      ...params,
      id: edgeId,
      type: 'custom',
      animated: false,
      data: { 
        onDelete: (edgeId: string) => {
          handleEdgeDelete(edgeId);
        }
      },
      style: {
        stroke: '#94a3b8',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#94a3b8',
      },
    };
    
    setEdges(eds => {
      const updated = addEdge(newEdge, eds);
      sectionEdgesRef.current[section.id] = updated;
      return updated;
    });
    
    // 섹션 데이터 업데이트하고 백엔드에 저장
    const updatedSection = {
      ...section,
      nodes: section.nodes.map(n => {
        if (n.id === params.source) {
          const currentConnectedTo = n.connectedTo || [];
          if (!currentConnectedTo.includes(params.target!)) {
            return { ...n, connectedTo: [...currentConnectedTo, params.target!] };
          }
        }
        if (n.id === params.target) {
          const currentConnectedFrom = n.connectedFrom || [];
          if (!currentConnectedFrom.includes(params.source!)) {
            return { ...n, connectedFrom: [...currentConnectedFrom, params.source!] };
          }
        }
        return n;
      })
    };
    
    setSections(prev => prev.map(s => s.id === updatedSection.id ? updatedSection : s));
    updateSectionInBackend(updatedSection);
    
    addLog({
      nodeId: 'system',
      nodeLabel: 'System',
      type: 'info',
      message: 'Connection created'
    });
  }, [sections, selectedSection, edges, updateSectionInBackend, addLog, handleEdgeDelete]);

  // WebSocket handlers
  const wsHandlers = useMemo(() => ({
    onProgress: (nodeId: string, progress: number) => {
      setNodeProgress(prev => ({ ...prev, [nodeId]: progress }));
      
      if (progress >= 1) {
        setCompletedNodes(prev => new Set([...prev, nodeId]));
        addLog({
          nodeId,
          nodeLabel: currentSection?.nodes.find(n => n.id === nodeId)?.label || 'Node',
          type: 'complete',
          message: 'Execution completed successfully'
        });
        
        // 3초 후에 complete 상태를 제거
        setTimeout(() => {
          setCompletedNodes(prev => {
            const newSet = new Set(prev);
            newSet.delete(nodeId);
            return newSet;
          });
        }, 3000);
      }
      
      if (progress >= 1 || progress < 0) {
        setTimeout(() => {
          setNodeProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[nodeId];
            return newProgress;
          });
          setRunningNodes(prev => {
            const newSet = new Set(prev);
            newSet.delete(nodeId);
            return newSet;
          });
        }, 2000);
      }
    },
    onNodeOutputUpdated: (nodeId: string, output: string) => {
      setSections(prev => prev.map(section => ({
        ...section,
        nodes: section.nodes.map(n => n.id === nodeId ? { ...n, output } : n)
      })));
    },
    onNodeExecutionStart: (nodeId: string) => {
      setRunningNodes(prev => new Set([...prev, nodeId]));
      addLog({
        nodeId,
        nodeLabel: currentSection?.nodes.find(n => n.id === nodeId)?.label || 'Node',
        type: 'processing',
        message: 'Processing...'
      });
    },
    onNodeExecutionComplete: (nodeId: string) => {
      setRunningNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
      setCompletedNodes(prev => new Set([...prev, nodeId]));
      
      // 3초 후에 complete 상태를 제거
      setTimeout(() => {
        setCompletedNodes(prev => {
          const newSet = new Set(prev);
          newSet.delete(nodeId);
          return newSet;
        });
      }, 3000);
    },
    onNodeExecutionError: (nodeId: string, error: string) => {
      setRunningNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
      addLog({
        nodeId,
        nodeLabel: currentSection?.nodes.find(n => n.id === nodeId)?.label || 'Node',
        type: 'error',
        message: `Error: ${error}`
      });
    },
    onFlowProgress: (sourceId: string, targetId: string) => {
      const edgeId = `${sourceId}-${targetId}`;
      setActiveEdges(prev => new Set([...prev, edgeId]));
      
      setTimeout(() => {
        setActiveEdges(prev => {
          const newSet = new Set(prev);
          newSet.delete(edgeId);
          return newSet;
        });
      }, 1000);
    }
  }), [currentSection, addLog]);

  useWebSocket(wsHandlers);

  // 노드 추가
  const handleNodeAdd = useCallback(async (nodeType: string) => {
    if (!currentSection) return;

    // 기존 노드들의 위치를 확인하여 겹치지 않는 위치 찾기
    const existingPositions = nodes.map(n => n.position);
    
    // 화면 중앙 위치
    const centerPosition = project({ 
      x: window.innerWidth / 2, 
      y: window.innerHeight / 2 
    });
    
    // 겹치지 않는 위치 찾기
    let position = { ...centerPosition };
    let offset = 0;
    
    // 같은 위치에 노드가 있는지 확인
    const isPositionOccupied = (pos: { x: number; y: number }) => {
      return existingPositions.some(p => 
        Math.abs(p.x - pos.x) < 50 && Math.abs(p.y - pos.y) < 50
      );
    };
    
    // 겹치는 경우 오프셋 적용
    while (isPositionOccupied(position) && offset < 10) {
      offset++;
      position = {
        x: centerPosition.x + (offset * 60),
        y: centerPosition.y + (offset * 60)
      };
    }

    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType as Node['type'],
      label: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
      position: { x: Math.round(position.x), y: Math.round(position.y) },
      isRunning: false,
      tasks: nodeType === 'worker' ? [
        { id: `task-${Date.now()}`, text: '', status: 'pending' }
      ] : undefined
    };

    const updatedSection = {
      ...currentSection,
      nodes: [...currentSection.nodes, newNode]
    };

    setSections(prev => prev.map(s => s.id === updatedSection.id ? updatedSection : s));
    
    const flowNode: FlowNode = {
      id: newNode.id,
      type: newNode.type,
      position: newNode.position,
      data: {
        ...newNode,
        onEdit: () => setEditingNode(newNode),
        onDeactivate: () => nodeCallbacks.onDeactivate(newNode.id),
        onToggleRun: () => nodeCallbacks.onToggleRun(newNode.id),
        onDelete: nodeCallbacks.onDelete,
        onUpdate: nodeCallbacks.onUpdate,
        progress: 0,
        isExecuting: false,
        isCompleted: false,
      },
      selected: false,
      style: {
        opacity: 1,
      },
      sourcePosition: FlowPosition.Right,
      targetPosition: FlowPosition.Left,
    };
    
    setNodes(prev => {
      const newNodes = [...prev, flowNode];
      // 캐시 업데이트
      sectionNodesRef.current[updatedSection.id] = newNodes;
      return newNodes;
    });
    
    // 백엔드에 즉시 저장 (디바운스 없이)
    try {
      const response = await apiCall(`${API_URL}/sections/${updatedSection.id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedSection)
      });
      console.log('Node added and saved:', response);
    } catch (error) {
      console.error('Failed to save new node:', error);
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'error',
        message: 'Failed to save new node'
      });
    }
    
    addLog({
      nodeId: 'system',
      nodeLabel: 'System',
      type: 'info',
      message: `Added ${nodeType} node at position (${newNode.position.x}, ${newNode.position.y})`
    });
  }, [currentSection, nodes, project, updateSectionInBackend, addLog, nodeCallbacks]);

  // Flow 실행
  const playFlow = useCallback(async () => {
    if (!currentSection) return;
    
    // 상태 초기화
    setExecutionLogs([]);
    setShowLogs(true);
    setCompletedNodes(new Set());
    setActiveEdges(new Set());
    
    const inputNode = currentSection.nodes.find(n => n.type === 'input');
    if (!inputNode) {
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'error',
        message: 'No input node found in the current section'
      });
      return;
    }
    
    addLog({
      nodeId: 'system',
      nodeLabel: 'System',
      type: 'start',
      message: 'Starting flow execution...'
    });
    
    try {
      const response = await apiCall(`${API_URL}/execute-flow`, {
        method: 'POST',
        body: JSON.stringify({
          sectionId: currentSection.id,
          startNodeId: inputNode.id
        })
      });
      
      if (response) {
        addLog({
          nodeId: 'system',
          nodeLabel: 'System',
          type: 'info',
          message: 'Flow execution initiated successfully'
        });
      }
    } catch (error: any) {
      console.error('Flow execution failed:', error);
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'error',
        message: `Failed to start flow execution: ${error.message}`
      });
    }
  }, [currentSection, addLog]);

  // 수동 저장 함수
  const handleManualSave = useCallback(async () => {
    const current = sections.find(s => s.name === selectedSection);
    if (!current) return;
    
    setIsSaving(true);
    
    try {
      // 현재 React Flow 상태를 섹션에 반영
      const updatedNodes = current.nodes.map(sectionNode => {
        const flowNode = nodes.find(n => n.id === sectionNode.id);
        if (flowNode) {
          return {
            ...sectionNode,
            position: {
              x: flowNode.position.x,
              y: flowNode.position.y
            }
          };
        }
        return sectionNode;
      });
      
      const updatedSection = {
        ...current,
        nodes: updatedNodes
      };
      
      await apiCall(`${API_URL}/sections/${updatedSection.id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedSection)
      });
      
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'info',
        message: 'Section saved successfully'
      });
    } catch (error) {
      console.error('Failed to save section:', error);
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'error',
        message: 'Failed to save section'
      });
    } finally {
      setIsSaving(false);
    }
  }, [sections, selectedSection, nodes, addLog]);

  // 섹션 변경 전에 현재 섹션 저장
  const saveCurrentSection = useCallback(async () => {
    const current = sections.find(s => s.name === selectedSection);
    if (!current) return;
    
    // 현재 React Flow 상태를 섹션에 반영
    const updatedNodes = current.nodes.map(sectionNode => {
      const flowNode = nodes.find(n => n.id === sectionNode.id);
      if (flowNode) {
        return {
          ...sectionNode,
          position: {
            x: flowNode.position.x,
            y: flowNode.position.y
          }
        };
      }
      return sectionNode;
    });
    
    const updatedSection = {
      ...current,
      nodes: updatedNodes
    };
    
    // 섹션 업데이트
    setSections(prev => prev.map(s => 
      s.id === updatedSection.id ? updatedSection : s
    ));
    
    // 백엔드에 저장
    await updateSectionInBackend(updatedSection);
    
    // 펜딩 업데이트가 있으면 즉시 저장
    if (Object.keys(pendingUpdatesRef.current).length > 0) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      const sectionsToUpdate = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      
      setIsSaving(true);
      
      for (const [sectionId, sectionData] of Object.entries(sectionsToUpdate)) {
        try {
          await apiCall(`${API_URL}/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify(sectionData)
          });
        } catch (error) {
          console.error('Failed to save section:', error);
        }
      }
      
      setIsSaving(false);
    }
  }, [sections, selectedSection, nodes, updateSectionInBackend]);
  
  // 섹션 변경 핸들러
  const handleSectionChange = useCallback(async (sectionName: string) => {
    console.log(`Changing section from ${selectedSection} to ${sectionName}`);
    
    // 현재 섹션 저장 (React Flow 상태 포함)
    const current = sections.find(s => s.name === selectedSection);
    if (current && nodes.length > 0) {
      // 현재 React Flow 상태를 섹션에 반영
      const updatedNodes = current.nodes.map(sectionNode => {
        const flowNode = nodes.find(n => n.id === sectionNode.id);
        if (flowNode) {
          return {
            ...sectionNode,
            position: {
              x: flowNode.position.x,
              y: flowNode.position.y
            }
          };
        }
        return sectionNode;
      });
      
      const updatedSection = {
        ...current,
        nodes: updatedNodes
      };
      
      // 섹션 업데이트
      setSections(prev => prev.map(s => 
        s.id === updatedSection.id ? updatedSection : s
      ));
      
      // 백엔드에 즉시 저장 (디바운스 없이)
      try {
        console.log('Saving current section before switching...');
        await apiCall(`${API_URL}/sections/${updatedSection.id}`, {
          method: 'PUT',
          body: JSON.stringify(updatedSection)
        });
        console.log('Section saved successfully');
      } catch (error) {
        console.error('Failed to save section:', error);
      }
    }
    
    // 상태 초기화
    setCompletedNodes(new Set());
    setActiveEdges(new Set());
    setNodeProgress({});
    setRunningNodes(new Set());
    setSelectedSection(sectionName);
  }, [selectedSection, sections, nodes]);

  // 그룹 변경 핸들러
  const handleGroupChange = useCallback(async (group: keyof typeof GROUPS) => {
    // 현재 섹션 저장 (React Flow 상태 포함)
    const current = sections.find(s => s.name === selectedSection);
    if (current && nodes.length > 0) {
      // 현재 React Flow 상태를 섹션에 반영
      const updatedNodes = current.nodes.map(sectionNode => {
        const flowNode = nodes.find(n => n.id === sectionNode.id);
        if (flowNode) {
          return {
            ...sectionNode,
            position: {
              x: flowNode.position.x,
              y: flowNode.position.y
            }
          };
        }
        return sectionNode;
      });
      
      const updatedSection = {
        ...current,
        nodes: updatedNodes
      };
      
      // 섹션 업데이트
      setSections(prev => prev.map(s => 
        s.id === updatedSection.id ? updatedSection : s
      ));
      
      // 백엔드에 즉시 저장
      try {
        console.log('Saving current section before changing group...');
        await apiCall(`${API_URL}/sections/${updatedSection.id}`, {
          method: 'PUT',
          body: JSON.stringify(updatedSection)
        });
        console.log('Section saved successfully');
      } catch (error) {
        console.error('Failed to save section:', error);
      }
    }
    
    // 상태 초기화
    setCompletedNodes(new Set());
    setActiveEdges(new Set());
    setNodeProgress({});
    setRunningNodes(new Set());
    
    setSelectedGroup(group);
    const firstSection = sections.find(s => s.group === group);
    if (firstSection) {
      setSelectedSection(firstSection.name);
    }
  }, [sections, selectedSection, nodes]);

  // 페이지 언로드 시 저장
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 현재 섹션 저장
      const current = sections.find(s => s.name === selectedSection);
      if (current && nodes.length > 0) {
        // 현재 React Flow 상태를 섹션에 반영
        const updatedNodes = current.nodes.map(sectionNode => {
          const flowNode = nodes.find(n => n.id === sectionNode.id);
          if (flowNode) {
            return {
              ...sectionNode,
              position: {
                x: flowNode.position.x,
                y: flowNode.position.y
              }
            };
          }
          return sectionNode;
        });
        
        const updatedSection = {
          ...current,
          nodes: updatedNodes
        };
        
        // 펜딩 업데이트에 추가
        pendingUpdatesRef.current[current.id] = updatedSection;
      }
      
      if (Object.keys(pendingUpdatesRef.current).length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sections, selectedSection, nodes]);
  
  // 초기 로드
  useEffect(() => {
    const checkReactFlowReady = () => {
      const styleSheets = Array.from(document.styleSheets);
      const reactFlowLoaded = styleSheets.some(sheet => {
        try {
          return sheet.href && sheet.href.includes('reactflow');
        } catch (e) {
          return false;
        }
      });
      
      if (reactFlowLoaded || document.querySelector('.react-flow')) {
        setIsReactFlowReady(true);
        
        apiCall(`${API_URL}/sections`)
          .then(data => {
            console.log('=== Raw API Response ===');
            console.log(JSON.stringify(data, null, 2));
            
            const cleanedSections = data.map((section: any) => {
              const cleanedSection = {
                ...section,
                nodes: section.nodes.map((node: any, index: number) => {
                  // position 데이터 확인
                  let finalPosition = { x: 0, y: 0 };
                  let hasValidPosition = false;
                  
                  console.log(`Processing node ${node.id}, raw position:`, node.position);
                  
                  if (node.position && typeof node.position === 'object' && 'x' in node.position && 'y' in node.position) {
                    const x = Number(node.position.x);
                    const y = Number(node.position.y);
                    
                    // 유효한 position인지 확인 (0,0이 아니고 NaN이 아닌 경우)
                    if (!isNaN(x) && !isNaN(y) && (x !== 0 || y !== 0)) {
                      finalPosition = { x, y };
                      hasValidPosition = true;
                    }
                  }
                  
                  // position이 없거나 유효하지 않은 경우에만 기본 위치 설정
                  if (!hasValidPosition) {
                    if (node.type === 'input') {
                      finalPosition = { x: 100, y: 200 };
                    } else if (node.type === 'output') {
                      finalPosition = { x: 700, y: 200 };
                    } else {
                      const col = (index - 2) % 3;
                      const row = Math.floor((index - 2) / 3);
                      finalPosition = {
                        x: 250 + col * 200,
                        y: 100 + row * 150
                      };
                    }
                    console.warn(`Node ${node.id} has no valid position, assigning default:`, finalPosition);
                  }
                  
                  return {
                    ...node,
                    position: finalPosition
                  };
                })
              };
              
              return cleanedSection;
            });
            
            console.log('=== Cleaned Sections ===');
            cleanedSections.forEach((section: any) => {
              console.log(`Section ${section.name}:`);
              section.nodes.forEach((node: any) => {
                console.log(`  - ${node.id} (${node.type}): position=${JSON.stringify(node.position)}`);
              });
            });
            
            setSections(cleanedSections);
            setIsLoading(false);
          })
          .catch(error => {
            console.error('Failed to fetch sections:', error);
            setIsLoading(false);
            addLog({
              nodeId: 'system',
              nodeLabel: 'System',
              type: 'error',
              message: 'Failed to load sections. Check if backend is running on port 8000.'
            });
          });
      } else {
        setTimeout(checkReactFlowReady, 100);
      }
    };
    
    checkReactFlowReady();
  }, [addLog]);
  
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="flex items-center p-4">
          <h1 className="text-2xl font-bold mr-8">AI Production Pipeline</h1>
          
          {/* Group Selector */}
          <div className="flex gap-2">
            {Object.keys(GROUPS).map(group => (
              <button
                key={group}
                onClick={() => handleGroupChange(group as keyof typeof GROUPS)}
                className={`px-4 py-2 rounded transition-colors ${
                  selectedGroup === group 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                {group.charAt(0).toUpperCase() + group.slice(1)}
              </button>
            ))}
          </div>
          
          <div className="ml-auto mr-4 flex items-center gap-2">
            {isSaving && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="p-2 rounded hover:bg-gray-100"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-2 px-4 pb-2 items-center">
          {sections
            .filter(s => s.group === selectedGroup)
            .map(section => (
              <button
                key={section.id}
                onClick={() => handleSectionChange(section.name)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  selectedSection === section.name
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                {section.name}
              </button>
            ))}
          
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleManualSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Save
                </>
              )}
            </button>
            <button
              onClick={playFlow}
              className="flex items-center gap-2 px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
            >
              <Play className="w-4 h-4" />
              Play Flow
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 relative">
        {isLoading || !isReactFlowReady ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">
              {!isReactFlowReady ? 'Initializing...' : 'Loading sections...'}
            </div>
          </div>
        ) : sections.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">
              No sections loaded. Make sure backend is running on http://localhost:8000
            </div>
          </div>
        ) : (
          <ReactFlow
            key={currentSection?.id} // 섹션별로 고유 key
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            zoomOnDoubleClick={false}
            fitView={false}
            minZoom={0.1}
            maxZoom={2}
            preventScrolling={false}
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Lines} />
            <Controls />
            <MiniMap />
            
            <Panel position="bottom-center" className="bg-white rounded-lg shadow-lg p-4">
              <div className="flex gap-4">
                {NODE_TYPES
                  .filter(nodeType => nodeType.type !== 'input' && nodeType.type !== 'output')
                  .map(nodeType => (
                    <button
                      key={nodeType.type}
                      onClick={() => handleNodeAdd(nodeType.type)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                    >
                      <span className="text-xl">{nodeType.icon}</span>
                      <span>{nodeType.label}</span>
                    </button>
                  ))}
              </div>
            </Panel>
          </ReactFlow>
        )}
      </div>

      {/* Modals */}
      {editingNode && currentSection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[95%] max-w-7xl h-5/6 flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">
                Edit {editingNode.type === 'worker' ? '👷 Worker' : 
                      editingNode.type === 'supervisor' ? '👔 Supervisor' : 
                      editingNode.type === 'planner' ? '📋 Planner' :
                      editingNode.type === 'input' ? '➡️ Input' : '⬅️ Output'} - {editingNode.label}
              </h2>
              <button onClick={() => setEditingNode(null)} className="text-2xl">&times;</button>
            </div>
            
            <div className="flex-1 overflow-hidden flex">
              {/* Left Panel - Current Input */}
              {(editingNode.type === 'worker' || editingNode.type === 'supervisor' || editingNode.type === 'planner') && (
                <div className="w-1/4 border-r p-4 overflow-y-auto">
                  <h3 className="font-semibold mb-2">Current Input</h3>
                  {editingNode.connectedFrom && editingNode.connectedFrom.length > 0 ? (
                    <div className="space-y-3">
                      {editingNode.connectedFrom.map(nodeId => {
                        const connectedNode = currentSection.nodes.find(n => n.id === nodeId);
                        return connectedNode ? (
                          <div key={nodeId} className="border rounded p-2">
                            <div className="font-medium text-sm mb-1">{connectedNode.label}</div>
                            <pre className="bg-gray-100 rounded p-2 text-xs overflow-x-auto">
                              {connectedNode.output ? JSON.stringify(connectedNode.output, null, 2) : 'No output'}
                            </pre>
                          </div>
                        ) : null;
                      })}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm">No connected inputs</div>
                  )}
                </div>
              )}
              
              {/* Center Panel - Code Editor + Settings */}
              {(editingNode.type === 'worker' || editingNode.type === 'supervisor' || editingNode.type === 'planner') && (
                <div className="flex-1 flex flex-col">
                  {/* Code Editor */}
                  <div className="flex-1 flex flex-col">
                    <div className="p-3 border-b bg-gray-50">
                      <h3 className="font-semibold">Python Code</h3>
                    </div>
                    <div className="flex-1 bg-gray-900 text-gray-100 font-mono text-sm p-4 overflow-auto">
                      <textarea
                        value={editingNode.code || `# ${editingNode.type} code
# Access input data via get_connected_outputs()
# Set results in 'output' variable

import json

# Get connected outputs
inputs = get_connected_outputs()

# Your code here
output = {
    "status": "success",
    "data": {}
}
`}
                        onChange={(e) => setEditingNode({ ...editingNode, code: e.target.value })}
                        className="w-full h-full bg-gray-900 outline-none resize-none"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                  
                  {/* Settings below Code */}
                  <div className="border-t p-4 bg-gray-50 max-h-64 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Node Label</label>
                        <input
                          type="text"
                          value={editingNode.label}
                          onChange={(e) => setEditingNode({ ...editingNode, label: e.target.value })}
                          className="w-full border rounded px-3 py-2"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-2">LM Studio Connection</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="http://localhost:1234"
                            value={editingNode.lmStudioUrl || 'http://localhost:1234'}
                            onChange={(e) => setEditingNode({ ...editingNode, lmStudioUrl: e.target.value })}
                            className="flex-1 border rounded px-3 py-2"
                          />
                          <button
                            onClick={async () => {
                              try {
                                const response = await fetch(`${editingNode.lmStudioUrl || 'http://localhost:1234'}/v1/models`);
                                const data = await response.json();
                                setEditingNode({ ...editingNode, availableModels: data.data || [] });
                                addLog({
                                  nodeId: 'system',
                                  nodeLabel: 'System',
                                  type: 'info',
                                  message: `Loaded ${data.data?.length || 0} models from LM Studio`
                                });
                              } catch (error) {
                                addLog({
                                  nodeId: 'system',
                                  nodeLabel: 'System',
                                  type: 'error',
                                  message: 'Failed to connect to LM Studio'
                                });
                              }
                            }}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                            Load Models
                          </button>
                        </div>
                      </div>
                      
                      {editingNode.availableModels && editingNode.availableModels.length > 0 && (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium mb-2">Select AI Model</label>
                          <select
                            value={editingNode.model || ''}
                            onChange={(e) => setEditingNode({ ...editingNode, model: e.target.value })}
                            className="w-full border rounded px-3 py-2"
                          >
                            <option value="">Select a model...</option>
                            {editingNode.availableModels.map((model: any) => (
                              <option key={model.id} value={model.id}>{model.id}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      
                      {editingNode.type === 'worker' && (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium mb-2">Tasks</label>
                          <div className="space-y-2">
                            {editingNode.tasks?.map((task, index) => (
                              <div key={task.id} className="flex gap-2">
                                <input
                                  type="text"
                                  value={task.text}
                                  onChange={(e) => {
                                    const updatedTasks = [...(editingNode.tasks || [])];
                                    updatedTasks[index] = { ...task, text: e.target.value };
                                    setEditingNode({ ...editingNode, tasks: updatedTasks });
                                  }}
                                  placeholder={`Task ${index + 1}`}
                                  className="flex-1 border rounded px-2 py-1 text-sm"
                                />
                                <select
                                  value={task.status}
                                  onChange={(e) => {
                                    const updatedTasks = [...(editingNode.tasks || [])];
                                    updatedTasks[index] = { ...task, status: e.target.value as 'pending' | 'none' | 'partial' };
                                    setEditingNode({ ...editingNode, tasks: updatedTasks });
                                  }}
                                  className="border rounded px-2 py-1 text-sm"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="partial">Partial</option>
                                  <option value="none">Complete</option>
                                </select>
                                <button
                                  onClick={() => {
                                    const updatedTasks = editingNode.tasks?.filter((_, i) => i !== index) || [];
                                    setEditingNode({ ...editingNode, tasks: updatedTasks });
                                  }}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => {
                                const newTask = { id: `task-${Date.now()}`, text: '', status: 'pending' as const };
                                setEditingNode({ 
                                  ...editingNode, 
                                  tasks: [...(editingNode.tasks || []), newTask] 
                                });
                              }}
                              className="text-sm text-blue-500 hover:text-blue-700"
                            >
                              + Add Task
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {editingNode.type === 'supervisor' && (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium mb-2">Supervised Nodes</label>
                          <div className="space-y-1">
                            {currentSection.nodes
                              .filter(n => n.type === 'worker')
                              .map(n => (
                                <label key={n.id} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={editingNode.supervisedNodes?.includes(n.id) || false}
                                    onChange={(e) => {
                                      const supervisedNodes = e.target.checked
                                        ? [...(editingNode.supervisedNodes || []), n.id]
                                        : editingNode.supervisedNodes?.filter(id => id !== n.id) || [];
                                      setEditingNode({ ...editingNode, supervisedNodes });
                                    }}
                                  />
                                  {n.label}
                                </label>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="p-3 border-t flex gap-2">
                    <button
                      onClick={() => {
                        if (editingNode) {
                          const isNodeRunning = runningNodes.has(editingNode.id);
                          const isNodeCompleted = completedNodes.has(editingNode.id);
                          
                          if (!isNodeRunning && !isNodeCompleted) {
                            nodeCallbacks.onToggleRun(editingNode.id);
                            addLog({
                              nodeId: editingNode.id,
                              nodeLabel: editingNode.label,
                              type: 'info',
                              message: 'Test execution from edit modal'
                            });
                          }
                        }
                      }}
                      disabled={runningNodes.has(editingNode.id) || completedNodes.has(editingNode.id)}
                      className={`flex items-center gap-2 rounded px-4 py-2 transition-all duration-300 ${
                        runningNodes.has(editingNode.id) 
                          ? 'bg-orange-500 text-white cursor-not-allowed' 
                          : completedNodes.has(editingNode.id)
                          ? 'bg-green-500 text-white cursor-not-allowed'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                    >
                      {runningNodes.has(editingNode.id) ? (
                        <>
                          <Square className="w-4 h-4 animate-pulse" />
                          Pause
                        </>
                      ) : completedNodes.has(editingNode.id) ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Complete
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Test Run
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={() => setShowJsonViewer(true)}
                      className="flex items-center gap-2 bg-gray-600 text-white rounded px-4 py-2 hover:bg-gray-700 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      View JSON Source
                    </button>
                  </div>
                </div>
              )}
              
              {/* For Input/Output nodes - centered single panel */}
              {(editingNode.type === 'input' || editingNode.type === 'output') && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-2/3 p-4">
                    {editingNode.type === 'input' ? (
                      <div>
                        <h3 className="font-semibold mb-4">Input Configuration</h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">Node Label</label>
                            <input
                              type="text"
                              value={editingNode.label}
                              onChange={(e) => setEditingNode({ ...editingNode, label: e.target.value })}
                              className="w-full border rounded px-3 py-2"
                            />
                          </div>
                          {currentSection.group === 'preproduction' && currentSection.name === 'Script' ? (
                            <div>
                              <label className="block text-sm font-medium mb-2">Script Content</label>
                              <textarea
                                value={editingNode.output?.text || ''}
                                onChange={(e) => setEditingNode({ 
                                  ...editingNode, 
                                  output: { ...editingNode.output, text: e.target.value, type: 'script' } 
                                })}
                                className="w-full h-96 p-4 border rounded font-mono text-sm"
                                placeholder="Enter your script content here..."
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="block text-sm font-medium mb-2">Select Source Sections</label>
                              <div className="space-y-2">
                                {sections
                                  .filter(s => s.id !== currentSection.id)
                                  .map(s => (
                                    <label key={s.id} className="flex items-center gap-2">
                                      <input type="checkbox" />
                                      {s.name} ({s.group})
                                    </label>
                                  ))}
                              </div>
                            </div>
                          )}
                          <div className="mt-6">
                            <button
                              onClick={() => setShowJsonViewer(true)}
                              className="w-full flex items-center justify-center gap-2 bg-gray-600 text-white rounded px-4 py-2 hover:bg-gray-700 transition-colors"
                            >
                              <FileText className="w-4 h-4" />
                              View JSON Source
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 className="font-semibold mb-4">Output Configuration</h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">Node Label</label>
                            <input
                              type="text"
                              value={editingNode.label}
                              onChange={(e) => setEditingNode({ ...editingNode, label: e.target.value })}
                              className="w-full border rounded px-3 py-2"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Output Format</label>
                            <select className="w-full border rounded px-3 py-2">
                              <option value="json">JSON</option>
                              <option value="yaml">YAML</option>
                              <option value="xml">XML</option>
                            </select>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Connected Nodes</h4>
                            <div className="bg-gray-100 rounded p-3 space-y-2">
                              {editingNode.connectedFrom?.map(nodeId => {
                                const node = currentSection.nodes.find(n => n.id === nodeId);
                                return node ? (
                                  <div key={nodeId} className="flex justify-between items-center bg-white p-2 rounded">
                                    <span>{node.label}</span>
                                    <span className="text-sm text-gray-600">{node.type}</span>
                                  </div>
                                ) : null;
                              })}
                            </div>
                          </div>
                          <div className="mt-6">
                            <button
                              onClick={() => setShowJsonViewer(true)}
                              className="w-full flex items-center justify-center gap-2 bg-gray-600 text-white rounded px-4 py-2 hover:bg-gray-700 transition-colors"
                            >
                              <FileText className="w-4 h-4" />
                              View JSON Source
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Right Panel - Output/History */}
              {(editingNode.type === 'worker' || editingNode.type === 'supervisor' || editingNode.type === 'planner') && (
                <div className="w-1/4 border-l p-4 overflow-y-auto">
                  <h3 className="font-semibold mb-2">Current Output</h3>
                  {editingNode.output ? (
                    <pre className="bg-gray-100 rounded p-3 text-xs overflow-x-auto">
                      {JSON.stringify(editingNode.output, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-gray-500">No output yet</div>
                  )}
                  
                  {editingNode.aiScore && (
                    <div className="mt-4 p-3 bg-yellow-50 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">🏆</span>
                        <div>
                          <div className="font-medium">AI Score</div>
                          <div className="text-2xl font-bold text-yellow-600">
                            {editingNode.aiScore}/100
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t flex gap-2">
              <button
                onClick={() => {
                  nodeCallbacks.onUpdate(editingNode);
                  setEditingNode(null);
                  setShowJsonViewer(false);
                }}
                className="flex-1 bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setEditingNode(null);
                  setShowJsonViewer(false);
                }}
                className="flex-1 bg-gray-300 rounded px-4 py-2 hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Viewer Modal */}
      {showJsonViewer && editingNode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[60%] max-w-3xl h-4/5 flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                JSON Source - {editingNode.label}
              </h2>
              <button 
                onClick={() => setShowJsonViewer(false)} 
                className="text-2xl hover:text-gray-600"
              >&times;</button>
            </div>
            
            <div className="flex-1 p-4 overflow-auto">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm">
                {JSON.stringify(editingNode, null, 2)}
              </pre>
            </div>
            
            <div className="p-4 border-t flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(editingNode, null, 2));
                  addLog({
                    nodeId: 'system',
                    nodeLabel: 'System',
                    type: 'info',
                    message: 'JSON copied to clipboard'
                  });
                }}
                className="flex-1 bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setShowJsonViewer(false)}
                className="flex-1 bg-gray-300 rounded px-4 py-2 hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && currentSection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl p-6">
            <h2 className="text-xl font-bold mb-4">Section Settings - {currentSection.name}</h2>
            
            <div className="space-y-6">
              {/* Input Configuration */}
              <div>
                <h3 className="font-semibold mb-2">Input Configuration</h3>
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Source Sections</label>
                  {sections
                    .filter(s => s.id !== currentSection.id)
                    .map(s => (
                      <label key={s.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={currentSection.inputConfig?.sources.includes(s.id) || false}
                          onChange={(e) => {
                            const sources = e.target.checked
                              ? [...(currentSection.inputConfig?.sources || []), s.id]
                              : currentSection.inputConfig?.sources.filter(id => id !== s.id) || [];
                            
                            const updatedSection = {
                              ...currentSection,
                              inputConfig: { 
                                ...currentSection.inputConfig, 
                                sources, 
                                selectedItems: currentSection.inputConfig?.selectedItems || [] 
                              }
                            };
                            
                            setSections(prev => prev.map(section => 
                              section.id === updatedSection.id ? updatedSection : section
                            ));
                          }}
                        />
                        {s.name} ({s.group})
                      </label>
                    ))}
                </div>
              </div>

              {/* Output Configuration */}
              <div>
                <h3 className="font-semibold mb-2">Output Configuration</h3>
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Format</label>
                  <select
                    value={currentSection.outputConfig?.format || 'json'}
                    onChange={(e) => {
                      const updatedSection = {
                        ...currentSection,
                        outputConfig: { 
                          ...currentSection.outputConfig, 
                          format: e.target.value, 
                          autoSave: currentSection.outputConfig?.autoSave ?? true 
                        }
                      };
                      
                      setSections(prev => prev.map(section => 
                        section.id === updatedSection.id ? updatedSection : section
                      ));
                    }}
                    className="w-full border rounded p-2"
                  >
                    <option value="json">JSON</option>
                    <option value="yaml">YAML</option>
                    <option value="xml">XML</option>
                  </select>
                  
                  <label className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={currentSection.outputConfig?.autoSave ?? true}
                      onChange={(e) => {
                        const updatedSection = {
                          ...currentSection,
                          outputConfig: { 
                            ...currentSection.outputConfig, 
                            autoSave: e.target.checked, 
                            format: currentSection.outputConfig?.format || 'json' 
                          }
                        };
                        
                        setSections(prev => prev.map(section => 
                          section.id === updatedSection.id ? updatedSection : section
                        ));
                      }}
                    />
                    Auto-save outputs
                  </label>
                  
                  <button
                    onClick={async () => {
                      try {
                        const response = await apiCall(`${API_URL}/sections/export-output/${currentSection.id}`, {
                          method: 'POST'
                        });
                        
                        const format = currentSection.outputConfig?.format || 'json';
                        const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${currentSection.name}-output.${format}`;
                        a.click();
                      } catch (error) {
                        console.error('Export failed:', error);
                      }
                    }}
                    className="mt-3 bg-green-500 text-white rounded px-4 py-2 hover:bg-green-600"
                  >
                    Export Output
                  </button>
                </div>
              </div>
              
              {/* Section Information */}
              <div>
                <h3 className="font-semibold mb-2">Section Information</h3>
                <div className="bg-gray-100 rounded p-3 space-y-1 text-sm">
                  <div><strong>ID:</strong> {currentSection.id}</div>
                  <div><strong>Group:</strong> {currentSection.group}</div>
                  <div><strong>Nodes:</strong> {currentSection.nodes.length}</div>
                  <div><strong>Connections:</strong> {currentSection.nodes.reduce((acc, node) => 
                    acc + (node.connectedTo?.length || 0), 0
                  )}</div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button 
                onClick={async () => {
                  await updateSectionInBackend(currentSection);
                  setShowSettings(false);
                  addLog({
                    nodeId: 'system',
                    nodeLabel: 'System',
                    type: 'info',
                    message: 'Section settings saved'
                  });
                }} 
                className="flex-1 bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600"
              >
                Save
              </button>
              <button 
                onClick={() => setShowSettings(false)} 
                className="flex-1 bg-gray-300 rounded px-4 py-2 hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 실행 로그 패널 */}
      <div className={`fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg transition-all duration-300 ${showLogs ? '' : 'translate-y-full'}`}
           style={{ height: showLogs ? `${logsHeight}px` : '0px' }}>
        {/* 로그 헤더 */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span className="font-medium">Execution Logs</span>
            <span className="text-sm text-gray-500">({executionLogs.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExecutionLogs([])}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Clear
            </button>
            <button
              onClick={() => setShowLogs(prev => !prev)}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <ChevronDown className={`w-4 h-4 transform transition-transform ${showLogs ? '' : 'rotate-180'}`} />
            </button>
          </div>
        </div>
        
        {/* 로그 내용 */}
        <div className="overflow-y-auto" style={{ height: `calc(${logsHeight}px - 40px)` }}>
          {executionLogs.length === 0 ? (
            <div className="text-center text-gray-500 py-4">No logs yet</div>
          ) : (
            <div className="p-2 space-y-1">
              {executionLogs.map(log => (
                <div key={log.id} className="flex items-start gap-2 text-sm">
                  <span className="text-gray-400 text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`flex-shrink-0 ${
                    log.type === 'error' ? 'text-red-500' :
                    log.type === 'complete' ? 'text-green-500' :
                    log.type === 'start' ? 'text-blue-500' :
                    log.type === 'file_created' ? 'text-purple-500' :
                    'text-gray-600'
                  }`}>
                    {log.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
                     log.type === 'complete' ? <CheckCircle className="w-4 h-4" /> :
                     log.type === 'start' ? <Play className="w-4 h-4" /> :
                     log.type === 'file_created' ? <FileText className="w-4 h-4" /> :
                     <Clock className="w-4 h-4" />}
                  </span>
                  <span className="font-medium">[{log.nodeLabel}]</span>
                  <span className="text-gray-700">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* 리사이즈 핸들 */}
        <div 
          className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-500 transition-colors"
          onMouseDown={(e) => {
            const startY = e.clientY;
            const startHeight = logsHeight;
            
            const handleMouseMove = (e: MouseEvent) => {
              const newHeight = Math.max(100, Math.min(600, startHeight - (e.clientY - startY)));
              setLogsHeight(newHeight);
            };
            
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        />
      </div>
      
      {/* 로그 토글 버튼 (로그창이 닫혀있을 때) */}
      {!showLogs && executionLogs.length > 0 && (
        <button
          onClick={() => setShowLogs(true)}
          className="fixed bottom-4 right-4 bg-white border shadow-lg rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-gray-50"
        >
          <FileText className="w-4 h-4" />
          <span>Show Logs ({executionLogs.length})</span>
        </button>
      )}
    </div>
  );
}

export default function AIPipelineSystem() {
  return (
    <ReactFlowProvider>
      <AIPipelineFlow />
    </ReactFlowProvider>
  );
}