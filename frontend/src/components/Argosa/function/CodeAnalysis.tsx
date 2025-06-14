// frontend/src/components/Argosa/function/CodeAnalysis.tsx

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Code2,
  FileCode,
  FolderOpen,
  Play,
  CheckCircle2,
  AlertTriangle,
  Bug,
  Zap,
  GitBranch,
  Terminal,
  Server,
  Brain,
  Sparkles,
  Package,
  Shield,
  TrendingUp,
  Copy,
  Download,
  RefreshCw,
  Eye,
  Loader2,
} from "lucide-react";

// Types
interface CodeFile {
  id: string;
  name: string;
  path: string;
  language: string;
  content: string;
  lastModified: string;
  size: number;
}

interface AnalysisResult {
  file: string;
  issues: CodeIssue[];
  suggestions: Suggestion[];
  metrics: CodeMetrics;
  securityIssues: SecurityIssue[];
}

interface CodeIssue {
  id: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule: string;
  fix?: string;
}

interface Suggestion {
  id: string;
  type: 'performance' | 'readability' | 'maintainability' | 'best-practice';
  description: string;
  impact: 'low' | 'medium' | 'high';
  example?: string;
}

interface CodeMetrics {
  complexity: number;
  maintainability: number;
  coverage: number;
  duplications: number;
  technicalDebt: string;
}

interface SecurityIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location: string;
  recommendation: string;
}

interface TestResult {
  status: 'running' | 'passed' | 'failed';
  passed: number;
  failed: number;
  total: number;
  duration: number;
  coverage: number;
  details: string;
}

