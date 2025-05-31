// frontend/src/components/nodes/FlowExecutionPopup.jsx
import React, { useState, useEffect } from 'react';
import { 
  X, Play, Pause, Square, SkipForward, 
  CheckCircle, XCircle, Loader2, Clock,
  AlertCircle, Activity, Terminal
} from 'lucide-react';

const FlowExecutionPopup = ({ 
  isOpen,
  onClose,
  flowNodeId,
  flowNodeName = "Flow Execution",
  executionList = [],
  managerNodes = [],
  onPause,
  onResume,
  onStop,
  onSkip
}) => {
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [executionStatus, setExecutionStatus] = useState('running'); // running, paused, completed, error
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  // Mock execution progress
  useEffect(() => {
    if (!isOpen || isPaused || executionStatus !== 'running') return;

    const interval = setInterval(() => {
      setCurrentNodeIndex(prev => {
        if (prev >= executionList.length - 1) {
          setExecutionStatus('completed');
          return prev;
        }
        
        // Update node status
        const currentNode = executionList[prev];
        setNodeStatuses(statuses => ({
          ...statuses,
          [currentNode.nodeId]: {
            status: 'completed',
            duration: Math.floor(Math.random() * 10 + 5),
            result: { success: true, output: 'Sample output' }
          }
        }));
        
        // Add log
        setLogs(logs => [...logs, {
          timestamp: new Date(),
          nodeId: currentNode.nodeId,
          message: `Completed execution of ${currentNode.nodeName}`,
          type: 'success'
        }]);
        
        // Start next node
        const nextNode = executionList[prev + 1];
        if (nextNode) {
          setNodeStatuses(statuses => ({
            ...statuses,
            [nextNode.nodeId]: { status: 'running', startTime: new Date() }
          }));
          
          setLogs(logs => [...logs, {
            timestamp: new Date(),
            nodeId: nextNode.nodeId,
            message: `Starting execution of ${nextNode.nodeName}`,
            type: 'info'
          }]);
        }
        
        return prev + 1;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, isPaused, executionStatus, executionList]);

  // Initialize first node
  useEffect(() => {
    if (isOpen && executionList.length > 0) {
      const firstNode = executionList[0];
      setNodeStatuses({
        [firstNode.nodeId]: { status: 'running', startTime: new Date() }
      });
      setLogs([{
        timestamp: new Date(),
        nodeId: firstNode.nodeId,
        message: `Starting execution of ${firstNode.nodeName}`,
        type: 'info'
      }]);
    }
  }, [isOpen, executionList]);

  const handlePause = () => {
    setIsPaused(true);
    setExecutionStatus('paused');
    onPause?.();
  };

  const handleResume = () => {
    setIsPaused(false);
    setExecutionStatus('running');
    onResume?.();
  };

  const handleStop = () => {
    setExecutionStatus('stopped');
    onStop?.();
    setTimeout(onClose, 1000);
  };

  const handleSkip = () => {
    const currentNode = executionList[currentNodeIndex];
    if (currentNode) {
      setNodeStatuses(statuses => ({
        ...statuses,
        [currentNode.nodeId]: { status: 'skipped' }
      }));
      setLogs(logs => [...logs, {
        timestamp: new Date(),
        nodeId: currentNode.nodeId,
        message: `Skipped execution of ${currentNode.nodeName}`,
        type: 'warning'
      }]);
    }
    onSkip?.(currentNode?.nodeId);
  };

  const getNodeStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'skipped':
        return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getProgress = () => {
    if (executionList.length === 0) return 0;
    return Math.round((currentNodeIndex / executionList.length) * 100);
  };

  const formatDuration = (startTime) => {
    if (!startTime) return '0s';
    const duration = new Date() - new Date(startTime);
    const seconds = Math.floor(duration / 1000);
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Popup */}
      <div className="relative w-full max-w-4xl bg-gray-800 rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gradient-to-r from-red-500/20 to-orange-500/20">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <h2 className="text-lg font-semibold text-white">{flowNodeName}</h2>
            <span className={`text-sm px-2 py-1 rounded ${
              executionStatus === 'running' ? 'bg-blue-500/20 text-blue-300' :
              executionStatus === 'paused' ? 'bg-yellow-500/20 text-yellow-300' :
              executionStatus === 'completed' ? 'bg-green-500/20 text-green-300' :
              executionStatus === 'error' ? 'bg-red-500/20 text-red-300' :
              'bg-gray-500/20 text-gray-300'
            }`}>
              {executionStatus.charAt(0).toUpperCase() + executionStatus.slice(1)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-4 py-3 bg-gray-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Overall Progress</span>
            <span className="text-sm font-medium text-gray-200">{getProgress()}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-500"
              style={{ width: `${getProgress()}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex h-96">
          {/* Node List */}
          <div className="w-2/3 p-4 overflow-y-auto border-r border-gray-700">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Execution Queue</h3>
            <div className="space-y-2">
              {executionList.map((node, index) => {
                const status = nodeStatuses[node.nodeId];
                const isActive = index === currentNodeIndex;
                
                return (
                  <div
                    key={node.nodeId}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      isActive ? 'bg-gray-700 ring-1 ring-blue-500' : 
                      status?.status === 'completed' ? 'bg-gray-800/50' : 
                      'bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-700 text-sm font-medium text-gray-300">
                      {index + 1}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {status && getNodeStatusIcon(status.status)}
                        <span className="text-sm font-medium text-gray-200">
                          {node.nodeName || node.nodeId}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          node.nodeType === 'worker' ? 'bg-blue-500/20 text-blue-300' :
                          node.nodeType === 'supervisor' ? 'bg-purple-500/20 text-purple-300' :
                          'bg-gray-500/20 text-gray-300'
                        }`}>
                          {node.nodeType}
                        </span>
                      </div>
                      {status?.status === 'running' && (
                        <p className="text-xs text-gray-400 mt-1">
                          Running for {formatDuration(status.startTime)}
                        </p>
                      )}
                      {status?.duration && (
                        <p className="text-xs text-gray-400 mt-1">
                          Completed in {status.duration}s
                        </p>
                      )}
                    </div>
                    
                    {isActive && executionStatus === 'running' && (
                      <button
                        onClick={handleSkip}
                        className="p-1.5 hover:bg-gray-600 rounded text-gray-400 hover:text-yellow-400 transition-colors"
                        title="Skip this node"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Manager Nodes */}
            {managerNodes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <h4 className="text-xs font-medium text-gray-400 mb-2">Manager Nodes (Auto-Execute)</h4>
                <div className="flex flex-wrap gap-2">
                  {managerNodes.map(nodeId => (
                    <span
                      key={nodeId}
                      className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded"
                    >
                      {nodeId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Logs */}
          <div className="w-1/3 p-4 bg-gray-900/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Execution Logs
              </h3>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="text-xs text-gray-400 hover:text-white"
              >
                {showLogs ? 'Hide' : 'Show'}
              </button>
            </div>
            
            {showLogs && (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className={`text-xs p-2 rounded font-mono ${
                      log.type === 'success' ? 'bg-green-500/10 text-green-300' :
                      log.type === 'error' ? 'bg-red-500/10 text-red-300' :
                      log.type === 'warning' ? 'bg-yellow-500/10 text-yellow-300' :
                      'bg-gray-700/50 text-gray-300'
                    }`}
                  >
                    <span className="text-gray-500">
                      [{log.timestamp.toLocaleTimeString()}]
                    </span>{' '}
                    {log.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-4 border-t border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              Executing {currentNodeIndex + 1} of {executionList.length} nodes
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {executionStatus === 'running' ? (
              <button
                onClick={handlePause}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded transition-colors flex items-center gap-2"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            ) : executionStatus === 'paused' ? (
              <button
                onClick={handleResume}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            ) : null}
            
            {(executionStatus === 'running' || executionStatus === 'paused') && (
              <button
                onClick={handleStop}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors flex items-center gap-2"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            )}
            
            {executionStatus === 'completed' && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowExecutionPopup;