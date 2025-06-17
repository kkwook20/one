/**
 * LLMConversationTab.tsx
 * 
 * LLM Conversation 수집 탭 UI
 * DataCollection.tsx에서 필요한 props 전달받아 사용
 */

import { useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Database,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  FolderOpen,
  MessageSquare,
  TrendingUp,
  X,
  ChevronDown,
  Trash2,
  File,
  ExternalLink,
  Loader2,
  Eye,
  EyeOff,
  Activity
} from "lucide-react";

import type { SystemState, SessionInfo } from "../DataCollection";
import { formatDate } from "../DataCollection";

// ======================== Type Definitions ========================

interface LLMConversationTabProps {
  systemState: SystemState;
  setSystemState: React.Dispatch<React.SetStateAction<SystemState>>;
  isBackendConnected: boolean;
  stats: any;
  loadStats: () => Promise<void>;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
  apiBaseUrl: string;
  wsRef?: React.MutableRefObject<WebSocket | null>;
}

interface LLMConfig {
  key: string;
  name: string;
  type: string;
  url: string;
  enabled: boolean;
  icon: string;
  color: string;
  todayCount?: number;
  yesterdayCount?: number;
  dayBeforeCount?: number;
}

interface SyncSettings {
  startTime: string;
  interval: string;
  maxConversations: number;
  randomDelay: number;
  dataRetention: number;
  firefoxVisible: boolean;
}

interface ScheduleFailure {
  reason: string;
  timestamp: string;
  details: any;
}

interface FileListItem {
  platform: string;
  files: string[];
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

interface LLMStatsProps {
  platform: string;
  config: LLMConfig;
  sessionInfo?: SessionInfo;
}

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
}

interface ActivityItemProps {
  time: string;
  action: string;
  source: string;
  count: string;
  type?: 'normal' | 'error' | 'success';
}

// ======================== Constants ========================

const PLATFORMS: Record<string, LLMConfig> = {
  chatgpt: {
    key: 'chatgpt',
    name: 'ChatGPT',
    type: 'OpenAI',
    url: 'https://chat.openai.com',
    enabled: true,
    icon: 'GPT',
    color: '#10a37f'
  },
  claude: {
    key: 'claude',
    name: 'Claude',
    type: 'Anthropic',
    url: 'https://claude.ai',
    enabled: true,
    icon: 'C',
    color: '#6366f1'
  },
  gemini: {
    key: 'gemini',
    name: 'Gemini',
    type: 'Google',
    url: 'https://gemini.google.com',
    enabled: false,
    icon: 'G',
    color: '#4285f4'
  },
  deepseek: {
    key: 'deepseek',
    name: 'DeepSeek',
    type: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    enabled: false,
    icon: 'DS',
    color: '#5b21b6'
  },
  grok: {
    key: 'grok',
    name: 'Grok',
    type: 'xAI',
    url: 'https://grok.x.ai',
    enabled: false,
    icon: 'X',
    color: '#1f2937'
  },
  perplexity: {
    key: 'perplexity',
    name: 'Perplexity',
    type: 'Perplexity',
    url: 'https://www.perplexity.ai',
    enabled: false,
    icon: 'P',
    color: '#10b981'
  }
};

// ======================== Helper Functions ========================

