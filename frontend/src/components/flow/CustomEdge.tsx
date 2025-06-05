// frontend/src/components/flow/CustomEdge.tsx
import React from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from 'reactflow';
import { X } from 'lucide-react';

interface CustomEdgeData {
  onDelete?: (edgeId: string) => void;
  isActive?: boolean;
}

export const CustomEdge: React.FC<EdgeProps<CustomEdgeData>> = ({
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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // React의 SyntheticEvent에서 native event의 stopImmediatePropagation 접근
    if (e.nativeEvent.stopImmediatePropagation) {
      e.nativeEvent.stopImmediatePropagation();
    }
    
    console.log('CustomEdge: Delete button clicked for edge:', id);
    console.log('CustomEdge: data object:', data);
    console.log('CustomEdge: onDelete function exists?', !!data?.onDelete);
    
    if (data?.onDelete) {
      console.log('CustomEdge: Calling onDelete handler with id:', id);
      try {
        data.onDelete(id);
        console.log('CustomEdge: onDelete handler called successfully');
      } catch (error) {
        console.error('CustomEdge: Error calling onDelete:', error);
      }
    } else {
      console.error('CustomEdge: No onDelete handler provided for edge:', id);
    }
  };

  return (
    <>
      {/* 활성화된 경우 애니메이션 효과를 위한 배경 path */}
      {data?.isActive && (
        <path
          style={{
            ...style,
            stroke: '#10b981',
            strokeWidth: 6,
            opacity: 0.3,
            filter: 'blur(4px)',
          }}
          className="react-flow__edge-path animate-pulse"
          d={edgePath}
          markerEnd={markerEnd}
        />
      )}
      
      <path
        id={id}
        style={style}
        className={`react-flow__edge-path ${data?.isActive ? 'animate-pulse' : ''}`}
        d={edgePath}
        markerEnd={markerEnd}
      />
      
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="edge-label-container"
        >
          <button
            onClick={handleDelete}
            onMouseDown={(e) => {
              // 드래그 방지
              e.stopPropagation();
            }}
            className="group relative flex items-center justify-center w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full transition-all duration-200 hover:scale-110 shadow-md hover:shadow-lg"
            style={{
              cursor: 'pointer',
              zIndex: 1000,
            }}
            type="button"
            aria-label="Delete connection"
          >
            <X className="w-3 h-3" />
            <span className="absolute invisible group-hover:visible bg-gray-800 text-white text-xs rounded py-1 px-2 -top-8 whitespace-nowrap">
              Delete connection
            </span>
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

// default export도 추가 (호환성을 위해)
export default CustomEdge;