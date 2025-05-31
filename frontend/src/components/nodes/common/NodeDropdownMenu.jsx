// frontend/src/components/nodes/common/NodeDropdownMenu.jsx
import React, { useEffect, useRef } from 'react';
import { 
  Copy, Trash2, Edit, Download, Upload, 
  RotateCcw, Settings, FileText, History,
  Save, FolderOpen, Share2, Lock, Unlock
} from 'lucide-react';

const NodeDropdownMenu = ({ nodeId, nodeType, onClose, onAction }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const menuItems = [
    { id: 'rename', label: 'Rename', icon: Edit },
    { id: 'duplicate', label: 'Duplicate', icon: Copy },
    { type: 'divider' },
    { id: 'export', label: 'Export Node', icon: Download },
    { id: 'import', label: 'Import Config', icon: Upload },
    { type: 'divider' },
    { id: 'save-template', label: 'Save as Template', icon: Save },
    { id: 'load-template', label: 'Load Template', icon: FolderOpen },
    { type: 'divider' },
    { id: 'view-history', label: 'View History', icon: History },
    { id: 'view-logs', label: 'View Logs', icon: FileText },
    { type: 'divider' },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'reset', label: 'Reset', icon: RotateCcw },
    { type: 'divider' },
    { id: 'lock', label: 'Lock/Unlock', icon: Lock },
    { id: 'share', label: 'Share', icon: Share2 },
    { type: 'divider' },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute top-full right-0 mt-1 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1"
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, index) => {
        if (item.type === 'divider') {
          return <div key={index} className="my-1 border-t border-gray-700" />;
        }

        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onAction(item.id)}
            className={`w-full px-3 py-2 text-left flex items-center gap-2 text-sm transition-colors ${
              item.danger 
                ? 'text-red-400 hover:bg-red-500/20' 
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default NodeDropdownMenu;