// frontend/src/components/Argosa/function/codeanalysis/ProjectAnalysisPanel.tsx

import React, { useRef, useEffect } from "react";
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
import { Separator } from "@/components/ui/separator";
import {
  FileCode,
  Code2,
  GitBranch,
  AlertTriangle,
  RefreshCw,
  Loader2,
  TrendingUp,
  BarChart3,
  Package,
  Bug,
  FileText,
  Activity,
} from "lucide-react";
import { ProjectAnalysis, CodeEntity, ArchitecturePattern } from "./types";
import { ARCHITECTURE_PATTERNS, CODE_QUALITY_THRESHOLDS } from "./constants";

interface ProjectAnalysisPanelProps {
  projectAnalysis: ProjectAnalysis | null;
  analysisLoading: boolean;
  codeEntities: CodeEntity[];
  architecturePatterns: ArchitecturePattern[];
  onAnalyze: () => void;
  onSelectEntity: (entity: CodeEntity) => void;
}

export const ProjectAnalysisPanel: React.FC<ProjectAnalysisPanelProps> = ({
  projectAnalysis,
  analysisLoading,
  codeEntities,
  architecturePatterns,
  onAnalyze,
  onSelectEntity,
}) => {
  const dependencyGraphRef = useRef<HTMLDivElement>(null);
  const complexityChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dependencyGraphRef.current && projectAnalysis) {
      // Build dependency visualization
      buildDependencyVisualization(projectAnalysis.dependencyAnalysis);
    }
  }, [projectAnalysis]);

  useEffect(() => {
    if (complexityChartRef.current && codeEntities.length > 0) {
      // Build complexity visualization
      buildComplexityVisualization(codeEntities);
    }
  }, [codeEntities]);

  const buildDependencyVisualization = (dependencyData: any) => {
    // Simple HTML-based visualization
    const container = dependencyGraphRef.current;
    if (!container) return;
    
    container.innerHTML = '';
    
    const graphContainer = document.createElement('div');
    graphContainer.style.position = 'relative';
    graphContainer.style.width = '100%';
    graphContainer.style.height = '400px';
    graphContainer.style.overflow = 'hidden';
    
    // Add visualization logic here
    container.appendChild(graphContainer);
  };

  const buildComplexityVisualization = (entities: CodeEntity[]) => {
    // Build complexity chart
    const container = complexityChartRef.current;
    if (!container) return;
    
    container.innerHTML = '';
    
    // Add chart visualization logic here
  };

  const getComplexityBadge = (complexity: number) => {
    if (complexity <= CODE_QUALITY_THRESHOLDS.complexity.low) {
      return <Badge variant="default" className="bg-green-600">Low</Badge>;
    } else if (complexity <= CODE_QUALITY_THRESHOLDS.complexity.medium) {
      return <Badge variant="default" className="bg-yellow-600">Medium</Badge>;
    } else {
      return <Badge variant="destructive">High</Badge>;
    }
  };

  const getCoverageBadge = (coverage: number) => {
    if (coverage >= CODE_QUALITY_THRESHOLDS.testCoverage.good) {
      return <Badge variant="default" className="bg-green-600">{coverage}%</Badge>;
    } else if (coverage >= CODE_QUALITY_THRESHOLDS.testCoverage.fair) {
      return <Badge variant="default" className="bg-yellow-600">{coverage}%</Badge>;
    } else {
      return <Badge variant="destructive">{coverage}%</Badge>;
    }
  };

  if (!projectAnalysis) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">No analysis data available</p>
          <Button onClick={onAnalyze}>
            <BarChart3 className="w-4 h-4 mr-2" />
            Analyze Project
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Code Analysis</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onAnalyze}
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
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {projectAnalysis.qualityMetrics.averageComplexity.toFixed(1)}
              </div>
              <div className="mt-1">
                {getComplexityBadge(projectAnalysis.qualityMetrics.averageComplexity)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Test Coverage</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {projectAnalysis.qualityMetrics.testCoverageEstimate.toFixed(0)}%
              </div>
              <div className="mt-1">
                {getCoverageBadge(projectAnalysis.qualityMetrics.testCoverageEstimate)}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Architecture Patterns */}
        <Card>
          <CardHeader>
            <CardTitle>Architecture Patterns Detected</CardTitle>
            <CardDescription>
              Design patterns found in your codebase
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {projectAnalysis.patternsDetected.map((pattern) => {
                const config = ARCHITECTURE_PATTERNS[pattern.toLowerCase()];
                if (!config) return null;
                
                const Icon = config.icon;
                return (
                  <div
                    key={pattern}
                    className="flex items-center gap-2 p-2 rounded-lg border bg-muted/50"
                  >
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="text-sm font-medium">{pattern}</span>
                  </div>
                );
              })}
              {projectAnalysis.patternsDetected.length === 0 && (
                <p className="text-sm text-muted-foreground">No patterns detected</p>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Quality Issues */}
        <Card>
          <CardHeader>
            <CardTitle>Quality Issues</CardTitle>
            <CardDescription>
              Code quality problems that need attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* High Complexity Functions */}
              {projectAnalysis.qualityMetrics.highComplexityFunctions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    High Complexity Functions
                  </h4>
                  <div className="space-y-2">
                    {projectAnalysis.qualityMetrics.highComplexityFunctions.slice(0, 5).map((func) => (
                      <div
                        key={`${func.file}-${func.name}`}
                        className="flex items-center justify-between p-2 rounded-lg border hover:bg-accent cursor-pointer"
                      >
                        <div>
                          <span className="font-mono text-sm">{func.name}</span>
                          <p className="text-xs text-muted-foreground">{func.file}</p>
                        </div>
                        <Badge variant="destructive">
                          Complexity: {func.complexity}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Code Smells */}
              {projectAnalysis.qualityMetrics.codeSmells.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Bug className="w-4 h-4 text-red-600" />
                    Code Smells
                  </h4>
                  <div className="space-y-2">
                    {projectAnalysis.qualityMetrics.codeSmells.slice(0, 5).map((smell, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 rounded-lg border"
                      >
                        <div>
                          <span className="text-sm font-medium">{smell.type}</span>
                          <p className="text-xs text-muted-foreground">
                            {smell.entity} in {smell.file}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Dependency Graph */}
        <Card>
          <CardHeader>
            <CardTitle>Dependency Graph</CardTitle>
            <CardDescription>
              Visualization of code dependencies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div ref={dependencyGraphRef} className="w-full h-96 border rounded-lg" />
          </CardContent>
        </Card>
        
        {/* Improvement Opportunities */}
        <Card>
          <CardHeader>
            <CardTitle>Improvement Opportunities</CardTitle>
            <CardDescription>
              Suggestions to improve your codebase
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {projectAnalysis.improvementOpportunities.map((opportunity, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg border"
                >
                  <TrendingUp className={`w-5 h-5 mt-0.5 ${
                    opportunity.priority === "high" ? "text-red-600" :
                    opportunity.priority === "medium" ? "text-yellow-600" :
                    "text-green-600"
                  }`} />
                  <div className="flex-1">
                    <p className="font-medium">{opportunity.description}</p>
                    <Badge variant="outline" className="mt-1">
                      {opportunity.type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};