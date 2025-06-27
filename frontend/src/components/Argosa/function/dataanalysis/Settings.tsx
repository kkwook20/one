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
import { Textarea } from "@/components/ui/textarea";
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
  Rocket,
  Edit2,
  Settings2,
  Star,
  Tag,
  Power,
  UserPlus,
  UserCheck,
  Shield,
} from "lucide-react";

// Type definitions
interface AIModelConfig {
  default?: string;
  specialized: Record<string, string | undefined>;
}

interface LMStudioConfig {
  endpoint: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

type EnhancedAgentType = 
  | "analyst"
  | "strategist"
  | "coordinator"
  | "optimizer";

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
  enabled?: boolean;
  priority?: number;
  tags?: string[];
  max_concurrent_tasks?: number;
  notes?: string;
  is_registered?: boolean;
}

interface DistributedSettings {
  enabled: boolean;
  auto_discover: boolean;
  instance_selection: "performance" | "round_robin" | "manual";
  max_retries: number;
  timeout: number;
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
  const [selectedModels, setSelectedModels] = React.useState<Record<string, string>>({});
  const [manualHost, setManualHost] = React.useState("");
  const [manualPort, setManualPort] = React.useState("1234");
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [localInstance, setLocalInstance] = React.useState<NetworkInstance | null>(null);
  const [settingsLoaded, setSettingsLoaded] = React.useState(false);
  const [profiles, setProfiles] = React.useState<Array<{name: string; description: string; created_at: string}>>([]);
  
  // 새로운 상태들
  const [distributedSettings, setDistributedSettings] = React.useState<DistributedSettings>({
    enabled: true,
    auto_discover: false,
    instance_selection: "performance",
    max_retries: 3,
    timeout: 60
  });
  const [editingInstance, setEditingInstance] = React.useState<string | null>(null);
  const [editingTags, setEditingTags] = React.useState<string>("");
  const [editingNotes, setEditingNotes] = React.useState<string>("");
  const [availableTags] = React.useState(["gpu", "high-memory", "fast", "stable", "testing", "production"]);
  
  // 등록된 인스턴스만 필터링 (localhost 포함)
  const registeredInstances = React.useMemo(() => {
    const registered = networkInstances.filter(inst => inst.is_registered);
    // localhost가 등록된 경우 추가 (중복 방지)
    if (localInstance && localInstance.is_registered && !registered.find(inst => inst.id === localInstance.id)) {
      registered.unshift(localInstance);
    }
    return registered;
  }, [networkInstances, localInstance]);
  
  // 모든 인스턴스 (localhost 포함, 중복 제거)
  const allInstances = React.useMemo(() => {
    const all = [...networkInstances];
    if (localInstance && !all.find(inst => inst.id === localInstance.id)) {
      all.unshift(localInstance);
    }
    return all;
  }, [networkInstances, localInstance]);
  
