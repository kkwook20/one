// frontend/src/App.tsx - 완전한 실행 로그 및 시각화 버전
import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
import { Play, Settings, ChevronUp, ChevronDown, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';

import { Node, Section, Connection, Position, TaskItem } from './types';
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

// Custom node types for React Flow
const nodeTypes: NodeTypes = {
  worker: CustomNode,
  supervisor: CustomNode,
  planner: CustomNode,
  input: CustomNode,
  output: CustomNode,
};

// Custom edge types
const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

function AIPipelineFlow() {
  const [selectedGroup, setSelectedGroup] = useState<keyof typeof GROUPS>('preproduction');
  const [selectedSection, setSelectedSection] = useState<string>('Script');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // React Flow states
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [nodeProgress, setNodeProgress] = useState<{ [key: string]: number }>({});
  const [runningNodes, setRunningNodes] = useState<Set<string>>(new Set());
  
  // 실행 로그 상태
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [logsHeight, setLogsHeight] = useState(200);
  
  const { fitView, zoomTo } = useReactFlow();

  // 로그 추가 함수
  const addLog = useCallback((log: Omit<ExecutionLog, 'id' | 'timestamp'>) => {
    setExecutionLogs(prev => [...prev, {
      ...log,
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString()
    }]);
  }, []);

  // 로그 아이콘 가져오기
  const getLogIcon = (type: ExecutionLog['type']) => {
    switch (type) {
      case 'start': return <Clock className="w-4 h-4 text-blue-500" />;
      case 'processing': return <Clock className="w-4 h-4 text-yellow-500 animate-spin" />;
      case 'complete': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'file_created': return <FileText className="w-4 h-4 text-purple-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  // getCurrentSection을 먼저 정의
  const getCurrentSection = useCallback(() => sections.find(s => s.name === selectedSection), [sections, selectedSection]);

  // handleNodeDeactivate 정의 (getCurrentSection 사용)
  const handleNodeDeactivate = useCallback(async (nodeId: string) => {
    const currentSection = getCurrentSection();
    const node = currentSection?.nodes.find(n => n.id === nodeId);
    if (!node || !currentSection) return;

    try {
      await apiClient.deactivateNode(nodeId, currentSection.id);
      setSections(prev => prev.map(section => ({
        ...section,
        nodes: section.nodes.map(n => 
          n.id === nodeId ? { ...n, isDeactivated: !n.isDeactivated } : n
        )
      })));
    } catch (error) {
      console.error('Failed to toggle deactivation:', error);
    }
  }, [getCurrentSection]);

  // handleNodeRun 정의 (getCurrentSection 사용)
  const handleNodeRun = useCallback(async (nodeId: string) => {
    const currentSection = getCurrentSection();
    const node = currentSection?.nodes.find(n => n.id === nodeId);
    if (!node || !currentSection) return;

    if (node.isRunning) {
      // Stop node
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
      // Run node
      setSections(prev => prev.map(section => ({
        ...section,
        nodes: section.nodes.map(n => 
          n.id === nodeId ? { ...n, isRunning: true, error: undefined } : n
        )
      })));
      
      try {
        // Get connected outputs
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

  // Handle node deletion
  const handleNodeDelete = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    
    setSections(prev => prev.map(section => {
      if (section.name === selectedSection) {
        return {
          ...section,
          nodes: section.nodes.filter(n => n.id !== nodeId)
        };
      }
      return section;
    }));
  }, [selectedSection, setNodes, setEdges]);

  // Handle edge deletion
  const handleEdgeDelete = useCallback((edgeId: string) => {
    // Find the edge to get source and target
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;
    
    const sourceId = edge.source;
    const targetId = edge.target;
    
    // Remove edge from React Flow
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    
    // Update sections state
    setSections(prev => prev.map(section => {
      if (section.name === selectedSection) {
        return {
          ...section,
          nodes: section.nodes.map(n => {
            if (n.id === sourceId && n.connectedTo) {
              return {
                ...n,
                connectedTo: n.connectedTo.filter(id => id !== targetId)
              };
            }
            if (n.id === targetId && n.connectedFrom) {
              return {
                ...n,
                connectedFrom: n.connectedFrom.filter(id => id !== sourceId)
              };
            }
            return n;
          })
        };
      }
      return section;
    }));
  }, [selectedSection, setEdges, edges]);

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
  }, [selectedNodeId, nodeProgress, runningNodes, handleNodeDeactivate, handleNodeRun, handleNodeDelete]);

  // Convert connections to React Flow edges
  const convertToFlowEdges = useCallback((sectionNodes: Node[]): Edge[] => {
    const flowEdges: Edge[] = [];
    sectionNodes.forEach(node => {
      if (node.connectedFrom) {
        node.connectedFrom.forEach(fromId => {
          const fromNode = sectionNodes.find(n => n.id === fromId);
          const isActive = runningNodes.has(fromId) && runningNodes.has(node.id);
          const isComplete = nodeProgress[fromId] === 1;
          
          flowEdges.push({
            id: `${fromId}-${node.id}`,
            source: fromId,
            target: node.id,
            type: 'custom',
            animated: isActive || isComplete,
            data: {
              onDelete: handleEdgeDelete
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
  }, [nodeProgress, runningNodes, handleEdgeDelete]);

  // Update React Flow when section changes
  useEffect(() => {
    const currentSection = sections.find(s => s.name === selectedSection);
    if (currentSection) {
      setNodes(convertToFlowNodes(currentSection.nodes));
      setEdges(convertToFlowEdges(currentSection.nodes));
    }
  }, [selectedSection, sections, convertToFlowNodes, convertToFlowEdges]);

  // Initialize sections
  useEffect(() => {
    const initSections = Object.entries(GROUPS).flatMap(([group, sectionNames]) =>
      sectionNames.map(name => ({
        id: `${group}-${name}`.toLowerCase().replace(/\s+/g, '-'),
        name,
        group: group as keyof typeof GROUPS,
        nodes: [
          { 
            id: `input-${Date.now()}`, 
            type: 'input' as const, 
            label: 'Input', 
            position: { x: 50, y: 200 }, 
            isRunning: false 
          },
          { 
            id: `output-${Date.now() + 1}`, 
            type: 'output' as const, 
            label: 'Output', 
            position: { x: 700, y: 200 }, 
            isRunning: false 
          }
        ]
      }))
    );
    setSections(initSections);
  }, []);

  // Handle node position changes
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes);
    
    // Update section nodes with new positions
    changes.forEach((change: any) => {
      if (change.type === 'position' && change.position) {
        setSections(prev => prev.map(section => ({
          ...section,
          nodes: section.nodes.map(n => 
            n.id === change.id 
              ? { ...n, position: change.position }
              : n
          )
        })));
      }
    });
  }, [onNodesChange]);

  // Handle connections
  const onConnect = useCallback((params: FlowConnection) => {
    setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false }, eds));
    
    // Update section nodes
    setSections(prev => prev.map(section => {
      if (section.name === selectedSection) {
        return {
          ...section,
          nodes: section.nodes.map(n => {
            if (n.id === params.source) {
              return { ...n, connectedTo: [...(n.connectedTo || []), params.target!] };
            }
            if (n.id === params.target) {
              return { ...n, connectedFrom: [...(n.connectedFrom || []), params.source!] };
            }
            return n;
          })
        };
      }
      return section;
    }));
  }, [selectedSection, setEdges]);

  // WebSocket handlers
  const { isConnected } = useWebSocket({
    onProgress: (nodeId, progress, message) => {
      setNodeProgress(prev => ({ ...prev, [nodeId]: progress }));
      
      const currentSection = getCurrentSection();
      const node = currentSection?.nodes.find(n => n.id === nodeId);
      
      if (node) {
        if (progress === 0.1) {
          setRunningNodes(prev => new Set([...prev, nodeId]));
          setSections(prev => prev.map(section => ({
            ...section,
            nodes: section.nodes.map(n => 
              n.id === nodeId ? { ...n, isRunning: true, error: undefined } : n
            )
          })));
          addLog({
            nodeId,
            nodeLabel: node.label,
            type: 'start',
            message: `Starting ${node.label} execution...`
          });
        } else if (progress === 0.5) {
          addLog({
            nodeId,
            nodeLabel: node.label,
            type: 'processing',
            message: `Processing ${node.label}...`
          });
        } else if (progress === 0.9) {
          addLog({
            nodeId,
            nodeLabel: node.label,
            type: 'processing',
            message: `${node.label} processing complete, generating output...`
          });
        } else if (progress === 1) {
          setSections(prev => prev.map(section => ({
            ...section,
            nodes: section.nodes.map(n => 
              n.id === nodeId ? { ...n, isRunning: false } : n
            )
          })));
          addLog({
            nodeId,
            nodeLabel: node.label,
            type: 'complete',
            message: `✓ ${node.label} completed successfully`
          });
        } else if (progress < 0) {
          setSections(prev => prev.map(section => ({
            ...section,
            nodes: section.nodes.map(n => 
              n.id === nodeId ? { ...n, isRunning: false, error: message || 'Execution failed' } : n
            )
          })));
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
      
      const currentSection = getCurrentSection();
      const node = currentSection?.nodes.find(n => n.id === nodeId);
      
      if (node) {
        // 파일 생성 로그
        if (output && typeof output === 'object') {
          const files: string[] = [];
          const extractFiles = (obj: any, prefix = '') => {
            Object.entries(obj).forEach(([key, value]) => {
              if (typeof value === 'string' && (value.endsWith('.json') || value.endsWith('.xml') || value.endsWith('.yaml'))) {
                files.push(prefix + key);
              } else if (typeof value === 'object' && value !== null) {
                extractFiles(value, prefix + key + '.');
              }
            });
          };
          extractFiles(output);
          
          if (files.length > 0) {
            addLog({
              nodeId,
              nodeLabel: node.label,
              type: 'file_created',
              message: `Generated files: ${files.join(', ')}`,
              data: output
            });
          }
        }
      }
    },
    onNodeSupervised: (data) => {
      setSections(prev => prev.map(section => ({
        ...section,
        nodes: section.nodes.map(n => {
          if (n.id === data.targetId) {
            return { ...n, aiScore: data.score };
          }
          return n;
        })
      })));
    },
    onOutputNodeUpdated: (data) => {
      addLog({
        nodeId: data.nodeId,
        nodeLabel: 'Output',
        type: 'complete',
        message: `Output node updated with combined results from ${Object.keys(data.output || {}).length} nodes`,
        data: data.output
      });
    }
  });

  const handleNodeAdd = useCallback((nodeType: string) => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;

    if ((nodeType === 'supervisor' || nodeType === 'planner') && 
        currentSection.nodes.some(n => n.type === nodeType)) {
      alert(`Only one ${nodeType} node allowed per section`);
      return;
    }

    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType as Node['type'],
      label: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
      position: { x: 300, y: 300 },
      isRunning: false,
      tasks: nodeType === 'worker' ? [
        { id: `task-${Date.now()}-1`, text: '', status: 'pending' }
      ] : undefined
    };

    setSections(prev => prev.map(section => {
      if (section.name === selectedSection) {
        return { ...section, nodes: [...section.nodes, newNode] };
      }
      return section;
    }));
  }, [getCurrentSection, selectedSection]);

  const playFlow = useCallback(async () => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    setIsExecuting(true);
    setExecutionLogs([]); // 로그 초기화
    setRunningNodes(new Set());
    setNodeProgress({});
    
    addLog({
      nodeId: 'system',
      nodeLabel: 'System',
      type: 'info',
      message: `🚀 Starting flow execution for "${currentSection.name}" section...`
    });
    
    try {
      const response = await apiClient.executeFlow(currentSection.id);
      
      // 실행 완료
      setIsExecuting(false);
      
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'complete',
        message: `✅ Flow execution completed! Processed ${response.data.results.length} nodes.`,
        data: response.data
      });
      
      // 실행 요약
      const successCount = response.data.results.filter((r: any) => r.success).length;
      const failCount = response.data.results.filter((r: any) => !r.success).length;
      
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'info',
        message: `Summary: ${successCount} successful, ${failCount} failed`
      });
      
    } catch (error) {
      setIsExecuting(false);
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'error',
        message: `❌ Flow execution failed: ${error}`
      });
    }
  }, [getCurrentSection, addLog]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    selectedNodeId,
    getCurrentSection,
    onNodeEdit: setEditingNode,
    onNodeDelete: handleNodeDelete,
    onNodeDeactivate: handleNodeDeactivate
  });

  const handleNodeClick = useCallback((event: React.MouseEvent, node: FlowNode) => {
    setSelectedNodeId(node.id);
  }, []);

  // Fit view when section changes
  useEffect(() => {
    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 100);
  }, [selectedSection, fitView]);

  // 로그 패널 리사이즈
  const handleLogResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = logsHeight;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startY - e.clientY;
      const newHeight = Math.max(100, Math.min(500, startHeight + deltaY));
      setLogsHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [logsHeight]);

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
                  setSelectedSection(GROUPS[group as keyof typeof GROUPS][0]);
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
        </div>

        {/* Section Tabs */}
        <div className="flex gap-2 px-4 pb-2 items-center">
          {GROUPS[selectedGroup].map(section => (
            <button
              key={section}
              onClick={() => setSelectedSection(section)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                selectedSection === section
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {section}
            </button>
          ))}
          
          <div className="ml-auto flex gap-2">
            <button
              onClick={playFlow}
              disabled={isExecuting}
              className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${
                isExecuting 
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
              title="Play Flow - Execute all connected nodes left to right"
            >
              <Play className="w-4 h-4" />
              {isExecuting ? 'Executing...' : 'Play Flow'}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
              title="Section Settings"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1" style={{ height: showLogs ? `calc(100% - ${logsHeight}px)` : '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          attributionPosition="bottom-right"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
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
          
          {/* Custom Panel for adding nodes */}
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
      </div>

      {/* Execution Logs Panel */}
      <div 
        className={`bg-white border-t transition-all duration-300 ${showLogs ? '' : 'hidden'}`}
        style={{ height: `${logsHeight}px` }}
      >
        {/* Resize Handle */}
        <div
          className="h-1 bg-gray-200 hover:bg-gray-300 cursor-ns-resize"
          onMouseDown={handleLogResize}
        />
        
        {/* Log Header */}
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
        
        {/* Log Content */}
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
          onSave={(node) => {
            setSections(prev => prev.map(section => ({
              ...section,
              nodes: section.nodes.map(n => n.id === node.id ? node : n)
            })));
            setEditingNode(null);
          }}
        />
      )}

      {editingNode && (editingNode.type === 'supervisor' || editingNode.type === 'planner') && (
        <SupervisorEditModal
          node={editingNode}
          section={getCurrentSection()!}
          allSections={sections}
          onClose={() => setEditingNode(null)}
          onSave={(node) => {
            setSections(prev => prev.map(section => ({
              ...section,
              nodes: section.nodes.map(n => n.id === node.id ? node : n)
            })));
            setEditingNode(null);
          }}
        />
      )}

      {editingNode && (editingNode.type === 'input' || editingNode.type === 'output') && (
        <IOConfigModal
          node={editingNode}
          section={getCurrentSection()!}
          allSections={sections}
          onClose={() => setEditingNode(null)}
          onSave={(node) => {
            setSections(prev => prev.map(section => ({
              ...section,
              nodes: section.nodes.map(n => n.id === node.id ? node : n)
            })));
            setEditingNode(null);
          }}
        />
      )}

      {showSettings && getCurrentSection() && (
        <SectionSettingsModal
          section={getCurrentSection()!}
          allSections={sections}
          onClose={() => setShowSettings(false)}
          onSave={(section) => {
            setSections(prev => prev.map(s => s.id === section.id ? section : s));
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}

// Wrap with ReactFlowProvider
export default function AIPipelineSystem() {
  return (
    <ReactFlowProvider>
      <AIPipelineFlow />
    </ReactFlowProvider>
  );
}