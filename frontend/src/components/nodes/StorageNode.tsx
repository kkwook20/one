import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { HardDrive, FolderOpen, Settings, RefreshCw, Edit2 } from 'lucide-react';
import useWorkflowStore from '../../stores/workflowStore';

const StorageNode = memo(({ data, id, selected }: NodeProps) => {
  const [storagePath, setStoragePath] = useState(data.storagePath || './storage');
  const [isEditing, setIsEditing] = useState(false);
  const [diskInfo, setDiskInfo] = useState({ used: 0, total: 0, free: 0 });
  
  const { executeNode, updateNodeData } = useWorkflowStore();

  // 디스크 정보 가져오기 (실제로는 API 호출)
  useEffect(() => {
    // 시뮬레이션 데이터 - 실제로는 백엔드 API 호출
    setDiskInfo({
      total: 500 * 1024 * 1024 * 1024, // 500GB
      used: 320 * 1024 * 1024 * 1024, // 320GB
      free: 180 * 1024 * 1024 * 1024  // 180GB
    });
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getUsagePercentage = () => {
    return Math.round((diskInfo.used / diskInfo.total) * 100) || 0;
  };

  const handlePathSave = () => {
    updateNodeData(id, { storagePath });
    setIsEditing(false);
  };

  return (
    <div
      className={`bg-gray-900/90 backdrop-blur rounded-2xl p-5 min-w-[340px] border transition-all ${
        selected 
          ? 'border-gray-600 shadow-2xl shadow-gray-900/50 scale-105' 
          : 'border-gray-800 hover:border-gray-700 shadow-xl'
      }`}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="!bg-gray-600 !w-2 !h-2 !border-gray-900" 
      />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center shadow-lg">
            <HardDrive className="w-5 h-5 text-gray-300" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Storage Node</h3>
            <p className="text-xs text-gray-500">Disk & File Management</p>
          </div>
        </div>
        <button
          onClick={() => executeNode(id, 'storage')}
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      
      {/* Disk Usage */}
      <div className="bg-gray-800/50 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">System Disk</span>
          <span className="text-sm font-medium text-gray-300">{getUsagePercentage()}%</span>
        </div>
        
        <div className="space-y-2">
          <div className="h-3 bg-gray-900 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                getUsagePercentage() > 90 ? 'bg-gradient-to-r from-red-500 to-red-600' :
                getUsagePercentage() > 70 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                'bg-gradient-to-r from-blue-500 to-blue-600'
              }`}
              style={{ width: `${getUsagePercentage()}%` }}
            />
          </div>
          
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">
              Used: <span className="text-gray-400">{formatBytes(diskInfo.used)}</span>
            </span>
            <span className="text-gray-500">
              Free: <span className="text-green-400">{formatBytes(diskInfo.free)}</span>
            </span>
          </div>
        </div>
      </div>
      
      {/* Storage Path */}
      <div className="bg-gray-800/50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Storage Path</span>
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-1 rounded hover:bg-gray-700 transition-colors"
          >
            <Edit2 className="w-3 h-3 text-gray-500" />
          </button>
        </div>
        
        {isEditing ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={storagePath}
              onChange={(e) => setStoragePath(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handlePathSave()}
            />
            <button
              onClick={handlePathSave}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="px-3 py-1.5 bg-gray-900/50 rounded-lg">
            <code className="text-sm text-blue-400">{storagePath}</code>
          </div>
        )}
      </div>
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="!bg-gray-600 !w-2 !h-2 !border-gray-900" 
      />
    </div>
  );
});

StorageNode.displayName = 'StorageNode';

export default StorageNode;