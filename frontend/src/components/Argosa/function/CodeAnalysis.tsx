// frontend/src/components/Argosa/function/CodeAnalysis.tsx
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
import { Badge, type BadgeProps } from "@/components/ui/badge";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertCircle,
  Activity,
  Archive,
  ArrowRight,
  BarChart,
  Bot,
  Brain,
  Bug,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Cloud,
  Code,
  Code2,
  Copy,
  Database,
  Download,
  Edit,
  Eye,
  FileCode,
  FileCode2,
  FileSearch,
  FileText,
  Filter,
  Flame,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitCommit,
  GitCompare,
  GitMerge,
  GitPullRequest,
  Globe,
  Grid,
  Hash,
  Home,
  Info,
  Layers,
  LayoutDashboard,
  Library,
  LineChart,
  Link,
  Link2,
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
  Palette,
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
  Settings2,
  Share,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Target,
  Terminal,
  TestTube,
  Trash2,
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
import _ from "lodash";

// ===== Type Definitions =====

// Code Entity Types
interface CodeEntity {
  id: string;
  entityType: "function" | "class" | "method" | "variable" | "import" | "constant";
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  parentId?: string;
  signature?: string;
  docstring?: string;
  decorators?: string[];
  typeHints?: Record<string, string>;
  calls?: string[];
  calledBy?: string[];
  imports?: string[];
  importedBy?: string[];
  complexity: number;
  lineCount: number;
  testCoverage: number;
  lastModified?: string;
  author?: string;
  tags?: string[];
}

// Architecture Pattern Types
interface ArchitecturePattern {
  patternName: string;
  patternType: "mvc" | "repository" | "factory" | "singleton" | "observer" | "strategy" | "decorator";
  components: Array<{
    name: string;
    type: string;
    responsibility: string;
    relationships: string[];
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: "uses" | "implements" | "extends" | "depends";
  }>;
  constraints: string[];
  benefits: string[];
  drawbacks: string[];
  whenToUse: string;
  implementationGuide: Record<string, any>;
}

// Code Generation Types
interface CodeGenerationPlan {
  planId: string;
  objective: string;
  scope: "file" | "module" | "system";
  phases: Array<{
    phaseId: string;
    name: string;
    description: string;
    dependencies: string[];
    tasks: Array<{
      taskId: string;
      type: string;
      target: string;
      description: string;
      estimatedLines: number;
      complexity: "low" | "medium" | "high";
    }>;
  }>;
  architectureDecisions: Record<string, any>;
  fileStructure: {
    newFiles: Array<{
      path: string;
      purpose: string;
      template: string;
    }>;
    modifiedFiles: Array<{
      path: string;
      changes: string[];
    }>;
    directoryStructure: Record<string, any>;
  };
  implementationDetails: Record<string, any>;
  qualityTargets: {
    testCoverage: number;
    maxComplexity: number;
    documentationCoverage: number;
    performanceTargets: Record<string, any>;
  };
  risks: Array<{
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    mitigation: string;
  }>;
  mitigationStrategies: Record<string, any>;
}

interface CodeFragment {
  fragmentId: string;
  fragmentType: "function" | "class" | "module" | "test" | "config";
  content: string;
  language: string;
  context: Record<string, any>;
  dependencies: string[];
  integrationPoints: Array<{
    type: string;
    location: string;
    description: string;
  }>;
  validationStatus: "pending" | "passed" | "failed";
  validationResults: Record<string, any>;
  createdBy: string;
  createdAt: string;
  iteration: number;
  parentFragmentId?: string;
}

// Analysis Types
interface ProjectAnalysis {
  timestamp: string;
  rootPath: string;
  statistics: {
    files: {
      totalFiles: number;
      pythonFiles: number;
      testFiles: number;
      configFiles: number;
      totalLines: number;
      codeLines: number;
      commentLines: number;
      blankLines: number;
    };
    entities: {
      totalEntities: number;
      functions: number;
      classes: number;
      methods: number;
      asyncFunctions: number;
    };
  };
  architecture: {
    patterns: string[];
    recommendations: string[];
  };
  qualityMetrics: {
    averageComplexity: number;
    highComplexityFunctions: Array<{
      name: string;
      file: string;
      complexity: number;
    }>;
    documentationCoverage: number;
    testCoverageEstimate: number;
    codeDuplication: any[];
    codeSmells: Array<{
      type: string;
      entity: string;
      file: string;
      details: any;
    }>;
  };
  patternsDetected: string[];
  improvementOpportunities: Array<{
    type: string;
    priority: "low" | "medium" | "high";
    description: string;
    targets?: any[];
  }>;
  dependencyAnalysis: {
    totalNodes: number;
    totalEdges: number;
    stronglyConnectedComponents: any[];
    cycles: any[];
    mostDependent: Array<{
      entity: string;
      file: string;
      dependencies: number;
    }>;
    mostDependedUpon: Array<{
      entity: string;
      file: string;
      dependedBy: number;
    }>;
  };
  complexityAnalysis: Record<string, any>;
  testCoverageAnalysis: Record<string, any>;
}

// Collaboration Types
interface CollaborationSession {
  sessionId: string;
  participants: Record<string, {
    status: "connected" | "disconnected";
    lastActive?: string;
  }>;
  objective: string;
  currentTask?: any;
  messageHistory: Array<{
    type: string;
    from: string;
    content: any;
    timestamp: string;
  }>;
  codeVersions: Array<{
    versionId: string;
    timestamp: string;
    changes: any;
  }>;
  decisions: Array<{
    type: string;
    description: string;
    madeBy: string;
    timestamp: string;
  }>;
}

// File System Types
interface FileNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  language?: string;
  size?: number;
  lastModified?: string;
  selected?: boolean;
  expanded?: boolean;
  analysis?: {
    entities?: CodeEntity[];
    complexity?: number;
    issues?: number;
  };
}

// Validation Types
interface ValidationResult {
  valid: boolean;
  issues: Array<{
    type: string;
    severity: "error" | "warning" | "info";
    message: string;
    line?: number;
    column?: number;
    fix?: string;
  }>;
  metrics?: {
    complexity?: number;
    maintainability?: number;
    testCoverage?: number;
  };
}

// WebSocket Types
interface WebSocketMessage {
  type: string;
  sessionId?: string;
  data?: any;
  timestamp: string;
}

// ===== Constants =====

const ARCHITECTURE_PATTERNS: Record<string, {
  name: string;
  icon: any;
  color: string;
  description: string;
}> = {
  mvc: {
    name: "Model-View-Controller",
    icon: Layers,
    color: "text-blue-600",
    description: "Separates application logic into three interconnected components"
  },
  repository: {
    name: "Repository Pattern",
    icon: Database,
    color: "text-green-600",
    description: "Encapsulates data access logic and provides abstraction"
  },
  factory: {
    name: "Factory Pattern",
    icon: Package,
    color: "text-purple-600",
    description: "Creates objects without specifying their exact classes"
  },
  singleton: {
    name: "Singleton Pattern",
    icon: Lock,
    color: "text-orange-600",
    description: "Ensures a class has only one instance"
  },
  observer: {
    name: "Observer Pattern",
    icon: Eye,
    color: "text-pink-600",
    description: "Defines one-to-many dependency between objects"
  },
  strategy: {
    name: "Strategy Pattern",
    icon: GitBranch,
    color: "text-cyan-600",
    description: "Defines a family of algorithms and makes them interchangeable"
  },
  decorator: {
    name: "Decorator Pattern",
    icon: Palette,
    color: "text-indigo-600",
    description: "Adds new functionality to objects without altering structure"
  }
};

const CODE_QUALITY_THRESHOLDS = {
  complexity: { low: 5, medium: 10, high: 20 },
  maintainability: { poor: 50, fair: 70, good: 85 },
  testCoverage: { poor: 60, fair: 80, good: 90 },
  documentation: { poor: 50, fair: 75, good: 90 }
};

