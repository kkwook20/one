import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertCircle,
  BarChart,
  Bot,
  CheckCircle2,
  MessageSquare,
  Plus,
  RefreshCw,
  Zap,
} from "lucide-react";
import {
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import type { Agent, Workflow, SystemMetrics, ChartDataPoint, Message } from "../DataAnalysis";

interface DashboardProps {
  agents: Agent[];
  workflows: Workflow[];
  systemMetrics: SystemMetrics | null;
  performanceData: ChartDataPoint[];
  workflowDistribution: ChartDataPoint[];
  messages: Message[];
  onCreateWorkflow: () => void;
  onRefreshData: () => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const Dashboard: React.FC<DashboardProps> = ({
  agents,
  workflows,
  systemMetrics,
  performanceData,
  workflowDistribution,
  messages,
  onCreateWorkflow,
  onRefreshData,
}) => {
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* System Status */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemMetrics?.activeWorkflows || 0}</div>
            <p className="text-xs text-muted-foreground">
              {workflows.filter(w => w.status === "executing").length} executing
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agents.filter(a => a.status === "busy").length}</div>
            <p className="text-xs text-muted-foreground">
              of {agents.length} total agents
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Load</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {systemMetrics ? ((systemMetrics.activeTasks / agents.length) * 100).toFixed(0) : 0}%
            </div>
            <Progress value={systemMetrics ? (systemMetrics.activeTasks / agents.length) * 100 : 0} className="mt-2" />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {performanceData.length > 0 
                ? (performanceData.reduce((sum, d) => sum + d.value, 0) / performanceData.length).toFixed(1)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Average across all agents
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Agent Performance</CardTitle>
            <CardDescription>Success rate by agent type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsBarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </RechartsBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Workflow Status</CardTitle>
            <CardDescription>Distribution by status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={workflowDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {workflowDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      
      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest system events</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-4">
              {messages.slice(-10).reverse().map((message) => (
                <div key={message.id} className="flex items-start space-x-3">
                  <div className={`rounded-full p-2 ${message.priority === "high" ? "bg-red-100" : "bg-blue-100"}`}>
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{message.from} → {message.to}</p>
                    <p className="text-sm text-muted-foreground">{message.type}</p>
                    <p className="text-xs text-muted-foreground">{formatTimestamp(message.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Button
              variant="outline"
              className="justify-start"
              onClick={onCreateWorkflow}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Workflow
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                // Navigate to agents view with chat open
                window.dispatchEvent(new CustomEvent('navigate-to-agents-chat'));
              }}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat with Agent
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={onRefreshData}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Data
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                // Navigate to analytics view
                window.dispatchEvent(new CustomEvent('navigate-to-analytics'));
              }}
            >
              <BarChart className="mr-2 h-4 w-4" />
              View Analytics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;