import React, { useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MoreVertical, Sparkles, Play, Circle, X, Triangle } from 'lucide-react';
import useWorkflowStore from '../../stores/workflowStore';

interface TaskItem {
  id: string;
  text: string;
  status: 'active' | 'skip' | 'partial';
  subtasks?: TaskItem[];
}

interface BaseNodeProps extends NodeProps {
  nodeType: string;
  nodeColor: string;
  children: React.ReactNode;
  taskItems?: TaskItem[];
  onEdit?: () => void;
}

export const BaseNode: React.FC<BaseNodeProps> = ({ 
  id, 
  data, 
  selected, 
  nodeType, 
  nodeColor,
  children,
  taskItems = [],
  onEdit
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const { executeNode, updateNodeData } = useWorkflowStore();

  const handleExecute = useCallback(async () => {
    setIsExecuting(true);
    await executeNode(id, nodeType);
    setIsExecuting(false);
  }, [id, nodeType, executeNode]);

  const handleAI = useCallback(() => {
    // AI 기능 - 나중에 구현
    console.log('AI assist for node:', id);
  }, [id]);

  const getTaskIcon = (status: TaskItem['status']) => {
    switch (status) {
      case 'active': return <Circle className="w-3 h-3" />;
      case 'skip': return <X className="w-3 h-3" />;
      case 'partial': return <Triangle className="w-3 h-3" />;
    }
  };

  return (
    <div
      className={`bg-gray-800 rounded-lg min-w-[280px] border-2 transition-all ${
        selected ? 'shadow-lg' : ''
      }`}
      style={{
        borderColor: selected ? nodeColor : `${nodeColor}88`,
        boxShadow: selected ? `0 0 20px ${nodeColor}44` : undefined
      }}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 border-2 border-gray-900" 
        style={{ backgroundColor: nodeColor }}
      />
      
      {/* 상단 3버튼 */}
      <div className="flex items-center justify-between p-2 border-b border-gray-700">
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
          >
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
          
          {/* 드롭다운 메뉴 */}
          {showMenu && (
            <div className="absolute top-8 left-0 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[150px]">
              <button
                onClick={() => {
                  onEdit?.();
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Edit Code
              </button>
              <button
                onClick={() => {
                  // 복사 기능
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Duplicate
              </button>
              <button
                onClick={() => {
                  // 삭제 기능
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-800 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={handleAI}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
            title="AI Assist"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
          </button>
          
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className={`p-1.5 rounded transition-colors ${
              isExecuting 
                ? 'bg-gray-700 cursor-not-allowed' 
                : 'hover:bg-gray-700'
            }`}
            title="Execute"
          >
            {isExecuting ? (
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-4 h-4 text-green-400" />
            )}
          </button>
        </div>
      </div>
      
      {/* 작업 항목 목록 */}
      {taskItems.length > 0 && (
        <div className="p-2 border-b border-gray-700">
          <div className="space-y-1">
            {taskItems.map((task) => (
              <div key={task.id} className="flex items-start gap-2">
                <div className="mt-0.5" style={{ color: nodeColor }}>
                  {getTaskIcon(task.status)}
                </div>
                <span className="text-xs text-gray-300 flex-1">{task.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 노드별 커스텀 콘텐츠 */}
      {children}
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 border-2 border-gray-900" 
        style={{ backgroundColor: nodeColor }}
      />
    </div>
  );
};