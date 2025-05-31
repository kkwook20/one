import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  ReactFlowInstance,
  ReactFlowProvider,
  useReactFlow,
  Handle,
  Position,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

// Import node components
import WorkerNode from './components/nodes/WorkerNode';
import SupervisorNode from './components/nodes/SupervisorNode';
import PlannerNode from './components/nodes/PlannerNode';
import WatcherNode from './components/nodes/WatcherNode';
import SchedulerNode from './components/nodes/SchedulerNode';
import FlowNode from './components/nodes/FlowNode';
import StorageNode from './components/nodes/StorageNode';
import MemoryNode from './components/nodes/MemoryNode';
import TriggerNode from './components/nodes/TriggerNode';
import Dashboard from './components/monitoring/Dashboard';

// Manager node types
type ManagerType = 'supervisor' | 'planner' | 'watcher' | 'scheduler' | 'flow' | 'storage';

interface LayoutData {
  nodes: Node[];
  edges: Edge[];
  managerNodes: Set<ManagerType>;
}

interface TabItem {
  id: string;
  name: string;
}

interface NodePropertiesProps {
  node: Node | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (nodeId: string, data: any) => void;
}

// Section colors theme - Monochromatic like Barber Shop
const sectionColors = {
  'pre-production': {
    primary: '#2c3e50',    // Dark charcoal
    secondary: '#34495e',  // Medium charcoal
    accent: '#7f8c8d',     // Gray accent
    bg: '#f5f5f5',        // Very light gray
    text: '#2c3e50'
  },
  'post-production': {
    primary: '#34495e',    // Medium charcoal
    secondary: '#2c3e50',  // Dark charcoal
    accent: '#95a5a6',     // Light gray accent
    bg: '#eeeeee',        // Light gray
    text: '#2c3e50'
  },
  'director': {
    primary: '#1a252f',    // Very dark blue-gray
    secondary: '#2c3e50',  // Dark charcoal
    accent: '#34495e',     // Medium charcoal
    bg: '#e0e0e0',        // Medium gray
    text: '#1a252f'
  }
};

// Modern geometric icons
const NodeIcons = {
  worker: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      <circle cx="12" cy="12" r="3" fill="currentColor"/>
      <path d="M12 4V8M12 16V20M4 12H8M16 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  supervisor: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      <circle cx="12" cy="12" r="4" fill="currentColor"/>
    </svg>
  ),
  planner: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      <path d="M3 10H21" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 6V3M16 6V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <rect x="7" y="14" width="4" height="3" fill="currentColor"/>
      <rect x="13" y="14" width="4" height="3" fill="currentColor" opacity="0.5"/>
    </svg>
  ),
  watcher: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
    </svg>
  ),
  scheduler: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      <path d="M12 6V12L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
    </svg>
  ),
  flow: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M4 6C4 4.89543 4.89543 4 6 4H10L12 6H18C19.1046 6 20 6.89543 20 8V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6Z" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      <path d="M9 12H15M15 12L12 9M15 12L12 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  storage: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="5" rx="1" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      <rect x="4" y="11" width="16" height="5" rx="1" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      <circle cx="17" cy="6.5" r="1" fill="currentColor"/>
      <circle cx="17" cy="13.5" r="1" fill="currentColor"/>
      <line x1="6" y1="6.5" x2="8" y2="6.5" stroke="currentColor" strokeWidth="2"/>
      <line x1="6" y1="13.5" x2="8" y2="13.5" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  memory: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="8" width="16" height="8" rx="1" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      <path d="M8 8V5M12 8V5M16 8V5M8 16V19M12 16V19M16 16V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="8" cy="12" r="1" fill="currentColor"/>
      <circle cx="12" cy="12" r="1" fill="currentColor"/>
      <circle cx="16" cy="12" r="1" fill="currentColor"/>
    </svg>
  ),
  trigger: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
    </svg>
  ),
};

const tabs: Record<string, TabItem[]> = {
  'pre-production': [
    { id: 'script', name: 'Script' },
    { id: 'storyboard', name: 'Storyboard' },
    { id: 'planning', name: 'Planning' },
  ],
  'post-production': [
    { id: 'editing', name: 'Editing' },
    { id: 'coloring', name: 'Color Grading' },
    { id: 'sound', name: 'Sound Design' },
  ],
  'director': [
    { id: 'direction', name: 'Direction' },
    { id: 'review', name: 'Review' },
    { id: 'approval', name: 'Approval' },
  ],
};

