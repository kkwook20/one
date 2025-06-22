// frontend/src/components/Argosa/function/dataanalysis/Settings.tsx
import React, { useEffect, useState, useCallback } from "react";
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
  Network,
  Wifi,
  Monitor,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import type { AIModelConfig, EnhancedAgentType, LMStudioConfig } from "../DataAnalysis";

// API Base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface NetworkInstance {
  id: string;
  ip: string;
  hostname: string;
  port: number;
  status: "connected" | "disconnected" | "checking";
  is_local: boolean;
  models: string[];
  current_model?: string;
  performance_score: number;
  response_time?: number;
  lastChecked?: Date;
}

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
  const [isScanning, setIsScanning] = React.useState(false);
  const [networkInstances, setNetworkInstances] = React.useState<NetworkInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = React.useState<string | null>(null);
  const [instanceModels, setInstanceModels] = React.useState<Record<string, string[]>>({});
  const [manualHost, setManualHost] = React.useState("");
  const [manualPort, setManualPort] = React.useState("1234");
  
  const handleSaveConfiguration = async () => {
    setIsConfiguring(true);
    try {
      await onConfigureModels(modelConfig);
    } finally {
      setIsConfiguring(false);
    }
  };
  
  // 네트워크 스캔
  const handleNetworkScan = async () => {
    setIsScanning(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subnet: null }) // 자동 감지
      });
      
      const data = await response.json();
      const instances: NetworkInstance[] = data.devices.map((device: any) => ({
        ...device,
        status: "disconnected" as const,
        models: [],
        performance_score: 0,
        lastChecked: new Date()
      }));
      
      setNetworkInstances(instances);
      
      // 각 인스턴스 연결 테스트
      for (const instance of instances) {
        await testInstanceConnection(instance.id);
      }
    } catch (error) {
      console.error('Network scan failed:', error);
    } finally {
      setIsScanning(false);
    }
  };
  
  // 인스턴스 연결 테스트
  const testInstanceConnection = async (instanceId: string) => {
    setNetworkInstances(prev => prev.map(inst => 
      inst.id === instanceId ? { ...inst, status: "checking" } : inst
    ));
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/instance/${instanceId}/test`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      setNetworkInstances(prev => prev.map(inst => 
        inst.id === instanceId ? {
          ...inst,
          status: data.connected ? "connected" : "disconnected",
          models: data.models || [],
          lastChecked: new Date()
        } : inst
      ));
      
      if (data.models && data.models.length > 0) {
        setInstanceModels(prev => ({ ...prev, [instanceId]: data.models }));
      }
    } catch (error) {
      setNetworkInstances(prev => prev.map(inst => 
        inst.id === instanceId ? { ...inst, status: "disconnected" } : inst
      ));
    }
  };
  
  // 수동 인스턴스 추가
  const handleManualAdd = async () => {
    if (!manualHost) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/add-instance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          host: manualHost, 
          port: parseInt(manualPort) 
        })
      });
      
      const data = await response.json();
      
      const newInstance: NetworkInstance = {
        id: data.id,
        ip: manualHost,
        hostname: manualHost,
        port: parseInt(manualPort),
        status: data.status === "connected" ? "connected" : "disconnected",
        is_local: data.is_local,
        models: data.models || [],
        performance_score: 0,
        lastChecked: new Date()
      };
      
      setNetworkInstances(prev => [...prev, newInstance]);
      setManualHost("");
      setManualPort("1234");
    } catch (error) {
      console.error('Failed to add instance:', error);
    }
  };
  
  // 인스턴스 제거
  const handleRemoveInstance = async (instanceId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/instance/${instanceId}`, {
        method: 'DELETE'
      });
      
      setNetworkInstances(prev => prev.filter(inst => inst.id !== instanceId));
      if (selectedInstance === instanceId) {
        setSelectedInstance(null);
      }
    } catch (error) {
      console.error('Failed to remove instance:', error);
    }
  };
  
  // 인스턴스 선택
  const handleSelectInstance = (instanceId: string) => {
    setSelectedInstance(instanceId);
    const instance = networkInstances.find(inst => inst.id === instanceId);
    if (instance) {
      onUpdateLMStudioConfig({
        ...lmStudioConfig,
        endpoint: `http://${instance.ip}:${instance.port}/v1/chat/completions`,
        model: instance.current_model || instance.models[0] || ""
      });
    }
  };
  
  // 초기 인스턴스 목록 로드
  useEffect(() => {
    const loadInstances = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/instances`);
        const data = await response.json();
        
        const instances: NetworkInstance[] = data.instances.map((inst: any) => ({
          id: inst.id,
          ip: inst.host,
          hostname: inst.hostname || inst.host,
          port: inst.port,
          status: inst.status,
          is_local: inst.is_local,
          models: inst.models || [],
          current_model: inst.current_model,
          performance_score: inst.performance_score || 0,
          lastChecked: new Date()
        }));
        
        setNetworkInstances(instances);
      } catch (error) {
        console.error('Failed to load instances:', error);
      }
    };
    
    loadInstances();
  }, []);
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
      
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="models">AI Models</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
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
        
        <TabsContent value="network" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="w-5 h-5" />
                Network Discovery
              </CardTitle>
              <CardDescription>
                Discover and manage LM Studio instances on your network
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Button 
                  onClick={handleNetworkScan} 
                  disabled={isScanning}
                  className="flex items-center gap-2"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Scan Network
                    </>
                  )}
                </Button>
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wifi className="w-4 h-4" />
                  {networkInstances.length} instances found
                </div>
              </div>
              
              {/* Manual Add Section */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="IP or hostname"
                  value={manualHost}
                  onChange={(e) => setManualHost(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Port"
                  value={manualPort}
                  onChange={(e) => setManualPort(e.target.value)}
                  className="w-24"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleManualAdd}
                  disabled={!manualHost}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Instance Pool */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Instance Pool</CardTitle>
              <CardDescription>
                Available LM Studio instances for distributed processing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {networkInstances.map((instance) => (
                    <div
                      key={instance.id}
                      className={`p-4 rounded-lg border transition-all cursor-pointer ${
                        selectedInstance === instance.id 
                          ? 'border-primary bg-accent' 
                          : 'hover:bg-accent/50'
                      }`}
                      onClick={() => handleSelectInstance(instance.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Monitor className="w-5 h-5" />
                            {instance.is_local && (
                              <Badge variant="secondary" className="absolute -top-2 -right-2 text-xs px-1">
                                Local
                              </Badge>
                            )}
                          </div>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {instance.hostname}
                              {instance.hostname !== instance.ip && (
                                <span className="text-xs text-muted-foreground">
                                  ({instance.ip})
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Port {instance.port}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {instance.status === "connected" && (
                            <Badge variant="outline" className="text-xs">
                              {instance.models.length} models
                            </Badge>
                          )}
                          
                          <div className="flex items-center gap-1">
                            {instance.status === "connected" && (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                            {instance.status === "disconnected" && (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                            {instance.status === "checking" && (
                              <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
                            )}
                          </div>
                          
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              testInstanceConnection(instance.id);
                            }}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveInstance(instance.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {selectedInstance === instance.id && instance.models.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <Label className="text-sm">Available Models</Label>
                          <Select
                            value={instance.current_model || instance.models[0]}
                            onValueChange={(model) => {
                              onUpdateLMStudioConfig({
                                ...lmStudioConfig,
                                model
                              });
                            }}
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {instance.models.map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      {instance.lastChecked && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Last checked: {new Date(instance.lastChecked).toLocaleTimeString()}
                          {instance.response_time && (
                            <span className="ml-2">
                              Response time: {instance.response_time.toFixed(0)}ms
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {networkInstances.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Network className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No instances discovered yet</p>
                      <p className="text-sm mt-1">Click "Scan Network" to find LM Studio instances</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          
          {/* Connection Status */}
          {selectedInstance && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Active Connection</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Endpoint</span>
                    <span className="text-sm font-mono text-muted-foreground">
                      {lmStudioConfig.endpoint}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Model</span>
                    <span className="text-sm font-mono text-muted-foreground">
                      {lmStudioConfig.model || "Not selected"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Temperature</span>
                    <span className="text-sm text-muted-foreground">
                      {lmStudioConfig.temperature}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Max Tokens</span>
                    <span className="text-sm text-muted-foreground">
                      {lmStudioConfig.maxTokens}
                    </span>
                  </div>
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