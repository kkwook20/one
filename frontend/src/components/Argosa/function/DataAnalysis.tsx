import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  AlertCircle,
  Activity,
  Archive,
  BarChart,
  Bot,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Cloud,
  Code,
  Copy,
  Database,
  Download,
  Edit,
  Eye,
  FileCode,
  FileText,
  Filter,
  Flame,
  FolderOpen,
  GitBranch,
  Globe,
  Grid,
  Hash,
  Home,
  Info,
  Layers,
  LayoutDashboard,
  LineChart as LineChartIcon,
  Link,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Mic,
  Monitor,
  Moon,
  MoreHorizontal,
  MoreVertical,
  Network,
  Package,
  PauseCircle,
  PieChart,
  Play,
  PlayCircle,
  Plus,
  Power,
  RefreshCw,
  Repeat,
  Save,
  Search,
  Send,
  Server,
  Settings,
  Share,
  Shield,
  Sparkles,
  Star,
  Sun,
  Target,
  Terminal,
  TrendingUp,
  Unlock,
  Upload,
  User,
  Users,
  Video,
  Wand2,
  Wifi,
  WifiOff,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
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
  ComposedChart,
} from "recharts";
import _ from "lodash";
// ===== Type Definitions =====
// Agent Types
type EnhancedAgentType = 
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

interface Agent {
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
interface WorkflowState {
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

interface AnalysisWorkflowState {
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

interface Workflow {
  id: string;
  name: string;
  type: "code" | "analysis" | "hybrid";
  status: "created" | "executing" | "paused" | "completed" | "failed";
  progress: number;
  createdAt: string;
  updatedAt: string;
  state: WorkflowState | AnalysisWorkflowState;
}

interface Subtask {
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

interface Message {
  id: string;
  type: string;
  from: string;
  to: string;
  content: any;
  timestamp: string;
  priority: "low" | "normal" | "high";
  status: "sent" | "delivered" | "read";
}

interface Question {
  id: string;
  question: string;
  context: any;
  fromAgent: string;
  toAgent: string;
  status: "pending" | "answered";
  answer?: string;
  timestamp: string;
}

interface Decision {
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

interface QualityMetrics {
  complexity: number;
  maintainability: number;
  reliability: number;
  security: number;
  performance: number;
  documentation: number;
}

// Analysis Types
interface AnalysisRequest {
  requestId?: string;
  analysisType: string;
  dataSource?: string;
  parameters: Record<string, any>;
  priority: "low" | "normal" | "high" | "critical";
  objective: string;
  constraints: string[];
}

interface AnalysisResult {
  analysisId: string;
  timestamp: string;
  agentType: EnhancedAgentType;
  resultType: string;
  data: any;
  confidence: number;
  metadata: Record<string, any>;
}

// WebSocket Types
interface WebSocketMessage {
  type: string;
  workflowId?: string;
  data?: any;
  timestamp: string;
}

// Configuration Types
interface AIModelConfig {
  default?: string;
  specialized: Record<EnhancedAgentType, string>;
}

interface SystemMetrics {
  activeWorkflows: number;
  activeTasks: number;
  cachedResults: number;
  websocketConnections: number;
  agentPerformance: Record<string, any>;
}

// Chart Data Types
interface ChartDataPoint {
  name: string;
  value: number;
  category?: string;
  timestamp?: string;
}

interface TimeSeriesData {
  timestamp: string;
  [key: string]: any;
}

// Planner/Reasoner Types
interface PlannerLog {
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

interface StructuredPlan {
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
interface LMStudioConfig {
  endpoint: string;
  model: string;
  temperature: number;
  maxTokens: number;
  lastUsed?: string;
}

// ===== Constants =====

const AGENT_CONFIGS: Record<EnhancedAgentType, { name: string; icon: any; color: string; description: string }> = {
  analyst: { 
    name: "Data Analysis Expert", 
    icon: BarChart, 
    color: "text-blue-600",
    description: "Analyzes data patterns and generates insights"
  },
  predictor: { 
    name: "Prediction Specialist", 
    icon: TrendingUp, 
    color: "text-green-600",
    description: "Forecasts trends and future outcomes"
  },
  optimizer: { 
    name: "Optimization Engine", 
    icon: Zap, 
    color: "text-yellow-600",
    description: "Optimizes processes and resources"
  },
  anomaly_detector: { 
    name: "Anomaly Detector", 
    icon: AlertCircle, 
    color: "text-red-600",
    description: "Identifies unusual patterns and outliers"
  },
  architect: { 
    name: "Software Architect", 
    icon: Layers, 
    color: "text-purple-600",
    description: "Designs system architecture and structure"
  },
  code_analyzer: { 
    name: "Code Analysis Specialist", 
    icon: Search, 
    color: "text-indigo-600",
    description: "Analyzes code quality and patterns"
  },
  code_generator: { 
    name: "Code Generation Specialist", 
    icon: Code, 
    color: "text-pink-600",
    description: "Generates code based on specifications"
  },
  code_reviewer: { 
    name: "Code Review Specialist", 
    icon: Eye, 
    color: "text-orange-600",
    description: "Reviews code for quality and best practices"
  },
  implementer: { 
    name: "Implementation Specialist", 
    icon: Package, 
    color: "text-cyan-600",
    description: "Implements detailed solutions"
  },
  test_designer: { 
    name: "Test Design Specialist", 
    icon: Shield, 
    color: "text-lime-600",
    description: "Designs comprehensive test strategies"
  },
  refactorer: { 
    name: "Refactoring Expert", 
    icon: RefreshCw, 
    color: "text-amber-600",
    description: "Improves code structure and quality"
  },
  integrator: { 
    name: "Integration Specialist", 
    icon: Link, 
    color: "text-teal-600",
    description: "Integrates components and systems"
  },
  strategist: { 
    name: "Strategic Planning Expert", 
    icon: Target, 
    color: "text-rose-600",
    description: "Develops strategic plans and recommendations"
  },
  risk_assessor: { 
    name: "Risk Assessment Expert", 
    icon: Shield, 
    color: "text-stone-600",
    description: "Evaluates and mitigates risks"
  },
  planner: { 
    name: "Task Planning Specialist", 
    icon: Calendar, 
    color: "text-violet-600",
    description: "Plans and organizes tasks efficiently"
  },
  reasoner: { 
    name: "Reasoning Engine", 
    icon: Brain, 
    color: "text-fuchsia-600",
    description: "Provides logical reasoning and analysis"
  },
  decision_maker: { 
    name: "Decision Making Expert", 
    icon: GitBranch, 
    color: "text-emerald-600",
    description: "Makes informed decisions based on data"
  },
  web_searcher: { 
    name: "Web Search Specialist", 
    icon: Globe, 
    color: "text-sky-600",
    description: "Searches and retrieves web information"
  },
  doc_searcher: { 
    name: "Document Search Expert", 
    icon: FileText, 
    color: "text-slate-600",
    description: "Searches internal documents and knowledge"
  },
  coordinator: { 
    name: "Collaboration Coordinator", 
    icon: Users, 
    color: "text-zinc-600",
    description: "Coordinates multi-agent collaboration"
  },
};

const WORKFLOW_PHASES = {
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

const RECOMMENDED_MODELS = {
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

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
  const [selectedView, setSelectedView] = useState<"dashboard" | "workflows" | "agents" | "analytics" | "settings">("dashboard");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false);
  const [showAgentDetails, setShowAgentDetails] = useState(false);
  const [showWorkflowDetails, setShowWorkflowDetails] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showAgentChat, setShowAgentChat] = useState(false);
  const [currentAgentChat, setCurrentAgentChat] = useState<EnhancedAgentType | null>(null);
  