const CodeAnalysis: React.FC = () => {
  const [selectedSystem, setSelectedSystem] = useState<'oneai' | 'argosa' | 'neuronet'>('argosa');
  const [selectedFile, setSelectedFile] = useState<CodeFile | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>([]);
  const [backupPath, setBackupPath] = useState<string>('');
  const [showModifications, setShowModifications] = useState(false);
  const [proposedChanges, setProposedChanges] = useState<string>('');

  // Load code files
  useEffect(() => {
    loadCodeFiles();
  }, [selectedSystem]);

  const loadCodeFiles = async () => {
    try {
      const response = await fetch(`/api/argosa/code/${selectedSystem}/files`);
      if (response.ok) {
        const data = await response.json();
        setCodeFiles(data);
      }
    } catch (error) {
      console.error('Failed to load code files:', error);
      // Use mock data for development
      setCodeFiles(mockCodeFiles[selectedSystem]);
    }
  };

  const analyzeCode = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/argosa/code/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: selectedSystem,
          file: selectedFile.path,
          content: selectedFile.content,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setAnalysisResult(result);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      // Use mock analysis result
      setAnalysisResult(mockAnalysisResult);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runTests = async () => {
    setIsTesting(true);
    setTestResult({
      status: 'running',
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0,
      coverage: 0,
      details: 'Running tests...'
    });

    try {
      // Create backup first
      const backupResponse = await fetch('/api/argosa/code/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: selectedSystem,
          files: codeFiles.map(f => f.path),
        }),
      });

      if (backupResponse.ok) {
        const { path } = await backupResponse.json();
        setBackupPath(path);
      }

      // Run tests
      const response = await fetch('/api/argosa/code/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: selectedSystem,
          backupPath: backupPath,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setTestResult(result);
      }
    } catch (error) {
      console.error('Test failed:', error);
      // Use mock test result
      setTestResult(mockTestResult);
    } finally {
      setIsTesting(false);
    }
  };

  const generateModifications = async () => {
    if (!analysisResult) return;

    try {
      const response = await fetch('/api/argosa/code/generate-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: selectedSystem,
          file: selectedFile?.path,
          issues: analysisResult.issues,
          suggestions: analysisResult.suggestions,
        }),
      });

      if (response.ok) {
        const { modifications } = await response.json();
        setProposedChanges(modifications);
        setShowModifications(true);
      }
    } catch (error) {
      console.error('Failed to generate modifications:', error);
      // Use mock modifications
      setProposedChanges(mockProposedChanges);
      setShowModifications(true);
    }
  };

  const applyModifications = async () => {
    try {
      const response = await fetch('/api/argosa/code/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: selectedSystem,
          modifications: proposedChanges,
          confirm: true,
        }),
      });

      if (response.ok) {
        alert('Modifications applied successfully!');
        setShowModifications(false);
        loadCodeFiles(); // Reload files
      }
    } catch (error) {
      console.error('Failed to apply modifications:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
      case 'critical':
        return 'text-red-600';
      case 'warning':
      case 'high':
        return 'text-yellow-600';
      case 'info':
      case 'medium':
        return 'text-blue-600';
      case 'low':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  const getLanguageIcon = (language: string) => {
    switch (language) {
      case 'python': return '🐍';
      case 'javascript': return '📜';
      case 'typescript': return '🔷';
      case 'react': return '⚛️';
      default: return '📄';
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Code Analysis & Optimization
          </h2>
          <p className="text-muted-foreground">
            AI-powered code review and automated improvements
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select 
            value={selectedSystem} 
            onValueChange={(value: any) => setSelectedSystem(value)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oneai">One AI</SelectItem>
              <SelectItem value="argosa">Argosa</SelectItem>
              <SelectItem value="neuronet">NeuroNet</SelectItem>
            </SelectContent>
          </Select>
          {backupPath && (
            <Badge variant="secondary" className="text-xs">
              <Server className="w-3 h-3 mr-1" />
              Backup: {backupPath}
            </Badge>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6">
        {/* File Explorer */}
        <Card className="w-80 flex-shrink-0">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Project Files
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-300px)]">
              <div className="p-4 space-y-1">
                {codeFiles.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${
                      selectedFile?.id === file.id 
                        ? 'bg-primary/10 border border-primary' 
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-lg">{getLanguageIcon(file.language)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{file.name}</div>
                      <div className="text-xs text-muted-foreground">{file.path}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {file.language}
                    </Badge>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Code Analysis */}
        <div className="flex-1 flex flex-col gap-6">
          {selectedFile ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FileCode className="w-5 h-5" />
                      {selectedFile.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={analyzeCode}
                        disabled={isAnalyzing}
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Brain className="w-4 h-4 mr-2" />
                            Analyze
                          </>
                        )}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={runTests}
                        disabled={isTesting}
                      >
                        {isTesting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Test
                          </>
                        )}
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="analysis" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="analysis">Analysis</TabsTrigger>
                      <TabsTrigger value="security">Security</TabsTrigger>
                      <TabsTrigger value="metrics">Metrics</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>

                    <TabsContent value="analysis" className="space-y-4">
                      {analysisResult ? (
                        <>
                          {/* Issues */}
                          <div>
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                              <Bug className="w-4 h-4" />
                              Issues ({analysisResult.issues.length})
                            </h4>
                            <div className="space-y-2">
                              {analysisResult.issues.map((issue) => (
                                <Alert key={issue.id} className="py-2">
                                  <AlertTriangle className={`h-4 w-4 ${getSeverityColor(issue.severity)}`} />
                                  <AlertTitle className="text-sm">
                                    Line {issue.line}:{issue.column} - {issue.rule}
                                  </AlertTitle>
                                  <AlertDescription className="text-xs">
                                    {issue.message}
                                    {issue.fix && (
                                      <Button
                                        variant="link"
                                        size="sm"
                                        className="p-0 h-auto ml-2 text-xs"
                                        onClick={() => {
                                          // Apply fix
                                        }}
                                      >
                                        Quick Fix
                                      </Button>
                                    )}
                                  </AlertDescription>
                                </Alert>
                              ))}
                            </div>
                          </div>

                          {/* Suggestions */}
                          <div>
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                              <Sparkles className="w-4 h-4" />
                              Suggestions ({analysisResult.suggestions.length})
                            </h4>
                            <div className="space-y-2">
                              {analysisResult.suggestions.map((suggestion) => (
                                <Card key={suggestion.id} className="p-3">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="outline" className="text-xs">
                                          {suggestion.type}
                                        </Badge>
                                        <Badge 
                                          variant={
                                            suggestion.impact === 'high' ? 'destructive' :
                                            suggestion.impact === 'medium' ? 'default' :
                                            'secondary'
                                          }
                                          className="text-xs"
                                        >
                                          {suggestion.impact} impact
                                        </Badge>
                                      </div>
                                      <p className="text-sm">{suggestion.description}</p>
                                      {suggestion.example && (
                                        <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                                          {suggestion.example}
                                        </pre>
                                      )}
                                    </div>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          </div>

                          {analysisResult.issues.length > 0 && (
                            <Button 
                              onClick={generateModifications}
                              className="w-full"
                            >
                              <Zap className="w-4 h-4 mr-2" />
                              Generate AI Fixes
                            </Button>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          Click "Analyze" to start code analysis
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="security" className="space-y-4">
                      {analysisResult?.securityIssues && analysisResult.securityIssues.length > 0 ? (
                        <div className="space-y-3">
                          {analysisResult.securityIssues.map((issue) => (
                            <Alert key={issue.id} variant={
                              issue.severity === 'critical' ? 'destructive' : 'default'
                            }>
                              <Shield className="h-4 w-4" />
                              <AlertTitle>
                                {issue.type} - {issue.severity.toUpperCase()}
                              </AlertTitle>
                              <AlertDescription>
                                <p className="mb-2">{issue.description}</p>
                                <p className="text-xs">Location: {issue.location}</p>
                                <p className="text-xs font-medium mt-2">
                                  Recommendation: {issue.recommendation}
                                </p>
                              </AlertDescription>
                            </Alert>
                          ))}
                        </div>
                      ) : (
                        <Alert>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <AlertTitle>No Security Issues Found</AlertTitle>
                          <AlertDescription>
                            The code has been scanned and no security vulnerabilities were detected.
                          </AlertDescription>
                        </Alert>
                      )}
                    </TabsContent>

                    <TabsContent value="metrics" className="space-y-4">
                      {analysisResult?.metrics && (
                        <div className="grid gap-4">
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-sm">Code Complexity</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <Progress value={analysisResult.metrics.complexity} className="mb-2" />
                              <p className="text-xs text-muted-foreground">
                                {analysisResult.metrics.complexity}/100
                              </p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-sm">Maintainability Index</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <Progress value={analysisResult.metrics.maintainability} className="mb-2" />
                              <p className="text-xs text-muted-foreground">
                                {analysisResult.metrics.maintainability}/100
                              </p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-sm">Test Coverage</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <Progress value={analysisResult.metrics.coverage} className="mb-2" />
                              <p className="text-xs text-muted-foreground">
                                {analysisResult.metrics.coverage}%
                              </p>
                            </CardContent>
                          </Card>
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-sm">Technical Debt</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-lg font-bold">{analysisResult.metrics.technicalDebt}</p>
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="preview" className="space-y-4">
                      <ScrollArea className="h-[400px] border rounded-lg p-4">
                        <pre className="text-sm">
                          <code>{selectedFile.content}</code>
                        </pre>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              {/* Test Results */}
              {testResult && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Terminal className="w-5 h-5" />
                      Test Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{testResult.passed}</p>
                        <p className="text-xs text-muted-foreground">Passed</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-red-600">{testResult.failed}</p>
                        <p className="text-xs text-muted-foreground">Failed</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{testResult.total}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{testResult.coverage}%</p>
                        <p className="text-xs text-muted-foreground">Coverage</p>
                      </div>
                    </div>
                    <ScrollArea className="h-[200px] border rounded p-4 bg-gray-50">
                      <pre className="text-xs">{testResult.details}</pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Code2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Select a file to start analysis</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modifications Dialog */}
      <Dialog open={showModifications} onOpenChange={setShowModifications}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Proposed Code Modifications</DialogTitle>
            <DialogDescription>
              Review the AI-generated improvements before applying
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] my-4">
            <pre className="text-sm p-4 bg-gray-50 rounded">
              <code>{proposedChanges}</code>
            </pre>
          </ScrollArea>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowModifications(false)}>
              Cancel
            </Button>
            <Button onClick={applyModifications}>
              Apply Modifications
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Mock data
const mockCodeFiles = {
  oneai: [
    {
      id: '1',
      name: 'pipeline.py',
      path: '/backend/oneai/pipeline.py',
      language: 'python',
      content: 'def process_animation():\n    # Animation processing logic\n    pass',
      lastModified: new Date().toISOString(),
      size: 1024,
    },
  ],
  argosa: [
    {
      id: '2',
      name: 'DataAnalysis.tsx',
      path: '/frontend/src/components/Argosa/function/DataAnalysis.tsx',
      language: 'typescript',
      content: 'export const DataAnalysis = () => {\n  return <div>Analysis</div>;\n};',
      lastModified: new Date().toISOString(),
      size: 2048,
    },
  ],
  neuronet: [
    {
      id: '3',
      name: 'model.py',
      path: '/backend/neuronet/model.py',
      language: 'python',
      content: 'class NeuralNetwork:\n    def __init__(self):\n        pass',
      lastModified: new Date().toISOString(),
      size: 512,
    },
  ],
};

const mockAnalysisResult: AnalysisResult = {
  file: 'DataAnalysis.tsx',
  issues: [
    {
      id: '1',
      line: 10,
      column: 5,
      severity: 'warning',
      message: 'Missing dependency in useEffect',
      rule: 'react-hooks/exhaustive-deps',
      fix: "Add 'loadData' to dependency array",
    },
  ],
  suggestions: [
    {
      id: '1',
      type: 'performance',
      description: 'Use React.memo to prevent unnecessary re-renders',
      impact: 'medium',
      example: 'export const DataAnalysis = React.memo(() => { ... });',
    },
  ],
  metrics: {
    complexity: 65,
    maintainability: 78,
    coverage: 82,
    duplications: 5,
    technicalDebt: '2h 15m',
  },
  securityIssues: [],
};

const mockTestResult: TestResult = {
  status: 'passed',
  passed: 45,
  failed: 2,
  total: 47,
  duration: 3.2,
  coverage: 82,
  details: `Test Suite: Argosa System
✓ Data Collection (1.2s)
✓ Data Analysis (0.8s)
✗ Prediction Model - timeout
✓ Scheduling (0.5s)
✗ Code Analysis - assertion failed
✓ User Input (0.7s)

Test run completed in 3.2s`,
};

const mockProposedChanges = `// AI-Generated Improvements

// Fix: Add missing dependency
- useEffect(() => {
-   loadData();
- }, []);
+ useEffect(() => {
+   loadData();
+ }, [loadData]);

// Optimization: Add React.memo
- export const DataAnalysis = () => {
+ export const DataAnalysis = React.memo(() => {
   // Component logic
- };
+ });

// Performance: Implement lazy loading
+ const LazyComponent = React.lazy(() => import('./HeavyComponent'));`;

export default CodeAnalysis;