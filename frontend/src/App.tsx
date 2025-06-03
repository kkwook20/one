// Related files: 
// - backend/main.py
// - package.json
// - global-vars-documentation.txt
// - frontend/src/types/index.ts
// - frontend/src/constants/index.ts
// - frontend/src/api/client.ts
// - frontend/src/components/*.tsx
// - frontend/src/components/modals/*.tsx
// - frontend/src/hooks/*.ts
// Location: frontend/src/App.tsx

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Settings } from 'lucide-react';
import { 
  Node, Section, Connection, Position, 
  TaskItem, UpdateHistory, Version 
} from './types';
import { GROUPS, NODE_TYPES } from './constants';
import { apiClient } from './api/client';
import { Canvas } from './components/Canvas';
import { useWebSocket } from './hooks/useWebSocket';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { NodeComponent } from './components/NodeComponent';
import { useNodeDrag } from './hooks/useNodeDrag';
import { 
  IOConfigModal, 
  SupervisorEditModal, 
  WorkerEditModal, 
  SectionSettingsModal 
} from './components/modals';

export default function AIPipelineSystem() {
  const [selectedGroup, setSelectedGroup] = useState<keyof typeof GROUPS>('preproduction');
  const [selectedSection, setSelectedSection] = useState<string>('Script');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);

  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [nodeProgress, setNodeProgress] = useState<{ [key: string]: number }>({});
  const [connectingNode, setConnectingNode] = useState<Node | null>(null);
  const [mousePosition, setMousePosition] = useState<Position>({ x: 0, y: 0 });
  const handleNodeUpdate = (node: Node) => {
  setSections(prev => prev.map(section => ({
    ...section,
    nodes: section.nodes.map(n => n.id === node.id ? node : n)
  })));
};
  const getCurrentSection = () => sections.find(s => s.name === selectedSection);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Use node drag hook
  const { isDragging, draggedNode, handleMouseDown } = useNodeDrag({
    canvasRef,
    onNodeUpdate: handleNodeUpdate
  });

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
          if (n.id === data.supervisorId) {
            const modHistory = (n as any).modificationHistory || [];
            return { 
              ...n, 
              modificationHistory: [...modHistory, { 
                id: data.modificationId,
                timestamp: new Date().toISOString(),
                targetNodeId: data.targetId,
                score: data.score,
                status: 'pending'
              }]
            };
          }
          return n;
        })
      })));
    }
  });

  const handleNodeDelete = (nodeId: string) => {
    setSections(prev => prev.map(section => {
      if (section.name === selectedSection) {
        return {
          ...section,
          nodes: section.nodes.filter(n => n.id !== nodeId)
        };
      }
      return section;
    }));
    setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
  };

  const handleNodeConnect = (fromId: string, toId: string) => {
    setConnections(prev => [...prev, { from: fromId, to: toId }]);
    setSections(prev => prev.map(section => ({
      ...section,
      nodes: section.nodes.map(n => {
        if (n.id === fromId) {
          return { ...n, connectedTo: [...(n.connectedTo || []), toId] };
        }
        if (n.id === toId) {
          return { ...n, connectedFrom: [...(n.connectedFrom || []), fromId] };
        }
        return n;
      })
    })));
  };

  const handleNodeDeactivate = async (nodeId: string) => {
    const currentSection = getCurrentSection();
    const node = currentSection?.nodes.find(n => n.id === nodeId);
    if (!node) return;

    try {
      await apiClient.deactivateNode(nodeId, currentSection.id);
      handleNodeUpdate({ ...node, isDeactivated: !node.isDeactivated });
    } catch (error) {
      console.error('Failed to toggle deactivation:', error);
    }
  };

  // Use keyboard shortcuts
  useKeyboardShortcuts({
    selectedNodeId,
    getCurrentSection,
    onNodeEdit: setEditingNode,
    onNodeDelete: handleNodeDelete,
    onNodeDeactivate: handleNodeDeactivate
  });

  const handleNodeAdd = (nodeType: string) => {
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
  };

  const playFlow = async () => {
    const currentSection = getCurrentSection();
    if (!currentSection) return;
    
    try {
      const response = await apiClient.executeFlow(currentSection.id);
      console.log('Flow execution results:', response.data);
    } catch (error) {
      console.error('Flow execution failed:', error);
    }
  };

  const currentSection = getCurrentSection();

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

      {/* Canvas - Simplified, actual implementation in separate Canvas component */}
      <div className="flex-1 relative overflow-hidden">
        <div 
          ref={canvasRef}
          className="absolute inset-0 bg-gray-50"
          style={{ 
            backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)', 
            backgroundSize: '20px 20px' 
          }}
        >
          {/* Canvas content would be extracted to a separate component */}
          {currentSection?.nodes.map(node => (
            <div
              key={node.id}
              onMouseDown={(e) => handleMouseDown(e, node)}
              style={{ cursor: isDragging && draggedNode?.id === node.id ? 'grabbing' : 'grab' }}
            >
              <NodeComponent
                key={node.id}
                node={node}
                onUpdate={handleNodeUpdate}
                onDelete={handleNodeDelete}
                onConnect={handleNodeConnect}
                isSelected={selectedNodeId === node.id}
                onSelect={setSelectedNodeId}
                onEdit={setEditingNode}
                onStartConnection={setConnectingNode}
                progress={nodeProgress[node.id]}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Node Palette */}
      <div className="bg-white border-t p-4">
        <div className="flex gap-4 justify-center">
          {NODE_TYPES.map(nodeType => {
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
      </div>

      {/* Modals */}
      {editingNode && editingNode.type === 'worker' && (
        <WorkerEditModal
          node={editingNode}
          section={currentSection!}
          allSections={sections}
          onClose={() => setEditingNode(null)}
          onSave={(node) => {
            handleNodeUpdate(node);
            setEditingNode(null);
          }}
        />
      )}

      {editingNode && (editingNode.type === 'supervisor' || editingNode.type === 'planner') && (
        <SupervisorEditModal
          node={editingNode}
          section={currentSection!}
          allSections={sections}
          onClose={() => setEditingNode(null)}
          onSave={(node) => {
            handleNodeUpdate(node);
            setEditingNode(null);
          }}
        />
      )}

      {editingNode && (editingNode.type === 'input' || editingNode.type === 'output') && (
        <IOConfigModal
          node={editingNode}
          section={currentSection!}
          allSections={sections}
          onClose={() => setEditingNode(null)}
          onSave={(node) => {
            handleNodeUpdate(node);
            setEditingNode(null);
          }}
        />
      )}

      {showSettings && currentSection && (
        <SectionSettingsModal
          section={currentSection}
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