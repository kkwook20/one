// frontend/src/components/Argosa/function/dataanalysis/Analytics.tsx
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  Archive,
  Brain,
  CheckCircle2,
  Clock,
  Edit,
  Info,
  Loader2,
  Play,
  Zap,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Treemap,
} from "recharts";
import type { 
  Agent, 
  Workflow, 
  ChartDataPoint, 
  TimeSeriesData,
  PlannerLog,
  StructuredPlan,
} from "../DataAnalysis";

interface AnalyticsProps {
  agents: Agent[];
  workflows: Workflow[];
  performanceData: ChartDataPoint[];
  workflowDistribution: ChartDataPoint[];
  agentUtilization: ChartDataPoint[];
  realtimeData: TimeSeriesData[];
  COLORS: string[];
  WORKFLOW_PHASES: {
    code: Array<{ id: string; name: string; progress: number }>;
    analysis: Array<{ id: string; name: string; progress: number }>;
  };
  plannerLogs: PlannerLog[];
  activePlans: StructuredPlan[];
}

const Analytics: React.FC<AnalyticsProps> = ({
  agents,
  workflows,
  performanceData,
  workflowDistribution,
  agentUtilization,
  realtimeData,
  COLORS,
  WORKFLOW_PHASES,
  plannerLogs,
  activePlans,
}) => {
  const [selectedTab, setSelectedTab] = useState("performance");
  
  // Helper functions
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };
  
  const calculateAgentEfficiency = () => {
    const efficiency = agents.map(agent => {
      const taskTime = agent.performanceMetrics.averageTime;
      const successRate = agent.performanceMetrics.successRate;
      const efficiency = (successRate * 100) / (taskTime || 1);
      return {
        agent: agent.name,
        efficiency: efficiency.toFixed(2),
        category: efficiency > 50 ? 'high' : efficiency > 20 ? 'medium' : 'low'
      };
    });
    return efficiency;
  };
  
  const predictWorkflowCompletion = (workflow: Workflow) => {
    const progressRate = workflow.progress / ((Date.now() - new Date(workflow.createdAt).getTime()) / 1000 / 60);
    const remainingProgress = 100 - workflow.progress;
    const estimatedMinutes = remainingProgress / (progressRate || 1);
    return {
      estimatedCompletion: new Date(Date.now() + estimatedMinutes * 60000),
      confidence: progressRate > 0 ? 0.85 : 0.5
    };
  };
  
  const analyzeWorkflowBottlenecks = () => {
    const bottlenecks = workflows
      .filter(w => w.status === "executing")
      .map(w => {
        const phases = w.type === "code" ? WORKFLOW_PHASES.code : WORKFLOW_PHASES.analysis;
        const currentPhaseIndex = phases.findIndex(p => p.id === (w.state as any).currentPhase);
        const timeInPhase = Date.now() - new Date(w.updatedAt).getTime();
        
        return {
          workflow: w.name,
          phase: phases[currentPhaseIndex]?.name || "Unknown",
          timeInPhase: timeInPhase / 1000 / 60, // minutes
          severity: timeInPhase > 3600000 ? 'high' : timeInPhase > 1800000 ? 'medium' : 'low'
        };
      });
    return bottlenecks;
  };
  
  const generateInsights = () => {
    const insights = [];
    
    // Agent performance insights
    const avgSuccessRate = agents.reduce((sum, a) => sum + a.performanceMetrics.successRate, 0) / agents.length;
    if (avgSuccessRate < 0.8) {
      insights.push({
        type: 'warning',
        category: 'performance',
        message: 'Average agent success rate is below 80%. Consider reviewing agent configurations.',
        action: 'Review and optimize agent models'
      });
    }
    
    // Workflow insights
    const stuckWorkflows = workflows.filter(w => 
      w.status === "executing" && 
      (Date.now() - new Date(w.updatedAt).getTime()) > 3600000
    );
    if (stuckWorkflows.length > 0) {
      insights.push({
        type: 'alert',
        category: 'workflow',
        message: `${stuckWorkflows.length} workflows have been running for over an hour.`,
        action: 'Check for potential issues or bottlenecks'
      });
    }
    
    return insights;
  };
  
  const generateTrendData = () => {
    const data = [];
    for (let i = 30; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toLocaleDateString(),
        created: Math.floor(Math.random() * 50) + 20,
        completed: Math.floor(Math.random() * 40) + 15,
        failed: Math.floor(Math.random() * 10) + 2,
      });
    }
    return data;
  };
  
  const generateCostData = () => {
    return agents.slice(0, 10).map(agent => ({
      name: agent.name,
      value: Math.floor(Math.random() * 1000) + 100,
    }));
  };
  
  const generateResourceForecast = () => {
    const data = [];
    for (let i = 0; i < 24; i++) {
      data.push({
        time: `${i}:00`,
        cpu: Math.floor(Math.random() * 30 + 40),
        memory: Math.floor(Math.random() * 20 + 50),
        gpu: Math.floor(Math.random() * 40 + 30)
      });
    }
    return data;
  };
  
  const generateAnomalies = () => {
    return [
      {
        title: "Unusual spike in API response time",
        description: "Response time increased by 150% in the last hour",
        severity: "medium",
        timestamp: new Date(Date.now() - 3600000).toISOString()
      },
      {
        title: "Memory usage approaching limit",
        description: "System memory usage at 92% of allocated resources",
        severity: "high",
        timestamp: new Date(Date.now() - 1800000).toISOString()
      },
      {
        title: "Repeated failures in code generation workflow",
        description: "3 consecutive failures detected for similar requests",
        severity: "medium",
        timestamp: new Date(Date.now() - 900000).toISOString()
      }
    ];
  };
  
  const generateDecisionHistory = () => {
    return [
      {
        title: "Model Selection for Complex Analysis",
        context: "User requested deep analysis of large codebase with performance constraints",
        options: [
          { name: "Use GPT-4 Turbo", score: 85, selected: false },
          { name: "Use Qwen2.5 72B", score: 92, selected: true },
          { name: "Use Claude 3 Opus", score: 88, selected: false }
        ],
        reasoning: "Qwen2.5 72B offers the best balance of performance and accuracy for code analysis tasks",
        decidedBy: "Decision Maker Agent",
        status: "applied",
        timestamp: new Date(Date.now() - 7200000).toISOString()
      },
      {
        title: "Workflow Optimization Strategy",
        context: "System detected performance bottleneck in data processing pipeline",
        options: [
          { name: "Parallelize tasks", score: 78, selected: true },
          { name: "Optimize single-thread", score: 65, selected: false },
          { name: "Queue and batch", score: 72, selected: false }
        ],
        reasoning: "Parallelization offers 3x performance improvement with minimal code changes",
        decidedBy: "Optimizer Agent",
        status: "applied",
        timestamp: new Date(Date.now() - 3600000).toISOString()
      }
    ];
  };
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
      
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="utilization">Utilization</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="costs">Cost Analysis</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
          <TabsTrigger value="planner">Planner</TabsTrigger>
        </TabsList>
        
        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Agent Performance Over Time</CardTitle>
                <CardDescription>Success rate trends for each agent</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={realtimeData.slice(-50)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <RechartsTooltip />
                    <Legend />
                    {agents.slice(0, 5).map((agent, index) => (
                      <Line
                        key={agent.type}
                        type="monotone"
                        dataKey={agent.type}
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Task Completion Rate</CardTitle>
                <CardDescription>Successful vs failed tasks by agent</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <RechartsBarChart data={agents}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={150} />
                    <YAxis />
                    <RechartsTooltip />
                    <Legend />
                    <Bar dataKey="performanceMetrics.totalTasks" fill="#3b82f6" name="Total Tasks" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="utilization" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Agent Utilization</CardTitle>
                <CardDescription>Current workload distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={agentUtilization.slice(0, 8)}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="name" />
                    <PolarRadiusAxis />
                    <Radar name="Utilization" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Resource Allocation</CardTitle>
                <CardDescription>System resource usage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">CPU Usage</span>
                      <span className="text-sm text-muted-foreground">68%</span>
                    </div>
                    <Progress value={68} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Memory Usage</span>
                      <span className="text-sm text-muted-foreground">45%</span>
                    </div>
                    <Progress value={45} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">GPU Usage</span>
                      <span className="text-sm text-muted-foreground">82%</span>
                    </div>
                    <Progress value={82} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Network I/O</span>
                      <span className="text-sm text-muted-foreground">23 MB/s</span>
                    </div>
                    <Progress value={23} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workflow Trends</CardTitle>
              <CardDescription>Workflow creation and completion over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={generateTrendData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="created" stackId="1" stroke="#3b82f6" fill="#3b82f6" />
                  <Area type="monotone" dataKey="completed" stackId="1" stroke="#10b981" fill="#10b981" />
                  <Area type="monotone" dataKey="failed" stackId="1" stroke="#ef4444" fill="#ef4444" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="costs" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Compute Costs</CardTitle>
                <CardDescription>This month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">$2,847</div>
                <p className="text-xs text-muted-foreground mt-2">
                  +12% from last month
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>API Calls</CardTitle>
                <CardDescription>This month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">1.2M</div>
                <p className="text-xs text-muted-foreground mt-2">
                  Average 40k/day
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Cost per Task</CardTitle>
                <CardDescription>Average</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">$0.024</div>
                <p className="text-xs text-muted-foreground mt-2">
                  -5% from last month
                </p>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Cost Breakdown by Agent</CardTitle>
              <CardDescription>Resource consumption by agent type</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <Treemap
                  data={generateCostData()}
                  dataKey="value"
                  aspectRatio={4 / 3}
                  stroke="#fff"
                  fill="#3b82f6"
                />
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="advanced" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Insights</CardTitle>
                <Brain className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{generateInsights().length}</div>
                <p className="text-xs text-muted-foreground">
                  {generateInsights().filter(i => i.type === 'alert').length} require attention
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bottlenecks</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyzeWorkflowBottlenecks().length}</div>
                <p className="text-xs text-muted-foreground">
                  {analyzeWorkflowBottlenecks().filter(b => b.severity === 'high').length} critical
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Optimization Score</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(agents.reduce((sum, a) => sum + a.performanceMetrics.successRate, 0) / agents.length * 100).toFixed(0)}%
                </div>
                <Progress 
                  value={agents.reduce((sum, a) => sum + a.performanceMetrics.successRate, 0) / agents.length * 100} 
                  className="mt-2"
                />
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>System Insights</CardTitle>
              <CardDescription>AI-generated recommendations and observations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {generateInsights().map((insight, idx) => (
                  <Alert key={idx} variant={insight.type === 'alert' ? 'destructive' : 'default'}>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{insight.category.charAt(0).toUpperCase() + insight.category.slice(1)}</AlertTitle>
                    <AlertDescription>
                      <p>{insight.message}</p>
                      <p className="mt-2 font-medium">Recommended Action: {insight.action}</p>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Agent Efficiency Matrix</CardTitle>
              <CardDescription>Performance vs Resource Utilization</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Efficiency Score</TableHead>
                    <TableHead>Tasks/Hour</TableHead>
                    <TableHead>Avg Response Time</TableHead>
                    <TableHead>Resource Usage</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculateAgentEfficiency().map((item, idx) => {
                    const agent = agents[idx];
                    if (!agent) return null;
                    return (
                      <TableRow key={agent.type}>
                        <TableCell className="font-medium">{agent.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{item.efficiency}</span>
                            <Badge variant={
                              item.category === 'high' ? 'default' :
                              item.category === 'medium' ? 'secondary' :
                              'destructive'
                            } className="text-xs">
                              {item.category}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(agent.performanceMetrics.totalTasks / 24).toFixed(1)}
                        </TableCell>
                        <TableCell>{formatDuration(agent.performanceMetrics.averageTime)}</TableCell>
                        <TableCell>
                          <Progress value={Math.random() * 100} className="w-20" />
                        </TableCell>
                        <TableCell>
                          <Badge variant={agent.status === 'ready' ? 'default' : 'secondary'}>
                            {agent.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="planner" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Planner & Reasoner Dashboard</CardTitle>
              <CardDescription>Advanced AI planning and reasoning capabilities</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="active-plans">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="active-plans">Active Plans</TabsTrigger>
                  <TabsTrigger value="plan-history">History</TabsTrigger>
                  <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
                  <TabsTrigger value="decisions">Decisions</TabsTrigger>
                </TabsList>
                
                <TabsContent value="active-plans" className="space-y-4">
                  {activePlans.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No active plans. Create one using the Planner mode.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activePlans.map((plan) => (
                        <Card key={plan.id}>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <div>
                                <CardTitle className="text-lg">{plan.title}</CardTitle>
                                <CardDescription>
                                  Created: {new Date(plan.createdAt).toLocaleString()}
                                </CardDescription>
                              </div>
                              <Badge variant={
                                plan.priority === 'high' ? 'destructive' : 
                                plan.priority === 'medium' ? 'default' : 
                                'secondary'
                              }>
                                {plan.priority}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              {plan.steps.map((step, idx) => (
                                <div key={idx} className="flex items-start gap-3">
                                  <div className={`rounded-full p-1 ${
                                    step.status === 'completed' ? 'bg-green-100' :
                                    step.status === 'in_progress' ? 'bg-blue-100' :
                                    'bg-gray-100'
                                  }`}>
                                    {step.status === 'completed' ? (
                                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                                    ) : step.status === 'in_progress' ? (
                                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                                    ) : (
                                      <Clock className="w-4 h-4 text-gray-400" />
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <p className="font-medium">Step {step.order}: {step.action}</p>
                                    {step.dependencies.length > 0 && (
                                      <p className="text-xs text-muted-foreground">
                                        Depends on: {step.dependencies.join(', ')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            <div className="mt-4 flex gap-2">
                              <Button size="sm" variant="outline">
                                <Play className="w-4 h-4 mr-2" />
                                Execute
                              </Button>
                              <Button size="sm" variant="outline">
                                <Edit className="w-4 h-4 mr-2" />
                                Modify
                              </Button>
                              <Button size="sm" variant="outline">
                                <Archive className="w-4 h-4 mr-2" />
                                Archive
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="plan-history" className="space-y-4">
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-2">
                      {plannerLogs.slice(-20).reverse().map((log, idx) => (
                        <Card key={idx}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    {log.logType.replace(/_/g, ' ')}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(log.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-sm font-medium mb-1">{log.intent}</p>
                                <p className="text-xs text-muted-foreground">
                                  {log.userMessage.substring(0, 100)}...
                                </p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {log.tags.map((tag, tagIdx) => (
                                    <Badge key={tagIdx} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              {log.planGenerated && (
                                <Badge variant="default" className="ml-2">
                                  Plan Generated
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="reasoning" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Reasoning Chain Visualization</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {plannerLogs.filter(log => log.logType === 'question_analysis').slice(-5).map((log, idx) => (
                          <div key={idx} className="relative pl-6">
                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                            <div className="absolute left-[-4px] top-2 w-2 h-2 rounded-full bg-blue-600"></div>
                            <div className="space-y-2">
                              <p className="font-medium text-sm">Question Analysis</p>
                              <div className="bg-gray-50 p-3 rounded text-sm">
                                <p className="text-muted-foreground mb-1">Input:</p>
                                <p className="mb-2">{log.userMessage}</p>
                                <p className="text-muted-foreground mb-1">Reasoning:</p>
                                <p>{log.aiResponse.substring(0, 200)}...</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="decisions" className="space-y-4">
                  <div className="grid gap-4">
                    {generateDecisionHistory().map((decision, idx) => (
                      <Card key={idx}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{decision.title}</CardTitle>
                            <Badge variant={decision.status === 'applied' ? 'default' : 'secondary'}>
                              {decision.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm font-medium mb-1">Context</p>
                              <p className="text-sm text-muted-foreground">{decision.context}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium mb-1">Options Considered</p>
                              <div className="space-y-1">
                                {decision.options.map((option, optIdx) => (
                                  <div key={optIdx} className="flex items-center gap-2">
                                    <div className={`w-4 h-4 rounded-full border-2 ${
                                      option.selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                                    }`}></div>
                                    <span className={`text-sm ${option.selected ? 'font-medium' : ''}`}>
                                      {option.name}
                                    </span>
                                    {option.score && (
                                      <Badge variant="outline" className="text-xs">
                                        Score: {option.score}
                                      </Badge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-sm font-medium mb-1">Reasoning</p>
                              <p className="text-sm text-muted-foreground">{decision.reasoning}</p>
                            </div>
                            <div className="flex items-center justify-between pt-2">
                              <span className="text-xs text-muted-foreground">
                                Decided by: {decision.decidedBy}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(decision.timestamp).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analytics;