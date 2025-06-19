import React, { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Globe,
  Info,
  Server,
  Zap,
} from "lucide-react";
import type { AIModelConfig, EnhancedAgentType, LMStudioConfig } from "../DataAnalysis";

interface SettingsProps {
  modelConfig: AIModelConfig;
  lmStudioConfig: LMStudioConfig;
  connectionStatus: "connected" | "disconnected" | "checking";
  availableModels: string[];
  savedConfigs: Record<string, LMStudioConfig>;
  isDarkMode: boolean;
  AGENT_CONFIGS: Record<EnhancedAgentType, { name: string; icon: any; color: string; description: string }>;
  RECOMMENDED_MODELS: Record<string, string[]>;
  onConfigureModels: (config: AIModelConfig) => Promise<void>;
  onUpdateModelConfig: (config: AIModelConfig) => void;
  onUpdateLMStudioConfig: (config: LMStudioConfig) => void;
  onCheckConnection: () => Promise<void>;
  onToggleDarkMode: (value: boolean) => void;
}

const Settings: React.FC<SettingsProps> = ({
  modelConfig,
  lmStudioConfig,
  connectionStatus,
  availableModels,
  savedConfigs,
  isDarkMode,
  AGENT_CONFIGS,
  RECOMMENDED_MODELS,
  onConfigureModels,
  onUpdateModelConfig,
  onUpdateLMStudioConfig,
  onCheckConnection,
  onToggleDarkMode,
}) => {
  const [selectedTab, setSelectedTab] = React.useState("models");
  const [isConfiguring, setIsConfiguring] = React.useState(false);
  
  const handleSaveConfiguration = async () => {
    setIsConfiguring(true);
    try {
      await onConfigureModels(modelConfig);
    } finally {
      setIsConfiguring(false);
    }
  };
  
  // Auto-check connection when endpoint changes
  useEffect(() => {
    if (lmStudioConfig.endpoint) {
      const timeoutId = setTimeout(() => {
        onCheckConnection();
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [lmStudioConfig.endpoint, onCheckConnection]);
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
      
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="models">AI Models</TabsTrigger>
          <TabsTrigger value="lmstudio">LM Studio</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>
        
        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Default Model</CardTitle>
              <CardDescription>Model used for agents without specific configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="default-model">Default Model</Label>
                <Select
                  value={modelConfig.default}
                  onValueChange={(value) => onUpdateModelConfig({ ...modelConfig, default: value })}
                >
                  <SelectTrigger id="default-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qwen2.5-72b-instruct">Qwen2.5 72B Instruct</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
                    <SelectItem value="deepseek-v2">DeepSeek V2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button onClick={handleSaveConfiguration} disabled={isConfiguring}>
                {isConfiguring ? "Saving..." : "Save Configuration"}
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Agent-Specific Models</CardTitle>
              <CardDescription>Configure models for specific agent types</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {Object.entries(AGENT_CONFIGS).map(([agentType, config]) => (
                    <div key={agentType} className="space-y-2 pb-4 border-b last:border-0">
                      <Label className="flex items-center space-x-2">
                        <config.icon className={`h-4 w-4 ${config.color}`} />
                        <span>{config.name}</span>
                      </Label>
                      <Select
                        value={modelConfig.specialized[agentType as EnhancedAgentType] || "default"}
                        onValueChange={(value) => 
                          onUpdateModelConfig({
                            ...modelConfig,
                            specialized: {
                              ...modelConfig.specialized,
                              [agentType]: value === "default" ? undefined : value
                            }
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Use Default</SelectItem>
                          <SelectItem value="qwen2.5-72b-instruct">Qwen2.5 72B</SelectItem>
                          <SelectItem value="deepseek-coder-33b">DeepSeek Coder 33B</SelectItem>
                          <SelectItem value="wizardcoder-33b">WizardCoder 33B</SelectItem>
                          <SelectItem value="llama-3.1-70b">Llama 3.1 70B</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Task-Specific Model Recommendations</CardTitle>
              <CardDescription>Recommended models for different task types</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="task-specific">
                <TabsList>
                  <TabsTrigger value="task-specific">Task Models</TabsTrigger>
                  <TabsTrigger value="performance">Performance</TabsTrigger>
                  <TabsTrigger value="fallback">Fallback</TabsTrigger>
                </TabsList>
                
                <TabsContent value="task-specific" className="space-y-4">
                  <div className="space-y-4">
                    {Object.entries(RECOMMENDED_MODELS).map(([task, models]) => (
                      <Card key={task}>
                        <CardHeader>
                          <CardTitle className="text-base capitalize">{task.replace('-', ' ')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <RadioGroup defaultValue={models[0]}>
                            {models.map((model) => (
                              <div key={model} className="flex items-center justify-between py-2">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value={model} id={model} />
                                  <Label htmlFor={model} className="font-mono text-sm">
                                    {model}
                                  </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {Math.floor(Math.random() * 50 + 50)}ms
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => window.open(`https://huggingface.co/${model}`, '_blank')}
                                  >
                                    <Globe className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </RadioGroup>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="performance" className="space-y-4">
                  <div className="space-y-6">
                    <div>
                      <Label>Response Time Threshold (ms)</Label>
                      <div className="flex items-center gap-4 mt-2">
                        <Slider
                          defaultValue={[5000]}
                          max={10000}
                          step={500}
                          className="flex-1"
                        />
                        <span className="w-20 text-sm text-muted-foreground">5000ms</span>
                      </div>
                    </div>
                    
                    <div>
                      <Label>Max Concurrent Requests</Label>
                      <div className="flex items-center gap-4 mt-2">
                        <Slider
                          defaultValue={[10]}
                          max={50}
                          step={1}
                          className="flex-1"
                        />
                        <span className="w-20 text-sm text-muted-foreground">10</span>
                      </div>
                    </div>
                    
                    <div>
                      <Label>Cache Duration (minutes)</Label>
                      <div className="flex items-center gap-4 mt-2">
                        <Slider
                          defaultValue={[60]}
                          max={1440}
                          step={15}
                          className="flex-1"
                        />
                        <span className="w-20 text-sm text-muted-foreground">60 min</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <Label>Performance Optimizations</Label>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Switch defaultChecked id="batch-processing" />
                          <Label htmlFor="batch-processing">Enable batch processing</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch defaultChecked id="response-streaming" />
                          <Label htmlFor="response-streaming">Enable response streaming</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch id="gpu-acceleration" />
                          <Label htmlFor="gpu-acceleration">Enable GPU acceleration</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="fallback" className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Fallback Strategy</AlertTitle>
                    <AlertDescription>
                      Configure backup models and error handling when primary models fail
                    </AlertDescription>
                  </Alert>
                  
                  <div className="space-y-4">
                    <div>
                      <Label>Primary Failure Action</Label>
                      <Select defaultValue="fallback">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fallback">Switch to fallback model</SelectItem>
                          <SelectItem value="retry">Retry with backoff</SelectItem>
                          <SelectItem value="queue">Queue for later</SelectItem>
                          <SelectItem value="fail">Fail immediately</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Fallback Model Priority</Label>
                      <div className="space-y-2 mt-2">
                        {['gpt-4-turbo', 'claude-3-opus', 'gemini-pro', 'local-llama'].map((model, idx) => (
                          <div key={model} className="flex items-center justify-between p-2 border rounded">
                            <span className="font-mono text-sm">{model}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Priority {idx + 1}
                              </Badge>
                              <Button size="sm" variant="ghost">
                                <ChevronUp className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost">
                                <ChevronDown className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="lmstudio" className="space-y-4">
          <Card>
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
                      onUpdateLMStudioConfig({ ...lmStudioConfig, endpoint: e.target.value });
                    }}
                    placeholder="http://localhost:1234/v1/chat/completions"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model Selection</Label>
                  {availableModels.length > 0 ? (
                    <Select 
                      value={lmStudioConfig.model} 
                      onValueChange={(value) => {
                        onUpdateLMStudioConfig({ ...lmStudioConfig, model: value });
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
                        onUpdateLMStudioConfig({ ...lmStudioConfig, model: e.target.value });
                      }}
                      placeholder="Model name (connect to see available models)"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature: {lmStudioConfig.temperature}</Label>
                  <Slider
                    id="temperature"
                    min={0}
                    max={1}
                    step={0.1}
                    value={[lmStudioConfig.temperature]}
                    onValueChange={(value) => {
                      onUpdateLMStudioConfig({ ...lmStudioConfig, temperature: value[0] });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxTokens">Max Tokens</Label>
                  <Input
                    id="maxTokens"
                    type="number"
                    value={lmStudioConfig.maxTokens}
                    onChange={(e) => {
                      onUpdateLMStudioConfig({ ...lmStudioConfig, maxTokens: parseInt(e.target.value) });
                    }}
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
                  <Button onClick={onCheckConnection} size="sm">
                    <Zap className="w-4 h-4 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {Object.keys(savedConfigs).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(savedConfigs).slice(0, 3).map(([key, config]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 rounded border hover:bg-accent cursor-pointer"
                      onClick={() => {
                        onUpdateLMStudioConfig(config);
                        onCheckConnection();
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4" />
                        <span className="text-sm font-mono">{config.model}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {config.endpoint.replace('http://', '')}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Toggle dark mode theme</p>
                </div>
                <Switch checked={isDarkMode} onCheckedChange={onToggleDarkMode} />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-refresh</Label>
                  <p className="text-sm text-muted-foreground">Automatically refresh data</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Debug Mode</Label>
                  <p className="text-sm text-muted-foreground">Show detailed logs and metrics</p>
                </div>
                <Switch />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Real-time Updates</Label>
                  <p className="text-sm text-muted-foreground">Enable WebSocket real-time updates</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Notification Sounds</Label>
                  <p className="text-sm text-muted-foreground">Play sounds for important events</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Performance Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Update Interval (seconds)</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    defaultValue={[5]}
                    min={1}
                    max={60}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">5s</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Max Chart Data Points</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    defaultValue={[100]}
                    min={50}
                    max={500}
                    step={50}
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">100</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>History Retention (days)</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    defaultValue={[30]}
                    min={7}
                    max={90}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-muted-foreground">30d</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Configure how and when you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Workflow Notifications</h3>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch defaultChecked id="workflow-complete" />
                    <Label htmlFor="workflow-complete">Workflow completed</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch defaultChecked id="workflow-failed" />
                    <Label htmlFor="workflow-failed">Workflow failed</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="workflow-started" />
                    <Label htmlFor="workflow-started">Workflow started</Label>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Agent Notifications</h3>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch defaultChecked id="agent-error" />
                    <Label htmlFor="agent-error">Agent errors</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="agent-status" />
                    <Label htmlFor="agent-status">Agent status changes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="agent-performance" />
                    <Label htmlFor="agent-performance">Performance alerts</Label>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="text-sm font-medium">System Notifications</h3>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch defaultChecked id="system-critical" />
                    <Label htmlFor="system-critical">Critical system alerts</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="system-resources" />
                    <Label htmlFor="system-resources">Resource usage warnings</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>External Integrations</CardTitle>
              <CardDescription>Connect with external services and APIs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Slack</h4>
                    <p className="text-sm text-muted-foreground">Send notifications to Slack channels</p>
                  </div>
                  <Button variant="outline" size="sm">Configure</Button>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">GitHub</h4>
                    <p className="text-sm text-muted-foreground">Sync with GitHub repositories</p>
                  </div>
                  <Button variant="outline" size="sm">Configure</Button>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Webhooks</h4>
                    <p className="text-sm text-muted-foreground">Send data to custom endpoints</p>
                  </div>
                  <Button variant="outline" size="sm">Configure</Button>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-medium">Email</h4>
                    <p className="text-sm text-muted-foreground">Email notifications and reports</p>
                  </div>
                  <Button variant="outline" size="sm">Configure</Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>API Access</CardTitle>
              <CardDescription>Manage API keys and access tokens</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg bg-muted/50">
                  <p className="text-sm font-mono">API Key: ••••••••••••••••••••••••••••••••</p>
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" size="sm">Regenerate</Button>
                    <Button variant="outline" size="sm">Copy</Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use this API key to access Argosa Analysis System programmatically.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;