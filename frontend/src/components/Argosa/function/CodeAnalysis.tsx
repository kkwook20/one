// frontend/src/components/Argosa/function/CodeAnalysis.tsx - Real Data Version

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderTree,
  BarChart3,
  Wand2,
  Users,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

// Import types and constants
import {
  CodeEntity,
  ArchitecturePattern,
  CodeGenerationPlan,
  CodeFragment,
  ProjectAnalysis,
  CollaborationSession,
  FileNode,
  WebSocketMessage,
  FilterOptions,
  QualityTargets,
} from "./codeanalysis/types";
import { ARCHITECTURE_PATTERNS, API_ENDPOINTS, DEFAULT_QUALITY_TARGETS } from "./codeanalysis/constants";

// Import components
import { FileExplorer } from "./codeanalysis/FileExplorer";
import { ProjectAnalysisPanel } from "./codeanalysis/ProjectAnalysisPanel";
import { CodeGenerationPanel } from "./codeanalysis/CodeGenerationPanel";
import { CollaborationPanel } from "./codeanalysis/CollaborationPanel";

const CodeAnalysis: React.FC = () => {
  // ===== State Management =====
  
  // View state
  const [selectedView, setSelectedView] = useState<"explorer" | "analysis" | "generation" | "collaboration">("explorer");
  
  // Project analysis state
  const [projectPath, setProjectPath] = useState<string>("");
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [projectAnalysis, setProjectAnalysis] = useState<ProjectAnalysis | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [codeEntities, setCodeEntities] = useState<CodeEntity[]>([]);
  const [architecturePatterns, setArchitecturePatterns] = useState<ArchitecturePattern[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    entityTypes: [],
    complexityRange: [0, 20],
    showOnlyIssues: false
  });
  
  // Code generation state
  const [generationPlans, setGenerationPlans] = useState<CodeGenerationPlan[]>([]);
  const [activeGenerationPlan, setActiveGenerationPlan] = useState<CodeGenerationPlan | null>(null);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "planning" | "generating" | "completed">("idle");
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [codeFragments, setCodeFragments] = useState<Record<string, CodeFragment[]>>({});
  const [qualityTargets, setQualityTargets] = useState<QualityTargets>(DEFAULT_QUALITY_TARGETS);
  
  // Dialog states
  const [showCreatePlan, setShowCreatePlan] = useState<boolean>(false);
  const [generationObjective, setGenerationObjective] = useState<string>("");
  const [generationScope, setGenerationScope] = useState<"file" | "module" | "system">("file");
  const [constraints, setConstraints] = useState<string>("");
  
  // Collaboration state
  const [isCollaborating, setIsCollaborating] = useState<boolean>(false);
  const [collaborationSession, setCollaborationSession] = useState<CollaborationSession | null>(null);
  const [wsRef] = useState<React.MutableRefObject<WebSocket | null>>({ current: null });
  const [reconnectTimeoutRef] = useState<React.MutableRefObject<NodeJS.Timeout | null>>({ current: null });
  
  // Error state
  const [error, setError] = useState<string | null>(null);
  
  // ===== API Functions =====
  
  const analyzeProject = async () => {
    if (!projectPath.trim()) {
      setError("프로젝트 경로를 입력해주세요.");
      return;
    }
    
    setAnalysisLoading(true);
    setError(null);
    
    try {
      const response = await fetch(API_ENDPOINTS.analyzeProject, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          project_path: projectPath,
          include_entities: true,
          include_patterns: true,
          include_quality_metrics: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`분석 실패: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Process analysis data
      const analysis: ProjectAnalysis = {
        timestamp: data.timestamp || new Date().toISOString(),
        rootPath: data.root_path || projectPath,
        statistics: data.statistics,
        architecture: data.architecture,
        qualityMetrics: data.quality_metrics,
        patternsDetected: data.patterns_detected || [],
        improvementOpportunities: data.improvement_opportunities || [],
        dependencyAnalysis: data.dependency_analysis,
        complexityAnalysis: data.complexity_analysis || {},
        testCoverageAnalysis: data.test_coverage_analysis || {}
      };
      
      setProjectAnalysis(analysis);
      
      // Process entities
      if (data.entities) {
        setCodeEntities(data.entities);
      }
      
      // Build file tree
      if (data.files) {
        const tree = buildFileTree(data.files);
        setFileTree(tree);
      }
      
      // Extract patterns
      if (data.patterns_detected) {
        const patterns = data.patterns_detected.map((p: string) => createPatternFromName(p));
        setArchitecturePatterns(patterns);
      }
      
    } catch (error) {
      console.error("Failed to analyze project:", error);
      setError(error instanceof Error ? error.message : "프로젝트 분석에 실패했습니다.");
    } finally {
      setAnalysisLoading(false);
    }
  };
  
  const createGenerationPlan = async () => {
    if (!generationObjective.trim()) {
      setError("생성 목표를 입력해주세요.");
      return;
    }
    
    try {
      const response = await fetch(API_ENDPOINTS.createPlan, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: generationObjective,
          scope: generationScope,
          constraints,
          test_coverage: qualityTargets.testCoverage,
          max_complexity: qualityTargets.maxComplexity,
          context: {
            project_analysis: projectAnalysis,
            selected_files: Array.from(selectedFiles)
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`계획 생성 실패: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const plan = data.plan as CodeGenerationPlan;
      
      setGenerationPlans(prev => [...prev, plan]);
      setActiveGenerationPlan(plan);
      setShowCreatePlan(false);
      setGenerationObjective("");
      setConstraints("");
      
    } catch (error) {
      console.error("Failed to create generation plan:", error);
      setError(error instanceof Error ? error.message : "코드 생성 계획 생성에 실패했습니다.");
    }
  };
  
  const executeGenerationPlan = async (planId: string) => {
    setGenerationStatus("generating");
    setGenerationProgress(0);
    
    try {
      const response = await fetch(API_ENDPOINTS.executePlan.replace(":planId", planId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          include_validation: true,
          generate_tests: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`실행 실패: ${response.status} ${response.statusText}`);
      }
      
      // Handle streaming response for progress updates
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === "progress") {
                  setGenerationProgress(data.progress);
                } else if (data.type === "fragment") {
                  const fragment = data.fragment as CodeFragment;
                  setCodeFragments(prev => ({
                    ...prev,
                    [fragment.fragmentType]: [...(prev[fragment.fragmentType] || []), fragment]
                  }));
                } else if (data.type === "completed") {
                  setGenerationStatus("completed");
                  setGenerationProgress(100);
                }
              } catch (e) {
                console.warn("Failed to parse SSE data:", e);
              }
            }
          }
        }
      }
      
    } catch (error) {
      console.error("Failed to execute generation plan:", error);
      setError(error instanceof Error ? error.message : "코드 생성 실행에 실패했습니다.");
      setGenerationStatus("idle");
    }
  };
  
  const validateCode = async (code: string, language: string) => {
    try {
      const response = await fetch(API_ENDPOINTS.validateCode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language })
      });
      
      if (!response.ok) {
        throw new Error(`검증 실패: ${response.status} ${response.statusText}`);
      }
      
      const validation = await response.json();
      return validation;
      
    } catch (error) {
      console.error("Failed to validate code:", error);
      // Return error state instead of mock data
      return {
        syntax: { valid: false, error: "서버 연결 실패" },
        style: { valid: false, issues: [{ type: "error", message: "검증 실패", severity: "error" as const }] },
        complexity: { valid: false, error: "복잡도 분석 실패" },
        security: { valid: false, issues: [{ type: "error", message: "보안 검증 실패", severity: "error" as const }] },
        performance: { valid: false, issues: [{ type: "error", message: "성능 검증 실패", severity: "error" as const }] }
      };
    }
  };
  
  const createCollaborationSession = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.createSession, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: generationObjective || "Code analysis and generation",
          project_context: projectAnalysis
        })
      });
      
      if (!response.ok) {
        throw new Error(`세션 생성 실패: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      const session = data.session as CollaborationSession;
      
      setCollaborationSession(session);
      setIsCollaborating(true);
      
    } catch (error) {
      console.error("Failed to create collaboration session:", error);
      setError(error instanceof Error ? error.message : "협업 세션 생성에 실패했습니다.");
    }
  };
  
  // ===== Helper Functions =====
  
  const buildFileTree = (filesData: any[]): FileNode[] => {
    const fileMap = new Map<string, FileNode>();
    const rootNodes: FileNode[] = [];
    
    // Sort files to process directories first
    const sortedFiles = filesData.sort((a, b) => {
      if (a.type === "directory" && b.type === "file") return -1;
      if (a.type === "file" && b.type === "directory") return 1;
      return a.path.localeCompare(b.path);
    });
    
    for (const fileData of sortedFiles) {
      const node: FileNode = {
        id: fileData.path,
        name: fileData.name,
        path: fileData.path,
        type: fileData.type,
        language: fileData.language,
        size: fileData.size,
        lastModified: fileData.last_modified,
        analysis: fileData.analysis
      };
      
      fileMap.set(fileData.path, node);
      
      const parentPath = fileData.path.substring(0, fileData.path.lastIndexOf('/'));
      if (parentPath && fileMap.has(parentPath)) {
        const parent = fileMap.get(parentPath)!;
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }
    
    return rootNodes;
  };
  
  const createPatternFromName = (patternName: string): ArchitecturePattern => {
    const patternKey = patternName.toLowerCase();
    const patternInfo = ARCHITECTURE_PATTERNS[patternKey];
    if (patternInfo) {
      return {
        patternName,
        patternType: patternKey as any,
        components: [],
        relationships: [],
        constraints: [],
        benefits: [],
        drawbacks: [],
        whenToUse: patternInfo.description,
        implementationGuide: {}
      };
    }
    
    // Create basic pattern if not found
    return {
      patternName,
      patternType: "mvc",
      components: [],
      relationships: [],
      constraints: [],
      benefits: [],
      drawbacks: [],
      whenToUse: "Pattern detected in codebase",
      implementationGuide: {}
    };
  };
  
  // ===== WebSocket Functions =====
  
  const connectWebSocket = useCallback(() => {
    if (!collaborationSession?.sessionId) return;
    
    const wsUrl = `ws://localhost:8000/api/argosa/code/ws/collaboration/${collaborationSession.sessionId}`;
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      console.log("WebSocket connected");
    };
    
    wsRef.current.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };
    
    wsRef.current.onclose = () => {
      console.log("WebSocket disconnected");
      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };
    
    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }, [collaborationSession?.sessionId, reconnectTimeoutRef, wsRef]);
  
  const handleWebSocketMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case "participant_joined":
        setCollaborationSession(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            participants: {
              ...prev.participants,
              [message.data.participantId]: { status: "connected" }
            }
          };
        });
        break;
        
      case "code_update":
        // Handle real-time code updates
        setCodeFragments(prev => ({
          ...prev,
          [message.data.fragmentType]: message.data.fragments
        }));
        break;
        
      case "analysis_update":
        // Handle real-time analysis updates
        if (message.data.analysis) {
          setProjectAnalysis(message.data.analysis);
        }
        break;
        
      default:
        console.log("Unknown WebSocket message type:", message.type);
    }
  };
  
  const sendCollaborationMessage = (type: string, content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type,
        sessionId: collaborationSession?.sessionId,
        data: { content },
        timestamp: new Date().toISOString()
      }));
    }
  };
  
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
  }, [isCollaborating, connectWebSocket, reconnectTimeoutRef, wsRef]);
  
  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  
  // ===== Render =====
  
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Error Banner */}
        {error && (
          <div className="bg-destructive text-destructive-foreground p-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          </div>
        )}
        
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
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Project Analysis
                </Button>
                <Button
                  variant={selectedView === "generation" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("generation")}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Code Generation
                </Button>
                <Button
                  variant={selectedView === "collaboration" ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedView("collaboration")}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Collaboration
                </Button>
              </nav>
              
              {/* Project Path Input */}
              <div className="p-3 border-t">
                <Label htmlFor="projectPath" className="text-sm font-medium">Project Path</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="projectPath"
                    placeholder="/path/to/project"
                    value={projectPath}
                    onChange={(e) => setProjectPath(e.target.value)}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={analyzeProject}
                    disabled={analysisLoading}
                  >
                    {analysisLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <BarChart3 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Main Content */}
          <div className="flex-1 overflow-hidden">
            {selectedView === "explorer" && (
              <FileExplorer
                projectPath={projectPath}
                fileTree={fileTree}
                selectedFile={null}
                searchQuery=""
                expandedNodes={new Set()}
                onProjectPathChange={setProjectPath}
                onAnalyze={analyzeProject}
                onSelectFile={() => {}}
                onSearchChange={() => {}}
                onToggleNode={() => {}}
                onSelectEntity={() => {}}
                onShowEntityDetails={() => {}}
              />
            )}
            
            {selectedView === "analysis" && (
              <ProjectAnalysisPanel
                projectAnalysis={projectAnalysis}
                analysisLoading={analysisLoading}
                codeEntities={codeEntities}
                architecturePatterns={architecturePatterns}
                onAnalyze={analyzeProject}
                onSelectEntity={() => {}}
              />
            )}
            
            {selectedView === "generation" && (
              <CodeGenerationPanel
                generationPlans={generationPlans}
                activeGenerationPlan={activeGenerationPlan}
                generationStatus={generationStatus}
                generationProgress={generationProgress}
                codeFragments={codeFragments}
                onCreatePlan={() => setShowCreatePlan(true)}
                onExecutePlan={executeGenerationPlan}
                onSelectPlan={() => {}}
                onValidateFragment={() => {}}
              />
            )}
            
            {selectedView === "collaboration" && (
              <CollaborationPanel
                isCollaborating={isCollaborating}
                isConnected={wsRef.current?.readyState === WebSocket.OPEN}
                collaborationSession={collaborationSession}
                collaborationMessages={[]}
                onStartCollaboration={createCollaborationSession}
                onSendMessage={sendCollaborationMessage}
              />
            )}
          </div>
        </div>
        
        {/* Create Generation Plan Dialog */}
        <Dialog open={showCreatePlan} onOpenChange={setShowCreatePlan}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Create Generation Plan</DialogTitle>
              <DialogDescription>
                Define your code generation objectives and constraints.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="objective">Generation Objective</Label>
                <Textarea
                  id="objective"
                  placeholder="Describe what you want to generate..."
                  value={generationObjective}
                  onChange={(e) => setGenerationObjective(e.target.value)}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="scope">Scope</Label>
                <Select value={generationScope} onValueChange={(value: "file" | "module" | "system") => setGenerationScope(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="file">Single File</SelectItem>
                    <SelectItem value="module">Module</SelectItem>
                    <SelectItem value="system">Full System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="constraints">Constraints</Label>
                <Textarea
                  id="constraints"
                  placeholder="Any specific requirements or limitations..."
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreatePlan(false)}>
                Cancel
              </Button>
              <Button onClick={createGenerationPlan} disabled={!generationObjective.trim()}>
                Create Plan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default CodeAnalysis;