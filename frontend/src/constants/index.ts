// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/*.tsx
// - frontend/src/types/index.ts
// Location: frontend/src/constants/index.ts

export const API_URL = 'http://localhost:8000';
export const WS_URL = 'ws://localhost:8000';

export const GROUPS = {
  preproduction: ['Script', 'Storyboard', 'Planning'],
  postproduction: ['Modeling', 'Rigging', 'Texture', 'Animation', 'VFX', 'Lighting & Rendering', 'Sound Design', 'Compositing'],
  director: ['Direction', 'Review']
};

export const NODE_TYPES = [
  { type: 'worker', label: 'Worker', icon: '⚙️' },
  { type: 'supervisor', label: 'Supervisor', icon: '👁️' },
  { type: 'planner', label: 'Planner', icon: '📋' },
  { type: 'input', label: 'Input', icon: '➡️' },
  { type: 'output', label: 'Output', icon: '⬅️' }
];