const LANGUAGE_CONFIGS: Record<string, {
  icon: string;
  color: string;
  extensions: string[];
}> = {
  python: {
    icon: "🐍",
    color: "text-yellow-600",
    extensions: [".py", ".pyw", ".pyx", ".pxd"]
  },
  javascript: {
    icon: "📜",
    color: "text-yellow-500",
    extensions: [".js", ".jsx", ".mjs"]
  },
  typescript: {
    icon: "🔷",
    color: "text-blue-600",
    extensions: [".ts", ".tsx", ".d.ts"]
  },
  react: {
    icon: "⚛️",
    color: "text-cyan-500",
    extensions: [".jsx", ".tsx"]
  },
  java: {
    icon: "☕",
    color: "text-red-600",
    extensions: [".java"]
  },
  cpp: {
    icon: "⚙️",
    color: "text-blue-700",
    extensions: [".cpp", ".cc", ".cxx", ".hpp", ".h"]
  },
  csharp: {
    icon: "🔷",
    color: "text-purple-600",
    extensions: [".cs"]
  },
  go: {
    icon: "🐹",
    color: "text-cyan-600",
    extensions: [".go"]
  },
  rust: {
    icon: "🦀",
    color: "text-orange-700",
    extensions: [".rs"]
  }
};

// ===== Main Component =====

