// frontend/src/components/Argosa/function/codeanalysis/utils.ts

import {
  FileCode2,
  Code2,
  Box,
  Variable,
  FileInput,
  CircleDot,
  Bug,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { CODE_QUALITY_THRESHOLDS } from "./constants";

export const getEntityIcon = (entityType: string) => {
  switch (entityType) {
    case "function":
    case "async_function":
      return Code2;
    case "class":
      return Box;
    case "method":
      return Code2;
    case "variable":
      return Variable;
    case "import":
      return FileInput;
    case "constant":
      return CircleDot;
    default:
      return FileCode2;
  }
};

export const getComplexityColor = (complexity: number): string => {
  if (complexity <= CODE_QUALITY_THRESHOLDS.complexity.low) {
    return "text-green-600";
  } else if (complexity <= CODE_QUALITY_THRESHOLDS.complexity.medium) {
    return "text-yellow-600";
  } else {
    return "text-red-600";
  }
};

export const getIssueIcon = (issueType: string) => {
  switch (issueType) {
    case "error":
      return XCircle;
    case "warning":
      return AlertTriangle;
    case "info":
      return Bug;
    default:
      return AlertTriangle;
  }
};

export const getValidationIcon = (status: string) => {
  switch (status) {
    case "passed":
      return CheckCircle;
    case "failed":
      return XCircle;
    case "pending":
      return AlertTriangle;
    default:
      return AlertTriangle;
  }
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
};

export const getLanguageFromPath = (path: string): string => {
  const extension = path.split('.').pop()?.toLowerCase();
  
  const languageMap: Record<string, string> = {
    "py": "python",
    "js": "javascript",
    "jsx": "react",
    "ts": "typescript",
    "tsx": "react",
    "java": "java",
    "cpp": "cpp",
    "cc": "cpp",
    "cxx": "cpp",
    "hpp": "cpp",
    "h": "cpp",
    "cs": "csharp",
    "go": "go",
    "rs": "rust",
  };
  
  return languageMap[extension || ""] || "text";
};

export const calculateQualityScore = (metrics: {
  complexity: number;
  testCoverage: number;
  documentationCoverage: number;
}): number => {
  // Complexity score (lower is better)
  const complexityScore = Math.max(0, 100 - metrics.complexity * 5);
  
  // Test coverage score
  const testScore = metrics.testCoverage;
  
  // Documentation score
  const docScore = metrics.documentationCoverage;
  
  // Weighted average
  return (complexityScore * 0.3 + testScore * 0.4 + docScore * 0.3);
};

export const groupEntitiesByType = <T extends { entityType: string }>(
  entities: T[]
): Record<string, T[]> => {
  return entities.reduce((acc, entity) => {
    const type = entity.entityType;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(entity);
    return acc;
  }, {} as Record<string, T[]>);
};

export const filterEntitiesByComplexity = <T extends { complexity: number }>(
  entities: T[],
  minComplexity: number,
  maxComplexity: number
): T[] => {
  return entities.filter(
    entity => entity.complexity >= minComplexity && entity.complexity <= maxComplexity
  );
};

export const searchEntities = <T extends { name: string; filePath: string }>(
  entities: T[],
  query: string
): T[] => {
  const lowerQuery = query.toLowerCase();
  return entities.filter(
    entity =>
      entity.name.toLowerCase().includes(lowerQuery) ||
      entity.filePath.toLowerCase().includes(lowerQuery)
  );
};

export const sortEntitiesByComplexity = <T extends { complexity: number }>(
  entities: T[],
  order: "asc" | "desc" = "desc"
): T[] => {
  return [...entities].sort((a, b) => {
    if (order === "asc") {
      return a.complexity - b.complexity;
    }
    return b.complexity - a.complexity;
  });
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
};

export const generateMockData = {
  codeEntity: (name: string, type: "function" | "class" | "method" | "variable" | "import" | "constant" = "function") => ({
    id: `entity_${Date.now()}_${Math.random()}`,
    entityType: type as "function" | "class" | "method" | "variable" | "import" | "constant",
    name,
    filePath: `src/${name.toLowerCase()}.py`,
    lineStart: Math.floor(Math.random() * 100) + 1,
    lineEnd: Math.floor(Math.random() * 100) + 50,
    complexity: Math.floor(Math.random() * 20) + 1,
    lineCount: Math.floor(Math.random() * 100) + 10,
    testCoverage: Math.floor(Math.random() * 100),
  }),
  
  codeFragment: (type: "function" | "class" | "module" | "test" | "config", content: string) => ({
    fragmentId: `frag_${Date.now()}`,
    fragmentType: type as "function" | "class" | "module" | "test" | "config",
    content,
    language: "python",
    context: {},
    dependencies: [],
    integrationPoints: [],
    validationStatus: "pending" as const,
    validationResults: {},
    createdBy: "ai_generator",
    createdAt: new Date().toISOString(),
    iteration: 1,
  }),
};