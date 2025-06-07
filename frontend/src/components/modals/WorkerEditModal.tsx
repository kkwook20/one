// frontend/src/components/modals/WorkerEditModal.tsx - 정리된 버전
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Play, Database, Clock, Award, Loader, X, Pencil, FileText, FileInput, FileOutput, Plus, Trash2, GripVertical, Lock, Circle, Triangle, Target, FileJson, CheckCircle, Square } from 'lucide-react';
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
  type: 'start' | 'ai_request' | 'ai_response' | 'complete' | 'error' | 'info';
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
  const [editedNode, setEditedNode] = useState<Node & { executionHistory?: ExecutionLog[]; currentExecutionStartTime?: string | null }>({
    ...node,
    executionHistory: (node as any).executionHistory || [],
    currentExecutionStartTime: (node as any).currentExecutionStartTime || null
  });
  const [selectedInput, setSelectedInput] = useState<string>(node.connectedFrom?.[0] || '');
  const [connectedNodeData, setConnectedNodeData] = useState<any>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeTab, setActiveTab] = useState<'code' | 'tasks' | 'history'>('code');
  
  // 노드가 실행 중인지 확인하고 초기 상태 설정
  const [isExecuting, setIsExecuting] = useState(node.isRunning || false);
  const isExecutingRef = useRef(node.isRunning || false);
  
  const executionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastStreamLogTimeRef = useRef<number>(0);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; output?: any; error?: string } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(editedNode.label);
  const [showJsonViewer, setShowJsonViewer] = useState(false);
  const [selectedNodeForEdit, setSelectedNodeForEdit] = useState<Node | null>(null);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>(() => {
    // 노드에 저장된 실행 이력 불러오기
    return (node as any).executionHistory || editedNode.executionHistory || [];
  });
  const [lastExecutionTime, setLastExecutionTime] = useState<string | null>(null);
  const [lastOutputUpdateTime, setLastOutputUpdateTime] = useState<string | null>(
    editedNode.output ? new Date().toISOString() : null
  );
  const [currentExecutionStartTime, setCurrentExecutionStartTime] = useState<string | null>(
    (node as any).currentExecutionStartTime || null
  );
  const [executionElapsedTime, setExecutionElapsedTime] = useState<number>(0);
  const messageCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
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
  
  // Purpose와 Output Format 상태
  const [purpose, setPurpose] = useState<string>(editedNode.purpose || '');
  const [outputFormat, setOutputFormat] = useState<string>(editedNode.outputFormat || '');
  
  // Task 자동 저장을 위한 ref
  const taskSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const addExecutionLog = useCallback((type: ExecutionLog['type'], message: string, details?: any) => {
    const newLog: ExecutionLog = {
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    };
    
    setExecutionLogs(prev => {
      // 최대 50개의 로그만 유지
      const updatedLogs = [...prev, newLog];
      if (updatedLogs.length > 50) {
        return updatedLogs.slice(-50);
      }
      return updatedLogs;
    });
    
    // 실행 로그를 노드의 executionHistory에도 저장
    setEditedNode(prev => {
      const updatedNode = {
        ...prev,
        executionHistory: [
          ...(prev.executionHistory || []),
          newLog
        ].slice(-50) // 최대 50개만 유지
      };
      
      // 자동 저장 (중요한 로그만)
      if (type === 'complete' || type === 'error') {
        if (onUpdate) {
          onUpdate(updatedNode as Node);
        }
      }
      
      return updatedNode;
    });
  }, [onUpdate]);

  const handleClearLogs = () => {
    setExecutionLogs([]);
    // editedNode의 executionHistory도 초기화
    setEditedNode(prev => ({
      ...prev,
      executionHistory: []
    }));
  };

  const resetExecutionTimeout = useCallback((timeoutDuration: number = 300000) => {
    // 이전 타임아웃 취소
    if (executionTimeoutRef.current) {
      clearTimeout(executionTimeoutRef.current);
    }
    
    // 새로운 타임아웃 설정 (기본 5분)
    executionTimeoutRef.current = setTimeout(() => {
      if (isExecutingRef.current) {
        setIsExecuting(false);
        isExecutingRef.current = false;
        setCurrentExecutionStartTime(null);
        
        // interval 정리
        if (messageCheckIntervalRef.current) {
          clearInterval(messageCheckIntervalRef.current);
          messageCheckIntervalRef.current = null;
        }
        
        setExecutionResult({
          success: false,
          error: `No response from server for ${timeoutDuration / 1000} seconds`
        });
        addExecutionLog('error', `❌ Timeout: No activity for ${timeoutDuration / 1000} seconds`);
        
        // 타임아웃 시 노드 실행 상태 해제
        setEditedNode(prev => {
          const stoppedNode = {
            ...prev,
            isRunning: false,
            currentExecutionStartTime: null
          };
          
          // 원본 node 객체도 업데이트
          node.isRunning = false;
          (node as any).currentExecutionStartTime = null;
          
          if (onUpdate) {
            onUpdate(stoppedNode);
          }
          return stoppedNode;
        });
      }
    }, timeoutDuration);
  }, [addExecutionLog, node, onUpdate, messageCheckIntervalRef]);

  // 실행 상태 초기화를 위한 ref
  const hasInitializedRef = useRef(false);
  
  // 컴포넌트 마운트 시 실행 상태 복원 (한 번만 실행)
  useEffect(() => {
    // 이미 초기화했으면 다시 실행하지 않음
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    
    // 노드가 실행 중이라면
    if (node.isRunning) {
      // 실행 시작 시간 확인
      const startTime = (node as any).currentExecutionStartTime;
      
      // 실행 시작한지 10분이 지났으면 실행 상태 해제
      if (startTime) {
        const elapsedMinutes = (Date.now() - new Date(startTime).getTime()) / 1000 / 60;
        if (elapsedMinutes > 10) {
          // 10분이 지났으면 자동으로 실행 상태 해제
          const clearedNode = {
            ...node,
            isRunning: false,
            currentExecutionStartTime: null
          };
          setEditedNode(clearedNode);
          
          // 원본 node 객체도 업데이트
          node.isRunning = false;
          (node as any).currentExecutionStartTime = null;
          
          if (onUpdate) {
            onUpdate(clearedNode);
          }
          setIsExecuting(false);
          isExecutingRef.current = false;
          
          // 로그 추가
          setTimeout(() => {
            addExecutionLog('error', '❌ Execution timeout - cleared stale execution state');
          }, 100);
          return;
        }
      }
      
      setIsExecuting(true);
      isExecutingRef.current = true;
      
      // 실행 시작 시간 복원
      if (startTime) {
        setCurrentExecutionStartTime(startTime);
      } else {
        // 실행 중이지만 시작 시간이 없으면 현재 시간으로 설정
        setCurrentExecutionStartTime(new Date().toISOString());
      }
      
      // 실행 중임을 Activity Log에 표시
      setTimeout(() => {
        addExecutionLog('info', '⏳ Execution in progress (resumed from workspace)');
      }, 100);
      
      // 타임아웃 재설정 - 짧게 설정 (1분)
      setTimeout(() => {
        resetExecutionTimeout(60000); // 1분 후 타임아웃
      }, 200);
    }
    
    // 저장된 실행 로그가 있다면 복원
    if ((node as any).executionHistory && (node as any).executionHistory.length > 0) {
      setExecutionLogs((node as any).executionHistory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 의도적으로 빈 의존성 배열 사용 - 마운트 시 한 번만 실행

  // WebSocket handler 등록
  useEffect(() => {
    const handleWebSocketMessage = (event: any) => {
      const data = event.detail;
      
      // 중요한 메시지만 로깅 (디버깅용)
      if (data.type === 'node_output_updated' || data.type === 'node_execution_complete' || 
          (data.type && data.output !== undefined)) {
        console.log('[WebSocket] Important message:', data.type, 'nodeId:', data.nodeId);
      }
      
      // nodeId 체크를 더 유연하게
      if (data.nodeId && data.nodeId !== node.id) {
        // output이 있고 실행 중이면 예외 처리
        if (isExecutingRef.current && (data.output !== undefined || data.type?.includes('complete') || data.type?.includes('done'))) {
          // nodeId가 다르더라도 output이 있으면 처리 계속
        } else {
          return;
        }
      }
      
      // output이 포함된 메시지 처리
      if (isExecutingRef.current && data.output !== undefined) {
        // nodeId가 없거나 일치하면 처리
        if (!data.nodeId || data.nodeId === node.id) {
          const updatedNodeWithOutput = { 
            ...editedNode, 
            output: data.output,
            isRunning: false,
            currentExecutionStartTime: null
          };
          setEditedNode(updatedNodeWithOutput);
          setLastOutputUpdateTime(new Date().toISOString());
          setLastExecutionTime(new Date().toISOString());
          
          // 원본 node 객체도 업데이트
          node.isRunning = false;
          (node as any).currentExecutionStartTime = null;
          node.output = data.output;
          
          if (onUpdate) {
            onUpdate(updatedNodeWithOutput);
          }
          
          // 중복 로그 제거 - 한 번만 완료 메시지 표시
          if (isExecutingRef.current) {
            addExecutionLog('complete', '✅ Execution completed successfully');
          }
          
          // 실행 종료
          setTimeout(() => {
            setIsExecuting(false);
            isExecutingRef.current = false;
            setCurrentExecutionStartTime(null);
            if (executionTimeoutRef.current) {
              clearTimeout(executionTimeoutRef.current);
            }
            if (messageCheckIntervalRef.current) {
              clearInterval(messageCheckIntervalRef.current);
              messageCheckIntervalRef.current = null;
            }
            setExecutionResult({
              success: true,
              output: "Output received successfully"
            });
          }, 500);
          
          return; // 더 이상 처리하지 않음
        }
      }
      
      // 실행 중일 때 완료 관련 메시지 확인
      if (isExecutingRef.current && data.type) {
        const completionTypes = ['complete', 'done', 'finished', 'success', 'end', 'ai_complete', 'ai_done'];
        const isCompletionMessage = completionTypes.some(type => 
          data.type.toLowerCase().includes(type.toLowerCase())
        );
        
        if (isCompletionMessage) {
          // nodeId가 없거나 일치하면 실행 종료 처리 - 로그는 생략
          if (!data.nodeId || data.nodeId === node.id) {
            // 로그 생략하고 바로 처리
          }
        }
      }
      
      switch (data.type) {
        case 'node_execution_start':
          setIsExecuting(true);
          isExecutingRef.current = true;
          resetExecutionTimeout(600000);
          addExecutionLog('start', '🚀 Code execution started');
          break;
          
        case 'progress':
          // AI 작업 진행 상황에 따라 다른 타임아웃 설정
          if (data.progress >= 0.3 && data.progress <= 0.7) {
            resetExecutionTimeout(600000);
          } else {
            resetExecutionTimeout(300000);
          }
          
          // 주요 진행 상황만 로그
          if (data.progress === 0.1) {
            addExecutionLog('start', '📋 Preparing execution environment...');
          } else if (data.progress === 0.3) {
            addExecutionLog('ai_request', '🤖 Sending prompt to AI model...');
            if (data.prompt_size) {
              addExecutionLog('info', '📊 Prompt size: ' + data.prompt_size);
            }
          } else if (data.progress === 0.5) {
            addExecutionLog('ai_response', '⏳ AI is processing your request...');
          } else if (data.progress === 0.7) {
            addExecutionLog('ai_response', '📥 Receiving AI response...');
          } else if (data.progress === 1.0) {
            addExecutionLog('complete', '✅ Processing complete');
            // Progress 1.0일 때도 실행 종료 처리
            setTimeout(() => {
              if (isExecutingRef.current) {
                setIsExecuting(false);
                isExecutingRef.current = false;
                setCurrentExecutionStartTime(null);
                if (executionTimeoutRef.current) {
                  clearTimeout(executionTimeoutRef.current);
                }
                
                // 노드 상태 업데이트
                const completedNode = {
                  ...editedNode,
                  isRunning: false,
                  currentExecutionStartTime: null
                };
                setEditedNode(completedNode);
                
                // 원본 node 객체도 업데이트
                node.isRunning = false;
                (node as any).currentExecutionStartTime = null;
                
                if (onUpdate) {
                  onUpdate(completedNode);
                }
              }
            }, 1000);
          }
          break;
          
        case 'ai_request':
          resetExecutionTimeout(600000);
          addExecutionLog('ai_request', `📤 ${data.message || 'Sending request to AI model'}`);
          break;
          
        case 'ai_response':
          resetExecutionTimeout(600000);
          addExecutionLog('ai_response', `📥 ${data.message || 'Received AI response'}`);
          break;
          
        case 'ai_complete':
        case 'ai_finished':
        case 'ai_done':
          // AI 완료 시 output이 업데이트되었는지 확인
          if (data.output !== undefined) {
            // output이 함께 전달된 경우 바로 업데이트
            const updatedNode = { 
              ...editedNode, 
              output: data.output,
              isRunning: false,
              currentExecutionStartTime: null
            };
            setEditedNode(updatedNode);
            setLastOutputUpdateTime(new Date().toISOString());
            setLastExecutionTime(new Date().toISOString());
            
            // 원본 node 객체도 업데이트
            node.isRunning = false;
            (node as any).currentExecutionStartTime = null;
            node.output = data.output;
            
            if (onUpdate) {
              onUpdate(updatedNode);
            }
            
            addExecutionLog('complete', '✅ AI processing completed successfully');
            setExecutionResult({
              success: true,
              output: "AI processing completed successfully"
            });
          } else if (isExecutingRef.current) {
            // output이 없는 경우에만 간단한 메시지
            addExecutionLog('complete', '✅ AI processing completed');
          }
          
          // 실행 종료 처리
          setTimeout(() => {
            if (isExecutingRef.current) {
              setIsExecuting(false);
              isExecutingRef.current = false;
              setCurrentExecutionStartTime(null);
              if (executionTimeoutRef.current) {
                clearTimeout(executionTimeoutRef.current);
              }
            }
          }, 500);
          break;
          
        case 'node_output_updated':
          // 타임아웃 취소
          if (executionTimeoutRef.current) {
            clearTimeout(executionTimeoutRef.current);
          }
          
          setLastExecutionTime(new Date().toISOString());
          setLastOutputUpdateTime(new Date().toISOString());
          
          // 노드 output 업데이트 및 isRunning을 false로 설정
          const updatedNode = { 
            ...editedNode, 
            output: data.output,
            isRunning: false,
            currentExecutionStartTime: null
          };
          setEditedNode(updatedNode);
          
          // 원본 node 객체도 업데이트
          node.isRunning = false;
          (node as any).currentExecutionStartTime = null;
          node.output = data.output;
          
          // 즉시 저장
          if (onUpdate) {
            onUpdate(updatedNode);
          } else {
            onSave(updatedNode);
          }
          
          // 한 번만 로그
          addExecutionLog('complete', '✅ Output successfully updated');
          
          // 실행 완료 처리
          setTimeout(() => {
            setIsExecuting(false);
            isExecutingRef.current = false;
            setCurrentExecutionStartTime(null);
            setExecutionResult({
              success: true,
              output: "Output successfully updated"
            });
          }, 100);
          break;
          
        case 'node_execution_error':
          // 타임아웃 취소
          if (executionTimeoutRef.current) {
            clearTimeout(executionTimeoutRef.current);
          }
          
          addExecutionLog('error', `❌ Execution failed: ${data.error}`);
          setIsExecuting(false);
          isExecutingRef.current = false;
          setCurrentExecutionStartTime(null);
          setExecutionResult({
            success: false,
            error: data.error
          });
          
          // 에러 시 실행 상태 해제
          const errorNode = {
            ...editedNode,
            isRunning: false,
            currentExecutionStartTime: null
          };
          setEditedNode(errorNode);
          
          // 원본 node 객체도 업데이트
          node.isRunning = false;
          (node as any).currentExecutionStartTime = null;
          
          if (onUpdate) {
            onUpdate(errorNode);
          }
          break;
          
        case 'node_execution_complete':
        case 'node_execution_end':
        case 'execution_end':
        case 'execution_complete':
        case 'done':
        case 'finished':
        case 'complete':
          // 다양한 완료 메시지 타입 처리 - 중복 방지
          if (executionTimeoutRef.current) {
            clearTimeout(executionTimeoutRef.current);
          }
          
          // 이미 완료 상태가 아닐 때만 로그 추가
          if (isExecutingRef.current) {
            addExecutionLog('complete', '✅ Execution completed');
            
            // 실행 상태 해제
            setIsExecuting(false);
            isExecutingRef.current = false;
            setCurrentExecutionStartTime(null);
            
            if (!executionResult) {
              setExecutionResult({
                success: true,
                output: "Execution completed successfully"
              });
            }
            
            // 완료 시 실행 상태 해제
            const completedNode = {
              ...editedNode,
              isRunning: false,
              currentExecutionStartTime: null
            };
            setEditedNode(completedNode);
            
            // 원본 node 객체도 업데이트
            node.isRunning = false;
            (node as any).currentExecutionStartTime = null;
            
            if (onUpdate) {
              onUpdate(completedNode);
            }
          }
          break;
          
        case 'ai_streaming':
          resetExecutionTimeout(600000);
          if (data.chunk) {
            const now = Date.now();
            if (!lastStreamLogTimeRef.current || now - lastStreamLogTimeRef.current > 10000) {
              addExecutionLog('info', `💬 AI is generating response...`);
              lastStreamLogTimeRef.current = now;
            }
          }
          break;
          
        case 'ai_thinking':
        case 'processing':
        case 'ai_working':
          resetExecutionTimeout(600000);
          if (data.message) {
            addExecutionLog('info', `🤔 ${data.message}`);
          } else {
            const now = Date.now();
            if (!lastStreamLogTimeRef.current || now - lastStreamLogTimeRef.current > 20000) {
              addExecutionLog('info', `🤔 AI is processing...`);
              lastStreamLogTimeRef.current = now;
            }
          }
          break;
          
        case 'heartbeat':
        case 'keep_alive':
          if (isExecutingRef.current) {
            resetExecutionTimeout(300000);
          }
          break;
          
        case 'output':
        case 'result':
        case 'response':
          // output 메시지를 받았을 때 처리
          if (data.output !== undefined || data.result !== undefined || data.response !== undefined) {
            const outputData = data.output || data.result || data.response;
            
            const updatedNodeWithOutput = { 
              ...editedNode, 
              output: outputData,
              isRunning: false,
              currentExecutionStartTime: null
            };
            setEditedNode(updatedNodeWithOutput);
            setLastOutputUpdateTime(new Date().toISOString());
            setLastExecutionTime(new Date().toISOString());
            
            // 원본 node 객체도 업데이트
            node.isRunning = false;
            (node as any).currentExecutionStartTime = null;
            node.output = outputData;
            
            if (onUpdate) {
              onUpdate(updatedNodeWithOutput);
            }
            
            // 실행 종료
            setTimeout(() => {
              setIsExecuting(false);
              isExecutingRef.current = false;
              setCurrentExecutionStartTime(null);
              if (executionTimeoutRef.current) {
                clearTimeout(executionTimeoutRef.current);
              }
              setExecutionResult({
                success: true,
                output: "Output received successfully"
              });
            }, 500);
          }
          break;
          
        default:
          // 알 수 없는 메시지 타입 처리
          if (data.type && isExecutingRef.current) {
            // output 필드가 있는 경우 처리
            if (data.output !== undefined) {
              const updatedNodeWithData = { 
                ...editedNode, 
                output: data.output,
                isRunning: false,
                currentExecutionStartTime: null
              };
              setEditedNode(updatedNodeWithData);
              setLastOutputUpdateTime(new Date().toISOString());
              setLastExecutionTime(new Date().toISOString());
              
              // 원본 node 객체도 업데이트
              node.isRunning = false;
              (node as any).currentExecutionStartTime = null;
              node.output = data.output;
              
              if (onUpdate) {
                onUpdate(updatedNodeWithData);
              }
              
              // 실행 종료
              setTimeout(() => {
                setIsExecuting(false);
                isExecutingRef.current = false;
                setCurrentExecutionStartTime(null);
                if (executionTimeoutRef.current) {
                  clearTimeout(executionTimeoutRef.current);
                }
                setExecutionResult({
                  success: true,
                  output: "Processing completed"
                });
              }, 500);
            }
            resetExecutionTimeout(300000);
          }
          break;
      }
    };
    
    window.addEventListener('websocket_message', handleWebSocketMessage);
    return () => {
      window.removeEventListener('websocket_message', handleWebSocketMessage);
    };
  }, [node, node.id, editedNode, onUpdate, onSave, addExecutionLog, resetExecutionTimeout, executionResult]); // node 의존성 추가

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
  }, [node.id]); // node.id 의존성 추가

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
    }, 300);
  }, [editedNode, onUpdate, onSave, purpose, outputFormat]);

  // 실행 시간 표시를 위한 interval
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isExecuting && currentExecutionStartTime) {
      interval = setInterval(() => {
        setExecutionElapsedTime(Math.floor((Date.now() - new Date(currentExecutionStartTime).getTime()) / 1000));
      }, 1000);
    } else {
      setExecutionElapsedTime(0);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isExecuting, currentExecutionStartTime]);

  // Activity log 자동 스크롤을 위한 ref
  const activityLogRef = useRef<HTMLDivElement>(null);
  
  // 새로운 로그가 추가될 때 자동 스크롤
  useEffect(() => {
    if (activityLogRef.current) {
      activityLogRef.current.scrollTop = activityLogRef.current.scrollHeight;
    }
  }, [executionLogs]);

  // 컴포넌트 언마운트 시 실행 로그 저장 및 타임아웃 정리
  useEffect(() => {
    return () => {
      // 실행 로그를 노드에 저장
      if (executionLogs.length > 0 && onUpdate) {
        const nodeWithLogs = {
          ...editedNode,
          executionHistory: executionLogs
        };
        onUpdate(nodeWithLogs);
      }
      
      if (taskSaveTimeoutRef.current) {
        clearTimeout(taskSaveTimeoutRef.current);
      }
      if (executionTimeoutRef.current) {
        clearTimeout(executionTimeoutRef.current);
      }
      if (messageCheckIntervalRef.current) {
        clearInterval(messageCheckIntervalRef.current);
      }
    };
  }, [executionLogs, editedNode, onUpdate]);

  const handleSave = () => {
    // Code 저장 시에만 사용
    onSave({ 
      ...editedNode, 
      tasks,
      purpose,
      outputFormat
    } as Node);
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
  };

  const handlePurposeChange = (newPurpose: string) => {
    setPurpose(newPurpose);
    autoSaveTasks(tasks, newPurpose, undefined);
  };

  const handleOutputFormatChange = (newFormat: string) => {
    setOutputFormat(newFormat);
    autoSaveTasks(tasks, undefined, newFormat);
  };

  // 수동으로 노드 상태를 확인하는 함수
  const checkNodeStatus = useCallback(() => {
    // 부모 컴포넌트에서 최신 노드 정보 가져오기
    const currentNode = section.nodes.find(n => n.id === node.id);
    if (!currentNode) return;
    
    console.log('[Check Status] Node output exists:', !!currentNode.output, 'isRunning:', currentNode.isRunning);
    
    // output이 있고 현재 실행 중이면 완료 처리
    if (currentNode.output && isExecuting) {
      const outputChanged = JSON.stringify(currentNode.output) !== JSON.stringify(editedNode.output);
      
      if (outputChanged) {
        console.log('[Check Status] Output changed - completing execution');
        
        // 상태 업데이트
        const updatedNode = {
          ...editedNode,
          output: currentNode.output,
          isRunning: false,
          currentExecutionStartTime: null
        };
        setEditedNode(updatedNode);
        setLastOutputUpdateTime(new Date().toISOString());
        setLastExecutionTime(new Date().toISOString());
        
        // 원본 node 객체도 업데이트
        node.isRunning = false;
        (node as any).currentExecutionStartTime = null;
        node.output = currentNode.output;
        
        if (onUpdate) {
          onUpdate(updatedNode);
        }
        
        // 실행 종료
        setIsExecuting(false);
        isExecutingRef.current = false;
        setCurrentExecutionStartTime(null);
        if (executionTimeoutRef.current) {
          clearTimeout(executionTimeoutRef.current);
        }
        if (messageCheckIntervalRef.current) {
          clearInterval(messageCheckIntervalRef.current);
          messageCheckIntervalRef.current = null;
        }
        
        addExecutionLog('complete', '✅ Execution completed');
        setExecutionResult({
          success: true,
          output: "Execution completed successfully"
        });
      }
    }
    
    // isRunning이 false이면 실행 종료
    if (!currentNode.isRunning && isExecuting) {
      setIsExecuting(false);
      isExecutingRef.current = false;
      setCurrentExecutionStartTime(null);
      if (executionTimeoutRef.current) {
        clearTimeout(executionTimeoutRef.current);
      }
      if (messageCheckIntervalRef.current) {
        clearInterval(messageCheckIntervalRef.current);
        messageCheckIntervalRef.current = null;
      }
    }
  }, [node, section.nodes, isExecuting, editedNode, onUpdate, addExecutionLog]); // node.id 제거

  const executeCode = async () => {
    // 이미 실행 중이면 중지
    if (isExecuting) {
      return;
    }
    
    setIsExecuting(true);
    isExecutingRef.current = true;
    setExecutionResult(null);
    const executionStartTime = new Date().toISOString();
    setCurrentExecutionStartTime(executionStartTime);
    
    // 노드의 실행 상태를 업데이트
    const runningNode = {
      ...editedNode,
      isRunning: true,
      currentExecutionStartTime: executionStartTime
    };
    setEditedNode(runningNode);
    
    // 원본 node 객체도 업데이트
    node.isRunning = true;
    (node as any).currentExecutionStartTime = executionStartTime;
    
    // 실행 상태를 즉시 저장
    if (onUpdate) {
      onUpdate(runningNode);
    }
    
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
      addExecutionLog('start', `🤖 Using AI model: ${editedNode.model || 'none'}`);

      const response = await apiClient.executeNode(
        node.id,
        section.id,
        editedNode.code || node.code || '',  // 저장된 코드 우선 사용
        connectedOutputs
      );
      
      console.log('[Execute] Response status:', response.data.status); // 최소한의 디버그 로그
      
      if (response.data.status === 'started') {
        // AI가 작업 중임을 명확하게 표시
        addExecutionLog('info', '⏳ Waiting for AI response...');
        
        // 초기 타임아웃 설정 (실행 시작 시 10분, WebSocket 메시지가 오면 리셋됨)
        resetExecutionTimeout(600000);
        
        // 즉시 완료되는 경우를 대비한 체크 (2초 후)
        setTimeout(() => {
          if (isExecutingRef.current) {
            checkNodeStatus();
          }
        }, 2000);
        
        // WebSocket 메시지 대기 중임을 표시
        let messageCheckCount = 0;
        
        messageCheckIntervalRef.current = setInterval(() => {
          if (!isExecutingRef.current) {
            if (messageCheckIntervalRef.current) {
              clearInterval(messageCheckIntervalRef.current);
              messageCheckIntervalRef.current = null;
            }
            return;
          }
          
          messageCheckCount++;
          
          // 10초마다 자동으로 상태 체크
          if (messageCheckCount % 2 === 0) {
            console.log(`[Auto Check] Checking status after ${messageCheckCount * 5}s...`);
            checkNodeStatus();
          }
          
          if (messageCheckCount % 12 === 0) { // 60초마다
            addExecutionLog('info', `⏱️ Still waiting for response... (${messageCheckCount * 5}s elapsed)`);
          }
        }, 5000); // 5초마다 체크
      } else {
        // 실행이 시작되지 않은 경우
        if (executionTimeoutRef.current) {
          clearTimeout(executionTimeoutRef.current);
        }
        setIsExecuting(false);
        isExecutingRef.current = false;
        setCurrentExecutionStartTime(null);
        setExecutionResult({
          success: false,
          error: 'Failed to start execution'
        });
        
        // interval 정리
        if (messageCheckIntervalRef.current) {
          clearInterval(messageCheckIntervalRef.current);
          messageCheckIntervalRef.current = null;
        }
        
        // 실행 상태 해제
        const stoppedNode = {
          ...editedNode,
          isRunning: false,
          currentExecutionStartTime: null
        };
        setEditedNode(stoppedNode);
        
        // 원본 node 객체도 업데이트
        node.isRunning = false;
        (node as any).currentExecutionStartTime = null;
        
        if (onUpdate) {
          onUpdate(stoppedNode);
        }
      }
    } catch (error: any) {
      console.error('Execution failed:', error);
      if (executionTimeoutRef.current) {
        clearTimeout(executionTimeoutRef.current);
      }
      setIsExecuting(false);
      isExecutingRef.current = false;
      setCurrentExecutionStartTime(null);
      setExecutionResult({
        success: false,
        error: error.response?.data?.detail || error.message || 'Execution failed'
      });
      addExecutionLog('error', `❌ ${error.response?.data?.detail || error.message || 'Execution failed'}`);
      
      // interval 정리
      if (messageCheckIntervalRef.current) {
        clearInterval(messageCheckIntervalRef.current);
        messageCheckIntervalRef.current = null;
      }
      
      // 에러 시 실행 상태 해제
      const stoppedNode = {
        ...editedNode,
        isRunning: false,
        currentExecutionStartTime: null
      };
      setEditedNode(stoppedNode);
      
      // 원본 node 객체도 업데이트
      node.isRunning = false;
      (node as any).currentExecutionStartTime = null;
      
      if (onUpdate) {
        onUpdate(stoppedNode);
      }
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
import time

# Get connected outputs
data = get_connected_outputs()
print("Connected inputs:", json.dumps(data, ensure_ascii=False, indent=2))

# Get AI model configuration
model_name = "${editedNode.model || 'none'}"
lm_studio_url = "${editedNode.lmStudioUrl || ''}"

# Get current node information
print("Current node:", json.dumps(current_node, ensure_ascii=False, indent=2))
print("Node purpose:", node_purpose)
print("Output format:", output_format_description)

# ========================================================================
# AI 모델을 활용한 자동 처리
# ========================================================================

# 입력 데이터 가져오기
input_text = ""
for key, value in data.items():
    if isinstance(value, dict) and 'text' in value:
        input_text += value['text'] + "\\n"
    elif isinstance(value, str):
        input_text += value + "\\n"

# Tasks 기반 처리를 위한 프롬프트 구성
tasks_prompt = ""
if 'tasks' in current_node:
    tasks_list = []
    for i, task in enumerate(current_node['tasks'], 1):
        tasks_list.append(f"{i}. {task['text']}")
    tasks_prompt = "\\n다음 작업들을 순서대로 수행하세요:\\n" + "\\n".join(tasks_list)

# 기본 AI 프롬프트 구성 (Node Purpose + Output Format + Tasks)
base_prompt = f"""
목적: {node_purpose}

입력 텍스트:
{input_text}

{tasks_prompt}

출력 형식:
{output_format_description}

위의 목적과 출력 형식에 따라 입력 텍스트를 분석하고 결과를 JSON 형식으로 반환하세요.
"""

# ========================================================================
# AI 모델 호출 및 자동 output 설정
# ========================================================================

if model_name != 'none':
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Calling AI model: {model_name}")
    
    try:
        # AI 모델 호출
        ai_response = call_ai_model(base_prompt)
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] AI response received")
        
        # AI 응답 처리 및 자동으로 output 설정
        if isinstance(ai_response, dict) and 'error' in ai_response:
            # AI 호출 에러
            output = ai_response
        elif isinstance(ai_response, str):
            # 문자열 응답 처리
            # JSON 형식 찾기
            json_start = ai_response.find('{')
            json_end = ai_response.rfind('}') + 1
            
            if json_start != -1 and json_end > json_start:
                try:
                    # JSON 파싱 시도
                    output = json.loads(ai_response[json_start:json_end])
                except json.JSONDecodeError:
                    # JSON 파싱 실패 시 텍스트 그대로 반환
                    output = {"result": ai_response, "type": "text"}
            else:
                # JSON이 없으면 텍스트로 반환
                output = {"result": ai_response, "type": "text"}
        else:
            # 이미 딕셔너리나 다른 형태인 경우
            output = ai_response
            
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Output automatically set from AI response")
        
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Error during AI processing: {e}")
        output = {
            "error": f"AI processing failed: {str(e)}",
            "type": "error",
            "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
        }
