// frontend/src/components/Argosa/function/dataanalysis/Workflows.tsx
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  DATA_SOURCE_SUGGESTIONS, 
  CONSTRAINT_TEMPLATES, 
  BUSINESS_GOALS_EXAMPLES,
  ANALYSIS_OBJECTIVES_EXAMPLES 
} from "./WorkflowConstants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  PauseCircle,
  Play,
  PlayCircle,
  Plus,
  X,
  Info,
} from "lucide-react";
import type { Workflow, WorkflowState, AnalysisWorkflowState } from "../DataAnalysis";

interface WorkflowsProps {
  workflows: Workflow[];
  activeWorkflow: Workflow | null;
  WORKFLOW_PHASES: {
    code: Array<{ id: string; name: string; progress: number }>;
    analysis: Array<{ id: string; name: string; progress: number }>;
  };
  onCreateWorkflow: (
    analysisType: string,
    analysisObjective: string,
    dataSources: string[],
    constraints: string[],
    businessGoals: string[],
    priority: "low" | "normal" | "high" | "critical"
  ) => Promise<void>;
  onSelectWorkflow: (workflow: Workflow | null) => void;
  onRefreshWorkflows: () => void;
}

// ONE AI 개선 작업 타입 정의
const IMPROVEMENT_TYPES = [
  { value: "add_feature", label: "Add New Feature", description: "Add new functionality to ONE AI" },
  { value: "improve_performance", label: "Improve Performance", description: "Optimize existing features" },
  { value: "fix_bug", label: "Fix Bug", description: "Resolve issues in ONE AI" },
  { value: "refactor_code", label: "Refactor Code", description: "Improve code quality" },
  { value: "integrate_system", label: "System Integration", description: "Connect with external systems" },
  { value: "enhance_ui", label: "Enhance UI", description: "Improve user interface" },
];

// 구체적인 작업 템플릿
const TASK_TEMPLATES = {
  add_feature: [
    { id: "node", label: "Create New Node", fields: ["nodeName", "nodeType", "inputs", "outputs"] },
    { id: "ui_component", label: "Add UI Component", fields: ["componentName", "location", "functionality"] },
    { id: "api", label: "Add API Endpoint", fields: ["endpoint", "method", "purpose"] },
  ],
  improve_performance: [
    { id: "optimize_rendering", label: "Optimize Rendering", fields: ["targetArea", "currentMetrics"] },
    { id: "reduce_memory", label: "Reduce Memory Usage", fields: ["component", "currentUsage"] },
    { id: "speed_up", label: "Speed Up Process", fields: ["process", "targetReduction"] },
  ],
  enhance_ui: [
    { id: "new_panel", label: "Add New Panel", fields: ["panelName", "location", "content"] },
    { id: "improve_ux", label: "Improve UX", fields: ["area", "issue", "solution"] },
    { id: "add_visualization", label: "Add Visualization", fields: ["dataType", "chartType", "location"] },
  ],
};

// 정보 수집 전략
const INFO_GATHERING_STRATEGIES = {
  technical_docs: "Search technical documentation and tutorials",
  code_examples: "Find similar implementations and code samples",
  best_practices: "Research industry best practices",
  community_solutions: "Check community forums and discussions",
  llm_consultation: "Consult multiple LLMs for solutions",
  internal_analysis: "Analyze existing ONE AI codebase",
};

