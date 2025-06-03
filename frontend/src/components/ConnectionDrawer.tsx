// Related files:
// - frontend/src/App.tsx
// - frontend/src/types/index.ts
// Location: frontend/src/components/ConnectionDrawer.tsx

import React from 'react';
import { Node, Position } from '../types';

interface ConnectionDrawerProps {
  startNode: Node;
  endPosition: Position;
  onConnect: (toNodeId: string) => void;
  onCancel: () => void;
  nodes: Node[];
}

export const ConnectionDrawer: React.FC<ConnectionDrawerProps> = ({ 
  startNode, 
  endPosition, 
  onConnect, 
  onCancel, 
  nodes 
}) => {
  const handleNodeClick = (nodeId: string) => {
    if (nodeId !== startNode.id) {
      onConnect(nodeId);
    }
  };

  return (
    <>
      <svg className="absolute inset-0 pointer-events-none z-40">
        <line
          x1={startNode.position.x + 128}
          y1={startNode.position.y + 40}
          x2={endPosition.x}
          y2={endPosition.y}
          stroke="#3b82f6"
          strokeWidth="2"
          strokeDasharray="5,5"
        />
      </svg>
      <div 
        className="absolute inset-0 z-30" 
        onClick={onCancel}
        onContextMenu={(e) => {
          e.preventDefault();
          onCancel();
        }}
      >
        {nodes.map(node => (
          <div
            key={node.id}
            className="absolute"
            style={{
              left: node.position.x - 5,
              top: node.position.y - 5,
              width: node.type === 'input' || node.type === 'output' ? 142 : 274,
              height: 100,
              cursor: 'crosshair'
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleNodeClick(node.id);
            }}
          />
        ))}
      </div>
    </>
  );
};