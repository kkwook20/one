// frontend/src/components/realtime/RealtimeLogViewer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, Filter, Download, Trash2, 
  Play, Pause, Search, X, ChevronUp,
  ChevronDown, Circle
} from 'lucide-react';
import { useWebSocket } from './WebSocketProvider';

const RealtimeLogViewer = ({ 
  nodeId = null,
  maxLogs = 1000,
  className = "",
  height = "400px"
}) => {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [logLevel, setLogLevel] = useState('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  
  const { on, isConnected, subscribe, unsubscribe } = useWebSocket();
  const logsEndRef = useRef(null);
  const containerRef = useRef(null);

  // Subscribe to logs
  useEffect(() => {
    if (!isConnected) return;

    const channel = nodeId ? `node:${nodeId}:logs` : 'logs:all';
    subscribe(channel);

    const unsubscribeHandler = on('log', (message) => {
      if (!nodeId || message.nodeId === nodeId) {
        const newLog = {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: new Date(message.timestamp || Date.now()),
          level: message.level || 'info',
          nodeId: message.nodeId,
          message: message.content || message.message,
          data: message.data,
          source: message.source || 'system'
        };
        
        if (!isPaused) {
          setLogs(prevLogs => {
            const updated = [...prevLogs, newLog];
            return updated.slice(-maxLogs);
          });
        }
      }
    });

    return () => {
      unsubscribeHandler();
      unsubscribe(channel);
    };
  }, [nodeId, isConnected, isPaused, maxLogs, on, subscribe, unsubscribe]);

  // Filter logs
  useEffect(() => {
    let filtered = logs;
    
    // Filter by level
    if (logLevel !== 'all') {
      filtered = filtered.filter(log => log.level === logLevel);
    }
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(term) ||
        log.nodeId?.toLowerCase().includes(term) ||
        JSON.stringify(log.data).toLowerCase().includes(term)
      );
    }
    
    setFilteredLogs(filtered);
  }, [logs, logLevel, searchTerm]);

  // Auto scroll
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  const handleClear = () => {
    setLogs([]);
    setFilteredLogs([]);
  };

  const handleExport = () => {
    const data = JSON.stringify(logs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs-${nodeId || 'all'}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getLevelColor = (level) => {
    const colors = {
      debug: 'text-gray-400',
      info: 'text-blue-400',
      warning: 'text-yellow-400',
      error: 'text-red-400',
      success: 'text-green-400'
    };
    return colors[level] || 'text-gray-400';
  };

  const getLevelIcon = (level) => {
    const icons = {
      debug: <Circle className="w-2 h-2" />,
      info: <Circle className="w-2 h-2" />,
      warning: <Circle className="w-2 h-2" />,
      error: <Circle className="w-2 h-2" />,
      success: <Circle className="w-2 h-2" />
    };
    return icons[level] || <Circle className="w-2 h-2" />;
  };

  const formatTimestamp = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3 
    });
  };

  const logStats = {
    total: logs.length,
    debug: logs.filter(l => l.level === 'debug').length,
    info: logs.filter(l => l.level === 'info').length,
    warning: logs.filter(l => l.level === 'warning').length,
    error: logs.filter(l => l.level === 'error').length,
    success: logs.filter(l => l.level === 'success').length
  };

  return (
    <div className={`bg-gray-900 rounded-lg shadow-lg flex flex-col ${className}`} 
         style={{ height: isExpanded ? '80vh' : height }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-200">
            {nodeId ? `Node Logs (${nodeId})` : 'System Logs'}
          </h3>
          <span className="text-xs text-gray-500">
            ({filteredLogs.length} / {logs.length})
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search logs..."
              className="pl-8 pr-8 py-1 bg-gray-800 text-gray-200 text-xs rounded outline-none focus:ring-1 focus:ring-blue-500 w-40"
            />
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          
          {/* Level Filter */}
          <select
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value)}
            className="px-2 py-1 bg-gray-800 text-gray-200 text-xs rounded outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="success">Success</option>
          </select>
          
          {/* Actions */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1.5 rounded transition-colors ${
              isPaused ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-gray-800 text-gray-400 hover:text-white'
            }`}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded transition-colors ${
              autoScroll ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-gray-800 text-gray-400 hover:text-white'
            }`}
            title="Auto Scroll"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleExport}
            className="p-1.5 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
            title="Export Logs"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
            title="Clear Logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {isPaused && (
        <div className="px-3 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-400 text-center">
          Logs paused - new logs will not be displayed
        </div>
      )}
      
      <div className="flex items-center gap-4 px-3 py-2 border-b border-gray-700 text-xs">
        <span className="text-gray-400">Total: {logStats.total}</span>
        {logStats.debug > 0 && <span className="text-gray-400">Debug: {logStats.debug}</span>}
        {logStats.info > 0 && <span className="text-blue-400">Info: {logStats.info}</span>}
        {logStats.warning > 0 && <span className="text-yellow-400">Warning: {logStats.warning}</span>}
        {logStats.error > 0 && <span className="text-red-400">Error: {logStats.error}</span>}
        {logStats.success > 0 && <span className="text-green-400">Success: {logStats.success}</span>}
      </div>

      {/* Logs Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs"
        style={{ backgroundColor: '#0a0a0a' }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center text-gray-600 py-8">
            {searchTerm || logLevel !== 'all' 
              ? 'No logs match the current filters' 
              : 'No logs yet...'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                className={`flex items-start gap-2 px-2 py-1 rounded hover:bg-gray-800/50 cursor-pointer transition-colors ${
                  selectedLog?.id === log.id ? 'bg-gray-800 ring-1 ring-blue-500' : ''
                }`}
              >
                <span className="text-gray-600 whitespace-nowrap">
                  {formatTimestamp(log.timestamp)}
                </span>
                
                <span className={`${getLevelColor(log.level)} flex items-center gap-1`}>
                  {getLevelIcon(log.level)}
                  <span className="uppercase w-12">{log.level}</span>
                </span>
                
                {log.nodeId && (
                  <span className="text-gray-600">
                    [{log.nodeId}]
                  </span>
                )}
                
                <span className="text-gray-300 flex-1 break-all">
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Selected Log Details */}
      {selectedLog && (
        <div className="p-3 border-t border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-gray-300">Log Details</h4>
            <button
              onClick={() => setSelectedLog(null)}
              className="text-gray-500 hover:text-gray-300"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex gap-2">
              <span className="text-gray-500 w-20">Timestamp:</span>
              <span className="text-gray-300">{selectedLog.timestamp.toLocaleString()}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 w-20">Level:</span>
              <span className={getLevelColor(selectedLog.level)}>{selectedLog.level}</span>
            </div>
            {selectedLog.nodeId && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-20">Node:</span>
                <span className="text-gray-300">{selectedLog.nodeId}</span>
              </div>
            )}
            {selectedLog.source && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-20">Source:</span>
                <span className="text-gray-300">{selectedLog.source}</span>
              </div>
            )}
            {selectedLog.data && (
              <div className="mt-2">
                <span className="text-gray-500">Additional Data:</span>
                <pre className="mt-1 p-2 bg-gray-900 rounded text-gray-300 overflow-x-auto">
                  {JSON.stringify(selectedLog.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RealtimeLogViewer;