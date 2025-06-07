// frontend/src/App.tsx - 중복 제거 및 정리된 버전
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
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
  Loader2,
} from 'lucide-react';

// Types
import { Node, Section, ExecutionLog } from './types';

// Components
import { CustomNode } from './components/flow/CustomNode';
import { CustomEdge } from './components/flow/CustomEdge';
import { WorkerEditModal } from './components/modals/WorkerEditModal';
import { SupervisorEditModal } from './components/modals/SupervisorEditModal';
import { IOConfigModal } from './components/modals/IOConfigModal';
import { SectionSettingsModal } from './components/modals/SectionSettingsModal';

// Hooks
import { useWebSocket } from './hooks/useWebSocket';
import { useUndoRedo } from './hooks/useUndoRedo';

// API & Constants
import { apiClient } from './api/client';
import { GROUPS, NODE_TYPES } from './constants';

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
      .react-flow__edge-path {
        transition: stroke 0.2s ease, stroke-width 0.2s ease;
      }
      .react-flow__arrowhead {
        fill: #94a3b8;
        transition: fill 0.2s ease;
      }
      /* Edge hover effect for arrow */
      .react-flow__edge:hover .react-flow__arrowhead {
        fill: #ff6f5c;
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

// Node types configuration
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
  const sectionNodesRef = useRef<{ [sectionId: string]: FlowNode[] }>({});
  const pendingUpdatesRef = useRef<{ [sectionId: string]: Section }>({});
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { project } = useReactFlow();

  // Undo/Redo Hook
  const { 
    addToHistory, 
    undo, 
    clearHistory,
    isInternalUpdate,
    resetInternalUpdate,
  } = useUndoRedo({ maxHistorySize: 20 });

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
          await apiClient.updateSection(sectionId, sectionData);
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

  // 현재 상태를 히스토리에 저장하는 함수 (다른 콜백들보다 먼저 정의)
  const saveToHistory = useCallback(() => {
    if (!isInternalUpdate.current && nodes.length > 0 && !isLoading && currentSection?.id) {
      addToHistory(nodes, edges, sections, currentSection.id);
    }
  }, [nodes, edges, sections, isInternalUpdate, addToHistory, isLoading, currentSection]);

  // Edge 삭제 핸들러
  const handleEdgeDelete = useCallback((edgeId: string) => {
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;
    
    const { source: sourceId, target: targetId } = edge;
    
    // 먼저 히스토리에 현재 상태 저장
    if (!isInternalUpdate.current) {
      saveToHistory();
    }
    
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
  }, [edges, currentSection, selectedSection, updateSectionInBackend, addLog, saveToHistory, isInternalUpdate]);

  // 콜백 함수들
  const nodeCallbacks = useMemo(() => ({
    onEdit: (node: Node) => setEditingNode(node),
    onDeactivate: (nodeId: string) => {
      const section = sections.find(s => s.name === selectedSection);
      if (!section) return;
      
      apiClient.deactivateNode(nodeId, section.id)
        .then(() => {
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
        })
        .catch(error => {
          console.error('Failed to toggle deactivation:', error);
        });
    },
    onToggleRun: (nodeId: string) => {
      const section = sections.find(s => s.name === selectedSection);
      const node = section?.nodes.find(n => n.id === nodeId);
      
      if (!node || !section) return;

      if (runningNodes.has(nodeId)) {
        apiClient.stopNode(nodeId)
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
        
        apiClient.executeNode(nodeId, section.id, node.code || '', {})
          .catch(error => {
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
      
      // 삭제하려는 노드 찾기
      const nodeToDelete = section.nodes.find(n => n.id === nodeId);
      if (!nodeToDelete) return;
      
      // input/output 노드는 삭제 불가
      if (nodeToDelete.type === 'input' || nodeToDelete.type === 'output') {
        addLog({
          nodeId: 'system',
          nodeLabel: 'System',
          type: 'error',
          message: `${nodeToDelete.type} nodes cannot be deleted`
        });
        return;
      }
      
      // 삭제 전에 현재 상태를 저장
      if (currentSection && !isInternalUpdate.current) {
        addToHistory(nodes, edges, sections, currentSection.id);
      }
      
      // flushSync를 사용하여 상태 업데이트를 동기적으로 처리
      flushSync(() => {
        // React Flow 상태 업데이트
        const newNodes = nodes.filter(n => n.id !== nodeId);
        const newEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
        
        setNodes(newNodes);
        setEdges(newEdges);
        
        // 캐시 업데이트
        if (currentSection) {
          sectionNodesRef.current[currentSection.id] = newNodes;
          sectionEdgesRef.current[currentSection.id] = newEdges;
        }
        
        // 섹션 업데이트
        const updatedSection = {
          ...section,
          nodes: section.nodes
            .filter(n => n.id !== nodeId)
            .map(n => ({
              ...n,
              connectedTo: n.connectedTo?.filter(id => id !== nodeId),
              connectedFrom: n.connectedFrom?.filter(id => id !== nodeId)
            }))
        };
        
        setSections(prev => prev.map(s => s.id === updatedSection.id ? updatedSection : s));
        
        // 백엔드 업데이트는 flushSync 밖에서
        setTimeout(() => {
          updateSectionInBackend(updatedSection);
        }, 0);
      });
      
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'info',
        message: `Node "${nodeToDelete.label}" deleted`
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
  }), [sections, selectedSection, runningNodes, updateSectionInBackend, currentSection, addLog, nodes, edges, addToHistory]);

  // 노드 위치 업데이트 함수
  const updateNodePosition = useCallback((nodeId: string, newPosition: { x: number; y: number }) => {
    setSections(prevSections => {
      const updatedSections = prevSections.map(section => {
        if (section.name === selectedSection) {
          const updatedNodes = section.nodes.map(node => {
            if (node.id === nodeId) {
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
    if (isInternalUpdate.current) {
      // undo/redo 중이면 일반 처리만
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
      return;
    }
    
    changes.forEach(change => {
      if (change.type === 'position' && 'position' in change && change.position) {
        if ('dragging' in change) {
          if (change.dragging === true) {
            // 드래그 시작 시 현재 상태 저장
            if (!isInternalUpdate.current) {
              saveToHistory();
            }
          } else if (change.dragging === false) {
            // 드래그 완료 시 위치 업데이트
            updateNodePosition(change.id, {
              x: Math.round(change.position.x),
              y: Math.round(change.position.y)
            });
          }
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
  }, [updateNodePosition, sections, selectedSection, isInternalUpdate, saveToHistory]);

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
    
    // undo 작업 중이면 완전히 스킵
    if (isInternalUpdate.current) {
      return;
    }
    
    // 이전 섹션의 노드 상태 저장
    const prevSectionId = Object.keys(sectionNodesRef.current).find(id => 
      sectionNodesRef.current[id].length > 0 && id !== currentSection.id
    );
    if (prevSectionId && nodes.length > 0) {
      sectionNodesRef.current[prevSectionId] = [...nodes];
    }
    
    // 캐시된 노드가 있으면 사용 (undo 중이 아닌 경우에만)
    const cachedNodes = sectionNodesRef.current[currentSection.id];
    if (cachedNodes && cachedNodes.length > 0) {
      setNodes(cachedNodes);
      
      // 엣지 복원
      const savedEdges = sectionEdgesRef.current[currentSection.id];
      if (savedEdges) {
        setEdges(savedEdges.map(edge => ({
          ...edge,
          data: {
            ...edge.data,
            onDelete: handleEdgeDelete,
            isActive: activeEdges.has(edge.id)
          },
          animated: activeEdges.has(edge.id),
          style: {
            stroke: activeEdges.has(edge.id) ? '#10b981' : '#94a3b8',
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#94a3b8',
          },
        })));
      }
      return;
    }
    
    // 캐시가 없으면 섹션 데이터에서 노드 생성
    const hasValidPositions = currentSection.nodes.every(node => 
      node.position && 
      typeof node.position.x === 'number' && 
      typeof node.position.y === 'number' &&
      !isNaN(node.position.x) && 
      !isNaN(node.position.y)
    );
    
    if (!hasValidPositions) {
      console.error('Invalid node positions detected!');
    }
    
    // 노드 변환
    const flowNodes: FlowNode[] = currentSection.nodes.map((node, index) => {
      // 안전한 position 처리
      let position = { x: 0, y: 0 };
      let hasValidPosition = false;
      
      if (node.position && typeof node.position === 'object' && 'x' in node.position && 'y' in node.position) {
        const x = Number(node.position.x);
        const y = Number(node.position.y);
        
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
          const col = index % 3;
          const row = Math.floor(index / 3);
          position = {
            x: 250 + col * 200,
            y: 100 + row * 150
          };
        }
        
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
          position: position, // position도 data에 포함
          tasks: node.tasks, // worker 노드의 tasks 명시적으로 포함
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
      
      return flowNode;
    });
    
    // 엣지 변환
    const savedEdges = sectionEdgesRef.current[currentSection.id];
    
    if (savedEdges) {
      setEdges(savedEdges.map(edge => ({
        ...edge,
        data: {
          ...edge.data,
          onDelete: handleEdgeDelete,
          isActive: activeEdges.has(edge.id)
        },
        animated: activeEdges.has(edge.id),
        style: {
          stroke: activeEdges.has(edge.id) ? '#10b981' : '#94a3b8',
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#94a3b8',
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
                onDelete: handleEdgeDelete,
                isActive: activeEdges.has(edgeId)
              },
              style: {
                stroke: activeEdges.has(edgeId) ? '#10b981' : '#94a3b8',
                strokeWidth: 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#94a3b8',
              },
            });
          });
        }
      });
      
      setEdges(flowEdges);
      sectionEdgesRef.current[currentSection.id] = flowEdges;
    }
    
    setNodes(flowNodes);
    
    // 캐시에 저장
    sectionNodesRef.current[currentSection.id] = flowNodes;
  }, [currentSection?.id, selectedSection, isInternalUpdate]);

  // 동적 상태 업데이트를 위한 별도 effect
  useEffect(() => {
    if (!currentSection || isInternalUpdate.current) return;
    
    setNodes(prevNodes => prevNodes.map(node => {
      const sectionNode = currentSection.nodes.find(n => n.id === node.id);
      if (!sectionNode) return node;
      
      return {
        ...node,
        data: {
          ...node.data,
          ...sectionNode,
          position: node.position, // 기존 position 유지
          tasks: sectionNode.tasks, // worker 노드의 tasks 명시적으로 포함
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
        onDelete: handleEdgeDelete,
        isActive: activeEdges.has(edge.id)
      },
      style: {
        stroke: activeEdges.has(edge.id) ? '#10b981' : '#94a3b8',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#94a3b8',
      },
    })));
  }, [selectedNodeId, nodeProgress, runningNodes, completedNodes, activeEdges, nodeCallbacks, handleEdgeDelete, isInternalUpdate]);

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
    
    // 먼저 히스토리에 현재 상태 저장
    if (!isInternalUpdate.current) {
      saveToHistory();
    }
    
    // React Flow에 edge 추가
    const newEdge = {
      ...params,
      id: edgeId,
      type: 'custom',
      animated: false,
      data: { 
        onDelete: handleEdgeDelete,
        isActive: false
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
  }, [sections, selectedSection, edges, updateSectionInBackend, addLog, handleEdgeDelete, saveToHistory, isInternalUpdate]);

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

  // 키보드 단축키 핸들러
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드에 포커스가 있으면 무시
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Ctrl+Z (Undo)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (!currentSection || isInternalUpdate.current) return;
        
        const previousState = undo();
        if (previousState && previousState.sectionId === currentSection.id) {
          // 플래그를 먼저 설정
          isInternalUpdate.current = true;
          
          // 캐시를 먼저 삭제 (중요!)
          delete sectionNodesRef.current[currentSection.id];
          delete sectionEdgesRef.current[currentSection.id];
          
          // 현재 섹션의 이전 상태만 복원
          const restoredSection = previousState.sections.find(s => s.id === currentSection.id);
          if (restoredSection) {
            // 섹션 업데이트 먼저 (이렇게 하면 effect가 실행될 때 올바른 데이터 사용)
            setSections(previousState.sections);
            
            // 그 다음 노드와 엣지 복원
            setNodes(previousState.nodes);
            setEdges(previousState.edges);
            
            // 새로운 캐시 설정
            sectionNodesRef.current[currentSection.id] = previousState.nodes;
            sectionEdgesRef.current[currentSection.id] = previousState.edges;
            
            addLog({
              nodeId: 'system',
              nodeLabel: 'System',
              type: 'info',
              message: `Undo performed`
            });
            
            // 플래그 리셋은 모든 effect가 실행된 후에
            setTimeout(() => {
              resetInternalUpdate();
            }, 200);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, addLog, currentSection, isInternalUpdate, resetInternalUpdate]);

  // 노드 추가
  const handleNodeAdd = useCallback(async (nodeType: string) => {
    if (!currentSection) return;

    // supervisor와 planner는 섹션당 하나만 허용
    if ((nodeType === 'supervisor' || nodeType === 'planner') && 
        currentSection.nodes.some(n => n.type === nodeType)) {
      addLog({
        nodeId: 'system',
        nodeLabel: 'System',
        type: 'error',
        message: `Only one ${nodeType} is allowed per section`
      });
      return;
    }

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

    // 고유한 라벨 생성 - 같은 타입의 노드 중 사용 가능한 가장 작은 번호 찾기
    const baseLabel = nodeType.charAt(0).toUpperCase() + nodeType.slice(1);
    let nodeLabel = baseLabel;
    
    // supervisor와 planner는 번호를 붙이지 않음 (섹션당 하나만 허용)
    if (nodeType !== 'supervisor' && nodeType !== 'planner') {
      // 현재 섹션에서 같은 타입의 노드들의 라벨 확인
      const existingLabels = currentSection.nodes
        .filter(n => n.type === nodeType)
        .map(n => n.label);
      
      // 번호가 없는 기본 라벨이 이미 존재하는지 확인
      if (existingLabels.includes(baseLabel)) {
        // 사용 가능한 가장 작은 번호 찾기
        let num = 1;
        while (existingLabels.includes(`${baseLabel} ${num}`)) {
          num++;
        }
        nodeLabel = `${baseLabel} ${num}`;
      }
    }

    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType as Node['type'],
      label: nodeLabel,
      position: { x: Math.round(position.x), y: Math.round(position.y) },
      isRunning: false,
      tasks: nodeType === 'worker' ? [
        { id: `task-${Date.now()}`, text: '', status: 'pending' }
      ] : undefined
    };

    // 먼저 히스토리에 현재 상태 저장
    if (!isInternalUpdate.current) {
      saveToHistory();
    }

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
        position: newNode.position, // position도 data에 포함
        tasks: newNode.tasks, // worker 노드의 tasks 명시적으로 포함
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
      await apiClient.updateSection(updatedSection.id, updatedSection);
      console.log('Node added and saved');
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
      message: `Added ${newNode.label} at position (${newNode.position.x}, ${newNode.position.y})`
    });
  }, [currentSection, nodes, project, updateSectionInBackend, addLog, nodeCallbacks, saveToHistory, isInternalUpdate]);

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
      const response = await apiClient.executeFlow(currentSection.id);
      
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
      
      await apiClient.updateSection(updatedSection.id, updatedSection);
      
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
  
  // 섹션 변경 핸들러
  const handleSectionChange = useCallback(async (sectionName: string) => {
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
        await apiClient.updateSection(updatedSection.id, updatedSection);
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
    
    // 히스토리 클리어
    clearHistory();
  }, [selectedSection, sections, nodes, clearHistory]);

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
        await apiClient.updateSection(updatedSection.id, updatedSection);
      } catch (error) {
        console.error('Failed to save section:', error);
      }
    }
    
    // 상태 초기화
    setCompletedNodes(new Set());
    setActiveEdges(new Set());
    setNodeProgress({});
    setRunningNodes(new Set());
    
    // 히스토리 클리어
    clearHistory();
    
    setSelectedGroup(group);
    const firstSection = sections.find(s => s.group === group);
    if (firstSection) {
      setSelectedSection(firstSection.name);
    }
  }, [sections, selectedSection, nodes, clearHistory]);

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
        
        apiClient.getSections()
          .then(response => {
            const cleanedSections = response.data.map((section: any) => {
              const cleanedSection = {
                ...section,
                nodes: section.nodes.map((node: any, index: number) => {
                  // position 데이터 확인
                  let finalPosition = { x: 0, y: 0 };
                  let hasValidPosition = false;
                  
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
                  }
                  
                  return {
                    ...node,
                    position: finalPosition
                  };
                })
              };
              
              return cleanedSection;
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
            key={currentSection?.id}
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
                  .map(nodeType => {
                    // supervisor와 planner는 섹션당 하나만 허용
                    const isDisabled = (nodeType.type === 'supervisor' || nodeType.type === 'planner') &&
                      currentSection?.nodes.some(n => n.type === nodeType.type);
                    
                    return (
                      <button
                        key={nodeType.type}
                        onClick={() => handleNodeAdd(nodeType.type)}
                        disabled={isDisabled}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                          isDisabled 
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                            : 'bg-gray-100 hover:bg-gray-200 cursor-pointer'
                        }`}
                        title={isDisabled ? `Only one ${nodeType.label} allowed per section` : `Add ${nodeType.label}`}
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

      {/* Modals */}
      {editingNode && currentSection && (
        <>
          {(editingNode.type === 'input' || editingNode.type === 'output') ? (
            <IOConfigModal
              node={editingNode}
              section={currentSection}
              allSections={sections}
              onClose={() => setEditingNode(null)}
              onSave={(node) => {
                nodeCallbacks.onUpdate(node);
                setEditingNode(null);
              }}
            />
          ) : editingNode.type === 'worker' ? (
            <WorkerEditModal
              node={editingNode}
              section={currentSection}
              allSections={sections}
              onClose={() => setEditingNode(null)}
              onSave={(node) => {
                nodeCallbacks.onUpdate(node);
                setEditingNode(null);
              }}
            />
          ) : (editingNode.type === 'supervisor' || editingNode.type === 'planner') ? (
            <SupervisorEditModal
              node={editingNode}
              section={currentSection}
              allSections={sections}
              onClose={() => setEditingNode(null)}
              onSave={(node) => {
                nodeCallbacks.onUpdate(node);
                setEditingNode(null);
              }}
            />
          ) : null}
        </>
      )}

      {showSettings && currentSection && (
        <SectionSettingsModal
          section={currentSection}
          allSections={sections}
          onClose={() => setShowSettings(false)}
          onSave={(section) => {
            setSections(prev => prev.map(s => s.id === section.id ? section : s));
            updateSectionInBackend(section);
            setShowSettings(false);
          }}
        />
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