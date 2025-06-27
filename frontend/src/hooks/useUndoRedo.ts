// frontend/src/hooks/useUndoRedo.ts
import { useState, useCallback, useRef } from 'react';
import { Node as FlowNode, Edge } from 'reactflow';
import { Section } from '../types';

interface HistoryState {
  nodes: FlowNode[];
  edges: Edge[];
  sections: Section[];
  timestamp: number;
  sectionId: string;
}

interface UndoRedoOptions {
  maxHistorySize?: number;
}

export const useUndoRedo = (options: UndoRedoOptions = {}) => {
  const { maxHistorySize = 20 } = options;
  
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const isInternalUpdate = useRef(false);

  // 현재 상태를 히스토리에 추가
  const addToHistory = useCallback((
    nodes: FlowNode[], 
    edges: Edge[], 
    sections: Section[], 
    sectionId: string
  ) => {
    if (isInternalUpdate.current || !sectionId || nodes.length === 0) {
      return;
    }

    setHistory(prev => {
      // 현재 인덱스 이후의 히스토리는 제거
      const newHistory = prev.slice(0, currentIndex + 1);
      
      // 새 상태 추가 (deep copy)
      const newState: HistoryState = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        sections: JSON.parse(JSON.stringify(sections)),
        timestamp: Date.now(),
        sectionId
      };
      
      newHistory.push(newState);
      
      // 최대 크기 제한
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
      }
      
      return newHistory;
    });
    
    setCurrentIndex(prev => Math.min(prev + 1, maxHistorySize - 1));
  }, [currentIndex, maxHistorySize]);

  // Undo 실행
  const undo = useCallback(() => {
    if (currentIndex <= 0 || history.length === 0) {
      return null;
    }
    
    const newIndex = currentIndex - 1;
    const previousState = history[newIndex];
    
    if (previousState) {
      setCurrentIndex(newIndex);
      isInternalUpdate.current = true;
      return previousState;
    }
    
    return null;
  }, [currentIndex, history]);

  // 히스토리 초기화
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  // isInternalUpdate 리셋
  const resetInternalUpdate = useCallback(() => {
    isInternalUpdate.current = false;
  }, []);

  return {
    addToHistory,
    undo,
    clearHistory,
    isInternalUpdate,
    resetInternalUpdate
  };
};