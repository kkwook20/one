import React, { useState, memo, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { HardDrive, FolderOpen, RefreshCw } from 'lucide-react';
import { BaseNode } from './BaseNode';
import useWorkflowStore from '../../stores/workflowStore';

const StorageNode = memo(({ data, id, selected }: NodeProps) => {
  const [showEditor, setShowEditor] = useState(false);
  const { executeNode, updateNodeData } = useWorkflowStore();

  const taskItems = data.cleanupTasks?.map((task: any) => ({
    id: task.id,
    text: `${task.action} - ${task.category}`,
    status: task.status === 'completed' ? 'active' : 
            task.status === 'failed' ? 'skip' : 'partial' as any
  })) || [];

  const handleEdit = useCallback(() => {
    setShowEditor(true);
  }, []);

  const getUsagePercentage = () => {
    // 시뮬레이션 데이터
    return 65;
  };

  return (
    <>
      <BaseNode
        id={id}
        data={data}
        selected={selected}
        nodeType="storage"
        nodeColor="#6b7280"
        taskItems={taskItems}
        onEdit={handleEdit}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Storage Node</span>
            <HardDrive className="w-4 h-4 text-gray-400" />
          </div>
          
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">디스크 사용률</span>
              <span className="text-gray-300">{getUsagePercentage()}%</span>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-gray-500 to-gray-600 transition-all"
                style={{ width: `${getUsagePercentage()}%` }}
              />
            </div>
          </div>
          
          <div className="text-xs text-gray-400">
            경로: {data.storagePath || './storage'}
          </div>
        </div>
      </BaseNode>

      {/* Storage 에디터 모달 */}
      {showEditor && (
        <StorageEditor
          nodeId={id}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
});

// Storage 에디터
const StorageEditor: React.FC<{ nodeId: string; onClose: () => void }> = ({ 
  nodeId, 
  onClose 
}) => {
  const { nodes, updateNodeData, executeNode } = useWorkflowStore();
  const node = nodes.find(n => n.id === nodeId);
  
  const [storagePath, setStoragePath] = useState(node?.data?.storagePath || './storage');

  const handleSave = () => {
    updateNodeData(nodeId, { storagePath });
    onClose();
  };

  const handleRefresh = async () => {
    await executeNode(nodeId, 'storage');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl bg-gray-900 rounded-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Storage Configuration</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="p-6 space-y-4">
          {/* 스토리지 경로 */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              스토리지 경로
            </label>
            <input
              type="text"
              value={storagePath}
              onChange={(e) => setStoragePath(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 text-gray-300 rounded outline-none"
            />
          </div>

          {/* 스토리지 카테고리 */}
          {node?.data?.storageCategories && node.data.storageCategories.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">스토리지 카테고리</h3>
              <div className="grid grid-cols-2 gap-3">
                {node.data.storageCategories.map((cat: any) => (
                  <div key={cat.name} className="bg-gray-800 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white">{cat.name}</span>
                      <span className="text-xs text-gray-400">{cat.retentionPolicy}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {cat.fileCount} 파일 • {(cat.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>