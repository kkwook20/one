// frontend/src/components/nodes/common/TaskItemIndicators.jsx
import React from 'react';
import { Circle, X, Triangle, Check, Square, AlertCircle } from 'lucide-react';

const TaskItemIndicators = ({ 
  items = [],
  onItemClick,
  showProgress = true,
  compact = false,
  className = ""
}) => {
  const getIndicator = (status, progress = 0) => {
    switch (status) {
      case 'todo':
      case 'pending':
        return {
          icon: <Circle className="w-4 h-4" />,
          color: 'text-gray-400',
          bgColor: 'bg-gray-700',
          label: 'To Do'
        };
      
      case 'skip':
      case 'skipped':
        return {
          icon: <X className="w-4 h-4" />,
          color: 'text-red-400',
          bgColor: 'bg-red-500/20',
          label: 'Skipped'
        };
      
      case 'partial':
      case 'in-progress':
        return {
          icon: <Triangle className="w-4 h-4" />,
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-500/20',
          label: `Partial (${progress}%)`
        };
      
      case 'complete':
      case 'done':
        return {
          icon: <Check className="w-4 h-4" />,
          color: 'text-green-400',
          bgColor: 'bg-green-500/20',
          label: 'Complete'
        };
      
      case 'error':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          color: 'text-red-400',
          bgColor: 'bg-red-500/20',
          label: 'Error'
        };
      
      case 'blocked':
        return {
          icon: <Square className="w-4 h-4" />,
          color: 'text-orange-400',
          bgColor: 'bg-orange-500/20',
          label: 'Blocked'
        };
      
      default:
        return {
          icon: <Circle className="w-4 h-4" />,
          color: 'text-gray-400',
          bgColor: 'bg-gray-700',
          label: 'Unknown'
        };
    }
  };

  const calculateOverallProgress = () => {
    if (items.length === 0) return 0;
    
    const weights = {
      complete: 100,
      done: 100,
      partial: 50,
      'in-progress': 50,
      error: 0,
      skip: 0,
      skipped: 0,
      blocked: 0,
      todo: 0,
      pending: 0
    };
    
    const totalScore = items.reduce((sum, item) => {
      const weight = weights[item.status] || 0;
      if (item.status === 'partial' || item.status === 'in-progress') {
        return sum + (item.progress || 50);
      }
      return sum + weight;
    }, 0);
    
    return Math.round(totalScore / items.length);
  };

  if (compact) {
    // Compact view - just show counts
    const statusCounts = items.reduce((acc, item) => {
      const key = item.status || 'todo';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {Object.entries(statusCounts).map(([status, count]) => {
          const indicator = getIndicator(status);
          return (
            <div
              key={status}
              className={`flex items-center gap-1 px-2 py-1 rounded ${indicator.bgColor}`}
              title={`${count} ${indicator.label}`}
            >
              <div className={indicator.color}>
                {indicator.icon}
              </div>
              <span className={`text-sm font-medium ${indicator.color}`}>
                {count}
              </span>
            </div>
          );
        })}
        
        {showProgress && items.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                style={{ width: `${calculateOverallProgress()}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">
              {calculateOverallProgress()}%
            </span>
          </div>
        )}
      </div>
    );
  }

  // Full view - show all items
  return (
    <div className={`space-y-2 ${className}`}>
      {showProgress && items.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-400">Overall Progress:</span>
          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
              style={{ width: `${calculateOverallProgress()}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-300">
            {calculateOverallProgress()}%
          </span>
        </div>
      )}
      
      <div className="space-y-1">
        {items.map((item, index) => {
          const indicator = getIndicator(item.status, item.progress);
          return (
            <button
              key={item.id || index}
              onClick={() => onItemClick?.(item, index)}
              className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-gray-800 ${
                item.isActive ? 'bg-gray-800 ring-1 ring-blue-500' : ''
              }`}
            >
              <div className={`${indicator.color}`}>
                {indicator.icon}
              </div>
              
              <div className="flex-1 text-left">
                <div className="text-sm text-gray-200">
                  {item.label || item.name || `Item ${index + 1}`}
                </div>
                {item.description && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {item.description}
                  </div>
                )}
              </div>
              
              {(item.status === 'partial' || item.status === 'in-progress') && item.progress !== undefined && (
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-yellow-400"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-10 text-right">
                    {item.progress}%
                  </span>
                </div>
              )}
              
              {item.tags && item.tags.length > 0 && (
                <div className="flex gap-1">
                  {item.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TaskItemIndicators;