const nodeTypes = {
  worker: { label: 'Worker', color: '#3b82f6' },
  supervisor: { label: 'Supervisor', color: '#9333ea' },
  planner: { label: 'Planner', color: '#10b981' },
  watcher: { label: 'Watcher', color: '#f59e0b' },
  scheduler: { label: 'Scheduler', color: '#ec4899' },
  flow: { label: 'Flow', color: '#ef4444' },
  storage: { label: 'Storage', color: '#6b7280' },
  memory: { label: 'Memory', color: '#8b5cf6' },
  trigger: { label: 'Trigger', color: '#f97316' },
};

// Modern node component with color theme
const ModernNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const nodeConfig = nodeTypes[data.nodeType as keyof typeof nodeTypes];
  const Icon = NodeIcons[data.nodeType as keyof typeof NodeIcons];
  
  return (
    <div 
      className={`relative bg-white transition-all ${
        selected 
          ? 'shadow-xl' 
          : 'shadow-md hover:shadow-lg'
      }`}
      style={{ 
        minWidth: '180px',
        border: `2px solid ${selected ? '#2c3e50' : '#bdc3c7'}`
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-gray-600 !border-0"
        style={{ left: '-6px' }}
      />
      
      <div className="p-4 px-8 py-2">
        <div className="flex items-center gap-3">
          <div 
            className="p-2.5"
            style={{ color: '#2c3e50' }}
          >
            {Icon && <Icon />}
          </div>
          <div className="flex flex-col">
            <div className="text-sm font-bold text-gray-900 uppercase tracking-wide">{data.label}</div>
            <div className="text-xs text-gray-600 uppercase tracking-wider">{nodeConfig.label}</div>
          </div>
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-gray-600 !border-0"
        style={{ right: '-6px' }}
      />
    </div>
  );
};

// Properties Panel
const NodeProperties: React.FC<NodePropertiesProps> = ({ node, isOpen, onClose, onUpdate }) => {
  const [label, setLabel] = useState(node?.data?.label || '');
  
  useEffect(() => {
    setLabel(node?.data?.label || '');
  }, [node]);
  
  if (!isOpen || !node) return null;
  
  const nodeConfig = nodeTypes[node.data.nodeType as keyof typeof nodeTypes];
  
  return (
    <div className="absolute right-8 top-8 w-80 bg-white shadow-2xl z-50 overflow-hidden">
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-between text-white">
        <h3 className="text-sm font-bold uppercase tracking-wider">Node Properties</h3>
        <button
          onClick={onClose}
          className="hover:opacity-70 transition-opacity"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 5L5 15M5 5l10 10" stroke="white" strokeWidth="2"/>
          </svg>
        </button>
      </div>
      
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => onUpdate(node.id, { ...node.data, label })}
            className="w-full px-4 py-2 border border-gray-400 focus:border-gray-800 outline-none transition-colors"
          />
        </div>
        
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Type</label>
          <div className="px-4 py-2 bg-gray-200 text-gray-800 font-medium uppercase text-sm">
            {nodeConfig.label}
          </div>
        </div>
      </div>
    </div>
  );
};

