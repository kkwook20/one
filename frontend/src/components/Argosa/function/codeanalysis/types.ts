// frontend/src/components/Argosa/function/codeanalysis/types.ts

export interface CodeEntity {
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

export interface ArchitecturePattern {
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

export interface CodeGenerationPlan {
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

export interface CodeFragment {
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

export interface ProjectAnalysis {
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

export interface CollaborationSession {
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

export interface FileNode {
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

export interface ValidationResult {
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

export interface WebSocketMessage {
  type: string;
  sessionId?: string;
  data?: any;
  timestamp: string;
}

export interface QualityTargets {
  testCoverage: number;
  maxComplexity: number;
  documentationCoverage: number;
}

export interface FilterOptions {
  entityTypes: string[];
  complexityRange: [number, number];
  showOnlyIssues: boolean;
}