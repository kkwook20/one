// Related files:
// - frontend/src/App.tsx
// - frontend/src/types/index.ts
// Location: frontend/src/hooks/useNodeDrag.ts

import { useState, useCallback, useEffect, RefObject } from 'react';
import { Node, Position } from '../types';

interface UseNodeDragProps {
  canvasRef: RefObject<HTMLDivElement>;
  onNodeUpdate: (node: Node) => void;
}

export const useNodeDrag = ({ canvasRef, onNodeUpdate }: UseNodeDragProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNode, setDraggedNode] = useState<Node | null>(null);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent, node: Node) => {
    if (e.button !== 0) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setIsDragging(true);
    setDraggedNode(node);
    setDragOffset({
      x: e.clientX - rect.left - node.position.x,
      y: e.clientY - rect.top - node.position.y
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggedNode || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const newPosition = {
      x: Math.max(0, Math.min(rect.width - 200, e.clientX - rect.left - dragOffset.x)),
      y: Math.max(0, Math.min(rect.height - 200, e.clientY - rect.top - dragOffset.y))
    };

    onNodeUpdate({
      ...draggedNode,
      position: newPosition
    });
  }, [isDragging, draggedNode, dragOffset, canvasRef, onNodeUpdate]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDraggedNode(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return {
    isDragging,
    draggedNode,
    handleMouseDown
  };
};