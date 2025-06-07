// frontend/src/components/modals/SectionSettingsModal.tsx - 정리된 버전
import React, { useState } from 'react';
import { Section } from '../../types';
import { apiClient } from '../../api/client';

interface SectionSettingsModalProps {
  section: Section;
  allSections: Section[];
  onClose: () => void;
  onSave: (section: Section) => void;
}

export const SectionSettingsModal: React.FC<SectionSettingsModalProps> = ({ 
  section, 
  allSections, 
  onClose, 
  onSave 
}) => {
  const [editedSection, setEditedSection] = useState(section);

  const handleSave = () => {
    onSave(editedSection);
  };

  const exportOutput = async () => {
    try {
      const response = await apiClient.exportOutput(section.id);
      const format = editedSection.outputConfig?.format || 'json';
      
      // Create download
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${section.name}-output.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export feature is not yet implemented in the backend');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[98%] max-w-2xl p-6 max-h-[95%] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Section Settings - {section.name}</h2>
        
        <div className="space-y-6">
          {/* Input Configuration */}
          <div>
            <h3 className="font-semibold mb-2">Input Configuration</h3>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Source Sections</label>
              <div className="max-h-48 overflow-y-auto border rounded p-2">
                {allSections
                  .filter(s => s.id !== section.id)
                  .map(s => (
                    <label key={s.id} className="flex items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        checked={editedSection.inputConfig?.sources.includes(s.id) || false}
                        onChange={(e) => {
                          const sources = e.target.checked
                            ? [...(editedSection.inputConfig?.sources || []), s.id]
                            : editedSection.inputConfig?.sources.filter(id => id !== s.id) || [];
                          setEditedSection({
                            ...editedSection,
                            inputConfig: { 
                              sources, 
                              selectedItems: editedSection.inputConfig?.selectedItems || [] 
                            }
                          });
                        }}
                      />
                      {s.name} ({s.group})
                    </label>
                  ))}
              </div>
            </div>
          </div>

          {/* Output Configuration */}
          <div>
            <h3 className="font-semibold mb-2">Output Configuration</h3>
            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium mb-1">Format</label>
                <select
                  value={editedSection.outputConfig?.format || 'json'}
                  onChange={(e) => setEditedSection({
                    ...editedSection,
                    outputConfig: { 
                      format: e.target.value, 
                      autoSave: editedSection.outputConfig?.autoSave ?? true 
                    }
                  })}
                  className="w-full border rounded p-2"
                >
                  <option value="json">JSON</option>
                  <option value="yaml">YAML</option>
                  <option value="xml">XML</option>
                </select>
              </div>
              
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={editedSection.outputConfig?.autoSave ?? true}
                  onChange={(e) => setEditedSection({
                    ...editedSection,
                    outputConfig: { 
                      format: editedSection.outputConfig?.format || 'json',
                      autoSave: e.target.checked
                    }
                  })}
                />
                Auto-save outputs
              </label>
              
              <button
                onClick={exportOutput}
                className="mt-3 bg-green-500 text-white rounded px-4 py-2 hover:bg-green-600"
              >
                Export Output
              </button>
            </div>
          </div>
          
          {/* Section Information */}
          <div>
            <h3 className="font-semibold mb-2">Section Information</h3>
            <div className="bg-gray-100 rounded p-3 space-y-1 text-sm">
              <div><strong>ID:</strong> {section.id}</div>
              <div><strong>Group:</strong> {section.group}</div>
              <div><strong>Nodes:</strong> {section.nodes.length}</div>
              <div><strong>Connections:</strong> {section.nodes.reduce((acc, node) => 
                acc + (node.connectedTo?.length || 0), 0
              )}</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button 
            onClick={handleSave} 
            className="flex-1 bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600"
          >
            Save
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
  );
};