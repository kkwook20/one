// frontend/src/stores/monitoringStore.ts

import { create } from 'zustand';
import { api, WorkflowWebSocket } from '../utils/api';

interface MonitoringState {
  // System Metrics
  systemMetrics: any;
  systemHistory: {
    cpu: any[];
    memory: any[];
    disk: any[];
    network: any[];
  };
  
  // Workflow Metrics
  workflowStats: any;
  nodeStats: any[];
  
  // Error Tracking
  errorSummary: any;
  errorPatterns: any[];
  recentErrors: any[];
  
  // Performance
  performanceStats: any;
  bottlenecks: any;
  suggestions: any[];
  
  // Connection
  isConnected: boolean;
  ws: WorkflowWebSocket | null;
  
  // Actions
  connectMonitoring: () => void;
  disconnectMonitoring: () => void;
  fetchDashboardData: () => Promise<void>;
  fetchErrorDetails: (errorId: string) => Promise<any>;
  fetchPerformanceStats: (category: string) => Promise<void>;
}

const useMonitoringStore = create<MonitoringState>((set, get) => ({
  // Initial state
  systemMetrics: null,
  systemHistory: {
    cpu: [],
    memory: [],
    disk: [],
    network: []
  },
  workflowStats: null,
  nodeStats: [],
  errorSummary: null,
  errorPatterns: [],
  recentErrors: [],
  performanceStats: null,
  bottlenecks: null,
  suggestions: [],
  isConnected: false,
  ws: null,
  
  // Connect to monitoring stream
  connectMonitoring: () => {
    const ws = new WorkflowWebSocket(`${import.meta.env.VITE_WS_URL || 'ws://localhost:8000'}/api/monitoring/stream`);
    
    ws.on('system_metrics', (data) => {
      const { systemHistory } = get();
      
      set({
        systemMetrics: data.data,
        systemHistory: {
          cpu: [...systemHistory.cpu, { timestamp: data.data.timestamp, value: data.data.cpu.percent }].slice(-60),
          memory: [...systemHistory.memory, { timestamp: data.data.timestamp, value: data.data.memory.percent }].slice(-60),
          disk: [...systemHistory.disk, { timestamp: data.data.timestamp, value: data.data.disk.percent }].slice(-60),
          network: [...systemHistory.network, { timestamp: data.data.timestamp, value: data.data.network }].slice(-60)
        }
      });
    });
    
    ws.on('workflow_metrics', (data) => {
      set({ workflowStats: data.data });
    });
    
    ws.on('error_alert', (data) => {
      const { recentErrors } = get();
      set({
        recentErrors: [data, ...recentErrors].slice(0, 100)
      });
    });
    
    ws.onConnect(() => {
      set({ isConnected: true });
      get().fetchDashboardData();
    });
    
    ws.onDisconnect(() => {
      set({ isConnected: false });
    });
    
    ws.connect();
    set({ ws });
  },
  
  disconnectMonitoring: () => {
    const { ws } = get();
    if (ws) {
      ws.disconnect();
      set({ ws: null, isConnected: false });
    }
  },
  
  fetchDashboardData: async () => {
    try {
      const response = await api.get('/api/monitoring/dashboard');
      const data = response.data;
      
      set({
        systemMetrics: data.system.current,
        workflowStats: data.workflows,
        nodeStats: data.nodes
      });
      
      // Fetch additional data
      const [errorSummary, bottlenecks] = await Promise.all([
        api.get('/api/monitoring/errors/summary?time_window=3600'),
        api.get('/api/monitoring/performance/bottlenecks')
      ]);
      
      set({
        errorSummary: errorSummary.data,
        bottlenecks: bottlenecks.data.bottlenecks,
        suggestions: bottlenecks.data.suggestions
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  },
  
  fetchErrorDetails: async (errorId: string) => {
    try {
      const response = await api.get(`/api/monitoring/errors/${errorId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch error details:', error);
      return null;
    }
  },
  
  fetchPerformanceStats: async (category: string) => {
    try {
      const response = await api.get('/api/monitoring/performance/stats', {
        params: { category, time_window: 3600 }
      });
      set({ performanceStats: response.data });
    } catch (error) {
      console.error('Failed to fetch performance stats:', error);
    }
  }
}));

export default useMonitoringStore;