else:
    # AI 모델이 설정되지 않은 경우
    output = {
        "error": "No AI model configured",
        "hint": "Please connect to LM Studio and select a model",
        "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
    }

# ========================================================================
# 추가 처리 로직 (필요한 경우)
# ========================================================================

# 여기에 AI 응답을 추가로 가공하거나 처리하는 로직을 작성할 수 있습니다
# 예시:
# if 'result' in output:
#     output['processed'] = True
#     output['processing_time'] = time.strftime('%Y-%m-%d %H:%M:%S')

# ========================================================================
# 최종 출력 확인
# ========================================================================

print(f"\\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Final output type: {type(output)}")
print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Final output:")
print(json.dumps(output, ensure_ascii=False, indent=2))

# output 변수가 설정되었음을 명시적으로 표시
print(f"\\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] ✅ Output variable has been automatically set from AI response")`;
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
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDropPosition(null);
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
        <div className="bg-white rounded-lg w-[98%] h-[95%] flex flex-col overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
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

          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Left Side - Connected From Nodes */}
            <div className="w-14 flex-shrink-0 border-r bg-gray-50 p-2 flex flex-col gap-2 items-center overflow-y-auto">
              <div className="text-xs text-gray-500 mb-2 -rotate-90 whitespace-nowrap mt-8">From</div>
              {connectedFromNodes.map((connNode) => (
                <div
                  key={connNode.id}
                  className="group cursor-pointer"
                  onClick={() => handleNodeClick(connNode)}
                  title={connNode.label}
                >
                  <div className="w-10 h-10 rounded-lg bg-white border-2 border-gray-300 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:border-indigo-500 group-hover:shadow-lg">
                    {getNodeIcon(connNode.type)}
                  </div>
                  <div className="text-xs text-center mt-1 truncate w-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    {connNode.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex min-w-0 overflow-hidden">
              {/* Left Panel - Input */}
              <div className="w-[20%] min-w-[200px] max-w-[300px] border-r p-4 flex flex-col overflow-hidden">
                <h3 className="font-semibold mb-2 flex-shrink-0">Input Source</h3>
                <select
                  value={selectedInput}
                  onChange={(e) => setSelectedInput(e.target.value)}
                  className="w-full border border-gray-200 rounded-md p-2 mb-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all flex-shrink-0"
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
                  <div className="bg-gray-50 rounded-md p-3 flex-1 overflow-hidden flex flex-col min-h-0">
                    <h4 className="font-medium mb-2 flex-shrink-0">Input Data:</h4>
                    <div className="flex-1 overflow-auto min-h-0">
                      <pre className="text-xs">
                        {JSON.stringify(connectedNodeData, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Center Panel - Code Editor with tabs */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
                        value={editedNode.code || node.code || getDefaultCode()}
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
                                        onDragStart={(e) => handleDragStart(e, index)}
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
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex justify-between items-center p-4 pb-3 flex-shrink-0 border-b border-gray-100">
                        <h3 className="font-semibold">Activity Log</h3>
                        <button
                          onClick={handleClearLogs}
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                          title="Clear activity log"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto min-h-0 p-4 pt-0" ref={activityLogRef}>
                        <div className="space-y-2">
                        {executionLogs.length === 0 ? (
                          <div className="text-gray-500 text-center py-8">
                            No activity recorded yet
                          </div>
                        ) : null}
                        
                        {/* Recent execution logs */}
                        {executionLogs.map((log, idx) => (
                          <div key={`exec-${idx}`} className={`
                            border rounded-md p-3
                            ${log.type === 'error' ? 'border-red-200 bg-red-50' : 
                              log.type === 'complete' ? 'border-green-200 bg-green-50' : 
                              log.type === 'ai_request' ? 'border-blue-200 bg-blue-50' :
                              log.type === 'ai_response' ? 'border-purple-200 bg-purple-50' :
                              log.type === 'info' ? 'border-gray-200 bg-gray-50' :
                              'border-gray-200 bg-gray-50'}
                          `}>
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="text-sm text-gray-600">
                                  {new Date(log.timestamp).toLocaleString()}
                                </div>
                                <div className="mt-1 font-medium">
                                  {log.message}
                                </div>
                                {log.details && (
                                  <div className="mt-2">
                                    <details className="cursor-pointer">
                                      <summary className="text-sm text-gray-600 hover:text-gray-800">
                                        View details
                                      </summary>
                                      <pre className="text-xs mt-2 p-2 bg-white rounded overflow-x-auto max-h-40">
                                        {typeof log.details === 'string' 
                                          ? log.details 
                                          : JSON.stringify(log.details, null, 2)}
                                      </pre>
                                    </details>
                                  </div>
                                )}
                              </div>
                              <div className={`
                                px-2 py-1 rounded text-xs font-medium
                                ${log.type === 'error' ? 'bg-red-100 text-red-700' : 
                                  log.type === 'complete' ? 'bg-green-100 text-green-700' : 
                                  log.type === 'ai_request' ? 'bg-blue-100 text-blue-700' :
                                  log.type === 'ai_response' ? 'bg-purple-100 text-purple-700' :
                                  log.type === 'info' ? 'bg-gray-100 text-gray-700' :
                                  'bg-gray-100 text-gray-700'}
                              `}>
                                {log.type === 'ai_request' ? 'AI Request' :
                                 log.type === 'ai_response' ? 'AI Response' :
                                 log.type === 'complete' ? 'Complete' :
                                 log.type === 'error' ? 'Error' :
                                 'Info'}
                              </div>
                            </div>
                          </div>
                        ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Execution Result */}
                {executionResult && (
                  <div className={`p-3 border-t flex-shrink-0 ${executionResult?.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        {executionResult?.success ? (
                          <div className="text-emerald-700">
                            <strong>Success:</strong> {typeof executionResult?.output === 'string' ? executionResult.output : JSON.stringify(executionResult?.output)}
                          </div>
                        ) : (
                          <div className="text-red-700">
                            <strong>Error:</strong> {executionResult?.error}
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
                <div className="p-4 border-t bg-gray-50 flex-shrink-0">
                  <AIModelSelector
                    value={editedNode.model || 'none'}
                    lmStudioUrl={editedNode.lmStudioUrl}
                    lmStudioConnectionId={editedNode.lmStudioConnectionId}
                    onChange={handleModelChange}
                  />
                </div>
                
                {/* Action Buttons - Save button only for code */}
                <div className="p-4 border-t flex gap-2 flex-shrink-0">
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
                  {isExecuting && (
                    <>
                      <button
                        onClick={() => {
                          // 강제로 실행 중지
                          if (executionTimeoutRef.current) {
                            clearTimeout(executionTimeoutRef.current);
                          }
                          if (messageCheckIntervalRef.current) {
                            clearInterval(messageCheckIntervalRef.current);
                            messageCheckIntervalRef.current = null;
                          }
                          setIsExecuting(false);
                          isExecutingRef.current = false;
                          setCurrentExecutionStartTime(null);
                          
                          // 노드 상태 업데이트
                          const stoppedNode = {
                            ...editedNode,
                            isRunning: false,
                            currentExecutionStartTime: null
                          };
                          setEditedNode(stoppedNode);
                          
                          // onUpdate만 호출 (onSave는 모달을 닫으므로 호출하지 않음)
                          if (onUpdate) {
                            onUpdate(stoppedNode);
                          }
                          
                          // 원본 node 객체도 업데이트
                          node.isRunning = false;
                          (node as any).currentExecutionStartTime = null;
                          
                          addExecutionLog('info', '⏹️ Execution stopped manually');
                          setExecutionResult({
                            success: false,
                            error: 'Execution stopped by user'
                          });
                        }}
                        className="flex items-center gap-2 bg-red-500 text-white rounded-md px-4 py-2 hover:bg-red-600 transition-colors"
                      >
                        <Square className="w-4 h-4" />
                        Stop
                      </button>
                    </>
                  )}
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
              <div className="w-[30%] min-w-[250px] max-w-[400px] border-l flex flex-col overflow-hidden">
                <div className="flex-1 p-4 flex flex-col overflow-hidden min-h-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Output</h3>
                    {lastExecutionTime && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>Last run: {new Date(lastExecutionTime!).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>
                  
                  {isExecuting ? (
                    // 실행 중일 때 표시
                    <div className="flex-1 flex flex-col items-center justify-center">
                      <Loader className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                      <div className="text-gray-600 font-medium">Executing code...</div>
                      <div className="text-sm text-gray-500 mt-2">Waiting for AI response</div>
                      {executionElapsedTime > 0 && (
                        <div className="text-xs text-gray-400 mt-4">
                          Running for: {executionElapsedTime >= 60 
                            ? `${Math.floor(executionElapsedTime / 60)}m ${executionElapsedTime % 60}s`
                            : `${executionElapsedTime}s`
                          }
                        </div>
                      )}
                    </div>
                  ) : editedNode.output ? (
                    // 실행 완료 후 output이 있을 때
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span>
                            {currentExecutionStartTime && lastOutputUpdateTime && 
                             new Date(lastOutputUpdateTime!).getTime() < new Date(currentExecutionStartTime!).getTime()
                              ? 'Previous execution output' 
                              : 'Output successfully generated'}
                          </span>
                        </div>
                        {lastOutputUpdateTime && (
                          <div className="text-xs text-gray-500">
                            {new Date(lastOutputUpdateTime!).toLocaleTimeString()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 overflow-auto min-h-0">
                        <pre className="bg-gray-50 rounded-md p-3 text-xs">
                          {typeof editedNode.output === 'string' 
                            ? editedNode.output 
                            : JSON.stringify(editedNode.output, null, 2)}
                        </pre>
                        {editedNode.output?.error && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                            <div className="text-sm font-medium text-red-800">Error in output:</div>
                            <div className="text-xs text-red-700 mt-1">{editedNode.output.error}</div>
                            {editedNode.output.type && (
                              <div className="text-xs text-red-600 mt-1">Type: {editedNode.output.type}</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    // output이 없을 때
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
                <div className="border-t p-4 flex-shrink-0">
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
            <div className="w-14 flex-shrink-0 border-l bg-gray-50 p-2 flex flex-col gap-2 items-center overflow-y-auto">
              <div className="text-xs text-gray-500 mb-2 rotate-90 whitespace-nowrap mt-8">To</div>
              {connectedToNodes.map((connNode) => (
                <div
                  key={connNode.id}
                  className="group cursor-pointer"
                  onClick={() => handleNodeClick(connNode)}
                  title={connNode.label}
                >
                  <div className="w-10 h-10 rounded-lg bg-white border-2 border-gray-300 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:border-emerald-500 group-hover:shadow-lg">
                    {getNodeIcon(connNode.type)}
                  </div>
                  <div className="text-xs text-center mt-1 truncate w-10 opacity-0 group-hover:opacity-100 transition-opacity">
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
          const nodeType = selectedNodeForEdit?.type;
          const ModalComponent = nodeType === 'worker' ? WorkerEditModal :
                              (nodeType === 'supervisor' || nodeType === 'planner') ? 
                              require('./SupervisorEditModal').SupervisorEditModal :
                              (nodeType === 'input' || nodeType === 'output') ?
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
                  } as Node);
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