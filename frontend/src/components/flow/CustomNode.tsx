// frontend/src/components/flow/CustomNode.tsx
import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  Play, 
  Square, 
  Settings, 
  Trash2, 
  Power, 
  FileInput, 
  FileOutput,
  Loader2,
  Lock,
  Circle,
  Triangle
} from 'lucide-react';
import { Node, } from '../../types';

interface CustomNodeData extends Node {
  onEdit?: () => void;
  onDeactivate?: () => void;
  onToggleRun?: () => void;
  onDelete?: (nodeId: string) => void;
  onUpdate?: (node: Node) => void;
  progress?: number;
  isExecuting?: boolean;
  isCompleted?: boolean;
  inputConfig?: {
    type: string;
  };
  outputConfig?: {
    type: string;
  };
}

export const CustomNode: React.FC<NodeProps<CustomNodeData>> = ({ data, id, selected }) => {
  // 안전한 문자열 변환 함수
  const getOutputPreview = (output: any): string => {
    if (!output) return '';
    
    let str = '';
    if (typeof output === 'string') {
      str = output;
    } else if (typeof output === 'object') {
      try {
        str = JSON.stringify(output);
      } catch (e) {
        str = String(output);
      }
    } else {
      str = String(output);
    }
    
    // 줄바꿈 제거하고 50자로 제한
    return str.replace(/\n/g, ' ').length > 50 ? str.replace(/\n/g, ' ').substring(0, 50) + '...' : str.replace(/\n/g, ' ');
  };

  const getNodeIcon = () => {
    switch (data.type) {
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

  const getBorderColor = () => {
    if (data.isExecuting) return 'border-blue-500';
    if (data.isCompleted) return 'border-green-500';
    if (selected) return 'border-blue-400';
    return 'border-gray-300';
  };

  const getBorderWidth = () => {
    if (data.isExecuting || data.isCompleted) return 'border-4';
    return 'border-2';
  };

  const getShadow = () => {
    if (data.isExecuting) return 'shadow-lg shadow-blue-500/30';
    if (data.isCompleted) return 'shadow-lg shadow-green-500/30';
    return 'shadow-md';
  };

  const getTaskStatusIcon = (status?: 'locked' | 'editable' | 'low_priority') => {
    switch (status) {
      case 'locked':
        return <Lock className="w-3 h-3" />;
      case 'editable':
        return <Circle className="w-3 h-3" />;
      case 'low_priority':
        return <Triangle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getTaskStatusColor = (status?: 'locked' | 'editable' | 'low_priority') => {
    switch (status) {
      case 'locked':
        return 'text-red-500';
      case 'editable':
        return 'text-green-500';
      case 'low_priority':
        return 'text-yellow-500';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div 
      className={`
        relative bg-white rounded-lg ${getShadow()} ${getBorderWidth()} ${getBorderColor()} 
        transition-all duration-300 hover:shadow-lg min-w-[200px]
        ${data.isDeactivated ? 'opacity-50' : ''}
      `}
    >
      {/* Handles - 좌우 연결 */}
      {data.type !== 'input' && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-gray-400 border-2 border-white"
          style={{ left: -6 }}
        />
      )}
      
      {data.type !== 'output' && (
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3 bg-gray-400 border-2 border-white"
          style={{ right: -6 }}
        />
      )}

      {/* 실행 중 스피너 */}
      {data.isExecuting && (
        <div className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        </div>
      )}

      {/* 완료 체크마크 */}
      {data.isCompleted && !data.isExecuting && (
        <div className="absolute -top-3 -right-3 bg-green-500 rounded-full p-1 shadow-lg">
          <svg className="w-4 h-4 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          {getNodeIcon()}
          <span className="font-semibold text-sm">{data.label || data.name || data.type}</span>
        </div>
        
        {/* Control Buttons */}
        <div className="flex items-center gap-1">
          {(data.type === 'worker' || data.type === 'supervisor' || data.type === 'planner') && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onToggleRun?.();
                }}
                className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                  data.isExecuting ? 'text-red-500' : 'text-green-500'
                }`}
                title={data.isExecuting ? 'Stop' : 'Run'}
              >
                {data.isExecuting ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  data.onDeactivate?.();
                }}
                className={`p-1 rounded hover:bg-gray-100 transition-colors ${
                  data.isDeactivated ? 'text-red-500' : 'text-gray-600'
                }`}
                title={data.isDeactivated ? 'Activate' : 'Deactivate'}
              >
                <Power className="w-4 h-4" />
              </button>
            </>
          )}
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onEdit?.();
            }}
            className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-600"
            title="Edit"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          {/* Input/Output 노드는 삭제 버튼 표시하지 않음 */}
          {data.type !== 'input' && data.type !== 'output' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.(id);
              }}
              className="p-1 rounded hover:bg-gray-100 transition-colors text-red-500"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Progress Bar */}
        {data.progress !== undefined && data.progress > 0 && data.progress < 1 && (
          <div className="mb-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${data.progress * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {Math.round(data.progress * 100)}%
            </p>
          </div>
        )}
        
        {/* Node specific content */}
        {data.type === 'input' && (
          <div className="text-sm text-gray-600">
            {data.inputConfig?.type || 'No input configured'}
          </div>
        )}
        
        {data.type === 'output' && (
          <div className="text-sm text-gray-600">
            {data.outputConfig?.type || 'No output configured'}
          </div>
        )}
        
        {data.type === 'worker' && (
          <div className="space-y-1">
            {data.tasks?.map((task, index) => (
              <div key={task.id} className="flex items-center gap-2 text-sm">
                <span className={`
                  w-2 h-2 rounded-full flex-shrink-0
                  ${['complete', 'completed'].includes(task.status as string) ? 'bg-green-500' : 
                    ['partial', 'inProgress'].includes(task.status as string) ? 'bg-blue-500' : 
                    'bg-gray-300'}
                `} />
                <span className="truncate text-gray-700 flex-1">
                  {task.text || `Task ${index + 1}`}
                </span>
                {task.taskStatus && (
                  <span className={`flex-shrink-0 ${getTaskStatusColor(task.taskStatus as 'locked' | 'editable' | 'low_priority')}`}>
                    {getTaskStatusIcon(task.taskStatus as 'locked' | 'editable' | 'low_priority')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        
        {(data.type === 'supervisor' || data.type === 'planner') && (
          <div className="text-sm text-gray-600">
            {data.code ? 'Code configured' : 'No code configured'}
          </div>
        )}
        
        {/* Output preview */}
        {data.output && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 overflow-hidden">
            <div className="truncate">Output: {getOutputPreview(data.output)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// default export도 추가 (호환성을 위해)
export default CustomNode;