  // Analysis State
  const [analysisType, setAnalysisType] = useState<"data_analysis" | "code" | "hybrid">("data_analysis");
  const [analysisObjective, setAnalysisObjective] = useState("");
  const [dataSources, setDataSources] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [businessGoals, setBusinessGoals] = useState<string[]>([]);
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "critical">("normal");
  
  // Real-time State
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [realtimeData, setRealtimeData] = useState<TimeSeriesData[]>([]);
  const [chatMessages, setChatMessages] = useState<{agent: string; content: string; timestamp: string; role: 'user' | 'agent'}[]>([]);
  const [chatInput, setChatInput] = useState("");
  
  // Configuration State
  const [modelConfig, setModelConfig] = useState<AIModelConfig>({
    default: "qwen2.5-72b-instruct",
    specialized: {} as Record<EnhancedAgentType, string>
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
  const [plannerMode, setPlannerMode] = useState<'analysis' | 'planner'>('analysis');
  const [selectedTask, setSelectedTask] = useState("intent-classification");
  
  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Chart Data
  const [performanceData, setPerformanceData] = useState<ChartDataPoint[]>([]);
  const [workflowDistribution, setWorkflowDistribution] = useState<ChartDataPoint[]>([]);
  const [agentUtilization, setAgentUtilization] = useState<ChartDataPoint[]>([]);
  
  // ===== WebSocket Connection =====
  
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    try {
      const ws = new WebSocket(`ws://localhost:8000/api/argosa/analysis/ws/${Date.now()}`);
      
      ws.onopen = () => {
        setIsConnected(true);
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
      // Use mock data for development
      setAgents(generateMockAgents());
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
        progress: getProgressFromPhase(wf.type, wf.current_phase),
        createdAt: new Date(parseFloat(wf.created_at) * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
        state: wf,
      }));
      
      setWorkflows(workflowList);
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
      // Use mock data for development
      setWorkflows(generateMockWorkflows());
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
      // Use mock data for development
      const mockMetrics = {
        activeWorkflows: workflows.length,
        activeTasks: agents.filter(a => a.status === "busy").length,
        cachedResults: 42,
        websocketConnections: isConnected ? 1 : 0,
        agentPerformance: generateMockAgentPerformance()
      };
      setSystemMetrics(mockMetrics);
      updateChartData(mockMetrics);
    }
  };
  
