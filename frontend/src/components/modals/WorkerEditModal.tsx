// frontend/src/components/modals/WorkerEditModal.tsx - 원래 레이아웃 복원 + 연결 노드 패널 + AI 모델 선택 + Tasks 탭 (개선된 UI)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Play, Database, Clock, Award, Loader, X, Pencil, FileText, FileInput, FileOutput, Plus, Trash2, GripVertical, Lock, Circle, Triangle, Target, FileJson, CheckCircle } from 'lucide-react';
import { Node, Section, Version, TaskItem } from '../../types';
import { apiClient } from '../../api/client';
import { CodeEditor } from '../CodeEditor';
import { AIModelSelector } from '../AIModelSelector';

interface WorkerEditModalProps {
  node: Node;
  section: Section;
  allSections: Section[];
  onClose: () => void;
  onSave: (node: Node) => void;
  onUpdate?: (node: Node) => void;
}

// 실행 로그 타입 추가
interface ExecutionLog {
  timestamp: string;
  type: 'start' | 'ai_request' | 'ai_response' | 'complete' | 'error';
  message: string;
  details?: any;
}

export const WorkerEditModal: React.FC<WorkerEditModalProps> = ({
  node,
  section,
  allSections,
  onClose,
  onSave,
  onUpdate
}) => {
  const [editedNode, setEditedNode] = useState(node);
  const [selectedInput, setSelectedInput] = useState<string>(node.connectedFrom?.[0] || '');
  const [connectedNodeData, setConnectedNodeData] = useState<any>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeTab, setActiveTab] = useState<'code' | 'tasks' | 'history'>('code');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; output?: any; error?: string } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(editedNode.label);
  const [showJsonViewer, setShowJsonViewer] = useState(false);
  const [selectedNodeForEdit, setSelectedNodeForEdit] = useState<Node | null>(null);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [lastExecutionTime, setLastExecutionTime] = useState<string | null>(null);
  
  // Tasks 관련 상태
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    // 기본 AI 점수 50점으로 초기화, taskStatus가 없으면 'editable'로 설정
    return (editedNode.tasks || []).map(task => ({
      ...task,
      aiScore: task.aiScore ?? 50,
      taskStatus: task.taskStatus || 'editable'  // 기본값 'editable' 추가
    }));
  });
  const [draggedTask, setDraggedTask] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<number | null>(null);
  const [isDraggingHandle, setIsDraggingHandle] = useState<boolean>(false);
  
  // Purpose와 Output Format 상태
  const [purpose, setPurpose] = useState<string>(editedNode.purpose || '');
  const [outputFormat, setOutputFormat] = useState<string>(editedNode.outputFormat || '');
  
  // Task 자동 저장을 위한 ref
  const taskSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // WebSocket handler 등록
  useEffect(() => {
    const handleWebSocketMessage = (event: any) => {
      const data = event.detail;
      if (data.nodeId !== node.id) return;
      
      switch (data.type) {
        case 'node_execution_start':
          addExecutionLog('start', '🚀 Code execution started');
          break;
        case 'progress':
          if (data.progress === 0.2) {
            addExecutionLog('ai_request', '📤 Sending request to AI model...');
          } else if (data.progress === 0.6) {
            addExecutionLog('ai_response', '📥 Receiving response from AI model...');
          }
          break;
        case 'node_output_updated':
          addExecutionLog('complete', '✅ Output successfully updated', data.output);
          setLastExecutionTime(new Date().toISOString());
          break;
        case 'node_execution_error':
          addExecutionLog('error', `❌ Execution failed: ${data.error}`);
          break;
      }
    };
    
    window.addEventListener('websocket_message', handleWebSocketMessage);
    return () => {
      window.removeEventListener('websocket_message', handleWebSocketMessage);
    };
  }, [node.id]);

  const addExecutionLog = (type: ExecutionLog['type'], message: string, details?: any) => {
    setExecutionLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    }]);
  };

  useEffect(() => {
    // Load connected node data
    if (selectedInput || node.connectedFrom?.[0]) {
      const inputId = selectedInput || node.connectedFrom?.[0];
      const inputNode = section.nodes.find(n => n.id === inputId);
      
      if (inputNode?.output) {
        setConnectedNodeData(inputNode.output);
      }
    }
  }, [selectedInput, node.connectedFrom, section]);

  useEffect(() => {
    // Load saved versions (if API endpoint exists)
    apiClient.getVersions(node.id)
      .then(res => setVersions(res.data))
      .catch(() => {
        // Silently fail if endpoint doesn't exist yet
        setVersions([]);
      });
  }, [node.id]);

  // Task 자동 저장 함수
  const autoSaveTasks = useCallback((updatedTasks: TaskItem[], updatedPurpose?: string, updatedOutputFormat?: string) => {
    // 이전 타임아웃 취소
    if (taskSaveTimeoutRef.current) {
      clearTimeout(taskSaveTimeoutRef.current);
    }

    // 300ms 후에 저장 (디바운스)
    taskSaveTimeoutRef.current = setTimeout(() => {
      const updatedNode = { 
        ...editedNode, 
        tasks: updatedTasks,
        purpose: updatedPurpose !== undefined ? updatedPurpose : purpose,
        outputFormat: updatedOutputFormat !== undefined ? updatedOutputFormat : outputFormat
      };
      if (onUpdate) {
        onUpdate(updatedNode);
      } else {
        onSave(updatedNode);
      }
      console.log('Node data auto-saved');
    }, 300);
  }, [editedNode, onUpdate, onSave, purpose, outputFormat]);

  // 컴포넌트 언마운트 시 타임아웃 정리
  useEffect(() => {
    return () => {
      if (taskSaveTimeoutRef.current) {
        clearTimeout(taskSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = () => {
    // Code 저장 시에만 사용
    onSave({ 
      ...editedNode, 
      tasks,
      purpose,
      outputFormat
    });
    onClose();
  };

  const handleRename = () => {
    setEditedNode({ ...editedNode, label: tempName });
    setIsEditingName(false);
  };

  const handleCancelRename = () => {
    setTempName(editedNode.label);
    setIsEditingName(false);
  };

  const handleModelChange = (model: string, lmStudioUrl?: string, connectionId?: string) => {
    const updatedNode = { 
      ...editedNode, 
      model,
      lmStudioUrl,
      lmStudioConnectionId: connectionId
    };
    setEditedNode(updatedNode);
    
    // 모델 변경 시 자동 저장
    const nodeToSave = { 
      ...updatedNode, 
      tasks, 
      purpose,
      outputFormat
    };
    if (onUpdate) {
      onUpdate(nodeToSave);
    } else {
      onSave(nodeToSave);
    }
    console.log('Model settings auto-saved');
  };

  const handlePurposeChange = (newPurpose: string) => {
    setPurpose(newPurpose);
    autoSaveTasks(tasks, newPurpose, undefined);
  };

  const handleOutputFormatChange = (newFormat: string) => {
    setOutputFormat(newFormat);
    autoSaveTasks(tasks, undefined, newFormat);
  };

  const executeCode = async () => {
    setIsExecuting(true);
    setExecutionResult(null);
    setExecutionLogs([]); // 이전 로그 초기화
    
    try {
      // Get connected outputs for execution
      const connectedOutputs: any = {};
      if (node.connectedFrom) {
        for (const connId of node.connectedFrom) {
          const connNode = section.nodes.find(n => n.id === connId);
          if (connNode?.output) {
            connectedOutputs[connNode.label] = connNode.output;
          }
        }
      }

      addExecutionLog('start', '🚀 Starting code execution...');

      const response = await apiClient.executeNode(
        node.id,
        section.id,
        editedNode.code || '',
        connectedOutputs
      );
      
      if (response.data.status === 'started') {
        setTimeout(() => {
          setIsExecuting(false);
          setExecutionResult({
            success: true,
            output: "Code execution started. Check the output panel for results."
          });
        }, 1000);
      }
    } catch (error: any) {
      console.error('Execution failed:', error);
      setIsExecuting(false);
      setExecutionResult({
        success: false,
        error: error.response?.data?.detail || error.message || 'Execution failed'
      });
      addExecutionLog('error', `❌ ${error.response?.data?.detail || error.message || 'Execution failed'}`);
    }
  };

  const restoreVersion = async (versionId: string) => {
    try {
      await apiClient.restoreVersion(node.id, versionId);
      alert('Version restored successfully!');
      onClose();
    } catch (error) {
      console.error('Failed to restore version:', error);
      alert('Failed to restore version');
    }
  };

  const getDefaultCode = () => {
    return `# ${node.label} Implementation
# Access input data via 'inputs' variable or get_connected_outputs()
# Set results in 'output' variable
# AI model is available via: model_name = "${editedNode.model || 'none'}"

import json

# Get connected outputs
data = get_connected_outputs()

# Get AI model configuration
model_name = "${editedNode.model || 'none'}"
lm_studio_url = "${editedNode.lmStudioUrl || ''}"

# Get current node information
# current_node contains all settings for this node including:
# - id, type, label
# - purpose: the node's purpose
# - outputFormat: output format description
# - tasks: list of detailed tasks
# - model: AI model configuration
print("Current node:", json.dumps(current_node, indent=2))

# Get node purpose (what this node should accomplish)
node_purpose = """${purpose || 'No purpose defined'}"""

# Get expected output format description
output_format_description = """${outputFormat || 'No output format defined'}"""

# Access tasks if needed
tasks = current_node.get('tasks', [])
for task in tasks:
    print(f"Task: {task['text']} - Status: {task['status']}")

# Your processing logic here
# Use the output_format_description to guide how you structure the output
output = {
    "result": "processed data",
    "status": "success",
    "model_used": model_name
}`;
  };

  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
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

  // 연결된 노드들 가져오기
  const connectedFromNodes = (node.connectedFrom?.map(id => section.nodes.find(n => n.id === id)) || [])
    .filter((n): n is Node => n !== undefined);
  const connectedToNodes = (node.connectedTo?.map(id => section.nodes.find(n => n.id === id)) || [])
    .filter((n): n is Node => n !== undefined);

  const handleNodeClick = (clickedNode: Node) => {
    setSelectedNodeForEdit(clickedNode);
  };

  // Tasks 관련 함수들
  const handleAddTask = () => {
    const newTask: TaskItem = {
      id: `task-${Date.now()}`,
      text: 'Enter task description',
      status: 'pending',
      taskStatus: 'editable',
      aiScore: 50 // 기본값 50점
    };
    const updatedTasks = [...tasks, newTask];
    setTasks(updatedTasks);
    autoSaveTasks(updatedTasks);
  };

  const handleDeleteTask = (taskId: string) => {
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    setTasks(updatedTasks);
    autoSaveTasks(updatedTasks);
  };

  const handleTaskStatusToggle = (taskId: string) => {
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        // 상태 순환: editable -> low_priority -> locked -> editable
        const currentStatus = t.taskStatus || 'editable';
        let newStatus: 'locked' | 'editable' | 'low_priority' = 'editable';
        
        if (currentStatus === 'editable') {
          newStatus = 'low_priority';
        } else if (currentStatus === 'low_priority') {
          newStatus = 'locked';
        } else {
          newStatus = 'editable';
        }
        
        return { ...t, taskStatus: newStatus };
      }
      return t;
    });
    setTasks(updatedTasks);
    autoSaveTasks(updatedTasks);
  };

  const handleTaskTextChange = (taskId: string, newText: string) => {
    const updatedTasks = tasks.map(t => 
      t.id === taskId ? { ...t, text: newText } : t
    );
    setTasks(updatedTasks);
    autoSaveTasks(updatedTasks);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedTask(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    // 요소의 중간점을 기준으로 위/아래 결정
    if (y < height / 2) {
      setDropPosition(index);
    } else {
      setDropPosition(index + 1);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 자식 요소로 이동하는 경우가 아닐 때만 dropPosition 제거
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDropPosition(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedTask === null || dropPosition === null) return;

    const newTasks = [...tasks];
    const draggedItem = newTasks[draggedTask];
    
    // Remove from old position
    newTasks.splice(draggedTask, 1);
    
    // Insert at new position
    let insertIndex = dropPosition;
    if (draggedTask < dropPosition) {
      insertIndex -= 1;
    }
    newTasks.splice(insertIndex, 0, draggedItem);
    
    setTasks(newTasks);
    autoSaveTasks(newTasks);
    setDraggedTask(null);
    setDropPosition(null);
    setIsDraggingHandle(false);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDropPosition(null);
    setIsDraggingHandle(false);
  };

  const getTaskStatusIcon = (status?: 'locked' | 'editable' | 'low_priority') => {
    switch (status) {
      case 'locked':
        return <Lock className="w-4 h-4 text-slate-500" />;
      case 'editable':
        return <Circle className="w-4 h-4 text-blue-500" />;
      case 'low_priority':
        return <Triangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTaskStatusTooltip = (status?: 'locked' | 'editable' | 'low_priority') => {
    switch (status) {
      case 'locked':
        return 'Locked (Click to make editable)';
      case 'editable':
        return 'Editable (Click to set low priority)';
      case 'low_priority':
        return 'Low Priority (Click to lock)';
      default:
        return 'Editable';
    }
  };

  const getScoreGradient = (score: number = 50) => {
    // 점수를 0-100 범위로 제한
    const clampedScore = Math.max(0, Math.min(100, score));
    
    // 모던한 색상: 회색(0) -> 파랑(50) -> 보라(100)
    let r, g, b;
    if (clampedScore <= 50) {
      // 회색 -> 파랑
      const ratio = clampedScore / 50;
      r = Math.round(156 - (156 - 59) * ratio);  // 156 -> 59
      g = Math.round(163 - (163 - 130) * ratio); // 163 -> 130
      b = Math.round(175 + (246 - 175) * ratio); // 175 -> 246
    } else {
      // 파랑 -> 보라
      const ratio = (clampedScore - 50) / 50;
      r = Math.round(59 + (139 - 59) * ratio);   // 59 -> 139
      g = Math.round(130 - (130 - 92) * ratio);  // 130 -> 92
      b = Math.round(246 - (246 - 211) * ratio); // 246 -> 211
    }
    
    const color = `rgba(${r}, ${g}, ${b}, 0.1)`;
    return `linear-gradient(to right, ${color} ${clampedScore}%, rgba(${r}, ${g}, ${b}, 0.02) ${clampedScore}%)`;
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg w-[98%] h-[95%] flex flex-col">
          <div className="p-4 border-b flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-2xl">👷</span>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="px-2 py-1 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename();
                      if (e.key === 'Escape') handleCancelRename();
                    }}
                  />
                  <button
                    onClick={handleRename}
                    className="px-3 py-1 bg-indigo-500 text-white rounded-md text-sm hover:bg-indigo-600 transition-colors"
                  >
                    Rename
                  </button>
                  <button
                    onClick={handleCancelRename}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <h2 className="text-xl font-bold group flex items-center gap-1">
                  <span>Worker - </span>
                  <span 
                    onClick={() => {
                      setIsEditingName(true);
                      setTempName(editedNode.label);
                    }}
                    className="cursor-pointer hover:text-indigo-600"
                  >
                    {editedNode.label}
                  </span>
                  <button
                    onClick={() => {
                      setIsEditingName(true);
                      setTempName(editedNode.label);
                    }}
                    className="invisible group-hover:visible p-1 hover:bg-gray-100 rounded-md transition-all"
                  >
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </button>
                </h2>
              )}
            </div>
            <button onClick={onClose} className="text-2xl hover:text-gray-600">&times;</button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left Side - Connected From Nodes */}
            <div className="w-16 border-r bg-gray-50 p-2 flex flex-col gap-2 items-center overflow-y-auto">
              <div className="text-xs text-gray-500 mb-2 -rotate-90 whitespace-nowrap mt-8">From</div>
              {connectedFromNodes.map((connNode) => (
                <div
                  key={connNode.id}
                  className="group cursor-pointer"
                  onClick={() => handleNodeClick(connNode)}
                  title={connNode.label}
                >
                  <div className="w-12 h-12 rounded-lg bg-white border-2 border-gray-300 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:border-indigo-500 group-hover:shadow-lg">
                    {getNodeIcon(connNode.type)}
                  </div>
                  <div className="text-xs text-center mt-1 truncate w-12 opacity-0 group-hover:opacity-100 transition-opacity">
                    {connNode.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex">
              {/* Left Panel - Input */}
              <div className="w-1/4 border-r p-4 flex flex-col">
                <h3 className="font-semibold mb-2">Input Source</h3>
                <select
                  value={selectedInput}
                  onChange={(e) => setSelectedInput(e.target.value)}
                  className="w-full border border-gray-200 rounded-md p-2 mb-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                >
                  <option value="">No input</option>
                  {node.connectedFrom?.map(connNodeId => {
                    const connNode = section.nodes.find(n => n.id === connNodeId);
                    if (!connNode) return null;
                    return (
                      <option key={connNode.id} value={connNode.id}>
                        {connNode.label} ({connNode.type})
                      </option>
                    );
                  })}
                </select>

                {connectedNodeData && (
                  <div className="bg-gray-50 rounded-md p-3 flex-1 overflow-y-auto">
                    <h4 className="font-medium mb-2">Input Data:</h4>
                    <pre className="text-xs overflow-x-auto">
                      {JSON.stringify(connectedNodeData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Center Panel - Code Editor with tabs */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex border-b flex-shrink-0">
                  <button
                    onClick={() => setActiveTab('code')}
                    className={`px-4 py-2 font-medium transition-all ${activeTab === 'code' ? 'bg-gray-50 border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Code
                  </button>
                  <button
                    onClick={() => setActiveTab('tasks')}
                    className={`px-4 py-2 font-medium transition-all ${activeTab === 'tasks' ? 'bg-gray-50 border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Tasks
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-2 font-medium transition-all ${activeTab === 'history' ? 'bg-gray-50 border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Activity Log
                  </button>
                </div>
                
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                  {activeTab === 'code' ? (
                    <div className="flex-1 min-h-0">
                      <CodeEditor
                        value={editedNode.code || getDefaultCode()}
                        onChange={(code) => setEditedNode({ ...editedNode, code })}
                      />
                    </div>
                  ) : activeTab === 'tasks' ? (
                    <div className="flex-1 overflow-y-auto min-h-0">
                      <div className="p-6">
                        {/* Task Outline Section */}
                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-6 mb-6 border border-indigo-200">
                          <h3 className="font-bold text-lg mb-4 text-indigo-900 flex items-center gap-2">
                            <Target className="w-5 h-5" />
                            Task Outline
                          </h3>
                          
                          {/* Purpose Field */}
                          <div className="mb-4">
                            <label className="block text-sm font-semibold text-indigo-800 mb-2">
                              Node Purpose
                              <span className="ml-2 text-xs font-normal text-gray-600">
                                (What this node should accomplish)
                              </span>
                            </label>
                            <textarea
                              value={purpose}
                              onChange={(e) => handlePurposeChange(e.target.value)}
                              placeholder="Describe the main purpose of this worker node..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                              rows={3}
                            />
                          </div>
                          
                          {/* Output Format Field */}
                          <div>
                            <label className="block text-sm font-semibold text-indigo-800 mb-2 flex items-center gap-2">
                              <FileJson className="w-4 h-4" />
                              Output Format
                              <span className="ml-2 text-xs font-normal text-gray-600">
                                (Describe the expected output format)
                              </span>
                            </label>
                            <textarea
                              value={outputFormat}
                              onChange={(e) => handleOutputFormatChange(e.target.value)}
                              placeholder="Describe the output format for the AI to generate...&#10;Example: Create a JSON object with character names as keys and their descriptions as values"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                              rows={4}
                            />
                          </div>
                        </div>

                        {/* Detailed Tasks Section */}
                        <div>
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                              <FileText className="w-5 h-5" />
                              Detailed Tasks
                              <span className="text-xs font-normal text-gray-500">
                                (Step-by-step breakdown)
                              </span>
                            </h3>
                            <button
                              onClick={handleAddTask}
                              className="flex items-center gap-2 px-3 py-1 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors text-sm"
                            >
                              <Plus className="w-4 h-4" />
                              Add Task
                            </button>
                          </div>
                          
                          <div 
                            className="space-y-2 relative"
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                          >
                            {tasks.length === 0 ? (
                              <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                <p className="text-sm">No detailed tasks yet</p>
                                <p className="text-xs mt-1">Click "Add Task" to create one</p>
                              </div>
                            ) : (
                              <>
                                {/* Drop indicator at the top */}
                                {dropPosition === 0 && (
                                  <div className="h-0.5 bg-indigo-500 rounded-full -my-1 relative z-20">
                                    <div className="absolute -top-1 -left-1 w-2 h-2 bg-indigo-500 rounded-full"></div>
                                  </div>
                                )}
                                
                                {tasks.map((task, index) => (
                                  <React.Fragment key={task.id}>
                                    <div
                                      onDragOver={(e) => handleDragOver(e, index)}
                                      onDragEnd={handleDragEnd}
                                      className={`
                                        relative flex items-center gap-2 p-2.5 bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow
                                        ${task.taskStatus === 'locked' ? 'opacity-50' : ''}
                                        ${task.taskStatus === 'low_priority' ? 'opacity-70' : ''}
                                        ${draggedTask === index ? 'opacity-50' : ''}
                                        border-gray-100
                                      `}
                                      style={{
                                        background: getScoreGradient(task.aiScore)
                                      }}
                                    >
                                      {/* Drag Handle */}
                                      <div 
                                        draggable={task.taskStatus !== 'locked'}
                                        onDragStart={(e) => {
                                          setIsDraggingHandle(true);
                                          handleDragStart(e, index);
                                        }}
                                        className={`flex-shrink-0 cursor-move ${task.taskStatus === 'locked' ? 'invisible' : ''}`}
                                      >
                                        <GripVertical className="w-3 h-3 text-gray-300" />
                                      </div>
                                      
                                      {/* Task Status Toggle */}
                                      <button
                                        onClick={() => handleTaskStatusToggle(task.id)}
                                        className="p-1.5 rounded-md hover:bg-gray-100 transition-all flex-shrink-0"
                                        title={getTaskStatusTooltip(task.taskStatus)}
                                      >
                                        {getTaskStatusIcon(task.taskStatus)}
                                      </button>
                                      
                                      {/* Task Text */}
                                      <input
                                        type="text"
                                        value={task.text}
                                        onChange={(e) => handleTaskTextChange(task.id, e.target.value)}
                                        disabled={task.taskStatus === 'locked'}
                                        className={`
                                          flex-1 px-2 py-1 bg-transparent border-none outline-none text-gray-700 placeholder-gray-400
                                          ${task.taskStatus === 'locked' ? 'cursor-not-allowed' : 'cursor-text'}
                                          focus:bg-white focus:bg-opacity-60 rounded transition-all select-text
                                        `}
                                        placeholder="Enter task description"
                                        style={{ userSelect: 'text' }}
                                      />
                                      
                                      {/* Delete Button */}
                                      <button
                                        onClick={() => handleDeleteTask(task.id)}
                                        className="p-1.5 rounded-md hover:bg-gray-50 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
                                        title="Delete task"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                    
                                    {/* Drop indicator between tasks */}
                                    {dropPosition === index + 1 && index !== tasks.length - 1 && (
                                      <div className="h-0.5 bg-indigo-500 rounded-full -my-1 relative z-20">
                                        <div className="absolute -top-1 -left-1 w-2 h-2 bg-indigo-500 rounded-full"></div>
                                      </div>
                                    )}
                                  </React.Fragment>
                                ))}
                                
                                {/* Drop indicator at the bottom */}
                                {dropPosition === tasks.length && tasks.length > 0 && (
                                  <div className="h-0.5 bg-indigo-500 rounded-full -my-1 relative z-20">
                                    <div className="absolute -top-1 -left-1 w-2 h-2 bg-indigo-500 rounded-full"></div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto min-h-0 p-4">
                      <h3 className="font-semibold mb-3">Activity Log</h3>
                      <div className="space-y-2">
                        {executionLogs.length === 0 && editedNode.updateHistory?.length === 0 ? (
                          <div className="text-gray-500 text-center py-8">
                            No activity recorded yet
                          </div>
                        ) : (
                          <>
                            {/* Recent execution logs */}
                            {executionLogs.map((log, idx) => (
                              <div key={`exec-${idx}`} className={`
                                border rounded-md p-3
                                ${log.type === 'error' ? 'border-red-200 bg-red-50' : 
                                  log.type === 'complete' ? 'border-green-200 bg-green-50' : 
                                  'border-gray-200 bg-gray-50'}
                              `}>
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="text-sm text-gray-600">
                                      {new Date(log.timestamp).toLocaleString()}
                                    </div>
                                    <div className="font-medium mt-1">
                                      {log.message}
                                    </div>
                                    {log.details && (
                                      <pre className="text-xs mt-2 p-2 bg-white rounded overflow-x-auto">
                                        {typeof log.details === 'string' 
                                          ? log.details 
                                          : JSON.stringify(log.details, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                            
                            {/* Historical activity */}
                            {editedNode.updateHistory?.map((update, idx) => (
                              <div key={`hist-${idx}`} className="border border-gray-200 rounded-md p-3">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <div className="text-sm text-gray-600">
                                      {new Date(update.timestamp).toLocaleString()}
                                    </div>
                                    <div className="font-medium">
                                      Type: {update.type}
                                      {update.by && ` by ${update.by}`}
                                    </div>
                                    {update.score !== undefined && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <Award className="w-4 h-4 text-amber-500" />
                                        <span className="text-sm">AI Score: {update.score}/100</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Execution Result */}
                {executionResult && (
                  <div className={`p-3 border-t ${executionResult.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        {executionResult.success ? (
                          <div className="text-emerald-700">
                            <strong>Success:</strong> {typeof executionResult.output === 'string' ? executionResult.output : JSON.stringify(executionResult.output)}
                          </div>
                        ) : (
                          <div className="text-red-700">
                            <strong>Error:</strong> {executionResult.error}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setExecutionResult(null)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
                
                {/* AI Model Selection */}
                <div className="p-4 border-t bg-gray-50">
                  <AIModelSelector
                    value={editedNode.model || 'none'}
                    lmStudioUrl={editedNode.lmStudioUrl}
                    lmStudioConnectionId={editedNode.lmStudioConnectionId}
                    onChange={handleModelChange}
                  />
                </div>
                
                {/* Action Buttons - Save button only for code */}
                <div className="p-4 border-t flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-indigo-500 text-white rounded-md px-4 py-2 hover:bg-indigo-600 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Save Code
                  </button>
                  <button
                    onClick={executeCode}
                    disabled={isExecuting}
                    className={`flex items-center gap-2 rounded-md px-4 py-2 transition-colors ${
                      isExecuting 
                        ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                        : 'bg-emerald-500 text-white hover:bg-emerald-600'
                    }`}
                  >
                    {isExecuting ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Run Code
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowJsonViewer(true)}
                    className="flex items-center gap-2 bg-slate-600 text-white rounded-md px-4 py-2 hover:bg-slate-700 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    View JSON
                  </button>
                  {editedNode.vectorDB && (
                    <button className="flex items-center gap-2 bg-purple-500 text-white rounded-md px-4 py-2 hover:bg-purple-600 transition-colors">
                      <Database className="w-4 h-4" />
                      Configure DB
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="ml-auto flex items-center gap-2 bg-gray-200 text-gray-700 rounded-md px-4 py-2 hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Right Panel - Output & History */}
              <div className="w-1/3 border-l flex flex-col">
                <div className="flex-1 p-4 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Output</h3>
                    {lastExecutionTime && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>Last run: {new Date(lastExecutionTime).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>
                  
                  {editedNode.output ? (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="mb-2 flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span>Output successfully generated</span>
                      </div>
                      <pre className="flex-1 bg-gray-50 rounded-md p-3 text-xs overflow-auto">
                        {JSON.stringify(editedNode.output, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-gray-500">No output yet</div>
                  )}
                  
                  {editedNode.aiScore && (
                    <div className="mt-4 p-3 bg-amber-50 rounded-md">
                      <div className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-amber-600" />
                        <span className="font-medium text-gray-700">AI Evaluation Score</span>
                      </div>
                      <div className="text-2xl font-bold text-amber-600 mt-1">
                        {editedNode.aiScore}/100
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Saved Versions */}
                <div className="border-t p-4">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Saved Versions
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {versions.length > 0 ? (
                      versions.map(v => (
                        <div key={v.id} className="border border-gray-200 rounded-md p-2 text-sm">
                          <div className="text-gray-600">{new Date(v.timestamp).toLocaleString()}</div>
                          <div className="flex justify-between items-center">
                            <span>Model: {v.metadata.modelVersion}</span>
                            <button 
                              onClick={() => restoreVersion(v.id)}
                              className="text-indigo-500 hover:text-indigo-700 hover:underline"
                            >
                              Restore
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-gray-500 text-sm">No saved versions available</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Connected To Nodes */}
            <div className="w-16 border-l bg-gray-50 p-2 flex flex-col gap-2 items-center overflow-y-auto">
              <div className="text-xs text-gray-500 mb-2 rotate-90 whitespace-nowrap mt-8">To</div>
              {connectedToNodes.map((connNode) => (
                <div
                  key={connNode.id}
                  className="group cursor-pointer"
                  onClick={() => handleNodeClick(connNode)}
                  title={connNode.label}
                >
                  <div className="w-12 h-12 rounded-lg bg-white border-2 border-gray-300 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:border-emerald-500 group-hover:shadow-lg">
                    {getNodeIcon(connNode.type)}
                  </div>
                  <div className="text-xs text-center mt-1 truncate w-12 opacity-0 group-hover:opacity-100 transition-opacity">
                    {connNode.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* JSON Viewer Modal */}
      {showJsonViewer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg w-[60%] max-w-3xl h-[95%] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                JSON Source - {editedNode.label}
              </h2>
              <button 
                onClick={() => setShowJsonViewer(false)} 
                className="text-2xl hover:text-gray-600"
              >&times;</button>
            </div>
            
            <div className="flex-1 p-4 overflow-auto">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm">
                {JSON.stringify({ 
                  ...editedNode, 
                  tasks,
                  purpose,
                  outputFormat
                }, null, 2)}
              </pre>
            </div>
            
            <div className="p-4 border-t flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify({ 
                    ...editedNode, 
                    tasks,
                    purpose,
                    outputFormat
                  }, null, 2));
                  alert('JSON copied to clipboard');
                }}
                className="flex-1 bg-indigo-500 text-white rounded-md px-4 py-2 hover:bg-indigo-600 transition-colors"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setShowJsonViewer(false)}
                className="flex-1 bg-gray-200 text-gray-700 rounded-md px-4 py-2 hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Node Edit Modal */}
      {selectedNodeForEdit && (
        (() => {
          const ModalComponent = selectedNodeForEdit.type === 'worker' ? WorkerEditModal :
                              (selectedNodeForEdit.type === 'supervisor' || selectedNodeForEdit.type === 'planner') ? 
                              require('./SupervisorEditModal').SupervisorEditModal :
                              (selectedNodeForEdit.type === 'input' || selectedNodeForEdit.type === 'output') ?
                              require('./IOConfigModal').IOConfigModal : null;

          if (ModalComponent) {
            return (
              <ModalComponent
                node={selectedNodeForEdit}
                section={section}
                allSections={allSections}
                onClose={() => setSelectedNodeForEdit(null)}
                onSave={(updatedNode: Node) => {
                  // 현재 모달을 저장하고
                  onSave({ 
                    ...editedNode, 
                    tasks,
                    purpose,
                    outputFormat
                  });
                  // 새로운 노드의 편집창 열기를 위해 잠시 후 처리
                  setSelectedNodeForEdit(null);
                  onClose();
                  // App.tsx에서 새로운 편집창을 열도록 전달
                  setTimeout(() => {
                    const event = new CustomEvent('openNodeEdit', { detail: updatedNode });
                    window.dispatchEvent(event);
                  }, 100);
                }}
                onUpdate={onUpdate}
              />
            );
          }
          return null;
        })()
      )}
    </>
  );
};