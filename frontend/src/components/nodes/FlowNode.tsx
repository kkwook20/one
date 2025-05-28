import React, { useState, memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Play, Square, ListOrdered, Loader2, CheckCircle, XCircle } from 'lucide-react';
import useWorkflowStore from '../../stores/workflowStore';

const FlowNode = memo(({ data, id, selected }: NodeProps) => {
  const [isRunning, setIsRunning] = useState(false);
  const [executionList, setExecutionList] = useState<any[]>(data.executionList || []);
  const [managerNodes, setManagerNodes] = useState<string[]>(data.managerNodes || []);
  
  const { executeFlow, stopExecution, updateNodeData, nodes } = useWorkflowStore();

  const handleExecute = useCallback(() => {
    if (isRunning) {
      stopExecution(id);
      setIsRunning(false);
    } else {
      setIsRunning(true);
      const nodeIds = executionList.map(item => item.nodeId);
      executeFlow(id, nodeIds);
    }
  }, [isRunning, id, executionList, executeFlow, stopExecution]);

  const handleDrop = useCallback((e: React.DragEvent, isManager: boolean = false) => {
    e.preventDefault();
    const nodeId = e.dataTransfer.getData('nodeId');
    const node = nodes.find(n => n.id === nodeId);
    
    if (node) {
      if (isManager && ['supervisor', 'planner', 'watcher', 'scheduler'].includes(node.type || '')) {
        if (!managerNodes.includes(nodeId)) {
          const updated = [...managerNodes, nodeId];
          setManagerNodes(updated);
          updateNodeData(id, { managerNodes: updated });
        }
      } else if (!isManager && node.type === 'worker') {
        if (!executionList.find(item => item.nodeId === nodeId)) {
          const newItem = {
            nodeId,
            order: executionList.length,
            status: 'waiting',
            progress: 0
          };
          const updated = [...executionList, newItem];
          setExecutionList(updated);
          updateNodeData(id, { executionList: updated });
        }
      }
    }
  }, [nodes, executionList, managerNodes, id, updateNodeData]);

  const removeFromList = (nodeId: string, isManager: boolean = false) => {
    if (isManager) {
      const updated = managerNodes.filter(n => n !== nodeId);
      setManagerNodes(updated);
      updateNodeData(id, { managerNodes: updated });
    } else {
      const updated = executionList.filter(item => item.nodeId !== nodeId);
      setExecutionList(updated);
      updateNodeData(id, { executionList: updated });
    }
  };

  const getNodeInfo = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return {
      label: node?.data?.label || nodeId,
      type: node?.type || 'unknown'
    };
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader2 className="w-3 h-3 animate-spin text-blue-400" />;
      case 'completed': return <CheckCircle className="w-3 h-3 text-green-400" />;
      case 'error': return <XCircle className="w-3 h-3 text-red-400" />;
      default: return <div className="w-3 h-3 rounded-full bg-gray-500" />;
    }
  };

  const getTotalProgress = () => {
    if (executionList.length === 0) return 0;
    const totalProgress = executionList.reduce((sum, item) => sum + (item.progress || 0), 0);
    return Math.round(totalProgress / executionList.length);
  };

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 min-w-[320px] border-2 transition-all ${
        selected ? 'border-red-400 shadow-lg shadow-red-500/20' : 'border-red-500'
      }`}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 bg-red-500 border-2 border-gray-900" 
      />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 bg-red-500 rounded-full ${isRunning ? 'animate-pulse' : ''}`} />
          <span className="text-white font-bold">Flow Node</span>
        </div>
        <button
          onClick={handleExecute}
          className={`px-4 py-1.5 rounded font-semibold transition-all flex items-center gap-2 ${
            isRunning 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isRunning ? (
            <>
              <Square className="w-4 h-4" />
              Stop
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Execute
            </>
          )}
        </button>
      </div>
      
      {/* Progress Bar */}
      {isRunning && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>전체 진행률</span>
            <span>{getTotalProgress()}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-500"
              style={{ width: `${getTotalProgress()}%` }}
            />
          </div>
        </div>
      )}
      
      {/* Execution List */}
      <div className="mb-3">
        <div className="flex items-center gap-1 mb-2">
          <ListOrdered className="w-3 h-3 text-gray-400" />
          <span className="text-xs text-gray-400">실행 목록 ({executionList.length})</span>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, false)}
          className="space-y-1 min-h-[60px] p-2 bg-gray-700 rounded"
        >
          {executionList.length === 0 ? (
            <div className="text-center text-xs text-gray-500 py-4">
              Worker 노드를 드래그하여 추가
            </div>
          ) : (
            executionList.map((item, idx) => {
              const nodeInfo = getNodeInfo(item.nodeId);
              return (
                <div key={item.nodeId} className="flex items-center gap-2 p-2 bg-gray-600 rounded group">
                  <span className="text-xs text-gray-400 w-6">{idx + 1}</span>
                  {getStatusIcon(item.status)}
                  <span className="text-sm text-gray-200 flex-1 truncate">{nodeInfo.label}</span>
                  <div className="w-12 h-1 bg-gray-500 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-400 transition-all"
                      style={{ width: `${item.progress || 0}%` }}
                    />
                  </div>
                  <button
                    onClick={() => removeFromList(item.nodeId)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all"
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
      
      {/* Manager Nodes */}
      <div>
        <div className="flex items-center gap-1 mb-2">
          <ListOrdered className="w-3 h-3 text-gray-400" />
          <span className="text-xs text-gray-400">관리 노드 ({managerNodes.length})</span>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, true)}
          className="space-y-1 min-h-[40px] p-2 bg-gray-700 rounded"
        >
          {managerNodes.length === 0 ? (
            <div className="text-center text-xs text-gray-500 py-2">
              관리 노드를 드래그하여 추가
            </div>
          ) : (
            managerNodes.map((nodeId) => {
              const nodeInfo = getNodeInfo(nodeId);
              return (
                <div key={nodeId} className="flex items-center gap-2 p-1.5 bg-gray-600 rounded group">
                  <div className={`w-2 h-2 rounded-full ${
                    nodeInfo.type === 'supervisor' ? 'bg-purple-500' :
                    nodeInfo.type === 'planner' ? 'bg-green-500' :
                    nodeInfo.type === 'watcher' ? 'bg-yellow-500' :
                    nodeInfo.type === 'scheduler' ? 'bg-pink-500' :
                    'bg-gray-500'
                  }`} />
                  <span className="text-xs text-gray-200 flex-1 truncate">{nodeInfo.label}</span>
                  <button
                    onClick={() => removeFromList(nodeId, true)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all text-sm"
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
      
      {/* Estimated Time */}
      {executionList.length > 0 && (
        <div className="mt-3 text-center">
          <span className="text-xs text-gray-400">예상 완료 시간: </span>
          <span className="text-xs text-red-300 font-medium">
            {data.estimatedCompletionTime || '계산 중...'}
          </span>
        </div>
      )}
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 bg-red-500 border-2 border-gray-900" 
      />
    </div>
  );
});

FlowNode.displayName = 'FlowNode';

export default FlowNode;