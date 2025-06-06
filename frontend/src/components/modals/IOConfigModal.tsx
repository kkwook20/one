// frontend/src/components/modals/IOConfigModal.tsx - 정리된 버전
import React, { useState, useEffect } from 'react';
import { FileText, Pencil } from 'lucide-react';
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

  const renderInputConfig = () => {
    if (section.group === 'preproduction' && section.name === 'Script') {
      // Script 섹션 전용 UI
      return (
        <div className="space-y-4">
          <h3 className="font-semibold mb-3">Enter Script Content</h3>
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">
              This is the starting point of your production pipeline. Enter your script, story outline, or initial concept here.
            </div>
          </div>
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            onKeyDown={(e) => {
              // Prevent modal from closing on Enter
              if (e.key === 'Enter') {
                e.stopPropagation();
              }
            }}
            className="w-full h-96 p-4 border-2 border-gray-300 rounded-lg font-mono text-sm focus:border-blue-500 focus:outline-none"
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
          <div className="flex justify-between items-center text-sm text-gray-600">
            <span>Characters: {textContent.length}</span>
            <span>Lines: {textContent.split('\n').length}</span>
          </div>
        </div>
      );
    }

    // 다른 섹션용 소스 선택 UI
    return (
      <div className="space-y-6">
        <div>
          <h3 className="font-semibold mb-3">Select Source Sections</h3>
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
      </div>
    );
  };

  const renderOutputConfig = () => {
    return (
      <div className="space-y-6">
        <div>
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
              <div className="bg-gray-100 rounded p-3 space-y-2 max-h-64 overflow-y-auto">
                {node.connectedFrom && node.connectedFrom.length > 0 ? (
                  section.nodes
                    .filter(n => node.connectedFrom?.includes(n.id))
                    .map(n => (
                      <div key={n.id} className="flex justify-between items-center bg-white p-2 rounded">
                        <span className="font-medium">{n.label}</span>
                        <span className="text-sm text-gray-600">{n.type}</span>
                      </div>
                    ))
                ) : (
                  <div className="text-gray-500 text-sm">No connected nodes</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg w-[90%] max-w-4xl h-[90%] flex flex-col">
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
    </>
  );
};