// Related files:
// - frontend/src/App.tsx
// - frontend/src/types/index.ts
// - frontend/src/api/client.ts
// - frontend/src/components/modals/index.ts
// Location: frontend/src/components/modals/IOConfigModal.tsx

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

  useEffect(() => {
    if (node.type === 'input' && section.inputConfig) {
      setSelectedSources(section.inputConfig.sources);
    }
  }, [node, section]);

  const handleSave = () => {
    if (node.type === 'input') {
      // Update section input config
      const updatedSection = {
        ...section,
        inputConfig: {
          sources: selectedSources,
          selectedItems: Object.values(selectedItems).flat()
        }
      };
      apiClient.updateSection(section.id, updatedSection);
    }
    onSave(node);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl h-4/5 flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">{node.type.toUpperCase()} Configuration</h2>
          <button onClick={onClose} className="text-2xl">&times;</button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          {node.type === 'input' ? (
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
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">Output Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Format</label>
                    <select
                      value={section.outputConfig?.format || 'json'}
                      onChange={(e) => {
                        // Update section output config
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
                    <div className="bg-gray-100 rounded p-3 space-y-2">
                      {section.nodes
                        .filter(n => n.output && n.type !== 'output')
                        .map(n => (
                          <div key={n.id} className="flex justify-between items-center">
                            <span>{n.label}</span>
                            <span className="text-sm text-gray-600">{n.type}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
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