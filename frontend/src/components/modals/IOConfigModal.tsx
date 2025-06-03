// frontend/src/components/modals/IOConfigModal.tsx
import React, { useState, useEffect } from 'react';
import { Node, Section } from '../../types';
import { apiClient } from '../../api/client';

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
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<{ [key: string]: string[] }>({});
  const [textContent, setTextContent] = useState<string>('');

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

  const handleSave = async () => {
    if (node.type === 'input') {
      if (section.group === 'preproduction' && section.name === 'Script') {
        // 텍스트 입력 저장
        const updatedNode = {
          ...node,
          output: { text: textContent, type: 'script' }
        };
        
        // 노드 업데이트를 섹션에 반영
        const updatedSection = {
          ...section,
          nodes: section.nodes.map(n => n.id === node.id ? updatedNode : n)
        };
        await apiClient.updateSection(section.id, updatedSection);
        
        onSave(updatedNode);
      } else {
        // 기존 방식
        const updatedSection = {
          ...section,
          inputConfig: {
            sources: selectedSources,
            selectedItems: Object.values(selectedItems).flat()
          }
        };
        await apiClient.updateSection(section.id, updatedSection);
        onSave(node);
      }
    } else {
      onSave(node);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl h-4/5 flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">
            {node.type === 'input' && section.group === 'preproduction' && section.name === 'Script' 
              ? 'Script Input' 
              : `${node.type.toUpperCase()} Configuration`}
          </h2>
          <button onClick={onClose} className="text-2xl">&times;</button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {node.type === 'input' ? (
            section.group === 'preproduction' && section.name === 'Script' ? (
              // Preproduction Script용 텍스트 입력
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
            ) : (
              // 다른 섹션용 기존 소스 선택 방식
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
            )
          ) : (
            // Output 노드 설정
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">Output Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Format</label>
                    <select
                      value={section.outputConfig?.format || 'json'}
                      onChange={(e) => {
                        const updatedSection = {
                          ...section,
                          outputConfig: {
                            ...section.outputConfig,
                            format: e.target.value,
                            autoSave: section.outputConfig?.autoSave ?? true
                          }
                        };
                        apiClient.updateSection(section.id, updatedSection);
                      }}
                      className="w-full border rounded p-2"
                    >
                      <option value="json">JSON</option>
                      <option value="yaml">YAML</option>
                      <option value="xml">XML</option>
                    </select>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Connected Outputs</h4>
                    <div className="bg-gray-100 rounded p-3 space-y-2 max-h-64 overflow-y-auto">
                      {node.connectedFrom ? (
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
          )}
        </div>

        <div className="p-4 border-t flex gap-2">
          <button onClick={handleSave} className="flex-1 bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600">
            Save
          </button>
          <button onClick={onClose} className="flex-1 bg-gray-300 rounded px-4 py-2 hover:bg-gray-400">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};