const getSessionExpiryDisplay = (expiresAt: string | undefined) => {
  if (!expiresAt) return null;
  
  const expires = new Date(expiresAt);
  const now = new Date();
  const diff = expires.getTime() - now.getTime();
  
  if (diff <= 0) return null;
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes}m`;
  }
};

// ======================== Main Component ========================

export default function LLMConversationTab({
  systemState,
  setSystemState,
  isBackendConnected,
  stats,
  loadStats,
  onSuccess,
  onError,
  apiBaseUrl,
  wsRef
}: LLMConversationTabProps) {
  // ==================== State Management ====================
  
  // Platform Configurations
  const [platformConfigs, setPlatformConfigs] = useState(() => {
    // Load enabled states from localStorage
    const savedEnabledStates = localStorage.getItem('llmEnabledStates');
    const configs = { ...PLATFORMS };
    
    if (savedEnabledStates) {
      try {
        const states = JSON.parse(savedEnabledStates);
        Object.keys(states).forEach(key => {
          if (configs[key]) {
            configs[key].enabled = states[key];
          }
        });
      } catch (e) {
        console.error('Failed to load saved states:', e);
      }
    }
    
    return configs;
  });
  
  // Sync Settings
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(() => {
    const saved = localStorage.getItem('syncSettings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load sync settings:', e);
      }
    }
    return {
      startTime: '02:00',
      interval: 'daily',
      maxConversations: 20,
      randomDelay: 5,
      dataRetention: 30,
      firefoxVisible: true
    };
  });
  
  // UI States
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [filesList, setFilesList] = useState<FileListItem[]>([]);
  const [checkingSession, setCheckingSession] = useState<string | null>(null);
  const [openingLoginPlatform, setOpeningLoginPlatform] = useState<string | null>(null);
  const [scheduleFailure, setScheduleFailure] = useState<ScheduleFailure | null>(null);
  
  // Timer refs
  const sessionAutoCheckRef = useRef<NodeJS.Timeout | null>(null);
  const loginCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const websocketRef = wsRef || { current: null }; // fallback if not provided
  
  // ==================== API Functions ====================
  
  const loadScheduleFailure = useCallback(async () => {
    // Schedule failure는 systemState에서 직접 확인
    // 백엔드에 별도 엔드포인트가 없음
  }, []);
  
  const checkSessionManual = async (platform: string) => {
    setCheckingSession(platform);
    
    try {
      // 세션 정보는 WebSocket을 통해 자동 업데이트되므로
      // 현재 상태를 확인하기만 하면 됨
      const sessionInfo = systemState.sessions[platform];
      
      if (!sessionInfo) {
        // 세션 정보가 없으면 강제로 체크 요청
        console.log(`No session info for ${platform}, waiting for update...`);
        
        // WebSocket이 연결되어 있다면 state update를 기다림
        if (websocketRef?.current?.readyState === WebSocket.OPEN) {
          // 잠시 대기 후 다시 확인
          await new Promise(resolve => setTimeout(resolve, 2000));
          const updatedInfo = systemState.sessions[platform];
          return updatedInfo?.valid || false;
        }
      }
      
      return sessionInfo?.valid || false;
      
    } catch (error) {
      console.error('Session check error:', error);
      onError(`Failed to check session for ${PLATFORMS[platform]?.name}`);
      return false;
    } finally {
      setCheckingSession(null);
    }
  };
  
  const checkAllSessions = async () => {
    console.log('🔄 Checking all sessions...');
    
    try {
      const enabledPlatforms = Object.keys(platformConfigs).filter(
        key => platformConfigs[key].enabled
      );
      
      for (const platform of enabledPlatforms) {
        await checkSessionManual(platform);
        // Small delay between checks
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
    } catch (error) {
      console.error('Error checking all sessions:', error);
    }
  };
  
  const startSync = async () => {
    const enabledPlatforms = Object.values(platformConfigs)
      .filter(p => p.enabled)
      .map(p => p.key);
    
    if (enabledPlatforms.length === 0) {
      onSuccess('Please enable at least one platform');
      return;
    }
    
    // Check sessions before sync
    const invalidSessions = [];
    for (const platform of enabledPlatforms) {
      const sessionInfo = systemState.sessions[platform];
      if (!sessionInfo?.valid) {
        invalidSessions.push(platform);
      }
    }
    
    if (invalidSessions.length > 0) {
      const platformNames = invalidSessions.map(p => PLATFORMS[p]?.name || p).join(', ');
      
      if (window.confirm(`The following platforms need login: ${platformNames}\n\nWould you like to open the login page?`)) {
        openLoginPage(invalidSessions[0]);
        return;
      } else {
        return;
      }
    }
    
    try {
      // Native Messaging을 통한 수집
      const response = await fetch(`${apiBaseUrl}/data/collect/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: enabledPlatforms,
          settings: {
            ...syncSettings,
            visible: syncSettings.firefoxVisible
          }
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || error.error || 'Collection failed');
      }
      
      const result = await response.json();
      console.log('Collection started:', result);
      
      if (result.success) {
        onSuccess(`Collected ${result.collected} conversations (${result.excluded_llm || 0} LLM queries excluded)`);
      } else {
        throw new Error(result.error || 'Collection failed');
      }
      
      // Clear any schedule failure
      setScheduleFailure(null);
      
      // Reload stats
      await loadStats();
      
    } catch (error: any) {
      console.error('Failed to start collection:', error);
      onError(`Error: ${error.message}`);
    }
  };
  
  const cancelSync = async () => {
    // Native collection은 취소 기능이 없음
    console.log('Collection cancellation not available with Native Messaging');
  };
  
  const openLoginPage = async (platform: string) => {
      const config = PLATFORMS[platform];
      if (!config || openingLoginPlatform) return;
      
      console.log(`🔐 Opening login for ${platform}`);
      setOpeningLoginPlatform(platform);
      
      try {
        // ensure_firefox 엔드포인트 사용으로 변경!
        const response = await fetch(`${apiBaseUrl}/data/sessions/ensure_firefox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: platform,
            profile_path: 'F:\\ONE_AI\\firefox-profile'  // 필요시 경로 수정
          })
        });

        if (!response.ok) {
          throw new Error('Failed to ensure Firefox');
        }

        const result = await response.json();
        console.log(`✅ Firefox ensured, command_id: ${result.command_id}`);
        onSuccess(`Opening ${config.name} in Firefox Developer Edition...`);
        
        // 로그인 성공 확인을 위한 주기적 체크
        let checkCount = 0;
        const maxChecks = 36; // 3 minutes (5초 * 36 = 180초)
        
        loginCheckIntervalRef.current = setInterval(async () => {
          checkCount++;
          
          // WebSocket을 통해 업데이트된 세션 정보 확인
          const sessionInfo = systemState.sessions[platform];
          const isValid = sessionInfo?.valid || false;
          
          if (isValid) {
            console.log(`✅ ${platform} login detected!`);
            
            setOpeningLoginPlatform(null);
            if (loginCheckIntervalRef.current) {
              clearInterval(loginCheckIntervalRef.current);
              loginCheckIntervalRef.current = null;
            }
            
            onSuccess(`${config.name} login successful!`);
            return;
          }
          
          if (checkCount >= maxChecks) {
            console.log(`⏱️ Login monitoring timeout for ${platform}`);
            setOpeningLoginPlatform(null);
            if (loginCheckIntervalRef.current) {
              clearInterval(loginCheckIntervalRef.current);
              loginCheckIntervalRef.current = null;
            }
            
            // 타임아웃 메시지 표시
            onError(`Login timeout for ${config.name}. Please try again.`);
          }
        }, 5000);
        
      } catch (error) {
        console.error(`❌ Failed to open login page: ${error}`);
        setOpeningLoginPlatform(null);
        onError(`Failed to open Firefox for ${config.name} login`);
      }
    };
    
  const cleanData = async () => {
    if (!window.confirm(
      'Delete all collected data?\n\n' +
      'This will permanently remove all conversation files.\n' +
      'This action cannot be undone!'
    )) return;
    
    try {
      const response = await fetch(`${apiBaseUrl}/data/llm/conversations/clean`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const result = await response.json();
        
        onSuccess(`Deleted ${result.deleted_files} files.`);
        
        // Reload stats
        await loadStats();
      }
    } catch (error) {
      console.error('Failed to clean data');
    }
  };
  
  const viewFiles = async () => {
    try {
      // stats 데이터에서 파일 정보 구성
      if (stats) {
        const files = Object.keys(stats).map(platform => ({
          platform,
          files: [`${platform}_conversations.json`] // 실제 파일 구조에 맞게 추정
        }));
        
        setFilesList(files);
        setShowFilesModal(true);
      }
    } catch (error) {
      console.error('Failed to load files');
    }
  };
  
  const togglePlatform = (platform: string) => {
    const newEnabled = !platformConfigs[platform].enabled;
    
    // Update local state
    setPlatformConfigs(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        enabled: newEnabled
      }
    }));
    
    // Save to localStorage
    const enabledStates = Object.entries(platformConfigs).reduce((acc, [key, config]) => {
      acc[key] = key === platform ? newEnabled : config.enabled;
      return acc;
    }, {} as Record<string, boolean>);
    
    localStorage.setItem('llmEnabledStates', JSON.stringify(enabledStates));
    
    // If enabling, check session immediately
    if (newEnabled) {
      checkSessionManual(platform);
    }
  };
  
  // ==================== Effects ====================
  
  useEffect(() => {
    // Check all sessions on mount
    checkAllSessions();
    
    // Set up automatic session checking (every 30 seconds)
    sessionAutoCheckRef.current = setInterval(() => {
      checkAllSessions();
    }, 30000);
    
    return () => {
      if (sessionAutoCheckRef.current) {
        clearInterval(sessionAutoCheckRef.current);
      }
      if (loginCheckIntervalRef.current) {
        clearInterval(loginCheckIntervalRef.current);
      }
    };
  }, []);
  
  // Save sync settings when changed
  useEffect(() => {
    localStorage.setItem('syncSettings', JSON.stringify(syncSettings));
  }, [syncSettings]);
  
  // ==================== Helper Functions ====================
  
  const getSessionStatus = (platform: string) => {
    const session = systemState.sessions[platform];
    if (!session) return { valid: false, status: 'unknown' };
    
    if (session.source === 'timeout') {
      return { valid: false, status: 'timeout' };
    }
    
    if (session.expires_at) {
      const expires = new Date(session.expires_at);
      const now = new Date();
      if (expires > now) {
        const hours = Math.floor((expires.getTime() - now.getTime()) / (1000 * 60 * 60));
        return { 
          valid: true, 
          status: `Active (${hours}h remaining)`,
          expiresAt: session.expires_at
        };
      }
    }
    
    return { 
      valid: session.valid, 
      status: session.valid ? 'Active' : 'Login required',
      expiresAt: session.expires_at
    };
  };
  
  const canSync = isBackendConnected && 
    systemState.system_status === 'idle' &&
    Object.values(platformConfigs).some(p => p.enabled);
    
  const getDailyStats = () => {
    if (!stats) return { today: 0, yesterday: 0, dayBefore: 0 };
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const dayBefore = new Date(Date.now() - 172800000).toISOString().split('T')[0];
    
    let totals = { today: 0, yesterday: 0, dayBefore: 0 };
    
    // stats 구조에 따라 적절히 처리
    Object.entries(stats).forEach(([platform, platformStats]: [string, any]) => {
      if (platformStats && typeof platformStats === 'object') {
        // 플랫폼별 통계에서 총 대화 수 추출
        const totalConversations = platformStats.total_conversations || 0;
        totals.today += totalConversations; // 임시로 전체를 오늘로 계산
        
        // 플랫폼 설정 업데이트
        if (platformConfigs[platform]) {
          platformConfigs[platform].todayCount = totalConversations;
        }
      }
    });
    
    return totals;
  };
  
  const dailyStats = getDailyStats();
  
  // ==================== Render ====================
  
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Left Panel */}
      <div className="lg:col-span-2 space-y-6">
        <Section title="Data Sources">
          {/* Sync Progress */}
          {systemState.sync_status && (
            <Card className="mb-6">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Activity className="h-4 w-4 animate-pulse" />
                      {systemState.sync_status.message}
                    </span>
                    <span>{systemState.sync_status.progress}%</span>
                  </div>
                  <Progress value={systemState.sync_status.progress} />
                  <div className="text-xs text-gray-500">
                    Collected {systemState.sync_status.collected} conversations
                    {systemState.sync_status.current_platform && 
                      ` • Currently: ${PLATFORMS[systemState.sync_status.current_platform]?.name}`}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Schedule Failure Alert */}
          {scheduleFailure && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-red-900">
                  <AlertCircle className="h-5 w-5" />
                  Scheduled Sync Failed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-red-800 mb-3">
                  Last scheduled sync failed at {formatDate(scheduleFailure.timestamp)}:
                </p>
                <div className="bg-white/80 rounded p-3 text-sm text-red-700">
                  {scheduleFailure.reason === 'session_expired' && 
                    'Session expired. Please log in again.'}
                  {scheduleFailure.reason === 'smart_scheduling' && 
                    'Data is already up to date.'}
                  {scheduleFailure.reason && !['session_expired', 'smart_scheduling'].includes(scheduleFailure.reason) && 
                    scheduleFailure.reason}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setScheduleFailure(null)}
                >
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Storage Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Storage Status</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={viewFiles}
                  disabled={!isBackendConnected}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  View Files
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-900 mb-1">Backend Storage</h4>
                    <div className="bg-white rounded p-2 font-mono text-sm text-gray-700 mb-2">
                      ./data/argosa/llm-conversations
                    </div>
                    <p className="text-xs text-blue-700">
                      Conversations stored by platform
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium mb-3">Statistics</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dailyStats.today}</div>
                    <div className="text-xs text-gray-500">Today</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dailyStats.yesterday}</div>
                    <div className="text-xs text-gray-500">Yesterday</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{dailyStats.dayBefore}</div>
                    <div className="text-xs text-gray-500">2 days ago</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Platforms */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>LLM Platforms</span>
                <div className="flex items-center gap-2">
                  {checkingSession && (
                    <span className="text-sm text-gray-600 flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Checking sessions...
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={checkAllSessions}
                    disabled={checkingSession !== null || !isBackendConnected}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Auto Session Check Notice */}
              <Alert className="bg-blue-50 border-blue-200">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <strong>Automatic Session Management:</strong> Sessions are checked every 30 seconds. 
                  Just log in once and the system will maintain your session.
                </AlertDescription>
              </Alert>

              {/* Platform List */}
              <div className="space-y-2">
                {Object.values(platformConfigs).map((config) => {
                  const { valid, status, expiresAt } = getSessionStatus(config.key);
                  const isChecking = checkingSession === config.key;
                  const isOpening = openingLoginPlatform === config.key;
                  const isSyncing = systemState.sync_status?.current_platform === config.key;
                  
                  return (
                    <div 
                      key={config.key} 
                      className={`rounded-lg p-4 transition-all duration-300 ${
                        isChecking || isOpening || isSyncing
                          ? 'ring-2 ring-gray-400' 
                          : config.enabled
                          ? 'bg-gray-50'
                          : 'bg-gray-50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm text-white"
                            style={{ backgroundColor: config.enabled ? config.color : '#9CA3AF' }}
                          >
                            {config.icon}
                          </div>
                          <div>
                            <h4 className="font-medium">{config.name}</h4>
                            <p className="text-xs text-gray-500">{config.url}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              Today: {config.todayCount || 0} | 
                              Yesterday: {config.yesterdayCount || 0} | 
                              2 days: {config.dayBeforeCount || 0}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {isChecking ? (
                                <span className="text-xs text-gray-600 flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Checking session...
                                </span>
                              ) : isOpening ? (
                                <span className="text-xs text-gray-600 flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Opening login page...
                                </span>
                              ) : isSyncing ? (
                                <span className="text-xs text-gray-600 flex items-center gap-1">
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                  Collecting...
                                </span>
                              ) : (
                                <>
                                  <span className={`text-xs font-medium flex items-center gap-1 ${
                                    valid ? 'text-green-600' : 'text-gray-600'
                                  }`}>
                                    {valid ? (
                                      <CheckCircle className="h-3 w-3" />
                                    ) : (
                                      <AlertCircle className="h-3 w-3" />
                                    )}
                                    {status}
                                  </span>
                                  {valid && expiresAt && getSessionExpiryDisplay(expiresAt) && (
                                    <span className="text-xs text-gray-600 flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {getSessionExpiryDisplay(expiresAt)} remaining
                                    </span>
                                  )}
                                </>
                              )}
                              {stats?.[config.key]?.last_sync && (
                                <span className="text-xs text-gray-400">
                                  • Last: {formatDate(stats[config.key].last_sync)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!valid && config.enabled && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openLoginPage(config.key)}
                              disabled={isChecking || isOpening || systemState.system_status !== 'idle'}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Login
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => togglePlatform(config.key)}
                            disabled={systemState.system_status !== 'idle'}
                          >
                            {config.enabled ? 'Disable' : 'Enable'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button 
                  className="flex-1" 
                  onClick={startSync}
                  disabled={!canSync || checkingSession !== null || systemState.system_status === 'collecting'}
                >
                  {systemState.system_status === 'collecting' ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Collecting...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Collect Conversations
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  disabled={systemState.system_status !== 'idle'}
                >
                  <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${
                    showAdvanced ? 'rotate-180' : ''
                  }`} />
                  Advanced
                </Button>
              </div>

              {/* Advanced Options */}
              {showAdvanced && (
                <Card className="mt-4">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Firefox Window Visibility</Label>
                        <p className="text-sm text-gray-600">
                          {syncSettings.firefoxVisible ? 'Show Firefox window during sync' : 'Hide Firefox window during sync (background mode)'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {syncSettings.firefoxVisible ? (
                          <Eye className="h-4 w-4 text-gray-600" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-gray-600" />
                        )}
                        <Switch
                          checked={syncSettings.firefoxVisible}
                          onCheckedChange={(checked) => 
                            setSyncSettings(prev => ({ ...prev, firefoxVisible: checked }))
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Schedule</label>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <Input 
                            type="time" 
                            value={syncSettings.startTime}
                            onChange={(e) => 
                              setSyncSettings(prev => ({ ...prev, startTime: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <select 
                            className="w-full px-3 py-2 border border-gray-200 rounded-md"
                            value={syncSettings.interval}
                            onChange={(e) => 
                              setSyncSettings(prev => ({ ...prev, interval: e.target.value }))
                            }
                          >
                            <option value="daily">Daily (1 day)</option>
                            <option value="3days">Every 3 days</option>
                            <option value="weekly">Weekly (7 days)</option>
                            <option value="manual">Manual only</option>
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {syncSettings.interval !== 'manual' 
                          ? `Auto-sync scheduled at ${syncSettings.startTime} ${syncSettings.interval}`
                          : 'Auto-sync disabled - manual sync only'}
                      </p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium">Max Conversations</label>
                      <Input 
                        type="number" 
                        value={syncSettings.maxConversations}
                        onChange={(e) => 
                          setSyncSettings(prev => ({ 
                            ...prev, 
                            maxConversations: parseInt(e.target.value) || 20 
                          }))
                        }
                        className="mt-1" 
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium">Random Delay (seconds)</label>
                      <Input 
                        type="number" 
                        value={syncSettings.randomDelay}
                        onChange={(e) => 
                          setSyncSettings(prev => ({ 
                            ...prev, 
                            randomDelay: parseInt(e.target.value) || 5 
                          }))
                        }
                        min="2" 
                        max="30" 
                        className="mt-1" 
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium">Data Retention (days)</label>
                      <Input 
                        type="number" 
                        value={syncSettings.dataRetention}
                        onChange={(e) => 
                          setSyncSettings(prev => ({ 
                            ...prev, 
                            dataRetention: parseInt(e.target.value) || 30 
                          }))
                        }
                        min="1" 
                        max="365" 
                        className="mt-1" 
                      />
                    </div>
                    
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        All settings are automatically saved when changed.
                        <br />
                        <button
                          className="text-blue-600 underline text-sm mt-2"
                          onClick={() => {
                            if (window.confirm('Reset all settings to default?\n\nThis will clear all saved configurations.')) {
                              localStorage.removeItem('llmEnabledStates');
                              localStorage.removeItem('syncSettings');
                              window.location.reload();
                            }
                          }}
                        >
                          Reset All Settings
                        </button>
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              )}

              <Button 
                variant="destructive" 
                className="w-full"
                onClick={cleanData}
                disabled={systemState.system_status !== 'idle' || !isBackendConnected}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clean All Data
              </Button>
            </CardContent>
          </Card>
        </Section>
      </div>

      {/* Right Panel */}
      <div className="space-y-6">
        <Section title="Statistics">
          <div className="space-y-4">
            <StatCard
              title="Total Conversations"
              value={Object.values(stats || {}).reduce((sum: number, platform: any) => 
                sum + (platform.total_conversations || 0), 0).toString()}
              change={`+${dailyStats.today}`}
              trend="up"
            />
            <StatCard
              title="Active Platforms"
              value={Object.values(platformConfigs).filter(c => c.enabled).length.toString()}
              change={systemState.schedule_enabled ? "Scheduled" : "Manual"}
              trend="up"
            />
            <StatCard
              title="Today's Sync"
              value={dailyStats.today.toString()}
              change={dailyStats.today > dailyStats.yesterday ? `+${dailyStats.today - dailyStats.yesterday}` : `${dailyStats.today - dailyStats.yesterday}`}
              trend={dailyStats.today >= dailyStats.yesterday ? "up" : "down"}
            />
          </div>
        </Section>

        <Section title="Active Sources">
          <div className="space-y-3">
            {Object.values(platformConfigs)
              .filter(config => config.enabled)
              .map(config => (
                <LLMStats
                  key={config.key}
                  platform={config.name}
                  config={config}
                  sessionInfo={systemState.sessions[config.key]}
                />
              ))}
            {Object.values(platformConfigs).filter(c => c.enabled).length === 0 && (
              <Card>
                <CardContent className="p-4 text-center text-gray-500">
                  No platforms enabled
                </CardContent>
              </Card>
            )}
          </div>
        </Section>

        <Section title="Recent Activity">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                {stats && Object.entries(stats)
                  .filter(([platform]) => platformConfigs[platform])
                  .slice(0, 5)
                  .map(([platform, platformStats]: [string, any]) => (
                    <ActivityItem
                      key={platform}
                      time={formatDate(platformStats.last_sync)}
                      action="Data collected"
                      source={platformConfigs[platform].name}
                      count={`${platformStats.total_conversations || 0} conversations`}
                      type="success"
                    />
                  ))}
                {(!stats || Object.keys(stats).length === 0) && (
                  <div className="text-center text-gray-500 py-4">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No activity yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="System Status">
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Firefox</span>
                  <Badge variant={
                    systemState.firefox_status === 'ready' ? 'default' : 'secondary'
                  }>
                    {systemState.firefox_status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Extension</span>
                  <Badge variant={
                    systemState.extension_status === 'connected' ? 'default' : 'secondary'
                  }>
                    {systemState.extension_status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">System</span>
                  <Badge variant={
                    systemState.system_status === 'idle' ? 'default' : 
                    systemState.system_status === 'error' ? 'destructive' : 'secondary'
                  }>
                    {systemState.system_status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Data Sources</span>
                  <Badge variant="secondary">
                    {systemState.data_sources_active} active
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>
      </div>

      {/* Files Modal */}
      {showFilesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[700px] max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-gray-600" />
                Collected Files
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilesModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              {filesList.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <FolderOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No files found</p>
                </div>
              ) : (
                filesList.map(({ platform, files }) => (
                  <div key={platform} className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <div 
                        className="w-6 h-6 rounded text-white flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: PLATFORMS[platform]?.color || '#9CA3AF' }}
                      >
                        {PLATFORMS[platform]?.icon || '?'}
                      </div>
                      {PLATFORMS[platform]?.name || platform}
                      <Badge variant="secondary">{files.length} files</Badge>
                    </h4>
                    {files.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No files yet</p>
                    ) : (
                      <div className="space-y-1">
                        {files.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                            <File className="h-3 w-3" />
                            <span className="font-mono">{file}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
              
              <div className="bg-gray-50 rounded-lg p-4 mt-4">
                <p className="text-xs text-gray-600">
                  <strong>Path:</strong> <code className="bg-gray-200 px-1 rounded">./data/argosa/llm-conversations</code>
                </p>
              </div>
              
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowFilesModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Components */

function Section({ title, children }: SectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </motion.section>
  );
}

function LLMStats({ platform, config, sessionInfo }: LLMStatsProps) {
  const getStatusIcon = () => {
    if (sessionInfo?.valid) return <CheckCircle className="h-3 w-3 text-green-500" />;
    return <AlertCircle className="h-3 w-3 text-gray-400" />;
  };
  
  const getSessionStatus = () => {
    if (!sessionInfo) return 'Unknown';
    
    if (sessionInfo.valid && sessionInfo.expires_at) {
      const expiry = getSessionExpiryDisplay(sessionInfo.expires_at);
      return expiry ? `Active (${expiry})` : 'Active';
    }
    return sessionInfo.valid ? 'Active' : 'Expired';
  };
  
  return (
    <Card className="bg-gray-50">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gray-400" />
            <span className="font-medium text-sm">{platform}</span>
          </div>
          {getStatusIcon()}
        </div>
        
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500">Session</span>
            <span className="font-medium text-gray-700">
              {getSessionStatus()}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500">Today</span>
            <span className="font-medium">{config.todayCount || 0}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500">Yesterday</span>
            <span className="font-medium">{config.yesterdayCount || 0}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, change, trend }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-gray-600">{title}</p>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-2xl font-bold">{value}</span>
          <span className={`text-sm ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
            {change}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityItem({ time, action, source, count, type = "normal" }: ActivityItemProps) {
  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle className="h-3 w-3 text-green-600" />;
      case 'error': return <AlertCircle className="h-3 w-3 text-red-600" />;
      default: return <Clock className="h-3 w-3 text-gray-400" />;
    }
  };
  
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-xs text-gray-500 w-20 flex-shrink-0">{time}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={type === "error" ? "text-red-600" : "text-gray-800"}>
            {action}
          </span>
          {getIcon()}
        </div>
        <div className="text-xs text-gray-500">
          {source} • {count}
        </div>
      </div>
    </div>
  );
}