const Workflows: React.FC<WorkflowsProps> = ({
  workflows,
  activeWorkflow,
  WORKFLOW_PHASES,
  onCreateWorkflow,
  onSelectWorkflow,
  onRefreshWorkflows,
}) => {
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false);
  const [showWorkflowDetails, setShowWorkflowDetails] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  
  // Form state - 구조화된 입력
  const [improvementType, setImprovementType] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [taskDetails, setTaskDetails] = useState<Record<string, string>>({});
  const [gatheringStrategies, setGatheringStrategies] = useState<string[]>([]);
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [successCriteria, setSuccessCriteria] = useState<string[]>([]);
  const [dataSources, setDataSources] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "critical">("normal");
  
  // Project analysis state
  const [projectInfo, setProjectInfo] = useState<{
    data_sources: string[];
    suggested_constraints: string[];
    detected_patterns: string[];
    recommended_objectives: string[];
  }>({
    data_sources: [],
    suggested_constraints: [],
    detected_patterns: [],
    recommended_objectives: []
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Analyze project when dialog opens
  const analyzeProject = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/argosa/analysis/project/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json();
      
      if (data.status === "success") {
        setProjectInfo(data.project_info);
        
        // Auto-select relevant data sources
        if (data.project_info.data_sources.length > 0) {
          setDataSources(data.project_info.data_sources.slice(0, 3));
        }
        
        // Auto-select suggested constraints
        if (data.project_info.suggested_constraints.length > 0) {
          setConstraints(data.project_info.suggested_constraints.slice(0, 3));
        }
      }
    } catch (error) {
      console.error("Failed to analyze project:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const generateStructuredObjective = () => {
    // 구조화된 objective 생성
    const objective = {
      improvement_type: improvementType,
      task_template: selectedTemplate,
      task_details: taskDetails,
      expected_outcome: expectedOutcome,
      success_criteria: successCriteria,
      gathering_strategies: gatheringStrategies,
    };
    
    // 명확한 텍스트 형식으로 변환
    const objectiveText = `
IMPROVEMENT_TYPE: ${improvementType}
TASK: ${selectedTemplate}
DETAILS:
${Object.entries(taskDetails).map(([key, value]) => `- ${key}: ${value}`).join('\n')}
EXPECTED_OUTCOME: ${expectedOutcome}
SUCCESS_CRITERIA:
${successCriteria.map(c => `- ${c}`).join('\n')}
INFO_GATHERING:
${gatheringStrategies.map(s => `- ${s}`).join('\n')}
    `.trim();
    
    return objectiveText;
  };
  
  const handleCreateWorkflow = async () => {
    const structuredObjective = generateStructuredObjective();
    
    // business goals를 success criteria로 사용
    await onCreateWorkflow(
      "oneai_improvement", // 새로운 분석 타입
      structuredObjective,
      dataSources,
      constraints,
      successCriteria, // business goals 대신 success criteria 사용
      priority
    );
    
    setShowCreateWorkflow(false);
    resetForm();
  };
  
  const resetForm = () => {
    setImprovementType("");
    setSelectedTemplate("");
    setTaskDetails({});
    setGatheringStrategies([]);
    setExpectedOutcome("");
    setSuccessCriteria([]);
    setDataSources([]);
    setConstraints([]);
    setPriority("normal");
    setProjectInfo({
      data_sources: [],
      suggested_constraints: [],
      detected_patterns: [],
      recommended_objectives: []
    });
  };
  
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };
  
  const filteredWorkflows = workflows.filter(wf => {
    if (selectedFilter === "all") return true;
    if (selectedFilter === "executing") return wf.status === "executing";
    if (selectedFilter === "completed") return wf.status === "completed";
    if (selectedFilter === "failed") return wf.status === "failed";
    if (selectedFilter === "code") return wf.type === "code";
    if (selectedFilter === "analysis") return wf.type === "analysis";
    return true;
  });
  
  // 현재 선택된 템플릿의 필드 가져오기
  const getCurrentTemplateFields = () => {
    if (!improvementType || !selectedTemplate) return [];
    const templates = TASK_TEMPLATES[improvementType as keyof typeof TASK_TEMPLATES];
    const template = templates?.find(t => t.id === selectedTemplate);
    return template?.fields || [];
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Workflows</h2>
      </div>
      
      {/* Workflow filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Filters</CardTitle>
            <Button onClick={() => setShowCreateWorkflow(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Create ONE AI Improvement Workflow
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {["all", "executing", "completed", "failed", "code", "analysis"].map((filter) => (
              <Badge
                key={filter}
                variant={selectedFilter === filter ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedFilter(filter)}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredWorkflows.map((workflow) => (
          <Card 
            key={workflow.id} 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => {
              onSelectWorkflow(workflow);
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
      
      {/* Create Workflow Dialog - 구조화된 폼 */}
      <Dialog open={showCreateWorkflow} onOpenChange={(open) => {
        setShowCreateWorkflow(open);
        if (open) {
          analyzeProject();
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create ONE AI Improvement Workflow</DialogTitle>
            <DialogDescription>
              Define a specific improvement task for ONE AI system
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Step 1: 개선 타입 선택 */}
            <div className="space-y-2">
              <Label>1. What do you want to improve?</Label>
              <Select value={improvementType} onValueChange={setImprovementType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select improvement type" />
                </SelectTrigger>
                <SelectContent>
                  {IMPROVEMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Step 2: 구체적인 작업 선택 */}
            {improvementType && (
              <div className="space-y-2">
                <Label>2. Select specific task</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TASK_TEMPLATES[improvementType as keyof typeof TASK_TEMPLATES]?.map((template) => (
                    <Card 
                      key={template.id}
                      className={`cursor-pointer transition-colors ${
                        selectedTemplate === template.id ? 'border-primary' : ''
                      }`}
                      onClick={() => setSelectedTemplate(template.id)}
                    >
                      <CardHeader className="p-3">
                        <CardTitle className="text-sm">{template.label}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            
            {/* Step 3: 작업 상세 정보 입력 */}
            {selectedTemplate && (
              <div className="space-y-2">
                <Label>3. Task Details</Label>
                <div className="space-y-3 border rounded-lg p-3">
                  {getCurrentTemplateFields().map((field) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-sm capitalize">{field.replace(/([A-Z])/g, ' $1').trim()}</Label>
                      <Input
                        value={taskDetails[field] || ""}
                        onChange={(e) => setTaskDetails({...taskDetails, [field]: e.target.value})}
                        placeholder={`Enter ${field}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Step 4: 정보 수집 전략 */}
            <div className="space-y-2">
              <Label>4. Information Gathering Strategy</Label>
              <div className="space-y-2 border rounded-lg p-3">
                {Object.entries(INFO_GATHERING_STRATEGIES).map(([key, description]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`strategy-${key}`}
                      checked={gatheringStrategies.includes(key)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setGatheringStrategies([...gatheringStrategies, key]);
                        } else {
                          setGatheringStrategies(gatheringStrategies.filter(s => s !== key));
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor={`strategy-${key}`} className="text-sm cursor-pointer flex-1">
                      {description}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Step 5: 예상 결과 */}
            <div className="space-y-2">
              <Label>5. Expected Outcome</Label>
              <Textarea
                placeholder="Describe what you expect to achieve..."
                value={expectedOutcome}
                onChange={(e) => setExpectedOutcome(e.target.value)}
                rows={3}
              />
            </div>
            
            {/* Step 6: 성공 기준 */}
            <div className="space-y-2">
              <Label>6. Success Criteria</Label>
              <div className="space-y-2">
                {successCriteria.map((criteria, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={criteria}
                      onChange={(e) => {
                        const updated = [...successCriteria];
                        updated[index] = e.target.value;
                        setSuccessCriteria(updated);
                      }}
                      placeholder="e.g., Rendering speed improved by 50%"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSuccessCriteria(successCriteria.filter((_, i) => i !== index))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSuccessCriteria([...successCriteria, ""])}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Success Criteria
                </Button>
              </div>
            </div>
            
            {/* Data Sources - 기존 유지 */}
            <div className="space-y-2">
              <Label>Data Sources</Label>
              {isAnalyzing ? (
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing project structure...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {projectInfo.data_sources.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                      {projectInfo.data_sources.map((source, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`source-${index}`}
                            checked={dataSources.includes(source)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setDataSources([...dataSources, source]);
                              } else {
                                setDataSources(dataSources.filter(s => s !== source));
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <label htmlFor={`source-${index}`} className="text-sm cursor-pointer flex-1">
                            {source}
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No data sources detected. You can still proceed with manual configuration.
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Constraints */}
            <div className="space-y-2">
              <Label>Constraints</Label>
              {projectInfo.suggested_constraints.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                  {projectInfo.suggested_constraints.map((constraint, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`constraint-${index}`}
                        checked={constraints.includes(constraint)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setConstraints([...constraints, constraint]);
                          } else {
                            setConstraints(constraints.filter(c => c !== constraint));
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <label htmlFor={`constraint-${index}`} className="text-sm cursor-pointer flex-1">
                        {constraint}
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No constraints suggested. Workflow will run with default settings.
                </div>
              )}
            </div>
            
            {/* Priority */}
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
            
            {/* Preview of structured objective */}
            {improvementType && selectedTemplate && expectedOutcome && (
              <div className="space-y-2">
                <Label>
                  <Info className="inline h-4 w-4 mr-1" />
                  Structured Objective Preview
                </Label>
                <Card>
                  <CardContent className="p-3">
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {generateStructuredObjective()}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateWorkflow(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateWorkflow} 
              disabled={!improvementType || !selectedTemplate || !expectedOutcome || successCriteria.length === 0 || isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing Project...
                </>
              ) : (
                "Create Workflow"
              )}
            </Button>
          </DialogFooter>
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
    </div>
  );
};

export default Workflows;