// frontend/src/components/realtime/NodeStatusMonitor.jsx
import React, { useState, useEffect } from 'react';
import { 
  Activity, Circle, CheckCircle, XCircle, 
  AlertCircle, Clock, Zap, TrendingUp,
  TrendingDown, Minus, RefreshCw
} from 'lucide-react';
import { useWebSocket } from './WebSocketProvider';

const NodeStatusMonitor = ({ 
  nodes = [],
  className = "",
  updateInterval = 5000,
  showMetrics = true,
  compact = false
}) => {
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const { on, isConnected, subscribe, unsubscribe } = useWebSocket();

  // Subscribe to node status updates
  useEffect(() => {
    if (!isConnected) return;

    // Subscribe to all node status updates
    subscribe('nodes:status');

    const unsubscribeHandlers = [];

    // Status update handler
    unsubscribeHandlers.push(
      on('node_status', (message) => {
        setNodeStatuses(prev => ({
          ...prev,
          [message.nodeId]: {
            ...prev[message.nodeId],
            status: message.status,
            lastUpdate: new Date(message.timestamp),
            metrics: message.metrics || prev[message.nodeId]?.metrics,
            error: message.error
          }
        }));
        setLastUpdate(new Date());
      })
    );

    // Metrics update handler
    unsubscribeHandlers.push(
      on('node_metrics', (message) => {
        setNodeStatuses(prev => ({
          ...prev,
          [message.nodeId]: {
            ...prev[message.nodeId],
            metrics: message.metrics,
            lastMetricUpdate: new Date(message.timestamp)
          }
        }));
      })
    );

    // Subscribe to specific nodes
    nodes.forEach(node => {
      subscribe(`node:${node.id}:status`);
    });

    return () => {
      unsubscribeHandlers.forEach(unsub => unsub());
      unsubscribe('nodes:status');
      nodes.forEach(node => {
        unsubscribe(`node:${node.id}:status`);
      });
    };
  }, [nodes, isConnected, on, subscribe, unsubscribe]);

  // Mock data for demonstration
  useEffect(() => {
    const mockStatuses = {};
    nodes.forEach(node => {
      if (!nodeStatuses[node.id]) {
        mockStatuses[node.id] = {
          status: 'idle',
          lastUpdate: new Date(),
          metrics: {
            cpu: Math.random() * 100,
            memory: Math.random() * 100,
            executionCount: Math.floor(Math.random() * 100),
            avgExecutionTime: Math.random() * 10,
            successRate: 85 + Math.random() * 15,
            errorCount: Math.floor(Math.random() * 5)
          }
        };
      }
    });
    
    if (Object.keys(mockStatuses).length > 0) {
      setNodeStatuses(prev => ({ ...prev, ...mockStatuses }));
    }
  }, [nodes]);

  const getStatusIcon = (status) => {
    const icons = {
      idle: <Circle className="w-4 h-4" />,
      running: <Activity className="w-4 h-4 animate-pulse" />,
      success: <CheckCircle className="w-4 h-4" />,
      error: <XCircle className="w-4 h-4" />,
      warning: <AlertCircle className="w-4 h-4" />,
      queued: <Clock className="w-4 h-4" />
    };
    return icons[status] || <Circle className="w-4 h-4" />;
  };

  const getStatusColor = (status) => {
    const colors = {
      idle: 'text-gray-400',
      running: 'text-blue-400',
      success: 'text-green-400',
      error: 'text-red-400',
      warning: 'text-yellow-400',
      queued: 'text-orange-400'
    };
    return colors[status] || 'text-gray-400';
  };

  const getNodeTypeColor = (type) => {
    const colors = {
      worker: 'bg-blue-500',
      supervisor: 'bg-purple-500',
      planner: 'bg-green-500',
      watcher: 'bg-yellow-500',
      scheduler: 'bg-pink-500',
      flow: 'bg-red-500',
      storage: 'bg-gray-500'
    };
    return colors[type] || 'bg-gray-500';
  };

  const getTrendIcon = (current, previous) => {
    if (!previous || current === previous) return <Minus className="w-3 h-3 text-gray-400" />;
    if (current > previous) return <TrendingUp className="w-3 h-3 text-green-400" />;
    return <TrendingDown className="w-3 h-3 text-red-400" />;
  };

  const formatMetricValue = (value, type) => {
    if (type === 'percent') return `${Math.round(value)}%`;
    if (type === 'time') return `${value.toFixed(1)}s`;
    if (type === 'count') return Math.round(value).toString();
    return value.toString();
  };

  const getOverallHealth = () => {
    const statuses = Object.values(nodeStatuses);
    if (statuses.length === 0) return 'unknown';
    
    const errorCount = statuses.filter(s => s.status === 'error').length;
    const warningCount = statuses.filter(s => s.status === 'warning').length;
    
    if (errorCount > 0) return 'critical';
    if (warningCount > 0) return 'warning';
    return 'healthy';
  };

  const overallHealth = getOverallHealth();

  if (compact) {
    return (
      <div className={`bg-gray-800 rounded-lg p-3 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Node Status
          </h3>
          <span className={`text-xs px-2 py-1 rounded ${
            overallHealth === 'healthy' ? 'bg-green-500/20 text-green-400' :
            overallHealth === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
            overallHealth === 'critical' ? 'bg-red-500/20 text-red-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {overallHealth}
          </span>
        </div>
        
        <div className="grid grid-cols-4 gap-2">
          {nodes.map(node => {
            const status = nodeStatuses[node.id] || { status: 'unknown' };
            return (
              <div
                key={node.id}
                className="flex items-center gap-2 p-2 bg-gray-700 rounded"
                title={`${node.name}: ${status.status}`}
              >
                <div className={`w-2 h-2 rounded-full ${getNodeTypeColor(node.type)}`} />
                <div className={getStatusColor(status.status)}>
                  {getStatusIcon(status.status)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800 rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-gray-400" />
          <h3 className="text-base font-medium text-gray-200">Node Status Monitor</h3>
          <span className="text-xs text-gray-500">
            ({nodes.length} nodes)
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <span className={`text-sm px-3 py-1 rounded ${
            overallHealth === 'healthy' ? 'bg-green-500/20 text-green-400' :
            overallHealth === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
            overallHealth === 'critical' ? 'bg-red-500/20 text-red-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            System {overallHealth}
          </span>
          
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <RefreshCw className="w-3 h-3" />
            <span>Updated {lastUpdate.toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* Node List */}
      <div className="p-4 space-y-3">
        {nodes.map(node => {
          const status = nodeStatuses[node.id] || { status: 'unknown', metrics: {} };
          
          return (
            <div
              key={node.id}
              className="bg-gray-900 rounded-lg p-4 hover:bg-gray-900/70 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${getNodeTypeColor(node.type)}`} />
                  <div>
                    <h4 className="text-sm font-medium text-gray-200">{node.name}</h4>
                    <p className="text-xs text-gray-500">
                      {node.type} • {node.id}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1 ${getStatusColor(status.status)}`}>
                    {getStatusIcon(status.status)}
                    <span className="text-sm capitalize">{status.status}</span>
                  </span>
                </div>
              </div>

              {showMetrics && status.metrics && (
                <div className="grid grid-cols-3 gap-3">
                  {/* CPU Usage */}
                  <div className="bg-gray-800 rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">CPU</span>
                      <Zap className="w-3 h-3 text-gray-500" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${
                        status.metrics.cpu > 80 ? 'text-red-400' :
                        status.metrics.cpu > 60 ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        {formatMetricValue(status.metrics.cpu, 'percent')}
                      </span>
                      {getTrendIcon(status.metrics.cpu, status.previousMetrics?.cpu)}
                    </div>
                  </div>

                  {/* Memory Usage */}
                  <div className="bg-gray-800 rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Memory</span>
                      <Activity className="w-3 h-3 text-gray-500" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${
                        status.metrics.memory > 80 ? 'text-red-400' :
                        status.metrics.memory > 60 ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        {formatMetricValue(status.metrics.memory, 'percent')}
                      </span>
                      {getTrendIcon(status.metrics.memory, status.previousMetrics?.memory)}
                    </div>
                  </div>

                  {/* Success Rate */}
                  <div className="bg-gray-800 rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Success</span>
                      <CheckCircle className="w-3 h-3 text-gray-500" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${
                        status.metrics.successRate < 90 ? 'text-red-400' :
                        status.metrics.successRate < 95 ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>
                        {formatMetricValue(status.metrics.successRate, 'percent')}
                      </span>
                      {getTrendIcon(status.metrics.successRate, status.previousMetrics?.successRate)}
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Stats */}
              {showMetrics && status.metrics && (
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-700 text-xs text-gray-400">
                  <span>
                    Executions: <span className="text-gray-300">{status.metrics.executionCount}</span>
                  </span>
                  <span>
                    Avg Time: <span className="text-gray-300">{formatMetricValue(status.metrics.avgExecutionTime, 'time')}</span>
                  </span>
                  {status.metrics.errorCount > 0 && (
                    <span className="text-red-400">
                      Errors: {status.metrics.errorCount}
                    </span>
                  )}
                </div>
              )}

              {/* Error Message */}
              {status.error && (
                <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded">
                  <p className="text-xs text-red-400">{status.error}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NodeStatusMonitor;