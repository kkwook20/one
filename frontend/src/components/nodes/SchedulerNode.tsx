import React, { useState, memo, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Clock, Calendar, Activity, AlertCircle } from 'lucide-react';
import { BaseNode } from './BaseNode';
import useWorkflowStore from '../../stores/workflowStore';

const SchedulerNode = memo(({ data, id, selected }: NodeProps) => {
  const [showEditor, setShowEditor] = useState(false);
  const { executeNode, updateNodeData } = useWorkflowStore();

  const taskItems = data.scheduledTasks?.slice(0, 3).map((task: any) => ({
    id: task.id,
    text: task.taskName,
    status: task.status === 'completed' ? 'active' : 
            task.status === 'delayed' ? 'skip' : 'partial' as any
  })) || [];

  const handleEdit = useCallback(() => {
    setShowEditor(true);
  }, []);

  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
  };

  const getTotalTime = () => {
    return data.scheduledTasks?.reduce((sum: number, task: any) => 
      sum + (task.estimatedTime || 0), 0) || 0;
  };

  return (
    <>
      <BaseNode
        id={id}
        data={data}
        selected={selected}
        nodeType="scheduler"
        nodeColor="#ec4899"
        taskItems={taskItems}
        onEdit={handleEdit}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Scheduler Node</span>
            <Clock className="w-4 h-4 text-pink-400" />
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">예상 시간</span>
            <span className="text-pink-300 font-medium">{formatTime(getTotalTime())}</span>
          </div>
          
          {data.scheduledTasks && data.scheduledTasks.length > 0 && (
            <div className="mt-2 text-xs text-gray-400">
              {data.scheduledTasks.length}개 작업 예약됨
            </div>
          )}
        </div>
      </BaseNode>

      {/* Scheduler 에디터 모달 */}
      {showEditor && (
        <SchedulerEditor
          nodeId={id}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
});

// Scheduler 에디터는 간단히 구현
const SchedulerEditor: React.FC<{ nodeId: string; onClose: () => void }> = ({ 
  nodeId, 
  onClose 
}) => {
  const { nodes, updateNodeData, executeNode } = useWorkflowStore();
  const node = nodes.find(n => n.id === nodeId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl bg-gray-900 rounded-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Scheduler Configuration</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="p-6">
          {/* 타임라인 뷰 */}
          {node?.data?.timeline && node.data.timeline.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">작업 타임라인</h3>
              <div className="space-y-2">
                {node.data.timeline.map((entry: any, idx: number) => (
                  <div key={idx} className="bg-gray-800 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white">{entry.taskName}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        entry.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                        entry.status === 'running' ? 'bg-blue-500/20 text-blue-300' :
                        entry.status === 'delayed' ? 'bg-red-500/20 text-red-300' :
                        'bg-gray-500/20 text-gray-300'
                      }`}>
                        {entry.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(entry.start).toLocaleString()} → {entry.end ? new Date(entry.end).toLocaleString() : '진행 중'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              아직 예약된 작업이 없습니다
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

SchedulerNode.displayName = 'SchedulerNode';

export default SchedulerNode;