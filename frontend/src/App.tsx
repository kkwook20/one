// frontend/src/App.tsx - React Flow 버전
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
import { Play, Settings } from 'lucide-react';

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
  
  const { fitView, zoomTo } = useReactFlow();

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
        progress: nodeProgress[node.id],
      },
      selected: selectedNodeId === node.id,
      style: {
        opacity: node.isDeactivated ? 0.5 : 1,
      }
    }));
  }, [selectedNodeId, nodeProgress]);

  // Convert connections to React Flow edges
  const convertToFlowEdges = useCallback((sectionNodes: Node[]): Edge[] => {
    const edges: Edge[] = [];
    sectionNodes.forEach(node => {
      if (node.connectedFrom) {
        node.connectedFrom.forEach(fromId => {
          edges.push({
            id: `${fromId}-${node.id}`,
            source: fromId,
            target: node.id,
            type: 'custom',
            animated: nodeProgress[fromId] !== undefined && nodeProgress[fromId] > 0,
            markerEnd: {
              type: MarkerType.ArrowClosed,
            },
          });
        });
      }
    });
    return edges;
  }, [nodeProgress]);

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
    setEdges((eds) => addEdge({ ...params, type: 'custom', animated: true }, eds));
    
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

  const getCurrentSection = useCallback(() => sections.find(s => s.name === selectedSection), [sections, selectedSection]);

  // WebSocket handlers
  const { isConnected } = useWebSocket({
    onProgress: (nodeId, progress) => {
      setNodeProgress(prev => ({ ...prev, [nodeId]: progress }));
      if (progress >= 1 || progress < 0) {
        setTimeout(() => {
          setNodeProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[nodeId];
            return newProgress;
          });
        }, 2000);
      }
    },
    onNodeOutputUpdated: (nodeId, output) => {
      setSections(prev => prev.map(section => ({
        ...section,
        nodes: section.nodes.map(n => 
          n.id === nodeId ? { ...n, output } : n
        )
      })));
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
    }
  });

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
      tasks: nodeType === 'worker' ? [] : undefined
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
    
    try {
      const response = await apiClient.executeFlow(currentSection.id);
      console.log('Flow execution results:', response.data);
    } catch (error) {
      console.error('Flow execution failed:', error);
    }
  }, [getCurrentSection]);

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
              className="flex items-center gap-2 px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
              title="Play Flow - Execute all connected nodes left to right"
            >
              <Play className="w-4 h-4" />
              Play Flow
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
      <div className="flex-1">
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

      {/* Modals - 기존과 동일 */}
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