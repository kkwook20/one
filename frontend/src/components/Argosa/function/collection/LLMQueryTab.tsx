/**
 * LLMQueryTab.tsx
 * 
 * LLM Query 모니터링 및 관리 UI
 * AI가 데이터 분석 중 자동으로 보낸 LLM 질문들을 확인하고 관리
 * Firefox를 통해 LLM 사이트에 질문을 보내고 답변을 받음
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  MessageSquare,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Bot,
  Activity,
  TrendingUp,
  Settings,
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
  ExternalLink,
  Loader2
} from "lucide-react";

import type { SystemState, SessionInfo } from "../DataCollection";
import { formatDate } from "../DataCollection";

// ======================== Constants ========================

const PLATFORMS: Record<string, {
  key: string;
  name: string;
  url: string;
  icon: string;
  color: string;
}> = {
  chatgpt: { 
    key: 'chatgpt', 
    name: 'ChatGPT', 
    url: 'https://chat.openai.com', 
    icon: 'GPT',
    color: '#374151'  // gray-700
  },
  claude: { 
    key: 'claude', 
    name: 'Claude', 
    url: 'https://claude.ai', 
    icon: 'CL',
    color: '#374151'  // gray-700
  },
  gemini: { 
    key: 'gemini', 
    name: 'Gemini', 
    url: 'https://gemini.google.com', 
    icon: 'GM',
    color: '#374151'  // gray-700
  },
  perplexity: { 
    key: 'perplexity', 
    name: 'Perplexity', 
    url: 'https://www.perplexity.ai', 
    icon: 'PX',
    color: '#374151'  // gray-700
  }
};

// ======================== Type Definitions ========================

interface LLMQueryTabProps {
  isBackendConnected: boolean;
  systemState: SystemState;
  stats: any;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
  apiBaseUrl: string;
}

interface QueryActivity {
  id: string;
  timestamp: string;
  query: string;
  provider: string;
  context: string;
  analysis_phase: string;
  response?: string;
  status: 'pending' | 'completed' | 'failed';
  processing_time?: number;
  triggered_by: string;
}

interface QuerySettings {
  auto_query_enabled: boolean;
  max_queries_per_analysis: number;
  allowed_providers: string[];
  query_timeout: number;
  firefox_visible: boolean;
}

interface AnalysisStatus {
  current_analysis: string | null;
  queries_sent: number;
  queries_completed: number;
  last_query_time: string | null;
  analysis_progress: number;
}

interface QueryStats {
  [platform: string]: {
    today: number;
    yesterday: number;
    day_before: number;
    total: number;
    last_query: string | null;
  };
}

// ======================== Main Component ========================

export default function LLMQueryTab({
  isBackendConnected,
  systemState,
  stats,
  onSuccess,
  onError,
  apiBaseUrl
}: LLMQueryTabProps) {
  // ==================== State Management ====================
  
  const [queryActivities, setQueryActivities] = useState<QueryActivity[]>([]);
  const [querySettings, setQuerySettings] = useState<QuerySettings>({
    auto_query_enabled: true,
    max_queries_per_analysis: 5,
    allowed_providers: ['chatgpt', 'claude', 'gemini'],
    query_timeout: 30,
    firefox_visible: true
  });
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>({
    current_analysis: null,
    queries_sent: 0,
    queries_completed: 0,
    last_query_time: null,
    analysis_progress: 0
  });
  const [queryStats, setQueryStats] = useState<QueryStats>({});
  const [showCompleted, setShowCompleted] = useState(true);
  const [checkingSession, setCheckingSession] = useState<string | null>(null);
  const [openingLoginPlatform, setOpeningLoginPlatform] = useState<string | null>(null);
  
  // Timer refs
  const loginTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  
  // ==================== API Functions ====================
  
  const loadQueryActivities = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/llm/query/activities`);
      
      if (response.ok) {
        const data = await response.json();
        setQueryActivities(data.activities || []);
      }
    } catch (error) {
      console.error('Failed to load query activities:', error);
    }
  }, [apiBaseUrl]);
  
  const loadAnalysisStatus = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/llm/query/analysis/status`);
      
      if (response.ok) {
        const data = await response.json();
        setAnalysisStatus(data);
      }
    } catch (error) {
      console.error('Failed to load analysis status:', error);
    }
  }, [apiBaseUrl]);
  
  const loadQuerySettings = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/llm/query/settings`);
      
      if (response.ok) {
        const data = await response.json();
        setQuerySettings(data);
      } else {
        console.error('Failed to load LLM query settings:', response.status);
      }
    } catch (error) {
      console.error('Error loading LLM query settings:', error);
    }
  }, [apiBaseUrl]);
  
  const loadQueryStats = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/llm/query/stats`);
      
      if (response.ok) {
        const data = await response.json();
        setQueryStats(data);
      }
    } catch (error) {
      console.error('Failed to load query stats:', error);
    }
  }, [apiBaseUrl]);
  
  const updateQuerySettings = async (newSettings: Partial<QuerySettings>) => {
    try {
      // Merge new settings with existing ones
      const updatedSettings = { ...querySettings, ...newSettings };
      
      const response = await fetch(`${apiBaseUrl}/llm/query/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      });
      
      if (response.ok) {
        const data = await response.json();
        setQuerySettings(data);
        onSuccess('Query settings updated');
      } else {
        throw new Error(`Failed to save settings: ${response.status}`);
      }
      
    } catch (error) {
      console.error('Failed to update query settings:', error);
      onError('Failed to update query settings. Please restart the backend server.');
    }
  };
  
  const clearCompletedQueries = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/llm/query/activities/clear`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await loadQueryActivities();
        onSuccess('Completed queries cleared');
      }
    } catch (error) {
      console.error('Failed to clear queries:', error);
      onError('Failed to clear completed queries');
    }
  };
  
  const checkSessionManual = async (platform: string) => {
    setCheckingSession(platform);
    
    try {
      const sessionInfo = systemState.sessions[platform];
      
      if (!sessionInfo) {
        console.log(`No session info for ${platform}, waiting for update...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        const updatedInfo = systemState.sessions[platform];
        return updatedInfo?.valid || false;
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
    console.log('🔄 Checking all LLM query sessions...');
    
    try {
      const enabledPlatforms = querySettings.allowed_providers;
      
      for (const platform of enabledPlatforms) {
        await checkSessionManual(platform);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
    } catch (error) {
      console.error('Error checking all sessions:', error);
    }
  };
  
  const openLoginPage = async (platform: string) => {
    const config = PLATFORMS[platform];
    if (!config || openingLoginPlatform) return;
    
    if (systemState.extension_status === 'disconnected') {
      onError(`Waiting for Extension connection...`);
      
      let waited = 0;
      while (systemState.extension_status === 'disconnected' && waited < 15) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        waited++;
      }
      
      if (systemState.extension_status === 'disconnected') {
        onError(`Extension not connected. Please check Firefox.`);
        return;
      }
    }
    
    console.log(`🔐 Opening login for ${platform}`);
    setOpeningLoginPlatform(platform);
    
    try {
      const response = await fetch(`${apiBaseUrl}/data/sessions/ensure_firefox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platform,
          profile_path: 'F:\\ONE_AI\\firefox-profile'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to ensure Firefox');
      }

      const result = await response.json();
      console.log(`✅ Firefox ensured, command_id: ${result.command_id}`);
      onSuccess(`Opening ${config.name} in Firefox Developer Edition...`);
      
      const timeout = setTimeout(() => {
        console.log(`⏱️ Login timeout for ${platform}`);
        setOpeningLoginPlatform(null);
        onError(`Login timeout for ${config.name}. Please try again.`);
      }, 180000); // 3분
      
      loginTimeoutRef.current[platform] = timeout;
      
    } catch (error) {
      console.error(`❌ Failed to open login page: ${error}`);
      setOpeningLoginPlatform(null);
      onError(`Failed to open Firefox for ${config.name} login`);
    }
  };
  
  const toggleAllowedProvider = (platform: string) => {
    const newProviders = querySettings.allowed_providers.includes(platform)
      ? querySettings.allowed_providers.filter(p => p !== platform)
      : [...querySettings.allowed_providers, platform];
    
    updateQuerySettings({ allowed_providers: newProviders });
  };
  
  // ==================== Effects ====================
  
  // WebSocket을 통한 세션 업데이트 감지
  useEffect(() => {
    if (!openingLoginPlatform) return;
    
    const sessionInfo = systemState.sessions[openingLoginPlatform];
    
    console.log(`[Session Update] Platform: ${openingLoginPlatform}`, sessionInfo);
    
    if (!sessionInfo) return;
    
    if (sessionInfo.valid === true) {
      console.log(`✅ ${openingLoginPlatform} login detected!`);
      
      const timeout = loginTimeoutRef.current?.[openingLoginPlatform];
      if (timeout) {
        clearTimeout(timeout);
        delete loginTimeoutRef.current[openingLoginPlatform];
      }
      
      const platformName = PLATFORMS[openingLoginPlatform]?.name || openingLoginPlatform;
      onSuccess(`${platformName} login successful!`);
      setOpeningLoginPlatform(null);
    }
    else if (sessionInfo.valid === false) {
      const source = sessionInfo.source || sessionInfo.status;
      
      if (source === 'firefox_closed') {
        console.log(`❌ Firefox was closed while waiting for ${openingLoginPlatform} login`);
        
        const timeout = loginTimeoutRef.current?.[openingLoginPlatform];
        if (timeout) {
          clearTimeout(timeout);
          delete loginTimeoutRef.current[openingLoginPlatform];
        }
        
        onError(`Firefox was closed - please try logging in again`);
        setOpeningLoginPlatform(null);
      }
      else if (source === 'tab_closed') {
        console.log(`❌ ${openingLoginPlatform} tab was closed`);
        
        const timeout = loginTimeoutRef.current?.[openingLoginPlatform];
        if (timeout) {
          clearTimeout(timeout);
          delete loginTimeoutRef.current[openingLoginPlatform];
        }
        
        onError(`Login cancelled - tab was closed`);
        setOpeningLoginPlatform(null);
      }
    }
  }, [systemState.sessions, openingLoginPlatform, onSuccess, onError]);
  
  // Initial load
  useEffect(() => {
    if (isBackendConnected) {
      loadQueryActivities();
      loadAnalysisStatus();
      loadQuerySettings();
      loadQueryStats();
      checkAllSessions();
    }
  }, [isBackendConnected, loadQueryActivities, loadAnalysisStatus, loadQuerySettings, loadQueryStats]);
  
  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (isBackendConnected) {
        loadQueryActivities();
        loadAnalysisStatus();
        loadQueryStats();
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [isBackendConnected, loadQueryActivities, loadAnalysisStatus, loadQueryStats]);
  
  // Cleanup effect
  useEffect(() => {
    return () => {
      if (loginTimeoutRef.current) {
        Object.values(loginTimeoutRef.current).forEach(timeout => {
          clearTimeout(timeout);
        });
      }
    };
  }, []);
  
  // ==================== Helper Functions ====================
  
  const getSessionStatus = (platform: string) => {
    const session = systemState.sessions?.[platform];
    
    if (!session) {
      return { 
        valid: false, 
        status: 'unknown',
        expiresAt: undefined 
      };
    }
    
    if (session.source === 'firefox_closed' || session.status === 'firefox_closed') {
      return { 
        valid: false, 
        status: 'Firefox closed',
        expiresAt: undefined 
      };
    }
    
    if (session.expires_at) {
      try {
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
      } catch (e) {
        console.error('Invalid expires_at date:', session.expires_at);
      }
    }
    
    return { 
      valid: session.valid || false, 
      status: session.valid ? 'Active' : (session.status || 'Not logged in'),
      expiresAt: session.expires_at
    };
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'completed':
        return <Badge variant="default">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };
  
  const filteredActivities = showCompleted 
    ? queryActivities 
    : queryActivities.filter(activity => activity.status !== 'completed');
  
  // ==================== Render ====================
  
  return (
    <div className="space-y-4">
      {/* Connection Status Alert */}
      {!isBackendConnected && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Backend not connected. AI analysis and LLM queries will not work.
          </AlertDescription>
        </Alert>
      )}

      {/* Current Analysis Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Analysis Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analysisStatus.current_analysis ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-blue-900">
                    Active Analysis: {analysisStatus.current_analysis}
                  </h4>
                  <Badge variant="default">Running</Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{analysisStatus.analysis_progress}%</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${analysisStatus.analysis_progress}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Queries Sent:</span>
                      <span className="ml-2 font-medium">{analysisStatus.queries_sent}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Completed:</span>
                      <span className="ml-2 font-medium">{analysisStatus.queries_completed}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No active analysis</p>
                <p className="text-xs">AI will automatically send LLM queries during analysis</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* LLM Platforms */}
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
          <Alert className="bg-blue-50 border-blue-200">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Session Management:</strong> Click the refresh button to check session status. 
              Log in once and AI will use your session for queries.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            {Object.values(PLATFORMS).map((config) => {
              const { valid, status } = getSessionStatus(config.key);
              const isChecking = checkingSession === config.key;
              const isOpening = openingLoginPlatform === config.key;
              const isEnabled = querySettings.allowed_providers.includes(config.key);
              const stats = queryStats[config.key];
              
              return (
                <div 
                  key={config.key} 
                  className={`rounded-lg p-4 transition-all duration-300 ${
                    isChecking || isOpening
                      ? 'ring-2 ring-gray-400' 
                      : isEnabled
                      ? 'bg-gray-50'
                      : 'bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm text-white"
                        style={{ backgroundColor: isEnabled ? config.color : '#9CA3AF' }}
                      >
                        {config.icon}
                      </div>
                      <div>
                        <h4 className="font-medium">{config.name}</h4>
                        <p className="text-xs text-gray-500">{config.url}</p>
                        {stats && (
                          <p className="text-xs text-gray-400 mt-1">
                            Today: {stats.today || 0} | 
                            Yesterday: {stats.yesterday || 0} | 
                            Total: {stats.total || 0}
                          </p>
                        )}
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
                              {stats?.last_query && (
                                <span className="text-xs text-gray-400">
                                  • Last query: {formatDate(stats.last_query)}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!valid && isEnabled && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openLoginPage(config.key)}
                          disabled={isChecking || isOpening}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Login
                        </Button>
                      )}
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleAllowedProvider(config.key)}
                        disabled={!isBackendConnected}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Query Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Auto Query Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Auto Queries</Label>
              <p className="text-xs text-gray-500">Allow AI to automatically send LLM queries during analysis</p>
            </div>
            <Switch
              checked={querySettings.auto_query_enabled}
              onCheckedChange={(checked) => updateQuerySettings({ auto_query_enabled: checked })}
              disabled={!isBackendConnected}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Max Queries per Analysis</Label>
              <select
                className="w-full mt-1 p-2 border rounded-md text-sm"
                value={querySettings.max_queries_per_analysis}
                onChange={(e) => updateQuerySettings({ max_queries_per_analysis: parseInt(e.target.value) })}
                disabled={!isBackendConnected}
              >
                <option value="3">3 queries</option>
                <option value="5">5 queries</option>
                <option value="10">10 queries</option>
                <option value="20">20 queries</option>
              </select>
            </div>
            
            <div>
              <Label className="text-sm font-medium">Query Timeout (seconds)</Label>
              <select
                className="w-full mt-1 p-2 border rounded-md text-sm"
                value={querySettings.query_timeout}
                onChange={(e) => updateQuerySettings({ query_timeout: parseInt(e.target.value) })}
                disabled={!isBackendConnected}
              >
                <option value="15">15 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
                <option value="120">2 minutes</option>
              </select>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Show Firefox Window</Label>
              <p className="text-xs text-gray-500">Make Firefox visible when sending queries</p>
            </div>
            <Switch
              checked={querySettings.firefox_visible}
              onCheckedChange={(checked) => updateQuerySettings({ firefox_visible: checked })}
              disabled={!isBackendConnected}
            />
          </div>
        </CardContent>
      </Card>

      {/* Query Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              LLM Query Activities
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCompleted(!showCompleted)}
              >
                {showCompleted ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                {showCompleted ? 'Hide' : 'Show'} Completed
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={clearCompletedQueries}
                disabled={!isBackendConnected}
              >
                Clear Completed
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={loadQueryActivities}
                disabled={!isBackendConnected}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredActivities.length > 0 ? (
            <div className="space-y-3">
              {filteredActivities.map((activity) => (
                <div key={activity.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {getStatusIcon(activity.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {activity.analysis_phase}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {activity.provider}
                          </Badge>
                          {getStatusBadge(activity.status)}
                        </div>
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          {activity.query}
                        </p>
                        <div className="text-xs text-gray-500 space-y-1">
                          <div>Context: {activity.context}</div>
                          <div>Triggered by: {activity.triggered_by}</div>
                          <div className="flex items-center gap-4">
                            <span>{formatDate(activity.timestamp)}</span>
                            {activity.processing_time && (
                              <span>Processing: {activity.processing_time.toFixed(2)}s</span>
                            )}
                          </div>
                        </div>
                        {activity.response && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                            <strong>Response:</strong> {activity.response.substring(0, 200)}
                            {activity.response.length > 200 && '...'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No query activities</p>
              <p className="text-xs">
                {showCompleted ? 'No queries have been sent yet' : 'No pending queries'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Query Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {queryActivities.filter(q => q.status === 'pending').length}
              </div>
              <div className="text-xs text-gray-500">Pending</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {queryActivities.filter(q => q.status === 'completed').length}
              </div>
              <div className="text-xs text-gray-500">Completed</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {queryActivities.filter(q => q.status === 'failed').length}
              </div>
              <div className="text-xs text-gray-500">Failed</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}