// frontend/src/components/Argosa/function/codeanalysis/CodeValidation.tsx

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  Zap,
  FileCode2,
  Bug,
} from "lucide-react";
import { getValidationIcon } from "./utils";

interface ValidationResult {
  syntax: { valid: boolean; errors?: string[] };
  style: { valid: boolean; issues?: string[] };
  complexity: { valid: boolean; max_complexity?: number; details?: any };
  security: { valid: boolean; issues?: string[] };
  performance: { valid: boolean; issues?: string[] };
}

interface CodeValidationProps {
  validationResult: ValidationResult | null;
  isValidating: boolean;
}

export const CodeValidation: React.FC<CodeValidationProps> = ({
  validationResult,
  isValidating,
}) => {
  if (isValidating) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">Validating code...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!validationResult) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-4">
            <Shield className="w-12 h-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              No validation results available.<br />
              Generate or select code to validate.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getOverallStatus = () => {
    const checks = [
      validationResult.syntax.valid,
      validationResult.style.valid,
      validationResult.complexity.valid,
      validationResult.security.valid,
      validationResult.performance.valid,
    ];
    const passedCount = checks.filter(Boolean).length;
    
    if (passedCount === checks.length) return "passed";
    if (passedCount === 0) return "failed";
    return "warnings";
  };

  const overallStatus = getOverallStatus();

  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {overallStatus === "passed" && <CheckCircle className="w-5 h-5 text-green-600" />}
            {overallStatus === "failed" && <XCircle className="w-5 h-5 text-red-600" />}
            {overallStatus === "warnings" && <AlertTriangle className="w-5 h-5 text-yellow-600" />}
            Code Validation Results
          </CardTitle>
          <CardDescription>
            Comprehensive analysis of code quality and compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overallStatus === "passed" && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle>All Checks Passed</AlertTitle>
              <AlertDescription>
                Your code meets all quality standards and is ready for integration.
              </AlertDescription>
            </Alert>
          )}
          {overallStatus === "failed" && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Validation Failed</AlertTitle>
              <AlertDescription>
                Critical issues were found that need to be addressed before proceeding.
              </AlertDescription>
            </Alert>
          )}
          {overallStatus === "warnings" && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertTitle>Warnings Found</AlertTitle>
              <AlertDescription>
                Some issues were detected. Review and address them to improve code quality.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Detailed Checks */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Syntax Check */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4" />
                Syntax Check
              </span>
              <Badge variant={validationResult.syntax.valid ? "default" : "destructive"}>
                {validationResult.syntax.valid ? "Passed" : "Failed"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {validationResult.syntax.errors && validationResult.syntax.errors.length > 0 ? (
              <ul className="space-y-1">
                {validationResult.syntax.errors.map((error, idx) => (
                  <li key={idx} className="text-sm text-red-600">• {error}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No syntax errors found</p>
            )}
          </CardContent>
        </Card>

        {/* Style Check */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4" />
                Style Compliance
              </span>
              <Badge variant={validationResult.style.valid ? "default" : "secondary"}>
                {validationResult.style.valid ? "Passed" : "Issues"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {validationResult.style.issues && validationResult.style.issues.length > 0 ? (
              <ul className="space-y-1">
                {validationResult.style.issues.slice(0, 3).map((issue, idx) => (
                  <li key={idx} className="text-sm text-yellow-600">• {issue}</li>
                ))}
                {validationResult.style.issues.length > 3 && (
                  <li className="text-sm text-muted-foreground">
                    ... and {validationResult.style.issues.length - 3} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Code follows style guidelines</p>
            )}
          </CardContent>
        </Card>

        {/* Complexity Check */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Bug className="w-4 h-4" />
                Complexity Analysis
              </span>
              <Badge variant={validationResult.complexity.valid ? "default" : "secondary"}>
                {validationResult.complexity.max_complexity || 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Cyclomatic Complexity</span>
                <span className="font-medium">{validationResult.complexity.max_complexity || 0}</span>
              </div>
              <Progress 
                value={Math.min((validationResult.complexity.max_complexity || 0) * 10, 100)} 
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                {validationResult.complexity.valid 
                  ? "Complexity is within acceptable limits"
                  : "Consider refactoring to reduce complexity"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Security Check */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Security Scan
              </span>
              <Badge variant={validationResult.security.valid ? "default" : "destructive"}>
                {validationResult.security.valid ? "Secure" : "Issues Found"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {validationResult.security.issues && validationResult.security.issues.length > 0 ? (
              <ul className="space-y-1">
                {validationResult.security.issues.map((issue, idx) => (
                  <li key={idx} className="text-sm text-red-600">• {issue}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No security vulnerabilities detected</p>
            )}
          </CardContent>
        </Card>

        {/* Performance Check */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Performance Analysis
              </span>
              <Badge variant={validationResult.performance.valid ? "default" : "secondary"}>
                {validationResult.performance.valid ? "Optimized" : "Can be improved"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {validationResult.performance.issues && validationResult.performance.issues.length > 0 ? (
              <div className="grid gap-2">
                {validationResult.performance.issues.map((issue, idx) => (
                  <Alert key={idx} className="py-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{issue}</AlertDescription>
                  </Alert>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Code performance is optimized for the target use case
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};