const CodeAnalysis: React.FC = () => {
  // ===== State Management =====
  
  // Project State
  const [projectPath, setProjectPath] = useState("");
  const [projectAnalysis, setProjectAnalysis] = useState<ProjectAnalysis | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [codeEntities, setCodeEntities] = useState<CodeEntity[]>([]);
  const [dependencyGraph, setDependencyGraph] = useState<any>(null);
  
  // Generation State
  const [generationPlans, setGenerationPlans] = useState<CodeGenerationPlan[]>([]);
  const [activeGenerationPlan, setActiveGenerationPlan] = useState<CodeGenerationPlan | null>(null);
  const [codeFragments, setCodeFragments] = useState<Record<string, CodeFragment[]>>({});
  const [generationStatus, setGenerationStatus] = useState<"idle" | "planning" | "generating" | "completed">("idle");
  const [generationProgress, setGenerationProgress] = useState(0);
  
  // Analysis State
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [codeIssues, setCodeIssues] = useState<any[]>([]);
  const [architecturePatterns, setArchitecturePatterns] = useState<ArchitecturePattern[]>([]);
  const [qualityMetrics, setQualityMetrics] = useState<any>(null);
  
  // UI State
  const [selectedView, setSelectedView] = useState<"explorer" | "analysis" | "generation" | "collaboration">("explorer");
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showEntityDetails, setShowEntityDetails] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<CodeEntity | null>(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOptions, setFilterOptions] = useState({
    entityTypes: ["all"],
    complexityRange: [0, 100],
    showOnlyIssues: false
  });
  
  // Generation Form State
  const [generationObjective, setGenerationObjective] = useState("");
  const [generationScope, setGenerationScope] = useState<"file" | "module" | "system">("module");
  const [targetFiles, setTargetFiles] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [qualityTargets, setQualityTargets] = useState({
    testCoverage: 90,
    maxComplexity: 10,
    documentationCoverage: 100
  });
  
  // Collaboration State
  const [collaborationSession, setCollaborationSession] = useState<CollaborationSession | null>(null);
  const [collaborationMessages, setCollaborationMessages] = useState<any[]>([]);
  const [isCollaborating, setIsCollaborating] = useState(false);
  
  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Visualization Refs
  const dependencyGraphRef = useRef<HTMLDivElement>(null);
  const complexityChartRef = useRef<HTMLDivElement>(null);
  
  // ===== WebSocket Connection =====
  
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    try {
      const sessionId = collaborationSession?.sessionId || `code_${Date.now()}`;
      const ws = new WebSocket(`ws://localhost:8000/api/argosa/code/ws/code-collaboration/${sessionId}`);
      
      ws.onopen = () => {
        setIsConnected(true);
        console.log("Code collaboration WebSocket connected");
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
  }, [collaborationSession]);
  
  const handleWebSocketMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case "architecture_response":
      case "implementation_response":
      case "review_response":
      case "analysis_response":
        setCollaborationMessages(prev => [...prev, message.data]);
        break;
      case "progress_update":
        setGenerationProgress(message.data.progress || 0);
        break;
      case "code_fragment":
        const fragment = message.data as CodeFragment;
        setCodeFragments(prev => ({
          ...prev,
          [fragment.fragmentType]: [...(prev[fragment.fragmentType] || []), fragment]
        }));
        break;
    }
  };
  
  // ===== API Calls =====
  
  const analyzeProject = async () => {
    setAnalysisLoading(true);
    try {
      const response = await fetch("/api/argosa/code/analyze-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root_path: projectPath || "." })
      });
      
      const data = await response.json();
      setProjectAnalysis(data.analysis);
      
      // Process entities
      if (data.analysis.entities) {
        const entities = processEntities(data.analysis.entities);
        setCodeEntities(entities);
      }
      
      // Build file tree
      const tree = buildFileTree(data.analysis.files);
      setFileTree(tree);
      
      // Extract patterns
      if (data.analysis.patternsDetected) {
        const patterns = data.analysis.patternsDetected.map((p: string) => 
          createPatternFromName(p)
        );
        setArchitecturePatterns(patterns);
      }
      
      // Set quality metrics
      setQualityMetrics(data.analysis.qualityMetrics);
      
      // Build dependency graph
      if (data.analysis.dependencyAnalysis) {
        buildDependencyVisualization(data.analysis.dependencyAnalysis);
      }
      
    } catch (error) {
      console.error("Failed to analyze project:", error);
      // Use mock data for development
      const mockAnalysis = generateMockProjectAnalysis();
      setProjectAnalysis(mockAnalysis);
      setCodeEntities(generateMockEntities());
      setFileTree(generateMockFileTree());
      setArchitecturePatterns(generateMockPatterns());
      setQualityMetrics(mockAnalysis.qualityMetrics);
    } finally {
      setAnalysisLoading(false);
    }
  };
  
  const createGenerationPlan = async () => {
    try {
      const response = await fetch("/api/argosa/code/create-generation-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: generationObjective,
          scope: generationScope,
          target_files: targetFiles,
          constraints,
          test_coverage: qualityTargets.testCoverage,
          max_complexity: qualityTargets.maxComplexity,
          documentation_coverage: qualityTargets.documentationCoverage
        })
      });
      
      const data = await response.json();
      const plan = data.plan as CodeGenerationPlan;
      
      setGenerationPlans(prev => [...prev, plan]);
      setActiveGenerationPlan(plan);
      setShowCreatePlan(false);
      resetGenerationForm();
      
    } catch (error) {
      console.error("Failed to create generation plan:", error);
      // Use mock plan for development
      const mockPlan = generateMockGenerationPlan();
      setGenerationPlans(prev => [...prev, mockPlan]);
      setActiveGenerationPlan(mockPlan);
      setShowCreatePlan(false);
    }
  };
  
  const executeGenerationPlan = async (planId: string) => {
    setGenerationStatus("generating");
    setGenerationProgress(0);
    
    try {
      const response = await fetch(`/api/argosa/code/execute-generation/${planId}`, {
        method: "POST"
      });
      
      // Poll for status
      const statusInterval = setInterval(async () => {
        const statusResponse = await fetch(`/api/argosa/code/generation-status/${planId}`);
        const statusData = await statusResponse.json();
        
        setGenerationProgress(statusData.progress.completed_phases / statusData.progress.total_phases * 100);
        
        if (statusData.status === "completed") {
          clearInterval(statusInterval);
          setGenerationStatus("completed");
          
          // Fetch generated code fragments
          const fragmentsResponse = await fetch(`/api/argosa/code/code-fragments/${planId}`);
          const fragmentsData = await fragmentsResponse.json();
          
          const groupedFragments = _.groupBy(fragmentsData.fragments, 'fragmentType');
          setCodeFragments(groupedFragments);
        }
      }, 2000);
      
    } catch (error) {
      console.error("Failed to execute generation plan:", error);
      // Simulate generation for development
      simulateGeneration();
    }
  };
  
  const validateCode = async (code: string, context: any = {}) => {
    try {
      const response = await fetch("/api/argosa/code/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, context })
      });
      
      const validation = await response.json();
      return validation;
      
    } catch (error) {
      console.error("Failed to validate code:", error);
      // Return mock validation
      return {
        syntax: { valid: true },
        style: { valid: true, issues: [] },
        complexity: { valid: true, max_complexity: 5 },
        security: { valid: true, issues: [] },
        performance: { valid: true, issues: [] }
      };
    }
  };
  
  const createCollaborationSession = async () => {
    try {
      const response = await fetch("/api/argosa/code/collaboration-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: generationObjective || "Code analysis and generation"
        })
      });
      
      const data = await response.json();
      const session: CollaborationSession = {
        sessionId: data.session_id,
        participants: {
          "data_analysis": { status: "connected" },
          "code_architect": { status: "connected" },
          "code_implementer": { status: "connected" },
          "code_reviewer": { status: "connected" }
        },
        objective: generationObjective,
        messageHistory: [],
        codeVersions: [],
        decisions: []
      };
      
      setCollaborationSession(session);
      setIsCollaborating(true);
      
    } catch (error) {
      console.error("Failed to create collaboration session:", error);
      // Create mock session for development
      const mockSession: CollaborationSession = {
        sessionId: `collab_${Date.now()}`,
        participants: {
          "data_analysis": { status: "connected" },
          "code_architect": { status: "connected" },
          "code_implementer": { status: "connected" },
          "code_reviewer": { status: "connected" }
        },
        objective: generationObjective || "Code analysis and generation",
        messageHistory: [],
        codeVersions: [],
        decisions: []
      };
      setCollaborationSession(mockSession);
      setIsCollaborating(true);
    }
  };
  
  // ===== Helper Functions =====
  
  const processEntities = (entitiesData: any): CodeEntity[] => {
    // Process raw entity data into CodeEntity objects
    return [];
  };
  
  const buildFileTree = (filesData: any): FileNode[] => {
    // Build hierarchical file tree from flat file list
    return generateMockFileTree();
  };
  
  const createPatternFromName = (patternName: string): ArchitecturePattern => {
    const basePattern = ARCHITECTURE_PATTERNS[patternName.toLowerCase()] || ARCHITECTURE_PATTERNS.mvc;
    return {
      patternName,
      patternType: patternName.toLowerCase() as any,
      components: [],
      relationships: [],
      constraints: [],
      benefits: [basePattern.description],
      drawbacks: [],
      whenToUse: "",
      implementationGuide: {}
    };
  };
  
  const buildDependencyVisualization = (dependencyData: any) => {
    if (!dependencyGraphRef.current) return;
    
    // Create a simple dependency graph visualization without d3
    const container = dependencyGraphRef.current;
    container.innerHTML = '';
    
    // Sample nodes for visualization
    const nodes = codeEntities.slice(0, 20).map(entity => ({
      id: entity.id,
      name: entity.name,
      type: entity.entityType,
      complexity: entity.complexity
    }));
    
    const links: any[] = [];
    nodes.forEach((node, i) => {
      if (i > 0) {
        links.push({
          source: nodes[Math.floor(Math.random() * i)].id,
          target: node.id,
          value: Math.random() * 10
        });
      }
    });
    
    // Create a simple HTML-based visualization
    const graphContainer = document.createElement('div');
    graphContainer.style.position = 'relative';
    graphContainer.style.width = '100%';
    graphContainer.style.height = '400px';
    graphContainer.style.overflow = 'hidden';
    
    // Position nodes in a circular layout
    const centerX = container.clientWidth / 2;
    const centerY = 200;
    const radius = 150;
    
    nodes.forEach((node, index) => {
      const angle = (index / nodes.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      // Create node element
      const nodeEl = document.createElement('div');
      nodeEl.style.position = 'absolute';
      nodeEl.style.left = `${x - 20}px`;
      nodeEl.style.top = `${y - 20}px`;
      nodeEl.style.width = `${40 + node.complexity}px`;
      nodeEl.style.height = `${40 + node.complexity}px`;
      nodeEl.style.borderRadius = '50%';
      nodeEl.style.display = 'flex';
      nodeEl.style.alignItems = 'center';
      nodeEl.style.justifyContent = 'center';
      nodeEl.style.cursor = 'pointer';
      nodeEl.style.transition = 'all 0.3s';
      nodeEl.style.fontSize = '10px';
      nodeEl.style.fontWeight = 'bold';
      nodeEl.style.color = 'white';
      nodeEl.title = `${node.name}\nType: ${node.type}\nComplexity: ${node.complexity}`;
      
      const colors: Record<string, string> = {
        function: "#3b82f6",
        class: "#10b981",
        method: "#f59e0b",
        variable: "#ef4444"
      };
      nodeEl.style.backgroundColor = colors[node.type] || "#6b7280";
      
      nodeEl.textContent = node.name.slice(0, 3);
      
      nodeEl.addEventListener('mouseenter', () => {
        nodeEl.style.transform = 'scale(1.2)';
        nodeEl.style.zIndex = '10';
      });
      
      nodeEl.addEventListener('mouseleave', () => {
        nodeEl.style.transform = 'scale(1)';
        nodeEl.style.zIndex = '1';
      });
      
      graphContainer.appendChild(nodeEl);
    });
    
    container.appendChild(graphContainer);
    setDependencyGraph({ nodes, links });
  };
  
  const buildComplexityVisualization = () => {
    if (!complexityChartRef.current || !codeEntities.length) return;
    
    const container = complexityChartRef.current;
    container.innerHTML = '';
    
    // Prepare data
    const data = codeEntities
      .filter(e => e.entityType === "function" || e.entityType === "method")
      .slice(0, 20)
      .map(e => ({
        name: e.name,
        complexity: e.complexity,
        lines: e.lineCount
      }));
    
    // Create a simple scatter plot using HTML/CSS
    const chartContainer = document.createElement('div');
    chartContainer.style.position = 'relative';
    chartContainer.style.width = '100%';
    chartContainer.style.height = '300px';
    chartContainer.style.border = '1px solid #e5e7eb';
    chartContainer.style.borderRadius = '4px';
    chartContainer.style.padding = '20px';
    
    // Find max values for scaling
    const maxLines = Math.max(...data.map(d => d.lines), 100);
    const maxComplexity = Math.max(...data.map(d => d.complexity), 20);
    
    // Create axes labels
    const yLabel = document.createElement('div');
    yLabel.style.position = 'absolute';
    yLabel.style.left = '-40px';
    yLabel.style.top = '50%';
    yLabel.style.transform = 'rotate(-90deg)';
    yLabel.style.fontSize = '12px';
    yLabel.style.color = '#6b7280';
    yLabel.textContent = 'Complexity';
    chartContainer.appendChild(yLabel);
    
    const xLabel = document.createElement('div');
    xLabel.style.position = 'absolute';
    xLabel.style.bottom = '-30px';
    xLabel.style.left = '50%';
    xLabel.style.transform = 'translateX(-50%)';
    xLabel.style.fontSize = '12px';
    xLabel.style.color = '#6b7280';
    xLabel.textContent = 'Lines of Code';
    chartContainer.appendChild(xLabel);
    
    // Plot points
    data.forEach(d => {
      const x = (d.lines / maxLines) * (container.clientWidth - 40);
      const y = (1 - d.complexity / maxComplexity) * 260;
      
      const point = document.createElement('div');
      point.style.position = 'absolute';
      point.style.left = `${x}px`;
      point.style.top = `${y}px`;
      point.style.width = '10px';
      point.style.height = '10px';
      point.style.borderRadius = '50%';
      point.style.cursor = 'pointer';
      point.style.transition = 'all 0.3s';
      
      // Color based on complexity (green to red)
      const hue = (1 - d.complexity / 20) * 120;
      point.style.backgroundColor = `hsl(${hue}, 70%, 50%)`;
      
      // Tooltip
      const tooltip = document.createElement('div');
      tooltip.style.position = 'absolute';
      tooltip.style.display = 'none';
      tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      tooltip.style.color = 'white';
      tooltip.style.padding = '8px';
      tooltip.style.borderRadius = '4px';
      tooltip.style.fontSize = '12px';
      tooltip.style.whiteSpace = 'nowrap';
      tooltip.style.zIndex = '100';
      tooltip.innerHTML = `${d.name}<br/>Complexity: ${d.complexity}<br/>Lines: ${d.lines}`;
      
      point.appendChild(tooltip);
      
      point.addEventListener('mouseenter', (e) => {
        point.style.transform = 'scale(1.5)';
        tooltip.style.display = 'block';
        tooltip.style.left = '15px';
        tooltip.style.top = '-10px';
      });
      
      point.addEventListener('mouseleave', () => {
        point.style.transform = 'scale(1)';
        tooltip.style.display = 'none';
      });
      
      chartContainer.appendChild(point);
    });
    
    // Add grid lines
    for (let i = 0; i <= 4; i++) {
      const gridLine = document.createElement('div');
      gridLine.style.position = 'absolute';
      gridLine.style.left = '0';
      gridLine.style.right = '0';
      gridLine.style.top = `${i * 65}px`;
      gridLine.style.borderTop = '1px dashed #e5e7eb';
      chartContainer.appendChild(gridLine);
    }
    
    container.appendChild(chartContainer);
  };
  
  const resetGenerationForm = () => {
    setGenerationObjective("");
    setGenerationScope("module");
    setTargetFiles([]);
    setConstraints([]);
    setQualityTargets({
      testCoverage: 90,
      maxComplexity: 10,
      documentationCoverage: 100
    });
  };
  
  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };
  
  const filterEntities = (entities: CodeEntity[]): CodeEntity[] => {
    let filtered = entities;
    
    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(e => 
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.filePath.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Filter by entity type
    if (!filterOptions.entityTypes.includes("all")) {
      filtered = filtered.filter(e => 
        filterOptions.entityTypes.includes(e.entityType)
      );
    }
    
    // Filter by complexity
    filtered = filtered.filter(e => 
      e.complexity >= filterOptions.complexityRange[0] &&
      e.complexity <= filterOptions.complexityRange[1]
    );
    
    // Filter by issues
    if (filterOptions.showOnlyIssues) {
      filtered = filtered.filter(e => 
        codeIssues.some(issue => issue.entityId === e.id)
      );
    }
    
    return filtered;
  };
  
  const getEntityIcon = (type: string) => {
    const icons: Record<string, any> = {
      function: Code2,
      class: Package,
      method: GitBranch,
      variable: Hash,
      import: Download,
      constant: Lock
    };
    return icons[type] || Code;
  };
  
    const getComplexityColor = (complexity: number): string => {
    const thresholds = CODE_QUALITY_THRESHOLDS.complexity;
    if (complexity <= thresholds.low) return "text-green-600";
    if (complexity <= thresholds.medium) return "text-yellow-600";
    if (complexity <= thresholds.high) return "text-orange-600";
    return "text-red-600";
    };

    const getQualityBadgeVariant = (
    value: number, 
    metric: keyof typeof CODE_QUALITY_THRESHOLDS
    ): "default" | "secondary" | "destructive" => {
    if (metric === "complexity") {
        const thresholds = CODE_QUALITY_THRESHOLDS.complexity;
        if (value <= thresholds.low) return "default";
        if (value <= thresholds.medium) return "secondary";
        return "destructive";
    } else {
        const thresholds = CODE_QUALITY_THRESHOLDS[metric] as { poor: number; fair: number; good: number };
        if (value >= thresholds.good) return "default";
        if (value >= thresholds.fair) return "secondary";
        return "destructive";
    }
    };
  
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  const simulateGeneration = () => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setGenerationProgress(progress);
      
      if (progress >= 100) {
        clearInterval(interval);
        setGenerationStatus("completed");
        
        // Generate mock fragments
        const mockFragments: Record<string, CodeFragment[]> = {
          function: [generateMockCodeFragment("function")],
          class: [generateMockCodeFragment("class")],
          test: [generateMockCodeFragment("test")]
        };
        setCodeFragments(mockFragments);
      }
    }, 500);
  };
  
  // Mock data generators
  const generateMockProjectAnalysis = (): ProjectAnalysis => ({
    timestamp: new Date().toISOString(),
    rootPath: ".",
    statistics: {
      files: {
        totalFiles: 156,
        pythonFiles: 89,
        testFiles: 23,
        configFiles: 12,
        totalLines: 15420,
        codeLines: 11230,
        commentLines: 2190,
        blankLines: 2000
      },
      entities: {
        totalEntities: 342,
        functions: 156,
        classes: 45,
        methods: 128,
        asyncFunctions: 13
      }
    },
    architecture: {
      patterns: ["MVC", "Repository", "Factory"],
      recommendations: [
        "Consider implementing Repository pattern for data access",
        "Add more unit tests to improve coverage",
        "Refactor high complexity functions"
      ]
    },
    qualityMetrics: {
      averageComplexity: 7.2,
      highComplexityFunctions: [
        { name: "process_data", file: "src/data_processor.py", complexity: 25 },
        { name: "generate_report", file: "src/reporting.py", complexity: 18 }
      ],
      documentationCoverage: 72,
      testCoverageEstimate: 68,
      codeDuplication: [],
      codeSmells: [
        { type: "long_function", entity: "analyze_complex_data", file: "src/analyzer.py", details: { lines: 156 } },
        { type: "too_many_parameters", entity: "create_configuration", file: "src/config.py", details: { count: 8 } }
      ]
    },
    patternsDetected: ["MVC", "Repository", "Factory"],
    improvementOpportunities: [
      {
        type: "refactoring",
        priority: "high",
        description: "Refactor high complexity functions",
        targets: [
          { name: "process_data", complexity: 25 },
          { name: "generate_report", complexity: 18 }
        ]
      },
      {
        type: "testing",
        priority: "medium",
        description: "Increase test coverage to 80%"
      }
    ],
    dependencyAnalysis: {
      totalNodes: 89,
      totalEdges: 234,
      stronglyConnectedComponents: [],
      cycles: [],
      mostDependent: [
        { entity: "DataProcessor", file: "src/processor.py", dependencies: 12 },
        { entity: "ReportGenerator", file: "src/reports.py", dependencies: 8 }
      ],
      mostDependedUpon: [
        { entity: "BaseModel", file: "src/models/base.py", dependedBy: 15 },
        { entity: "Utils", file: "src/utils.py", dependedBy: 23 }
      ]
    },
    complexityAnalysis: {},
    testCoverageAnalysis: {}
  });
  
  const generateMockEntities = (): CodeEntity[] => {
    const entities: CodeEntity[] = [];
    const files = ["main.py", "utils.py", "models.py", "views.py", "controllers.py"];
    const types: CodeEntity["entityType"][] = ["function", "class", "method"];
    
    for (let i = 0; i < 50; i++) {
      entities.push({
        id: `entity_${i}`,
        entityType: types[i % types.length],
        name: `entity_${i}_name`,
        filePath: `src/${files[i % files.length]}`,
        lineStart: Math.floor(Math.random() * 100) + 1,
        lineEnd: Math.floor(Math.random() * 100) + 100,
        complexity: Math.floor(Math.random() * 20) + 1,
        lineCount: Math.floor(Math.random() * 100) + 10,
        testCoverage: Math.random() * 100,
        signature: `def entity_${i}_name(param1, param2)`,
        docstring: `This is entity ${i}`,
        decorators: i % 3 === 0 ? ["@property", "@cached"] : [],
        typeHints: { param1: "str", param2: "int", return: "bool" }
      });
    }
    
    return entities;
  };
  
  const generateMockFileTree = (): FileNode[] => {
    return [
      {
        id: "root",
        name: "src",
        path: "src",
        type: "directory",
        expanded: true,
        children: [
          {
            id: "main",
            name: "main.py",
            path: "src/main.py",
            type: "file",
            language: "python",
            size: 2048,
            lastModified: new Date().toISOString(),
            analysis: {
              entities: generateMockEntities().slice(0, 5),
              complexity: 8,
              issues: 2
            }
          },
          {
            id: "models",
            name: "models",
            path: "src/models",
            type: "directory",
            children: [
              {
                id: "base_model",
                name: "base.py",
                path: "src/models/base.py",
                type: "file",
                language: "python",
                size: 1024
              },
              {
                id: "user_model",
                name: "user.py",
                path: "src/models/user.py",
                type: "file",
                language: "python",
                size: 1536
              }
            ]
          },
          {
            id: "utils",
            name: "utils.py",
            path: "src/utils.py",
            type: "file",
            language: "python",
            size: 3072
          }
        ]
      },
      {
        id: "tests",
        name: "tests",
        path: "tests",
        type: "directory",
        children: [
          {
            id: "test_main",
            name: "test_main.py",
            path: "tests/test_main.py",
            type: "file",
            language: "python",
            size: 1024
          }
        ]
      }
    ];
  };
  
  const generateMockPatterns = (): ArchitecturePattern[] => {
    return Object.entries(ARCHITECTURE_PATTERNS).slice(0, 3).map(([key, config]) => ({
      patternName: config.name,
      patternType: key as any,
      components: [
        { name: "Component1", type: "class", responsibility: "Handle data", relationships: ["Component2"] },
        { name: "Component2", type: "interface", responsibility: "Define contract", relationships: [] }
      ],
      relationships: [
        { from: "Component1", to: "Component2", type: "implements" }
      ],
      constraints: ["Must be thread-safe", "Should follow SOLID principles"],
      benefits: [config.description, "Improves maintainability"],
      drawbacks: ["Adds complexity", "May impact performance"],
      whenToUse: "When you need " + config.description.toLowerCase(),
      implementationGuide: {
        steps: ["Define interfaces", "Implement components", "Wire dependencies"]
      }
    }));
  };
  
