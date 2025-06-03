// frontend/src/components/flow/CustomNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  Play, Square, Trash2, MoreVertical, GripVertical, 
  Circle, X, Triangle, Power, Eye, Code, Database, Award 
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

  const handleLabelChange = () => {
    // Update label through the data.onUpdate callback
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

  return (
    <div
      className={`rounded-lg shadow-lg border-2 transition-all ${
        selected ? 'border-blue-500 shadow-xl' : getNodeColor()
      } ${isSmallNode ? 'w-32' : 'w-64'}`}
    >
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
                  onClick={toggleRun}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                  title={data.isRunning ? "Stop" : "Run"}
                >
                  {data.isRunning ? <Square className="w-4 h-4 text-red-500" /> : <Play className="w-4 h-4 text-green-500" />}
                </button>
                <button
                  onClick={() => data.onDelete?.(data.id)}
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
                    onClick={() => {
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
                        onClick={() => {
                          setIsEditingLabel(true);
                          setShowMenu(false);
                        }}
                        className="block px-4 py-2 hover:bg-gray-100 w-full text-left text-sm"
                      >
                        Rename
                      </button>
                      <button 
                        onClick={() => {
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
            className="text-lg font-semibold w-full border rounded px-1"
            autoFocus
          />
        ) : (
          <div 
            className="text-lg font-semibold cursor-pointer hover:text-blue-600"
            onDoubleClick={() => setIsEditingLabel(true)}
          >
            {data.label}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {(data.isRunning || (data.progress !== undefined && data.progress > 0)) && (
        <div className="px-3 py-1">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(data.progress || 0) * 100}%` }}
            />
          </div>
        </div>
      )}

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
    </div>
  );
});

CustomNode.displayName = 'CustomNode';