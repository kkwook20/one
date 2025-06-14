// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/Argosa/ArgosaSystem.tsx
// Location: frontend/src/components/Argosa/function/DataAnalysis.tsx

import React, { useState, useEffect } from "react";
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
  GitBranch,
  Database,
  Archive,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ===== Type Definitions =====
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
  lastUsed?: string;
}

// New Planner/Reasoner Types
interface PlannerLog {
  timestamp: string;
  user_message: string;
  ai_response: string;
  log_type: 'question_analysis' | 'ai_response_summary' | 'command_instruction' | 'structural_plan' | 'code_directive';
  intent: string;
  targets: string[];
  plan_generated: boolean;
  tags: string[];
  metadata: {
    session_id: string;
    source: string;
    model_used: string;
  };
}

interface StructuredPlan {
  id: string;
  title: string;
  steps: Array<{
    order: number;
    action: string;
    dependencies: string[];
    status: 'pending' | 'in_progress' | 'completed';
  }>;
  created_at: string;
  priority: 'low' | 'medium' | 'high';
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
  // Load saved config from memory (in production, this would be from a backend)
  const [savedConfigs, setSavedConfigs] = useState<Record<string, LMStudioConfig>>({});
  const [lmStudioConfig, setLmStudioConfig] = useState<LMStudioConfig>({
    endpoint: "http://localhost:1234/v1/chat/completions",
    model: "local-model",
    temperature: 0.7,
    maxTokens: 2000,
  });
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("disconnected");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  
  // New Planner States
  const [plannerLogs, setPlannerLogs] = useState<PlannerLog[]>([]);
  const [activePlans, setActivePlans] = useState<StructuredPlan[]>([]);
  const [plannerMode, setPlannerMode] = useState<'analysis' | 'planner'>('analysis');
  const [sessionId] = useState(`chat_${new Date().toISOString().split('T')[0]}_${Math.random().toString(36).substr(2, 9)}`);

