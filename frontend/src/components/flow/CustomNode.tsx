// frontend/src/components/flow/CustomNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  Play, Square, Trash2, MoreVertical, GripVertical, 
  Circle, X, Triangle, Power, Eye, Code, Database, Award, Loader, CheckCircle
} from 'lucide-react';
import { Node, TaskItem } from '../../types';

export const CustomNode = memo<NodeProps<Node>>(({ data, selected }) => {
  const [showMenu, setShowMenu] = React.useState(false);
  const [isEditingLabel, setIsEditingLabel] = React.useState(false);
  const [label, setLabel] = React.useState(data.label);

  const getNodeColor = () => {
    if (data.isDeactivated) return 'bg-gray-200 border-gray-400 opacity-50';
    
    switch (data.type) {
      case 'supervisor': return 'bg-purple-50 border-purple-400';
      case 'planner': return 'bg-green-50 border-green-400';
      case 'input': return 'bg-blue-50 border-blue-400';
      case 'output': return 'bg-orange-50 border-orange-400';
      default: return 'bg-white border-gray-300';
    }
  };

  const getNodeBorderStyle = () => {
    if (data.progress === 1) {
      return 'border-green-500 border-4 shadow-green-200';
    }
    if (data.isExecuting || (data.progress !== undefined && data.progress > 0 && data.progress < 1)) {
      return 'border-blue-500 border-4 shadow-blue-200 animate-pulse';
    }
    return '';
  };

  const handleLabelChange = () => {
    if (data.onUpdate) {
      data.onUpdate({ ...data, label });
    }
    setIsEditingLabel(false);
  };

  const toggleRun = () => {
    if (data.onToggleRun) {
      data.onToggleRun();
    }
  };

  const getStatusIcon = (status: TaskItem['status']) => {
    switch (status) {
      case 'pending': return <Circle className="w-4 h-4" />;
      case 'none': return <X className="w-4 h-4" />;
      case 'partial': return <Triangle className="w-4 h-4" />;
    }
  };

  const isSmallNode = data.type === 'input' || data.type === 'output';

  // 더블클릭 핸들러
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onEdit) {
      data.onEdit(data);
    }
  };

  return (
    <div
      className={`rounded-lg shadow-lg border-2 transition-all relative ${
        selected ? 'border-blue-500 shadow-xl' : getNodeColor()
      } ${getNodeBorderStyle()} ${isSmallNode ? 'w-32' : 'w-64'}`}
      onDoubleClick={handleDoubleClick}
    >
      {/* n8n 스타일 실행 중 표시 */}
      {data.isExecuting && (
        <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-2 py-1 rounded-full text-xs font-medium animate-bounce">
          <div className="flex items-center gap-1">
            <Loader className="w-3 h-3 animate-spin" />
            Executing
          </div>
        </div>
      )}

      {/* 완료 표시 */}
      {data.progress === 1 && (
        <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium">
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Done
          </div>
        </div>
      )}

      {/* 에러 표시 */}
      {data.error && (
        <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-medium">
          Error!
        </div>
      )}

      {/* Handles for connections */}
      {data.type !== 'input' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-gray-400"
          style={{ width: 16, height: 16 }}
        />
      )}
      {data.type !== 'output' && (
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-blue-500"
          style={{ width: 16, height: 16 }}
        />
      )}

      {/* Node Header */}
      <div className="p-3 border-b bg-opacity-70 rounded-t-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            {data.type !== 'input' && data.type !== 'output' && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRun();
                  }}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                  title={data.isRunning ? "Stop" : "Run"}
                >
                  {data.isRunning || data.isExecuting ? 
                    <Square className="w-4 h-4 text-red-500" /> : 
                    <Play className="w-4 h-4 text-green-500" />
                  }
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onDelete?.(data.id);
                  }}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </>
            )}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-1 bg-white border rounded shadow-lg z-50 w-32">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onEdit?.(data);
                      setShowMenu(false);
                    }}
                    className="block px-4 py-2 hover:bg-gray-100 w-full text-left text-sm"
                  >
                    Open
                  </button>
                  {data.type !== 'input' && data.type !== 'output' && (
                    <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditingLabel(true);
                          setShowMenu(false);
                        }}
                        className="block px-4 py-2 hover:bg-gray-100 w-full text-left text-sm"
                      >
                        Rename
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          data.onDeactivate?.(data.id);
                          setShowMenu(false);
                        }}
                        className="block px-4 py-2 hover:bg-gray-100 w-full text-left text-sm"
                      >
                        {data.isDeactivated ? 'Activate' : 'Deactivate'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Status Icons */}
          <div className="flex gap-1">
            {data.isDeactivated && <Power className="w-4 h-4 text-gray-500" />}
            {data.model && data.model !== 'none' && <Eye className="w-4 h-4 text-purple-500" />}
            {data.vectorDB && <Database className="w-4 h-4 text-green-500" />}
            {data.code && <Code className="w-4 h-4 text-blue-500" />}
            {data.aiScore && <Award className="w-4 h-4 text-yellow-500" />}
          </div>
        </div>
        
        <div className="text-xs text-gray-500 uppercase">{data.type}</div>
        {isEditingLabel ? (
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleLabelChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLabelChange();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-lg font-semibold w-full border rounded px-1"
            autoFocus
          />
        ) : (
          <div className="text-lg font-semibold">
            {data.label}
          </div>
        )}
      </div>

      {/* Task List for Worker Nodes */}
      {data.type === 'worker' && data.tasks && (
        <div className="p-3 border-t">
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {data.tasks.map((task, index) => (
              <div
                key={task.id}
                className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded"
              >
                <GripVertical className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                <span className="flex-1 text-sm truncate">{task.text || 'Empty task'}</span>
                <span className="p-1">
                  {getStatusIcon(task.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output/Error Display */}
      {(data.output || data.error) && (
        <div className={`p-2 text-xs ${data.error ? 'bg-red-50' : 'bg-green-50'} rounded-b-lg`}>
          {data.error ? (
            <div className="text-red-600">
              <strong>Error:</strong> {data.error}
            </div>
          ) : (
            <div className="text-green-600">
              <strong>Output:</strong> {typeof data.output === 'object' ? 'Data received' : data.output}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

CustomNode.displayName = 'CustomNode';