import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Clock, Calendar, Activity, AlertCircle } from 'lucide-react';
import useWorkflowStore from '../../stores/workflowStore';

const SchedulerNode = memo(({ data, id, selected }: NodeProps) => {
  const { executeNode } = useWorkflowStore();

  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
  };

  const getScheduledTasksCount = () => {
    return data.scheduledTasks?.length || 0;
  };

  const getRunningTasksCount = () => {
    return data.scheduledTasks?.filter((task: any) => task.status === 'running').length || 0;
  };

  const getTotalEstimatedTime = () => {
    return data.scheduledTasks?.reduce((sum: number, task: any) => 
      sum + (task.estimatedTime || 0), 0
    ) || 0;
  };

  const getDelayedTasksCount = () => {
    return data.scheduledTasks?.filter((task: any) => task.status === 'delayed').length || 0;
  };

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 min-w-[300px] border-2 transition-all ${
        selected ? 'border-pink-400 shadow-lg shadow-pink-500/20' : 'border-pink-500'
      }`}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="w-3 h-3 bg-pink-500 border-2 border-gray-900" 
      />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-pink-500 rounded-full animate-pulse" />
          <span className="text-white font-bold">Scheduler Node</span>
        </div>
        <button
          onClick={() => executeNode(id, 'scheduler')}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
          title="Update schedule"
        >
          <Clock className="w-4 h-4 text-pink-400" />
        </button>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-700 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <Calendar className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-gray-400">예약된 작업</span>
          </div>
          <div className="text-lg font-bold text-pink-300">{getScheduledTasksCount()}</div>
        </div>
        
        <div className="bg-gray-700 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <Activity className="w-3 h-3 text-green-400" />
            <span className="text-xs text-gray-400">실행 중</span>
          </div>
          <div className="text-lg font-bold text-pink-300">{getRunningTasksCount()}</div>
        </div>
      </div>
      
      {/* Estimated Time */}
      <div className="bg-gray-700 rounded p-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">예상 완료 시간</span>
          {getDelayedTasksCount() > 0 && (
            <div className="flex items-center gap-1 text-yellow-400">
              <AlertCircle className="w-3 h-3" />
              <span className="text-xs">{getDelayedTasksCount()} 지연</span>
            </div>
          )}
        </div>
        <div className="text-xl font-bold text-pink-300">
          {formatTime(getTotalEstimatedTime())}
        </div>
        <div className="mt-2 h-2 bg-gray-600 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 animate-pulse" 
               style={{ width: '45%' }} />
        </div>
      </div>
      
      {/* Timeline */}
      {data.timeline && data.timeline.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-400">현재 작업 타임라인:</div>
          {data.timeline.slice(0, 3).map((entry: any, idx: number) => (
            <div key={idx} className="bg-gray-700 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-300 truncate flex-1">
                  {entry.taskName || `Task ${entry.taskId}`}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  entry.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                  entry.status === 'running' ? 'bg-blue-500/20 text-blue-300' :
                  entry.status === 'delayed' ? 'bg-yellow-500/20 text-yellow-300' :
                  'bg-gray-500/20 text-gray-300'
                }`}>
                  {entry.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{new Date(entry.start).toLocaleTimeString('ko-KR', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}</span>
                <span>→</span>
                <span>{entry.end ? new Date(entry.end).toLocaleTimeString('ko-KR', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                }) : '진행 중'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Batch Operations */}
      {data.batchOperations && data.batchOperations.length > 0 && (
        <div className="mt-3 p-2 bg-gray-700 rounded">
          <div className="text-xs text-gray-400 mb-1">대량 작업:</div>
          {data.batchOperations.map((batch: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <span className="text-gray-300">{batch.name}</span>
              <span className="text-pink-300">{formatTime(batch.estimatedTime)}</span>
            </div>
          ))}
        </div>
      )}
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="w-3 h-3 bg-pink-500 border-2 border-gray-900" 
      />
    </div>
  );
});

SchedulerNode.displayName = 'SchedulerNode';

export default SchedulerNode;