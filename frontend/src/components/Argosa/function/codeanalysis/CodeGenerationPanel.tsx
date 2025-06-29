// frontend/src/components/Argosa/function/codeanalysis/CodeGenerationPanel.tsx

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Play,
  CheckCircle2,
  MoreHorizontal,
  Copy,
  Download,
  Edit,
  ShieldCheck,
  ChevronRight,
  Wand2,
} from "lucide-react";
import { CodeGenerationPlan, CodeFragment } from "./types";

interface CodeGenerationPanelProps {
  generationPlans: CodeGenerationPlan[];
  activeGenerationPlan: CodeGenerationPlan | null;
  codeFragments: Record<string, CodeFragment[]>;
  generationStatus: "idle" | "planning" | "generating" | "completed";
  generationProgress: number;
  onCreatePlan: () => void;
  onExecutePlan: (planId: string) => void;
  onSelectPlan: (plan: CodeGenerationPlan) => void;
  onValidateFragment: (fragment: CodeFragment) => void;
}

export const CodeGenerationPanel: React.FC<CodeGenerationPanelProps> = ({
  generationPlans,
  activeGenerationPlan,
  codeFragments,
  generationStatus,
  generationProgress,
  onCreatePlan,
  onExecutePlan,
  onSelectPlan,
  onValidateFragment,
}) => {
  const [selectedFragmentType, setSelectedFragmentType] = useState<string>(
    Object.keys(codeFragments)[0] || ""
  );

  const handleCopyCode = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleExportFragment = (fragment: CodeFragment) => {
    const blob = new Blob([fragment.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fragment.fragmentType}_${fragment.fragmentId}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (generationPlans.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Wand2 className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            No generation plans yet.<br />
            Create your first plan to start generating code.
          </p>
          <Button className="mt-4" onClick={onCreatePlan}>
            <Plus className="w-4 h-4 mr-2" />
            Create Generation Plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Code Generation</h2>
        <Button onClick={onCreatePlan}>
          <Plus className="w-4 h-4 mr-2" />
          New Generation Plan
        </Button>
      </div>
      
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
                    {activeGenerationPlan.phases.map((phase, index) => (
                      <div key={phase.phaseId} className="flex items-center gap-2">
                        <CheckCircle2 className={`w-4 h-4 ${
                          generationProgress > ((index + 1) / activeGenerationPlan.phases.length * 100)
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
                  onClick={() => onExecutePlan(activeGenerationPlan.planId)}
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
              <Tabs value={selectedFragmentType} onValueChange={setSelectedFragmentType}>
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
                                  <DropdownMenuItem onClick={() => handleCopyCode(fragment.content)}>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy Code
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleExportFragment(fragment)}>
                                    <Download className="w-4 h-4 mr-2" />
                                    Export
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => onValidateFragment(fragment)}>
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
                  className={`flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer ${
                    activeGenerationPlan?.planId === plan.planId ? "bg-accent" : ""
                  }`}
                  onClick={() => onSelectPlan(plan)}
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
    </div>
  );
};