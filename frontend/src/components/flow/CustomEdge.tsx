// frontend/src/components/flow/CustomEdge.tsx
import React, { useState } from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';
import { X } from 'lucide-react';

export const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  animated,
  data,
}) => {
  const [showDelete, setShowDelete] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data?.onDelete) {
      data.onDelete(id);
    }
  };

  return (
    <>
      <g
        onMouseEnter={() => setShowDelete(true)}
        onMouseLeave={() => setShowDelete(false)}
      >
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            ...style,
            strokeWidth: showDelete ? 4 : 2,
            cursor: 'pointer',
          }}
        />
        {/* Invisible wider path for better hover detection */}
        <path
          d={edgePath}
          fill="none"
          strokeOpacity={0}
          strokeWidth={20}
          style={{ cursor: 'pointer' }}
        />
      </g>
      
      {animated && (
        <circle r="4" fill="#3b82f6">
          <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      
      <EdgeLabelRenderer>
        {showDelete && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              // 호버 영역을 확장하여 안정성 향상
              padding: '20px',
              margin: '-20px'
            }}
            onMouseEnter={() => setShowDelete(true)}
            onMouseLeave={() => setShowDelete(false)}
          >
            <button
              onClick={handleDelete}
              className="bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition-colors shadow-lg"
              title="Delete connection"
              style={{
                // 버튼 크기를 키워서 클릭하기 쉽게 만듦
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};