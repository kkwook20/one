// Related files:
// - frontend/src/App.tsx
// - frontend/src/types/index.ts
// - frontend/src/api/client.ts
// Location: frontend/src/components/NodeComponent.tsx

import React, { useState, useRef } from 'react';
import { 
  Play, Square, Trash2, MoreVertical, GripVertical, 
  Circle, X, Triangle, Power, Eye, Code, Database, Award
} from 'lucide-react';
import { Node, TaskItem } from '../types';
import { apiClient } from '../api/client';

interface NodeComponentProps {
  node: Node;
  onUpdate: (node: Node) => void;
  onDelete: (id: string) => void;
  onConnect: (fromId: string, toId: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (node: Node) => void;
  onStartConnection: (node: Node) => void;
  progress?: number;
}

export const NodeComponent: React.FC<NodeComponentProps> = ({ 
  node, onUpdate, onDelete, onConnect, isSelected, onSelect, onEdit, onStartConnection, progress 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const handleLabelChange = (newLabel: string) => {
    onUpdate({ ...node, label: newLabel });
    setIsEditing(false);
  };

  const toggleRun = async () => {
    if (node.isRunning) {
      await apiClient.stopNode(node.id);
      onUpdate({ ...node, isRunning: false });
    } else {
      onUpdate({ ...node, isRunning: true });
      await apiClient.executeNode(node.id, 'current', node.code || '', {});
    }
  };

  const toggleDeactivate = async () => {
    await apiClient.deactivateNode(node.id, 'current');
    onUpdate({ ...node, isDeactivated: !node.isDeactivated });
  };

  const handleTaskUpdate = (taskId: string, updates: Partial<TaskItem>) => {
    if (!node.tasks) return;
    const updatedTasks = node.tasks.map(task =>
      task.id === taskId ? { ...task, ...updates } : task
    );
    onUpdate({ ...node, tasks: updatedTasks });
  };

  const handleTaskAdd = () => {
    const newTask: TaskItem = {
      id: Date.now().toString(),
      text: '',
      status: 'none'
    };
    onUpdate({ ...node, tasks: [...(node.tasks || []), newTask] });
  };

  const getStatusIcon = (status: TaskItem['status']) => {
    switch (status) {
      case 'pending': return <Circle className="w-4 h-4" />;
      case 'none': return <X className="w-4 h-4" />;
      case 'partial': return <Triangle className="w-4 h-4" />;
    }
  };

  const cycleStatus = (currentStatus: TaskItem['status']): TaskItem['status'] => {
    const statusOrder: TaskItem['status'][] = ['pending', 'none', 'partial'];
    const currentIndex = statusOrder.indexOf(currentStatus);
    return statusOrder[(currentIndex + 1) % statusOrder.length];
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (!draggedTaskId || !node.tasks) return;

    const draggedIndex = node.tasks.findIndex(t => t.id === draggedTaskId);
    if (draggedIndex === -1) return;

    const newTasks = [...node.tasks];
    const [removed] = newTasks.splice(draggedIndex, 1);
    newTasks.splice(dropIndex, 0, removed);

    onUpdate({ ...node, tasks: newTasks });
    setDraggedTaskId(null);
  };

  const handleNodeDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('nodeId', node.id);
    e.dataTransfer.setData('nodeType', node.type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const getNodeColor = () => {
    if (node.isDeactivated) return 'bg-gray-200 border-gray-400 opacity-50';
    switch (node.type) {
      case 'supervisor': return 'bg-purple-50 border-purple-400';
      case 'planner': return 'bg-green-50 border-green-400';
      case 'input': return 'bg-blue-50 border-blue-400';
      case 'output': return 'bg-orange-50 border-orange-400';
      default: return 'bg-white border-gray-300';
    }
  };

  return (
    <div
      ref={nodeRef}
      className={`absolute rounded-lg shadow-lg border-2 transition-all ${
        isSelected ? 'border-blue-500 shadow-xl z-20' : getNodeColor()
      } ${node.type === 'input' || node.type === 'output' ? 'w-32' : 'w-64'}`}
      style={{ left: node.position.x, top: node.position.y }}
      onClick={() => onSelect(node.id)}
      draggable={node.type === 'worker'}
      onDragStart={handleNodeDragStart}
    >
      {/* Connection Handles */}
      {node.type !== 'output' && (
        <div
          className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full cursor-crosshair hover:scale-125 transition-transform"
          onMouseDown={(e) => {
            e.stopPropagation();
            onStartConnection(node);
          }}
        />
      )}
      {node.type !== 'input' && (
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-gray-400 rounded-full" />
      )}

      {/* Node Header */}
      <div className="p-3 border-b bg-opacity-70 rounded-t-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            <button
              onClick={toggleRun}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
              title={node.isRunning ? "Stop" : "Run"}
            >
              {node.isRunning ? <Square className="w-4 h-4 text-red-500" /> : <Play className="w-4 h-4 text-green-500" />}
            </button>
            <button
              onClick={() => onDelete(node.id)}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
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
                      onEdit(node);
                      setShowMenu(false);
                    }}
                    className="block px-4 py-2 hover:bg-gray-100 w-full text-left text-sm"
                  >
                    Open
                  </button>
                  <button 
                    onClick={() => {
                      setIsEditing(true);
                      setShowMenu(false);
                    }}
                    className="block px-4 py-2 hover:bg-gray-100 w-full text-left text-sm"
                  >
                    Rename
                  </button>
                  <button 
                    onClick={() => {
                      toggleDeactivate();
                      setShowMenu(false);
                    }}
                    className="block px-4 py-2 hover:bg-gray-100 w-full text-left text-sm"
                  >
                    {node.isDeactivated ? 'Activate' : 'Deactivate'}
                  </button>
                  <hr className="my-1" />
                  <button 
                    onClick={() => {
                      onDelete(node.id);
                      setShowMenu(false);
                    }}
                    className="block px-4 py-2 hover:bg-gray-100 w-full text-left text-red-600 text-sm"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Icons for special features */}
          <div className="flex gap-1">
            {node.isDeactivated && (
              <span title="Deactivated">
                <Power className="w-4 h-4 text-gray-500" />
              </span>
            )}
            {node.model && node.model !== 'none' && (
              <span title={`AI: ${node.model}`}>
                <Eye className="w-4 h-4 text-purple-500" />
              </span>
            )}
            {node.vectorDB && (
              <span title={`DB: ${node.vectorDB.name}`}>
                <Database className="w-4 h-4 text-green-500" />
              </span>
            )}
            {node.code && (
              <span title="Has code">
                <Code className="w-4 h-4 text-blue-500" />
              </span>
            )}
            {node.aiScore && (
              <span title={`Score: ${node.aiScore}/100`}>
                <Award className="w-4 h-4 text-yellow-500" />
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-500 uppercase">{node.type}</div>
        {isEditing ? (
          <input
            type="text"
            value={node.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            onBlur={() => setIsEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setIsEditing(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-lg font-semibold w-full border rounded px-1"
            autoFocus
          />
        ) : (
          <div 
            className="text-lg font-semibold cursor-pointer hover:text-blue-600"
            onDoubleClick={() => setIsEditing(true)}
          >
            {node.label}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {(node.isRunning || (progress !== undefined && progress > 0)) && (
        <div className="px-3 py-1">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(progress || 0) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Task List for Worker Nodes */}
      {node.type === 'worker' && (
        <div className="p-3 border-t">
          <div className="space-y-1">
            {node.tasks?.map((task, index) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-move"
              >
                <GripVertical className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                <input
                  type="text"
                  value={task.text}
                  onChange={(e) => handleTaskUpdate(task.id, { text: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 text-sm border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none"
                  placeholder="Task description..."
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTaskUpdate(task.id, { status: cycleStatus(task.status) });
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                  title={`Status: ${task.status}`}
                >
                  {getStatusIcon(task.status)}
                </button>
              </div>
            ))}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTaskAdd();
              }}
              className="text-sm text-blue-500 hover:text-blue-700 pl-8"
            >
              + Add task
            </button>
          </div>
        </div>
      )}
    </div>
  );
};