import React, { useState, memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Search, Database, Brain, Globe, Download } from 'lucide-react';
import useWorkflowStore from '../../stores/workflowStore';

const WatcherNode = memo(({ data, id, selected }: NodeProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const { executeNode, updateNodeData } = useWorkflowStore();

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      const queries = data.searchQueries || [];
      queries.push({
        id: Date.now().toString(),
        query: searchQuery,
        timestamp: new Date().toISOString(),
        results: 0
      });
      updateNodeData(id, { searchQueries: queries });
      setSearchQuery('');
      executeNode(id, 'watcher');
    }
  };

  const getDataSize = () => {
    return data.collectedData?.reduce((sum: number, item: any) => sum + (item.size || 0), 0) || 0;
  };

  const getLoraReadyCount = () => {
    return data.loraTrainingData?.filter((item: any) => item.status === 'ready').length || 0;
  };

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 min-w-[300px] border-2 transition-all ${
        selected ? 'border-yellow-400 shadow-lg shadow-yellow-500/20' : 'border-yellow-500'
      }`}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 bg-yellow-500 border-2 border-gray-900" 
      />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
          <span className="text-white font-bold">Watcher Node</span>
        </div>
        <Globe className="w-4 h-4 text-yellow-400" />
      </div>
      
      {/* Search Input */}
      <div className="mb-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="검색어 입력..."
            className="flex-1 bg-gray-700 text-gray-200 text-sm px-3 py-2 rounded outline-none focus:ring-1 focus:ring-yellow-500"
          />
          <button
            onClick={handleSearch}
            className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-700 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <Database className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-gray-400">수집된 데이터</span>
          </div>
          <div className="text-lg font-bold text-yellow-300">
            {formatBytes(getDataSize())}
          </div>
        </div>
        
        <div className="bg-gray-700 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <Brain className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-gray-400">LoRA 학습 대기</span>
          </div>
          <div className="text-lg font-bold text-yellow-300">
            {getLoraReadyCount()}
          </div>
        </div>
      </div>
      
      {/* Recent Searches */}
      {data.searchQueries && data.searchQueries.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-1">최근 검색:</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {data.searchQueries.slice(-3).reverse().map((query: any) => (
              <div key={query.id} className="bg-gray-700 rounded p-2 flex items-center justify-between">
                <span className="text-xs text-gray-300 truncate flex-1">{query.query}</span>
                <span className="text-xs text-gray-500 ml-2">
                  {query.results || 0} 결과
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* LoRA Training Status */}
      {data.loraTrainingData && data.loraTrainingData.length > 0 && (
        <div className="p-2 bg-gray-700 rounded">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <Brain className="w-3 h-3 text-purple-400" />
              <span className="text-xs text-gray-400">LoRA 학습 상태</span>
            </div>
            <button className="text-xs text-yellow-400 hover:text-yellow-300">
              상세보기
            </button>
          </div>
          
          {data.loraTrainingData.slice(0, 2).map((lora: any) => (
            <div key={lora.id} className="mb-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-300">데이터셋 {lora.id}</span>
                <span className={`px-2 py-0.5 rounded ${
                  lora.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                  lora.status === 'training' ? 'bg-blue-500/20 text-blue-300' :
                  'bg-gray-500/20 text-gray-300'
                }`}>
                  {lora.status}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1 bg-gray-600 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 transition-all"
                    style={{ width: `${lora.status === 'completed' ? 100 : lora.status === 'training' ? 50 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  +{lora.estimatedImprovement}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="mt-3 flex gap-2">
        <button className="flex-1 py-1 px-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors flex items-center justify-center gap-1">
          <Download className="w-3 h-3" />
          데이터 내보내기
        </button>
      </div>
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 bg-yellow-500 border-2 border-gray-900" 
      />
    </div>
  );
});

WatcherNode.displayName = 'WatcherNode';

export default WatcherNode;