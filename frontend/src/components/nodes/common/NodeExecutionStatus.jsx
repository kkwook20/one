// frontend/src/components/nodes/common/NodeExecutionStatus.jsx
import React from 'react';
import { Play, CheckCircle, XCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';

const NodeExecutionStatus = ({ 
  status = 'idle', 
  progress = 0, 
  message = '',
  startTime = null,
  endTime = null,
  error = null,
  showDetails = false,
  className = ""
}) => {
  const getStatusConfig = () => {
    const configs = {
      idle: {
        icon: <Play className="w-4 h-4" />,
        color: 'text-gray-400',
        bgColor: 'bg-gray-700',
        label: 'Ready',
        pulse: false
      },
      queued: {
        icon: <Clock className="w-4 h-4" />,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        label: 'Queued',
        pulse: false
      },
      running: {
        icon: <Loader2 className="w-4 h-4 animate-spin" />,
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        label: 'Running',
        pulse: true
      },
      success: {
        icon: <CheckCircle className="w-4 h-4" />,
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        label: 'Success',
        pulse: false
      },
      error: {
        icon: <XCircle className="w-4 h-4" />,
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        label: 'Error',
        pulse: false
      },
      warning: {
        icon: <AlertCircle className="w-4 h-4" />,
        color: 'text-orange-400',
        bgColor: 'bg-orange-500/20',
        label: 'Warning',
        pulse: false
      }
    };
    
    return configs[status] || configs.idle;
  };

  const formatDuration = (start, end) => {
    if (!start) return '';
    const endTime = end || new Date();
    const duration = endTime - new Date(start);
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const config = getStatusConfig();

  return (
    <div className={`${className}`}>
      {/* Status Bar */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bgColor} ${config.pulse ? 'animate-pulse' : ''}`}>
        <div className={config.color}>
          {config.icon}
        </div>
        <span className={`text-sm font-medium ${config.color}`}>
          {config.label}
        </span>
        
        {status === 'running' && progress > 0 && (
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-400 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">{progress}%</span>
          </div>
        )}
        
        {(startTime || endTime) && (
          <span className="text-xs text-gray-500 ml-auto">
            {formatDuration(startTime, endTime)}
          </span>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className="mt-2 px-3 py-1.5 bg-gray-800 rounded text-sm text-gray-300">
          {message}
        </div>
      )}

      {/* Error Details */}
      {error && showDetails && (
        <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded">
          <p className="text-sm font-medium text-red-400 mb-1">Error Details:</p>
          <pre className="text-xs text-red-300 overflow-x-auto whitespace-pre-wrap">
            {typeof error === 'string' ? error : JSON.stringify(error, null, 2)}
          </pre>
        </div>
      )}

      {/* Execution Details */}
      {showDetails && (startTime || endTime) && (
        <div className="mt-2 px-3 py-2 bg-gray-800 rounded text-xs text-gray-400 space-y-1">
          {startTime && (
            <div className="flex justify-between">
              <span>Started:</span>
              <span>{new Date(startTime).toLocaleTimeString()}</span>
            </div>
          )}
          {endTime && (
            <div className="flex justify-between">
              <span>Ended:</span>
              <span>{new Date(endTime).toLocaleTimeString()}</span>
            </div>
          )}
          {startTime && endTime && (
            <div className="flex justify-between border-t border-gray-700 pt-1">
              <span>Duration:</span>
              <span className="font-medium text-gray-300">
                {formatDuration(startTime, endTime)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NodeExecutionStatus;