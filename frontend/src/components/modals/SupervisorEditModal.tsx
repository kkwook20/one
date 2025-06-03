// Related files:
// - frontend/src/App.tsx
// - frontend/src/types/index.ts
// - frontend/src/api/client.ts
// - frontend/src/components/CodeEditor.tsx
// - frontend/src/components/modals/index.ts
// Location: frontend/src/components/modals/SupervisorEditModal.tsx

import React, { useState, useEffect } from 'react';
import { X, Award } from 'lucide-react';
import { Node, Section, Version } from '../../types';
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
  const [versions, setVersions] = useState<Version[]>([]);
  const [supervisedNodesList, setSupervisedNodesList] = useState<string[]>(node.supervisedNodes || []);
  const [modificationHistory, setModificationHistory] = useState<any[]>([]);
  const [evaluationHistory, setEvaluationHistory] = useState<any[]>([]);
  const [selectedModification, setSelectedModification] = useState<any>(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState<any>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    // Load available models
    apiClient.getModels().then(res => {
      const modelList = res.data.data.map((m: any) => m.id);
      setModels(['none', ...modelList]);
    });
    
    // Load modification/evaluation history
    if (node.type === 'supervisor' && (node as any).modificationHistory) {
      setModificationHistory((node as any).modificationHistory || []);
    }
    if (node.type === 'planner' && (node as any).evaluationHistory) {
      setEvaluationHistory((node as any).evaluationHistory || []);
    }
  }, [node]);

  const handleSave = () => {
    onSave({ ...editedNode, supervisedNodes: supervisedNodesList });
    onClose();
  };

  const executeSupervision = async () => {
    if (!selectedTarget) return;
    
    try {
      const response = await apiClient.executeSupervisor(
        section.id,
        node.id,
        selectedTarget
      );
      
      if (response.data.success) {
        alert(`Code modification completed! AI Score: ${response.data.score}/100`);
        // Reload modification history
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
    }
  };

  const acceptModification = async (modId: string) => {
    try {
      await apiClient.acceptModification(node.id, modId);
      setModificationHistory(modificationHistory.map(m => 
        m.id === modId ? { ...m, status: 'accepted' } : m
      ));
    } catch (error) {
      console.error('Failed to accept modification:', error);
    }
  };

  const rejectModification = async (mod: any) => {
    try {
      await apiClient.rejectModification(node.id, mod.id, mod.targetNodeId);
      setModificationHistory(modificationHistory.map(m => 
        m.id === mod.id ? { ...m, status: 'rejected' } : m
      ));
    } catch (error) {
      console.error('Failed to reject modification:', error);
    }
  };

  const acceptEvaluation = async (evalId: string) => {
    try {
      await apiClient.acceptEvaluation(node.id, evalId);
      setEvaluationHistory(evaluationHistory.map(e => 
        e.id === evalId ? { ...e, status: 'accepted' } : e
      ));
    } catch (error) {
      console.error('Failed to accept evaluation:', error);
    }
  };

  const rejectEvaluation = async (evalId: string) => {
    try {
      await apiClient.rejectEvaluation(node.id, evalId);
      setEvaluationHistory(evaluationHistory.map(e => 
        e.id === evalId ? { ...e, status: 'rejected' } : e
      ));
    } catch (error) {
      console.error('Failed to reject evaluation:', error);
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-7xl h-5/6 flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">
            {node.type === 'supervisor' ? 'Supervisor' : 'Planner'} - {node.label}
          </h2>
          <button onClick={onClose} className="text-2xl">&times;</button>
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
                value={editedNode.code || `# ${node.type} logic
# This code manages other nodes
# Access planning data via get_global_var()

def ${node.type === 'supervisor' ? 'supervise' : 'plan'}_nodes():
    # Get planner's guidance
    plan = get_global_var("${section.name.toLowerCase()}.planner.${node.id}.output")
    
    # Implement ${node.type} logic
    pass
`}
                onChange={(code) => setEditedNode({ ...editedNode, code })}
              />
            </div>
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
              {node.type === 'supervisor' ? (
                <div className="space-y-3">
                  {sortedHistory.map((mod: any) => (
                    <div 
                      key={mod.id} 
                      className={`border rounded p-3 cursor-pointer hover:bg-gray-50 ${
                        selectedModification?.id === mod.id ? 'border-blue-500' : ''
                      }`}
                      onClick={() => setSelectedModification(mod)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-sm text-gray-600">
                            {new Date(mod.timestamp).toLocaleString()}
                          </div>
                          <div className="font-medium">
                            Target: {section.nodes.find(n => n.id === mod.targetNodeId)?.label}
                          </div>
                          {mod.score !== undefined && (
                            <div className="flex items-center gap-1 mt-1">
                              <Award className="w-4 h-4 text-yellow-500" />
                              <span className="text-sm">AI Score: {mod.score}/100</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            mod.status === 'accepted' ? 'bg-green-100 text-green-700' :
                            mod.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {mod.status || 'pending'}
                          </span>
                        </div>
                      </div>
                      
                      {mod.changes && (
                        <div className="mt-2 text-sm text-gray-600">
                          +{mod.changes.linesAdded} -{mod.changes.linesRemoved} lines
                        </div>
                      )}
                      
                      {mod.status === 'pending' && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              acceptModification(mod.id);
                            }}
                            className="text-sm bg-green-500 text-white px-3 py-1 rounded"
                          >
                            Accept
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              rejectModification(mod);
                            }}
                            className="text-sm bg-red-500 text-white px-3 py-1 rounded"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedHistory.map((evaluation: any) => (
                    <div 
                      key={evaluation.id} 
                      className={`border rounded p-3 cursor-pointer hover:bg-gray-50 ${
                        selectedEvaluation?.id === evaluation.id ? 'border-blue-500' : ''
                      }`}
                      onClick={() => setSelectedEvaluation(evaluation)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-sm text-gray-600">
                            {new Date(evaluation.timestamp).toLocaleString()}
                          </div>
                          <div className="font-medium">
                            Section Evaluation
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          evaluation.status === 'accepted' ? 'bg-green-100 text-green-700' :
                          evaluation.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {evaluation.status || 'pending'}
                        </span>
                      </div>
                      
                      {evaluation.nodeEvaluations && (
                        <div className="mt-2 text-sm">
                          <div className="text-gray-600">
                            Evaluated {evaluation.nodeEvaluations.length} nodes
                          </div>
                          <div className="mt-1">
                            {evaluation.nodeEvaluations.filter((ne: any) => ne.priority === 'high').length} high priority items
                          </div>
                        </div>
                      )}
                      
                      {evaluation.status === 'pending' && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              acceptEvaluation(evaluation.id);
                            }}
                            className="text-sm bg-green-500 text-white px-3 py-1 rounded"
                          >
                            Accept
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              rejectEvaluation(evaluation.id);
                            }}
                            className="text-sm bg-red-500 text-white px-3 py-1 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detail View */}
            {(selectedModification || selectedEvaluation) && (
              <div className="border-t p-4">
                <h4 className="font-semibold mb-2">Details</h4>
                {selectedModification && node.type === 'supervisor' && (
                  <div className="text-sm space-y-2">
                    <div>
                      <span className="font-medium">Target Node:</span>{' '}
                      {section.nodes.find(n => n.id === selectedModification.targetNodeId)?.label}
                    </div>
                    <div>
                      <span className="font-medium">Score:</span> {selectedModification.score}/100
                    </div>
                    {selectedModification.tasks && (
                      <div>
                        <span className="font-medium">Tasks:</span>
                        <ul className="ml-4 mt-1">
                          {selectedModification.tasks.map((t: any) => (
                            <li key={t.id}>• {t.text}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                
                {selectedEvaluation && node.type === 'planner' && (
                  <div className="text-sm space-y-2">
                    <div className="max-h-48 overflow-y-auto">
                      <div className="font-medium mb-1">Overall Assessment:</div>
                      <div className="text-gray-600 whitespace-pre-wrap">
                        {selectedEvaluation.overallAssessment}
                      </div>
                    </div>
                    
                    {selectedEvaluation.nodeEvaluations && (
                      <div>
                        <div className="font-medium mb-1">Node Evaluations:</div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {selectedEvaluation.nodeEvaluations.map((ne: any) => (
                            <div key={ne.nodeId} className="border rounded p-2">
                              <div className="font-medium">{ne.nodeLabel}</div>
                              <div className="text-xs text-gray-600">
                                Priority: {ne.priority} | Status: {ne.status}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t flex gap-2">
          <button onClick={handleSave} className="flex-1 bg-blue-500 text-white rounded px-4 py-2">
            Save
          </button>
          <button onClick={onClose} className="flex-1 bg-gray-300 rounded px-4 py-2">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};