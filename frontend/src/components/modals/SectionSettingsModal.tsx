// Related files:
// - frontend/src/App.tsx
// - frontend/src/types/index.ts
// - frontend/src/api/client.ts
// - frontend/src/components/modals/index.ts
// Location: frontend/src/components/modals/SectionSettingsModal.tsx

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

  const handleSave = async () => {
    await apiClient.updateSection(section.id, editedSection);
    onSave(editedSection);
    onClose();
  };

  const exportOutput = async () => {
    try {
      const response = await apiClient.exportOutput(section.id);
      const format = editedSection.outputConfig?.format || 'json';
      
      // Create download
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${section.name}-output.${format}`;
      a.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl p-6">
        <h2 className="text-xl font-bold mb-4">Section Settings - {section.name}</h2>
        
        <div className="space-y-6">
          {/* Input Configuration */}
          <div>
            <h3 className="font-semibold mb-2">Input Configuration</h3>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Source Sections</label>
              {allSections
                .filter(s => s.id !== section.id)
                .map(s => (
                  <label key={s.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editedSection.inputConfig?.sources.includes(s.id) || false}
                      onChange={(e) => {
                        const sources = e.target.checked
                          ? [...(editedSection.inputConfig?.sources || []), s.id]
                          : editedSection.inputConfig?.sources.filter(id => id !== s.id) || [];
                        setEditedSection({
                          ...editedSection,
                          inputConfig: { ...editedSection.inputConfig, sources, selectedItems: [] }
                        });
                      }}
                    />
                    {s.name} ({s.group})
                  </label>
                ))}
            </div>
          </div>

          {/* Output Configuration */}
          <div>
            <h3 className="font-semibold mb-2">Output Configuration</h3>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Format</label>
              <select
                value={editedSection.outputConfig?.format || 'json'}
                onChange={(e) => setEditedSection({
                  ...editedSection,
                  outputConfig: { ...editedSection.outputConfig, format: e.target.value, autoSave: true }
                })}
                className="w-full border rounded p-2"
              >
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
                <option value="xml">XML</option>
              </select>
              
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={editedSection.outputConfig?.autoSave ?? true}
                  onChange={(e) => setEditedSection({
                    ...editedSection,
                    outputConfig: { ...editedSection.outputConfig, autoSave: e.target.checked, format: 'json' }
                  })}
                />
                Auto-save outputs
              </label>
              
              <button
                onClick={exportOutput}
                className="mt-3 bg-green-500 text-white rounded px-4 py-2"
              >
                Export Output
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
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