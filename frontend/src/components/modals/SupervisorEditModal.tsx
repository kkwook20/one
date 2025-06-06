// frontend/src/components/modals/SupervisorEditModal.tsx - 정리된 버전
import React, { useState, useEffect } from 'react';
import { X, Award, Pencil, Save, Play, FileText, Loader } from 'lucide-react';
import { Node, Section } from '../../types';
import { apiClient } from '../../api/client';
import { CodeEditor } from '../CodeEditor';

interface SupervisorEditModalProps {
  node: Node;
  section: Section;
  allSections: Section[];
  onClose: () => void;
  onSave: (node: Node) => void;
}

export const SupervisorEditModal: React.FC<SupervisorEditModalProps> = ({
  node,
  section,
  allSections,
  onClose,
  onSave
}) => {
  const [editedNode, setEditedNode] = useState(node);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [models, setModels] = useState<string[]>(['none']);
  const [supervisedNodesList, setSupervisedNodesList] = useState<string[]>(node.supervisedNodes || []);
  const [modificationHistory, setModificationHistory] = useState<any[]>(node.modificationHistory || []);
  const [evaluationHistory, setEvaluationHistory] = useState<any[]>(node.evaluationHistory || []);
  const [selectedModification, setSelectedModification] = useState<any>(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(editedNode.label);
  const [showJsonViewer, setShowJsonViewer] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; output?: any; error?: string } | null>(null);

  useEffect(() => {
    // Load available models
    apiClient.getModels()
      .then(res => {
        const modelList = res.data.data.map((m: any) => m.id);
        setModels(['none', ...modelList]);
      })
      .catch(() => {
        // Silently fail if API is not available
        setModels(['none']);
      });
  }, []);

  const handleSave = () => {
    onSave({ 
      ...editedNode, 
      supervisedNodes: supervisedNodesList,
      modificationHistory,
      evaluationHistory
    });
    onClose();
  };

  const handleRename = () => {
    setEditedNode({ ...editedNode, label: tempName });
    setIsEditingName(false);
  };

  const handleCancelRename = () => {
    setTempName(editedNode.label);
    setIsEditingName(false);
  };

  const executeCode = async () => {
    setIsExecuting(true);
    setExecutionResult(null);
    
    try {
      const response = await apiClient.executeNode(
        node.id,
        section.id,
        editedNode.code || '',
        {}
      );
      
      if (response.data.status === 'started') {
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

  const executeSupervision = async () => {
    if (!selectedTarget) {
      alert('Please select a node to supervise');
      return;
    }
    
    try {
      const response = await apiClient.executeSupervisor(
        section.id,
        node.id,
        selectedTarget
      );
      
      if (response.data.success) {
        alert(`Code modification completed! AI Score: ${response.data.score}/100`);
        
        // Add to modification history
        if (response.data.modificationId) {
          const newMod = {
            id: response.data.modificationId,
            timestamp: new Date().toISOString(),
            targetNodeId: selectedTarget,
            score: response.data.score,
            status: 'pending'
          };
          setModificationHistory([...modificationHistory, newMod]);
        }
        
        // Add to supervised nodes list
        if (!supervisedNodesList.includes(selectedTarget)) {
          setSupervisedNodesList([...supervisedNodesList, selectedTarget]);
        }
      }
    } catch (error) {
      console.error('Supervision failed:', error);
      alert('Supervision is not yet implemented in the backend');
    }
  };

  const executePlanning = async () => {
    try {
      const response = await apiClient.evaluateSection(section.id, node.id);
      
      if (response.data) {
        setEvaluationHistory([...evaluationHistory, response.data]);
        setSelectedEvaluation(response.data);
        alert('Section evaluation completed!');
      }
    } catch (error) {
      console.error('Planning failed:', error);
      alert('Planning is not yet implemented in the backend');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const nodeId = e.dataTransfer.getData('nodeId');
    const nodeType = e.dataTransfer.getData('nodeType');
    
    if (nodeId && nodeType === 'worker' && !supervisedNodesList.includes(nodeId)) {
      setSupervisedNodesList([...supervisedNodesList, nodeId]);
    }
  };

  const removeSupervisedNode = (nodeId: string) => {
    setSupervisedNodesList(supervisedNodesList.filter(id => id !== nodeId));
  };

  // Sort history by date
  const sortedHistory = [...(node.type === 'supervisor' ? modificationHistory : evaluationHistory)]
    .sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

  const getDefaultCode = () => {
    return `# ${node.type} logic
# This code manages other nodes
# Access planning data via get_global_var()

def ${node.type === 'supervisor' ? 'supervise' : 'plan'}_nodes():
    # Get planner's guidance
    plan = get_global_var("${section.name.toLowerCase()}.planner.${node.id}.output")
    
    # Implement ${node.type} logic
    pass`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[90%] max-w-7xl h-[90%] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{node.type === 'supervisor' ? '👔' : '📋'}</span>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="px-2 py-1 border rounded focus:outline-none focus:border-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') handleCancelRename();
                  }}
                />
                <button
                  onClick={handleRename}
                  className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                >
                  Rename
                </button>
                <button
                  onClick={handleCancelRename}
                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h2 className="text-xl font-bold group flex items-center gap-1">
                <span>{node.type === 'supervisor' ? 'Supervisor' : 'Planner'} - </span>
                <span 
                  onClick={() => {
                    setIsEditingName(true);
                    setTempName(editedNode.label);
                  }}
                  className="cursor-pointer hover:text-blue-600"
                >
                  {editedNode.label}
                </span>
                <button
                  onClick={() => {
                    setIsEditingName(true);
                    setTempName(editedNode.label);
                  }}
                  className="invisible group-hover:visible p-1 hover:bg-gray-100 rounded"
                >
                  <Pencil className="w-4 h-4 text-gray-600" />
                </button>
              </h2>
            )}
          </div>
          <button onClick={onClose} className="text-2xl hover:text-gray-600">&times;</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Code */}
          <div className="w-1/3 border-r flex flex-col">
            <div className="p-3 border-b bg-gray-50">
              <h3 className="font-semibold">
                {node.type === 'supervisor' ? 'Supervisor Logic' : 'Planning Logic'}
              </h3>
            </div>
            <div className="flex-1">
              <CodeEditor
                value={editedNode.code || getDefaultCode()}
                onChange={(code) => setEditedNode({ ...editedNode, code })}
              />
            </div>
            
            {/* Execution Result */}
            {executionResult && (
              <div className={`p-3 ${executionResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
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
            
            <div className="p-3 border-t">
              <select
                value={editedNode.model || 'none'}
                onChange={(e) => setEditedNode({ ...editedNode, model: e.target.value })}
                className="w-full border rounded px-3 py-2"
              >
                {models.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Middle Panel - Management Interface */}
          <div className="w-1/3 border-r flex flex-col">
            <div className="p-3 border-b bg-gray-50">
              <h3 className="font-semibold">
                {node.type === 'supervisor' ? 'Node Management' : 'Section Overview'}
              </h3>
            </div>
            
            {node.type === 'supervisor' ? (
              <div className="flex-1 p-4 overflow-y-auto">
                {/* Supervised Nodes Drop Zone */}
                <div 
                  className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <p className="text-sm text-gray-600 mb-2">
                    Drag Worker nodes here to supervise them
                  </p>
                  <div className="space-y-2">
                    {supervisedNodesList.map(nodeId => {
                      const supervisedNode = section.nodes.find(n => n.id === nodeId);
                      return supervisedNode ? (
                        <div key={nodeId} className="flex justify-between items-center bg-gray-100 rounded p-2">
                          <span>{supervisedNode.label}</span>
                          <button
                            onClick={() => removeSupervisedNode(nodeId)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Or select a node:</label>
                  <select
                    value={selectedTarget}
                    onChange={(e) => setSelectedTarget(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Select a node to supervise</option>
                    {section.nodes
                      .filter(n => n.id !== node.id && n.type === 'worker')
                      .map(n => (
                        <option key={n.id} value={n.id}>{n.label}</option>
                      ))}
                  </select>
                </div>
                
                <button
                  onClick={executeSupervision}
                  disabled={!selectedTarget || !editedNode.model || editedNode.model === 'none'}
                  className="w-full bg-blue-500 text-white rounded px-4 py-2 disabled:bg-gray-300"
                >
                  Execute Supervision
                </button>
              </div>
            ) : (
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="mb-4">
                  <h4 className="font-semibold mb-2">Section Nodes</h4>
                  <div className="space-y-2">
                    {section.nodes.map(n => (
                      <div key={n.id} className="border rounded p-3">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{n.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">{n.type}</span>
                            {n.aiScore && (
                              <div className="flex items-center gap-1">
                                <Award className="w-4 h-4 text-yellow-500" />
                                <span className="text-sm">{n.aiScore}/100</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {n.tasks && n.tasks.length > 0 && (
                          <div className="mt-2 text-sm text-gray-600">
                            {n.tasks.filter(t => t.status === 'pending').length} pending tasks
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                
                <button
                  onClick={executePlanning}
                  disabled={!editedNode.model || editedNode.model === 'none'}
                  className="w-full bg-green-500 text-white rounded px-4 py-2 disabled:bg-gray-300"
                >
                  Evaluate Section
                </button>
              </div>
            )}
          </div>

          {/* Right Panel - History */}
          <div className="w-1/3 flex flex-col">
            <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-semibold">
                {node.type === 'supervisor' ? 'Modification History' : 'Evaluation History'}
              </h3>
              <button
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className="text-sm text-blue-500"
              >
                {sortOrder === 'desc' ? '↓ Newest' : '↑ Oldest'}
              </button>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto">
              {sortedHistory.length > 0 ? (
                <div className="space-y-3">
                  {sortedHistory.map((item: any) => (
                    <div 
                      key={item.id} 
                      className={`border rounded p-3 cursor-pointer hover:bg-gray-50 ${
                        (node.type === 'supervisor' ? selectedModification?.id : selectedEvaluation?.id) === item.id 
                          ? 'border-blue-500' 
                          : ''
                      }`}
                      onClick={() => {
                        if (node.type === 'supervisor') {
                          setSelectedModification(item);
                        } else {
                          setSelectedEvaluation(item);
                        }
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-sm text-gray-600">
                            {new Date(item.timestamp).toLocaleString()}
                          </div>
                          {node.type === 'supervisor' ? (
                            <>
                              <div className="font-medium">
                                Target: {section.nodes.find(n => n.id === item.targetNodeId)?.label}
                              </div>
                              {item.score !== undefined && (
                                <div className="flex items-center gap-1 mt-1">
                                  <Award className="w-4 h-4 text-yellow-500" />
                                  <span className="text-sm">AI Score: {item.score}/100</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="font-medium">Section Evaluation</div>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          item.status === 'accepted' ? 'bg-green-100 text-green-700' :
                          item.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {item.status || 'pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-center">No history available</div>
              )}
            </div>
          </div>
        </div>

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
          <button
            onClick={() => setShowJsonViewer(true)}
            className="flex items-center gap-2 bg-gray-600 text-white rounded px-4 py-2 hover:bg-gray-700"
          >
            <FileText className="w-4 h-4" />
            View JSON
          </button>
          <button 
            onClick={onClose} 
            className="ml-auto bg-gray-300 rounded px-4 py-2 hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* JSON Viewer Modal */}
      {showJsonViewer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg w-[60%] max-w-3xl h-[90%] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5" />
                JSON Source - {editedNode.label}
              </h2>
              <button 
                onClick={() => setShowJsonViewer(false)} 
                className="text-2xl hover:text-gray-600"
              >&times;</button>
            </div>
            
            <div className="flex-1 p-4 overflow-auto">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm">
                {JSON.stringify(editedNode, null, 2)}
              </pre>
            </div>
            
            <div className="p-4 border-t flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(editedNode, null, 2));
                  alert('JSON copied to clipboard');
                }}
                className="flex-1 bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setShowJsonViewer(false)}
                className="flex-1 bg-gray-300 rounded px-4 py-2 hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};