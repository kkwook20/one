import React, { useState, memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitBranch, Settings, RefreshCw, List } from 'lucide-react';
import useWorkflowStore from '../../stores/workflowStore';

const SupervisorNode = memo(({ data, id, selected }: NodeProps) => {
  const [targetNodes, setTargetNodes] = useState<string[]>(data.targetNodes || []);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const { executeNode, updateNodeData, nodes } = useWorkflowStore();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    
    const nodeId = e.dataTransfer.getData('nodeId');
    if (nodeId && !targetNodes.includes(nodeId)) {
      const updatedNodes = [...targetNodes, nodeId];
      setTargetNodes(updatedNodes);
      updateNodeData(id, { targetNodes: updatedNodes });
    }
  }, [targetNodes, id, updateNodeData]);

  const removeTargetNode = (nodeId: string) => {
    const updatedNodes = targetNodes.filter(n => n !== nodeId);
    setTargetNodes(updatedNodes);
    updateNodeData(id, { targetNodes: updatedNodes });
  };

  const getNodeName = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.data?.label || nodeId;
  };

  const getCompletionRate = (nodeId: string) => {
    // 실제로는 planner 노드에서 평가한 값을 가져옴
    return Math.floor(Math.random() * 100);
  };

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 min-w-[280px] border-2 transition-all ${
        selected ? 'border-purple-400 shadow-lg shadow-purple-500/20' : 'border-purple-500'
      }`}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 bg-purple-500 border-2 border-gray-900" 
      />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
          <span className="text-white font-bold">Supervisor Node</span>
        </div>
        <button
          onClick={() => executeNode(id, 'supervisor')}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
          title="Execute supervision"
        >
          <RefreshCw className="w-4 h-4 text-purple-400" />
        </button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-700 rounded p-2">
          <div className="text-xs text-gray-400">관리 중</div>
          <div className="text-lg font-bold text-purple-300">{targetNodes.length}</div>
        </div>
        <div className="bg-gray-700 rounded p-2">
          <div className="text-xs text-gray-400">수정 이력</div>
          <div className="text-lg font-bold text-purple-300">
            {data.modificationHistory?.length || 0}
          </div>
        </div>
      </div>
      
      {/* Target nodes list */}
      {targetNodes.length > 0 && (
        <div className="mb-3 space-y-1">
          <div className="text-xs text-gray-400 mb-1">관리 대상 노드:</div>
          {targetNodes.map(nodeId => (
            <div 
              key={nodeId}
              className="flex items-center justify-between p-2 bg-gray-700 rounded text-sm group"
            >
              <span className="text-gray-300 flex-1">{getNodeName(nodeId)}</span>
              <div className="flex items-center gap-2">
                <div className="relative w-12 h-2 bg-gray-600 rounded-full overflow-hidden">
                  <div 
                    className="absolute inset-y-0 left-0 bg-purple-500"
                    style={{ width: `${getCompletionRate(nodeId)}%` }}
                  />
                </div>
                <button
                  onClick={() => removeTargetNode(nodeId)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`p-4 border-2 border-dashed rounded transition-all ${
          isDraggingOver 
            ? 'border-purple-400 bg-purple-500/10' 
            : 'border-gray-600 hover:border-gray-500'
        }`}
      >
        <div className="text-center">
          <GitBranch className="w-6 h-6 text-gray-500 mx-auto mb-1" />
          <div className="text-xs text-gray-500">
            노드를 드래그하여 추가
          </div>
        </div>
      </div>
      
      {/* Last modification */}
      {data.modificationHistory?.length > 0 && (
        <div className="mt-3 p-2 bg-gray-700 rounded">
          <div className="text-xs text-gray-400">최근 수정:</div>
          <div className="text-xs text-gray-300 mt-1">
            {data.modificationHistory[0].changes}
          </div>
        </div>
      )}
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 bg-purple-500 border-2 border-gray-900" 
      />
    </div>
  );
});

SupervisorNode.displayName = 'SupervisorNode';

export default SupervisorNode;