const generateMockGenerationPlan = (): CodeGenerationPlan => ({
  planId: `plan_${Date.now()}`,
  objective: generationObjective || "Generate authentication system",
  scope: generationScope,
  phases: [
    // ... phases 내용
  ],
  architectureDecisions: {
    pattern: "Repository",
    authentication: "JWT",
    database: "PostgreSQL"
  },
  fileStructure: {
    newFiles: [
      { path: "src/auth/service.py", purpose: "Authentication service", template: "" },
      { path: "src/auth/models.py", purpose: "Auth models", template: "" }
    ],
    modifiedFiles: [],
    directoryStructure: {}
  },
  implementationDetails: {},
  qualityTargets: {
    testCoverage: 90,
    maxComplexity: 10,
    documentationCoverage: 100,
    performanceTargets: {}  // 이 필드가 누락되었을 수 있음
  },
  risks: [
    {
      type: "security",
      severity: "high",
      description: "Authentication vulnerabilities",
      mitigation: "Implement proper validation and encryption"
    }
  ],
  mitigationStrategies: {}
});
  
  const generateMockCodeFragment = (type: string): CodeFragment => ({
    fragmentId: `frag_${Date.now()}_${type}`,
    fragmentType: type as any,
    content: type === "function" ? 
      `def authenticate_user(username: str, password: str) -> dict:
    """Authenticate user and return JWT token"""
    user = UserRepository.find_by_username(username)
    if user and verify_password(password, user.password_hash):
        return generate_jwt_token(user)
    raise AuthenticationError("Invalid credentials")` :
      type === "class" ?
      `class AuthenticationService:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository
        self.token_manager = JWTManager()
    
    async def login(self, credentials: LoginCredentials) -> AuthToken:
        """Process user login"""
        pass` :
      `import pytest
from auth_service import AuthenticationService

class TestAuthenticationService:
    def test_successful_login(self):
        # Test implementation
        pass`,
    language: "python",
    context: { file: `src/${type}.py` },
    dependencies: ["UserRepository", "JWTManager"],
    integrationPoints: [
      { type: "database", location: "UserRepository", description: "User data access" }
    ],
    validationStatus: "passed",
    validationResults: { syntax: true, style: true },
    createdBy: "code_generator",
    createdAt: new Date().toISOString(),
    iteration: 1
  });
  
  // ===== Effects =====
  
  useEffect(() => {
    if (isCollaborating) {
      connectWebSocket();
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isCollaborating, connectWebSocket]);
  
  useEffect(() => {
    if (dependencyGraphRef.current && codeEntities.length > 0) {
      buildDependencyVisualization(projectAnalysis?.dependencyAnalysis || {});
    }
  }, [codeEntities, projectAnalysis]);
  
  useEffect(() => {
    if (complexityChartRef.current && codeEntities.length > 0) {
      buildComplexityVisualization();
    }
  }, [codeEntities]);
  
  // ===== Render Functions =====
  
  const renderFileExplorer = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FolderTree className="w-5 h-5" />
              Project Explorer
            </span>
            <Button size="sm" variant="outline" onClick={analyzeProject}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Analyze
            </Button>
          </CardTitle>
          <CardDescription>
            Navigate and analyze your project structure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Enter project path..."
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="icon">
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Search Files</Label>
                <Badge variant="outline" className="text-xs">
                  {fileTree.length} files
                </Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files and entities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            
            <ScrollArea className="h-[400px] border rounded-lg p-2">
              {fileTree.map((node) => renderFileNode(node, 0))}
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
      
      {selectedFile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileCode className="w-4 h-4" />
              {selectedFile.name}
            </CardTitle>
            <CardDescription>
              {selectedFile.path}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {selectedFile.analysis && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{selectedFile.analysis.entities?.length || 0}</p>
                      <p className="text-xs text-muted-foreground">Entities</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{selectedFile.analysis.complexity || 0}</p>
                      <p className="text-xs text-muted-foreground">Avg Complexity</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{selectedFile.analysis.issues || 0}</p>
                      <p className="text-xs text-muted-foreground">Issues</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-2">Code Entities</h4>
                    <div className="space-y-2">
                      {selectedFile.analysis.entities?.slice(0, 5).map((entity) => (
                        <div
                          key={entity.id}
                          className="flex items-center justify-between p-2 rounded-lg border hover:bg-accent cursor-pointer"
                          onClick={() => {
                            setSelectedEntity(entity);
                            setShowEntityDetails(true);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {React.createElement(getEntityIcon(entity.entityType), { className: "w-4 h-4" })}
                            <span className="font-mono text-sm">{entity.name}</span>
                          </div>
                          <Badge variant="outline" className={getComplexityColor(entity.complexity)}>
                            {entity.complexity}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Eye className="w-4 h-4 mr-2" />
                  View Code
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  <Bug className="w-4 h-4 mr-2" />
                  Analyze
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
  
  const renderFileNode = (node: FileNode, depth: number): JSX.Element => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedFile?.id === node.id;
    
    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-accent ${
            isSelected ? "bg-accent" : ""
          }`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => {
            if (node.type === "directory") {
              toggleNodeExpansion(node.id);
            } else {
              setSelectedFile(node);
            }
          }}
        >
          {node.type === "directory" ? (
            <>
              {hasChildren && (
                <ChevronRight
                  className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
              )}
              <FolderOpen className="w-4 h-4 text-yellow-600" />
            </>
          ) : (
            <>
              <div className="w-4" />
              <FileCode2 className="w-4 h-4 text-blue-600" />
            </>
          )}
          <span className="text-sm flex-1">{node.name}</span>
          {node.type === "file" && node.language && (
            <span className="text-xs">{LANGUAGE_CONFIGS[node.language]?.icon}</span>
          )}
          {node.analysis?.issues && node.analysis.issues > 0 && (
            <Badge variant="destructive" className="text-xs">
              {node.analysis.issues}
            </Badge>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map((child) => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };
  
  const renderAnalysis = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Code Analysis</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => analyzeProject()}
            disabled={analysisLoading}
          >
            {analysisLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-analyze
              </>
            )}
          </Button>
        </div>
      </div>
      
      {projectAnalysis ? (
        <div className="grid gap-6">
          {/* Overview Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Files</CardTitle>
                <FileCode className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {projectAnalysis.statistics.files.totalFiles}
                </div>
                <p className="text-xs text-muted-foreground">
                  {projectAnalysis.statistics.files.pythonFiles} Python files
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Code Entities</CardTitle>
                <Code2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {projectAnalysis.statistics.entities.totalEntities}
                </div>
                <p className="text-xs text-muted-foreground">
                  {projectAnalysis.statistics.entities.functions} functions, {projectAnalysis.statistics.entities.classes} classes
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Complexity</CardTitle>
                <Brain className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getComplexityColor(projectAnalysis.qualityMetrics.averageComplexity)}`}>
                  {projectAnalysis.qualityMetrics.averageComplexity.toFixed(1)}
                </div>
                <Progress
                  value={(projectAnalysis.qualityMetrics.averageComplexity / 20) * 100}
                  className="mt-2"
                />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Test Coverage</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {projectAnalysis.qualityMetrics.testCoverageEstimate}%
                </div>
                <Progress
                  value={projectAnalysis.qualityMetrics.testCoverageEstimate}
                  className="mt-2"
                />
              </CardContent>
            </Card>
          </div>
          
          <Tabs defaultValue="quality" className="space-y-4">
            <TabsList>
              <TabsTrigger value="quality">Quality Metrics</TabsTrigger>
              <TabsTrigger value="architecture">Architecture</TabsTrigger>
              <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
              <TabsTrigger value="issues">Issues</TabsTrigger>
            </TabsList>
            
            <TabsContent value="quality" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Code Quality Distribution</CardTitle>
                    <CardDescription>Complexity vs Lines of Code</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div ref={complexityChartRef} className="w-full" />
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Quality Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Documentation Coverage</span>
                        <span className="text-sm text-muted-foreground">
                          {projectAnalysis.qualityMetrics.documentationCoverage}%
                        </span>
                      </div>
                      <Progress value={projectAnalysis.qualityMetrics.documentationCoverage} />
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Test Coverage</span>
                        <span className="text-sm text-muted-foreground">
                          {projectAnalysis.qualityMetrics.testCoverageEstimate}%
                        </span>
                      </div>
                      <Progress value={projectAnalysis.qualityMetrics.testCoverageEstimate} />
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">High Complexity Functions</h4>
                      <div className="space-y-2">
                        {projectAnalysis.qualityMetrics.highComplexityFunctions.map((func, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 rounded border">
                            <div>
                              <p className="font-mono text-sm">{func.name}</p>
                              <p className="text-xs text-muted-foreground">{func.file}</p>
                            </div>
                            <Badge variant="destructive">
                              {func.complexity}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Code Smells</CardTitle>
                  <CardDescription>Potential code quality issues</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectAnalysis.qualityMetrics.codeSmells.map((smell, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge variant="outline">{smell.type}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{smell.entity}</TableCell>
                          <TableCell className="text-sm">{smell.file}</TableCell>
                          <TableCell className="text-sm">
                            {JSON.stringify(smell.details)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="architecture" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {architecturePatterns.map((pattern) => {
                  const config = ARCHITECTURE_PATTERNS[pattern.patternType];
                  return (
                    <Card key={pattern.patternName}>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {React.createElement(config.icon, { className: `w-5 h-5 ${config.color}` })}
                          {pattern.patternName}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                          {config.description}
                        </p>
                        <div className="space-y-2">
                          <div>
                            <h5 className="text-sm font-medium">Components</h5>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {pattern.components.slice(0, 3).map((comp, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {comp.name}
                                </Badge>
                              ))}
                              {pattern.components.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{pattern.components.length - 3}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div>
                            <h5 className="text-sm font-medium">Benefits</h5>
                            <ul className="text-xs text-muted-foreground mt-1">
                              {pattern.benefits.slice(0, 2).map((benefit, idx) => (
                                <li key={idx}>• {benefit}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Architecture Recommendations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {projectAnalysis.architecture.recommendations.map((rec, idx) => (
                      <Alert key={idx}>
                        <Info className="h-4 w-4" />
                        <AlertDescription>{rec}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="dependencies" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Dependency Graph</CardTitle>
                  <CardDescription>
                    Visualization of code dependencies and relationships
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div ref={dependencyGraphRef} className="w-full h-[400px] border rounded" />
                </CardContent>
              </Card>
              
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Most Dependent</CardTitle>
                    <CardDescription>Entities with most dependencies</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {projectAnalysis.dependencyAnalysis.mostDependent.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded border">
                          <div>
                            <p className="font-mono text-sm">{item.entity}</p>
                            <p className="text-xs text-muted-foreground">{item.file}</p>
                          </div>
                          <Badge variant="outline">
                            {item.dependencies} deps
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Most Depended Upon</CardTitle>
                    <CardDescription>Entities used by many others</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {projectAnalysis.dependencyAnalysis.mostDependedUpon.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded border">
                          <div>
                            <p className="font-mono text-sm">{item.entity}</p>
                            <p className="text-xs text-muted-foreground">{item.file}</p>
                          </div>
                          <Badge variant="outline">
                            {item.dependedBy} refs
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="issues" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Improvement Opportunities</CardTitle>
                  <CardDescription>
                    Prioritized list of improvements for your codebase
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {projectAnalysis.improvementOpportunities.map((opp, idx) => (
                      <div key={idx} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium">{opp.description}</h4>
                            <Badge variant={
                              opp.priority === "high" ? "destructive" :
                              opp.priority === "medium" ? "default" :
                              "secondary"
                            } className="mt-1">
                              {opp.priority} priority
                            </Badge>
                          </div>
                          <Badge variant="outline">{opp.type}</Badge>
                        </div>
                        {opp.targets && (
                          <div className="mt-3">
                            <p className="text-sm text-muted-foreground mb-2">Targets:</p>
                            <div className="space-y-1">
                              {opp.targets.slice(0, 3).map((target: any, tidx: number) => (
                                <div key={tidx} className="text-sm">
                                  • {target.name || target}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileSearch className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No analysis data available.<br />
              Click "Analyze" to scan your project.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
  
  const renderGeneration = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Code Generation</h2>
        <Button onClick={() => setShowCreatePlan(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Generation Plan
        </Button>
      </div>
      
      {generationPlans.length > 0 ? (
        <div className="grid gap-6">
          {/* Active Plan */}
          {activeGenerationPlan && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Active Generation Plan</CardTitle>
                  <Badge variant={
                    generationStatus === "completed" ? "default" :
                    generationStatus === "generating" ? "secondary" :
                    "outline"
                  }>
                    {generationStatus}
                  </Badge>
                </div>
                <CardDescription>{activeGenerationPlan.objective}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Progress</span>
                    <span className="text-sm text-muted-foreground">{generationProgress}%</span>
                  </div>
                  <Progress value={generationProgress} />
                </div>
                
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="font-medium mb-2">Phases</h4>
                    <div className="space-y-2">
                      {activeGenerationPlan.phases.map((phase) => (
                        <div key={phase.phaseId} className="flex items-center gap-2">
                          <CheckCircle2 className={`w-4 h-4 ${
                            generationProgress > (activeGenerationPlan.phases.indexOf(phase) + 1) / activeGenerationPlan.phases.length * 100
                              ? "text-green-600"
                              : "text-gray-300"
                          }`} />
                          <span className="text-sm">{phase.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Quality Targets</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Test Coverage</span>
                        <Badge variant="outline">{activeGenerationPlan.qualityTargets.testCoverage}%</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Max Complexity</span>
                        <Badge variant="outline">{activeGenerationPlan.qualityTargets.maxComplexity}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Documentation</span>
                        <Badge variant="outline">{activeGenerationPlan.qualityTargets.documentationCoverage}%</Badge>
                      </div>
                    </div>
                  </div>
                </div>
                
                {generationStatus === "idle" && (
                  <Button
                    className="w-full"
                    onClick={() => executeGenerationPlan(activeGenerationPlan.planId)}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Generation
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Generated Code Fragments */}
          {Object.keys(codeFragments).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Generated Code</CardTitle>
                <CardDescription>
                  Review and integrate generated code fragments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue={Object.keys(codeFragments)[0]}>
                  <TabsList>
                    {Object.keys(codeFragments).map((type) => (
                      <TabsTrigger key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}s ({codeFragments[type].length})
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {Object.entries(codeFragments).map(([type, fragments]) => (
                    <TabsContent key={type} value={type} className="space-y-4">
                      {fragments.map((fragment) => (
                        <Card key={fragment.fragmentId}>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base font-mono">
                                {fragment.context.file || `${type}.py`}
                              </CardTitle>
                              <div className="flex items-center gap-2">
                                <Badge variant={
                                  fragment.validationStatus === "passed" ? "default" :
                                  fragment.validationStatus === "failed" ? "destructive" :
                                  "secondary"
                                }>
                                  {fragment.validationStatus}
                                </Badge>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent>
                                    <DropdownMenuItem>
                                      <Copy className="w-4 h-4 mr-2" />
                                      Copy Code
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Download className="w-4 h-4 mr-2" />
                                      Export
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Edit className="w-4 h-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setShowValidationDialog(true)}
                                    >
                                      <ShieldCheck className="w-4 h-4 mr-2" />
                                      Validate
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <ScrollArea className="h-[300px]">
                              <pre className="text-sm">
                                <code>{fragment.content}</code>
                              </pre>
                            </ScrollArea>
                            
                            <div className="mt-4 space-y-2">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">Dependencies:</span>
                                <div className="flex gap-1">
                                  {fragment.dependencies.map((dep, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {dep}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              
                              {fragment.integrationPoints.length > 0 && (
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-muted-foreground">Integration Points:</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {fragment.integrationPoints.length}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          )}
          
          {/* Previous Plans */}
          <Card>
            <CardHeader>
              <CardTitle>Generation History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {generationPlans.map((plan) => (
                  <div
                    key={plan.planId}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer"
                    onClick={() => setActiveGenerationPlan(plan)}
                  >
                    <div>
                      <p className="font-medium">{plan.objective}</p>
                      <p className="text-sm text-muted-foreground">
                        {plan.phases.length} phases • {plan.scope} scope
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wand2 className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              No generation plans yet.<br />
              Create your first plan to start generating code.
            </p>
            <Button className="mt-4" onClick={() => setShowCreatePlan(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Generation Plan
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
  
  const renderCollaboration = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">AI Collaboration</h2>
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
          {!isCollaborating && (
            <Button onClick={createCollaborationSession}>
              <Users className="w-4 h-4 mr-2" />
              Start Collaboration
            </Button>
          )}
        </div>
      </div>
      
      {isCollaborating && collaborationSession ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Collaboration Session</CardTitle>
              <CardDescription>
                {collaborationSession.objective}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                {Object.entries(collaborationSession.participants).map(([participant, info]) => (
                  <div key={participant} className="text-center">
                    <div className={`w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center ${
                      info.status === "connected" ? "bg-green-100" : "bg-gray-100"
                    }`}>
                      <Bot className={`w-6 h-6 ${
                        info.status === "connected" ? "text-green-600" : "text-gray-400"
                      }`} />
                    </div>
                    <p className="text-sm font-medium">{participant.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                    <Badge variant={info.status === "connected" ? "default" : "secondary"} className="text-xs mt-1">
                      {info.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Message History</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {collaborationMessages.map((msg, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        <span className="font-medium text-sm">{msg.from}</span>
                        <Badge variant="outline" className="text-xs">{msg.type}</Badge>
                      </div>
                      <div className="pl-6 text-sm text-muted-foreground">
                        {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Send Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Message Type</Label>
                <Select defaultValue="code_structure_request">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="code_structure_request">Code Structure Request</SelectItem>
                    <SelectItem value="implementation_request">Implementation Request</SelectItem>
                    <SelectItem value="review_request">Review Request</SelectItem>
                    <SelectItem value="decision_needed">Decision Needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Message Content</Label>
                <Textarea
                  placeholder="Enter your message..."
                  rows={4}
                />
              </div>
              
              <Button className="w-full">
                <Send className="w-4 h-4 mr-2" />
                Send to AI Team
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Start a collaboration session to work with AI agents<br />
              on code analysis and generation tasks.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
  
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <div className="flex h-screen">
          {/* Sidebar */}
          <div className="w-64 border-r bg-card">
            <div className="flex h-full flex-col">
              <div className="p-6">
                <h1 className="text-2xl font-bold tracking-tight">Code Analysis</h1>
                <p className="text-sm text-muted-foreground mt-1">AI-Powered Development</p>
              </div>
              
              <nav className="flex-1 space-y-1 px-3">
                <Button
                  variant={selectedView === "explorer" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("explorer")}
                >
                  <FolderTree className="mr-2 h-4 w-4" />
                  File Explorer
                </Button>
                
                <Button
                  variant={selectedView === "analysis" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("analysis")}
                >
                  <BarChart className="mr-2 h-4 w-4" />
                  Analysis
                  {projectAnalysis && (
                    <Badge variant="secondary" className="ml-auto">
                      {projectAnalysis.statistics.entities.totalEntities}
                    </Badge>
                  )}
                </Button>
                
                <Button
                  variant={selectedView === "generation" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("generation")}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Generation
                  {generationPlans.length > 0 && (
                    <Badge variant="secondary" className="ml-auto">
                      {generationPlans.length}
                    </Badge>
                  )}
                </Button>
                
                <Button
                  variant={selectedView === "collaboration" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("collaboration")}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Collaboration
                  {isCollaborating && (
                    <div className="ml-auto w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </Button>
              </nav>
              
              <div className="p-3 space-y-3">
                {/* Filters */}
                <Card>
                  <CardHeader className="p-3">
                    <CardTitle className="text-sm">Filters</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-3">
                    <div>
                      <Label className="text-xs">Entity Types</Label>
                      <Select
                        value={filterOptions.entityTypes[0]}
                        onValueChange={(value) => 
                          setFilterOptions(prev => ({ ...prev, entityTypes: [value] }))
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="function">Functions</SelectItem>
                          <SelectItem value="class">Classes</SelectItem>
                          <SelectItem value="method">Methods</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label className="text-xs">Complexity Range</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number"
                          value={filterOptions.complexityRange[0]}
                          onChange={(e) => 
                            setFilterOptions(prev => ({
                              ...prev,
                              complexityRange: [parseInt(e.target.value), prev.complexityRange[1]]
                            }))
                          }
                          className="h-8"
                        />
                        <span className="text-xs">to</span>
                        <Input
                          type="number"
                          value={filterOptions.complexityRange[1]}
                          onChange={(e) => 
                            setFilterOptions(prev => ({
                              ...prev,
                              complexityRange: [prev.complexityRange[0], parseInt(e.target.value)]
                            }))
                          }
                          className="h-8"
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="show-issues"
                        checked={filterOptions.showOnlyIssues}
                        onCheckedChange={(checked) => 
                          setFilterOptions(prev => ({ ...prev, showOnlyIssues: checked as boolean }))
                        }
                      />
                      <Label htmlFor="show-issues" className="text-xs">
                        Show only with issues
                      </Label>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-sm font-medium">
                        {isConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
          
          {/* Main Content */}
          <div className="flex-1 overflow-auto">
            <div className="p-8">
              {selectedView === "explorer" && renderFileExplorer()}
              {selectedView === "analysis" && renderAnalysis()}
              {selectedView === "generation" && renderGeneration()}
              {selectedView === "collaboration" && renderCollaboration()}
            </div>
          </div>
        </div>
        
        {/* Create Generation Plan Dialog */}
        <Dialog open={showCreatePlan} onOpenChange={setShowCreatePlan}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Code Generation Plan</DialogTitle>
              <DialogDescription>
                Define objectives and parameters for AI-powered code generation
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label>Generation Objective</Label>
                <Textarea
                  placeholder="Describe what you want to generate..."
                  value={generationObjective}
                  onChange={(e) => setGenerationObjective(e.target.value)}
                  rows={3}
                />
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <RadioGroup value={generationScope} onValueChange={(value: any) => setGenerationScope(value)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="file" id="scope-file" />
                      <Label htmlFor="scope-file">Single File</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="module" id="scope-module" />
                      <Label htmlFor="scope-module">Module</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="system" id="scope-system" />
                      <Label htmlFor="scope-system">System-wide</Label>
                    </div>
                  </RadioGroup>
                </div>
                
                <div className="space-y-2">
                  <Label>Target Files</Label>
                  <div className="space-y-2">
                    {targetFiles.map((file, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Input
                          value={file}
                          onChange={(e) => {
                            const newFiles = [...targetFiles];
                            newFiles[index] = e.target.value;
                            setTargetFiles(newFiles);
                          }}
                          placeholder="src/module/file.py"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setTargetFiles(targetFiles.filter((_, i) => i !== index))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTargetFiles([...targetFiles, ""])}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Target File
                    </Button>
                  </div>
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
                        placeholder="e.g., Must be thread-safe"
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
                <Label>Quality Targets</Label>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm">Test Coverage</Label>
                      <span className="text-sm text-muted-foreground">{qualityTargets.testCoverage}%</span>
                    </div>
                    <Slider
                      value={[qualityTargets.testCoverage]}
                      onValueChange={(value) => 
                        setQualityTargets(prev => ({ ...prev, testCoverage: value[0] }))
                      }
                      max={100}
                      step={5}
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm">Max Complexity</Label>
                      <span className="text-sm text-muted-foreground">{qualityTargets.maxComplexity}</span>
                    </div>
                    <Slider
                      value={[qualityTargets.maxComplexity]}
                      onValueChange={(value) => 
                        setQualityTargets(prev => ({ ...prev, maxComplexity: value[0] }))
                      }
                      max={20}
                      step={1}
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm">Documentation Coverage</Label>
                      <span className="text-sm text-muted-foreground">{qualityTargets.documentationCoverage}%</span>
                    </div>
                    <Slider
                      value={[qualityTargets.documentationCoverage]}
                      onValueChange={(value) => 
                        setQualityTargets(prev => ({ ...prev, documentationCoverage: value[0] }))
                      }
                      max={100}
                      step={5}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreatePlan(false)}>
                Cancel
              </Button>
              <Button onClick={createGenerationPlan} disabled={!generationObjective}>
                Create Plan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Entity Details Sheet */}
        <Sheet open={showEntityDetails} onOpenChange={setShowEntityDetails}>
          <SheetContent className="w-[500px]">
            {selectedEntity && (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    {React.createElement(getEntityIcon(selectedEntity.entityType), { className: "w-5 h-5" })}
                    {selectedEntity.name}
                  </SheetTitle>
                  <SheetDescription>
                    {selectedEntity.filePath}
                  </SheetDescription>
                </SheetHeader>
                
                <div className="mt-6 space-y-6">
                  <div className="grid gap-4 grid-cols-2">
                    <Card>
                      <CardHeader className="p-3">
                        <CardTitle className="text-sm">Complexity</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className={`text-2xl font-bold ${getComplexityColor(selectedEntity.complexity)}`}>
                          {selectedEntity.complexity}
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="p-3">
                        <CardTitle className="text-sm">Lines of Code</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-2xl font-bold">{selectedEntity.lineCount}</div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="p-3">
                        <CardTitle className="text-sm">Test Coverage</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-2xl font-bold">{selectedEntity.testCoverage.toFixed(0)}%</div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="p-3">
                        <CardTitle className="text-sm">Location</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-sm">Lines {selectedEntity.lineStart}-{selectedEntity.lineEnd}</div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {selectedEntity.signature && (
                    <div>
                      <h4 className="font-medium mb-2">Signature</h4>
                      <div className="bg-muted p-3 rounded-lg">
                        <code className="text-sm">{selectedEntity.signature}</code>
                      </div>
                    </div>
                  )}
                  
                  {selectedEntity.docstring && (
                    <div>
                      <h4 className="font-medium mb-2">Documentation</h4>
                      <p className="text-sm text-muted-foreground">{selectedEntity.docstring}</p>
                    </div>
                  )}
                  
                  {selectedEntity.typeHints && Object.keys(selectedEntity.typeHints).length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Type Hints</h4>
                      <div className="space-y-1">
                        {Object.entries(selectedEntity.typeHints).map(([param, type]) => (
                          <div key={param} className="flex items-center justify-between text-sm">
                            <span className="font-mono">{param}</span>
                            <Badge variant="outline">{type}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedEntity.decorators && selectedEntity.decorators.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Decorators</h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedEntity.decorators.map((decorator, idx) => (
                          <Badge key={idx} variant="secondary">
                            {decorator}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Button className="w-full" variant="outline">
                      <Eye className="mr-2 h-4 w-4" />
                      View Source Code
                    </Button>
                    <Button className="w-full" variant="outline">
                      <GitPullRequest className="mr-2 h-4 w-4" />
                      Show Dependencies
                    </Button>
                    <Button className="w-full" variant="outline">
                      <TestTube className="mr-2 h-4 w-4" />
                      Generate Tests
                    </Button>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
        
        {/* Validation Dialog */}
        <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Code Validation</DialogTitle>
              <DialogDescription>
                Validate generated code against quality standards
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Syntax Check</span>
                  <Badge variant="default">Passed</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Style Guidelines</span>
                  <Badge variant="default">Passed</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Security Scan</span>
                  <Badge variant="default">Passed</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Performance</span>
                  <Badge variant="secondary">1 Warning</Badge>
                </div>
              </div>
              
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Performance Warning</AlertTitle>
                <AlertDescription>
                  Consider using async/await for database operations to improve performance.
                </AlertDescription>
              </Alert>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowValidationDialog(false)}>
                Close
              </Button>
              <Button>Apply Fixes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default CodeAnalysis;