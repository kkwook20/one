import React, { useState, memo, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Target, BarChart3, Zap, TrendingUp } from 'lucide-react';
import { BaseNode } from './BaseNode';
import useWorkflowStore from '../../stores/workflowStore';

const PlannerNode = memo(({ data, id, selected }: NodeProps) => {
  const [showEditor, setShowEditor] = useState(false);
  const { executeNode, updateNodeData, nodes } = useWorkflowStore();

  const taskItems = data.evaluations ? 
    Object.entries(data.evaluations).slice(0, 3).map(([nodeId, eval]: [string, any]) => ({
      id: nodeId,
      text: `${nodes.find(n => n.id === nodeId)?.data?.label || nodeId}: ${eval.score}점`,
      status: eval.score > 80 ? 'active' : eval.score > 60 ? 'partial' : 'skip' as any
    })) : [];

  const handleEdit = useCallback(() => {
    setShowEditor(true);
  }, []);

  const getOverallProgress = () => {
    return data.evaluations ? 
      Math.round(Object.values(data.evaluations).reduce((sum: number, eval: any) => 
        sum + (eval.metrics?.progress || 0), 0) / Object.keys(data.evaluations).length) : 0;
  };

  return (
    <>
      <BaseNode
        id={id}
        data={data}
        selected={selected}
        nodeType="planner"
        nodeColor="#10b981"
        taskItems={taskItems}
        onEdit={handleEdit}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Planner Node</span>
            <span className="text-xs text-green-400">{getOverallProgress()}% 진행</span>
          </div>
          
          {/* 목표 표시 */}
          {data.goals && (
            <div className="mb-2 p-2 bg-gray-700 rounded text-xs text-gray-300">
              {data.goals.substring(0, 50)}...
            </div>
          )}
          
          {/* 다음 단계 */}
          {data.nextSteps && data.nextSteps.length > 0 && (
            <div className="text-xs text-gray-400">
              <TrendingUp className="w-3 h-3 inline mr-1" />
              {data.nextSteps.length} 다음 단계
            </div>
          )}
        </div>
      </BaseNode>

      {/* 평가 에디터 모달 */}
      {showEditor && (
        <PlannerEditor
          nodeId={id}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
});

// Planner 에디터 컴포넌트
const PlannerEditor: React.FC<{ nodeId: string; onClose: () => void }> = ({ 
  nodeId, 
  onClose 
}) => {
  const { nodes, updateNodeData, executeNode } = useWorkflowStore();
  const node = nodes.find(n => n.id === nodeId);
  
  const [goals, setGoals] = useState(node?.data?.goals || '');

  const handleSave = () => {
    updateNodeData(nodeId, { goals });
    onClose();
  };

  const handleEvaluate = async () => {
    await executeNode(nodeId, 'planner');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-4xl bg-gray-900 rounded-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Planner Configuration</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="p-6 space-y-4">
          {/* 목표 설정 */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              전체 목표
            </label>
            <textarea
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              className="w-full p-3 bg-gray-800 text-gray-300 rounded outline-none"
              rows={4}
              placeholder="프로젝트의 전체 목표를 입력하세요..."
            />
          </div>

          {/* 평가 결과 */}
          {node?.data?.evaluations && Object.keys(node.data.evaluations).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">노드 평가 결과</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {Object.entries(node.data.evaluations).map(([nodeId, eval]: [string, any]) => (
                  <div key={nodeId} className="bg-gray-800 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white">
                        {nodes.find(n => n.id === nodeId)?.data?.label || nodeId}
                      </span>
                      <span className={`text-sm font-bold ${
                        eval.score > 80 ? 'text-green-400' :
                        eval.score > 60 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {eval.score}점
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      {Object.entries(eval.metrics || {}).map(([metric, value]) => (
                        <div key={metric} className="text-center">
                          <div className="text-gray-500">{metric}</div>
                          <div className="text-gray-300">{value as number}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-between">
          <button
            onClick={handleEvaluate}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
          >
            평가 실행
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

PlannerNode.displayName = 'PlannerNode';

export default PlannerNode;