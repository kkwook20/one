// frontend/src/components/Argosa/function/codeanalysis/DependencyGraph.tsx

import React, { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

interface DependencyGraphProps {
  graphData: any;
  onExport?: () => void;
}

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
  graphData,
  onExport,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = React.useState(1);

  useEffect(() => {
    if (!canvasRef.current || !graphData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply zoom
    ctx.save();
    ctx.scale(zoom, zoom);

    // Draw dependency graph
    drawGraph(ctx, graphData);

    ctx.restore();
  }, [graphData, zoom]);

  const drawGraph = (ctx: CanvasRenderingContext2D, data: any) => {
    // Simple graph rendering logic
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    
    // Calculate positions
    const width = 800;
    const height = 600;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;
    
    // Position nodes in a circle
    nodes.forEach((node: any, index: number) => {
      const angle = (2 * Math.PI * index) / nodes.length;
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });
    
    // Draw edges
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    edges.forEach((edge: any) => {
      const fromNode = nodes.find((n: any) => n.id === edge.from);
      const toNode = nodes.find((n: any) => n.id === edge.to);
      if (fromNode && toNode) {
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.stroke();
        
        // Draw arrow
        const angle = Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
        const arrowLength = 10;
        ctx.beginPath();
        ctx.moveTo(toNode.x, toNode.y);
        ctx.lineTo(
          toNode.x - arrowLength * Math.cos(angle - Math.PI / 6),
          toNode.y - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(toNode.x, toNode.y);
        ctx.lineTo(
          toNode.x - arrowLength * Math.cos(angle + Math.PI / 6),
          toNode.y - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
    });
    
    // Draw nodes
    nodes.forEach((node: any) => {
      // Node circle
      ctx.fillStyle = node.type === "class" ? "#3b82f6" : "#10b981";
      ctx.beginPath();
      ctx.arc(node.x, node.y, 20, 0, 2 * Math.PI);
      ctx.fill();
      
      // Node label
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.name, node.x, node.y);
    });
  };

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.1, 2));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.1, 0.5));
  const handleReset = () => setZoom(1);

  const handleExport = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "dependency-graph.png";
      link.click();
    }
    onExport?.();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Dependency Graph</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleZoomOut}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={handleReset}>
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={handleZoomIn}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full h-full"
            style={{ maxHeight: "600px" }}
          />
        </div>
        {(!graphData || !graphData.nodes?.length) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-muted-foreground">No dependency data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};