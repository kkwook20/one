import React, { useState, memo, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Brain, Save, Key } from 'lucide-react';
import { BaseNode } from './BaseNode';
import useWorkflowStore from '../../stores/workflowStore';

const MemoryNode = memo(({ data, id, selected }: NodeProps) => {
  const [showEditor, setShowEditor] = useState(false);
  const { executeNode, updateNodeData } = useWorkflowStore();

  const taskItems = data.memories ? 
    Object.entries(data.memories).slice(0, 3).map(([key, value]: [string, any]) => ({
      id: key,
      text: `${key}: ${JSON.stringify(value).substring(0, 30)}...`,
      status: 'active' as const
    })) : [];

  const handleEdit = useCallback(() => {
    setShowEditor(true);
  }, []);

  const getMemoryCount = () => {
    return data.memories ? Object.keys(data.memories).length : 0;
  };

  return (
    <>
      <BaseNode
        id={id}
        data={data}
        selected={selected}
        nodeType="memory"
        nodeColor="#8b5cf6"
        taskItems={taskItems}
        onEdit={handleEdit}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Memory Node</span>
            <Brain className="w-4 h-4 text-purple-400" />
          </div>
          
          <div className="text-xs text-gray-400">
            {getMemoryCount()} 항목 저장됨
          </div>
          
          {data.lastAccess && (
            <div className="mt-1 text-xs text-gray-500">
              마지막 접근: {new Date(data.lastAccess).toLocaleTimeString()}
            </div>
          )}
        </div>
      </BaseNode>

      {/* Memory 에디터 모달 */}
      {showEditor && (
        <MemoryEditor
          nodeId={id}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
});

// Memory 에디터
const MemoryEditor: React.FC<{ nodeId: string; onClose: () => void }> = ({ 
  nodeId, 
  onClose 
}) => {
  const { nodes, updateNodeData, setGlobalVariable } = useWorkflowStore();
  const node = nodes.find(n => n.id === nodeId);
  
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [memories, setMemories] = useState(node?.data?.memories || {});

  const handleAddMemory = () => {
    if (newKey && newValue) {
      const parsedValue = (() => {
        try {
          return JSON.parse(newValue);
        } catch {
          return newValue;
        }
      })();
      
      setMemories({ ...memories, [newKey]: parsedValue });
      setNewKey('');
      setNewValue('');
    }
  };

  const handleSave = () => {
    updateNodeData(nodeId, { memories });
    
    // 글로벌 변수로도 저장
    Object.entries(memories).forEach(([key, value]) => {
      setGlobalVariable(key, value);
    });
    
    onClose();
  };

  const handleDelete = (key: string) => {
    const newMemories = { ...memories };
    delete newMemories[key];
    setMemories(newMemories);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl bg-gray-900 rounded-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Memory Storage</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="p-6 space-y-4">
          {/* 새 메모리 추가 */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">새 항목 추가</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="키 이름"
                className="w-1/3 px-3 py-2 bg-gray-800 text-gray-300 rounded outline-none"
              />
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="값 (JSON 또는 텍스트)"
                className="flex-1 px-3 py-2 bg-gray-800 text-gray-300 rounded outline-none"
              />
              <button
                onClick={handleAddMemory}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
              >
                추가
              </button>
            </div>
          </div>

          {/* 저장된 메모리 목록 */}
          {Object.keys(memories).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">저장된 항목</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(memories).map(([key, value]) => (
                  <div key={key} className="bg-gray-800 rounded p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Key className="w-3 h-3 text-purple-400" />
                          <span className="text-sm font-medium text-white">{key}</span>
                        </div>
                        <pre className="text-xs text-gray-400 overflow-x-auto">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      </div>
                      <button
                        onClick={() => handleDelete(key)}
                        className="ml-2 text-red-400 hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
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
  );
};

MemoryNode.displayName = 'MemoryNode';

export default MemoryNode;