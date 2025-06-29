// frontend/src/components/Argosa/function/codeanalysis/CollaborationPanel.tsx

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Bot,
  Send,
} from "lucide-react";
import { CollaborationSession } from "./types";

interface CollaborationPanelProps {
  isCollaborating: boolean;
  isConnected: boolean;
  collaborationSession: CollaborationSession | null;
  collaborationMessages: any[];
  onStartCollaboration: () => void;
  onSendMessage: (type: string, content: string) => void;
}

export const CollaborationPanel: React.FC<CollaborationPanelProps> = ({
  isCollaborating,
  isConnected,
  collaborationSession,
  collaborationMessages,
  onStartCollaboration,
  onSendMessage,
}) => {
  const [messageType, setMessageType] = useState("code_structure_request");
  const [messageContent, setMessageContent] = useState("");

  const handleSendMessage = () => {
    if (messageContent.trim()) {
      onSendMessage(messageType, messageContent);
      setMessageContent("");
    }
  };

  const getParticipantName = (participant: string) => {
    return participant
      .replace("_", " ")
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  if (!isCollaborating) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            Start a collaboration session to work with AI agents<br />
            on code analysis and generation tasks.
          </p>
          <Button className="mt-4" onClick={onStartCollaboration}>
            <Users className="w-4 h-4 mr-2" />
            Start Collaboration
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">AI Collaboration</h2>
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </div>
      </div>
      
      {collaborationSession && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Collaboration Session</CardTitle>
              <CardDescription>
                {collaborationSession.objective}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                {Object.entries(collaborationSession.participants).map(([participant, info]) => (
                  <div key={participant} className="text-center">
                    <div className={`w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center ${
                      info.status === "connected" ? "bg-green-100" : "bg-gray-100"
                    }`}>
                      <Bot className={`w-6 h-6 ${
                        info.status === "connected" ? "text-green-600" : "text-gray-400"
                      }`} />
                    </div>
                    <p className="text-sm font-medium">{getParticipantName(participant)}</p>
                    <Badge 
                      variant={info.status === "connected" ? "default" : "secondary"} 
                      className="text-xs mt-1"
                    >
                      {info.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Message History</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {collaborationMessages.map((msg, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        <span className="font-medium text-sm">{msg.from}</span>
                        <Badge variant="outline" className="text-xs">{msg.type}</Badge>
                      </div>
                      <div className="pl-6 text-sm text-muted-foreground">
                        {typeof msg.content === 'string' 
                          ? msg.content 
                          : JSON.stringify(msg.content, null, 2)}
                      </div>
                    </div>
                  ))}
                  {collaborationMessages.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center">
                      No messages yet. Start by sending a request to the AI team.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Send Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Message Type</Label>
                <Select value={messageType} onValueChange={setMessageType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="code_structure_request">Code Structure Request</SelectItem>
                    <SelectItem value="implementation_request">Implementation Request</SelectItem>
                    <SelectItem value="review_request">Review Request</SelectItem>
                    <SelectItem value="decision_needed">Decision Needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Message Content</Label>
                <Textarea
                  placeholder="Enter your message..."
                  rows={4}
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                />
              </div>
              
              <Button 
                className="w-full" 
                onClick={handleSendMessage}
                disabled={!messageContent.trim() || !isConnected}
              >
                <Send className="w-4 h-4 mr-2" />
                Send to AI Team
              </Button>
            </CardContent>
          </Card>
          
          {/* Session Stats */}
          {collaborationSession.decisions.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Decisions Made</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {collaborationSession.decisions.map((decision, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border">
                      <Badge variant="outline">{decision.type}</Badge>
                      <div className="flex-1">
                        <p className="text-sm">{decision.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          by {decision.madeBy} • {new Date(decision.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};