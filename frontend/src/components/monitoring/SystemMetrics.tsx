// frontend/src/components/monitoring/SystemMetrics.tsx

import React, { useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { Cpu, Memory, HardDrive, Wifi } from 'lucide-react';
import useMonitoringStore from '../../stores/monitoringStore';

const SystemMetrics: React.FC = () => {
  const { systemMetrics, systemHistory } = useMonitoringStore();
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)'
        }
      },
      y: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)'
        },
        min: 0,
        max: 100
      }
    }
  };

  const createChartData = (history: any[], label: string, color: string) => ({
    labels: history.map(h => new Date(h.timestamp).toLocaleTimeString()),
    datasets: [{
      label,
      data: history.map(h => h.value),
      borderColor: color,
      backgroundColor: `${color}20`,
      fill: true,
      tension: 0.4
    }]
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Current Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Cpu className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold">CPU Usage</h3>
                <p className="text-sm text-gray-400">
                  {systemMetrics?.cpu?.count || 0} cores
                </p>
              </div>
            </div>
          </div>
          <div className="text-3xl font-bold text-blue-400">
            {systemMetrics?.cpu?.percent?.toFixed(1) || 0}%
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <Memory className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold">Memory</h3>
                <p className="text-sm text-gray-400">
                  {formatBytes(systemMetrics?.memory?.available || 0)} free
                </p>
              </div>
            </div>
          </div>
          <div className="text-3xl font-bold text-green-400">
            {systemMetrics?.memory?.percent?.toFixed(1) || 0}%
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-yellow-500/10 rounded-lg">
                <HardDrive className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <h3 className="font-semibold">Disk</h3>
                <p className="text-sm text-gray-400">
                  {formatBytes(systemMetrics?.disk?.free || 0)} free
                </p>
              </div>
            </div>
          </div>
          <div className="text-3xl font-bold text-yellow-400">
            {systemMetrics?.disk?.percent?.toFixed(1) || 0}%
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <Wifi className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold">Network</h3>
                <p className="text-sm text-gray-400">I/O</p>
              </div>
            </div>
          </div>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">↑</span>
              <span className="text-purple-400">
                {formatBytes(systemMetrics?.network?.bytesSent || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">↓</span>
              <span className="text-purple-400">
                {formatBytes(systemMetrics?.network?.bytesRecv || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">CPU History</h3>
          <div className="h-64">
            <Line
              data={createChartData(systemHistory.cpu || [], 'CPU %', '#3B82F6')}
              options={chartOptions}
            />
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Memory History</h3>
          <div className="h-64">
            <Line
              data={createChartData(systemHistory.memory || [], 'Memory %', '#10B981')}
              options={chartOptions}
            />
          </div>
        </div>
      </div>

      {/* Per-Core CPU Usage */}
      {systemMetrics?.cpu?.perCore && (
        <div className="bg-gray-900 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Per-Core CPU Usage</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {systemMetrics.cpu.perCore.map((usage, idx) => (
              <div key={idx} className="bg-gray-800 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">Core {idx}</div>
                <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-blue-500 transition-all"
                    style={{ width: `${usage}%` }}
                  />
                </div>
                <div className="text-sm text-blue-400 mt-1">{usage.toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemMetrics;