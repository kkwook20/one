// frontend/src/components/Argosa/function/DataAnalysis.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Bot,
  GitBranch,
  LayoutDashboard,
  LineChart as LineChartIcon,
  Settings,
  AlertCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import _ from "lodash";

// Import view components
import Dashboard from "./dataanalysis/Dashboard";
import Workflows from "./dataanalysis/Workflows";
import Agents from "./dataanalysis/Agents";
import Analytics from "./dataanalysis/Analytics";
import SettingsView from "./dataanalysis/Settings";

// ===== Type Definitions =====
// Agent Types
export type EnhancedAgentType = 
  | "analyst"
  | "predictor"
  | "optimizer"
  | "anomaly_detector"
  | "architect"
  | "code_analyzer"
  | "code_generator"
  | "code_reviewer"
  | "implementer"
  | "test_designer"
  | "refactorer"
  | "integrator"
  | "strategist"
  | "risk_assessor"
  | "planner"
  | "reasoner"
  | "decision_maker"
  | "web_searcher"
  | "doc_searcher"
  | "coordinator";

export interface Agent {
  type: EnhancedAgentType;
  name: string;
  status: "ready" | "busy" | "error" | "offline";
  capabilities: string[];
  model: string;
  performanceMetrics: {
    successRate: number;
    averageTime: number;
    totalTasks: number;
  };
  lastActive?: string;
  currentTask?: string;
}

// Workflow Types
export interface WorkflowState {
  workflowId: string;
  taskType: string;
  currentPhase: string;
  projectStructure: Record<string, any>;
  fileDependencies: Record<string, string[]>;
  codePatterns: any[];
  entityMap: Record<string, any>;
  subtasks: Subtask[];
  currentSubtask?: Subtask;
  completedSubtasks: string[];
  codeFragments: Record<string, string>;
  integrationPoints: any[];
  messages: Message[];
  pendingQuestions: Question[];
  decisions: Decision[];
  validationResults: Record<string, any>;
  qualityMetrics: QualityMetrics;
  testCoverage: number;
  ragDocuments: string[];
  learnedPatterns: any[];
  websocketClients: string[];
  collaborationSessionId?: string;
}

export interface AnalysisWorkflowState {
  workflowId: string;
  analysisType: string;
  currentPhase: string;
  dataSources: string[];
  analysisObjective: string;
  constraints: string[];
  businessGoals: string[];
  collectedData?: any;
  analysisResults?: any;
  insights?: any;
  visualizations?: any[];
  finalReport?: any;
}

export interface Workflow {
  id: string;
  name: string;
  type: "code" | "analysis" | "hybrid";
  status: "created" | "executing" | "paused" | "completed" | "failed";
  progress: number;
  createdAt: string;
  updatedAt: string;
  state: WorkflowState | AnalysisWorkflowState;
}

export interface Subtask {
  id: string;
  description: string;
  type: string;
  dependencies: string[];
  priority: "low" | "normal" | "high" | "critical";
  estimatedComplexity: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed" | "failed";
  assignedAgent?: string;
  result?: any;
}

export interface Message {
  id: string;
  type: string;
  from: string;
  to: string;
  content: any;
  timestamp: string;
  priority: "low" | "normal" | "high";
  status: "sent" | "delivered" | "read";
}

export interface Question {
  id: string;
  question: string;
  context: any;
  fromAgent: string;
  toAgent: string;
  status: "pending" | "answered";
  answer?: string;
  timestamp: string;
}

export interface Decision {
  id: string;
  type: string;
  description: string;
  options: string[];
  selectedOption?: string;
  reasoning?: string;
  madeBy: string;
  timestamp: string;
  impact: "low" | "medium" | "high";
}

export interface QualityMetrics {
  complexity: number;
  maintainability: number;
  reliability: number;
  security: number;
  performance: number;
  documentation: number;
}

// Analysis Types
export interface AnalysisRequest {
  requestId?: string;
  analysisType: string;
  dataSource?: string;
  parameters: Record<string, any>;
  priority: "low" | "normal" | "high" | "critical";
  objective: string;
  constraints: string[];
}

