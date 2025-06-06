// frontend/src/App.tsx - 통합 및 개선된 버전
import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Position,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Play, Settings, ChevronDown, FileText, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import axios from 'axios';

import { Node, Section } from './types';
import { GROUPS, NODE_TYPES, API_URL } from './constants';
import { useWebSocket } from './hooks/useWebSocket';
import { CustomNode } from './components/flow/CustomNode';
import CustomEdge from './components/flow/CustomEdge';
import { 
  IOConfigModal, 
  SupervisorEditModal, 
  WorkerEditModal, 
  SectionSettingsModal 
} from './components/modals';

// 실행 로그 타입
interface ExecutionLog {
  id: string;
  timestamp: string;
  nodeId: string;
  nodeLabel: string;
  type: 'start' | 'processing' | 'complete' | 'error' | 'file_created' | 'info';
  message: string;
}

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
  // Core states
  const [selectedGroup, setSelectedGroup] = useState<keyof typeof GROUPS>('preproduction');
  const [selectedSection, setSelectedSection] = useState<string>('Script');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // React Flow states - 직접 관리
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  
  // UI states
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [nodeProgress, setNodeProgress] = useState<{ [key: string]: number }>({});
  const [runningNodes, setRunningNodes] = useState<Set<string>>(new Set());
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logsHeight, setLogsHeight] = useState(200);
  const [completedNodes, setCompletedNodes] = useState<Set<string>>(new Set());
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());
  
  // Refs
  const nodePositionsRef = useRef<{ [sectionId: string]: { [nodeId: string]: { x: number; y: number } } }>({});
  const isUpdatingRef = useRef(false);
  
  const { project } = useReactFlow();

  // 안전한 문자열 변환 함수
  const getOutputPreview = useCallback((output: any): string => {
    if (!output) return '';
    
    let str = '';
    if (typeof output === 'string') {
      str = output;
    } else if (typeof output === 'object') {
      try {
        str = JSON.stringify(output);
      } catch (e) {
        str = String(output);
      }
    } else {
      str = String(output);
    }
    
    return str.length > 50 ? str.substring(0, 50) + '...' : str;
  }, []);

  // 현재 섹션 가져오기
  const getCurrentSection = useCallback(() => {
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

  // 백엔드에서 섹션 가져오기
  const fetchSections = async () => {
    console.log('Fetching sections...');
    setIsLoading(true);
    
    try {
      const response = await axios.get(`${API_URL}/sections`);
      console.log('Sections response:', response.data);
      setSections(response.data);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch sections:', error);
      setIsLoading(false);
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'error',
        message: 'Failed to load sections. Check if backend is running on port 8000.'
      });
    }
  };

  // 초기 로드
  useEffect(() => {
    fetchSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 노드 위치 저장
  const saveNodePosition = useCallback((sectionId: string, nodeId: string, position: { x: number; y: number }) => {
    if (!nodePositionsRef.current[sectionId]) {
      nodePositionsRef.current[sectionId] = {};
    }
    nodePositionsRef.current[sectionId][nodeId] = position;
  }, []);

  // 백엔드 업데이트
  const updateSectionInBackend = useCallback(async (section: Section) => {
    if (isUpdatingRef.current) return;
    
    isUpdatingRef.current = true;
    try {
      await axios.put(`${API_URL}/sections/${section.id}`, section);
      console.log('Section updated in backend');
    } catch (error) {
      console.error('Failed to update section:', error);
    } finally {
      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 100);
    }
  }, []);

  // 노드 업데이트
  const handleNodeUpdate = useCallback((updatedNode: Node) => {
    setSections(prev => prev.map(section => {
      if (section.id === getCurrentSection()?.id) {
        const updatedSection = {
          ...section,
          nodes: section.nodes.map(n => n.id === updatedNode.id ? updatedNode : n)
        };
        updateSectionInBackend(updatedSection);
        return updatedSection;
      }
      return section;
    }));
  }, [getCurrentSection, updateSectionInBackend]);

  // 노드 비활성화
  const handleNodeDeactivate = useCallback(async (nodeId: string) => {
    try {
      const currentSection = getCurrentSection();
      if (!currentSection) return;
      
      await axios.post(`${API_URL}/node/${nodeId}/deactivate`, { 
        sectionId: currentSection.id 
      });
      
      const node = currentSection.nodes.find(n => n.id === nodeId);
      if (node) {
        handleNodeUpdate({ ...node, isDeactivated: !node.isDeactivated });
      }
    } catch (error) {
      console.error('Failed to toggle deactivation:', error);
    }
  }, [getCurrentSection, handleNodeUpdate]);

  // 노드 실행
  const handleNodeRun = useCallback(async (nodeId: string) => {
    const currentSection = getCurrentSection();
    const node = currentSection?.nodes.find(n => n.id === nodeId);
    
    if (!node || !currentSection) return;

    if (runningNodes.has(nodeId)) {
      // 중지
      try {
        await axios.post(`${API_URL}/stop/${nodeId}`);
        setRunningNodes(prev => {
          const newSet = new Set(prev);
          newSet.delete(nodeId);
          return newSet;
        });
        addLog({
          nodeId,
          nodeLabel: node.label || node.type,
          type: 'info',
          message: 'Execution stopped'
        });
      } catch (error) {
        console.error('Failed to stop node:', error);
      }
    } else {
      // 실행
      setRunningNodes(prev => new Set([...prev, nodeId]));
      
      try {
        addLog({
          nodeId,
          nodeLabel: node.label || node.type,
          type: 'start',
          message: 'Starting execution...'
        });
        
        await axios.post(`${API_URL}/execute`, {
          nodeId,
          sectionId: currentSection.id,
          code: node.code || '',
          inputs: {}
        });
      } catch (error) {
        console.error('Node execution failed:', error);
        setRunningNodes(prev => {
          const newSet = new Set(prev);
          newSet.delete(nodeId);
          return newSet;
        });
        addLog({
          nodeId,
          nodeLabel: node.label || node.type,
          type: 'error',
          message: 'Execution failed'
        });
      }
    }
  }, [getCurrentSection, runningNodes, addLog]);

  // 노드 삭제
  const handleNodeDelete = useCallback((nodeId: string) => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    // React Flow에서 즉시 제거
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
    
    // 섹션 데이터 업데이트
    const updatedSection = {
      ...currentSection,
      nodes: currentSection.nodes
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
      message: `Node deleted: ${nodeId}`
    });
  }, [getCurrentSection, updateSectionInBackend, addLog]);

  // Edge 삭제 - 수정된 버전
  const handleEdgeDelete = useCallback((edgeId: string) => {
    console.log('Deleting edge:', edgeId);
    
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    // edge에서 source와 target 추출
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;
    
    const { source: sourceId, target: targetId } = edge;
    
    // React Flow에서 즉시 제거
    setEdges(prev => prev.filter(e => e.id !== edgeId));
    
    // 섹션 데이터 업데이트
    const updatedSection = {
      ...currentSection,
      nodes: currentSection.nodes.map(node => {
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
    
    setSections(prev => prev.map(s => 
      s.id === updatedSection.id ? updatedSection : s
    ));
    
    updateSectionInBackend(updatedSection);
    
    addLog({
      nodeId: 'system',
      nodeLabel: 'System',
      type: 'info',
      message: `Connection removed: ${sourceId} → ${targetId}`
    });
  }, [edges, getCurrentSection, updateSectionInBackend, addLog]);

  // 노드 변경 핸들러 - 위치 저장 개선
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const currentSection = getCurrentSection();
    
    changes.forEach(change => {
      if (change.type === 'position' && 'position' in change && change.position && currentSection) {
        // 위치 변경 시 저장
        saveNodePosition(currentSection.id, change.id, change.position);
        
        // 드래그 종료 시에만 백엔드 업데이트
        if ('dragging' in change && change.dragging === false) {
          const node = currentSection.nodes.find(n => n.id === change.id);
          if (node) {
            const updatedSection = {
              ...currentSection,
              nodes: currentSection.nodes.map(n => 
                n.id === change.id ? { ...n, position: change.position! } : n
              )
            };
            updateSectionInBackend(updatedSection);
          }
        }
      }
    });
    
    // React Flow 상태 업데이트
    setNodes(nds => applyNodeChanges(changes, nds));
  }, [getCurrentSection, saveNodePosition, updateSectionInBackend]);

  // Edge 변경 핸들러
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => applyEdgeChanges(changes, eds));
  }, []);

  // 섹션 변경 시 React Flow 업데이트 - 위치 복원 개선
  useEffect(() => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    console.log('Updating React Flow for section:', currentSection.name);
    
    // 저장된 위치가 있으면 사용, 없으면 원래 위치 사용
    const savedPositions = nodePositionsRef.current[currentSection.id] || {};
    
    // 노드 변환
    const flowNodes: FlowNode[] = currentSection.nodes.map(node => ({
      id: node.id,
      type: node.type,
      position: savedPositions[node.id] || { ...node.position },
      data: {
        ...node,
        onEdit: () => setEditingNode(node),
        onDeactivate: () => handleNodeDeactivate(node.id),
        onToggleRun: () => handleNodeRun(node.id),
        onDelete: handleNodeDelete,
        onUpdate: handleNodeUpdate,
        progress: nodeProgress[node.id],
        isExecuting: runningNodes.has(node.id),
        isCompleted: completedNodes.has(node.id),
      },
      selected: selectedNodeId === node.id,
      style: {
        opacity: node.isDeactivated ? 0.5 : 1,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }));
    
    // 엣지 변환
    const flowEdges: Edge[] = [];
    currentSection.nodes.forEach(node => {
      if (node.connectedFrom) {
        node.connectedFrom.forEach(fromId => {
          const edgeId = `${fromId}-${node.id}`;
          flowEdges.push({
            id: edgeId,
            source: fromId,
            target: node.id,
            type: 'custom',
            animated: activeEdges.has(edgeId),
            data: { 
              onDelete: handleEdgeDelete,
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
    
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [selectedSection, sections, selectedNodeId, nodeProgress, runningNodes, completedNodes, activeEdges, 
      getCurrentSection, handleNodeDelete, handleNodeUpdate, handleNodeDeactivate, handleNodeRun, 
      handleEdgeDelete]);

  // 연결 생성
  const onConnect = useCallback((params: FlowConnection) => {
    const currentSection = getCurrentSection();
    if (!currentSection || params.source === params.target) return;
    
    // 이미 존재하는 연결인지 확인
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
    setEdges(eds => addEdge({
      ...params,
      id: edgeId,
      type: 'custom',
      animated: false,
      data: { 
        onDelete: handleEdgeDelete
      },
      style: {
        stroke: '#94a3b8',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#94a3b8',
      },
    }, eds));
    
    // 섹션 데이터 업데이트
    const updatedSection = {
      ...currentSection,
      nodes: currentSection.nodes.map(n => {
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
  }, [getCurrentSection, edges, updateSectionInBackend, addLog, handleEdgeDelete]);

  // WebSocket handlers
  const wsHandlers = React.useMemo(() => ({
    onProgress: (nodeId: string, progress: number) => {
      setNodeProgress(prev => ({ ...prev, [nodeId]: progress }));
      
      const section = sections.find(s => s.name === selectedSection);
      const node = section?.nodes.find(n => n.id === nodeId);
      if (node) {
        if (progress === 0) {
          addLog({
            nodeId,
            nodeLabel: node.label || node.type,
            type: 'start',
            message: `Starting execution...`
          });
        } else if (progress > 0 && progress < 1) {
          addLog({
            nodeId,
            nodeLabel: node.label || node.type,
            type: 'processing',
            message: `Processing... ${Math.round(progress * 100)}%`
          });
        } else if (progress >= 1) {
          addLog({
            nodeId,
            nodeLabel: node.label || node.type,
            type: 'complete',
            message: `Execution completed`
          });
          
          setCompletedNodes(prev => new Set([...prev, nodeId]));
          
          // 다음 노드들의 엣지 애니메이션
          const nextNodes = section?.nodes.filter(n => 
            n.connectedFrom?.includes(nodeId)
          );
          
          if (nextNodes && nextNodes.length > 0) {
            nextNodes.forEach(nextNode => {
              setActiveEdges(prev => new Set([...prev, `${nodeId}-${nextNode.id}`]));
              
              setTimeout(() => {
                setActiveEdges(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(`${nodeId}-${nextNode.id}`);
                  return newSet;
                });
              }, 500);
            });
          }
        } else if (progress < 0) {
          addLog({
            nodeId,
            nodeLabel: node.label || node.type,
            type: 'error',
            message: `Execution failed`
          });
        }
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
      const section = sections.find(s => s.name === selectedSection);
      const node = section?.nodes.find(n => n.id === nodeId);
      if (node) {
        handleNodeUpdate({ ...node, output });
        
        if (output) {
          addLog({
            nodeId,
            nodeLabel: node.label || node.type,
            type: 'file_created',
            message: `Output generated: ${getOutputPreview(output)}`
          });
        }
      }
    },
    onNodeExecutionStart: (nodeId: string) => {
      setRunningNodes(prev => new Set([...prev, nodeId]));
    },
    onNodeExecutionComplete: (nodeId: string) => {
      setRunningNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
      setCompletedNodes(prev => new Set([...prev, nodeId]));
    },
    onNodeExecutionError: (nodeId: string, error: string) => {
      setRunningNodes(prev => {
        const newSet = new Set(prev);
        newSet.delete(nodeId);
        return newSet;
      });
    }
  }), [sections, selectedSection, addLog, handleNodeUpdate, getOutputPreview]);

  // WebSocket 연결
  useWebSocket(wsHandlers);

  // 노드 추가
  const handleNodeAdd = async (nodeType: string) => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;

    const position = project({ 
      x: window.innerWidth / 2, 
      y: window.innerHeight / 2 
    });

    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType as Node['type'],
      label: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
      position,
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
    await updateSectionInBackend(updatedSection);
    
    // 새 노드의 위치 저장
    saveNodePosition(currentSection.id, newNode.id, position);
    
    addLog({
      nodeId: 'system',
      nodeLabel: 'System',
      type: 'info',
      message: `Added ${nodeType} node`
    });
  };

  // Flow 실행
  const playFlow = async () => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    // 상태 초기화
    setExecutionLogs([]);
    setShowLogs(true);
    setCompletedNodes(new Set());
    setActiveEdges(new Set());
    
    // Input 노드 찾기
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
      const response = await axios.post(`${API_URL}/execute-flow`, {
        sectionId: currentSection.id,
        startNodeId: inputNode.id
      });
      
      if (response.data) {
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
        message: `Failed to start flow execution: ${error.response?.data?.detail || error.message}`
      });
    }
  };
  
  // 로그창 토글
  const toggleLogs = () => {
    setShowLogs(!showLogs);
  };
  
  // 로그 지우기
  const clearLogs = () => {
    setExecutionLogs([]);
  };
  
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
                onClick={() => {
                  // 실행 상태 초기화
                  setCompletedNodes(new Set());
                  setActiveEdges(new Set());
                  setNodeProgress({});
                  setRunningNodes(new Set());
                  
                  setSelectedGroup(group as keyof typeof GROUPS);
                  const firstSection = sections.find(s => s.group === group);
                  if (firstSection) {
                    setSelectedSection(firstSection.name);
                  }
                }}
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
          
          <div className="ml-auto mr-4">
            <button
              onClick={fetchSections}
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
                onClick={() => {
                  // 실행 상태 초기화
                  setCompletedNodes(new Set());
                  setActiveEdges(new Set());
                  setNodeProgress({});
                  setRunningNodes(new Set());
                  
                  setSelectedSection(section.name);
                }}
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
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading sections...</div>
          </div>
        ) : sections.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">
              No sections loaded. Make sure backend is running on http://localhost:8000
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={{ x: 100, y: 100, zoom: 0.75 }}
            zoomOnDoubleClick={false}
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
      {editingNode && (
        <>
          {editingNode.type === 'worker' && (
            <WorkerEditModal
              node={editingNode}
              section={getCurrentSection()!}
              allSections={sections}
              onClose={() => setEditingNode(null)}
              onSave={(node) => {
                handleNodeUpdate(node);
                setEditingNode(null);
              }}
            />
          )}
          
          {(editingNode.type === 'supervisor' || editingNode.type === 'planner') && (
            <SupervisorEditModal
              node={editingNode}
              section={getCurrentSection()!}
              allSections={sections}
              onClose={() => setEditingNode(null)}
              onSave={(node) => {
                handleNodeUpdate(node);
                setEditingNode(null);
              }}
            />
          )}
          
          {(editingNode.type === 'input' || editingNode.type === 'output') && (
            <IOConfigModal
              node={editingNode}
              section={getCurrentSection()!}
              allSections={sections}
              onClose={() => setEditingNode(null)}
              onSave={(node) => {
                handleNodeUpdate(node);
                setEditingNode(null);
              }}
            />
          )}
        </>
      )}

      {showSettings && getCurrentSection() && (
        <SectionSettingsModal
          section={getCurrentSection()!}
          allSections={sections}
          onClose={() => setShowSettings(false)}
          onSave={async (section) => {
            await updateSectionInBackend(section);
            setSections(prev => prev.map(s => s.id === section.id ? section : s));
            setShowSettings(false);
          }}
        />
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
              onClick={clearLogs}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Clear
            </button>
            <button
              onClick={toggleLogs}
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
          onClick={toggleLogs}
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