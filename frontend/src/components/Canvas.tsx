// Related files:
// - frontend/src/App.tsx
// - frontend/src/types/index.ts
// - frontend/src/components/NodeComponent.tsx
// - frontend/src/components/ConnectionDrawer.tsx
// Location: frontend/src/components/Canvas.tsx

import React, { useRef, useState, useEffect } from 'react';
import { Node, Section, Connection, Position } from '../types';
import { NodeComponent } from './NodeComponent';
import { ConnectionDrawer } from './ConnectionDrawer';
import { useNodeDrag } from '../hooks/useNodeDrag';

interface CanvasProps {
  currentSection: Section | undefined;
  connections: Connection[];
  selectedNodeId: string | null;
  nodeProgress: { [key: string]: number };
  onNodeUpdate: (node: Node) => void;
  onNodeDelete: (nodeId: string) => void;
  onNodeConnect: (fromId: string, toId: string) => void;
  onNodeSelect: (nodeId: string) => void;
  onNodeEdit: (node: Node) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  currentSection,
  connections,
  selectedNodeId,
  nodeProgress,
  onNodeUpdate,
  onNodeDelete,
  onNodeConnect,
  onNodeSelect,
  onNodeEdit
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [connectingNode, setConnectingNode] = useState<Node | null>(null);
  const [mousePosition, setMousePosition] = useState<Position>({ x: 0, y: 0 });

  // Use node drag hook
  const { isDragging, draggedNode, handleMouseDown } = useNodeDrag({
    canvasRef,
    onNodeUpdate
  });

  // Mouse position for connection drawing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (connectingNode && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    };

    if (connectingNode) {
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
    }
  }, [connectingNode]);

  const handleStartConnection = (node: Node) => {
    setConnectingNode(node);
  };

  const handleCompleteConnection = (toNodeId: string) => {
    if (connectingNode) {
      onNodeConnect(connectingNode.id, toNodeId);
      setConnectingNode(null);
    }
  };

  const handleCancelConnection = () => {
    setConnectingNode(null);
  };

  return (
    <div 
      ref={canvasRef}
      className="absolute inset-0 bg-gray-50"
      style={{ 
        backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)', 
        backgroundSize: '20px 20px' 
      }}
    >
      {/* Grid Lines for better visual alignment */}
      <svg className="absolute inset-0 pointer-events-none opacity-10">
        <defs>
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="gray" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Connections */}
      <svg className="absolute inset-0 pointer-events-none">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#94a3b8"
            />
          </marker>
        </defs>
        {connections.map((conn, index) => {
          const fromNode = currentSection?.nodes.find(n => n.id === conn.from);
          const toNode = currentSection?.nodes.find(n => n.id === conn.to);
          if (!fromNode || !toNode) return null;

          const fromX = fromNode.position.x + (fromNode.type === 'input' || fromNode.type === 'output' ? 64 : 128);
          const fromY = fromNode.position.y + 40;
          const toX = toNode.position.x;
          const toY = toNode.position.y + 40;

          // Curved connection path
          const midX = (fromX + toX) / 2;
          const path = `M ${fromX} ${fromY} Q ${midX} ${fromY} ${midX} ${toY} T ${toX} ${toY}`;

          return (
            <path
              key={index}
              d={path}
              stroke="#94a3b8"
              strokeWidth="2"
              fill="none"
              markerEnd="url(#arrowhead)"
            />
          );
        })}
      </svg>

      {/* Connection Drawing */}
      {connectingNode && (
        <ConnectionDrawer
          startNode={connectingNode}
          endPosition={mousePosition}
          onConnect={handleCompleteConnection}
          onCancel={handleCancelConnection}
          nodes={currentSection?.nodes || []}
        />
      )}

      {/* Nodes */}
      {currentSection?.nodes.map(node => (
        <div
          key={node.id}
          onMouseDown={(e) => handleMouseDown(e, node)}
          style={{ cursor: isDragging && draggedNode?.id === node.id ? 'grabbing' : 'grab' }}
        >
          <NodeComponent
            node={node}
            onUpdate={onNodeUpdate}
            onDelete={onNodeDelete}
            onConnect={onNodeConnect}
            isSelected={selectedNodeId === node.id}
            onSelect={onNodeSelect}
            onEdit={onNodeEdit}
            onStartConnection={handleStartConnection}
            progress={nodeProgress[node.id]}
          />
        </div>
      ))}
    </div>
  );
};