// frontend/src/components/nodes/editors/WorkerNodeEditor.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Code, MessageSquare, Terminal, History, Save, 
  Play, RotateCcw, Copy, Check, ChevronRight, 
  ChevronLeft, FileText, Download
} from 'lucide-react';
import NodeHeader from '../common/NodeHeader';
import NodeExecutionStatus from '../common/NodeExecutionStatus';
import VariableAutocomplete from '../common/VariableAutocomplete';

const WorkerNodeEditor = ({ 
  nodeId,
  nodeName = "Worker Node",
  initialCode = "",
  initialPrompt = "",
  onSave,
  onExecute,
  globalVariables = {},
  className = ""
}) => {
  const [activePanel, setActivePanel] = useState('code'); // code, prompt, output
  const [code, setCode] = useState(initialCode);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [output, setOutput] = useState('');
  const [executionStatus, setExecutionStatus] = useState('idle');
  const [executionProgress, setExecutionProgress] = useState(0);
  const [showHistory, setShowHistory] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [copied, setCopied] = useState(false);
  const codeEditorRef = useRef(null);
  const promptEditorRef = useRef(null);

  // Mock version history
  const [versionHistory] = useState([
    {
      id: 'v5',
      version: 5,
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      author: 'AI Assistant',
      message: 'Optimized data processing logic',
      changes: { additions: 15, deletions: 8 }
    },
    {
      id: 'v4',
      version: 4,
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      author: 'User',
      message: 'Added error handling',
      changes: { additions: 23, deletions: 2 }
    },
    {
      id: 'v3',
      version: 3,
      timestamp: new Date(Date.now() - 1000 * 60 * 60),
      author: 'AI Assistant',
      message: 'Refactored main function',
      changes: { additions: 45, deletions: 30 }
    },
    {
      id: 'v2',
      version: 2,
      timestamp: new Date(Date.now() - 1000 * 60 * 120),
      author: 'User',
      message: 'Initial implementation',
      changes: { additions: 120, deletions: 0 }
    },
    {
      id: 'v1',
      version: 1,
      timestamp: new Date(Date.now() - 1000 * 60 * 180),
      author: 'System',
      message: 'Node created',
      changes: { additions: 5, deletions: 0 }
    }
  ]);

  const handleExecute = async () => {
    setExecutionStatus('running');
    setExecutionProgress(0);
    setOutput('');
    
    // Simulate execution
    const interval = setInterval(() => {
      setExecutionProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setExecutionStatus('success');
          setOutput(`Execution completed successfully!\n\nOutput:\n${JSON.stringify({ result: 'Sample output data', timestamp: new Date().toISOString() }, null, 2)}`);
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    onExecute?.({ code, prompt });
  };

  const handleSave = () => {
    onSave?.({ code, prompt });
  };

  const handleCopyOutput = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTimestamp = (date) => {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const panels = {
    code: {
      icon: <Code className="w-4 h-4" />,
      title: 'Code Editor',
      content: (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-gray-700">
            <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              main.py
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCode('')}
                className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                title="Clear"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 p-3">
            <textarea
              ref={codeEditorRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-full bg-gray-900 text-gray-100 font-mono text-sm p-3 rounded resize-none outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="# Write your Python code here&#10;&#10;def process_data(input_data):&#10;    # Your code here&#10;    return output_data"
              spellCheck={false}
            />
          </div>
        </div>
      )
    },
    prompt: {
      icon: <MessageSquare className="w-4 h-4" />,
      title: 'AI Prompt',
      content: (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-gray-700">
            <h3 className="text-sm font-medium text-gray-300">Instructions for AI</h3>
          </div>
          <div className="flex-1 p-3 space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">System Prompt</label>
              <textarea
                ref={promptEditorRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-32 bg-gray-800 text-gray-100 text-sm p-3 rounded resize-none outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe what this node should do..."
              />
            </div>
            
            <div>
              <label className="block text-xs text-gray-400 mb-1">Variables</label>
              <VariableAutocomplete
                value=""
                onChange={() => {}}
                globalVariables={globalVariables}
                placeholder="Use variables in your prompt..."
              />
            </div>

            <div className="pt-3 border-t border-gray-700">
              <h4 className="text-xs text-gray-400 mb-2">Prompt Templates</h4>
              <div className="space-y-1">
                <button className="w-full text-left px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors">
                  Data Processing Template
                </button>
                <button className="w-full text-left px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors">
                  API Integration Template
                </button>
                <button className="w-full text-left px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors">
                  File Operations Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    },
    output: {
      icon: <Terminal className="w-4 h-4" />,
      title: 'Output',
      content: (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-gray-700">
            <h3 className="text-sm font-medium text-gray-300">Execution Output</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyOutput}
                disabled={!output}
                className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                title="Copy Output"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setOutput('')}
                disabled={!output}
                className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                title="Clear Output"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex-1 p-3">
            <NodeExecutionStatus
              status={executionStatus}
              progress={executionProgress}
              message={executionStatus === 'running' ? 'Executing code...' : ''}
              showDetails={false}
              className="mb-3"
            />
            
            <pre className="w-full h-full bg-gray-900 text-gray-100 font-mono text-sm p-3 rounded overflow-auto">
              {output || 'No output yet. Execute the code to see results.'}
            </pre>
          </div>
        </div>
      )
    }
  };

  return (
    <div className={`bg-gray-800 rounded-lg shadow-lg ${className}`}>
      <NodeHeader
        nodeId={nodeId}
        nodeType="worker"
        nodeName={nodeName}
        isExecuting={executionStatus === 'running'}
        onExecute={handleExecute}
        onStopExecute={() => setExecutionStatus('idle')}
        onAI={() => console.log('AI Assistant')}
        onMenu={(action) => console.log('Menu action:', action)}
      />
      
      <div className="flex h-[600px]">
        {/* Main Editor Area */}
        <div className="flex-1 flex">
          {/* Panel Tabs */}
          <div className="w-12 bg-gray-900 border-r border-gray-700">
            {Object.entries(panels).map(([key, panel]) => (
              <button
                key={key}
                onClick={() => setActivePanel(key)}
                className={`w-full p-3 flex justify-center transition-colors ${
                  activePanel === key 
                    ? 'bg-blue-500 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title={panel.title}
              >
                {panel.icon}
              </button>
            ))}
          </div>
          
          {/* Panel Content */}
          <div className="flex-1">
            {panels[activePanel].content}
          </div>
        </div>
        
        {/* Version History Sidebar */}
        <div className={`transition-all duration-300 ${showHistory ? 'w-64' : 'w-0'} overflow-hidden`}>
          <div className="w-64 h-full bg-gray-900 border-l border-gray-700">
            <div className="flex items-center justify-between p-3 border-b border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <History className="w-4 h-4" />
                Version History
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="overflow-y-auto h-full">
              {versionHistory.map((version) => (
                <button
                  key={version.id}
                  onClick={() => setSelectedVersion(version.id)}
                  className={`w-full p-3 text-left border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                    selectedVersion === version.id ? 'bg-gray-800' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-sm font-medium text-gray-200">
                      v{version.version}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatTimestamp(version.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{version.message}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-green-400">+{version.changes.additions}</span>
                    <span className="text-red-400">-{version.changes.deletions}</span>
                    <span className="text-gray-500">{version.author}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Show History Button */}
        {!showHistory && (
          <button
            onClick={() => setShowHistory(true)}
            className="w-8 bg-gray-900 border-l border-gray-700 hover:bg-gray-800 transition-colors flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>
      
      {/* Action Bar */}
      <div className="flex items-center justify-between p-3 border-t border-gray-700 bg-gray-900/50">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={() => {}}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
        
        <button
          onClick={handleExecute}
          disabled={executionStatus === 'running'}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 text-white rounded transition-colors flex items-center gap-2"
        >
          <Play className="w-4 h-4" />
          Execute
        </button>
      </div>
    </div>
  );
};

export default WorkerNodeEditor;