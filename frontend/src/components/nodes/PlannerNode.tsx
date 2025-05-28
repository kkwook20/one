import React, { useState, memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Target, BarChart3, Zap, TrendingUp } from 'lucide-react';
import useWorkflowStore from '../../stores/workflowStore';

const PlannerNode = memo(({ data, id, selected }: NodeProps) => {
  const [goals, setGoals] = useState(data.goals || '프로젝트 전체 목표를 입력하세요...');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const { executeNode, updateNodeData, nodes } = useWorkflowStore();

  const handleEvaluate = useCallback(async () => {
    setIsEvaluating(true);
    await executeNode(id, 'planner');
    setIsEvaluating(false);
  }, [id, executeNode]);

  const getOverallProgress = () => {
    // 실제로는 모든 노드의 진행률을 계산
    return 65;
  };

  const getNodeCount = () => {
    return nodes.filter(n => n.type === 'worker').length;
  };

  const getEvaluatedCount = () => {
    return data.evaluations ? Object.keys(data.evaluations).length : 0;
  };

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 min-w-[300px] border-2 transition-all ${
        selected ? 'border-green-400 shadow-lg shadow-green-500/20' : 'border-green-500'
      }`}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 bg-green-500 border-2 border-gray-900" 
      />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          <span className="text-white font-bold">Planner Node</span>
        </div>
        <button
          onClick={handleEvaluate}
          disabled={isEvaluating}
          className={`px-3 py-1 rounded text-sm font-medium transition-all ${
            isEvaluating 
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isEvaluating ? '평가 중...' : '평가 실행'}
        </button>
      </div>
      
      {/* Goals */}
      <div className="mb-3">
        <div className="flex items-center gap-1 mb-1">
          <Target className="w-3 h-3 text-gray-400" />
          <span className="text-xs text-gray-400">전체 목표</span>
        </div>
        <textarea 
          className="w-full bg-gray-700 text-gray-200 text-sm p-2 rounded resize-none outline-none focus:ring-1 focus:ring-green-500"
          placeholder="프로젝트 목표..."
          rows={3}
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          onBlur={() => updateNodeData(id, { goals })}
        />
      </div>
      
      {/* Progress Overview */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-700 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <BarChart3 className="w-3 h-3 text-green-400" />
            <span className="text-xs text-gray-400">전체 진행률</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-green-300">{getOverallProgress()}%</div>
            <div className="flex-1 h-2 bg-gray-600 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${getOverallProgress()}%` }}
              />
            </div>
          </div>
        </div>
        
        <div className="bg-gray-700 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <Zap className="w-3 h-3 text-yellow-400" />
            <span className="text-xs text-gray-400">평가 상태</span>
          </div>
          <div className="text-sm text-gray-300">
            {getEvaluatedCount()} / {getNodeCount()} 노드
          </div>
        </div>
      </div>
      
      {/* Recent Evaluations */}
      {data.evaluations && Object.entries(data.evaluations).length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-gray-400 mb-1">최근 평가 결과:</div>
          {Object.entries(data.evaluations).slice(0, 3).map(([nodeId, evaluation]: [string, any]) => (
            <div key={nodeId} className="bg-gray-700 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-300">
                  {nodes.find(n => n.id === nodeId)?.data?.label || nodeId}
                </span>
                <span className="text-xs font-bold text-green-300">{eval.score}점</span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-xs">
                <div className="text-center">
                  <div className="text-gray-500">시간</div>
                  <div className="text-gray-300">{eval.metrics?.timeEfficiency || 0}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500">작업</div>
                  <div className="text-gray-300">{eval.metrics?.workload || 0}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500">난이도</div>
                  <div className="text-gray-300">{eval.metrics?.difficulty || 0}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-500">진행</div>
                  <div className="text-gray-300">{eval.metrics?.progress || 0}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Next Steps */}
      {data.nextSteps && data.nextSteps.length > 0 && (
        <div className="mt-3 p-2 bg-gray-700 rounded">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <span className="text-xs text-gray-400">다음 단계</span>
          </div>
          <ul className="text-xs text-gray-300 space-y-1">
            {data.nextSteps.slice(0, 2).map((step: string, idx: number) => (
              <li key={idx} className="flex items-start gap-1">
                <span className="text-green-400">•</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 bg-green-500 border-2 border-gray-900" 
      />
    </div>
  );
});

PlannerNode.displayName = 'PlannerNode';

export default PlannerNode;