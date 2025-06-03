// Related files:
// - frontend/src/App.tsx
// - frontend/src/types/index.ts
// Location: frontend/src/hooks/useKeyboardShortcuts.ts

import { useEffect } from 'react';
import { Node, Section } from '../types';

interface UseKeyboardShortcutsProps {
  selectedNodeId: string | null;
  getCurrentSection: () => Section | undefined;
  onNodeEdit: (node: Node) => void;
  onNodeDelete: (nodeId: string) => void;
  onNodeDeactivate: (nodeId: string) => void;
}

export const useKeyboardShortcuts = ({
  selectedNodeId,
  getCurrentSection,
  onNodeEdit,
  onNodeDelete,
  onNodeDeactivate
}: UseKeyboardShortcutsProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedNodeId) return;
      
      const currentSection = getCurrentSection();
      const selectedNode = currentSection?.nodes.find(n => n.id === selectedNodeId);
      if (!selectedNode) return;

      switch (e.key) {
        case 'Enter':
          if (!e.target || (e.target as HTMLElement).tagName !== 'INPUT') {
            e.preventDefault();
            onNodeEdit(selectedNode);
          }
          break;
        case 'd':
        case 'D':
          if (!e.target || (e.target as HTMLElement).tagName !== 'INPUT') {
            e.preventDefault();
            onNodeDeactivate(selectedNodeId);
          }
          break;
        case 'Delete':
          if (!e.target || (e.target as HTMLElement).tagName !== 'INPUT') {
            e.preventDefault();
            onNodeDelete(selectedNodeId);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, getCurrentSection, onNodeEdit, onNodeDelete, onNodeDeactivate]);
};