// frontend/src/App.tsx - wire 연결 시 노드 이동 버그 및 edge 삭제 버그 수정
import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  Node as FlowNode,
  Edge,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection as FlowConnection,
  NodeTypes,
  EdgeTypes,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Play, Settings, ChevronUp, ChevronDown, FileText, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';

import { Node, Section, TaskItem } from './types';
import { GROUPS, NODE_TYPES } from './constants';
import { apiClient } from './api/client';
import { useWebSocket } from './hooks/useWebSocket';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { CustomNode } from './components/flow/CustomNode';
import { CustomEdge } from './components/flow/CustomEdge';
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
  data?: any;
}

// Custom node/edge types
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
  // State
  const [selectedGroup, setSelectedGroup] = useState<keyof typeof GROUPS>('preproduction');
  const [selectedSection, setSelectedSection] = useState<string>('Script');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  
  // React Flow states
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [nodeProgress, setNodeProgress] = useState<{ [key: string]: number }>({});
  const [runningNodes, setRunningNodes] = useState<Set<string>>(new Set());
  
  // 실행 로그 상태
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logsHeight, setLogsHeight] = useState(150);
  
  // 백엔드 업데이트 디바운스를 위한 ref
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPositionUpdates = useRef<Map<string, { x: number; y: number }>>(new Map());
  
  const { project } = useReactFlow();

  // 현재 섹션 가져오기
  const getCurrentSection = useCallback(() => 
    sections.find(s => s.name === selectedSection), [sections, selectedSection]);

  // 로그 추가
  const addLog = useCallback((log: Omit<ExecutionLog, 'id' | 'timestamp'>) => {
    setExecutionLogs(prev => [...prev, {
      ...log,
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString()
    }]);
  }, []);

  // 로그 아이콘
  const getLogIcon = (type: ExecutionLog['type']) => {
    const icons = {
      'start': <Clock className="w-4 h-4 text-blue-500" />,
      'processing': <Clock className="w-4 h-4 text-yellow-500 animate-spin" />,
      'complete': <CheckCircle className="w-4 h-4 text-green-500" />,
      'error': <AlertCircle className="w-4 h-4 text-red-500" />,
      'file_created': <FileText className="w-4 h-4 text-purple-500" />,
      'info': <Clock className="w-4 h-4 text-gray-500" />
    };
    return icons[type] || icons.info;
  };

  // 백엔드에서 섹션 데이터 가져오기
  const fetchSections = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getSections();
      setSections(response.data);
      
      console.log('Fetched sections:', response.data);
      
      if (response.data.length > 0 && !getCurrentSection()) {
        const firstSection = response.data[0];
        setSelectedGroup(firstSection.group);
        setSelectedSection(firstSection.name);
      }
    } catch (error) {
      console.error('Failed to fetch sections:', error);
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'error',
        message: 'Failed to load sections from server. Please check if backend is running.'
      });
    } finally {
      setIsLoading(false);
    }
  }, [getCurrentSection, addLog]);

  // 초기 로드
  useEffect(() => {
    fetchSections();
  }, []);

  // 백엔드에 섹션 업데이트 저장
  const updateSectionInBackend = useCallback(async (section: Section) => {
    try {
      await apiClient.updateSection(section.id, section);
      console.log('Section updated in backend:', section.id);
    } catch (error) {
      console.error('Failed to update section:', error);
      throw error;
    }
  }, []);

  // 디바운스된 위치 업데이트
  const debouncedPositionUpdate = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    updateTimeoutRef.current = setTimeout(async () => {
      const currentSection = getCurrentSection();
      if (!currentSection || pendingPositionUpdates.current.size === 0) return;
      
      const updatedSection = {
        ...currentSection,
        nodes: currentSection.nodes.map(n => {
          const pendingPosition = pendingPositionUpdates.current.get(n.id);
          if (pendingPosition) {
            return { ...n, position: pendingPosition };
          }
          return n;
        })
      };
      
      try {
        await updateSectionInBackend(updatedSection);
        pendingPositionUpdates.current.clear();
      } catch (error) {
        console.error('Failed to update node positions:', error);
      }
    }, 500); // 500ms 디바운스
  }, [getCurrentSection, updateSectionInBackend]);

  // Convert internal nodes to React Flow nodes
  const convertToFlowNodes = useCallback((sectionNodes: Node[]): FlowNode[] => {
    return sectionNodes.map(node => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        ...node,
        onEdit: () => setEditingNode(node),
        onDeactivate: () => handleNodeDeactivate(node.id),
        onToggleRun: () => handleNodeRun(node.id),
        onDelete: (nodeId: string) => handleNodeDelete(nodeId),
        onUpdate: (updatedNode: Node) => {
          setSections(prev => prev.map(section => ({
            ...section,
            nodes: section.nodes.map(n => n.id === updatedNode.id ? updatedNode : n)
          })));
        },
        progress: nodeProgress[node.id],
        isExecuting: runningNodes.has(node.id),
      },
      selected: selectedNodeId === node.id,
      style: {
        opacity: node.isDeactivated ? 0.5 : 1,
      }
    }));
  }, [selectedNodeId, nodeProgress, runningNodes]);

  // Convert connections to React Flow edges
  const convertToFlowEdges = useCallback((sectionNodes: Node[]): Edge[] => {
    const flowEdges: Edge[] = [];
    sectionNodes.forEach(node => {
      if (node.connectedFrom) {
        node.connectedFrom.forEach(fromId => {
          const isActive = runningNodes.has(fromId) && runningNodes.has(node.id);
          const isComplete = nodeProgress[fromId] === 1;
          
          flowEdges.push({
            id: `${fromId}-${node.id}`,
            source: fromId,
            target: node.id,
            type: 'custom',
            animated: isActive || isComplete,
            data: { 
              onDelete: () => handleEdgeDelete(`${fromId}-${node.id}`) // 직접 호출하도록 수정
            },
            style: {
              stroke: isComplete ? '#10b981' : isActive ? '#3b82f6' : '#94a3b8',
              strokeWidth: isActive || isComplete ? 3 : 2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isComplete ? '#10b981' : isActive ? '#3b82f6' : '#94a3b8',
            },
          });
        });
      }
    });
    return flowEdges;
  }, [nodeProgress, runningNodes]);

  // 섹션 변경 시 React Flow 업데이트
  useEffect(() => {
    const currentSection = sections.find(s => s.name === selectedSection);
    console.log(`Section "${selectedSection}" nodes:`, currentSection?.nodes);
    
    if (currentSection) {
      const flowNodes = convertToFlowNodes(currentSection.nodes);
      const flowEdges = convertToFlowEdges(currentSection.nodes);
      
      setNodes(flowNodes);
      setEdges(flowEdges);
    }
  }, [selectedSection, sections, convertToFlowNodes, convertToFlowEdges]);

  // 노드 비활성화
  const handleNodeDeactivate = useCallback(async (nodeId: string) => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;

    try {
      await apiClient.deactivateNode(nodeId, currentSection.id);
      await fetchSections();
    } catch (error) {
      console.error('Failed to toggle deactivation:', error);
    }
  }, [getCurrentSection, fetchSections]);

  // 노드 실행/중지
  const handleNodeRun = useCallback(async (nodeId: string) => {
    const currentSection = getCurrentSection();
    const node = currentSection?.nodes.find(n => n.id === nodeId);
    if (!node || !currentSection) return;

    if (node.isRunning) {
      try {
        await apiClient.stopNode(nodeId);
        setSections(prev => prev.map(section => ({
          ...section,
          nodes: section.nodes.map(n => 
            n.id === nodeId ? { ...n, isRunning: false } : n
          )
        })));
        setRunningNodes(prev => {
          const newSet = new Set(prev);
          newSet.delete(nodeId);
          return newSet;
        });
      } catch (error) {
        console.error('Failed to stop node:', error);
      }
    } else {
      setSections(prev => prev.map(section => ({
        ...section,
        nodes: section.nodes.map(n => 
          n.id === nodeId ? { ...n, isRunning: true, error: undefined } : n
        )
      })));
      
      try {
        const connectedOutputs: any = {};
        if (node.connectedFrom) {
          for (const connId of node.connectedFrom) {
            const connNode = currentSection.nodes.find(n => n.id === connId);
            if (connNode?.output) {
              connectedOutputs[connNode.label] = connNode.output;
            }
          }
        }

        await apiClient.executeNode(nodeId, currentSection.id, node.code || '', connectedOutputs);
      } catch (error) {
        console.error('Node execution failed:', error);
        setSections(prev => prev.map(section => ({
          ...section,
          nodes: section.nodes.map(n => 
            n.id === nodeId ? { ...n, isRunning: false, error: 'Execution failed' } : n
          )
        })));
      }
    }
  }, [getCurrentSection]);

  // 노드 삭제 - 백엔드 저장 포함
  const handleNodeDelete = useCallback(async (nodeId: string) => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    // UI 즉시 업데이트
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    
    // 섹션 업데이트 및 백엔드 저장
    const updatedSection = {
      ...currentSection,
      nodes: currentSection.nodes.filter(n => n.id !== nodeId).map(n => {
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
    
    try {
      await updateSectionInBackend(updatedSection);
      setSections(prev => prev.map(section => 
        section.id === currentSection.id ? updatedSection : section
      ));
    } catch (error) {
      console.error('Failed to delete node:', error);
      await fetchSections();
    }
  }, [getCurrentSection, setNodes, setEdges, updateSectionInBackend, fetchSections]);

  // 엣지 삭제 - 수정된 버전
  const handleEdgeDelete = useCallback(async (edgeId: string) => {
    console.log('Deleting edge:', edgeId);
    
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) {
      console.log('Edge not found:', edgeId);
      return;
    }
    
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    // UI 즉시 업데이트
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    
    // 섹션 업데이트
    const updatedSection = {
      ...currentSection,
      nodes: currentSection.nodes.map(n => {
        if (n.id === edge.source && n.connectedTo) {
          return { ...n, connectedTo: n.connectedTo.filter(id => id !== edge.target) };
        }
        if (n.id === edge.target && n.connectedFrom) {
          return { ...n, connectedFrom: n.connectedFrom.filter(id => id !== edge.source) };
        }
        return n;
      })
    };
    
    // 백엔드 저장
    try {
      await updateSectionInBackend(updatedSection);
      setSections(prev => prev.map(section => 
        section.id === currentSection.id ? updatedSection : section
      ));
      console.log('Edge deleted successfully');
    } catch (error) {
      console.error('Failed to delete edge:', error);
      // 실패 시 다시 로드
      await fetchSections();
    }
  }, [edges, getCurrentSection, setEdges, updateSectionInBackend, fetchSections]);

  // 노드 위치 변경 - 디바운스 적용
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes);
    
    changes.forEach((change: any) => {
      if (change.type === 'position' && change.position) {
        // 로컬 상태만 즉시 업데이트
        setSections(prev => prev.map(section => ({
          ...section,
          nodes: section.nodes.map(n => 
            n.id === change.id ? { ...n, position: change.position } : n
          )
        })));
        
        // 드래그가 끝났을 때만 백엔드 업데이트
        if (!change.dragging) {
          pendingPositionUpdates.current.set(change.id, change.position);
          debouncedPositionUpdate();
        }
      }
    });
  }, [onNodesChange, debouncedPositionUpdate]);

  // 연결 생성 - 노드 위치 변경 방지
  const onConnect = useCallback(async (params: FlowConnection) => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    // 현재 노드 위치 저장
    const currentPositions = new Map(
      currentSection.nodes.map(n => [n.id, { ...n.position }])
    );
    
    // 엣지만 추가
    setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false }, eds));
    
    // 섹션 업데이트 (연결 정보만 변경, 위치는 유지)
    const updatedSection = {
      ...currentSection,
      nodes: currentSection.nodes.map(n => {
        const updatedNode = { ...n };
        
        // 위치는 기존 값 유지
        updatedNode.position = currentPositions.get(n.id) || n.position;
        
        // 연결 정보만 업데이트
        if (n.id === params.source) {
          updatedNode.connectedTo = [...(n.connectedTo || []), params.target!];
        }
        if (n.id === params.target) {
          updatedNode.connectedFrom = [...(n.connectedFrom || []), params.source!];
        }
        
        return updatedNode;
      })
    };
    
    try {
      await updateSectionInBackend(updatedSection);
      setSections(prev => prev.map(section => 
        section.id === currentSection.id ? updatedSection : section
      ));
    } catch (error) {
      console.error('Failed to update connections:', error);
    }
  }, [getCurrentSection, setEdges, updateSectionInBackend]);

  // WebSocket handlers
  const { isConnected } = useWebSocket({
    onProgress: (nodeId, progress, message) => {
      setNodeProgress(prev => ({ ...prev, [nodeId]: progress }));
      
      const currentSection = getCurrentSection();
      const node = currentSection?.nodes.find(n => n.id === nodeId);
      
      if (node) {
        if (progress === 0.1) {
          setRunningNodes(prev => new Set([...prev, nodeId]));
          addLog({
            nodeId,
            nodeLabel: node.label,
            type: 'start',
            message: `Starting ${node.label} execution...`
          });
        } else if (progress === 1) {
          addLog({
            nodeId,
            nodeLabel: node.label,
            type: 'complete',
            message: `✓ ${node.label} completed successfully`
          });
        } else if (progress < 0) {
          addLog({
            nodeId,
            nodeLabel: node.label,
            type: 'error',
            message: `✗ ${node.label} execution failed: ${message || 'Unknown error'}`
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
    onNodeOutputUpdated: (nodeId, output) => {
      setSections(prev => prev.map(section => ({
        ...section,
        nodes: section.nodes.map(n => 
          n.id === nodeId ? { ...n, output, error: undefined } : n
        )
      })));
    },
    onNodeSupervised: (data) => {
      setSections(prev => prev.map(section => ({
        ...section,
        nodes: section.nodes.map(n => 
          n.id === data.targetId ? { ...n, aiScore: data.score } : n
        )
      })));
    }
  });

  // 노드 추가
  const handleNodeAdd = useCallback(async (nodeType: string) => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;

    if ((nodeType === 'supervisor' || nodeType === 'planner') && 
        currentSection.nodes.some(n => n.type === nodeType)) {
      alert(`Only one ${nodeType} node allowed per section`);
      return;
    }

    const centerX = window.innerWidth / 2;
    const centerY = (window.innerHeight - 200) / 2;
    const position = project({ x: centerX, y: centerY });

    const newNode: Node = {
      id: `${nodeType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: nodeType as Node['type'],
      label: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
      position: { 
        x: position.x + (Math.random() - 0.5) * 100,
        y: position.y + (Math.random() - 0.5) * 100
      },
      isRunning: false,
      tasks: nodeType === 'worker' ? [
        { id: `task-${Date.now()}-1`, text: '', status: 'pending' }
      ] : undefined
    };

    const updatedSection = {
      ...currentSection,
      nodes: [...currentSection.nodes, newNode]
    };

    try {
      await updateSectionInBackend(updatedSection);
      setSections(prev => prev.map(section => 
        section.id === currentSection.id ? updatedSection : section
      ));
    } catch (error) {
      console.error('Failed to add node:', error);
      alert('Failed to add node. Please try again.');
    }
  }, [getCurrentSection, project, updateSectionInBackend]);

  // Flow 실행
  const playFlow = useCallback(async () => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    setIsExecuting(true);
    setExecutionLogs([]);
    setShowLogs(true);
    
    addLog({
      nodeId: 'system',
      nodeLabel: 'System',
      type: 'info',
      message: `🚀 Starting flow execution for "${currentSection.name}" section...`
    });
    
    try {
      const response = await apiClient.executeFlow(currentSection.id);
      
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'complete',
        message: `✅ Flow execution completed! Processed ${response.data.results.length} nodes.`
      });
    } catch (error) {
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'error',
        message: `❌ Flow execution failed: ${error}`
      });
    } finally {
      setIsExecuting(false);
    }
  }, [getCurrentSection, addLog]);

  // 노드 클릭
  const handleNodeClick = useCallback((event: React.MouseEvent, node: FlowNode) => {
    setSelectedNodeId(node.id);
  }, []);

  // 로그 패널 리사이즈
  const handleLogResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = logsHeight;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startY - e.clientY;
      setLogsHeight(Math.max(100, Math.min(500, startHeight + deltaY)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [logsHeight]);

  // 모달 저장 핸들러
  const handleModalSave = useCallback(async (node: Node) => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    const updatedSection = {
      ...currentSection,
      nodes: currentSection.nodes.map(n => n.id === node.id ? node : n)
    };
    
    try {
      await updateSectionInBackend(updatedSection);
      setSections(prev => prev.map(section => 
        section.id === currentSection.id ? updatedSection : section
      ));
    } catch (error) {
      console.error('Failed to save node:', error);
    }
    
    setEditingNode(null);
  }, [getCurrentSection, updateSectionInBackend]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    selectedNodeId,
    getCurrentSection,
    onNodeEdit: setEditingNode,
    onNodeDelete: handleNodeDelete,
    onNodeDeactivate: handleNodeDeactivate
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

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
                  setSelectedGroup(group as keyof typeof GROUPS);
                  const firstSectionInGroup = sections.find(s => s.group === group);
                  if (firstSectionInGroup) {
                    setSelectedSection(firstSectionInGroup.name);
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
          
          {/* WebSocket 연결 상태 */}
          <div className="ml-auto mr-4 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600">{isConnected ? 'Connected' : 'Disconnected'}</span>
            <button
              onClick={fetchSections}
              className="ml-2 p-2 rounded hover:bg-gray-100"
              title="Refresh sections from server"
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
                onClick={() => setSelectedSection(section.name)}
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
              disabled={isExecuting || isLoading}
              className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${
                isExecuting || isLoading
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              <Play className="w-4 h-4" />
              {isExecuting ? 'Executing...' : 'Play Flow'}
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
      <div className="flex-1 relative" style={{ height: showLogs ? `calc(100% - ${logsHeight}px)` : '100%' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading sections...</div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            attributionPosition="bottom-right"
            defaultViewport={{ x: 100, y: 100, zoom: 0.75 }}
            minZoom={0.1}
            maxZoom={4}
          >
            <Background variant={BackgroundVariant.Lines} gap={50} size={1} color="#e5e5e5" />
            <Controls />
            <MiniMap 
              nodeColor={(node) => {
                const isRunning = runningNodes.has(node.id);
                if (isRunning) return '#3b82f6';
                
                switch (node.type) {
                  case 'supervisor': return '#a855f7';
                  case 'planner': return '#10b981';
                  case 'input': return '#3b82f6';
                  case 'output': return '#f97316';
                  default: return '#6b7280';
                }
              }}
            />
            
            {/* Add Node Panel */}
            <Panel position="bottom-center" className="bg-white rounded-lg shadow-lg p-4">
              <div className="flex gap-4">
                {NODE_TYPES
                  .filter(nodeType => nodeType.type !== 'input' && nodeType.type !== 'output')
                  .map(nodeType => {
                  const currentSection = getCurrentSection();
                  const isDisabled = (nodeType.type === 'supervisor' || nodeType.type === 'planner') &&
                    currentSection?.nodes.some(n => n.type === nodeType.type);
                  
                  return (
                    <button
                      key={nodeType.type}
                      onClick={() => handleNodeAdd(nodeType.type)}
                      disabled={isDisabled}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                        isDisabled 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-gray-100 hover:bg-gray-200 hover:shadow-md'
                      }`}
                      title={isDisabled ? `Only one ${nodeType.type} allowed per section` : `Add ${nodeType.label}`}
                    >
                      <span className="text-xl">{nodeType.icon}</span>
                      <span>{nodeType.label}</span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          </ReactFlow>
        )}
      </div>

      {/* Execution Logs Panel */}
      <div 
        className={`bg-white border-t transition-all duration-300 ${showLogs ? '' : 'hidden'}`}
        style={{ height: `${logsHeight}px` }}
      >
        <div
          className="h-1 bg-gray-200 hover:bg-gray-300 cursor-ns-resize"
          onMouseDown={handleLogResize}
        />
        
        <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
          <h3 className="font-semibold text-sm">Execution Logs</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExecutionLogs([])}
              className="text-xs text-gray-600 hover:text-gray-800"
            >
              Clear
            </button>
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="text-gray-600 hover:text-gray-800"
            >
              {showLogs ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: logsHeight - 40 }}>
          {executionLogs.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">
              No execution logs yet. Click "Play Flow" to start.
            </div>
          ) : (
            <div className="space-y-1">
              {executionLogs.map(log => (
                <div key={log.id} className="flex items-start gap-2 text-sm hover:bg-gray-50 px-2 py-1 rounded">
                  <div className="mt-0.5">{getLogIcon(log.type)}</div>
                  <div className="text-gray-600 text-xs whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-gray-800">[{log.nodeLabel}]</span>
                    <span className="text-gray-700 ml-1">{log.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {editingNode && editingNode.type === 'worker' && (
        <WorkerEditModal
          node={editingNode}
          section={getCurrentSection()!}
          allSections={sections}
          onClose={() => setEditingNode(null)}
          onSave={handleModalSave}
        />
      )}

      {editingNode && (editingNode.type === 'supervisor' || editingNode.type === 'planner') && (
        <SupervisorEditModal
          node={editingNode}
          section={getCurrentSection()!}
          allSections={sections}
          onClose={() => setEditingNode(null)}
          onSave={handleModalSave}
        />
      )}

      {editingNode && (editingNode.type === 'input' || editingNode.type === 'output') && (
        <IOConfigModal
          node={editingNode}
          section={getCurrentSection()!}
          allSections={sections}
          onClose={() => setEditingNode(null)}
          onSave={handleModalSave}
        />
      )}

      {showSettings && getCurrentSection() && (
        <SectionSettingsModal
          section={getCurrentSection()!}
          allSections={sections}
          onClose={() => setShowSettings(false)}
          onSave={async (section) => {
            try {
              await updateSectionInBackend(section);
              setSections(prev => prev.map(s => s.id === section.id ? section : s));
            } catch (error) {
              console.error('Failed to save section settings:', error);
            }
            setShowSettings(false);
          }}
        />
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