  // 설정 불러오기
  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/settings`);
      const data = await response.json();
      
      if (data.status === "success" && data.settings) {
        const settings = data.settings;
        
        // AI 모델 설정 적용
        if (settings.ai_models) {
          onUpdateModelConfig(settings.ai_models);
        }
        
        // LM Studio 설정 적용
        if (settings.lm_studio_config) {
          onUpdateLMStudioConfig(settings.lm_studio_config);
        }
        
        // 분산 실행 설정
        if (settings.distributed_settings) {
          setDistributedSettings(settings.distributed_settings);
        }
        
        // UI 설정 적용
        if (settings.ui_preferences) {
          onToggleDarkMode(settings.ui_preferences.dark_mode);
        }
        
        // 인스턴스 정보 업데이트
        if (settings.lm_studio_instances && settings.lm_studio_instances.length > 0) {
          const instances: NetworkInstance[] = settings.lm_studio_instances.map((inst: any) => ({
            ...inst,
            lastChecked: new Date(),
            is_registered: inst.is_registered ?? inst.enabled ?? false
          }));
          
          console.log('Loading instances from settings:', instances);
          
          // localhost 찾기 및 중복 제거
          let localFound = false;
          const remoteInstances: NetworkInstance[] = [];
          
          for (const inst of instances) {
            if (inst.is_local || inst.id === "localhost:1234" || 
                (inst.hostname === 'localhost' && inst.port === 1234) ||
                (inst.ip === '127.0.0.1' && inst.port === 1234)) {
              if (!localFound) {
                // 첫 번째 localhost만 사용
                const local = {
                  ...inst,
                  id: "localhost:1234",
                  hostname: "localhost",
                  ip: "127.0.0.1",
                  is_local: true
                };
                setLocalInstance(local);
                localFound = true;
                console.log('Loaded localhost instance:', local);
                
                // 연결 상태 확인
                if (local.status !== "connected") {
                  setTimeout(() => testInstanceConnection(local.id), 1000);
                }
              }
            } else {
              remoteInstances.push(inst);
            }
          }
          
          setNetworkInstances(remoteInstances);
          console.log('Loaded remote instances:', remoteInstances);
        }
        
        setSettingsLoaded(true);
        console.log('Settings loaded successfully');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, [onUpdateModelConfig, onUpdateLMStudioConfig, onToggleDarkMode]);
  
  // 설정 저장
  const saveSettings = useCallback(async () => {
    try {
      // 모든 인스턴스 정보 수집 (중복 제거)
      const allInstancesData: NetworkInstance[] = [];
      const seenIds = new Set<string>();
      
      // localhost 추가
      if (localInstance) {
        const normalizedLocal = {
          ...localInstance,
          id: "localhost:1234",
          hostname: "localhost",
          ip: "127.0.0.1",
          is_local: true
        };
        allInstancesData.push(normalizedLocal);
        seenIds.add(normalizedLocal.id);
        console.log('Saving localhost instance:', normalizedLocal);
      }
      
      // 네트워크 인스턴스 추가 (중복 제거)
      for (const inst of networkInstances) {
        if (!seenIds.has(inst.id) && inst.id !== "localhost:1234") {
          allInstancesData.push(inst);
          seenIds.add(inst.id);
        }
      }
      
      console.log('Saving all instances:', allInstancesData);
      
      const settings = {
        ai_models: modelConfig,
        lm_studio_config: lmStudioConfig,
        distributed_settings: distributedSettings,
        ui_preferences: {
          dark_mode: isDarkMode,
          auto_refresh: true,
          debug_mode: false
        },
        lm_studio_instances: allInstancesData.map(inst => ({
          ...inst,
          is_registered: inst.is_registered ?? false
        }))
      };
      
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      
      const data = await response.json();
      if (data.status === "success") {
        console.log('Settings saved successfully');
        return true;
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
    return false;
  }, [modelConfig, lmStudioConfig, distributedSettings, isDarkMode, networkInstances, localInstance]);
  
  // 인스턴스 설정 업데이트
  const updateInstanceSettings = async (instanceId: string, updates: Partial<NetworkInstance>) => {
    try {
      // localhost의 경우 정규화된 ID 사용
      const updateId = (localInstance && (instanceId === localInstance.id || instanceId.includes("localhost"))) 
        ? "localhost:1234" 
        : instanceId;
      
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/instance/${updateId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      if (response.ok) {
        // localhost 처리
        if (localInstance && (instanceId === localInstance.id || instanceId === "localhost:1234" || instanceId.includes("localhost"))) {
          setLocalInstance({ ...localInstance, ...updates });
        } else {
          setNetworkInstances(prev => prev.map(inst => 
            inst.id === instanceId ? { ...inst, ...updates } : inst
          ));
        }
        
        // 설정 저장
        await saveSettings();
      }
    } catch (error) {
      console.error('Failed to update instance settings:', error);
    }
  };
  
  // 인스턴스 등록/해제
  const toggleInstanceRegistration = async (instanceId: string, register: boolean) => {
    try {
      console.log(`Registering instance ${instanceId}: ${register}`);
      
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/instance/${instanceId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ register })
      });
      
      const data = await response.json();
      console.log('Register response:', data);
      
      if (response.ok && data.status === "success") {
        // 응답에서 정규화된 instance ID 사용
        const normalizedId = data.instance_id || instanceId;
        
        // localhost 처리
        if (localInstance && (normalizedId === localInstance.id || instanceId.includes("localhost") || instanceId.includes("127.0.0.1"))) {
          const updatedLocal = { ...localInstance, is_registered: register, enabled: register };
          setLocalInstance(updatedLocal);
          console.log('Updated localhost instance:', updatedLocal);
        } else {
          // 일반 네트워크 인스턴스 처리
          setNetworkInstances(prev => prev.map(inst => 
            inst.id === normalizedId ? { ...inst, is_registered: register, enabled: register } : inst
          ));
        }
        
        // 설정 자동 저장
        await saveSettings();
      } else {
        console.error('Failed to register instance:', data.message);
        alert(`Failed to register instance: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to toggle instance registration:', error);
      alert('Failed to register instance. Please check the connection.');
    }
  };
  
  const handleSaveConfiguration = async () => {
    setIsConfiguring(true);
    try {
      // 먼저 메모리에 설정 적용
      await onConfigureModels(modelConfig);
      
      // 그다음 파일에 저장
      const saved = await saveSettings();
      if (saved) {
        console.log('Configuration saved to file');
      }
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
        body: JSON.stringify({ subnet: null })
      });
      
      const data = await response.json();
      console.log('Network scan results:', data);
      
      const instances: NetworkInstance[] = data.devices.map((device: any) => ({
        ...device,
        status: "disconnected" as const,
        models: [],
        performance_score: 0,
        lastChecked: new Date(),
        enabled: false,
        priority: 1,
        tags: [],
        max_concurrent_tasks: 5,
        notes: "",
        is_registered: false
      }));
      
      // localhost는 제외하고 새로운 인스턴스만 추가
      const newInstances = instances.filter(inst => 
        inst.id !== "localhost:1234" && 
        inst.ip !== "127.0.0.1" && 
        inst.hostname !== "localhost"
      );
      
      // 기존 등록된 인스턴스는 유지하고, 새로운 것만 추가
      setNetworkInstances(prev => {
        const existingIds = new Set(prev.map(inst => inst.id));
        const toAdd = newInstances.filter(inst => !existingIds.has(inst.id));
        return [...prev, ...toAdd];
      });
      
      // 각 인스턴스 연결 테스트
      for (const instance of newInstances) {
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
    console.log(`Testing connection for instance: ${instanceId}`);
    
    // localhost 인스턴스인 경우
    if (localInstance && (instanceId === localInstance.id || instanceId === "localhost:1234" || instanceId.includes("localhost"))) {
      setLocalInstance(prev => prev ? { ...prev, status: "checking" } : prev);
      
      try {
        // localhost의 경우 정규화된 ID 사용
        const testId = "localhost:1234";
        const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/instance/${testId}/test`, {
          method: 'POST'
        });
        
        const data = await response.json();
        console.log('Connection test result:', data);
        
        setLocalInstance(prev => prev ? {
          ...prev,
          status: data.connected ? "connected" : "disconnected",
          models: data.models || [],
          lastChecked: new Date()
        } : prev);
        
        if (data.models && data.models.length > 0) {
          setInstanceModels(prev => ({ ...prev, [instanceId]: data.models }));
        }
        return;
      } catch (error) {
        console.error('Connection test failed:', error);
        setLocalInstance(prev => prev ? { ...prev, status: "disconnected" } : prev);
        return;
      }
    }
    
    // 네트워크 인스턴스인 경우
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
      console.log('Added instance:', data);
      
      const newInstance: NetworkInstance = {
        id: data.id,
        ip: manualHost,
        hostname: manualHost,
        port: parseInt(manualPort),
        status: data.status === "connected" ? "connected" : "disconnected",
        is_local: data.is_local,
        models: data.models || [],
        performance_score: 0,
        lastChecked: new Date(),
        enabled: false,
        priority: 1,
        tags: [],
        max_concurrent_tasks: 5,
        notes: "",
        is_registered: data.is_registered || false
      };
      
      // localhost인 경우 정규화
      if (newInstance.is_local || newInstance.id === "localhost:1234" || 
          (manualHost === "localhost" && parseInt(manualPort) === 1234) ||
          (manualHost === "127.0.0.1" && parseInt(manualPort) === 1234)) {
        const normalizedLocal = {
          ...newInstance,
          id: "localhost:1234",
          hostname: "localhost",
          ip: "127.0.0.1",
          is_local: true
        };
        setLocalInstance(normalizedLocal);
        console.log('Added localhost instance:', normalizedLocal);
      } else {
        setNetworkInstances(prev => [...prev, newInstance]);
      }
      
      setManualHost("");
      setManualPort("1234");
    } catch (error) {
      console.error('Failed to add instance:', error);
    }
  };
  
  // 인스턴스 제거
  const handleRemoveInstance = async (instanceId: string) => {
    // localhost는 제거할 수 없음
    if (instanceId === "localhost:1234" || instanceId.includes("localhost")) {
      alert('Cannot remove localhost instance');
      return;
    }
    
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
    const instance = allInstances.find(inst => inst.id === instanceId);
    if (instance) {
      onUpdateLMStudioConfig({
        ...lmStudioConfig,
        endpoint: `http://${instance.ip}:${instance.port}/v1/chat/completions`,
        model: instance.current_model || instance.models[0] || ""
      });
    }
  };
  
  // 모델 동기화
  const handleSyncModel = async () => {
    if (!modelConfig.default) {
      console.error('No default model selected');
      return;
    }
    
    setIsSyncing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/sync-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelConfig.default,
          source_instance_id: 'localhost:1234'
        })
      });
      
      const data = await response.json();
      console.log('Sync results:', data);
      
      // 모든 인스턴스 다시 확인
      for (const instance of registeredInstances) {
        if (instance.status === "connected") {
          await testInstanceConnection(instance.id);
        }
      }
    } catch (error) {
      console.error('Model sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };
  
  // 초기 인스턴스 목록 로드
  useEffect(() => {
    const loadInstances = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/instances`);
        const data = await response.json();
        
        console.log('Loaded instances:', data.instances);
        
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
          lastChecked: new Date(),
          enabled: inst.enabled ?? true,
          priority: inst.priority ?? 1,
          tags: inst.tags || [],
          max_concurrent_tasks: inst.max_concurrent_tasks || 5,
          notes: inst.notes || "",
          is_registered: inst.is_registered ?? false
        }));
        
        // localhost 찾기 - 더 정확한 조건
        const local = instances.find(inst => 
          inst.is_local || 
          inst.id === "localhost:1234" || 
          (inst.hostname === "localhost" && inst.port === 1234) ||
          (inst.ip === "127.0.0.1" && inst.port === 1234)
        );
        
        if (local) {
          // localhost ID 정규화
          const normalizedLocal = {
            ...local,
            id: "localhost:1234",
            hostname: "localhost",
            ip: "127.0.0.1",
            is_local: true
          };
          setLocalInstance(normalizedLocal);
          console.log('Set localhost instance:', normalizedLocal);
          
          // 연결 테스트
          if (normalizedLocal.status !== "connected") {
            await testInstanceConnection(normalizedLocal.id);
          }
        } else {
          // localhost가 없으면 추가 시도
          console.log('No localhost found, attempting to add...');
          try {
            const addResponse = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/add-instance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ host: 'localhost', port: 1234 })
            });
            
            const addData = await addResponse.json();
            if (addData.id) {
              const newLocal: NetworkInstance = {
                id: "localhost:1234",
                ip: '127.0.0.1',
                hostname: 'localhost',
                port: 1234,
                status: addData.status || "disconnected",
                is_local: true,
                models: addData.models || [],
                performance_score: 1.0,
                lastChecked: new Date(),
                enabled: true,
                priority: 1,
                tags: [],
                max_concurrent_tasks: 5,
                notes: "",
                is_registered: addData.is_registered || false
              };
              setLocalInstance(newLocal);
              console.log('Added new localhost instance:', newLocal);
              
              // 연결 테스트
              if (newLocal.status !== "connected") {
                await testInstanceConnection(newLocal.id);
              }
            }
          } catch (error) {
            console.error('Failed to add localhost instance:', error);
          }
        }
        
        // localhost가 아닌 인스턴스들만 networkInstances에 저장
        const remoteInstances = instances.filter(inst => 
          !inst.is_local && 
          inst.id !== "localhost:1234" &&
          inst.hostname !== "localhost" &&
          inst.ip !== "127.0.0.1"
        );
        setNetworkInstances(remoteInstances);
        console.log('Set remote instances:', remoteInstances);
        
      } catch (error) {
        console.error('Failed to load instances:', error);
      }
    };
    
    loadInstances();
  }, []);
  
  // 컴포넌트 마운트 시 설정 불러오기
  useEffect(() => {
    if (!settingsLoaded) {
      loadSettings();
    }
  }, [settingsLoaded, loadSettings]);
  
  // 프로필 목록 불러오기
  const loadProfiles = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/settings/profiles`);
      const data = await response.json();
      if (data.status === "success") {
        setProfiles(data.profiles);
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  };
  
  // 프로필 저장
  const saveProfile = async (name: string, description: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/settings/save-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      
      const data = await response.json();
      if (data.status === "success") {
        await loadProfiles();
        return true;
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
    }
    return false;
  };
  
  // 프로필 로드
  const loadProfile = async (name: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/settings/load-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      
      const data = await response.json();
      if (data.status === "success") {
        // 설정이 적용되었으므로 다시 로드
        await loadSettings();
        return true;
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
    return false;
  };
  
  // localhost 인스턴스가 변경되면 모델 목록 업데이트
  useEffect(() => {
    if (localInstance && localInstance.status === "connected" && localInstance.id) {
      console.log('Localhost instance connected, checking models:', localInstance);
      // 이미 연결된 경우 모델 목록이 있는지 확인
      if (!localInstance.models || localInstance.models.length === 0) {
        console.log('No models found, testing connection...');
        testInstanceConnection(localInstance.id);
      }
    }
  }, [localInstance?.id, localInstance?.status]);
  
  // System 탭이 선택되면 프로필 목록 불러오기
  useEffect(() => {
    if (selectedTab === "system") {
      loadProfiles();
    }
  }, [selectedTab]);
  
  const isConfigurationReady = !!modelConfig.default && localInstance?.status === "connected";
  
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
              <CardTitle>Analyst Model</CardTitle>
              <CardDescription>Primary model for data analysis and insights generation (System: localhost)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="analyst-model">Select Model</Label>
                <Select
                  value={modelConfig.default || ""}
                  onValueChange={(value) => onUpdateModelConfig({ ...modelConfig, default: value })}
                >
                  <SelectTrigger id="analyst-model">
                    <SelectValue placeholder="Select a model">
                      {modelConfig.default || "Select a model"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* 저장된 모델이 목록에 없어도 표시 */}
                    {modelConfig.default && localInstance?.models && !localInstance.models.includes(modelConfig.default) && (
                      <SelectItem value={modelConfig.default}>
                        {modelConfig.default} (Not available)
                      </SelectItem>
                    )}
                    
                    {localInstance?.status === "connected" && localInstance.models.length > 0 ? (
                      localInstance.models.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))
                    ) : localInstance?.status === "connected" ? (
                      <SelectItem value="no-models" disabled>
                        No models available in localhost
                      </SelectItem>
                    ) : (
                      <SelectItem value="not-connected" disabled>
                        Connecting to localhost...
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Status: {localInstance?.status === "connected" ? (
                    <span className="text-green-600 dark:text-green-400">Connected</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">Disconnected</span>
                  )}
                </span>
                <div className="flex gap-2">
                  {!localInstance && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const response = await fetch(`${API_BASE_URL}/api/argosa/analysis/lm-studio/add-instance`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ host: 'localhost', port: 1234 })
                          });
                          const data = await response.json();
                          
                          if (data.status === "connected") {
                            const newLocal: NetworkInstance = {
                              id: "localhost:1234",
                              ip: '127.0.0.1',
                              hostname: 'localhost',
                              port: 1234,
                              status: "connected",
                              is_local: true,
                              models: data.models || [],
                              performance_score: 1.0,
                              lastChecked: new Date(),
                              is_registered: data.is_registered || false
                            };
                            setLocalInstance(newLocal);
                          }
                        } catch (error) {
                          console.error('Failed to connect to localhost:', error);
                        }
                      }}
                    >
                      Connect to localhost
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => localInstance ? testInstanceConnection(localInstance.id) : null}
                    disabled={!localInstance}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <Button 
                onClick={handleSaveConfiguration} 
                disabled={isConfiguring || !modelConfig.default}
                className="w-full"
              >
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
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Use Analyst Model</SelectItem>
                          {(() => {
                            // 모든 연결된 인스턴스의 모델을 합쳐서 표시
                            const allModels = new Set<string>();
                            
                            // localhost 모델 추가
                            if (localInstance?.models) {
                              localInstance.models.forEach(model => allModels.add(model));
                            }
                            
                            // 등록된 네트워크 인스턴스 모델 추가
                            registeredInstances
                              .filter(inst => inst.status === "connected" && inst.enabled)
                              .forEach(inst => {
                                inst.models.forEach(model => allModels.add(model));
                              });
                            
                            const models = Array.from(allModels);
                            
                            return models.length > 0 ? (
                              models.map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="no-models" disabled>
                                No models available
                              </SelectItem>
                            );
                          })()}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
              </div>
              
              <div className="mt-4 pt-4 border-t">
                <Button 
                  onClick={saveSettings}
                  variant="outline"
                  className="w-full"
                >
                  Save Agent Model Configuration
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Sync Model to All Instances - 가장 아래에 배치 */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="w-5 h-5" />
                Deploy Configuration
              </CardTitle>
              <CardDescription>
                Sync your selected model configuration to all registered network instances for distributed processing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Selected Model:</span>
                    <span className="font-mono font-medium">{modelConfig.default || "Not selected"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Target Instances:</span>
                    <span>{registeredInstances.filter(inst => inst.status === "connected" && inst.enabled).length} connected & enabled</span>
                  </div>
                </div>
                
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleSyncModel}
                  disabled={!isConfigurationReady || isSyncing || registeredInstances.filter(inst => inst.status === "connected" && inst.enabled).length === 0}
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Syncing Model to Registered Instances...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Sync Model to Registered Instances
                    </>
                  )}
                </Button>
                
                {!isConfigurationReady && (
                  <p className="text-sm text-muted-foreground text-center">
                    Please select an Analyst Model and ensure localhost is connected before syncing
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="network" className="space-y-4">
          {/* Distributed Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="w-5 h-5" />
                Distributed Execution Settings
              </CardTitle>
              <CardDescription>
                Configure how tasks are distributed across network instances
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Distributed Execution</Label>
                  <p className="text-sm text-muted-foreground">Use network instances for AI tasks</p>
                </div>
                <Switch 
                  checked={distributedSettings.enabled}
                  onCheckedChange={(checked) => {
                    setDistributedSettings(prev => ({ ...prev, enabled: checked }));
                    saveSettings();
                  }}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Instance Selection Method</Label>
                <Select
                  value={distributedSettings.instance_selection}
                  onValueChange={(value: any) => {
                    setDistributedSettings(prev => ({ ...prev, instance_selection: value }));
                    saveSettings();
                  }}
                  disabled={!distributedSettings.enabled}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="performance">Performance-based (Recommended)</SelectItem>
                    <SelectItem value="round_robin">Round Robin</SelectItem>
                    <SelectItem value="manual">Manual Priority</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Retries</Label>
                  <Input
                    type="number"
                    value={distributedSettings.max_retries}
                    onChange={(e) => {
                      setDistributedSettings(prev => ({ ...prev, max_retries: parseInt(e.target.value) || 3 }));
                    }}
                    onBlur={saveSettings}
                    disabled={!distributedSettings.enabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timeout (seconds)</Label>
                  <Input
                    type="number"
                    value={distributedSettings.timeout}
                    onChange={(e) => {
                      setDistributedSettings(prev => ({ ...prev, timeout: parseInt(e.target.value) || 60 }));
                    }}
                    onBlur={saveSettings}
                    disabled={!distributedSettings.enabled}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-discover New Instances</Label>
                  <p className="text-sm text-muted-foreground">Automatically add discovered instances</p>
                </div>
                <Switch 
                  checked={distributedSettings.auto_discover}
                  onCheckedChange={(checked) => {
                    setDistributedSettings(prev => ({ ...prev, auto_discover: checked }));
                    saveSettings();
                  }}
                  disabled={!distributedSettings.enabled}
                />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="w-5 h-5" />
                Network Discovery
              </CardTitle>
              <CardDescription>
                Discover and manage LM Studio instances on your network for distributed processing
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
                  {allInstances.length} instances found
                  <span className="text-xs">
                    ({registeredInstances.length} registered)
                  </span>
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
          
          {/* Instance Pool - All Instances */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Instance Pool</CardTitle>
              <CardDescription>
                All discovered LM Studio instances on your network
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 px-6 py-4">
                  {allInstances.map((instance) => (
                    <div
                      key={instance.id}
                      className={`group transition-all rounded-lg border p-4 ${
                        selectedInstance === instance.id 
                          ? 'ring-2 ring-primary bg-primary/5' 
                          : 'hover:bg-background/50'
                      }`}
                      onClick={() => handleSelectInstance(instance.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 cursor-pointer">
                          <span className={`p-2 rounded-md ${
                            instance.status === "connected" 
                              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' 
                              : instance.status === "checking" 
                                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' 
                                : 'bg-destructive/10 text-destructive'
                          }`}>
                            <Monitor className="w-5 h-5" />
                          </span>
                          <div>
                            <p className="font-medium leading-none">
                              {instance.hostname}
                              {instance.hostname !== instance.ip && (
                                <span className="text-xs text-muted-foreground ml-1">({instance.ip})</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Port {instance.port}
                              {instance.is_local && (
                                <Badge variant="outline" className="ml-2 text-xs h-4">Local</Badge>
                              )}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {instance.status === "connected" && (
                            <Badge variant="secondary" className="text-xs font-normal">
                              {instance.models.length} models
                            </Badge>
                          )}
                          
                          {instance.status === "connected" && (
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          )}
                          {instance.status === "disconnected" && (
                            <XCircle className="w-4 h-4 text-destructive" />
                          )}
                          {instance.status === "checking" && (
                            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                          )}
                          
                          {instance.is_registered ? (
                            <Badge variant="default" className="text-xs">
                              Registered
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                // localhost의 경우 정규화된 ID 사용
                                const registerId = instance.is_local ? "localhost:1234" : instance.id;
                                console.log(`Registering instance with ID: ${registerId}`);
                                toggleInstanceRegistration(registerId, true);
                              }}
                              disabled={instance.status !== "connected"}
                            >
                              Register
                            </Button>
                          )}
                          
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              testInstanceConnection(instance.id);
                            }}
                          >
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {selectedInstance === instance.id && instance.models.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <Label className="text-sm">Available Models</Label>
                          <Select
                            value={selectedModels[instance.id] || instance.current_model || instance.models[0]}
                            onValueChange={(model) => {
                              setSelectedModels(prev => ({ ...prev, [instance.id]: model }));
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
                    </div>
                  ))}
                  
                  {allInstances.length === 0 && (
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
          
          {/* Registered Instances Pool */}
          <Card className="shadow-sm border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Registered Instance Pool
              </CardTitle>
              <CardDescription>
                Instances registered for distributed task processing ({registeredInstances.length} total)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {registeredInstances.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <UserCheck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No registered instances yet</p>
                  <p className="text-sm mt-1">Register instances from the pool above to enable distributed processing</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4 px-6 py-4">
                    {registeredInstances.map((instance) => (
                      <div
                        key={instance.id}
                        className={`group transition-all rounded-lg border ${
                          !instance.enabled ? 'opacity-60' : ''
                        }`}
                      >
                        <div className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {/* 활성화 토글 */}
                              <Switch
                                checked={instance.enabled ?? true}
                                onCheckedChange={(checked) => {
                                  updateInstanceSettings(instance.id, { enabled: checked });
                                }}
                              />
                              
                              <span className={`p-2 rounded-md ${
                                instance.status === "connected" 
                                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' 
                                  : instance.status === "checking" 
                                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' 
                                    : 'bg-destructive/10 text-destructive'
                              }`}>
                                <Monitor className="w-5 h-5" />
                              </span>
                              <div>
                                <p className="font-medium leading-none">
                                  {instance.hostname}
                                  {instance.hostname !== instance.ip && (
                                    <span className="text-xs text-muted-foreground ml-1">({instance.ip})</span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Port {instance.port} • Priority: {instance.priority}
                                  {instance.is_local && (
                                    <Badge variant="outline" className="ml-2 text-xs h-4">Local</Badge>
                                  )}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {/* 태그 표시 */}
                              {instance.tags && instance.tags.length > 0 && (
                                <div className="flex gap-1">
                                  {instance.tags.map(tag => (
                                    <Badge key={tag} variant="secondary" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              
                              {instance.status === "connected" && (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {instance.models.length} models
                                </Badge>
                              )}
                              
                              {/* 우선순위 표시 */}
                              <div className="flex items-center gap-1">
                                {Array.from({ length: instance.priority || 1 }).map((_, i) => (
                                  <Star key={i} className="w-3 h-3 fill-current text-amber-500" />
                                ))}
                              </div>
                              
                              {instance.status === "connected" && (
                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                              )}
                              {instance.status === "disconnected" && (
                                <XCircle className="w-4 h-4 text-destructive" />
                              )}
                              {instance.status === "checking" && (
                                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                              )}
                              
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setEditingInstance(instance.id === editingInstance ? null : instance.id);
                                    setEditingTags(instance.tags?.join(", ") || "");
                                    setEditingNotes(instance.notes || "");
                                  }}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => testInstanceConnection(instance.id)}
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </Button>
                                
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    // localhost의 경우 정규화된 ID 사용
                                    const unregisterId = instance.is_local ? "localhost:1234" : instance.id;
                                    toggleInstanceRegistration(unregisterId, false);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          {/* 편집 패널 - 인라인으로 표시 */}
                          {editingInstance === instance.id && (
                            <div className="mt-4 p-4 bg-muted/20 rounded-lg space-y-4">
                              <div className="space-y-2">
                                <Label>Priority (1-5)</Label>
                                <Slider
                                  value={[instance.priority || 1]}
                                  onValueChange={([value]) => {
                                    if (instance.is_local && localInstance) {
                                      setLocalInstance({ ...localInstance, priority: value });
                                    } else {
                                      setNetworkInstances(prev => prev.map(inst => 
                                        inst.id === instance.id ? { ...inst, priority: value } : inst
                                      ));
                                    }
                                  }}
                                  min={1}
                                  max={5}
                                  step={1}
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Low</span>
                                  <span>High</span>
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Tags</Label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {availableTags.map(tag => (
                                    <Badge
                                      key={tag}
                                      variant={editingTags.includes(tag) ? "default" : "outline"}
                                      className="cursor-pointer"
                                      onClick={() => {
                                        if (editingTags.includes(tag)) {
                                          setEditingTags(editingTags.replace(tag, "").replace(/,\s*,/, ",").trim());
                                        } else {
                                          setEditingTags(editingTags ? `${editingTags}, ${tag}` : tag);
                                        }
                                      }}
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                                <Input
                                  placeholder="gpu, high-memory, fast"
                                  value={editingTags}
                                  onChange={(e) => setEditingTags(e.target.value)}
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Max Concurrent Tasks</Label>
                                <Input
                                  type="number"
                                  value={instance.max_concurrent_tasks || 5}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value) || 5;
                                    if (instance.is_local && localInstance) {
                                      setLocalInstance({ ...localInstance, max_concurrent_tasks: value });
                                    } else {
                                      setNetworkInstances(prev => prev.map(inst => 
                                        inst.id === instance.id ? { ...inst, max_concurrent_tasks: value } : inst
                                      ));
                                    }
                                  }}
                                  min={1}
                                  max={20}
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Notes</Label>
                                <Input
                                  placeholder="Add notes about this instance..."
                                  value={editingNotes}
                                  onChange={(e) => setEditingNotes(e.target.value)}
                                />
                              </div>
                              
                              <div className="flex gap-2 justify-end">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setEditingInstance(null)}
                                >
                                  Cancel
                                </Button>
                                <Button 
                                  size="sm"
                                  onClick={() => {
                                    updateInstanceSettings(instance.id, {
                                      priority: instance.priority,
                                      tags: editingTags.split(",").map(t => t.trim()).filter(t => t),
                                      notes: editingNotes,
                                      max_concurrent_tasks: instance.max_concurrent_tasks
                                    });
                                    setEditingInstance(null);
                                  }}
                                >
                                  Save Changes
                                </Button>
                              </div>
                            </div>
                          )}
                          
                          {instance.notes && editingInstance !== instance.id && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              Notes: {instance.notes}
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
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuration Profiles</CardTitle>
              <CardDescription>Save and load different configuration profiles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Profile name" id="profile-name" />
                <Input placeholder="Description (optional)" id="profile-desc" className="flex-1" />
                <Button onClick={async () => {
                  const nameInput = document.getElementById('profile-name') as HTMLInputElement;
                  const descInput = document.getElementById('profile-desc') as HTMLInputElement;
                  if (nameInput.value) {
                    const saved = await saveProfile(nameInput.value, descInput.value);
                    if (saved) {
                      nameInput.value = '';
                      descInput.value = '';
                    }
                  }
                }}>
                  Save Profile
                </Button>
              </div>
              
              <div className="space-y-2">
                {profiles.map((profile) => (
                  <div key={profile.name} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="font-medium">{profile.name}</p>
                      {profile.description && (
                        <p className="text-sm text-muted-foreground">{profile.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Created: {new Date(profile.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadProfile(profile.name)}
                    >
                      Load
                    </Button>
                  </div>
                ))}
              </div>
              
              {profiles.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No saved profiles yet
                </p>
              )}
            </CardContent>
          </Card>
          
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