  const createWorkflow = async () => {
    const request: AnalysisRequest = {
      analysisType,
      objective: analysisObjective,
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
    };
    
    try {
      const response = await fetch("/api/argosa/analysis/workflow/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      
      const data = await response.json();
      
      // Execute workflow
      await fetch(`/api/argosa/analysis/workflow/${data.workflow_id}/execute`, {
        method: "POST",
      });
      
      // Refresh workflows
      await fetchWorkflows();
      setShowCreateWorkflow(false);
      resetForm();
    } catch (error) {
      console.error("Failed to create workflow:", error);
      // Add mock workflow for development
      const mockWorkflow: Workflow = {
        id: `wf_${Date.now()}`,
        name: `Workflow ${Date.now().toString().slice(-8)}`,
        type: analysisType === "code" ? "code" : "analysis",
        status: "executing",
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        state: {
          workflowId: `wf_${Date.now()}`,
          analysisType,
          currentPhase: "initialized",
          dataSources,
          analysisObjective,
          constraints,
          businessGoals,
        } as AnalysisWorkflowState
      };
      setWorkflows(prev => [...prev, mockWorkflow]);
      setShowCreateWorkflow(false);
      resetForm();
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
      // Return mock response for development
      return {
        answer: `This is a mock response from ${agentType} agent for: ${question}`,
        confidence: 0.95,
        sources: ["internal knowledge base", "analysis results"],
      };
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
  
  const resetForm = () => {
    setAnalysisObjective("");
    setDataSources([]);
    setConstraints([]);
    setBusinessGoals([]);
    setPriority("normal");
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
  
  const getAgentIcon = (type: EnhancedAgentType) => {
    const config = AGENT_CONFIGS[type];
    return config?.icon || Bot;
  };
  
  const getAgentColor = (type: EnhancedAgentType) => {
    const config = AGENT_CONFIGS[type];
    return config?.color || "text-gray-600";
  };
  
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };
  
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };
  
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !currentAgentChat) return;
    
    // Add user message
    const userMessage = {
      agent: "user",
      content: chatInput,
      timestamp: new Date().toISOString(),
      role: "user" as const
    };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    
    // Get agent response
    const response = await askAgent(currentAgentChat, chatInput);
    
    // Add agent response
    const agentMessage = {
      agent: currentAgentChat,
      content: typeof response === 'string' ? response : response.answer || JSON.stringify(response),
      timestamp: new Date().toISOString(),
      role: "agent" as const
    };
    setChatMessages(prev => [...prev, agentMessage]);
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
  
  // ===== Render Functions =====
  
  const renderDashboard = () => (
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
              onClick={() => setShowCreateWorkflow(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Workflow
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                setSelectedView("agents");
                setShowAgentChat(true);
              }}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Chat with Agent
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => fetchMetrics()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Data
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setSelectedView("analytics")}
            >
              <BarChart className="mr-2 h-4 w-4" />
              View Analytics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
  
  const renderWorkflows = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Workflows</h2>
        <Button onClick={() => setShowCreateWorkflow(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Workflow
        </Button>
      </div>
      
      {/* Workflow filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="cursor-pointer">All</Badge>
            <Badge variant="outline" className="cursor-pointer">Executing</Badge>
            <Badge variant="outline" className="cursor-pointer">Completed</Badge>
            <Badge variant="outline" className="cursor-pointer">Failed</Badge>
            <Badge variant="outline" className="cursor-pointer">Code</Badge>
            <Badge variant="outline" className="cursor-pointer">Analysis</Badge>
          </div>
        </CardContent>
      </Card>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workflows.map((workflow) => (
          <Card 
            key={workflow.id} 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => {
              setActiveWorkflow(workflow);
              setShowWorkflowDetails(true);
            }}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{workflow.name}</CardTitle>
                <Badge variant={
                  workflow.status === "completed" ? "default" :
                  workflow.status === "failed" ? "destructive" :
                  workflow.status === "paused" ? "secondary" :
                  "outline"
                }>
                  {workflow.status}
                </Badge>
              </div>
              <CardDescription>{workflow.type} workflow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Progress</span>
                    <span>{workflow.progress}%</span>
                  </div>
                  <Progress value={workflow.progress} className="mt-1" />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Created</span>
                  <span>{new Date(workflow.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Phase</span>
                  <span className="font-medium">
                    {(workflow.state as any).currentPhase || "Unknown"}
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <div className="flex w-full gap-2">
                {workflow.status === "executing" && (
                  <Button variant="outline" size="sm" className="flex-1">
                    <PauseCircle className="mr-2 h-4 w-4" />
                    Pause
                  </Button>
                )}
                {workflow.status === "paused" && (
                  <Button variant="outline" size="sm" className="flex-1">
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Resume
                  </Button>
                )}
                <Button variant="outline" size="sm" className="flex-1">
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
  
  const renderAgents = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">AI Agents</h2>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-xs">
            {agents.filter(a => a.status === "ready").length} Ready
          </Badge>
          <Badge variant="outline" className="text-xs">
            {agents.filter(a => a.status === "busy").length} Busy
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAgentChat(true)}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Chat with Agent
          </Button>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const AgentIcon = getAgentIcon(agent.type);
          return (
            <Card 
              key={agent.type}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => {
                setSelectedAgent(agent);
                setShowAgentDetails(true);
              }}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`rounded-full p-2 bg-gray-100 ${getAgentColor(agent.type)}`}>
                      <AgentIcon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                  </div>
                  <Badge variant={
                    agent.status === "ready" ? "default" :
                    agent.status === "busy" ? "secondary" :
                    agent.status === "error" ? "destructive" :
                    "outline"
                  }>
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {AGENT_CONFIGS[agent.type].description}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Success Rate</span>
                      <span className="font-medium">{(agent.performanceMetrics.successRate * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={agent.performanceMetrics.successRate * 100} />
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Tasks Completed</span>
                    <span>{agent.performanceMetrics.totalTasks}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Avg Response Time</span>
                    <span>{formatDuration(agent.performanceMetrics.averageTime)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Model</span>
                    <span className="font-mono text-xs">{agent.model || "Default"}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentAgentChat(agent.type);
                    setShowAgentChat(true);
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Chat
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
  
  const renderAnalytics = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
      
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="utilization">Utilization</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="costs">Cost Analysis</TabsTrigger>
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
      </Tabs>
    </div>
  );
  
  const renderSettings = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
      
      <Tabs defaultValue="models" className="space-y-4">
        <TabsList>
          <TabsTrigger value="models">AI Models</TabsTrigger>
          <TabsTrigger value="lmstudio">LM Studio</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>
        
        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Default Model</CardTitle>
              <CardDescription>Model used for agents without specific configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="default-model">Default Model</Label>
                <Select
                  value={modelConfig.default}
                  onValueChange={(value) => setModelConfig(prev => ({ ...prev, default: value }))}
                >
                  <SelectTrigger id="default-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qwen2.5-72b-instruct">Qwen2.5 72B Instruct</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
                    <SelectItem value="deepseek-v2">DeepSeek V2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button onClick={() => configureModels(modelConfig)}>
                Save Configuration
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Agent-Specific Models</CardTitle>
              <CardDescription>Configure models for specific agent types</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {Object.entries(AGENT_CONFIGS).map(([agentType, config]) => (
                    <div key={agentType} className="space-y-2 pb-4 border-b last:border-0">
                      <Label className="flex items-center space-x-2">
                        <config.icon className={`h-4 w-4 ${config.color}`} />
                        <span>{config.name}</span>
                      </Label>
                      <Select
                        value={modelConfig.specialized[agentType as EnhancedAgentType] || "default"}
                        onValueChange={(value) => 
                          setModelConfig(prev => ({
                            ...prev,
                            specialized: {
                              ...prev.specialized,
                              [agentType]: value === "default" ? undefined : value
                            }
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Use Default</SelectItem>
                          <SelectItem value="qwen2.5-72b-instruct">Qwen2.5 72B</SelectItem>
                          <SelectItem value="deepseek-coder-33b">DeepSeek Coder 33B</SelectItem>
                          <SelectItem value="wizardcoder-33b">WizardCoder 33B</SelectItem>
                          <SelectItem value="llama-3.1-70b">Llama 3.1 70B</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="lmstudio" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="w-5 h-5" />
                LM Studio Configuration
              </CardTitle>
              <CardDescription>
                Configure your local LM Studio connection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="endpoint">API Endpoint</Label>
                  <Input
                    id="endpoint"
                    value={lmStudioConfig.endpoint}
                    onChange={(e) => {
                      const newConfig = { ...lmStudioConfig, endpoint: e.target.value };
                      setLmStudioConfig(newConfig);
                    }}
                    onBlur={saveConfig}
                    placeholder="http://localhost:1234/v1/chat/completions"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model Selection</Label>
                  {availableModels.length > 0 ? (
                    <Select 
                      value={lmStudioConfig.model} 
                      onValueChange={(value) => {
                        const newConfig = { ...lmStudioConfig, model: value };
                        setLmStudioConfig(newConfig);
                        saveConfig();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="model"
                      value={lmStudioConfig.model}
                      onChange={(e) => {
                        const newConfig = { ...lmStudioConfig, model: e.target.value };
                        setLmStudioConfig(newConfig);
                      }}
                      onBlur={saveConfig}
                      placeholder="Model name (connect to see available models)"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature: {lmStudioConfig.temperature}</Label>
                  <Slider
                    id="temperature"
                    min={0}
                    max={1}
                    step={0.1}
                    value={[lmStudioConfig.temperature]}
                    onValueChange={(value) => {
                      const newConfig = { ...lmStudioConfig, temperature: value[0] };
                      setLmStudioConfig(newConfig);
                    }}
                    onValueCommit={saveConfig}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxTokens">Max Tokens</Label>
                  <Input
                    id="maxTokens"
                    type="number"
                    value={lmStudioConfig.maxTokens}
                    onChange={(e) => {
                      const newConfig = { ...lmStudioConfig, maxTokens: parseInt(e.target.value) };
                      setLmStudioConfig(newConfig);
                    }}
                    onBlur={saveConfig}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      connectionStatus === "connected" ? "bg-green-500" : 
                      connectionStatus === "checking" ? "bg-yellow-500 animate-pulse" : 
                      "bg-red-500"
                    }`} />
                    <span className="text-sm">
                      {connectionStatus === "connected" ? "Connected" : 
                       connectionStatus === "checking" ? "Checking..." : 
                       "Disconnected"}
                    </span>
                  </div>
                  {availableModels.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {availableModels.length} models available
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    <Archive className="w-3 h-3 mr-1" />
                    Auto-saved
                  </Badge>
                  <Button onClick={checkLMStudioConnection} size="sm">
                    <Zap className="w-4 h-4 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {Object.keys(savedConfigs).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(savedConfigs).slice(0, 3).map(([key, config]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 rounded border hover:bg-accent cursor-pointer"
                      onClick={() => {
                        setLmStudioConfig(config);
                        checkLMStudioConnection();
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        <span className="text-sm font-mono">{config.model}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {config.endpoint.replace('http://', '')}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Toggle dark mode theme</p>
                </div>
                <Switch checked={isDarkMode} onCheckedChange={setIsDarkMode} />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-refresh</Label>
                  <p className="text-sm text-muted-foreground">Automatically refresh data</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Debug Mode</Label>
                  <p className="text-sm text-muted-foreground">Show detailed logs and metrics</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
  
  // ===== Advanced Analytics Functions =====
  
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
    
    // Resource insights
    if (systemMetrics && systemMetrics.activeTasks > agents.length * 0.8) {
      insights.push({
        type: 'info',
        category: 'resources',
        message: 'System is running at high capacity. Consider scaling resources.',
        action: 'Add more agent instances or optimize task distribution'
      });
    }
    
    return insights;
  };
  
  // ===== Advanced Render Functions =====
  
  const renderAdvancedAnalytics = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Predictive Analytics</CardTitle>
          <CardDescription>AI-powered predictions and forecasts</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="completion">
            <TabsList>
              <TabsTrigger value="completion">Completion Forecast</TabsTrigger>
              <TabsTrigger value="resource">Resource Prediction</TabsTrigger>
              <TabsTrigger value="anomaly">Anomaly Detection</TabsTrigger>
            </TabsList>
            
            <TabsContent value="completion" className="space-y-4">
              <div className="space-y-4">
                {workflows.filter(w => w.status === "executing").map(workflow => {
                  const prediction = predictWorkflowCompletion(workflow);
                  return (
                    <Card key={workflow.id}>
                      <CardHeader>
                        <CardTitle className="text-base">{workflow.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 md:grid-cols-3">
                          <div>
                            <p className="text-sm text-muted-foreground">Current Progress</p>
                            <p className="text-2xl font-bold">{workflow.progress}%</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Estimated Completion</p>
                            <p className="text-lg font-medium">
                              {prediction.estimatedCompletion.toLocaleTimeString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Confidence</p>
                            <Progress value={prediction.confidence * 100} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
            
            <TabsContent value="resource" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resource Usage Forecast</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={generateResourceForecast()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="cpu" stroke="#3b82f6" name="CPU %" />
                      <Line type="monotone" dataKey="memory" stroke="#10b981" name="Memory %" />
                      <Line type="monotone" dataKey="gpu" stroke="#f59e0b" name="GPU %" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="anomaly" className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Anomaly Detection Active</AlertTitle>
                <AlertDescription>
                  Monitoring system behavior for unusual patterns
                </AlertDescription>
              </Alert>
              
              <div className="space-y-2">
                {generateAnomalies().map((anomaly, idx) => (
                  <Card key={idx}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{anomaly.title}</p>
                          <p className="text-sm text-muted-foreground">{anomaly.description}</p>
                        </div>
                        <Badge variant={
                          anomaly.severity === 'high' ? 'destructive' :
                          anomaly.severity === 'medium' ? 'default' :
                          'secondary'
                        }>
                          {anomaly.severity}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
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
    </div>
  );
  
  const renderInsightsDashboard = () => {
    const insights = generateInsights();
    const bottlenecks = analyzeWorkflowBottlenecks();
    
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Insights</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{insights.length}</div>
              <p className="text-xs text-muted-foreground">
                {insights.filter(i => i.type === 'alert').length} require attention
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bottlenecks</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{bottlenecks.length}</div>
              <p className="text-xs text-muted-foreground">
                {bottlenecks.filter(b => b.severity === 'high').length} critical
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
              {insights.map((insight, idx) => (
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
            <CardTitle>Workflow Bottlenecks</CardTitle>
            <CardDescription>Identify and resolve performance issues</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {bottlenecks.map((bottleneck, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{bottleneck.workflow}</p>
                    <p className="text-sm text-muted-foreground">
                      Stuck in {bottleneck.phase} for {bottleneck.timeInPhase.toFixed(0)} minutes
                    </p>
                  </div>
                  <Badge variant={
                    bottleneck.severity === 'high' ? 'destructive' :
                    bottleneck.severity === 'medium' ? 'default' :
                    'secondary'
                  }>
                    {bottleneck.severity} priority
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };
  
  const renderPlannerDashboard = () => (
    <div className="space-y-6">
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
    </div>
  );
  
  const renderAdvancedSettings = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Advanced Model Configuration</CardTitle>
          <CardDescription>Fine-tune AI models for specific tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="task-specific">
            <TabsList>
              <TabsTrigger value="task-specific">Task-Specific Models</TabsTrigger>
              <TabsTrigger value="performance">Performance Tuning</TabsTrigger>
              <TabsTrigger value="fallback">Fallback Strategy</TabsTrigger>
            </TabsList>
            
            <TabsContent value="task-specific" className="space-y-4">
              <div className="space-y-4">
                {Object.entries(RECOMMENDED_MODELS).map(([task, models]) => (
                  <Card key={task}>
                    <CardHeader>
                      <CardTitle className="text-base capitalize">{task.replace('-', ' ')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <RadioGroup defaultValue={models[0]}>
                        {models.map((model) => (
                          <div key={model} className="flex items-center justify-between py-2">
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value={model} id={model} />
                              <Label htmlFor={model} className="font-mono text-sm">
                                {model}
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {Math.floor(Math.random() * 50 + 50)}ms
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => window.open(`https://huggingface.co/${model}`, '_blank')}
                              >
                                <Globe className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </RadioGroup>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="performance" className="space-y-4">
              <div className="space-y-6">
                <div>
                  <Label>Response Time Threshold (ms)</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Slider
                      defaultValue={[5000]}
                      max={10000}
                      step={500}
                      className="flex-1"
                    />
                    <span className="w-20 text-sm text-muted-foreground">5000ms</span>
                  </div>
                </div>
                
                <div>
                  <Label>Max Concurrent Requests</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Slider
                      defaultValue={[10]}
                      max={50}
                      step={1}
                      className="flex-1"
                    />
                    <span className="w-20 text-sm text-muted-foreground">10</span>
                  </div>
                </div>
                
                <div>
                  <Label>Cache Duration (minutes)</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Slider
                      defaultValue={[60]}
                      max={1440}
                      step={15}
                      className="flex-1"
                    />
                    <span className="w-20 text-sm text-muted-foreground">60 min</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Label>Performance Optimizations</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch defaultChecked id="batch-processing" />
                      <Label htmlFor="batch-processing">Enable batch processing</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch defaultChecked id="response-streaming" />
                      <Label htmlFor="response-streaming">Enable response streaming</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch id="gpu-acceleration" />
                      <Label htmlFor="gpu-acceleration">Enable GPU acceleration</Label>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="fallback" className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Fallback Strategy</AlertTitle>
                <AlertDescription>
                  Configure backup models and error handling when primary models fail
                </AlertDescription>
              </Alert>
              
              <div className="space-y-4">
                <div>
                  <Label>Primary Failure Action</Label>
                  <Select defaultValue="fallback">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fallback">Switch to fallback model</SelectItem>
                      <SelectItem value="retry">Retry with backoff</SelectItem>
                      <SelectItem value="queue">Queue for later</SelectItem>
                      <SelectItem value="fail">Fail immediately</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Fallback Model Priority</Label>
                  <div className="space-y-2 mt-2">
                    {['gpt-4-turbo', 'claude-3-opus', 'gemini-pro', 'local-llama'].map((model, idx) => (
                      <div key={model} className="flex items-center justify-between p-2 border rounded">
                        <span className="font-mono text-sm">{model}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            Priority {idx + 1}
                          </Badge>
                          <Button size="sm" variant="ghost">
                            <ChevronUp className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost">
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
  
  const renderWorkflowBuilder = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Visual Workflow Builder</CardTitle>
          <CardDescription>Design complex workflows with drag-and-drop</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 min-h-[400px]">
            <div className="text-center text-muted-foreground">
              <Network className="w-12 h-12 mx-auto mb-4" />
              <p>Drag agents and components here to build your workflow</p>
            </div>
          </div>
          
          <div className="mt-6">
            <Label>Available Components</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {Object.entries(AGENT_CONFIGS).slice(0, 8).map(([type, config]) => (
                <div
                  key={type}
                  className="p-3 border rounded-lg cursor-move hover:shadow-md transition-shadow"
                  draggable
                >
                  <config.icon className={`w-6 h-6 ${config.color} mb-2`} />
                  <p className="text-xs font-medium">{config.name}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
  
  // Helper functions for advanced features
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
    <TooltipProvider>
      <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
        <div className="flex h-screen bg-background">
          {/* Sidebar */}
          <div className="w-64 border-r bg-card">
            <div className="flex h-full flex-col">
              <div className="p-6">
                <h1 className="text-2xl font-bold tracking-tight">AI Analysis Hub</h1>
                <p className="text-sm text-muted-foreground mt-1">Multi-Agent System</p>
              </div>
              
              <nav className="flex-1 space-y-1 px-3">
                <Button
                  variant={selectedView === "dashboard" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("dashboard")}
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
                
                <Button
                  variant={selectedView === "workflows" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("workflows")}
                >
                  <GitBranch className="mr-2 h-4 w-4" />
                  Workflows
                  {workflows.filter(w => w.status === "executing").length > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {workflows.filter(w => w.status === "executing").length}
                    </Badge>
                  )}
                </Button>
                
                <Button
                  variant={selectedView === "agents" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("agents")}
                >
                  <Bot className="mr-2 h-4 w-4" />
                  Agents
                  {agents.filter(a => a.status === "busy").length > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {agents.filter(a => a.status === "busy").length}
                    </Badge>
                  )}
                </Button>
                
                <Button
                  variant={selectedView === "analytics" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("analytics")}
                >
                  <LineChartIcon className="mr-2 h-4 w-4" />
                  Analytics
                </Button>
                
                <Button
                  variant={selectedView === "settings" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("settings")}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </nav>
              
              <div className="p-3">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-sm font-medium">
                        {isConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      <div>Active Sessions: {systemMetrics?.websocketConnections || 0}</div>
                      <div>Cached Results: {systemMetrics?.cachedResults || 0}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
          
          {/* Main Content */}
          <div className="flex-1 overflow-auto">
            <div className="p-8">
              {selectedView === "dashboard" && renderDashboard()}
              {selectedView === "workflows" && renderWorkflows()}
              {selectedView === "agents" && renderAgents()}
              {selectedView === "analytics" && renderAnalytics()}
              {selectedView === "settings" && renderSettings()}
            </div>
          </div>
        </div>
        
        {/* Create Workflow Dialog */}
        <Dialog open={showCreateWorkflow} onOpenChange={setShowCreateWorkflow}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Workflow</DialogTitle>
              <DialogDescription>
                Configure a new analysis or code generation workflow
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Workflow Type</Label>
                <Select value={analysisType} onValueChange={(value: any) => setAnalysisType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="data_analysis">Data Analysis</SelectItem>
                    <SelectItem value="code">Code Generation</SelectItem>
                    <SelectItem value="hybrid">Hybrid (Analysis + Code)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Objective</Label>
                <Textarea
                  placeholder="Describe what you want to achieve..."
                  value={analysisObjective}
                  onChange={(e) => setAnalysisObjective(e.target.value)}
                  rows={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Data Sources</Label>
                <div className="space-y-2">
                  {dataSources.map((source, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        value={source}
                        onChange={(e) => {
                          const newSources = [...dataSources];
                          newSources[index] = e.target.value;
                          setDataSources(newSources);
                        }}
                        placeholder="Enter data source..."
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDataSources(dataSources.filter((_, i) => i !== index))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDataSources([...dataSources, ""])}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Data Source
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Constraints</Label>
                <div className="space-y-2">
                  {constraints.map((constraint, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        value={constraint}
                        onChange={(e) => {
                          const newConstraints = [...constraints];
                          newConstraints[index] = e.target.value;
                          setConstraints(newConstraints);
                        }}
                        placeholder="Enter constraint..."
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConstraints(constraints.filter((_, i) => i !== index))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConstraints([...constraints, ""])}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Constraint
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(value: any) => setPriority(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateWorkflow(false)}>
                Cancel
              </Button>
              <Button onClick={createWorkflow} disabled={!analysisObjective}>
                Create Workflow
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Agent Details Dialog */}
        <Dialog open={showAgentDetails} onOpenChange={setShowAgentDetails}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            {selectedAgent && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center space-x-3">
                    <div className={`rounded-full p-2 bg-gray-100 ${getAgentColor(selectedAgent.type)}`}>
                      {React.createElement(getAgentIcon(selectedAgent.type), { className: "h-6 w-6" })}
                    </div>
                    <span>{selectedAgent.name}</span>
                  </DialogTitle>
                  <DialogDescription>
                    {AGENT_CONFIGS[selectedAgent.type].description}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 py-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Status</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Badge variant={
                          selectedAgent.status === "ready" ? "default" :
                          selectedAgent.status === "busy" ? "secondary" :
                          "destructive"
                        }>
                          {selectedAgent.status}
                        </Badge>
                        {selectedAgent.currentTask && (
                          <p className="text-sm text-muted-foreground mt-2">
                            Current task: {selectedAgent.currentTask}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Model</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="font-mono text-sm">{selectedAgent.model || "Default"}</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Performance Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm">Success Rate</span>
                          <span className="text-sm font-medium">
                            {(selectedAgent.performanceMetrics.successRate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <Progress value={selectedAgent.performanceMetrics.successRate * 100} />
                      </div>
                      
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Tasks</p>
                          <p className="text-2xl font-bold">{selectedAgent.performanceMetrics.totalTasks}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Avg Response Time</p>
                          <p className="text-2xl font-bold">{formatDuration(selectedAgent.performanceMetrics.averageTime)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Last Active</p>
                          <p className="text-sm font-medium">
                            {selectedAgent.lastActive ? formatTimestamp(selectedAgent.lastActive) : "Never"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Capabilities</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {selectedAgent.capabilities.map((capability) => (
                          <Badge key={capability} variant="outline">
                            {capability}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => {
                          setCurrentAgentChat(selectedAgent.type);
                          setShowAgentChat(true);
                          setShowAgentDetails(false);
                        }}
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Chat with Agent
                      </Button>
                      <Button className="w-full" variant="outline">
                        <Play className="mr-2 h-4 w-4" />
                        Run Test Task
                      </Button>
                      <Button className="w-full" variant="outline">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reset Agent
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
        
        {/* Workflow Details Sheet */}
        <Sheet open={showWorkflowDetails} onOpenChange={setShowWorkflowDetails}>
          <SheetContent className="w-[600px] sm:max-w-[600px]">
            {activeWorkflow && (
              <>
                <SheetHeader>
                  <SheetTitle>{activeWorkflow.name}</SheetTitle>
                  <SheetDescription>
                    {activeWorkflow.type} workflow • Created {formatTimestamp(activeWorkflow.createdAt)}
                  </SheetDescription>
                </SheetHeader>
                
                <div className="mt-6 space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Progress</span>
                      <span className="text-sm text-muted-foreground">{activeWorkflow.progress}%</span>
                    </div>
                    <Progress value={activeWorkflow.progress} className="h-2" />
                  </div>
                  
                  <div>
                    <h3 className="font-medium mb-3">Workflow Phases</h3>
                    <div className="space-y-2">
                      {(activeWorkflow.type === "code" ? WORKFLOW_PHASES.code : WORKFLOW_PHASES.analysis).map((phase) => {
                        const currentPhase = (activeWorkflow.state as any).currentPhase;
                        const isCompleted = phase.progress < activeWorkflow.progress;
                        const isCurrent = phase.id === currentPhase;
                        
                        return (
                          <div
                            key={phase.id}
                            className={`flex items-center space-x-3 p-3 rounded-lg ${
                              isCurrent ? 'bg-primary/10 border border-primary' :
                              isCompleted ? 'bg-muted' : ''
                            }`}
                          >
                            <div className={`rounded-full p-1 ${
                              isCompleted ? 'bg-green-500' :
                              isCurrent ? 'bg-primary' :
                              'bg-gray-300'
                            }`}>
                              {isCompleted ? (
                                <CheckCircle2 className="h-4 w-4 text-white" />
                              ) : isCurrent ? (
                                <Loader2 className="h-4 w-4 text-white animate-spin" />
                              ) : (
                                <div className="h-4 w-4" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium">{phase.name}</p>
                              {isCurrent && (
                                <p className="text-xs text-muted-foreground">In progress...</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {activeWorkflow.type === "code" && (activeWorkflow.state as WorkflowState).subtasks && (
                    <div>
                      <h3 className="font-medium mb-3">Subtasks</h3>
                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {(activeWorkflow.state as WorkflowState).subtasks.map((subtask) => (
                            <div key={subtask.id} className="flex items-center justify-between p-2 rounded border">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{subtask.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {subtask.type} • {subtask.priority} priority
                                </p>
                              </div>
                              <Badge variant={
                                subtask.status === "completed" ? "default" :
                                subtask.status === "in_progress" ? "secondary" :
                                "outline"
                              }>
                                {subtask.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Button className="w-full" variant="outline">
                      <Eye className="mr-2 h-4 w-4" />
                      View Full Details
                    </Button>
                    <Button className="w-full" variant="outline">
                      <Download className="mr-2 h-4 w-4" />
                      Export Results
                    </Button>
                    {activeWorkflow.status === "executing" && (
                      <Button className="w-full" variant="outline">
                        <PauseCircle className="mr-2 h-4 w-4" />
                        Pause Workflow
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
        
        {/* Agent Chat Dialog */}
        <Dialog open={showAgentChat} onOpenChange={setShowAgentChat}>
          <DialogContent className="max-w-2xl h-[600px] flex flex-col">
            <DialogHeader>
              <DialogTitle>Chat with AI Agent</DialogTitle>
              <DialogDescription>
                Select an agent and start a conversation
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 flex flex-col space-y-4">
              <div>
                <Label>Select Agent</Label>
                <Select
                  value={currentAgentChat || ""}
                  onValueChange={(value) => setCurrentAgentChat(value as EnhancedAgentType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => {
                      const AgentIcon = getAgentIcon(agent.type);
                      return (
                        <SelectItem key={agent.type} value={agent.type}>
                          <div className="flex items-center space-x-2">
                            <AgentIcon className={`h-4 w-4 ${getAgentColor(agent.type)}`} />
                            <span>{agent.name}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              
              <ScrollArea className="flex-1 border rounded-lg p-4">
                <div className="space-y-4">
                  {chatMessages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] p-3 rounded-lg ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              <div className="flex space-x-2">
                <Input
                  placeholder="Type your message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                />
                <Button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || !currentAgentChat}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default DataAnalysis;