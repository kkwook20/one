// frontend/src/components/monitoring/Dashboard.tsx

import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, CheckCircle, Clock, Cpu, HardDrive, Wifi, Memory } from 'lucide-react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import useMonitoringStore from '../../stores/monitoringStore';
import SystemMetrics from './SystemMetrics';
import WorkflowMetrics from './WorkflowMetrics';
import ErrorPanel from './ErrorPanel';
import PerformanceAnalytics from './PerformanceAnalytics';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'system' | 'workflows' | 'errors' | 'performance'>('overview');
  
  const {
    systemMetrics,
    workflowStats,
    errorSummary,
    isConnected,
    connectMonitoring,
    disconnectMonitoring
  } = useMonitoringStore();

  useEffect(() => {
    connectMonitoring();
    return () => disconnectMonitoring();
  }, []);

  const getSystemHealth = () => {
    if (!systemMetrics) return 'unknown';
    
    const cpu = systemMetrics.cpu?.percent || 0;
    const memory = systemMetrics.memory?.percent || 0;
    
    if (cpu > 90 || memory > 90) return 'critical';
    if (cpu > 70 || memory > 70) return 'warning';
    return 'healthy';
  };

  const getWorkflowHealth = () => {
    if (!workflowStats || workflowStats.workflows.length === 0) return 'unknown';
    
    const avgSuccessRate = workflowStats.workflows.reduce(
      (sum, w) => sum + w.successRate, 0
    ) / workflowStats.workflows.length;
    
    if (avgSuccessRate < 50) return 'critical';
    if (avgSuccessRate < 80) return 'warning';
    return 'healthy';
  };

  const healthColors = {
    healthy: 'text-green-500',
    warning: 'text-yellow-500',
    critical: 'text-red-500',
    unknown: 'text-gray-500'
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Activity className="w-8 h-8 text-blue-500" />
              <h1 className="text-2xl font-bold">Monitoring Dashboard</h1>
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-400' : 'bg-red-400'
                }`} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
            
            <div className="text-sm text-gray-400">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-gray-900/50 border-b border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex gap-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'system', label: 'System' },
              { id: 'workflows', label: 'Workflows' },
              { id: 'errors', label: 'Errors' },
              { id: 'performance', label: 'Performance' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Health Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-900 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">System Health</h3>
                  <Cpu className="w-5 h-5 text-gray-400" />
                </div>
                <div className={`text-3xl font-bold ${healthColors[getSystemHealth()]}`}>
                  {getSystemHealth().toUpperCase()}
                </div>
                <div className="mt-2 space-y-1 text-sm text-gray-400">
                  <div>CPU: {systemMetrics?.cpu?.percent?.toFixed(1) || 0}%</div>
                  <div>Memory: {systemMetrics?.memory?.percent?.toFixed(1) || 0}%</div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Workflow Health</h3>
                  <Activity className="w-5 h-5 text-gray-400" />
                </div>
                <div className={`text-3xl font-bold ${healthColors[getWorkflowHealth()]}`}>
                  {getWorkflowHealth().toUpperCase()}
                </div>
                <div className="mt-2 space-y-1 text-sm text-gray-400">
                  <div>Active: {workflowStats?.totalActive || 0}</div>
                  <div>Recent: {workflowStats?.recentExecutions?.length || 0}</div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Error Rate</h3>
                  <AlertTriangle className="w-5 h-5 text-gray-400" />
                </div>
                <div className="text-3xl font-bold text-red-400">
                  {errorSummary?.total || 0}
                </div>
                <div className="mt-2 space-y-1 text-sm text-gray-400">
                  <div>Critical: {errorSummary?.bySeverity?.critical || 0}</div>
                  <div>Warning: {errorSummary?.bySeverity?.warning || 0}</div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: 'Total Workflows',
                  value: workflowStats?.workflows?.length || 0,
                  icon: Activity,
                  color: 'text-blue-400'
                },
                {
                  label: 'Success Rate',
                  value: `${(workflowStats?.workflows?.reduce(
                    (sum, w) => sum + w.successRate, 0
                  ) / (workflowStats?.workflows?.length || 1)).toFixed(1)}%`,
                  icon: CheckCircle,
                  color: 'text-green-400'
                },
                {
                  label: 'Avg Duration',
                  value: `${(workflowStats?.workflows?.reduce(
                    (sum, w) => sum + w.avgDuration, 0
                  ) / (workflowStats?.workflows?.length || 1)).toFixed(1)}s`,
                  icon: Clock,
                  color: 'text-yellow-400'
                },
                {
                  label: 'Error Count',
                  value: errorSummary?.total || 0,
                  icon: AlertTriangle,
                  color: 'text-red-400'
                }
              ].map((stat, idx) => (
                <div key={idx} className="bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">{stat.label}</span>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                  <div className={`text-2xl font-bold ${stat.color}`}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-900 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
              <div className="space-y-2">
                {workflowStats?.recentExecutions?.slice(0, 5).map((execution, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        execution.status === 'success' ? 'bg-green-400' :
                        execution.status === 'running' ? 'bg-blue-400' :
                        'bg-red-400'
                      }`} />
                      <span className="text-sm">Workflow {execution.workflowId.slice(0, 8)}</span>
                    </div>
                    <div className="text-sm text-gray-400">
                      {execution.duration ? `${execution.duration.toFixed(1)}s` : 'Running...'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && <SystemMetrics />}
        {activeTab === 'workflows' && <WorkflowMetrics />}
        {activeTab === 'errors' && <ErrorPanel />}
        {activeTab === 'performance' && <PerformanceAnalytics />}
      </div>
    </div>
  );
};

export default Dashboard;