import React, { useState, memo, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Search, Database, Brain, Globe } from 'lucide-react';
import { BaseNode } from './BaseNode';
import useWorkflowStore from '../../stores/workflowStore';

const WatcherNode = memo(({ data, id, selected }: NodeProps) => {
  const [showEditor, setShowEditor] = useState(false);
  const { executeNode, updateNodeData } = useWorkflowStore();

  const taskItems = data.searchQueries?.slice(-3).map((query: any) => ({
    id: query.id,
    text: query.query,
    status: query.results > 0 ? 'active' : 'skip' as any
  })) || [];

  const handleEdit = useCallback(() => {
    setShowEditor(true);
  }, []);

  const getDataSize = () => {
    const bytes = data.collectedData?.reduce((sum: number, item: any) => sum + (item.size || 0), 0) || 0;
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <>
      <BaseNode
        id={id}
        data={data}
        selected={selected}
        nodeType="watcher"
        nodeColor="#f59e0b"
        taskItems={taskItems}
        onEdit={handleEdit}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Watcher Node</span>
            <Globe className="w-4 h-4 text-yellow-400" />
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-400">수집된 데이터</div>
              <div className="text-yellow-300 font-medium">{getDataSize()}</div>
            </div>
            <div>
              <div className="text-gray-400">LoRA 준비</div>
              <div className="text-yellow-300 font-medium">
                {data.loraTrainingData?.filter((d: any) => d.status === 'ready').length || 0}
              </div>
            </div>
          </div>
        </div>
      </BaseNode>

      {/* Watcher 에디터 모달 */}
      {showEditor && (
        <WatcherEditor
          nodeId={id}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
});

// Watcher 에디터
const WatcherEditor: React.FC<{ nodeId: string; onClose: () => void }> = ({ 
  nodeId, 
  onClose 
}) => {
  const { nodes, updateNodeData, executeNode } = useWorkflowStore();
  const node = nodes.find(n => n.id === nodeId);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueries, setSearchQueries] = useState(node?.data?.searchQueries || []);

  const handleAddQuery = () => {
    if (searchQuery.trim()) {
      const newQuery = {
        id: Date.now().toString(),
        query: searchQuery,
        results: 0,
        timestamp: new Date().toISOString()
      };
      setSearchQueries([...searchQueries, newQuery]);
      setSearchQuery('');
    }
  };

  const handleSave = () => {
    updateNodeData(nodeId, { searchQueries });
    onClose();
  };

  const handleSearch = async () => {
    await handleSave();
    await executeNode(nodeId, 'watcher');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl bg-gray-900 rounded-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Watcher Configuration</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="p-6 space-y-4">
          {/* 검색 쿼리 추가 */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              검색 쿼리 추가
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddQuery()}
                placeholder="검색어를 입력하세요..."
                className="flex-1 px-3 py-2 bg-gray-800 text-gray-300 rounded outline-none"
              />
              <button
                onClick={handleAddQuery}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
              >
                추가
              </button>
            </div>
          </div>

          {/* 검색 쿼리 목록 */}
          {searchQueries.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">검색 쿼리 목록</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {searchQueries.map((query: any) => (
                  <div key={query.id} className="flex items-center justify-between p-2 bg-gray-800 rounded">
                    <span className="text-sm text-gray-300">{query.query}</span>
                    <button
                      onClick={() => setSearchQueries(searchQueries.filter((q: any) => q.id !== query.id))}
                      className="text-red-400 hover:text-red-300"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 수집된 데이터 요약 */}
          {node?.data?.collectedData && node.data.collectedData.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">수집된 데이터</h3>
              <div className="bg-gray-800 rounded p-3">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">총 항목</div>
                    <div className="text-white font-medium">{node.data.collectedData.length}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">총 크기</div>
                    <div className="text-white font-medium">
                      {(() => {
                        const bytes = node.data.collectedData.reduce((sum: number, item: any) => sum + (item.size || 0), 0);
                        const k = 1024;
                        const sizes = ['B', 'KB', 'MB', 'GB'];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400">소스</div>
                    <div className="text-white font-medium">
                      {[...new Set(node.data.collectedData.map((d: any) => d.source))].join(', ')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-between">
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
          >
            검색 실행
          </button>
          <div className="space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

WatcherNode.displayName = 'WatcherNode';

export default WatcherNode;