export interface AnalysisResult {
  analysisId: string;
  timestamp: string;
  agentType: EnhancedAgentType;
  resultType: string;
  data: any;
  confidence: number;
  metadata: Record<string, any>;
}

// WebSocket Types
export interface WebSocketMessage {
  type: string;
  workflowId?: string;
  data?: any;
  timestamp: string;
}

// Configuration Types
export interface AIModelConfig {
  default?: string;
  specialized: Partial<Record<EnhancedAgentType, string>>;
}

export interface SystemMetrics {
  activeWorkflows: number;
  activeTasks: number;
  cachedResults: number;
  websocketConnections: number;
  agentPerformance: Record<string, any>;
}

// Chart Data Types
export interface ChartDataPoint {
  name: string;
  value: number;
  category?: string;
  timestamp?: string;
}

export interface TimeSeriesData {
  timestamp: string;
  [key: string]: any;
}

// Planner/Reasoner Types
export interface PlannerLog {
  timestamp: string;
  userMessage: string;
  aiResponse: string;
  logType: 'question_analysis' | 'ai_response_summary' | 'command_instruction' | 'structural_plan' | 'code_directive';
  intent: string;
  targets: string[];
  planGenerated: boolean;
  tags: string[];
  metadata: {
    sessionId: string;
    source: string;
    modelUsed: string;
  };
}

export interface StructuredPlan {
  id: string;
  title: string;
  steps: Array<{
    order: number;
    action: string;
    dependencies: string[];
    status: 'pending' | 'in_progress' | 'completed';
  }>;
  createdAt: string;
  priority: 'low' | 'medium' | 'high';
}

// LM Studio Config
export interface LMStudioConfig {
  endpoint: string;
  model: string;
  temperature: number;
  maxTokens: number;
  lastUsed?: string;
}

// ===== Constants =====

export const AGENT_CONFIGS: Record<EnhancedAgentType, { name: string; icon: any; color: string; description: string }> = {
  analyst: { 
    name: "Data Analysis Expert", 
    icon: Bot, 
    color: "text-blue-600",
    description: "Analyzes data patterns and generates insights"
  },
  predictor: { 
    name: "Prediction Specialist", 
    icon: Bot, 
    color: "text-green-600",
    description: "Forecasts trends and future outcomes"
  },
  optimizer: { 
    name: "Optimization Engine", 
    icon: Bot, 
    color: "text-yellow-600",
    description: "Optimizes processes and resources"
  },
  anomaly_detector: { 
    name: "Anomaly Detector", 
    icon: Bot, 
    color: "text-red-600",
    description: "Identifies unusual patterns and outliers"
  },
  architect: { 
    name: "Software Architect", 
    icon: Bot, 
    color: "text-purple-600",
    description: "Designs system architecture and structure"
  },
  code_analyzer: { 
    name: "Code Analysis Specialist", 
    icon: Bot, 
    color: "text-indigo-600",
    description: "Analyzes code quality and patterns"
  },
  code_generator: { 
    name: "Code Generation Specialist", 
    icon: Bot, 
    color: "text-pink-600",
    description: "Generates code based on specifications"
  },
  code_reviewer: { 
    name: "Code Review Specialist", 
    icon: Bot, 
    color: "text-orange-600",
    description: "Reviews code for quality and best practices"
  },
  implementer: { 
    name: "Implementation Specialist", 
    icon: Bot, 
    color: "text-cyan-600",
    description: "Implements detailed solutions"
  },
  test_designer: { 
    name: "Test Design Specialist", 
    icon: Bot, 
    color: "text-lime-600",
    description: "Designs comprehensive test strategies"
  },
  refactorer: { 
    name: "Refactoring Expert", 
    icon: Bot, 
    color: "text-amber-600",
    description: "Improves code structure and quality"
  },
  integrator: { 
    name: "Integration Specialist", 
    icon: Bot, 
    color: "text-teal-600",
    description: "Integrates components and systems"
  },
  strategist: { 
    name: "Strategic Planning Expert", 
    icon: Bot, 
    color: "text-rose-600",
    description: "Develops strategic plans and recommendations"
  },
  risk_assessor: { 
    name: "Risk Assessment Expert", 
    icon: Bot, 
    color: "text-stone-600",
    description: "Evaluates and mitigates risks"
  },
  planner: { 
    name: "Task Planning Specialist", 
    icon: Bot, 
    color: "text-violet-600",
    description: "Plans and organizes tasks efficiently"
  },
  reasoner: { 
    name: "Reasoning Engine", 
    icon: Bot, 
    color: "text-fuchsia-600",
    description: "Provides logical reasoning and analysis"
  },
  decision_maker: { 
    name: "Decision Making Expert", 
    icon: Bot, 
    color: "text-emerald-600",
    description: "Makes informed decisions based on data"
  },
  web_searcher: { 
    name: "Web Search Specialist", 
    icon: Bot, 
    color: "text-sky-600",
    description: "Searches and retrieves web information"
  },
  doc_searcher: { 
    name: "Document Search Expert", 
    icon: Bot, 
    color: "text-slate-600",
    description: "Searches internal documents and knowledge"
  },
  coordinator: { 
    name: "Collaboration Coordinator", 
    icon: Bot, 
    color: "text-zinc-600",
    description: "Coordinates multi-agent collaboration"
  },
};

