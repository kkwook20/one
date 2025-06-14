// frontend/src/components/Argosa/function/UserInput.tsx

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  MessageSquare,
  Send,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  FileText,
  GitBranch,
  Zap,
  PlayCircle,
  RefreshCw,
  ChevronRight,
  User,
  Bot,
  Sparkles,
  Shield,
  Clock,
} from "lucide-react";

// Types
interface UserConfirmation {
  id: string;
  type: 'deployment' | 'modification' | 'decision' | 'schedule';
  title: string;
  description: string;
  details: any;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  requester: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  options?: DecisionOption[];
}

interface DecisionOption {
  id: string;
  label: string;
  description: string;
  impact: string;
  recommended?: boolean;
}

interface UserMessage {
  id: string;
  type: 'user' | 'system';
  content: string;
  timestamp: string;
  metadata?: any;
}

interface SystemStatus {
  system: string;
  status: 'idle' | 'working' | 'waiting' | 'error';
  lastAction: string;
  progress?: number;
}

const UserInput: React.FC = () => {
  const [confirmations, setConfirmations] = useState<UserConfirmation[]>([]);
  const [selectedConfirmation, setSelectedConfirmation] = useState<UserConfirmation | null>(null);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [selectedDecision, setSelectedDecision] = useState<string>("");
  const [systemStatuses, setSystemStatuses] = useState<SystemStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState<any>(null);

  // Load pending confirmations
  useEffect(() => {
    loadConfirmations();
    loadSystemStatuses();
    setupWebSocket();
  }, []);

  const loadConfirmations = async () => {
    try {
      const response = await fetch('/api/argosa/user/confirmations');
      if (response.ok) {
        const data = await response.json();
        setConfirmations(data);
      }
    } catch (error) {
      console.error('Failed to load confirmations:', error);
      // Use mock data
      setConfirmations(mockConfirmations);
    }
  };

  const loadSystemStatuses = async () => {
    try {
      const response = await fetch('/api/argosa/system/status');
      if (response.ok) {
        const data = await response.json();
        setSystemStatuses(data);
      }
    } catch (error) {
      console.error('Failed to load system status:', error);
      // Use mock data
      setSystemStatuses(mockSystemStatuses);
    }
  };

  const setupWebSocket = () => {
    // In production, this would be a real WebSocket connection
    // Simulate real-time updates
    const interval = setInterval(() => {
      // Simulate new message
      if (Math.random() > 0.8) {
        const newMessage: UserMessage = {
          id: `msg_${Date.now()}`,
          type: 'system',
          content: 'Data analysis completed. Found 3 optimization opportunities.',
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, newMessage]);
      }
    }, 10000);

    return () => clearInterval(interval);
  };

  const handleConfirmation = async (confirmation: UserConfirmation, approved: boolean) => {
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/argosa/user/confirmations/${confirmation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved,
          decision: selectedDecision,
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        // Update confirmation status
        setConfirmations(confirmations.map(c => 
          c.id === confirmation.id 
            ? { ...c, status: approved ? 'approved' : 'rejected' }
            : c
        ));
        
        // Add message
        const message: UserMessage = {
          id: `msg_${Date.now()}`,
          type: 'user',
          content: `${confirmation.type} ${approved ? 'approved' : 'rejected'}: ${confirmation.title}`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, message]);
        
        setSelectedConfirmation(null);
        
        // If approved and it's a deployment, show preview
        if (approved && confirmation.type === 'deployment') {
          setPreviewContent(confirmation.details);
          setShowPreview(true);
        }
      }
    } catch (error) {
      console.error('Failed to process confirmation:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: UserMessage = {
      id: `msg_${Date.now()}`,
      type: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");

    // Send to backend
    try {
      const response = await fetch('/api/argosa/user/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputMessage }),
      });

      if (response.ok) {
        const { reply } = await response.json();
        const systemMessage: UserMessage = {
          id: `msg_${Date.now()}_reply`,
          type: 'system',
          content: reply,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, systemMessage]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const getPriorityColor = (priority: UserConfirmation['priority']) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
    }
  };

  const getStatusColor = (status: SystemStatus['status']) => {
    switch (status) {
      case 'idle': return 'text-gray-500';
      case 'working': return 'text-blue-500';
      case 'waiting': return 'text-yellow-500';
      case 'error': return 'text-red-500';
    }
  };

  const pendingCount = confirmations.filter(c => c.status === 'pending').length;

  return (
    <div className="h-full flex gap-6">
      {/* Left Panel - Confirmations */}
      <div className="flex-1 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Pending Confirmations
              </span>
              {pendingCount > 0 && (
                <Badge variant="destructive">{pendingCount}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Review and approve system actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-3 pr-4">
                {confirmations.filter(c => c.status === 'pending').map((confirmation) => (
                  <motion.div
                    key={confirmation.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <Card 
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedConfirmation(confirmation)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-base flex items-center gap-2">
                              {confirmation.type === 'deployment' && <PlayCircle className="w-4 h-4" />}
                              {confirmation.type === 'modification' && <FileText className="w-4 h-4" />}
                              {confirmation.type === 'decision' && <GitBranch className="w-4 h-4" />}
                              {confirmation.type === 'schedule' && <Clock className="w-4 h-4" />}
                              {confirmation.title}
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                              {confirmation.description}
                            </CardDescription>
                          </div>
                          <Badge variant={getPriorityColor(confirmation.priority)}>
                            {confirmation.priority}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Bot className="w-3 h-3" />
                            {confirmation.requester}
                          </span>
                          <span>{new Date(confirmation.createdAt).toLocaleString()}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
                
                {pendingCount === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                    <p>No pending confirmations</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {systemStatuses.map((status) => (
                <div key={status.system} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      status.status === 'idle' ? 'bg-gray-400' :
                      status.status === 'working' ? 'bg-blue-500 animate-pulse' :
                      status.status === 'waiting' ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`} />
                    <span className="font-medium">{status.system}</span>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm ${getStatusColor(status.status)}`}>
                      {status.status}
                    </p>
                    <p className="text-xs text-muted-foreground">{status.lastAction}</p>
                  </div>
                  {status.progress !== undefined && (
                    <Progress value={status.progress} className="w-20" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Communication */}
      <Card className="w-96 flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            System Communication
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 mb-4">
            <div className="space-y-3 pr-4">
              <AnimatePresence>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`flex gap-3 ${
                      message.type === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.type === 'system' && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}
                    <div className={`max-w-[80%] ${
                      message.type === 'user' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-gray-100'
                    } rounded-lg p-3`}>
                      <p className="text-sm">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    {message.type === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
          <div className="flex gap-2">
            <Textarea
              placeholder="Type your message..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={2}
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={!inputMessage.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={!!selectedConfirmation} onOpenChange={(open) => !open && setSelectedConfirmation(null)}>
        <DialogContent className="max-w-2xl">
          {selectedConfirmation && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedConfirmation.title}</DialogTitle>
                <DialogDescription>{selectedConfirmation.description}</DialogDescription>
              </DialogHeader>
              
              <div className="my-6 space-y-4">
                {selectedConfirmation.type === 'decision' && selectedConfirmation.options && (
                  <div>
                    <Label className="mb-3 block">Select an option:</Label>
                    <RadioGroup value={selectedDecision} onValueChange={setSelectedDecision}>
                      {selectedConfirmation.options.map((option) => (
                        <div key={option.id} className="mb-3">
                          <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                            <RadioGroupItem value={option.id} id={option.id} />
                            <Label htmlFor={option.id} className="flex-1 cursor-pointer">
                              <div className="font-medium flex items-center gap-2">
                                {option.label}
                                {option.recommended && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    Recommended
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {option.description}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Impact: {option.impact}
                              </p>
                            </Label>
                          </div>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )}

                {selectedConfirmation.type === 'deployment' && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Deployment Details</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Files to be modified: {selectedConfirmation.details?.fileCount || 0}</li>
                        <li>Estimated downtime: {selectedConfirmation.details?.downtime || 'None'}</li>
                        <li>Rollback available: {selectedConfirmation.details?.rollback ? 'Yes' : 'No'}</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {selectedConfirmation.type === 'modification' && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-medium mb-2">Changes Summary:</h4>
                    <pre className="text-sm overflow-x-auto">
                      {JSON.stringify(selectedConfirmation.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => handleConfirmation(selectedConfirmation, false)}
                  disabled={isProcessing}
                >
                  <ThumbsDown className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                <Button 
                  onClick={() => handleConfirmation(selectedConfirmation, true)}
                  disabled={isProcessing || (selectedConfirmation.type === 'decision' && !selectedDecision)}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      Approve
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Deployment Preview</DialogTitle>
            <DialogDescription>
              Review the changes before they go live
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] my-4">
            <pre className="text-sm p-4 bg-gray-50 rounded">
              {JSON.stringify(previewContent, null, 2)}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setShowPreview(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Mock data
const mockConfirmations: UserConfirmation[] = [
  {
    id: '1',
    type: 'deployment',
    title: 'Deploy LangGraph Integration',
    description: 'Ready to deploy the new multi-agent AI system to production',
    details: {
      fileCount: 15,
      downtime: 'None',
      rollback: true,
      changes: ['New agent architecture', 'Improved response times', 'Better context handling']
    },
    status: 'pending',
    createdAt: new Date().toISOString(),
    requester: 'Data Analysis',
    priority: 'high',
  },
  {
    id: '2',
    type: 'decision',
    title: 'Choose Database Strategy',
    description: 'Select the best approach for storing analysis results',
    details: {},
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    requester: 'DB Center',
    priority: 'medium',
    options: [
      {
        id: 'neo4j',
        label: 'Use Neo4j Graph Database',
        description: 'Store as graph relationships for complex queries',
        impact: 'Better relationship visualization, slower writes',
        recommended: true,
      },
      {
        id: 'qdrant',
        label: 'Use Qdrant Vector Database',
        description: 'Store as vectors for semantic search',
        impact: 'Fast similarity search, limited relationship queries',
      },
      {
        id: 'hybrid',
        label: 'Hybrid Approach',
        description: 'Use both Neo4j and Qdrant based on data type',
        impact: 'Maximum flexibility, higher complexity',
      },
    ],
  },
];

const mockSystemStatuses: SystemStatus[] = [
  {
    system: 'Data Collection',
    status: 'working',
    lastAction: 'Collecting web data',
    progress: 65,
  },
  {
    system: 'Data Analysis',
    status: 'waiting',
    lastAction: 'Waiting for user input',
  },
  {
    system: 'Prediction Model',
    status: 'idle',
    lastAction: 'Last prediction 5 min ago',
  },
  {
    system: 'Code Analysis',
    status: 'working',
    lastAction: 'Analyzing argosa.py',
    progress: 30,
  },
];

export default UserInput;