  // ===== Model Recommendations =====
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
    "planner": [
      "Qwen/Qwen2.5-72B-Instruct-GGUF",
      "TheBloke/Nous-Hermes-2-Yi-34B-GGUF",
      "TheBloke/OpenChat-3.5-0106-GGUF"
    ]
  };

  // ===== Prompts =====
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

  const plannerPrompts = {
    "question_analysis": `You are an AI Planner/Reasoner. Analyze the user's question and extract:
1. Question type and intent
2. Context and background information
3. Expected outcome or goal
4. Relevant entities and keywords
5. Suggested approach and next steps

Question: {input}

Return a structured JSON response with:
{
  "intent": "specific intent",
  "question_type": "type category",
  "context": "relevant context",
  "expected_outcome": "what user wants",
  "entities": ["entity1", "entity2"],
  "suggested_approach": "recommended steps",
  "priority": "high/medium/low"
}`,

    "ai_response_summary": `Summarize the following AI response, extracting:
1. Key points and main ideas
2. Action items or recommendations
3. Important information to remember
4. Follow-up questions or clarifications needed

AI Response: {input}

Provide a concise summary with structured insights.`,

    "command_instruction": `Parse the following command/instruction and create:
1. Clear action steps
2. Required resources or tools
3. Success criteria
4. Potential blockers or dependencies

Command: {input}

Structure the instruction as an executable plan.`,

    "structural_plan": `Create a comprehensive structured plan for:
1. Break down into hierarchical steps
2. Define clear dependencies between steps
3. Identify required resources and tools
4. Set priorities and timelines
5. Define success metrics

Request: {input}

Provide a detailed plan in JSON format with steps, dependencies, and milestones.`,

    "code_directive": `Analyze the code-related request and provide:
1. Specific code issues or bugs identified
2. Recommended fixes or improvements
3. Code structure suggestions
4. Testing requirements
5. Implementation priority

Code Request: {input}

Return structured guidance for code modification.`
  };

  // ===== Helper Functions =====
  const checkLMStudioConnection = async () => {
    setConnectionStatus("checking");
    try {
      const response = await fetch(lmStudioConfig.endpoint.replace('/chat/completions', '/models'));
      if (response.ok) {
        const data = await response.json();
        // Extract model names from LM Studio response
        const models = data.data?.map((model: any) => model.id) || [];
        setAvailableModels(models);
        setConnectionStatus("connected");
        
        // Auto-save successful connection
        saveConfig();
      } else {
        setConnectionStatus("disconnected");
      }
    } catch (error) {
      setConnectionStatus("disconnected");
      console.error("Connection failed:", error);
    }
  };

  // Save configuration (in production, this would save to backend)
  const saveConfig = async () => {
    const configKey = `lm_config_${lmStudioConfig.endpoint}`;
    const newConfig = { ...lmStudioConfig, lastUsed: new Date().toISOString() };
    
    setSavedConfigs(prev => ({
      ...prev,
      [configKey]: newConfig
    }));
    
    // In production, save to backend
    console.log("Saving config:", newConfig);
    
    // Simulate backend save
    try {
      // await fetch('/api/config/save', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(newConfig)
      // });
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  };

  // Load saved configurations on mount
  const loadSavedConfigs = async () => {
    // In production, load from backend
    // const response = await fetch('/api/config/list');
    // const configs = await response.json();
    
    // Simulated saved configs
    const mockConfigs = {
      'lm_config_http://localhost:1234/v1/chat/completions': {
        endpoint: "http://localhost:1234/v1/chat/completions",
        model: "local-model",
        temperature: 0.7,
        maxTokens: 2000,
        lastUsed: new Date().toISOString()
      }
    };
    
    setSavedConfigs(mockConfigs);
    
    // Load most recent config
    const recentConfig = Object.values(mockConfigs).sort((a, b) => 
      new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
    )[0];
    
    if (recentConfig) {
      setLmStudioConfig(recentConfig);
    }
  };

  const callLMStudio = async (prompt: string, systemPrompt?: string) => {
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
              content: systemPrompt || "You are a helpful AI assistant specialized in analyzing conversations and extracting information.",
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

  // ===== Planner Functions =====
  const generateTags = (analysisResult: AnalysisResult): string[] => {
    const tags = [];
    
    // Add tags based on intent
    if (analysisResult.intent.includes('bug') || analysisResult.intent.includes('error')) {
      tags.push('bug', 'code');
    }
    if (analysisResult.intent.includes('feature') || analysisResult.intent.includes('enhancement')) {
      tags.push('feature', 'enhancement');
    }
    if (analysisResult.intent.includes('question')) {
      tags.push('question', 'support');
    }
    
    // Add entity-based tags
    analysisResult.entities.forEach(entity => {
      if (entity.type === 'PRODUCT') tags.push(entity.text.toLowerCase());
    });
    
    return [...new Set(tags)]; // Remove duplicates
  };

  const createPlannerLog = (
    userInput: string,
    aiResponse: string,
    logType: PlannerLog['log_type'],
    analysisResult: AnalysisResult
  ): PlannerLog => {
    return {
      timestamp: new Date().toISOString(),
      user_message: userInput,
      ai_response: aiResponse,
      log_type: logType,
      intent: analysisResult.intent,
      targets: analysisResult.entities.map(e => e.text),
      plan_generated: logType === 'structural_plan',
      tags: generateTags(analysisResult),
      metadata: {
        session_id: sessionId,
        source: 'argosa_system',
        model_used: lmStudioConfig.model
      }
    };
  };

  const savePlannerLog = async (log: PlannerLog) => {
    try {
      // Add to local state
      setPlannerLogs(prev => [...prev, log]);
      
      // In production, save to backend
      const date = new Date().toISOString().split('T')[0];
      const logPath = `logs/planner/${date}/${log.metadata.session_id}_${Date.now()}.json`;
      
      // Simulated API call - replace with actual backend endpoint
      console.log('Saving log to:', logPath, log);
      
      // In real implementation:
      // await fetch('/api/logs/save', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ path: logPath, data: log })
      // });
    } catch (error) {
      console.error('Failed to save log:', error);
    }
  };

  const parseStructuredPlan = (response: string): StructuredPlan | null => {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        id: `plan_${Date.now()}`,
        title: parsed.title || "Untitled Plan",
        steps: parsed.steps || [],
        created_at: new Date().toISOString(),
        priority: parsed.priority || 'medium'
      };
    } catch (error) {
      console.error('Failed to parse structured plan:', error);
      return null;
    }
  };

  // ===== Main Analysis Function =====
  const handleAnalyze = async () => {
    if (connectionStatus !== "connected") {
      alert("Please connect to LM Studio first!");
      return;
    }

    setIsAnalyzing(true);
    try {
      let prompt, systemPrompt, logType: PlannerLog['log_type'];
      
      if (plannerMode === 'planner') {
        // Use planner prompts
        const plannerTask = selectedTask as keyof typeof plannerPrompts;
        prompt = plannerPrompts[plannerTask].replace("{input}", chatInput);
        systemPrompt = "You are an advanced AI Planner and Reasoner. Your role is to analyze, plan, and structure information for complex tasks.";
        
        // Map task to log type
        const taskToLogType: Record<string, PlannerLog['log_type']> = {
          'question_analysis': 'question_analysis',
          'ai_response_summary': 'ai_response_summary',
          'command_instruction': 'command_instruction',
          'structural_plan': 'structural_plan',
          'code_directive': 'code_directive'
        };
        logType = taskToLogType[plannerTask] || 'question_analysis';
      } else {
        // Use regular analysis prompts
        prompt = taskPrompts[selectedTask as keyof typeof taskPrompts].replace("{input}", chatInput);
        logType = 'question_analysis'; // Default for regular analysis
      }
      
      const response = await callLMStudio(prompt, systemPrompt);
      
      // Parse response based on mode
      const analysisResult: AnalysisResult = {
        intent: selectedTask === "intent-classification" ? "information_seeking" : selectedTask,
        confidence: 0.85,
        entities: extractEntities(response),
        summary: extractSummary(response),
        suggestions: generateSuggestions(response),
        rawResponse: response,
      };
      
      setAnalysisResult(analysisResult);
      
      // Save planner log
      const log = createPlannerLog(chatInput, response, logType, analysisResult);
      await savePlannerLog(log);
      
      // If structural plan, parse and add to active plans
      if (logType === 'structural_plan') {
        const plan = parseStructuredPlan(response);
        if (plan) {
          setActivePlans(prev => [...prev, plan]);
        }
      }
      
      // Simulate web search
      simulateWebSearch(response);
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("Analysis failed. Please check LM Studio connection.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const extractEntities = (response: string): Array<{ text: string; type: string }> => {
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
      { text: "Qwen", type: "PRODUCT" },
    ];
  };

  const extractSummary = (response: string): string => {
    const paragraphs = response.split('\n\n').filter(p => p.trim().length > 0);
    return paragraphs[0] || response.substring(0, 200) + "...";
  };

  const generateSuggestions = (response: string): string[] => {
    return [
      "Set up local LLM pipeline",
      "Configure web scraping module",
      "Implement entity extraction",
      "Create conversation database",
    ];
  };

  const simulateWebSearch = (analysisResponse: string) => {
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
  };

  // ===== Effects =====
  useEffect(() => {
    // Load saved configurations on mount
    loadSavedConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Auto-check connection when config is loaded
    if (lmStudioConfig.endpoint) {
      const timeoutId = setTimeout(() => {
        checkLMStudioConnection();
      }, 500); // Debounce connection check
      
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lmStudioConfig.endpoint]);

  // ===== Render =====
  return (
    <div className="h-full flex flex-col gap-6 p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            AI-Powered Data Analysis & Planning
          </h2>
          <div className="flex gap-2">
            <Select value={plannerMode} onValueChange={(value: 'analysis' | 'planner') => setPlannerMode(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="analysis">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Analysis Mode
                  </div>
              
              {Object.keys(savedConfigs).length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <Label className="text-sm">Recent Configurations</Label>
                    <div className="space-y-1">
                      {Object.entries(savedConfigs).slice(0, 3).map(([key, config]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between p-2 rounded border hover:bg-accent cursor-pointer"
                          onClick={() => {
                            setLmStudioConfig(config);
                            checkLMStudioConnection();
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Server className="w-3 h-3" />
                            <span className="text-xs font-mono">{config.model}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {config.endpoint.replace('http://', '')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
                </SelectItem>
                <SelectItem value="planner">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4" />
                    Planner Mode
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-4 h-4 mr-2" />
              LM Studio Settings
            </Button>
          </div>
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
                    onChange={(e) => {
                      const newConfig = { ...lmStudioConfig, endpoint: e.target.value };
                      setLmStudioConfig(newConfig);
                    }}
                    onBlur={saveConfig}
                    placeholder="http://localhost:1234/v1/chat/completions"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model Selection</Label>
                  {availableModels.length > 0 ? (
                    <Select 
                      value={lmStudioConfig.model} 
                      onValueChange={(value) => {
                        const newConfig = { ...lmStudioConfig, model: value };
                        setLmStudioConfig(newConfig);
                        saveConfig();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="model"
                      value={lmStudioConfig.model}
                      onChange={(e) => {
                        const newConfig = { ...lmStudioConfig, model: e.target.value };
                        setLmStudioConfig(newConfig);
                      }}
                      onBlur={saveConfig}
                      placeholder="Model name (connect to see available models)"
                    />
                  )}
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
                    onChange={(e) => {
                      const newConfig = { ...lmStudioConfig, temperature: parseFloat(e.target.value) };
                      setLmStudioConfig(newConfig);
                    }}
                    onMouseUp={saveConfig}
                    onTouchEnd={saveConfig}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxTokens">Max Tokens</Label>
                  <Input
                    id="maxTokens"
                    type="number"
                    value={lmStudioConfig.maxTokens}
                    onChange={(e) => {
                      const newConfig = { ...lmStudioConfig, maxTokens: parseInt(e.target.value) };
                      setLmStudioConfig(newConfig);
                    }}
                    onBlur={saveConfig}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center gap-4">
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
                  {availableModels.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {availableModels.length} models available
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    <Archive className="w-3 h-3 mr-1" />
                    Auto-saved
                  </Badge>
                  <Button onClick={checkLMStudioConnection} size="sm">
                    <Zap className="w-4 h-4 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="chat">
              <MessageSquare className="w-4 h-4 mr-2" />
              Chat Analysis
            </TabsTrigger>
            <TabsTrigger value="planner">
              <GitBranch className="w-4 h-4 mr-2" />
              Plans
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Database className="w-4 h-4 mr-2" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="models">
              <Download className="w-4 h-4 mr-2" />
              Models
            </TabsTrigger>
            <TabsTrigger value="insights">
              <Sparkles className="w-4 h-4 mr-2" />
              Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  {plannerMode === 'planner' ? 'AI Planner & Reasoner' : 'Chat Conversation Analysis'}
                </CardTitle>
                <CardDescription>
                  {plannerMode === 'planner' 
                    ? 'Use AI to plan, reason, and structure complex tasks'
                    : 'Analyze conversations using your local LM Studio model'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="task-select">Select Task</Label>
                  <Select value={selectedTask} onValueChange={setSelectedTask}>
                    <SelectTrigger id="task-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {plannerMode === 'planner' ? (
                        <>
                          <SelectItem value="question_analysis">
                            <div className="flex items-center gap-2">
                              <Search className="w-4 h-4" />
                              Question Analysis
                            </div>
                          </SelectItem>
                          <SelectItem value="ai_response_summary">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              Response Summary
                            </div>
                          </SelectItem>
                          <SelectItem value="command_instruction">
                            <div className="flex items-center gap-2">
                              <Bot className="w-4 h-4" />
                              Command Instruction
                            </div>
                          </SelectItem>
                          <SelectItem value="structural_plan">
                            <div className="flex items-center gap-2">
                              <GitBranch className="w-4 h-4" />
                              Structural Plan
                            </div>
                          </SelectItem>
                          <SelectItem value="code_directive">
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4" />
                              Code Directive
                            </div>
                          </SelectItem>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chat-input">
                    {plannerMode === 'planner' ? 'Input for Planning' : 'Chat Conversation'}
                  </Label>
                  <Textarea
                    id="chat-input"
                    placeholder={plannerMode === 'planner' 
                      ? "Enter your request or question for the AI planner..."
                      : "Paste your ChatGPT conversation here..."}
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
                      {plannerMode === 'planner' ? 'Planning...' : 'Analyzing...'}
                    </>
                  ) : (
                    <>
                      <Brain className="mr-2 h-4 w-4" />
                      {plannerMode === 'planner' ? 'Generate Plan' : 'Analyze Conversation'}
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

          <TabsContent value="planner">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5" />
                  Active Plans
                </CardTitle>
                <CardDescription>
                  Structured plans generated by the AI Planner
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activePlans.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No active plans. Create one using the Planner mode.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activePlans.map((plan) => (
                      <Card key={plan.id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{plan.title}</CardTitle>
                            <Badge variant={
                              plan.priority === 'high' ? 'destructive' : 
                              plan.priority === 'medium' ? 'default' : 
                              'secondary'
                            }>
                              {plan.priority}
                            </Badge>
                          </div>
                          <CardDescription>
                            Created: {new Date(plan.created_at).toLocaleString()}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {plan.steps.map((step, idx) => (
                              <div key={idx} className="flex items-center gap-3 p-2 rounded hover:bg-accent">
                                <Badge variant="outline" className="min-w-[30px]">
                                  {step.order}
                                </Badge>
                                <span className="flex-1 text-sm">{step.action}</span>
                                <Badge variant={
                                  step.status === 'completed' ? 'default' :
                                  step.status === 'in_progress' ? 'secondary' :
                                  'outline'
                                }>
                                  {step.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  Planner Logs
                </CardTitle>
                <CardDescription>
                  History of all planning and analysis sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {plannerLogs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No logs available yet. Start analyzing to generate logs.
                      </div>
                    ) : (
                      plannerLogs.map((log, idx) => (
                        <Card key={idx} className="p-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline">{log.log_type}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(log.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <div className="text-sm">
                              <strong>User:</strong> {log.user_message.substring(0, 100)}...
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <strong>Intent:</strong> {log.intent}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {log.tags.map((tag, tagIdx) => (
                                <Badge key={tagIdx} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
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
                      <h4 className="font-medium capitalize flex items-center gap-2">
                        {task === 'planner' && <GitBranch className="w-4 h-4" />}
                        {task.replace('-', ' ')}
                      </h4>
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  AI-Generated Insights
                </CardTitle>
                <CardDescription>
                  Patterns and recommendations from your analysis history
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert>
                    <Brain className="h-4 w-4" />
                    <AlertTitle>Pattern Detected</AlertTitle>
                    <AlertDescription>
                      Based on your recent analyses, you frequently work with code debugging tasks.
                      Consider using specialized code analysis models.
                    </AlertDescription>
                  </Alert>
                  <Alert>
                    <Target className="h-4 w-4" />
                    <AlertTitle>Optimization Suggestion</AlertTitle>
                    <AlertDescription>
                      Your planner logs show recurring structural planning requests.
                      Enable auto-plan generation for similar queries.
                    </AlertDescription>
                  </Alert>
                  <Card className="p-4">
                    <h4 className="font-medium mb-2">Session Statistics</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Analyses:</span>
                        <span className="ml-2 font-medium">{plannerLogs.length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Active Plans:</span>
                        <span className="ml-2 font-medium">{activePlans.length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Most Used Task:</span>
                        <span className="ml-2 font-medium">Question Analysis</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Success Rate:</span>
                        <span className="ml-2 font-medium">92%</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
};

export default DataAnalysis;