export const WORKFLOW_PHASES = {
  code: [
    { id: "initialized", name: "Initialized", progress: 0 },
    { id: "project_analyzed", name: "Project Analyzed", progress: 10 },
    { id: "requirements_understood", name: "Requirements Understood", progress: 20 },
    { id: "architecture_designed", name: "Architecture Designed", progress: 30 },
    { id: "tasks_decomposed", name: "Tasks Decomposed", progress: 40 },
    { id: "code_generation", name: "Code Generation", progress: 50 },
    { id: "code_integrated", name: "Code Integrated", progress: 80 },
    { id: "tests_generated", name: "Tests Generated", progress: 90 },
    { id: "completed", name: "Completed", progress: 100 },
  ],
  analysis: [
    { id: "initialized", name: "Initialized", progress: 0 },
    { id: "data_collected", name: "Data Collected", progress: 25 },
    { id: "data_analyzed", name: "Data Analyzed", progress: 50 },
    { id: "insights_generated", name: "Insights Generated", progress: 75 },
    { id: "visualizations_created", name: "Visualizations Created", progress: 90 },
    { id: "completed", name: "Completed", progress: 100 },
  ],
};

export const RECOMMENDED_MODELS = {
  "intent-classification": [
    "TheBloke/Llama-2-7B-Chat-GGUF",
    "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
    "TheBloke/Phi-3-mini-4k-instruct-GGUF"
  ],
  "ner": [
    "TheBloke/Llama-2-13B-chat-GGUF",
    "TheBloke/WizardLM-13B-V1.2-GGUF"
  ],
  "summarization": [
    "TheBloke/Nous-Hermes-2-Mixtral-8x7B-DPO-GGUF",
    "TheBloke/OpenHermes-2.5-Mistral-7B-GGUF"
  ],
  "qa": [
    "TheBloke/CodeLlama-7B-Instruct-GGUF",
    "TheBloke/Llama-2-7B-Chat-GGUF"
  ],
  "planner": [
    "Qwen/Qwen2.5-72B-Instruct-GGUF",
    "TheBloke/Nous-Hermes-2-Yi-34B-GGUF",
    "TheBloke/OpenChat-3.5-0106-GGUF"
  ]
};

export const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// ===== Main Component =====

