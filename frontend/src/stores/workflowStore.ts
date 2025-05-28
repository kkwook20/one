import { create } from 'zustand';
import { Node, Edge, Connection, addEdge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange } from 'reactflow';
import axios from 'axios';

const API_URL = 'http://localhost:8000';

interface NodeExecution {
  nodeId: string;
  status: 'waiting' | 'running' | 'completed' | 'error';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: string;
}

interface WorkflowState {
  // React Flow 상태
  nodes: Node[];
  edges: Edge[];
  
  // 탭 관리
  activeTab: string;
  tabNodes: Record<string, string[]>; // 탭별 노드 ID 목록
  
  // 실행 상태
  executions: Record<string, NodeExecution>;
  isConnected: boolean;
  ws: WebSocket | null;
  
  // 노드 관리
  selectedNodeId: string | null;
  nodeConfigs: Record<string, any>;
  
  // Actions
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  
  addNode: (type: string, position?: { x: number; y: number }) => void;
  deleteNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: any) => void;
  updateNodeConfig: (nodeId: string, config: any) => Promise<void>;
  
  setActiveTab: (tab: string) => void;
  
  // WebSocket
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  sendMessage: (message: any) => void;
  
  // 실행 관리
  executeNode: (nodeId: string, nodeType: string) => void;
  executeFlow: (flowNodeId: string, nodeList: string[]) => void;
  stopExecution: (nodeId: string) => void;
  
  // 스토리지
  saveWorkflow: () => Promise<void>;
  loadWorkflow: (workflowId: string) => Promise<void>;
}

const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // 초기 상태
  nodes: [],
  edges: [],
  activeTab: 'story',
  tabNodes: {},
  executions: {},
  isConnected: false,
  ws: null,
  selectedNodeId: null,
  nodeConfigs: {},
  
  // React Flow 핸들러
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },
  
  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  
  onConnect: (connection) => {
    set({
      edges: addEdge(connection, get().edges),
    });
  },
  
  // 노드 관리
  addNode: (type, position) => {
    const id = `${type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: position || { x: 250, y: 250 },
      data: { 
        label: `${type.charAt(0).toUpperCase() + type.slice(1)} Node`,
        status: 'idle',
        logs: []
      },
    };
    
    const { nodes, activeTab, tabNodes } = get();
    
    // 현재 탭에 노드 추가
    const updatedTabNodes = { ...tabNodes };
    if (!updatedTabNodes[activeTab]) {
      updatedTabNodes[activeTab] = [];
    }
    updatedTabNodes[activeTab].push(id);
    
    set({ 
      nodes: [...nodes, newNode],
      tabNodes: updatedTabNodes
    });
  },
  
  deleteNode: (nodeId) => {
    const { nodes, edges, tabNodes } = get();
    
    // 노드와 연결된 엣지 제거
    const filteredNodes = nodes.filter(n => n.id !== nodeId);
    const filteredEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    
    // 탭에서 노드 제거
    const updatedTabNodes = { ...tabNodes };
    Object.keys(updatedTabNodes).forEach(tab => {
      updatedTabNodes[tab] = updatedTabNodes[tab].filter(id => id !== nodeId);
    });
    
    set({ 
      nodes: filteredNodes, 
      edges: filteredEdges,
      tabNodes: updatedTabNodes
    });
  },
  
  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map(node =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      ),
    });
  },
  
  updateNodeConfig: async (nodeId, config) => {
    try {
      await axios.post(`${API_URL}/api/nodes/${nodeId}/config`, config);
      
      set({
        nodeConfigs: {
          ...get().nodeConfigs,
          [nodeId]: config
        }
      });
    } catch (error) {
      console.error('Failed to update node config:', error);
    }
  },
  
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  // WebSocket 연결
  connectWebSocket: () => {
    const ws = new WebSocket('ws://localhost:8000/ws');
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      set({ isConnected: true, ws });
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'log':
          // 로그 메시지 처리
          const { nodes } = get();
          set({
            nodes: nodes.map(node =>
              node.id === data.nodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      logs: [...(node.data.logs || []), data.content]
                    }
                  }
                : node
            ),
          });
          break;
          
        case 'execution_start':
          // 실행 시작
          set({
            executions: {
              ...get().executions,
              [data.nodeId]: {
                nodeId: data.nodeId,
                status: 'running',
                progress: 0,
                startTime: new Date()
              }
            }
          });
          break;
          
        case 'execution_complete':
          // 실행 완료
          set({
            executions: {
              ...get().executions,
              [data.nodeId]: {
                ...get().executions[data.nodeId],
                status: data.result.status === 'success' ? 'completed' : 'error',
                progress: 100,
                endTime: new Date(),
                result: data.result,
                error: data.result.error
              }
            }
          });
          break;
          
        case 'execution_result':
          // 실행 결과
          console.log('Execution result:', data);
          break;
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      set({ isConnected: false, ws: null });
      
      // 재연결 시도
      setTimeout(() => {
        if (!get().isConnected) {
          get().connectWebSocket();
        }
      }, 3000);
    };
  },
  
  disconnectWebSocket: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null, isConnected: false });
    }
  },
  
  sendMessage: (message) => {
    const { ws, isConnected } = get();
    if (ws && isConnected) {
      ws.send(JSON.stringify(message));
    }
  },
  
  // 노드 실행
  executeNode: (nodeId, nodeType) => {
    const node = get().nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    get().sendMessage({
      action: 'execute',
      nodeId,
      nodeType,
      inputData: node.data
    });
  },
  
  executeFlow: (flowNodeId, nodeList) => {
    get().sendMessage({
      action: 'execute',
      nodeId: flowNodeId,
      nodeType: 'flow',
      executionList: nodeList.map((nodeId, index) => ({
        nodeId,
        order: index,
        type: get().nodes.find(n => n.id === nodeId)?.type || 'worker'
      }))
    });
  },
  
  stopExecution: (nodeId) => {
    get().sendMessage({
      action: 'stop',
      nodeId
    });
  },
  
  // 워크플로우 저장/로드
  saveWorkflow: async () => {
    const { nodes, edges, tabNodes } = get();
    const workflow = {
      nodes,
      edges,
      tabNodes,
      timestamp: new Date().toISOString()
    };
    
    try {
      // 실제 구현에서는 서버에 저장
      localStorage.setItem('workflow-autosave', JSON.stringify(workflow));
      console.log('Workflow saved');
    } catch (error) {
      console.error('Failed to save workflow:', error);
    }
  },
  
  loadWorkflow: async (workflowId) => {
    try {
      // 실제 구현에서는 서버에서 로드
      const saved = localStorage.getItem('workflow-autosave');
      if (saved) {
        const workflow = JSON.parse(saved);
        set({
          nodes: workflow.nodes,
          edges: workflow.edges,
          tabNodes: workflow.tabNodes || {}
        });
        console.log('Workflow loaded');
      }
    } catch (error) {
      console.error('Failed to load workflow:', error);
    }
  }
}));

export default useWorkflowStore;