// frontend/src/components/nodes/editors/PlannerNodeEditor.jsx
import React, { useState, useEffect } from 'react';
import { 
  Target, BarChart3, TrendingUp, AlertCircle, 
  CheckCircle, Clock, Activity, RefreshCw,
  ChevronRight, Calendar, Filter
} from 'lucide-react';
import NodeHeader from '../common/NodeHeader';
import TaskItemIndicators from '../common/TaskItemIndicators';

const PlannerNodeEditor = ({ 
  nodeId,
  nodeName = "Planner Node",
  goals = [],
  evaluations = {},
  onEvaluate,
  onUpdateGoals,
  className = ""
}) => {
  const [activeTab, setActiveTab] = useState('overview'); // overview, evaluations, timeline
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [goalsText, setGoalsText] = useState(goals.join('\n'));
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [timeRange, setTimeRange] = useState('24h');
  const [filterStatus, setFilterStatus] = useState('all');

  // Mock data for demonstration
  const mockEvaluations = {
    'worker-1': {
      nodeId: 'worker-1',
      nodeName: 'Data Processor',
      nodeType: 'worker',
      score: 85,
      lastEvaluated: new Date(Date.now() - 1000 * 60 * 30),
      metrics: {
        timeEfficiency: { value: 90, trend: 'up', change: 5 },
        workload: { value: 75, trend: 'stable', change: 0 },
        difficulty: { value: 85, trend: 'down', change: -3 },
        progress: { value: 90, trend: 'up', change: 10 }
      },
      issues: [],
      recommendations: [
        'Consider parallelizing data processing',
        'Add caching for frequently accessed data'
      ]
    },
    'worker-2': {
      nodeId: 'worker-2',
      nodeName: 'API Connector',
      nodeType: 'worker',
      score: 72,
      lastEvaluated: new Date(Date.now() - 1000 * 60 * 45),
      metrics: {
        timeEfficiency: { value: 65, trend: 'down', change: -8 },
        workload: { value: 80, trend: 'up', change: 5 },
        difficulty: { value: 70, trend: 'stable', change: 0 },
        progress: { value: 75, trend: 'up', change: 15 }
      },
      issues: [
        'High API response times detected',
        'Error rate above threshold'
      ],
      recommendations: [
        'Implement retry logic with exponential backoff',
        'Add request batching to reduce API calls',
        'Consider caching API responses'
      ]
    },
    'supervisor-1': {
      nodeId: 'supervisor-1',
      nodeName: 'Code Reviewer',
      nodeType: 'supervisor',
      score: 92,
      lastEvaluated: new Date(Date.now() - 1000 * 60 * 15),
      metrics: {
        timeEfficiency: { value: 95, trend: 'up', change: 3 },
        workload: { value: 85, trend: 'stable', change: 0 },
        difficulty: { value: 90, trend: 'up', change: 5 },
        progress: { value: 95, trend: 'up', change: 8 }
      },
      issues: [],
      recommendations: []
    }
  };

  const allEvaluations = { ...mockEvaluations, ...evaluations };

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    await onEvaluate?.();
    setTimeout(() => setIsEvaluating(false), 2000);
  };

  const getMetricIcon = (metric) => {
    const icons = {
      timeEfficiency: <Clock className="w-4 h-4" />,
      workload: <Activity className="w-4 h-4" />,
      difficulty: <AlertCircle className="w-4 h-4" />,
      progress: <TrendingUp className="w-4 h-4" />
    };
    return icons[metric] || <BarChart3 className="w-4 h-4" />;
  };

  const getMetricColor = (value) => {
    if (value >= 80) return 'text-green-400';
    if (value >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreGrade = (score) => {
    if (score >= 90) return { grade: 'A', color: 'text-green-400 bg-green-500/20' };
    if (score >= 80) return { grade: 'B', color: 'text-blue-400 bg-blue-500/20' };
    if (score >= 70) return { grade: 'C', color: 'text-yellow-400 bg-yellow-500/20' };
    if (score >= 60) return { grade: 'D', color: 'text-orange-400 bg-orange-500/20' };
    return { grade: 'F', color: 'text-red-400 bg-red-500/20' };
  };

  const calculateOverallMetrics = () => {
    const evals = Object.values(allEvaluations);
    if (evals.length === 0) return null;

    const avgScore = evals.reduce((sum, e) => sum + e.score, 0) / evals.length;
    const metrics = {
      timeEfficiency: 0,
      workload: 0,
      difficulty: 0,
      progress: 0
    };

    evals.forEach(e => {
      Object.keys(metrics).forEach(key => {
        metrics[key] += e.metrics[key].value;
      });
    });

    Object.keys(metrics).forEach(key => {
      metrics[key] = Math.round(metrics[key] / evals.length);
    });

    return { avgScore: Math.round(avgScore), metrics };
  };

  const overallMetrics = calculateOverallMetrics();

  return (
    <div className={`bg-gray-800 rounded-lg shadow-lg ${className}`}>
      <NodeHeader
        nodeId={nodeId}
        nodeType="planner"
        nodeName={nodeName}
        isExecuting={isEvaluating}
        onExecute={handleEvaluate}
        onAI={() => console.log('AI Assistant')}
        onMenu={(action) => console.log('Menu action:', action)}
      />
      
      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {[
          { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'evaluations', label: 'Evaluations', icon: <CheckCircle className="w-4 h-4" /> },
          { id: 'timeline', label: 'Timeline', icon: <Calendar className="w-4 h-4" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-3 flex items-center justify-center gap-2 transition-colors ${
              activeTab === tab.id
                ? 'bg-gray-700 text-white border-b-2 border-green-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            {tab.icon}
            <span className="text-sm font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Goals Section */}
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Workflow Goals
                </h3>
                <button
                  onClick={() => onUpdateGoals?.(goalsText.split('\n').filter(g => g.trim()))}
                  className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                >
                  Update Goals
                </button>
              </div>
              <textarea
                value={goalsText}
                onChange={(e) => setGoalsText(e.target.value)}
                className="w-full h-24 bg-gray-800 text-gray-100 text-sm p-3 rounded resize-none outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Enter workflow goals (one per line)..."
              />
            </div>

            {/* Overall Metrics */}
            {overallMetrics && (
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Overall Performance</h3>
                
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${getScoreGrade(overallMetrics.avgScore).color} px-4 py-2 rounded-lg`}>
                      {getScoreGrade(overallMetrics.avgScore).grade}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Grade</p>
                  </div>
                  <div className="flex-1">
                    <div className="text-2xl font-bold text-gray-200">{overallMetrics.avgScore}%</div>
                    <p className="text-xs text-gray-400">Average Score</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(overallMetrics.metrics).map(([key, value]) => (
                    <div key={key} className="bg-gray-800 rounded p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        {getMetricIcon(key)}
                      </div>
                      <div className={`text-lg font-bold ${getMetricColor(value)}`}>
                        {value}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Node Summary */}
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Node Summary</h3>
              <div className="space-y-2">
                {Object.values(allEvaluations).map(evaluation => (
                  <button
                    key={evaluation.nodeId}
                    onClick={() => {
                      setSelectedNodeId(evaluation.nodeId);
                      setActiveTab('evaluations');
                    }}
                    className="w-full flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        evaluation.nodeType === 'worker' ? 'bg-blue-500' :
                        evaluation.nodeType === 'supervisor' ? 'bg-purple-500' :
                        'bg-gray-500'
                      }`} />
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-200">{evaluation.nodeName}</p>
                        <p className="text-xs text-gray-400">
                          {evaluation.issues.length} issues • 
                          {evaluation.recommendations.length} recommendations
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${getMetricColor(evaluation.score)}`}>
                        {evaluation.score}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Evaluations Tab */}
        {activeTab === 'evaluations' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-4">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 bg-gray-700 text-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="all">All Nodes</option>
                <option value="issues">With Issues</option>
                <option value="good">Good Performance</option>
                <option value="poor">Poor Performance</option>
              </select>
              <button className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors">
                <Filter className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Evaluation Details */}
            {Object.values(allEvaluations).map(evaluation => (
              <div
                key={evaluation.nodeId}
                className={`bg-gray-900 rounded-lg p-4 ${
                  selectedNodeId === evaluation.nodeId ? 'ring-2 ring-green-500' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-base font-medium text-gray-200">{evaluation.nodeName}</h3>
                    <p className="text-xs text-gray-400">
                      Last evaluated: {evaluation.lastEvaluated.toLocaleTimeString()}
                    </p>
                  </div>
                  <div className={`text-2xl font-bold ${getMetricColor(evaluation.score)}`}>
                    {evaluation.score}
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {Object.entries(evaluation.metrics).map(([key, data]) => (
                    <div key={key} className="bg-gray-800 rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <span className={`text-xs ${
                          data.trend === 'up' ? 'text-green-400' :
                          data.trend === 'down' ? 'text-red-400' :
                          'text-gray-400'
                        }`}>
                          {data.trend === 'up' ? '↑' : data.trend === 'down' ? '↓' : '→'}
                          {Math.abs(data.change)}%
                        </span>
                      </div>
                      <div className={`text-base font-bold ${getMetricColor(data.value)}`}>
                        {data.value}%
                      </div>
                    </div>
                  ))}
                </div>

                {/* Issues */}
                {evaluation.issues.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-red-400 mb-1">Issues</h4>
                    <ul className="space-y-1">
                      {evaluation.issues.map((issue, idx) => (
                        <li key={idx} className="text-xs text-gray-300 flex items-start gap-1">
                          <span className="text-red-400">•</span>
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {evaluation.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-blue-400 mb-1">Recommendations</h4>
                    <ul className="space-y-1">
                      {evaluation.recommendations.map((rec, idx) => (
                        <li key={idx} className="text-xs text-gray-300 flex items-start gap-1">
                          <span className="text-blue-400">→</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="space-y-4">
            {/* Time Range Selector */}
            <div className="flex items-center gap-2">
              {['1h', '6h', '24h', '7d', '30d'].map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    timeRange === range
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Timeline Chart Placeholder */}
            <div className="bg-gray-900 rounded-lg p-8 text-center">
              <BarChart3 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Timeline visualization would go here</p>
              <p className="text-xs text-gray-500 mt-1">Showing performance trends over {timeRange}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlannerNodeEditor;