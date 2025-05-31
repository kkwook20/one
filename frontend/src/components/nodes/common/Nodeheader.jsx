// frontend/src/components/nodes/common/NodeHeader.jsx
import React, { useState } from 'react';
import { MoreVertical, Sparkles, Play, Square, Loader2 } from 'lucide-react';
import NodeDropdownMenu from './NodeDropdownMenu';

const NodeHeader = ({ 
  nodeId, 
  nodeType, 
  nodeName, 
  isExecuting = false,
  onMenu,
  onAI,
  onExecute,
  onStopExecute,
  customColor
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const getNodeColor = () => {
    if (customColor) return customColor;
    
    const colors = {
      worker: { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', glow: 'shadow-blue-500/20' },
      supervisor: { bg: 'bg-purple-500', hover: 'hover:bg-purple-600', glow: 'shadow-purple-500/20' },
      planner: { bg: 'bg-green-500', hover: 'hover:bg-green-600', glow: 'shadow-green-500/20' },
      watcher: { bg: 'bg-yellow-500', hover: 'hover:bg-yellow-600', glow: 'shadow-yellow-500/20' },
      scheduler: { bg: 'bg-pink-500', hover: 'hover:bg-pink-600', glow: 'shadow-pink-500/20' },
      flow: { bg: 'bg-red-500', hover: 'hover:bg-red-600', glow: 'shadow-red-500/20' },
      storage: { bg: 'bg-gray-500', hover: 'hover:bg-gray-600', glow: 'shadow-gray-500/20' },
      memory: { bg: 'bg-indigo-500', hover: 'hover:bg-indigo-600', glow: 'shadow-indigo-500/20' },
      trigger: { bg: 'bg-orange-500', hover: 'hover:bg-orange-600', glow: 'shadow-orange-500/20' },
    };
    
    return colors[nodeType.toLowerCase()] || colors.worker;
  };

  const color = getNodeColor();

  return (
    <div className={`flex items-center justify-between p-3 bg-gray-800 rounded-t-lg border-b border-gray-700 ${isExecuting ? `shadow-lg ${color.glow}` : ''}`}>
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${color.bg} ${isExecuting ? 'animate-pulse' : ''}`} />
        <h3 className="text-white font-semibold text-sm">{nodeName || `${nodeType} Node`}</h3>
      </div>
      
      <div className="flex items-center gap-1">
        {/* Menu Button */}
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1.5 rounded hover:bg-gray-700 transition-colors relative"
          title="Node Menu"
        >
          <MoreVertical className="w-4 h-4 text-gray-400 hover:text-white" />
          {showMenu && (
            <NodeDropdownMenu
              nodeId={nodeId}
              nodeType={nodeType}
              onClose={() => setShowMenu(false)}
              onAction={(action) => {
                onMenu?.(action);
                setShowMenu(false);
              }}
            />
          )}
        </button>
        
        {/* AI Button */}
        <button
          onClick={onAI}
          className={`p-1.5 rounded ${color.bg} ${color.hover} text-white transition-colors`}
          title="AI Assistant"
        >
          <Sparkles className="w-4 h-4" />
        </button>
        
        {/* Execute/Stop Button */}
        <button
          onClick={isExecuting ? onStopExecute : onExecute}
          disabled={!onExecute && !onStopExecute}
          className={`p-1.5 rounded flex items-center gap-1 transition-colors ${
            isExecuting 
              ? 'bg-red-500 hover:bg-red-600 text-white' 
              : `${color.bg} ${color.hover} text-white`
          } ${(!onExecute && !onStopExecute) ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={isExecuting ? 'Stop' : 'Execute'}
        >
          {isExecuting ? (
            <>
              <Square className="w-3.5 h-3.5" />
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </>
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
};

export default NodeHeader;