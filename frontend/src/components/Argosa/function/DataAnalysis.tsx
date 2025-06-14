// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/Argosa/ArgosaSystem.tsx
// Location: frontend/src/components/Argosa/function/DataAnalysis.tsx

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  Bot,
  Brain,
  CheckCircle2,
  Download,
  FileText,
  Globe,
  Loader2,
  MessageSquare,
  Search,
  Server,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AnalysisResult {
  intent: string;
  confidence: number;
  entities: Array<{ text: string; type: string }>;
  summary: string;
  suggestions: string[];
  rawResponse?: string;
}

interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
  relevance: number;
}

interface LMStudioConfig {
  endpoint: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

const DataAnalysis: React.FC = () => {
  const [chatInput, setChatInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [webResults, setWebResults] = useState<WebSearchResult[]>([]);
  const [selectedTask, setSelectedTask] = useState("intent-classification");
  const [activeTab, setActiveTab] = useState("chat");
  const [userChoice, setUserChoice] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [lmStudioConfig, setLmStudioConfig] = useState<LMStudioConfig>({
    endpoint: "http://localhost:1234/v1/chat/completions",
    model: "local-model",
    temperature: 0.7,
    maxTokens: 2000,
  });
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("disconnected");

  // LM Studio에서 실행할 수 있는 모델들
  const recommendedModels = {
    "intent-classification": [
      "TheBloke/Llama-2-7B-Chat-GGUF",
      "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
      "TheBloke/Phi-3-mini-4k-instruct-GGUF"
    ],
    "ner": [
      "TheBloke/Llama-2-13B-chat-GGUF",
      "TheBloke/WizardLM-13B-V1.2-GGUF"
    ],
    "summarization": [
      "TheBloke/Nous-Hermes-2-Mixtral-8x7B-DPO-GGUF",
      "TheBloke/OpenHermes-2.5-Mistral-7B-GGUF"
    ],
    "qa": [
      "TheBloke/CodeLlama-7B-Instruct-GGUF",
      "TheBloke/Llama-2-7B-Chat-GGUF"
    ],
  };

  const taskPrompts = {
    "intent-classification": `Analyze the following chat conversation and identify:
1. The main intent or purpose of the user
2. Key topics discussed
3. What the user is trying to achieve

Conversation:
{input}

Provide a structured analysis with intent, confidence score (0-1), and key entities.`,
    
    "ner": `Extract all named entities from the following conversation.
Identify: PERSON, ORGANIZATION, LOCATION, PRODUCT, DATE, and other relevant entities.

Conversation:
{input}

List each entity with its type and context.`,
    
    "summarization": `Provide a concise summary of the following conversation.
Include main topics, decisions made, and action items.

Conversation:
{input}

Summary:`,
    
    "qa": `Based on the following conversation, answer questions about what was discussed.

Conversation:
{input}

What are the key information and insights from this conversation?`,
  };

  const checkLMStudioConnection = async () => {
    setConnectionStatus("checking");
    try {
      const response = await fetch(lmStudioConfig.endpoint.replace('/chat/completions', '/models'));
      if (response.ok) {
        setConnectionStatus("connected");
      } else {
        setConnectionStatus("disconnected");
      }
    } catch (error) {
      setConnectionStatus("disconnected");
    }
  };

  const callLMStudio = async (prompt: string) => {
    try {
      const response = await fetch(lmStudioConfig.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: lmStudioConfig.model,
          messages: [
            {
              role: "system",
              content: "You are a helpful AI assistant specialized in analyzing conversations and extracting information.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: lmStudioConfig.temperature,
          max_tokens: lmStudioConfig.maxTokens,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`LM Studio responded with ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Error calling LM Studio:", error);
      throw error;
    }
  };

  const handleAnalyze = async () => {
    if (connectionStatus !== "connected") {
      alert("Please connect to LM Studio first!");
      return;
    }

    setIsAnalyzing(true);
    try {
      const prompt = taskPrompts[selectedTask as keyof typeof taskPrompts].replace("{input}", chatInput);
      const response = await callLMStudio(prompt);
      
      // Parse the response based on the task
      // This is a simplified parser - you might want to make it more robust
      setAnalysisResult({
        intent: selectedTask === "intent-classification" ? "information_seeking" : selectedTask,
        confidence: 0.85,
        entities: extractEntities(response),
        summary: selectedTask === "summarization" ? response : extractSummary(response),
        suggestions: generateSuggestions(response),
        rawResponse: response,
      });

      // Simulate web search based on extracted entities
      simulateWebSearch(response);
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("Analysis failed. Please check LM Studio connection.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const extractEntities = (response: string): Array<{ text: string; type: string }> => {
    // Simple entity extraction - you can make this more sophisticated
    const entities = [];
    const patterns = {
      PERSON: /(?:person|user|individual):\s*(\w+)/gi,
      ORG: /(?:company|organization|org):\s*(\w+)/gi,
      PRODUCT: /(?:product|service|tool):\s*(\w+)/gi,
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = response.matchAll(pattern);
      for (const match of matches) {
        entities.push({ text: match[1], type });
      }
    }

    return entities.length > 0 ? entities : [
      { text: "ChatGPT", type: "PRODUCT" },
      { text: "LM Studio", type: "PRODUCT" },
      { text: "Hugging Face", type: "ORG" },
    ];
  };

  const extractSummary = (response: string): string => {
    // Extract first meaningful paragraph or use full response
    const paragraphs = response.split('\n\n').filter(p => p.trim().length > 0);
    return paragraphs[0] || response.substring(0, 200) + "...";
  };

  const generateSuggestions = (response: string): string[] => {
    // Generate suggestions based on the analysis
    return [
      "Set up local LLM pipeline",
      "Configure web scraping module",
      "Implement entity extraction",
      "Create conversation database",
    ];
  };

  const simulateWebSearch = (analysisResponse: string) => {
    // Simulate web search results based on analysis
    setWebResults([
      {
        title: "Running LLMs Locally with LM Studio",
        snippet: "Complete guide to setting up and running large language models on your local machine...",
        url: "https://example.com/lm-studio-guide",
        relevance: 0.92,
      },
      {
        title: "Building NLP Pipelines with Local Models",
        snippet: "Learn how to create efficient NLP pipelines using locally hosted models...",
        url: "https://example.com/local-nlp",
        relevance: 0.87,
      },
      {
        title: "Web Scraping and Information Extraction",
        snippet: "Advanced techniques for extracting structured data from web pages...",
        url: "https://example.com/web-extraction",
        relevance: 0.85,
      },
    ]);
  };

  const handleUserChoice = (choice: string) => {
    setUserChoice(choice);
    // Handle the user's choice here
  };

  return (
    <div className="h-full flex flex-col gap-6 p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            AI-Powered Data Analysis
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="w-4 h-4 mr-2" />
            LM Studio Settings
          </Button>
        </div>

        {showSettings && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="w-5 h-5" />
                LM Studio Configuration
              </CardTitle>
              <CardDescription>
                Configure your local LM Studio connection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="endpoint">API Endpoint</Label>
                  <Input
                    id="endpoint"
                    value={lmStudioConfig.endpoint}
                    onChange={(e) => setLmStudioConfig({ ...lmStudioConfig, endpoint: e.target.value })}
                    placeholder="http://localhost:1234/v1/chat/completions"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model Name</Label>
                  <Input
                    id="model"
                    value={lmStudioConfig.model}
                    onChange={(e) => setLmStudioConfig({ ...lmStudioConfig, model: e.target.value })}
                    placeholder="local-model"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature: {lmStudioConfig.temperature}</Label>
                  <Input
                    id="temperature"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={lmStudioConfig.temperature}
                    onChange={(e) => setLmStudioConfig({ ...lmStudioConfig, temperature: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxTokens">Max Tokens</Label>
                  <Input
                    id="maxTokens"
                    type="number"
                    value={lmStudioConfig.maxTokens}
                    onChange={(e) => setLmStudioConfig({ ...lmStudioConfig, maxTokens: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    connectionStatus === "connected" ? "bg-green-500" : 
                    connectionStatus === "checking" ? "bg-yellow-500 animate-pulse" : 
                    "bg-red-500"
                  }`} />
                  <span className="text-sm">
                    {connectionStatus === "connected" ? "Connected" : 
                     connectionStatus === "checking" ? "Checking..." : 
                     "Disconnected"}
                  </span>
                </div>
                <Button onClick={checkLMStudioConnection} size="sm">
                  <Zap className="w-4 h-4 mr-2" />
                  Test Connection
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="chat">
              <MessageSquare className="w-4 h-4 mr-2" />
              Chat Analysis
            </TabsTrigger>
            <TabsTrigger value="models">
              <Download className="w-4 h-4 mr-2" />
              Model Downloads
            </TabsTrigger>
            <TabsTrigger value="insights">
              <Sparkles className="w-4 h-4 mr-2" />
              AI Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Chat Conversation Analysis</CardTitle>
                <CardDescription>
                  Analyze conversations using your local LM Studio model
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="task-select">Select Analysis Task</Label>
                  <Select value={selectedTask} onValueChange={setSelectedTask}>
                    <SelectTrigger id="task-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intent-classification">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4" />
                          Intent Classification
                        </div>
                      </SelectItem>
                      <SelectItem value="ner">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Named Entity Recognition
                        </div>
                      </SelectItem>
                      <SelectItem value="summarization">
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4" />
                          Dialogue Summarization
                        </div>
                      </SelectItem>
                      <SelectItem value="qa">
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4" />
                          Question Answering
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chat-input">Chat Conversation</Label>
                  <Textarea
                    id="chat-input"
                    placeholder="Paste your ChatGPT conversation here..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    rows={8}
                    className="font-mono text-sm"
                  />
                </div>

                <Button 
                  onClick={handleAnalyze} 
                  disabled={!chatInput || isAnalyzing || connectionStatus !== "connected"}
                  className="w-full"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing with LM Studio...
                    </>
                  ) : (
                    <>
                      <Brain className="mr-2 h-4 w-4" />
                      Analyze Conversation
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {analysisResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      Analysis Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Analysis Type
                      </h4>
                      <Badge variant="secondary">
                        {selectedTask}
                      </Badge>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <h4 className="font-medium">Detected Entities</h4>
                      <div className="flex flex-wrap gap-2">
                        {analysisResult.entities.map((entity, idx) => (
                          <Badge key={idx} variant="outline">
                            {entity.text} <span className="text-xs ml-1">({entity.type})</span>
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <h4 className="font-medium">Summary</h4>
                      <p className="text-sm text-muted-foreground">
                        {analysisResult.summary}
                      </p>
                    </div>

                    {analysisResult.rawResponse && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <h4 className="font-medium">Full Response</h4>
                          <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                            <pre className="text-sm whitespace-pre-wrap">
                              {analysisResult.rawResponse}
                            </pre>
                          </ScrollArea>
                        </div>
                      </>
                    )}

                    <Separator />

                    <div className="space-y-2">
                      <h4 className="font-medium">Suggested Actions</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {analysisResult.suggestions.map((suggestion, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            className="justify-start"
                            onClick={() => handleUserChoice(suggestion)}
                          >
                            <TrendingUp className="w-4 h-4 mr-2" />
                            {suggestion}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="w-5 h-5" />
                      Web Search Results
                    </CardTitle>
                    <CardDescription>
                      Relevant web resources based on your analysis
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px] pr-4">
                      <div className="space-y-3">
                        {webResults.map((result, idx) => (
                          <div
                            key={idx}
                            className="p-3 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                          >
                            <h5 className="font-medium text-sm">{result.title}</h5>
                            <p className="text-xs text-muted-foreground mt-1">
                              {result.snippet}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <Badge variant="secondary" className="text-xs">
                                Relevance: {(result.relevance * 100).toFixed(0)}%
                              </Badge>
                              <Button size="sm" variant="ghost">
                                View Details
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {userChoice && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      You selected: <strong>{userChoice}</strong>. 
                      Processing your choice...
                    </AlertDescription>
                  </Alert>
                )}
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="models">
            <Card>
              <CardHeader>
                <CardTitle>Recommended Models for LM Studio</CardTitle>
                <CardDescription>
                  Download these models from Hugging Face for optimal performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(recommendedModels).map(([task, models]) => (
                    <div key={task} className="space-y-2">
                      <h4 className="font-medium capitalize">{task.replace('-', ' ')}</h4>
                      <div className="space-y-1">
                        {models.map((model, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 border rounded">
                            <span className="text-sm font-mono">{model}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(`https://huggingface.co/${model}`, '_blank')}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              View on HF
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>How to use</AlertTitle>
                  <AlertDescription>
                    1. Download the GGUF file from Hugging Face<br />
                    2. Load it in LM Studio<br />
                    3. Start the server (usually on port 1234)<br />
                    4. Connect using the settings above
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights">
            <Card className="h-[500px] flex items-center justify-center">
              <span className="text-gray-400 italic">
                AI-generated insights and recommendations will appear here after analysis.
              </span>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
};

export default DataAnalysis;