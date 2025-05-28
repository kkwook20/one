import React, { useState, memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Play, Square, Code, ChevronDown, ChevronUp, Zap, CheckCircle, XCircle, Clock } from 'lucide-react';
import useWorkflowStore from '../../stores/workflowStore';
import { Task, TaskStatus } from '../../types/nodes';

const WorkerNode = memo(({ data, id, selected }: NodeProps) => {
  const [tasks, setTasks] = useState<Task[]>(data.tasks || [
    { id: '1', text: '데이터 전처리 작업', status: 'todo', progress: 0 },
    { id: '2', text: '모델 학습 실행', status: 'todo', progress: 0 },
  ]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  
  const { executeNode, updateNodeData } = useWorkflowStore();

  const handleExecute = useCallback(() => {
    setIsRunning(true);
    executeNode(id, 'worker');
    // 실제로는 실행 완료 시 setIsRunning(false) 호출
    setTimeout(() => setIsRunning(false), 3000);
  }, [id, executeNode]);

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    const updatedTasks = tasks.map(task => 
      task.id === taskId ? { ...task, status } : task
    );
    setTasks(updatedTasks);
    updateNodeData(id, { tasks: updatedTasks });
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'todo': 
        return <div className="w-4 h-4 rounded-full border-2 border-blue-400" />;
      case 'skip': 
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'partial': 
        return <Clock className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getNextStatus = (status: TaskStatus): TaskStatus => {
    const statusOrder: TaskStatus[] = ['todo', 'skip', 'partial'];
    const currentIndex = statusOrder.indexOf(status);
    return statusOrder[(currentIndex + 1) % statusOrder.length];
  };

  return (
    <div
      className={`workflow-node min-w-[320px] ${
        selected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-950' : ''
      }`}
      style={{
        '--node-color-1': '#3b82f6',
        '--node-color-2': '#2563eb',
        '--button-color-1': '#3b82f6',
        '--button-color-2': '#2563eb',
        '--progress-color-1': '#3b82f6',
        '--progress-color-2': '#60a5fa',
      } as React.CSSProperties}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="!bg-blue-500" 
      />
      
      {/* Header */}
      <div className="node-header">
        <div className="node-title">
          <div className="node-icon">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span>Worker Node</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExecute}
            disabled={isRunning}
            className={`node-button primary ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isRunning ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>실행 중</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                <span>실행</span>
              </>
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="node-button"
          >
            {isExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>
      
      {/* Tasks */}
      <div className="space-y-2 mb-4">
        {tasks.map((task, index) => (
          <div key={task.id} className="node-card group slide-up" style={{ animationDelay: `${index * 50}ms` }}>
            {/* Progress bar background */}
            <div className="progress-bar absolute inset-0 opacity-30">
              <div 
                className="progress-bar-fill"
                style={{ width: `${task.progress}%` }}
              />
            </div>
            
            {/* Task content */}
            <div className="relative z-10 flex items-center justify-between">
              <span className="text-sm text-gray-200 flex-1 mr-2">{task.text}</span>
              <button
                onClick={() => updateTaskStatus(task.id, getNextStatus(task.status))}
                className="p-1 rounded-lg hover:bg-white/10 transition-all"
                title={`Status: ${task.status}`}
              >
                {getStatusIcon(task.status)}
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Expanded content */}
      {isExpanded && (
        <div className="space-y-3 pt-3 border-t border-gray-700 slide-up">
          {/* Code preview */}
          <div className="node-card">
            <div className="flex items-center gap-2 mb-2">
              <Code className="w-3 h-3 text-blue-400" />
              <span className="text-xs text-gray-400">Python Code</span>
            </div>
            <pre className="text-xs text-gray-300 overflow-x-auto font-mono">
              <code>{data.code || '# No code yet\nprint("Hello, World!")'}</code>
            </pre>
          </div>
          
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">상태</span>
            <span className={`status-badge ${
              data.status === 'running' ? 'running' :
              data.status === 'completed' ? 'success' :
              data.status === 'error' ? 'error' :
              'idle'
            }`}>
              {data.status === 'running' && <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
              {data.status === 'completed' && <CheckCircle className="w-3 h-3" />}
              {data.status === 'error' && <XCircle className="w-3 h-3" />}
              {data.status || 'Ready'}
            </span>
          </div>
        </div>
      )}
      
      {/* Note */}
      <div className="mt-4">
        <textarea 
          className="modern-textarea"
          placeholder="노트를 입력하세요..."
          rows={2}
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          onBlur={() => updateNodeData(id, { note: noteContent })}
        />
      </div>
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="!bg-blue-500" 
      />
    </div>
  );
});

WorkerNode.displayName = 'WorkerNode';

export default WorkerNode;