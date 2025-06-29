// frontend/src/components/Argosa/function/codeanalysis/FileExplorer.tsx

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  FolderTree,
  RefreshCw,
  FolderOpen,
  Search,
  FileCode,
  Eye,
  Bug,
  FileCode2,
  ChevronRight,
} from "lucide-react";
import { FileNode, CodeEntity } from "./types";
import { LANGUAGE_CONFIGS } from "./constants";
import { getEntityIcon, getComplexityColor } from "./utils";

interface FileExplorerProps {
  projectPath: string;
  fileTree: FileNode[];
  selectedFile: FileNode | null;
  searchQuery: string;
  expandedNodes: Set<string>;
  onProjectPathChange: (path: string) => void;
  onAnalyze: () => void;
  onSelectFile: (file: FileNode) => void;
  onSearchChange: (query: string) => void;
  onToggleNode: (nodeId: string) => void;
  onSelectEntity: (entity: CodeEntity) => void;
  onShowEntityDetails: () => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  projectPath,
  fileTree,
  selectedFile,
  searchQuery,
  expandedNodes,
  onProjectPathChange,
  onAnalyze,
  onSelectFile,
  onSearchChange,
  onToggleNode,
  onSelectEntity,
  onShowEntityDetails,
}) => {
  const renderFileNode = (node: FileNode, depth: number): JSX.Element => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedFile?.id === node.id;
    
    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-accent ${
            isSelected ? "bg-accent" : ""
          }`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => {
            if (node.type === "directory") {
              onToggleNode(node.id);
            } else {
              onSelectFile(node);
            }
          }}
        >
          {node.type === "directory" ? (
            <>
              {hasChildren && (
                <ChevronRight
                  className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
              )}
              <FolderOpen className="w-4 h-4 text-yellow-600" />
            </>
          ) : (
            <>
              <div className="w-4" />
              <FileCode2 className="w-4 h-4 text-blue-600" />
            </>
          )}
          <span className="text-sm flex-1">{node.name}</span>
          {node.type === "file" && node.language && (
            <span className="text-xs">{LANGUAGE_CONFIGS[node.language]?.icon}</span>
          )}
          {node.analysis?.issues && node.analysis.issues > 0 && (
            <Badge variant="destructive" className="text-xs">
              {node.analysis.issues}
            </Badge>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map((child) => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FolderTree className="w-5 h-5" />
              Project Explorer
            </span>
            <Button size="sm" variant="outline" onClick={onAnalyze}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Analyze
            </Button>
          </CardTitle>
          <CardDescription>
            Navigate and analyze your project structure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Enter project path..."
                value={projectPath}
                onChange={(e) => onProjectPathChange(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="icon">
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Search Files</Label>
                <Badge variant="outline" className="text-xs">
                  {fileTree.length} files
                </Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files and entities..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            
            <ScrollArea className="h-[400px] border rounded-lg p-2">
              {fileTree.map((node) => renderFileNode(node, 0))}
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
      
      {selectedFile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileCode className="w-4 h-4" />
              {selectedFile.name}
            </CardTitle>
            <CardDescription>
              {selectedFile.path}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {selectedFile.analysis && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{selectedFile.analysis.entities?.length || 0}</p>
                      <p className="text-xs text-muted-foreground">Entities</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{selectedFile.analysis.complexity || 0}</p>
                      <p className="text-xs text-muted-foreground">Avg Complexity</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{selectedFile.analysis.issues || 0}</p>
                      <p className="text-xs text-muted-foreground">Issues</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-2">Code Entities</h4>
                    <div className="space-y-2">
                      {selectedFile.analysis.entities?.slice(0, 5).map((entity) => (
                        <div
                          key={entity.id}
                          className="flex items-center justify-between p-2 rounded-lg border hover:bg-accent cursor-pointer"
                          onClick={() => {
                            onSelectEntity(entity);
                            onShowEntityDetails();
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {React.createElement(getEntityIcon(entity.entityType), { className: "w-4 h-4" })}
                            <span className="font-mono text-sm">{entity.name}</span>
                          </div>
                          <Badge variant="outline" className={getComplexityColor(entity.complexity)}>
                            {entity.complexity}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Eye className="w-4 h-4 mr-2" />
                  View Code
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  <Bug className="w-4 h-4 mr-2" />
                  Analyze
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};