// Sidebar Component
const Sidebar: React.FC<{ 
  activeTab: string; 
  activeSubTab: string; 
  setActiveTab: (tab: string) => void; 
  setActiveSubTab: (tab: string) => void;
  onExport: () => void;
  onImport: () => void;
  lastSaved: Date;
  saveCurrentLayout: () => void;
  nodes: Node[];
  onAddNode: (type: string) => void;
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
  disabledManagerNodes: Set<string>;
}> = ({ 
  activeTab, 
  activeSubTab, 
  setActiveTab, 
  setActiveSubTab, 
  onExport, 
  onImport, 
  lastSaved, 
  saveCurrentLayout,
  nodes,
  onAddNode,
  onDragStart,
  disabledManagerNodes
}) => {
  const activeColors = sectionColors[activeTab as keyof typeof sectionColors] || sectionColors['pre-production'];

  return (
    <div className="w-96 flex flex-col h-full shadow-xl" style={{ backgroundColor: '#e5e5e5' }}>
      {/* Logo Section */}
      <div className="p-10 bg-white">
        <img src="/src/logo.png" alt="The One" className="w-full h-auto" />
      </div>
      
      {/* X Pattern Decoration */}
      <div className="h-12 relative overflow-hidden" style={{ backgroundColor: '#2c3e50' }}>
        <svg width="100%" height="100%" className="absolute inset-0">
          <pattern id="x-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 0L20 20M20 0L0 20" stroke="#ffffff" strokeWidth="0.5" opacity="0.15"/>
          </pattern>
          <rect width="100%" height="100%" fill="url(#x-pattern)" />
        </svg>
      </div>
      
      {/* Main Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Section Tabs */}
        <div className="p-4 space-y-2" style={{ backgroundColor: '#f0f0f0' }}>
          {Object.entries(sectionColors).map(([sectionId, colors]) => {
            const sectionName = sectionId.split('-').map(word => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            
            return (
              <button
                key={sectionId}
                onClick={() => {
                  saveCurrentLayout();
                  setActiveTab(sectionId);
                  setActiveSubTab(tabs[sectionId][0].id);
                }}
                className={`w-full px-6 py-4 transition-all font-bold text-left uppercase tracking-wider text-sm ${
                  activeTab === sectionId
                    ? 'text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: activeTab === sectionId ? colors.primary : undefined
                }}
              >
                {sectionName}
              </button>
            );
          })}
        </div>
        
        {/* Sub Items */}
        {activeTab && (
          <div className="p-4 space-y-2" style={{ backgroundColor: activeColors.bg }}>
            <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#2c3e50' }}>
              Workflows
            </h4>
            {tabs[activeTab].map(subTab => (
              <button
                key={subTab.id}
                onClick={() => {
                  saveCurrentLayout();
                  setActiveSubTab(subTab.id);
                }}
                className={`w-full px-4 py-3 transition-all text-left font-medium uppercase text-sm ${
                  activeSubTab === subTab.id
                    ? 'text-white shadow-md'
                    : 'bg-white text-gray-700 hover:bg-gray-50 shadow-sm'
                }`}
                style={{
                  backgroundColor: activeSubTab === subTab.id ? '#2c3e50' : undefined,
                  borderLeft: `4px solid ${activeSubTab === subTab.id ? '#2c3e50' : 'transparent'}`
                }}
              >
                {subTab.name}
              </button>
            ))}
          </div>
        )}
        
        {/* Node Palette */}
        <div className="p-4" style={{ backgroundColor: '#f0f0f0' }}>
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4">Node Palette</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(nodeTypes).map(([type, config]) => {
              const Icon = NodeIcons[type as keyof typeof NodeIcons];
              const isManager = ['supervisor', 'planner', 'watcher', 'scheduler', 'flow', 'storage'].includes(type);
              const isDisabled = isManager && disabledManagerNodes.has(type);
              
              return (
                <button
                  key={type}
                  onClick={() => !isDisabled && onAddNode(type)}
                  onDragStart={(e) => !isDisabled && onDragStart(e, type)}
                  draggable={!isDisabled}
                  className={`p-3 text-xs font-bold transition-all flex flex-col items-center gap-2 uppercase ${
                    isDisabled 
                      ? 'bg-gray-100 text-gray-400 border border-gray-300 cursor-not-allowed opacity-50' 
                      : 'bg-white hover:bg-gray-50 text-gray-700 cursor-move hover:shadow-md border border-gray-400'
                  }`}
                  style={{
                    color: isDisabled ? undefined : '#2c3e50'
                  }}
                  disabled={isDisabled}
                >
                  {Icon && <Icon />}
                  <span>{config.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="p-4 space-y-3" style={{ backgroundColor: '#f0f0f0' }}>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onExport}
            className="py-3 text-white text-xs font-bold uppercase tracking-wider transition-all hover:opacity-90"
            style={{ backgroundColor: '#2c3e50' }}
          >
            EXPORT
          </button>
          <button
            onClick={onImport}
            className="py-3 bg-white hover:bg-gray-50 text-xs font-bold uppercase tracking-wider border-2 transition-all"
            style={{ borderColor: '#2c3e50', color: '#2c3e50' }}
          >
            IMPORT
          </button>
        </div>
        
        <div className="flex items-center justify-center gap-2 text-xs text-gray-600 uppercase tracking-wider">
          <div className="w-2 h-2 rounded-full bg-gray-600 animate-pulse"></div>
          <span>{lastSaved.toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};

// Register custom node types - FIXED: Added 'modern' type
const nodeTypesComponents = {
  modern: ModernNode,  // This was missing!
  worker: WorkerNode,
  supervisor: SupervisorNode,
  planner: PlannerNode,
  watcher: WatcherNode,
  scheduler: SchedulerNode,
  flow: FlowNode,
  storage: StorageNode,
  memory: MemoryNode,
  trigger: TriggerNode,
};

function FlowApp() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [activeTab, setActiveTab] = useState<string>('pre-production');
  const [activeSubTab, setActiveSubTab] = useState<string>('script');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  
  const { fitView } = useReactFlow();
  
  // Initialize layouts
  const initializeLayouts = (): Record<string, LayoutData> => {
    const initialLayouts: Record<string, LayoutData> = {};
    Object.entries(tabs).forEach(([tabId, subTabs]) => {
      subTabs.forEach(subTab => {
        const key = `${tabId}-${subTab.id}`;
        initialLayouts[key] = {
          nodes: [],
          edges: [],
          managerNodes: new Set<ManagerType>()
        };
      });
    });
    return initialLayouts;
  };

  const [layouts, setLayouts] = useState<Record<string, LayoutData>>(initializeLayouts);

  const currentLayoutKey = `${activeTab}-${activeSubTab}`;
  const currentLayout = layouts[currentLayoutKey] || { nodes: [], edges: [], managerNodes: new Set<ManagerType>() };

  const [nodes, setNodes, onNodesChange] = useNodesState(currentLayout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(currentLayout.edges);

  // Update nodes and edges when layout changes
  useEffect(() => {
    const layout = layouts[currentLayoutKey];
    if (layout) {
      setNodes(layout.nodes);
      setEdges(layout.edges);
    }
  }, [currentLayoutKey, layouts, setNodes, setEdges]);

  // Auto-save current layout in memory
  const saveCurrentLayout = useCallback(() => {
    setLayouts(prev => ({
      ...prev,
      [currentLayoutKey]: {
        nodes: nodes,
        edges: edges,
        managerNodes: new Set(nodes.filter(n => 
          ['supervisor', 'planner', 'watcher', 'scheduler', 'flow', 'storage'].includes(n.data.nodeType)
        ).map(n => n.data.nodeType as ManagerType))
      }
    }));
    setLastSaved(new Date());
  }, [currentLayoutKey, nodes, edges]);

  // Auto-save on changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveCurrentLayout();
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [nodes, edges, saveCurrentLayout]);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge({
      ...params,
      style: { 
        stroke: '#7f8c8d', 
        strokeWidth: 2 
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#7f8c8d',
        width: 20,
        height: 20,
      },
    }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setIsPropertiesOpen(true);
  }, []);

  const updateNodeData = useCallback((nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Calculate disabled manager nodes
  const disabledManagerNodes = useMemo(() => {
    return new Set(nodes.filter(n => 
      ['supervisor', 'planner', 'watcher', 'scheduler', 'flow', 'storage', 'memory', 'trigger'].includes(n.data.nodeType)
    ).map(n => n.data.nodeType));
  }, [nodes]);

  const handleAddNode = useCallback((type: string) => {
    const managerTypes: ManagerType[] = ['supervisor', 'planner', 'watcher', 'scheduler', 'flow', 'storage'];
    
    if (managerTypes.includes(type as ManagerType)) {
      const currentManagerNodes = new Set(nodes.filter(n => 
        managerTypes.includes(n.data.nodeType as ManagerType)
      ).map(n => n.data.nodeType as ManagerType));
      
      if (currentManagerNodes.has(type as ManagerType)) {
        return;
      }
    }

    const position = {
      x: Math.random() * 400 + 100,
      y: Math.random() * 300 + 100,
    };

    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: 'modern',
      position,
      data: { 
        label: `${nodeTypes[type as keyof typeof nodeTypes].label} ${nodes.filter(n => n.data.nodeType === type).length + 1}`,
        nodeType: type
      },
    };

    setNodes((nds) => nds.concat(newNode));
    setTimeout(() => fitView({ duration: 300 }), 50);
  }, [nodes, setNodes, fitView]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedNode) {
        setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
        setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
        setSelectedNode(null);
        setIsPropertiesOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedNode, setNodes, setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowInstance || !reactFlowWrapper.current) return;

      const managerTypes: ManagerType[] = ['supervisor', 'planner', 'watcher', 'scheduler', 'flow', 'storage'];
      
      if (managerTypes.includes(type as ManagerType)) {
        const currentManagerNodes = new Set(nodes.filter(n => 
          managerTypes.includes(n.data.nodeType as ManagerType)
        ).map(n => n.data.nodeType as ManagerType));
        
        if (currentManagerNodes.has(type as ManagerType)) {
          return;
        }
      }

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type: 'modern',
        position,
        data: { 
          label: `${nodeTypes[type as keyof typeof nodeTypes].label} ${nodes.filter(n => n.data.nodeType === type).length + 1}`,
          nodeType: type
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, nodes, setNodes]
  );

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  // Export workflow
  const handleExportWorkflow = () => {
    saveCurrentLayout();
    const projectData = {
      layouts: Object.entries(layouts).reduce((acc, [key, layout]) => {
        acc[key] = {
          nodes: layout.nodes,
          edges: layout.edges,
          managerNodes: Array.from(layout.managerNodes)
        };
        return acc;
      }, {} as any),
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `the-one-workflow-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import workflow
  const handleImportWorkflow = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const projectData = JSON.parse(e.target?.result as string);
        const convertedLayouts: Record<string, LayoutData> = {};
        Object.entries(projectData.layouts).forEach(([key, layout]: [string, any]) => {
          convertedLayouts[key] = {
            nodes: layout.nodes || [],
            edges: layout.edges || [],
            managerNodes: new Set(layout.managerNodes || [])
          };
        });
        setLayouts(convertedLayouts);
        setLastSaved(new Date());
      } catch (error) {
        console.error('Error loading workflow:', error);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-screen flex" style={{ backgroundColor: '#9a9a9a' }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileImport}
        className="hidden"
      />
      
      {/* Left Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        activeSubTab={activeSubTab}
        setActiveTab={setActiveTab} 
        setActiveSubTab={setActiveSubTab}
        onExport={handleExportWorkflow}
        onImport={handleImportWorkflow}
        lastSaved={lastSaved}
        saveCurrentLayout={saveCurrentLayout}
        nodes={nodes}
        onAddNode={handleAddNode}
        onDragStart={onDragStart}
        disabledManagerNodes={disabledManagerNodes}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header Bar */}
        <div className="px-8 py-6 text-white shadow-md" style={{ backgroundColor: '#2c3e50' }}>
          <h1 className="text-4xl font-black uppercase tracking-widest">
            {activeTab.split('-').join(' ')}
          </h1>
          <p className="text-sm opacity-70 uppercase tracking-wider mt-1">
            {activeSubTab} Workflow
          </p>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative" ref={reactFlowWrapper} style={{ backgroundColor: '#d0d0d0' }}>
          {/* Decorative pattern */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <svg width="100%" height="100%">
              <pattern id="pattern" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M0 0L12 12M12 0L24 12M0 12L12 24" stroke="#666666" strokeWidth="0.5"/>
              </pattern>
              <rect width="100%" height="100%" fill="url(#pattern)" />
            </svg>
          </div>
          
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypesComponents}
            fitView
            className="bg-transparent"
          >
            <Background color="#999999" gap={24} />
            <Controls 
              className="bg-white border shadow-lg"
              style={{ borderColor: '#34495e' }}
            />
            <MiniMap 
              className="bg-white border shadow-lg"
              style={{ borderColor: '#34495e' }}
              nodeColor={(node) => {
                const config = nodeTypes[node.data?.nodeType as keyof typeof nodeTypes];
                return config ? config.color : '#7f8c8d';
              }}
            />
          </ReactFlow>
          
          {/* Node Properties Panel */}
          <NodeProperties
            node={selectedNode}
            isOpen={isPropertiesOpen}
            onClose={() => setIsPropertiesOpen(false)}
            onUpdate={updateNodeData}
          />
          
          {/* Stats */}
          <div className="absolute bottom-8 left-20 bg-white shadow-lg p-6 flex gap-12">
            <div>
              <p className="text-4xl font-black" style={{ color: '#2c3e50' }}>
                {nodes.length}
              </p>
              <p className="text-xs uppercase tracking-wider" style={{ color: '#7f8c8d' }}>Nodes</p>
            </div>
            <div className="h-14 w-px bg-gray-300"></div>
            <div>
              <p className="text-4xl font-black" style={{ color: '#34495e' }}>
                {edges.length}
              </p>
              <p className="text-xs uppercase tracking-wider" style={{ color: '#7f8c8d' }}>Connections</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// App component with ReactFlowProvider wrapper
function App() {
  return (
    <Router>
      <div className="h-screen flex flex-col">
        <nav className="bg-gray-900 border-b border-gray-800 px-4 py-2">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-white font-bold">Workflow Engine</Link>
            <Link to="/monitoring" className="text-gray-400 hover:text-white">Monitoring</Link>
          </div>
        </nav>
        
        <Routes>
          <Route 
            path="/" 
            element={
              <ReactFlowProvider>
                <FlowApp />
              </ReactFlowProvider>
            } 
          />
          <Route path="/monitoring" element={<Dashboard />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;