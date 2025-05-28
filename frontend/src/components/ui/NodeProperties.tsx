import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Code, FileText, Settings } from 'lucide-react';
import useWorkflowStore from '../../stores/workflowStore';

interface NodePropertiesProps {
  nodeId: string;
  nodeType: string;
  isOpen: boolean;
  onClose: () => void;
}

const NodeProperties: React.FC<NodePropertiesProps> = ({
  nodeId,
  nodeType,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'input' | 'main' | 'output'>('main');
  const [code, setCode] = useState('');
  const [inputData, setInputData] = useState('{}');
  const [outputData, setOutputData] = useState('{}');
  
  const { nodes, updateNodeConfig } = useWorkflowStore();
  
  const node = nodes.find(n => n.id === nodeId);

  useEffect(() => {
    if (node?.data) {
      setCode(node.data.code || '');
      setInputData(JSON.stringify(node.data.inputs || {}, null, 2));
      setOutputData(JSON.stringify(node.data.outputs || {}, null, 2));
    }
  }, [node]);

  const handleSave = async () => {
    try {
      await updateNodeConfig(nodeId, {
        code,
        inputs: JSON.parse(inputData),
        outputs: JSON.parse(outputData)
      });
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Properties Panel */}
      <div className="relative w-full max-w-6xl mx-auto my-8 bg-gray-800 rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              nodeType === 'worker' ? 'bg-blue-500' :
              nodeType === 'supervisor' ? 'bg-purple-500' :
              nodeType === 'planner' ? 'bg-green-500' :
              nodeType === 'watcher' ? 'bg-yellow-500' :
              nodeType === 'scheduler' ? 'bg-pink-500' :
              nodeType === 'flow' ? 'bg-red-500' :
              'bg-gray-500'
            }`} />
            {node?.data?.label || 'Node Properties'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 flex">
          {/* Left Panel - Input */}
          <div className={`flex-1 border-r border-gray-700 ${
            activeTab === 'input' ? 'block' : 'hidden md:block'
          }`}>
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" />
                입력 데이터
              </h3>
            </div>
            <div className="p-4">
              <textarea
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                className="w-full h-64 bg-gray-900 text-gray-300 text-sm font-mono p-3 rounded outline-none focus:ring-1 focus:ring-gray-600"
                placeholder="JSON 형식의 입력 데이터"
              />
            </div>
          </div>
          
          {/* Center Panel - Main */}
          <div className={`flex-1 ${
            activeTab === 'main' ? 'block' : 'hidden md:block'
          }`}>
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Code className="w-4 h-4" />
                Python 코드
              </h3>
            </div>
            <div className="p-4">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-96 bg-gray-900 text-gray-300 text-sm font-mono p-3 rounded outline-none focus:ring-1 focus:ring-blue-600"
                placeholder="# Python 코드를 입력하세요&#10;# input_data: 입력 데이터&#10;# output_data: 출력 데이터 (dict)&#10;&#10;output_data['result'] = 'Hello World'"
              />
              
              {/* AI Model Selection (for worker nodes) */}
              {nodeType === 'worker' && (
                <div className="mt-4 p-3 bg-gray-700 rounded">
                  <label className="block text-sm text-gray-300 mb-2">AI 모델 선택</label>
                  <select className="w-full bg-gray-800 text-gray-300 p-2 rounded outline-none focus:ring-1 focus:ring-blue-600">
                    <option>GPT-4</option>
                    <option>Claude 3</option>
                    <option>Local LLaMA</option>
                    <option>Custom Model</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          
          {/* Right Panel - Output */}
          <div className={`flex-1 border-l border-gray-700 ${
            activeTab === 'output' ? 'block' : 'hidden md:block'
          }`}>
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                출력 결과
                <ChevronRight className="w-4 h-4" />
              </h3>
            </div>
            <div className="p-4">
              <textarea
                value={outputData}
                onChange={(e) => setOutputData(e.target.value)}
                className="w-full h-64 bg-gray-900 text-gray-300 text-sm font-mono p-3 rounded outline-none focus:ring-1 focus:ring-gray-600"
                placeholder="실행 결과가 여기에 표시됩니다"
                readOnly
              />
              
              {/* Execution Logs */}
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">실행 로그</h4>
                <div className="bg-gray-900 rounded p-3 h-32 overflow-y-auto">
                  {node?.data?.logs?.map((log: string, idx: number) => (
                    <div key={idx} className="text-xs text-gray-400 font-mono">
                      {log}
                    </div>
                  )) || (
                    <div className="text-xs text-gray-500">로그가 없습니다</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex items-center justify-between">
          <div className="flex gap-2 md:hidden">
            <button
              onClick={() => setActiveTab('input')}
              className={`px-3 py-1 rounded text-sm ${
                activeTab === 'input' 
                  ? 'bg-gray-700 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              입력
            </button>
            <button
              onClick={() => setActiveTab('main')}
              className={`px-3 py-1 rounded text-sm ${
                activeTab === 'main' 
                  ? 'bg-gray-700 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              코드
            </button>
            <button
              onClick={() => setActiveTab('output')}
              className={`px-3 py-1 rounded text-sm ${
                activeTab === 'output' 
                  ? 'bg-gray-700 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              출력
            </button>
          </div>
          
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              저장
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeProperties;