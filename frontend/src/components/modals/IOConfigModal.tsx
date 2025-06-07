// frontend/src/components/modals/IOConfigModal.tsx - 연결된 노드 아이콘 추가
import React, { useState, useEffect } from 'react';
import { FileText, Pencil, FileInput, FileOutput } from 'lucide-react';
import { Node, Section } from '../../types';

interface IOConfigModalProps {
  node: Node;
  section: Section;
  allSections: Section[];
  onClose: () => void;
  onSave: (node: Node) => void;
}

export const IOConfigModal: React.FC<IOConfigModalProps> = ({ 
  node, 
  section, 
  allSections, 
  onClose, 
  onSave 
}) => {
  const [editedNode, setEditedNode] = useState(node);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ [key: string]: string[] }>({});
  const [textContent, setTextContent] = useState<string>('');
  const [showJsonViewer, setShowJsonViewer] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(editedNode.label);

  useEffect(() => {
    if (node.type === 'input') {
      // Preproduction의 Script 섹션만 텍스트 입력 모드
      if (section.group === 'preproduction' && section.name === 'Script') {
        setTextContent(node.output?.text || '');
      } else if (section.inputConfig) {
        setSelectedSources(section.inputConfig.sources);
      }
    }
  }, [node, section]);

  const handleSave = () => {
    if (node.type === 'input') {
      if (section.group === 'preproduction' && section.name === 'Script') {
        // 텍스트 입력 저장
        const updatedNode = {
          ...editedNode,
          output: { text: textContent, type: 'script' }
        };
        
        onSave(updatedNode);
      } else {
        // 다른 input 노드들 - 섹션 설정 업데이트는 부모 컴포넌트에서 처리
        onSave(editedNode);
      }
    } else {
      // Output 노드는 설정만 저장
      onSave(editedNode);
    }
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

  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case 'input':
        return <FileInput className="w-5 h-5" />;
      case 'output':
        return <FileOutput className="w-5 h-5" />;
      case 'worker':
        return <span className="text-xl">👷</span>;
      case 'supervisor':
        return <span className="text-xl">👔</span>;
      case 'planner':
        return <span className="text-xl">📋</span>;
      default:
        return null;
    }
  };

  // 연결된 노드들 가져오기
  const connectedFromNodes = (node.connectedFrom?.map(id => section.nodes.find(n => n.id === id)) || [])
    .filter((n): n is Node => n !== undefined);
  const connectedToNodes = (node.connectedTo?.map(id => section.nodes.find(n => n.id === id)) || [])
    .filter((n): n is Node => n !== undefined);

  const handleNodeClick = (clickedNode: Node) => {
    // 현재 모달을 저장하고 닫기
    onSave(editedNode);
    onClose();
    
    // 새로운 노드 편집창 열기를 위해 이벤트 발송
    setTimeout(() => {
      const event = new CustomEvent('openNodeEdit', { detail: clickedNode });
      window.dispatchEvent(event);
    }, 100);
  };

  const renderInputConfig = () => {
    if (section.group === 'preproduction' && section.name === 'Script') {
      // Script 섹션 전용 UI
      return (
        <>
          <h3 className="font-semibold mb-3">Enter Script Content</h3>
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">
              This is the starting point of your production pipeline. Enter your script, story outline, or initial concept here.
            </div>
          </div>
          <div className="mb-4" style={{ height: 'calc(100% - 140px)' }}>
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              onKeyDown={(e) => {
                // Prevent modal from closing on Enter
                if (e.key === 'Enter') {
                  e.stopPropagation();
                }
              }}
              className="w-full h-full p-4 border-2 border-gray-300 rounded-lg font-mono text-sm focus:border-blue-500 focus:outline-none resize-none"
              placeholder={`Enter your script content here...

Example:
Title: My Animation Project

Scene 1:
Location: Forest clearing at dawn
Characters: Main character wakes up
Action: ...

Scene 2:
...`}
            />
          </div>
          <div className="flex justify-between items-center text-sm text-gray-600">
            <span>Characters: {textContent.length}</span>
            <span>Lines: {textContent.split('\n').length}</span>
          </div>
        </>
      );
    }

    // 다른 섹션용 소스 선택 UI
    return (
      <>
        <h3 className="font-semibold mb-3">Select Source Sections</h3>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <div className="space-y-2">
            {allSections
              .filter(s => s.id !== section.id)
              .map(s => (
                <div key={s.id} className="border rounded p-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedSources.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSources([...selectedSources, s.id]);
                        } else {
                          setSelectedSources(selectedSources.filter(id => id !== s.id));
                          const newItems = { ...selectedItems };
                          delete newItems[s.id];
                          setSelectedItems(newItems);
                        }
                      }}
                    />
                    <span className="font-medium">{s.name} ({s.group})</span>
                  </label>
                  
                  {selectedSources.includes(s.id) && (
                    <div className="mt-3 ml-6 space-y-1">
                      <div className="text-sm text-gray-600 mb-2">Select specific outputs:</div>
                      {s.nodes
                        .filter(n => n.output && n.type !== 'input')
                        .map(n => (
                          <label key={n.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedItems[s.id]?.includes(n.id) || false}
                              onChange={(e) => {
                                const sectionItems = selectedItems[s.id] || [];
                                if (e.target.checked) {
                                  setSelectedItems({
                                    ...selectedItems,
                                    [s.id]: [...sectionItems, n.id]
                                  });
                                } else {
                                  setSelectedItems({
                                    ...selectedItems,
                                    [s.id]: sectionItems.filter(id => id !== n.id)
                                  });
                                }
                              }}
                            />
                            {n.label} ({n.type})
                          </label>
                        ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </>
    );
  };

  const renderOutputConfig = () => {
    return (
      <>
        <h3 className="font-semibold mb-3">Output Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Format</label>
            <select
              value={section.outputConfig?.format || 'json'}
              className="w-full border rounded p-2"
              disabled
            >
              <option value="json">JSON</option>
              <option value="yaml">YAML</option>
              <option value="xml">XML</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Output format can be changed in Section Settings
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Connected Outputs</h4>
            <div className="bg-gray-100 rounded p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
              {node.connectedFrom && node.connectedFrom.length > 0 ? (
                <div className="space-y-2">
                  {section.nodes
                    .filter(n => node.connectedFrom?.includes(n.id))
                    .map(n => (
                      <div key={n.id} className="bg-white p-3 rounded border">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium">{n.label}</span>
                          <span className="text-sm text-gray-600">{n.type}</span>
                        </div>
                        {n.output && (
                          <div className="mt-2">
                            <div className="text-xs text-gray-600 mb-1">Output:</div>
                            <div className="bg-gray-50 p-2 rounded max-h-40 overflow-y-auto">
                              <pre className="text-xs overflow-x-auto">
                                {typeof n.output === 'string' 
                                  ? n.output 
                                  : JSON.stringify(n.output, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">No connected nodes</div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg w-[90vw] h-[90vh] flex flex-col">
          <div className="p-4 border-b flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{node.type === 'input' ? '➡️' : '⬅️'}</span>
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
                  <span>{node.type === 'input' ? 'Input' : 'Output'} Configuration - </span>
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
            {/* Left Side - Connected From Nodes */}
            <div className="w-16 border-r bg-gray-50 p-2 flex flex-col gap-2 items-center overflow-y-auto">
              <div className="text-xs text-gray-500 mb-2 -rotate-90 whitespace-nowrap mt-8">From</div>
              {connectedFromNodes.map((connNode) => (
                <div
                  key={connNode.id}
                  className="group cursor-pointer"
                  onClick={() => handleNodeClick(connNode)}
                  title={connNode.label}
                >
                  <div className="w-12 h-12 rounded-lg bg-white border-2 border-gray-300 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:border-blue-500 group-hover:shadow-lg">
                    {getNodeIcon(connNode.type)}
                  </div>
                  <div className="text-xs text-center mt-1 truncate w-12 opacity-0 group-hover:opacity-100 transition-opacity">
                    {connNode.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
              <div className="flex-1 p-6 overflow-y-auto">
                {node.type === 'input' ? (
                  renderInputConfig()
                ) : (
                  renderOutputConfig()
                )}
              </div>

              <div className="p-4 border-t flex gap-2">
                <button 
                  onClick={handleSave} 
                  className="flex-1 bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600"
                >
                  Save
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
                  className="flex-1 bg-gray-300 rounded px-4 py-2 hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Right Side - Connected To Nodes */}
            <div className="w-16 border-l bg-gray-50 p-2 flex flex-col gap-2 items-center overflow-y-auto">
              <div className="text-xs text-gray-500 mb-2 rotate-90 whitespace-nowrap mt-8">To</div>
              {connectedToNodes.map((connNode) => (
                <div
                  key={connNode.id}
                  className="group cursor-pointer"
                  onClick={() => handleNodeClick(connNode)}
                  title={connNode.label}
                >
                  <div className="w-12 h-12 rounded-lg bg-white border-2 border-gray-300 flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:border-green-500 group-hover:shadow-lg">
                    {getNodeIcon(connNode.type)}
                  </div>
                  <div className="text-xs text-center mt-1 truncate w-12 opacity-0 group-hover:opacity-100 transition-opacity">
                    {connNode.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* JSON Viewer Modal */}
      {showJsonViewer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg w-[60%] max-w-3xl h-[90vh] flex flex-col">
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
    </>
  );
};