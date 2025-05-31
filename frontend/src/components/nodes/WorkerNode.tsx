import React, { useState, memo, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Code, FileText, Settings } from 'lucide-react';
import { BaseNode } from './BaseNode';
import useWorkflowStore from '../../stores/workflowStore';

const WorkerNode = memo(({ data, id, selected }: NodeProps) => {
  const [showEditor, setShowEditor] = useState(false);
  const { updateNodeData } = useWorkflowStore();

  const taskItems = data.tasks?.map(task => ({
    id: task.id,
    text: task.text,
    status: task.status === 'todo' ? 'active' : task.status
  })) || [];

  const handleEdit = useCallback(() => {
    setShowEditor(true);
  }, []);

  return (
    <>
      <BaseNode
        id={id}
        data={data}
        selected={selected}
        nodeType="worker"
        nodeColor="#3b82f6"
        taskItems={taskItems}
        onEdit={handleEdit}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Worker Node</span>
            <span className="text-xs text-gray-400">{data.label}</span>
          </div>
          
          {/* 간단한 상태 표시 */}
          <div className="text-xs text-gray-400">
            {data.code ? 'Code configured' : 'No code'}
          </div>
        </div>
      </BaseNode>

      {/* 3패널 에디터 모달 */}
      {showEditor && (
        <WorkerEditor
          nodeId={id}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
});

// 3패널 에디터 컴포넌트
const WorkerEditor: React.FC<{ nodeId: string; onClose: () => void }> = ({ 
  nodeId, 
  onClose 
}) => {
  const { nodes, updateNodeData } = useWorkflowStore();
  const node = nodes.find(n => n.id === nodeId);
  
  const [activePanel, setActivePanel] = useState<'input' | 'code' | 'output'>('code');
  const [code, setCode] = useState(node?.data?.code || '');
  const [inputs, setInputs] = useState(JSON.stringify(node?.data?.inputs || {}, null, 2));
  const [note, setNote] = useState(node?.data?.note || '');

  const handleSave = () => {
    updateNodeData(nodeId, {
      code,
      inputs: JSON.parse(inputs),
      note
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-6xl h-[80vh] bg-gray-900 rounded-lg shadow-2xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Edit Worker Node</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ×
          </button>
        </div>

        {/* 3패널 레이아웃 */}
        <div className="flex-1 flex">
          {/* 입력 패널 */}
          <div className="w-1/3 border-r border-gray-700 flex flex-col">
            <div className="p-3 border-b border-gray-700 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-gray-300">Input Data</span>
            </div>
            <textarea
              value={inputs}
              onChange={(e) => setInputs(e.target.value)}
              className="flex-1 p-3 bg-gray-800 text-gray-300 text-sm font-mono resize-none outline-none"
              placeholder="JSON input data..."
            />
          </div>

          {/* 코드 패널 */}
          <div className="w-1/3 flex flex-col">
            <div className="p-3 border-b border-gray-700 flex items-center gap-2">
              <Code className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-gray-300">Python Code</span>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 p-3 bg-gray-800 text-gray-300 text-sm font-mono resize-none outline-none"
              placeholder="# Python code here..."
            />
            <div className="p-3 border-t border-gray-700">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note..."
                className="w-full px-3 py-2 bg-gray-700 text-gray-300 text-sm rounded outline-none"
              />
            </div>
          </div>

          {/* 출력 패널 */}
          <div className="w-1/3 border-l border-gray-700 flex flex-col">
            <div className="p-3 border-b border-gray-700 flex items-center gap-2">
              <Settings className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-gray-300">Output & Logs</span>
            </div>
            <div className="flex-1 p-3 bg-gray-800 text-gray-400 text-sm font-mono overflow-y-auto">
              {node?.data?.outputs ? (
                <pre>{JSON.stringify(node.data.outputs, null, 2)}</pre>
              ) : (
                <div>No output yet</div>
              )}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

WorkerNode.displayName = 'WorkerNode';

export default WorkerNode;