const DataAnalysis: React.FC = () => {
  // ===== State Management =====
  
  // System State
  const [agents, setAgents] = useState<Agent[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // UI State
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  
  // Real-time State
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [realtimeData, setRealtimeData] = useState<TimeSeriesData[]>([]);
  
  // Configuration State
  const [modelConfig, setModelConfig] = useState<AIModelConfig>({
    default: "qwen2.5-72b-instruct",
    specialized: {}
  });
  
  // LM Studio State
  const [lmStudioConfig, setLmStudioConfig] = useState<LMStudioConfig>({
    endpoint: "http://localhost:1234/v1/chat/completions",
    model: "local-model",
    temperature: 0.7,
    maxTokens: 2000,
  });
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("disconnected");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<Record<string, LMStudioConfig>>({});
  
  // Planner State
  const [plannerLogs, setPlannerLogs] = useState<PlannerLog[]>([]);
  const [activePlans, setActivePlans] = useState<StructuredPlan[]>([]);
  
  // Chart Data
  const [performanceData, setPerformanceData] = useState<ChartDataPoint[]>([]);
  const [workflowDistribution, setWorkflowDistribution] = useState<ChartDataPoint[]>([]);
  const [agentUtilization, setAgentUtilization] = useState<ChartDataPoint[]>([]);
  
  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // ===== WebSocket Connection =====
  
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    try {
      const ws = new WebSocket(`ws://localhost:8000/api/argosa/analysis/ws/${Date.now()}`);
      
      ws.onopen = () => {
        setIsConnected(true);
        setBackendError(null);
        console.log("WebSocket connected");
        
        // Subscribe to updates
        ws.send(JSON.stringify({
          type: "subscribe",
          topics: ["workflows", "agents", "metrics"]
        }));
      };
      
      ws.onmessage = (event) => {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleWebSocketMessage(message);
      };
      
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setBackendError('WebSocket connection error');
      };
      
      ws.onclose = () => {
        setIsConnected(false);
        console.log("WebSocket disconnected");
        
        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };
      
      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
      setBackendError('Cannot connect to backend server');
    }
  }, []);
  
  const handleWebSocketMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case "progress_update":
        updateWorkflowProgress(message.workflowId!, message.data);
        break;
      case "agent_status":
        updateAgentStatus(message.data);
        break;
      case "metrics_update":
        setSystemMetrics(message.data);
        break;
      case "agent_message":
        setMessages(prev => [...prev, message.data]);
        break;
      case "notification":
        setNotifications(prev => [...prev, message.data]);
        break;
      case "realtime_data":
        setRealtimeData(prev => [...prev.slice(-100), message.data]);
        break;
    }
  };
  
  const updateWorkflowProgress = (workflowId: string, data: any) => {
    setWorkflows(prev => prev.map(wf => 
      wf.id === workflowId 
        ? { ...wf, ...data, updatedAt: new Date().toISOString() }
        : wf
    ));
    
    if (activeWorkflow?.id === workflowId) {
      setActiveWorkflow(prev => prev ? { ...prev, ...data } : null);
    }
  };
  
  const updateAgentStatus = (agentData: Partial<Agent>) => {
    setAgents(prev => prev.map(agent => 
      agent.type === agentData.type 
        ? { ...agent, ...agentData, lastActive: new Date().toISOString() }
        : agent
    ));
  };
  
  // ===== API Calls =====
  
  const fetchAgents = async () => {
    try {
      const response = await fetch("/api/argosa/analysis/agents");
      const data = await response.json();
      
      const agentList: Agent[] = data.agents.map((agent: any) => ({
        type: agent.type,
        name: agent.name,
        status: agent.status,
        capabilities: agent.capabilities,
        model: agent.model,
        performanceMetrics: agent.performance,
        lastActive: new Date().toISOString(),
      }));
      
      setAgents(agentList);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
      // Don't use mock data - show empty state instead
      setAgents([]);
      setBackendError('Failed to fetch agents from backend');
    }
  };
  
  const fetchWorkflows = async () => {
    try {
      const response = await fetch("/api/argosa/analysis/workflows");
      const data = await response.json();
      
      const workflowList: Workflow[] = data.workflows.map((wf: any) => ({
        id: wf.workflow_id,
        name: `Workflow ${wf.workflow_id.slice(-8)}`,
        type: wf.type,
        status: wf.current_phase === "completed" ? "completed" : "executing",
        progress: wf.progress || 0,
        createdAt: new Date(parseFloat(wf.created_at) * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
        state: wf,
      }));
      
      setWorkflows(workflowList);
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
      // Don't use mock data - show empty state instead
      setWorkflows([]);
    }
  };
  
  const fetchMetrics = async () => {
    try {
      const response = await fetch("/api/argosa/analysis/metrics");
      const data = await response.json();
      setSystemMetrics(data);
      
      // Update chart data
      updateChartData(data);
    } catch (error) {
      console.error("Failed to fetch metrics:", error);
      // Don't use mock data - use empty metrics
      const emptyMetrics = {
        activeWorkflows: 0,
        activeTasks: 0,
        cachedResults: 0,
        websocketConnections: 0,
        agentPerformance: {}
      };
      setSystemMetrics(emptyMetrics);
      updateChartData(emptyMetrics);
    }
  };
  
  const createWorkflow = async (
    analysisType: string,
    analysisObjective: string,
    dataSources: string[],
    constraints: string[],
    businessGoals: string[],
    priority: "low" | "normal" | "high" | "critical"
  ) => {
    const request = {
      analysis_type: analysisType,
      objective: analysisObjective,
      data_source: dataSources.length > 0 ? dataSources[0] : null,
      parameters: {
        data_sources: dataSources,
        business_goals: businessGoals,
        ...(analysisType === "code" && {
          task_type: "generate",
          project_root: ".",
        }),
      },
      constraints,
      priority,
      enable_web_search: false,
      search_sources: [],
      search_depth: "normal"
    };
    
    console.log("Creating workflow with request:", request);
    
    // First test if the API is accessible
    try {
      const testResponse = await fetch("/api/argosa/analysis/test");
      console.log("Test endpoint response:", testResponse.status);
      if (!testResponse.ok) {
        console.error("Test endpoint failed, API might not be accessible");
      }
    } catch (e) {
      console.error("Failed to reach test endpoint:", e);
    }
    
    try {
      const response = await fetch("/api/argosa/analysis/workflow/create", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(request),
      });
      
      console.log("Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { detail: errorText || response.statusText };
        }
        throw new Error(errorData.detail || 'Failed to create workflow');
      }
      
      const data = await response.json();
      
      // Execute workflow
      const execResponse = await fetch(`/api/argosa/analysis/workflow/${data.workflow_id}/execute`, {
        method: "POST",
      });
      
      if (!execResponse.ok) {
        console.error("Failed to execute workflow");
      }
      
      // Refresh workflows
      await fetchWorkflows();
      
      // Clear error if successful
      setBackendError(null);
    } catch (error) {
      console.error("Failed to create workflow:", error);
      // Don't create mock workflow - show error instead
      const errorMessage = error instanceof Error ? error.message : 'Please check backend connection.';
      setBackendError(`Failed to create workflow: ${errorMessage}`);
    }
  };
  
  const askAgent = async (agentType: EnhancedAgentType, question: string, context: any = {}) => {
    try {
      const response = await fetch("/api/argosa/analysis/agent/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_type: agentType,
          question,
          prompt_data: context,
        }),
      });
      
      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error("Failed to ask agent:", error);
      // Don't return mock response - throw error instead
      throw new Error('Failed to communicate with agent. Please check backend connection.');
    }
  };
  
  const configureModels = async (config: AIModelConfig) => {
    try {
      const response = await fetch("/api/argosa/analysis/models/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      
      const data = await response.json();
      setModelConfig(config);
    } catch (error) {
      console.error("Failed to configure models:", error);
      // Save locally for development
      setModelConfig(config);
    }
  };
  
  const checkLMStudioConnection = async () => {
    setConnectionStatus("checking");
    try {
      const response = await fetch(lmStudioConfig.endpoint.replace('/chat/completions', '/models'));
      if (response.ok) {
        const data = await response.json();
        const models = data.data?.map((model: any) => model.id) || [];
        setAvailableModels(models);
        setConnectionStatus("connected");
        saveConfig();
      } else {
        setConnectionStatus("disconnected");
      }
    } catch (error) {
      setConnectionStatus("disconnected");
      console.error("Connection failed:", error);
    }
  };
  
  const saveConfig = async () => {
    const configKey = `lm_config_${lmStudioConfig.endpoint}`;
    const newConfig = { ...lmStudioConfig, lastUsed: new Date().toISOString() };
    
    setSavedConfigs(prev => ({
      ...prev,
      [configKey]: newConfig
    }));
  };
  
  const loadSavedConfigs = async () => {
    const mockConfigs = {
      'lm_config_http://localhost:1234/v1/chat/completions': {
        endpoint: "http://localhost:1234/v1/chat/completions",
        model: "local-model",
        temperature: 0.7,
        maxTokens: 2000,
        lastUsed: new Date().toISOString()
      }
    };
    
    setSavedConfigs(mockConfigs);
    
    const recentConfig = Object.values(mockConfigs).sort((a, b) => 
      new Date(b.lastUsed!).getTime() - new Date(a.lastUsed!).getTime()
    )[0];
    
    if (recentConfig) {
      setLmStudioConfig(recentConfig);
    }
  };
  
  // ===== Helper Functions =====
  
  const getProgressFromPhase = (type: string, phase: string): number => {
    const phases = type === "code" ? WORKFLOW_PHASES.code : WORKFLOW_PHASES.analysis;
    const phaseInfo = phases.find(p => p.id === phase);
    return phaseInfo?.progress || 0;
  };
  
  const updateChartData = (metrics: SystemMetrics) => {
    // Performance data
    const perfData: ChartDataPoint[] = Object.entries(metrics.agentPerformance).map(([agent, perf]: [string, any]) => ({
      name: agent,
      value: perf.success_rate * 100,
      category: "success_rate",
    }));
    setPerformanceData(perfData);
    
    // Workflow distribution
    const statusCounts = workflows.reduce((acc, wf) => {
      acc[wf.status] = (acc[wf.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const distData: ChartDataPoint[] = Object.entries(statusCounts).map(([status, count]) => ({
      name: status,
      value: count,
    }));
    setWorkflowDistribution(distData);
    
    // Agent utilization
    const utilData: ChartDataPoint[] = agents.map(agent => ({
      name: agent.name,
      value: agent.status === "busy" ? 100 : agent.status === "ready" ? 50 : 0,
    }));
    setAgentUtilization(utilData);
  };
  
  // Mock data generators
  const generateMockAgents = (): Agent[] => {
    return Object.entries(AGENT_CONFIGS).map(([type, config]) => ({
      type: type as EnhancedAgentType,
      name: config.name,
      status: Math.random() > 0.7 ? "busy" : "ready",
      capabilities: ["analysis", "generation", "optimization"],
      model: "qwen2.5-72b-instruct",
      performanceMetrics: {
        successRate: 0.85 + Math.random() * 0.15,
        averageTime: 2 + Math.random() * 8,
        totalTasks: Math.floor(Math.random() * 1000)
      },
      lastActive: new Date(Date.now() - Math.random() * 3600000).toISOString()
    }));
  };
  
  const generateMockWorkflows = (): Workflow[] => {
    const statuses = ["executing", "completed", "paused", "failed"];
    const types = ["code", "analysis", "hybrid"];
    
    return Array.from({ length: 6 }, (_, i) => ({
      id: `wf_${Date.now() - i * 1000000}`,
      name: `Workflow ${(Date.now() - i * 1000000).toString().slice(-8)}`,
      type: types[i % types.length] as any,
      status: statuses[i % statuses.length] as any,
      progress: Math.floor(Math.random() * 100),
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - i * 1800000).toISOString(),
      state: {
        workflowId: `wf_${Date.now() - i * 1000000}`,
        currentPhase: WORKFLOW_PHASES.analysis[Math.floor(Math.random() * WORKFLOW_PHASES.analysis.length)].id,
        analysisType: "data_analysis",
        dataSources: ["database", "api", "files"],
        analysisObjective: "Analyze customer behavior patterns",
        constraints: ["Must complete within 2 hours"],
        businessGoals: ["Improve customer retention"]
      } as AnalysisWorkflowState
    }));
  };
  
  const generateMockAgentPerformance = () => {
    const performance: Record<string, any> = {};
    Object.keys(AGENT_CONFIGS).forEach(agent => {
      performance[agent] = {
        success_rate: 0.85 + Math.random() * 0.15,
        average_time: 2 + Math.random() * 8,
        total_tasks: Math.floor(Math.random() * 1000)
      };
    });
    return performance;
  };
  
  // ===== Effects =====
  
  useEffect(() => {
    connectWebSocket();
    fetchAgents();
    fetchWorkflows();
    fetchMetrics();
    loadSavedConfigs();
    
    // Set up polling
    const interval = setInterval(() => {
      fetchMetrics();
    }, 5000);
    
    return () => {
      clearInterval(interval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);
  
  useEffect(() => {
    if (lmStudioConfig.endpoint) {
      const timeoutId = setTimeout(() => {
        checkLMStudioConnection();
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [lmStudioConfig.endpoint]);
  
  // ===== Render =====
  
  return (
    <div className="h-full w-full flex flex-col text-gray-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI Analysis Hub</h1>
            <p className="text-sm text-gray-600">Multi-Agent System for Data Analysis</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Status Indicators */}
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-lg border border-slate-200">
              {/* Backend Status */}
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-blue-500 rounded-full shadow-sm shadow-blue-500/50"></div>
                    <span className="text-xs font-medium text-gray-700">Backend</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
                    <span className="text-xs font-medium text-slate-400">Backend</span>
                  </div>
                )}
              </div>
              
              <div className="w-px h-4 bg-slate-200"></div>
              
              {/* Active Agents */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">
                  {agents.filter(a => a.status === "busy").length}/{agents.length} Agents
                </span>
              </div>
              
              <div className="w-px h-4 bg-slate-200"></div>
              
              {/* Active Workflows */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">
                  {workflows.filter(w => w.status === "executing").length} Workflows
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1600px] mx-auto">
          {/* Backend Error Alert */}
          {backendError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Backend Connection Error:</strong> {backendError}
                <br />
                <span className="text-sm">
                  Run backend server: <code className="bg-red-100 px-1 rounded">python main.py</code>
                </span>
              </AlertDescription>
            </Alert>
          )}

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="dashboard">
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="workflows" className="relative">
                <GitBranch className="h-4 w-4 mr-2" />
                Workflows
                {workflows.filter(w => w.status === "executing").length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="agents">
                <Bot className="h-4 w-4 mr-2" />
                Agents
              </TabsTrigger>
              <TabsTrigger value="analytics">
                <LineChartIcon className="h-4 w-4 mr-2" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              <Dashboard
                agents={agents}
                workflows={workflows}
                systemMetrics={systemMetrics}
                performanceData={performanceData}
                workflowDistribution={workflowDistribution}
                messages={messages}
                onCreateWorkflow={() => setActiveTab("workflows")}
                onRefreshData={fetchMetrics}
              />
            </TabsContent>

            <TabsContent value="workflows">
              <Workflows
                workflows={workflows}
                activeWorkflow={activeWorkflow}
                WORKFLOW_PHASES={WORKFLOW_PHASES}
                onCreateWorkflow={createWorkflow}
                onSelectWorkflow={setActiveWorkflow}
                onRefreshWorkflows={fetchWorkflows}
              />
            </TabsContent>

            <TabsContent value="agents">
              <Agents
                agents={agents}
                AGENT_CONFIGS={AGENT_CONFIGS}
                onAskAgent={askAgent}
                onRefreshAgents={fetchAgents}
              />
            </TabsContent>

            <TabsContent value="analytics">
              <Analytics
                agents={agents}
                workflows={workflows}
                performanceData={performanceData}
                workflowDistribution={workflowDistribution}
                agentUtilization={agentUtilization}
                realtimeData={realtimeData}
                COLORS={COLORS}
                WORKFLOW_PHASES={WORKFLOW_PHASES}
                plannerLogs={plannerLogs}
                activePlans={activePlans}
              />
            </TabsContent>

            <TabsContent value="settings">
              <SettingsView
                modelConfig={modelConfig}
                lmStudioConfig={lmStudioConfig}
                connectionStatus={connectionStatus}
                availableModels={availableModels}
                savedConfigs={savedConfigs}
                isDarkMode={isDarkMode}
                AGENT_CONFIGS={AGENT_CONFIGS}
                RECOMMENDED_MODELS={RECOMMENDED_MODELS}
                onConfigureModels={configureModels}
                onUpdateModelConfig={setModelConfig}
                onUpdateLMStudioConfig={setLmStudioConfig}
                onCheckConnection={checkLMStudioConnection}
                onToggleDarkMode={setIsDarkMode}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default DataAnalysis;