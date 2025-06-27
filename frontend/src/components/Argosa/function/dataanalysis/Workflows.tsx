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
  
  // Form state
  const [analysisType, setAnalysisType] = useState<"data_analysis" | "code" | "hybrid">("data_analysis");
  const [analysisObjective, setAnalysisObjective] = useState("");
  const [dataSources, setDataSources] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [businessGoals, setBusinessGoals] = useState<string[]>([]);
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "critical">("normal");
  
  const handleCreateWorkflow = async () => {
    await onCreateWorkflow(
      analysisType,
      analysisObjective,
      dataSources,
      constraints,
      businessGoals,
      priority
    );
    setShowCreateWorkflow(false);
    resetForm();
  };
  
  const resetForm = () => {
    setAnalysisObjective("");
    setDataSources([]);
    setConstraints([]);
    setBusinessGoals([]);
    setPriority("normal");
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
  
  return (
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
            <Button onClick={handleCreateWorkflow} disabled={!analysisObjective}>
              Create Workflow
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