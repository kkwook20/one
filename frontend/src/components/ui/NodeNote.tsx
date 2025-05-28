import React, { useState, useEffect } from 'react';
import { StickyNote, Save, X } from 'lucide-react';

interface NodeNoteProps {
  nodeId: string;
  initialContent?: string;
  onSave?: (content: string) => void;
  className?: string;
}

const NodeNote: React.FC<NodeNoteProps> = ({ 
  nodeId, 
  initialContent = '', 
  onSave,
  className = ''
}) => {
  const [content, setContent] = useState(initialContent);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleSave = () => {
    if (onSave && hasChanges) {
      onSave(content);
      setHasChanges(false);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setContent(initialContent);
    setHasChanges(false);
    setIsEditing(false);
  };

  const handleChange = (value: string) => {
    setContent(value);
    setHasChanges(value !== initialContent);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-1 mb-1">
        <StickyNote className="w-3 h-3 text-gray-400" />
        <span className="text-xs text-gray-400">Note</span>
        {hasChanges && (
          <span className="text-xs text-yellow-400">(unsaved)</span>
        )}
      </div>
      
      <div className="relative group">
        <textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsEditing(true)}
          placeholder="메모를 입력하세요..."
          className="w-full bg-gray-700 text-gray-300 text-xs p-2 rounded resize-none outline-none focus:ring-1 focus:ring-gray-500 transition-all"
          rows={isEditing ? 4 : 2}
        />
        
        {isEditing && hasChanges && (
          <div className="absolute top-1 right-1 flex gap-1">
            <button
              onClick={handleSave}
              className="p-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              title="Save"
            >
              <Save className="w-3 h-3" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              title="Cancel"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeNote;