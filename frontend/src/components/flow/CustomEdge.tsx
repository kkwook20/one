// frontend/src/components/flow/CustomEdge.tsx
import React, { useState, useEffect, useRef } from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';
import { Trash2 } from 'lucide-react';

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
  data,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isTrashHovered, setIsTrashHovered] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  });

  useEffect(() => {
    if (isHovered || isTrashHovered) {
      // hover 상태면 타임아웃 취소하고 휴지통 표시
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setShowTrash(true);
    } else {
      // hover가 끝나면 300ms 후에 휴지통 숨기기
      hideTimeoutRef.current = setTimeout(() => {
        setShowTrash(false);
      }, 300);
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isHovered, isTrashHovered]);

  const handleDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (data?.onDelete) {
      data.onDelete(id);
    }
  };

  // edge 색상 결정
  const edgeColor = isHovered || isTrashHovered ? '#ff6f5c' : (style.stroke || '#94a3b8');
  const trashColor = isTrashHovered ? '#ff6f5c' : '#94a3b8';

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: edgeColor,
          strokeWidth: isHovered || isTrashHovered ? 3 : 2,
          transition: 'all 0.2s ease',
        }}
      />
      {/* 투명한 hover 영역 (클릭 영역 확대) */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={30} // 더 넓은 hover 영역
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer' }}
      />
      <EdgeLabelRenderer>
        {showTrash && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 1000,
              padding: '20px', // 휴지통 주변에 더 넓은 영역
            }}
            className="nodrag nopan"
            onMouseEnter={() => setIsTrashHovered(true)}
            onMouseLeave={() => setIsTrashHovered(false)}
          >
            <button
              className="bg-white border border-gray-200 rounded-full p-1.5 shadow-md hover:shadow-lg transition-all duration-200"
              onClick={handleDelete}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trash2 
                size={14} 
                color={trashColor}
                style={{ transition: 'color 0.2s ease' }}
              />
            </button>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};