// frontend/src/components/Argosa/function/dataanalysis/Agents.tsx
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Bot,
  Brain,
  CheckCircle2,
  Eye,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
} from "lucide-react";
import type { Agent, EnhancedAgentType } from "../DataAnalysis";

interface AgentsProps {
  agents: Agent[];
  AGENT_CONFIGS: Record<EnhancedAgentType, { name: string; icon: any; color: string; description: string }>;
  onAskAgent: (agentType: EnhancedAgentType, question: string, context?: any) => Promise<any>;
  onRefreshAgents: () => void;
}

const Agents: React.FC<AgentsProps> = ({
  agents,
  AGENT_CONFIGS,
  onAskAgent,
  onRefreshAgents,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showAgentDetails, setShowAgentDetails] = useState(false);
  const [showAgentChat, setShowAgentChat] = useState(false);
  const [currentAgentChat, setCurrentAgentChat] = useState<EnhancedAgentType | null>(null);
  const [chatMessages, setChatMessages] = useState<{agent: string; content: string; timestamp: string; role: 'user' | 'agent'}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const getAgentIcon = (type: EnhancedAgentType) => {
    const config = AGENT_CONFIGS[type];
    return config?.icon || Bot;
  };
  
  const getAgentColor = (type: EnhancedAgentType) => {
    const config = AGENT_CONFIGS[type];
    return config?.color || "text-gray-600";
  };
  
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };
  
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };
  
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !currentAgentChat) return;
    
    setIsLoading(true);
    
    // Add user message
    const userMessage = {
      agent: "user",
      content: chatInput,
      timestamp: new Date().toISOString(),
      role: "user" as const
    };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    
    try {
      // Get agent response
      const response = await onAskAgent(currentAgentChat, chatInput);
      
      // Add agent response
      const agentMessage = {
        agent: currentAgentChat,
        content: typeof response === 'string' ? response : response.answer || JSON.stringify(response),
        timestamp: new Date().toISOString(),
        role: "agent" as const
      };
      setChatMessages(prev => [...prev, agentMessage]);
    } catch (error) {
      const errorMessage = {
        agent: currentAgentChat,
        content: "Sorry, I encountered an error processing your request.",
        timestamp: new Date().toISOString(),
        role: "agent" as const
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">AI Agents</h2>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-xs">
            {agents.filter(a => a.status === "ready").length} Ready
          </Badge>
          <Badge variant="outline" className="text-xs">
            {agents.filter(a => a.status === "busy").length} Busy
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAgentChat(true)}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Chat with Agent
          </Button>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const AgentIcon = getAgentIcon(agent.type);
          return (
            <Card 
              key={agent.type}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => {
                setSelectedAgent(agent);
                setShowAgentDetails(true);
              }}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`rounded-full p-2 bg-gray-100 ${getAgentColor(agent.type)}`}>
                      <AgentIcon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                  </div>
                  <Badge variant={
                    agent.status === "ready" ? "default" :
                    agent.status === "busy" ? "secondary" :
                    agent.status === "error" ? "destructive" :
                    "outline"
                  }>
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {AGENT_CONFIGS[agent.type].description}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Success Rate</span>
                      <span className="font-medium">{(agent.performanceMetrics.successRate * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={agent.performanceMetrics.successRate * 100} />
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Tasks Completed</span>
                    <span>{agent.performanceMetrics.totalTasks}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Avg Response Time</span>
                    <span>{formatDuration(agent.performanceMetrics.averageTime)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Model</span>
                    <span className="font-mono text-xs">{agent.model || "Default"}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentAgentChat(agent.type);
                    setShowAgentChat(true);
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Chat
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
      
      {/* Agent Details Dialog */}
      <Dialog open={showAgentDetails} onOpenChange={setShowAgentDetails}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          {selectedAgent && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-3">
                  <div className={`rounded-full p-2 bg-gray-100 ${getAgentColor(selectedAgent.type)}`}>
                    {React.createElement(getAgentIcon(selectedAgent.type), { className: "h-6 w-6" })}
                  </div>
                  <span>{selectedAgent.name}</span>
                </DialogTitle>
                <DialogDescription>
                  {AGENT_CONFIGS[selectedAgent.type].description}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant={
                        selectedAgent.status === "ready" ? "default" :
                        selectedAgent.status === "busy" ? "secondary" :
                        "destructive"
                      }>
                        {selectedAgent.status}
                      </Badge>
                      {selectedAgent.currentTask && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Current task: {selectedAgent.currentTask}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Model</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-mono text-sm">{selectedAgent.model || "Default"}</p>
                    </CardContent>
                  </Card>
                </div>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm">Success Rate</span>
                        <span className="text-sm font-medium">
                          {(selectedAgent.performanceMetrics.successRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={selectedAgent.performanceMetrics.successRate * 100} />
                    </div>
                    
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Tasks</p>
                        <p className="text-2xl font-bold">{selectedAgent.performanceMetrics.totalTasks}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Response Time</p>
                        <p className="text-2xl font-bold">{formatDuration(selectedAgent.performanceMetrics.averageTime)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Last Active</p>
                        <p className="text-sm font-medium">
                          {selectedAgent.lastActive ? formatTimestamp(selectedAgent.lastActive) : "Never"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Capabilities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {selectedAgent.capabilities.map((capability) => (
                        <Badge key={capability} variant="outline">
                          {capability}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => {
                        setCurrentAgentChat(selectedAgent.type);
                        setShowAgentChat(true);
                        setShowAgentDetails(false);
                      }}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Chat with Agent
                    </Button>
                    <Button className="w-full" variant="outline">
                      <Play className="mr-2 h-4 w-4" />
                      Run Test Task
                    </Button>
                    <Button className="w-full" variant="outline">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reset Agent
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Agent Chat Dialog */}
      <Dialog open={showAgentChat} onOpenChange={setShowAgentChat}>
        <DialogContent className="max-w-2xl h-[600px] flex flex-col">
          <DialogHeader>
            <DialogTitle>Chat with AI Agent</DialogTitle>
            <DialogDescription>
              Select an agent and start a conversation
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 flex flex-col space-y-4">
            <div>
              <Label>Select Agent</Label>
              <Select
                value={currentAgentChat || ""}
                onValueChange={(value) => setCurrentAgentChat(value as EnhancedAgentType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent..." />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => {
                    const AgentIcon = getAgentIcon(agent.type);
                    return (
                      <SelectItem key={agent.type} value={agent.type}>
                        <div className="flex items-center space-x-2">
                          <AgentIcon className={`h-4 w-4 ${getAgentColor(agent.type)}`} />
                          <span>{agent.name}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            
            <ScrollArea className="flex-1 border rounded-lg p-4">
              <div className="space-y-4">
                {chatMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] p-3 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted p-3 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Brain className="h-4 w-4 animate-pulse" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="flex space-x-2">
              <Input
                placeholder="Type your message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                disabled={isLoading}
              />
              <Button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || !currentAgentChat || isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Agents;