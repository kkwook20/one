// frontend/src/components/modals/WorkerEditModal.tsx
import React, { useState, useEffect } from 'react';
import { Save, Play, Database, Clock, Award, Loader, X } from 'lucide-react';
import { Node, Section, Version } from '../../types';
import { apiClient } from '../../api/client';
import { CodeEditor } from '../CodeEditor';

interface WorkerEditModalProps {
  node: Node;
  section: Section;
  allSections: Section[];
  onClose: () => void;
  onSave: (node: Node) => void;
}

export const WorkerEditModal: React.FC<WorkerEditModalProps> = ({
  node,
  section,
  allSections,
  onClose,
  onSave
}) => {
  const [editedNode, setEditedNode] = useState(node);
  const [selectedInput, setSelectedInput] = useState<string>(node.connectedFrom?.[0] || '');
  const [connectedNodeData, setConnectedNodeData] = useState<any>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeTab, setActiveTab] = useState<'code' | 'history'>('code');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; output?: any; error?: string } | null>(null);

  useEffect(() => {
    // Load connected node data
    if (selectedInput || node.connectedFrom?.[0]) {
      const inputId = selectedInput || node.connectedFrom?.[0];
      const inputNode = section.nodes.find(n => n.id === inputId);
      
      if (inputNode?.output) {
        setConnectedNodeData(inputNode.output);
      }
    }
  }, [selectedInput, node.connectedFrom, section]);

  useEffect(() => {
    // Load version history
    apiClient.getVersions(node.id)
      .then(res => setVersions(res.data))
      .catch(console.error);
  }, [node.id]);

  const handleSave = async () => {
    onSave(editedNode);
    onClose();
  };

  const executeCode = async () => {
    setIsExecuting(true);
    setExecutionResult(null);
    
    try {
      // Get connected outputs for execution
      const connectedOutputs: any = {};
      if (node.connectedFrom) {
        for (const connId of node.connectedFrom) {
          const connNode = section.nodes.find(n => n.id === connId);
          if (connNode?.output) {
            connectedOutputs[connNode.label] = connNode.output;
          }
        }
      }

      const response = await apiClient.executeNode(
        node.id,
        section.id,
        editedNode.code || '',
        connectedOutputs
      );
      
      if (response.data.status === 'started') {
        // 실행이 시작되었으므로 결과를 기다림
        // WebSocket을 통해 결과가 올 것이므로 일단 성공 메시지만 표시
        setTimeout(() => {
          setIsExecuting(false);
          setExecutionResult({
            success: true,
            output: "Code execution started. Check the node for results."
          });
        }, 1000);
      }
    } catch (error: any) {
      console.error('Execution failed:', error);
      setIsExecuting(false);
      setExecutionResult({
        success: false,
        error: error.response?.data?.detail || error.message || 'Execution failed'
      });
    }
  };

  const restoreVersion = async (versionId: string) => {
    try {
      await apiClient.restoreVersion(node.id, versionId);
      alert('Version restored successfully!');
      onClose();
    } catch (error) {
      console.error('Failed to restore version:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-7xl h-5/6 flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">Edit {node.label}</h2>
          <button onClick={onClose} className="text-2xl">&times;</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Input */}
          <div className="w-1/4 border-r p-4 overflow-y-auto">
            <h3 className="font-semibold mb-2">Input Source</h3>
            <select
              value={selectedInput}
              onChange={(e) => setSelectedInput(e.target.value)}
              className="w-full border rounded p-2 mb-4"
            >
              <option value="">No input</option>
              {/* Only show nodes that are connected to this node */}
              {node.connectedFrom?.map(connNodeId => {
                const connNode = section.nodes.find(n => n.id === connNodeId);
                if (!connNode) return null;
                return (
                  <option key={connNode.id} value={connNode.id}>
                    {connNode.label} ({connNode.type})
                  </option>
                );
              })}
            </select>

            {connectedNodeData && (
              <div className="bg-gray-100 rounded p-3">
                <h4 className="font-medium mb-2">Input Data:</h4>
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(connectedNodeData, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Center Panel - Code Editor with tabs */}
          <div className="flex-1 flex flex-col">
            <div className="flex border-b">
              <button
                onClick={() => setActiveTab('code')}
                className={`px-4 py-2 ${activeTab === 'code' ? 'bg-gray-100 border-b-2 border-blue-500' : ''}`}
              >
                Code
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 ${activeTab === 'history' ? 'bg-gray-100 border-b-2 border-blue-500' : ''}`}
              >
                Update History
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden">
              {activeTab === 'code' ? (
                <CodeEditor
                  value={editedNode.code || `# ${node.label} Implementation
# Access input data via 'inputs' variable or get_connected_outputs()
# Set results in 'output' variable

import json

# Get connected outputs
data = get_connected_outputs()

# Your processing logic here
output = {
    "result": "processed data",
    "status": "success"
}
`}
                  onChange={(code) => setEditedNode({ ...editedNode, code })}
                />
              ) : (
                <div className="p-4 overflow-y-auto">
                  <h3 className="font-semibold mb-3">Update History</h3>
                  <div className="space-y-3">
                    {editedNode.updateHistory?.map((update, idx) => (
                      <div key={idx} className="border rounded p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm text-gray-600">
                              {new Date(update.timestamp).toLocaleString()}
                            </div>
                            <div className="font-medium">
                              Type: {update.type}
                              {update.by && ` by ${update.by}`}
                            </div>
                            {update.score !== undefined && (
                              <div className="flex items-center gap-1 mt-1">
                                <Award className="w-4 h-4 text-yellow-500" />
                                <span className="text-sm">AI Score: {update.score}/100</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Bottom Panel - Execution Result (if any) */}
            {executionResult && (
              <div className={`p-3 border-t ${executionResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    {executionResult.success ? (
                      <div className="text-green-700">
                        <strong>Success:</strong> {typeof executionResult.output === 'string' ? executionResult.output : JSON.stringify(executionResult.output)}
                      </div>
                    ) : (
                      <div className="text-red-700">
                        <strong>Error:</strong> {executionResult.error}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setExecutionResult(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            
            <div className="p-4 border-t flex gap-2">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={executeCode}
                disabled={isExecuting}
                className={`flex items-center gap-2 rounded px-4 py-2 ${
                  isExecuting 
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                {isExecuting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Run Code
                  </>
                )}
              </button>
              {editedNode.vectorDB && (
                <button className="flex items-center gap-2 bg-purple-500 text-white rounded px-4 py-2 hover:bg-purple-600">
                  <Database className="w-4 h-4" />
                  Configure DB
                </button>
              )}
              <button
                onClick={onClose}
                className="ml-auto flex items-center gap-2 bg-gray-300 text-gray-700 rounded px-4 py-2 hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Right Panel - Output & History */}
          <div className="w-1/3 border-l flex flex-col">
            <div className="flex-1 p-4 overflow-y-auto">
              <h3 className="font-semibold mb-2">Output</h3>
              {editedNode.output ? (
                <pre className="bg-gray-100 rounded p-3 text-xs overflow-x-auto">
                  {JSON.stringify(editedNode.output, null, 2)}
                </pre>
              ) : (
                <div className="text-gray-500">No output yet</div>
              )}
              
              {editedNode.aiScore && (
                <div className="mt-4 p-3 bg-yellow-50 rounded">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-yellow-600" />
                    <span className="font-medium">AI Evaluation Score</span>
                  </div>
                  <div className="text-2xl font-bold text-yellow-600 mt-1">
                    {editedNode.aiScore}/100
                  </div>
                </div>
              )}
            </div>
            
            <div className="border-t p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Version History
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {versions.map(v => (
                  <div key={v.id} className="border rounded p-2 text-sm">
                    <div className="text-gray-600">{new Date(v.timestamp).toLocaleString()}</div>
                    <div className="flex justify-between items-center">
                      <span>Model: {v.metadata.modelVersion}</span>
                      <button 
                        onClick={() => restoreVersion(v.id)}
                        className="text-blue-500 hover:underline"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};