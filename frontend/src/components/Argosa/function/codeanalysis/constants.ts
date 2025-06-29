// frontend/src/components/Argosa/function/codeanalysis/constants.ts

import {
  Layers,
  Database,
  Package,
  Lock,
  Eye,
  GitBranch,
  Palette
} from "lucide-react";

export const ARCHITECTURE_PATTERNS: Record<string, {
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

export const CODE_QUALITY_THRESHOLDS = {
  complexity: { low: 5, medium: 10, high: 20 },
  maintainability: { poor: 50, fair: 70, good: 85 },
  testCoverage: { poor: 60, fair: 80, good: 90 },
  documentation: { poor: 50, fair: 75, good: 90 }
};

export const LANGUAGE_CONFIGS: Record<string, {
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

export const DEFAULT_QUALITY_TARGETS = {
  testCoverage: 90,
  maxComplexity: 10,
  documentationCoverage: 100
};

export const WEBSOCKET_CONFIG = {
  reconnectDelay: 5000,
  maxReconnectAttempts: 10
};

export const API_ENDPOINTS = {
  analyzeProject: "/api/argosa/code/analyze-project",
  createPlan: "/api/argosa/code/create-generation-plan",
  executePlan: "/api/argosa/code/execute-generation",
  validateCode: "/api/argosa/code/validate-code",
  getFragments: "/api/argosa/code/code-fragments",
  getStatus: "/api/argosa/code/generation-status",
  createSession: "/api/argosa/code/collaboration-session",
  websocket: "ws://localhost:8000/api/argosa/code/ws/code-collaboration"
};