// Related files:
// - frontend/src/App.tsx
// - frontend/src/types/index.ts
// Location: frontend/src/hooks/useNodeDrag.ts

import { useState, useCallback, useRef } from 'react';
import { Node, Position } from '../types';

interface UseNodeDragProps {
  onNodeUpdate: (nodeId: string, position: Position) => void;
}

export const useNodeDrag = ({ onNodeUpdate }: UseNodeDragProps) => {
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const dragOffset = useRef<Position>({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    e.stopPropagation();
    
    const element = e.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    setDraggedNodeId(node.id);

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const canvas = document.getElementById('pipeline-canvas');
      if (!canvas) return;
      
      const canvasRect = canvas.getBoundingClientRect();
      const newX = e.clientX - canvasRect.left - dragOffset.current.x;
      const newY = e.clientY - canvasRect.top - dragOffset.current.y;
      
      onNodeUpdate(node.id, {
        x: Math.max(0, Math.min(canvasRect.width - 200, newX)),
        y: Math.max(0, Math.min(canvasRect.height - 100, newY))
      });
    };

    const handleMouseUp = () => {
      setDraggedNodeId(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onNodeUpdate]);

  return {
    draggedNodeId,
    handleMouseDown
  };
};