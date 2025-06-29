// frontend/src/components/modals/WorkerEditModal.tsx - Enhanced Version
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Save, Play, Database, Clock, Award, Loader, X, Pencil, FileText, FileInput, FileOutput, Plus, Trash2, GripVertical, Lock, Circle, Triangle, Target, FileJson, CheckCircle, Square, Code, GitBranch, FileCode, AlertTriangle, Diff } from 'lucide-react';
import { Node, Section, Version, TaskItem } from '../../types';
import { apiClient } from '../../api/client';
import { CodeEditor } from '../CodeEditor';
import { AIModelSelector } from '../AIModelSelector';
import { baseCodeTemplates, getTemplate, processTemplate } from '../../templates/baseCode';
import { mergeCode, ConflictInfo, validateExpCode } from '../../utils/codeMerger';

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

// Node 타입 확장 - Base/Exp Code 필드 추가
interface ExtendedNode extends Node {
  executionHistory?: ExecutionLog[];
  currentExecutionStartTime?: string | null;
  baseCode?: string;
  expCode?: string;
  baseCodeTemplate?: string;
  projectId?: string;
}

export const WorkerEditModal: React.FC<WorkerEditModalProps> = ({
  node,
  section,
  allSections,
  onClose,
  onSave,
  onUpdate
}) => {
  // expCode를 안전하게 가져오기 - node 객체에서 직접 접근
  const initialExpCode = (node as any).expCode || 
                        (node as ExtendedNode).expCode || 
                        '';
  
  const [editedNode, setEditedNode] = useState<ExtendedNode>({
    ...node,
    executionHistory: (node as any).executionHistory || [],
    currentExecutionStartTime: (node as any).currentExecutionStartTime || null,
    baseCode: (node as any).baseCode,
    expCode: initialExpCode,  // 수정된 부분
    baseCodeTemplate: (node as any).baseCodeTemplate || 'default',
    projectId: (node as any).projectId
  });
  
  const [selectedInput, setSelectedInput] = useState<string>(node.connectedFrom?.[0] || '');
  const [connectedNodeData, setConnectedNodeData] = useState<any>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeTab, setActiveTab] = useState<'base_code' | 'extension_code' | 'merged_code' | 'tasks' | 'history'>('tasks');
  
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
  
  // 템플릿 내용 상태
  const [baseCodeContent, setBaseCodeContent] = useState<string>('');
  const [isLoadingTemplate, setIsLoadingTemplate] = useState<boolean>(true);
  
  // 충돌 해결 관련 상태
  const [showConflictViewer, setShowConflictViewer] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  
  // 프로젝트 관련 함수 - 현재 프로젝트 경로 가져오기
  const getProjectRoot = useCallback(() => {
    // Input 노드에서 선택된 프로젝트 정보 가져오기
    const inputNode = section.nodes.find(n => n.type === 'input');
    if (inputNode?.projectId) {
      // localStorage에서 프로젝트 정보 가져오기 (실제로는 API 호출 필요)
      const projectData = localStorage.getItem(`project_${inputNode.projectId}`);
      if (projectData) {
        try {
          const project = JSON.parse(projectData);
          return `${project.path}/${project.name}/preproduction/${section.name.toLowerCase()}`;
        } catch (e) {
          console.error('Failed to parse project data:', e);
        }
      }
      
      // 대체 방법: 개별 키로 저장된 경우
      const projectPath = localStorage.getItem(`project_${inputNode.projectId}_path`) || './projects';
      const projectName = localStorage.getItem(`project_${inputNode.projectId}_name`) || 'default';
      return `${projectPath}/${projectName}/preproduction/${section.name.toLowerCase()}`;
    }
    return './default_output';
  }, [section]);
  
  // Base Code 템플릿 로드
  useEffect(() => {
    const loadBaseCode = async () => {
      setIsLoadingTemplate(true);
      try {
        const template = await getTemplate(editedNode.baseCodeTemplate || 'default');
        
        if (template) {
          const variables = {
            MODEL_NAME: editedNode.model || 'none',
            LM_STUDIO_URL: editedNode.lmStudioUrl || '',
            PROJECT_ROOT: getProjectRoot()
          };
          const processedTemplate = processTemplate(template, variables);
          setBaseCodeContent(processedTemplate);
        }
      } catch (error) {
        console.error('Failed to load template:', error);
        setBaseCodeContent('# Failed to load template');
      } finally {
        setIsLoadingTemplate(false);
      }
    };
    
    loadBaseCode();
  }, [editedNode.baseCodeTemplate, editedNode.model, editedNode.lmStudioUrl, getProjectRoot]);

  // mergedCode를 useMemo로 계산 - codeMerger 모듈 사용
  const mergedCodeResult = useMemo(() => {
    return mergeCode({
      baseCodeContent,
      expCode: editedNode.expCode || '',
      projectRoot: getProjectRoot(),
      isLoadingTemplate
    });
  }, [baseCodeContent, editedNode.expCode, getProjectRoot, isLoadingTemplate]);

  const mergedCode = mergedCodeResult.mergedCode;

  // conflicts 상태 업데이트를 useEffect로 분리
  useEffect(() => {
    setConflicts(mergedCodeResult.conflicts);
  }, [mergedCodeResult.conflicts]);

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
    // 로그 상태 초기화
    setExecutionLogs([]);
    
    // editedNode의 executionHistory도 초기화하고 즉시 저장
    const clearedNode = {
      ...editedNode,
      executionHistory: [],
      tasks,
      purpose,
      outputFormat,
      baseCodeTemplate: editedNode.baseCodeTemplate,
      expCode: editedNode.expCode
    };
    setEditedNode(clearedNode);
    
    // 원본 node 객체의 executionHistory도 초기화 (매우 중요!)
    (node as any).executionHistory = [];
    
    // 변경사항을 즉시 저장하여 영구적으로 적용
    // onUpdate를 우선적으로 사용
    if (onUpdate) {
      // 강제로 업데이트 트리거
      setTimeout(() => {
        onUpdate(clearedNode as Node);
      }, 0);
    } else if (onSave) {
      // onUpdate가 없으면 onSave 사용
      setTimeout(() => {
        onSave(clearedNode as Node);
      }, 0);
    }
    
    // 추가로 이벤트를 발생시켜 상위 컴포넌트에 알림
    setTimeout(() => {
      const event = new CustomEvent('nodeLogsCleared', { 
        detail: { 
          nodeId: node.id, 
          sectionId: section.id 
        } 
      });
      window.dispatchEvent(event);
    }, 100);
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
        addExecutionLog('error', `Timeout: ${timeoutDuration / 1000}s`);
        
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
  }, [addExecutionLog, node, onUpdate]);

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
          setEditedNode(clearedNode as ExtendedNode);
          
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
            addExecutionLog('error', 'Stale execution cleared (>10min)');
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
        addExecutionLog('info', 'Execution resumed');
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
        // AI 응답 검증 - 원하는 데이터가 없으면 실패 처리
        let isValidResponse = true;
        let errorMessage = '';
        
        if (data.output && typeof data.output === 'object') {
          if (data.output.error) {
            isValidResponse = false;
            errorMessage = data.output.error;
          } else if (data.output.type === 'error') {
            isValidResponse = false;
            errorMessage = data.output.message || 'Unknown error occurred';
          } else if (!data.output.result && !data.output.data && !data.output.output) {
            // result, data, output 중 하나라도 있어야 유효한 응답
            isValidResponse = false;
            errorMessage = 'AI response does not contain expected data';
          }
        }
        
        if (!isValidResponse) {
          // 실패 처리
          addExecutionLog('error', `AI Error: ${errorMessage}`);
          setExecutionResult({
            success: false,
            error: errorMessage
          });
          
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
          
          // 노드 상태 업데이트
          const failedNode = {
            ...editedNode,
            isRunning: false,
            currentExecutionStartTime: null,
            output: data.output // 에러 정보도 저장
          };
          setEditedNode(failedNode);
          node.isRunning = false;
          (node as any).currentExecutionStartTime = null;
          node.output = data.output;
          
          if (onUpdate) {
            onUpdate(failedNode);
          }
          
          return;
        }
        
        // nodeId가 없거나 일치하면 성공 처리
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
            addExecutionLog('complete', 'Execution completed');
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
          addExecutionLog('start', 'Execution started');
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
            addExecutionLog('info', 'Preparing environment');
          } else if (data.progress === 0.3) {
            addExecutionLog('ai_request', `AI Request sent${data.prompt_size ? ` (${data.prompt_size} tokens)` : ''}`);
          } else if (data.progress === 0.5) {
            addExecutionLog('ai_response', 'AI processing');
          } else if (data.progress === 0.7) {
            addExecutionLog('ai_response', 'Receiving response');
          } else if (data.progress === 1.0) {
            addExecutionLog('complete', 'Processing complete');
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
          addExecutionLog('ai_request', data.message || 'AI Request');
          break;
          
        case 'ai_response':
          resetExecutionTimeout(600000);
          addExecutionLog('ai_response', data.message || 'AI Response');
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
            
            addExecutionLog('complete', 'AI processing completed');
            setExecutionResult({
              success: true,
              output: "AI processing completed successfully"
            });
          } else if (isExecutingRef.current) {
            // output이 없는 경우에만 간단한 메시지
            addExecutionLog('complete', 'AI completed');
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
          addExecutionLog('complete', 'Output updated');
          
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
          
          addExecutionLog('error', `Error: ${data.error}`);
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
            addExecutionLog('complete', 'Execution completed');
            
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
              addExecutionLog('info', 'AI streaming response');
              lastStreamLogTimeRef.current = now;
            }
          }
          break;
          
        case 'ai_thinking':
        case 'processing':
        case 'ai_working':
          resetExecutionTimeout(600000);
          if (data.message) {
            addExecutionLog('info', data.message);
          } else {
            const now = Date.now();
            if (!lastStreamLogTimeRef.current || now - lastStreamLogTimeRef.current > 20000) {
              addExecutionLog('info', 'Processing...');
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

  // Task 자동 저장 함수 - expCode 포함하도록 수정
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
        outputFormat: updatedOutputFormat !== undefined ? updatedOutputFormat : outputFormat,
        baseCodeTemplate: editedNode.baseCodeTemplate,
        expCode: editedNode.expCode,  // expCode 포함
        // code는 저장 시점에 계산하지 않음 (무한 루프 방지)
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

  // Exp Code 변경 시 자동 저장 함수 - validateExpCode 추가
  const handleExpCodeChange = useCallback((code: string) => {
    const updatedNode = { ...editedNode, expCode: code };
    setEditedNode(updatedNode);
    
    // Exp Code 검증 (옵션)
    const validation = validateExpCode(code);
    if (validation.warnings.length > 0) {
      console.warn('Extension Code warnings:', validation.warnings);
    }
    
    // 디바운스된 자동 저장
    if (taskSaveTimeoutRef.current) {
      clearTimeout(taskSaveTimeoutRef.current);
    }
    taskSaveTimeoutRef.current = setTimeout(() => {
      const nodeToSave = {
        ...updatedNode,
        tasks,
        purpose,
        outputFormat,
        code: mergedCode
      };
      if (onUpdate) {
        onUpdate(nodeToSave);
      }
    }, 1000); // 1초 후 자동 저장
  }, [editedNode, tasks, purpose, outputFormat, onUpdate, mergedCode]);

  // 컴포넌트 언마운트 시 실행 로그 저장 및 타임아웃 정리
  useEffect(() => {
    return () => {
      // 실행 로그를 노드에 저장
      if (executionLogs.length > 0 && onUpdate) {
        const nodeWithLogs = {
          ...editedNode,
          executionHistory: executionLogs,
          baseCodeTemplate: editedNode.baseCodeTemplate,
          expCode: editedNode.expCode  // expCode 포함
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
    // 모든 데이터 저장 (Base Code는 저장하지 않음 - 항상 동적 생성)
    onSave({ 
      ...editedNode, 
      tasks,
      purpose,
      outputFormat,
      expCode: editedNode.expCode,
      baseCodeTemplate: editedNode.baseCodeTemplate,
      code: mergedCode // 병합된 코드를 code 필드에 저장
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
      outputFormat,
      baseCodeTemplate: editedNode.baseCodeTemplate,
      expCode: editedNode.expCode,  // expCode 포함
      // code는 저장 시점에 계산하지 않음
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
        
        addExecutionLog('complete', 'Execution completed');
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
    // 템플릿이 아직 로딩 중이면 대기
    if (isLoadingTemplate) {
      alert('Template is still loading. Please wait...');
      return;
    }
    
    // 이미 실행 중이면 중지
    if (isExecuting) {
      return;
    }
    
    // 디버깅: baseCodeContent 확인
    console.log('=== BASE CODE CONTENT ===');
    console.log(baseCodeContent);
    console.log('=== END BASE CODE ===');
    
    // 디버깅: 노드 정보 확인
    console.log('=== NODE INFO BEFORE EXECUTION ===');
    console.log('Model:', editedNode.model);
    console.log('LM Studio URL:', editedNode.lmStudioUrl);
    console.log('EditedNode:', editedNode);
    console.log('=== END NODE INFO ===');
    
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
          if (connNode?.output && connNode.label) {
            connectedOutputs[connNode.label] = connNode.output;
          }
        }
      }

      // 실제 실행되는 코드를 콘솔에 출력
      console.log('=== EXECUTING THIS CODE ===');
      console.log(mergedCode);
      console.log('=== END OF CODE ===');
      console.log('Code length:', mergedCode.length);

      const response = await apiClient.executeNodeWithCode(
        node.id,
        section.id,
        mergedCode,
        connectedOutputs
      );
      
      console.log('[Execute] Response status:', response.data.status); // 최소한의 디버그 로그
      
      if (response.data.status === 'started') {
        // AI가 작업 중임을 명확하게 표시
        addExecutionLog('info', 'Waiting for AI response...');
        
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
            addExecutionLog('info', `Still waiting (${messageCheckCount * 5}s)`);
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
      addExecutionLog('error', error.response?.data?.detail || error.message || 'Execution failed');
      
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
                    onClick={() => setActiveTab('tasks')}
                    className={`px-4 py-2 font-medium transition-all ${activeTab === 'tasks' ? 'bg-gray-50 border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Tasks
                  </button>
                  <button
                    onClick={() => setActiveTab('base_code')}
                    className={`px-4 py-2 font-medium transition-all flex items-center gap-2 ${activeTab === 'base_code' ? 'bg-gray-50 border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    <Code className="w-4 h-4" />
                    Base Code
                  </button>
                  <button
                    onClick={() => setActiveTab('extension_code')}
                    className={`px-4 py-2 font-medium transition-all flex items-center gap-2 ${activeTab === 'extension_code' ? 'bg-gray-50 border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    <GitBranch className="w-4 h-4" />
                    Extension Code
                  </button>
                  <button
                    onClick={() => setActiveTab('merged_code')}
                    className={`px-4 py-2 font-medium transition-all ${activeTab === 'merged_code' ? 'bg-gray-50 border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Merged
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-2 font-medium transition-all ${activeTab === 'history' ? 'bg-gray-50 border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    Activity Log
                  </button>
                </div>
                
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                  {activeTab === 'base_code' ? (
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex-shrink-0">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-blue-700">
                              <strong>Base Code</strong> - This is the common execution code for all Worker nodes (read-only)
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-blue-600">Template:</label>
                            <select
                              value={editedNode.baseCodeTemplate || 'default'}
                              onChange={(e) => {
                                const updatedNode = { ...editedNode, baseCodeTemplate: e.target.value };
                                setEditedNode(updatedNode);
                                // 템플릿 변경시 자동 저장
                                if (onUpdate) {
                                  onUpdate({ ...updatedNode, tasks, purpose, outputFormat, expCode: editedNode.expCode });
                                }
                              }}
                              className="px-3 py-1 text-sm border border-blue-300 rounded-md bg-white text-blue-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            >
                              {Object.values(baseCodeTemplates).map(template => (
                                <option key={template.id} value={template.id}>
                                  {template.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {/* 선택된 템플릿 설명 표시 */}
                        {baseCodeTemplates[editedNode.baseCodeTemplate || 'default'] && (
                          <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                            <FileCode className="w-3 h-3" />
                            {baseCodeTemplates[editedNode.baseCodeTemplate || 'default'].description}
                          </p>
                        )}
                      </div>
                      <div className="flex-1 min-h-0">
                        {isLoadingTemplate ? (
                          <div className="flex items-center justify-center h-full">
                            <Loader className="w-6 h-6 animate-spin text-blue-500" />
                            <span className="ml-2 text-gray-600">Loading template...</span>
                          </div>
                        ) : (
                          <CodeEditor
                            value={baseCodeContent}
                            onChange={() => {}} // Read-only
                            readOnly={true}
                            language="python"
                            theme="light"
                          />
                        )}
                      </div>
                    </div>
                  ) : activeTab === 'extension_code' ? (
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex-shrink-0">
                        <p className="text-sm text-amber-700">
                          <strong>Extension Code</strong> - Add custom logic specific to this node
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          Available variables: <code className="bg-amber-100 px-1 rounded">input_data</code>, <code className="bg-amber-100 px-1 rounded">combined_input</code>, <code className="bg-amber-100 px-1 rounded">base_prompt</code>, <code className="bg-amber-100 px-1 rounded">project_root</code>
                        </p>
                        <p className="text-xs text-amber-600">
                          Set <code className="bg-amber-100 px-1 rounded">exp_prompt_addition</code> to add instructions, or <code className="bg-amber-100 px-1 rounded">processed_input</code> to modify input
                        </p>
                        <p className="text-xs text-amber-600">
                          Define <code className="bg-amber-100 px-1 rounded">EXP_POST_PROCESS_FUNCTION</code> to process AI response
                        </p>
                      </div>
                      <div className="flex-1 min-h-0">
                        <CodeEditor
                          value={editedNode.expCode || `# Example: Add custom processing logic here
# You can access and modify:
# - input_data: Raw connected node outputs
# - combined_input: Formatted input text
# - base_prompt: The AI prompt being built
# - project_root: Current project directory path

# Example 1: Add extra instructions to the AI
exp_prompt_addition = """
Additionally, please ensure that:
1. All names are properly capitalized
2. Dates are in ISO format
3. Include confidence scores for each result
"""

# Example 2: Process input data before sending to AI
# processed_input = combined_input.upper()  # Convert to uppercase

# Example 3: Filter or transform specific inputs
# if 'customer_data' in input_data:
#     # Custom processing for customer data
#     pass

# Example 4: Post-process AI response and save files
# def save_results(output_data):
#     import os
#     import json
#     
#     # Create project directory
#     os.makedirs(f"{project_root}/results", exist_ok=True)
#     
#     # Save processed data
#     with open(f"{project_root}/results/output.json", 'w') as f:
#         json.dump(output_data, f, ensure_ascii=False, indent=2)
#     
#     return output_data
# 
# EXP_POST_PROCESS_FUNCTION = save_results
`}
                          onChange={handleExpCodeChange}
                          language="python"
                          theme="light"
                        />
                      </div>
                    </div>
                  ) : activeTab === 'merged_code' ? (
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="bg-green-50 border-b border-green-200 px-4 py-2 flex-shrink-0">
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-green-700">
                            <strong>Merged Code</strong> - This is the final code that will be executed (read-only)
                          </p>
                          <div className="flex items-center gap-2">
                            {conflicts.length > 0 && (
                              <button
                                onClick={() => setShowConflictViewer(true)}
                                className="flex items-center gap-1 px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
                                title="View conflict resolutions"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} resolved
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0">
                        {isLoadingTemplate ? (
                          <div className="flex items-center justify-center h-full">
                            <Loader className="w-6 h-6 animate-spin text-green-500" />
                            <span className="ml-2 text-gray-600">Loading merged code...</span>
                          </div>
                        ) : (
                          <CodeEditor
                            value={mergedCode}
                            onChange={() => {}} // Read-only
                            readOnly={true}
                            language="python"
                            theme="light"
                          />
                        )}
                      </div>
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
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                </div>
                                <div className="mt-1 font-medium">
                                  {log.message}
                                </div>
                                {log.details && (
                                  <div className="mt-2">
                                    <details className="cursor-pointer">
                                      <summary className="text-sm text-gray-600 hover:text-gray-800">
                                        Details
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
                                {log.type}
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
                    Save All
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
                          
                          addExecutionLog('info', 'Execution stopped');
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
                  outputFormat,
                  baseCode: undefined, // Base code는 항상 동적 생성이므로 제외
                  baseCodeTemplate: editedNode.baseCodeTemplate,
                  expCode: editedNode.expCode,
                  code: mergedCode
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
                    outputFormat,
                    baseCode: undefined,
                    baseCodeTemplate: editedNode.baseCodeTemplate,
                    expCode: editedNode.expCode,
                    code: mergedCode
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

      {/* Conflict Viewer Modal */}
      {showConflictViewer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg w-[80%] max-w-5xl h-[85%] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Diff className="w-5 h-5" />
                Code Conflict Resolution Report
              </h2>
              <button 
                onClick={() => setShowConflictViewer(false)} 
                className="text-2xl hover:text-gray-600"
              >&times;</button>
            </div>
            
            <div className="flex-1 p-4 overflow-auto">
              {conflicts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No conflicts detected
                </div>
              ) : (
                <div className="space-y-4">
                  {conflicts.map((conflict, index) => (
                    <div key={index} className="border rounded-lg overflow-hidden">
                      <div className={`p-3 ${conflict.type === 'removed' ? 'bg-red-50' : 'bg-yellow-50'}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${conflict.type === 'removed' ? 'text-red-700' : 'text-yellow-700'}`}>
                            {conflict.type === 'removed' ? '❌ Removed' : '⚠️ Modified'}
                          </span>
                          <span className="text-sm text-gray-600">{conflict.reason}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 divide-x">
                        <div className="p-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Original (Extension Code)</h4>
                          <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                            {conflict.originalCode}
                          </pre>
                        </div>
                        <div className="p-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Resolution</h4>
                          <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                            {conflict.resolvedCode}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">Resolution Summary</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• AI model calls are handled by base code to avoid conflicts</li>
                  <li>• Duplicate imports are removed to prevent redefinition errors</li>
                  <li>• Global variables from base code are protected from overwriting</li>
                  <li>• Project root path is automatically injected for file operations</li>
                  <li>• Post-processing functions are properly integrated with AI response</li>
                </ul>
              </div>
            </div>
            
            <div className="p-4 border-t">
              <button
                onClick={() => setShowConflictViewer(false)}
                className="w-full bg-gray-200 text-gray-700 rounded-md px-4 py-2 hover:bg-gray-300 transition-colors"
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
                    outputFormat,
                    expCode: editedNode.expCode,
                    baseCodeTemplate: editedNode.baseCodeTemplate,
                    code: mergedCode
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