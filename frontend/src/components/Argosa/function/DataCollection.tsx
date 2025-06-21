/**
 * DataCollection.tsx - 메인 파일 (깜빡임 문제 수정)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { 
  Globe, 
  Bot, 
  MessageSquare,
  Wifi,
  WifiOff,
  Chrome,
  RefreshCw,
  AlertCircle,
  CheckCircle
} from "lucide-react";

// 하위 탭 컴포넌트들
import WebCrawlerTab from "./collection/WebCrawlerTab";
import LLMQueryTab from "./collection/LLMQueryTab";
import LLMConversationTab from "./collection/LLMConversationTab";

// ======================== Constants ========================
const API_BASE_URL = 'http://localhost:8000/api/argosa';
const WS_URL = 'ws://localhost:8000/api/argosa/data/ws/state';

// ======================== Type Definitions ========================

export interface SystemState {
  system_status: 'initializing' | 'ready' | 'collecting' | 'error';
  sessions: Record<string, SessionInfo>;
  sync_status: SyncStatus | null;
  firefox_status: 'closed' | 'opening' | 'ready' | 'error';
  extension_status: 'connected' | 'disconnected';
  extension_last_seen: string | null;
  schedule_enabled: boolean;
  data_sources_active: number;
  total_conversations: number;
}

export interface SessionInfo {
  platform: string;
  valid: boolean;
  last_checked: string;
  expires_at: string | null;
  source: 'cache' | 'extension' | 'firefox' | 'timeout' | 'tab_closed' | 'firefox_closed' | 'login_detection' | 'heartbeat' | 'manual' | 'error';
  status: string;
  error?: string;
  cookies?: any[];
}

export interface SyncStatus {
  sync_id: string;
  status: string;
  progress: number;
  current_platform?: string;
  collected: number;
  message: string;
}

// ======================== Helper Functions ========================

export const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
};

// ======================== Main Component ========================

export default function DataCollection() {
  // ==================== State Management ====================
  
  // System State
  const [systemState, setSystemState] = useState<SystemState>({
    system_status: 'initializing',
    sessions: {},
    sync_status: null,
    firefox_status: 'closed',
    extension_status: 'disconnected',
    extension_last_seen: null,
    schedule_enabled: false,
    data_sources_active: 0,
    total_conversations: 0
  });
  
  // UI State
  const [activeTab, setActiveTab] = useState("llm");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sessionCheckError, setSessionCheckError] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  
  // Statistics
  const [stats, setStats] = useState<any>(null);
  
  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCheckedFirefox = useRef(false); // Firefox 체크 여부 추적
  
  // ==================== Computed Values ====================
  
  const isBackendConnected = wsRef.current?.readyState === WebSocket.OPEN || 
    systemState.extension_status === 'connected' ||
    Object.keys(systemState.sessions).length > 0;
  
  // Helper variables for status checks
  const isFirefoxReady = systemState.firefox_status === 'ready';
  const isExtensionConnected = systemState.extension_status === 'connected';
  const isSystemInitializing = systemState.system_status === 'initializing';
  const isSystemReady = systemState.system_status === 'ready';
  const isSystemCollecting = systemState.system_status === 'collecting';
  
  // ==================== WebSocket Management ====================
  
  const connectWebSocket = useCallback(() => {
    console.log('Connecting to WebSocket...');
    
    try {
      const ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        wsRef.current = ws;
        setBackendError(null);
        
        // WebSocket 연결 성공 시 Firefox 체크 플래그 리셋
        hasCheckedFirefox.current = false;
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', message.type);
          
          if (message.type === 'state_update') {
            console.log('[WebSocket] State update:', message.data);
            setSystemState(prevState => {
              // collecting 상태일 때는 WebSocket에서 오는 status 변경 무시
              const isCurrentlyCollecting = prevState.system_status === 'collecting';
              if (isCurrentlyCollecting && 
                  message.data.system_status !== 'collecting' && 
                  message.data.system_status !== 'ready') {
                return {
                  ...message.data,
                  system_status: 'collecting' // collecting 상태 유지
                };
              }
              
              // 상태가 실제로 변경된 경우만 업데이트
              if (JSON.stringify(prevState) === JSON.stringify(message.data)) {
                return prevState;
              }
              
              return message.data;
            });
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setBackendError('WebSocket connection error');
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        wsRef.current = null;
        
        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };
      
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setBackendError('Cannot connect to backend server');
    }
  }, []);
  
  // ==================== API Functions ====================
  
  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/data/llm/conversations/stats/all`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, []);
  
  const loadSystemStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/data/status`);
      if (response.ok) {
        const data = await response.json();
        // Update state with backend status
        if (data.state) {
          setSystemState(prevState => {
            // 상태가 실제로 변경된 경우만 업데이트
            if (JSON.stringify(prevState) === JSON.stringify(data.state)) {
              return prevState;
            }
            return data.state;
          });
        }
      }
    } catch (error) {
      console.error('Failed to load system status:', error);
    }
  }, []);
  
  const checkFirefoxStatus = useCallback(async () => {
    try {
      console.log('Checking Firefox status...');
      const response = await fetch(`${API_BASE_URL}/data/check_firefox_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Firefox status checked:', data);
      }
    } catch (error) {
      console.error('Failed to check Firefox status:', error);
    }
  }, []);
  
  // ==================== Effects ====================
  
  // Auto-check and update system status - 더 유연한 조건
  useEffect(() => {
    const checkSystemReady = () => {
      // Backend만 연결되어도 기본 기능은 사용 가능
      const isFullyReady = isBackendConnected && isFirefoxReady && isExtensionConnected;
      
      const isPartiallyReady = isBackendConnected;
      
      let newStatus: typeof systemState.system_status;
      
      if (isFullyReady) {
        newStatus = 'ready';
      } else if (isPartiallyReady) {
        newStatus = 'ready'; // Backend만 연결되어도 ready로 처리
      } else {
        newStatus = 'initializing';
      }
      
      // 상태가 실제로 변경될 때만 업데이트
      setSystemState(prev => {
        // collecting 상태면 변경하지 않음
        if (prev.system_status === 'collecting') {
          return prev;
        }
        
        // 이미 같은 상태면 업데이트하지 않음
        if (prev.system_status === newStatus) {
          return prev;
        }
        
        console.log(`System status changing from ${prev.system_status} to ${newStatus}`);
        return {
          ...prev,
          system_status: newStatus
        };
      });
    };
    
    checkSystemReady();
  }, [isBackendConnected, isFirefoxReady, isExtensionConnected]); // 헬퍼 변수 사용
  
  // Firefox 자동 실행 로직
  useEffect(() => {
    const checkAndStartFirefox = async () => {
      // Backend가 연결되고, Firefox가 실행되지 않았고, 아직 체크하지 않았다면
      if (isBackendConnected && !isFirefoxReady && systemState.firefox_status === 'closed' && !hasCheckedFirefox.current) {
        console.log('Backend connected and Firefox not running, starting Firefox...');
        hasCheckedFirefox.current = true; // 중복 실행 방지
        await checkFirefoxStatus();
      }
    };
    
    checkAndStartFirefox();
  }, [isBackendConnected, isFirefoxReady, systemState.firefox_status, checkFirefoxStatus]);
  
  // Firefox 상태가 변경되면 체크 플래그 리셋
  useEffect(() => {
    if (systemState.firefox_status === 'closed') {
      hasCheckedFirefox.current = false;
    }
  }, [systemState.firefox_status]);
  
  // Main initialization effect
  useEffect(() => {
    // Connect WebSocket
    connectWebSocket();
    
    // Load initial data
    loadStats();
    loadSystemStatus();
    
    // Set up periodic refresh
    statsIntervalRef.current = setInterval(() => {
      loadStats();
    }, 30000); // 30초마다 통계 갱신
    
    return () => {
      // Cleanup
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [connectWebSocket, loadStats, loadSystemStatus]);
  
  // Auto-clear messages
  useEffect(() => {
    if (sessionCheckError) {
      const timer = setTimeout(() => setSessionCheckError(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [sessionCheckError]);
  
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);
  
  // ==================== Render ====================
  
  return (
    <div className="h-full w-full flex flex-col text-gray-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Data Collection Hub</h1>
            <p className="text-sm text-gray-600">Collect and analyze data from multiple sources</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Status Indicators */}
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-lg border border-slate-200">
              {/* Backend Status */}
              <div className="flex items-center gap-2">
                {isBackendConnected ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-blue-500 rounded-full shadow-sm shadow-blue-500/50"></div>
                    <span className="text-xs font-medium text-gray-700">Backend</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
                    <span className="text-xs font-medium text-slate-400">Backend</span>
                  </div>
                )}
              </div>
              
              <div className="w-px h-4 bg-slate-200"></div>
              
              {/* Firefox Status */}
              <div className="flex items-center gap-2">
                {isFirefoxReady ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-blue-500 rounded-full shadow-sm shadow-blue-500/50"></div>
                    <span className="text-xs font-medium text-gray-700">Firefox</span>
                  </div>
                ) : systemState.firefox_status === 'opening' ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-sm shadow-amber-500/50"></div>
                    <span className="text-xs font-medium text-gray-700">Firefox</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
                    <span className="text-xs font-medium text-slate-400">Firefox</span>
                  </div>
                )}
              </div>
              
              <div className="w-px h-4 bg-slate-200"></div>
              
              {/* Extension Status */}
              <div className="flex items-center gap-2">
                {isExtensionConnected ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-blue-500 rounded-full shadow-sm shadow-blue-500/50"></div>
                    <span className="text-xs font-medium text-gray-700">Extension</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
                    <span className="text-xs font-medium text-slate-400">Extension</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* System Status Badge - Only show when not ready or collecting */}
            {(isSystemCollecting || !isSystemReady) && (
              <Badge variant={
                isSystemCollecting ? "default" : 
                isSystemInitializing ? "secondary" : 
                "destructive"
              } className={isSystemCollecting ? "bg-blue-500 hover:bg-blue-600" : ""}>
                {isSystemCollecting ? "Collecting..." : 
                 isSystemInitializing ? "Starting..." : 
                 systemState.system_status}
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1600px] mx-auto">
          {/* Backend Error Alert */}
          {backendError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Backend Connection Error:</strong> {backendError}
                <br />
                <span className="text-sm">
                  Run backend server: <code className="bg-red-100 px-1 rounded">python main.py</code>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-2"
                  onClick={() => {
                    setBackendError(null);
                    connectWebSocket();
                  }}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Success Message */}
          {successMessage && (
            <Alert className="mb-6 border-blue-200 bg-blue-50">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Session Check Error */}
          {sessionCheckError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{sessionCheckError}</AlertDescription>
            </Alert>
          )}

          {/* System Initializing Alert - Optional */}
          {isSystemInitializing && !isBackendConnected && (
            <Alert className="mb-6 border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>System Initializing:</strong> Connecting to backend...
                <div className="mt-2 text-sm">
                  <div>• Backend: {isBackendConnected ? 'Connected' : 'Connecting...'}</div>
                  <div>• Firefox: {isFirefoxReady ? 'Ready' : systemState.firefox_status === 'opening' ? 'Opening...' : 'Not running'}</div>
                  <div>• Extension: {isExtensionConnected ? 'Connected' : 'Waiting...'}</div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="web" disabled={!isBackendConnected}>
                <Globe className="h-4 w-4 mr-2" />
                Web Crawler
              </TabsTrigger>
              <TabsTrigger value="llm" className="relative" disabled={!isBackendConnected}>
                <Bot className="h-4 w-4 mr-2" />
                LLM Conversations
                {isSystemCollecting && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="llm-query" disabled={!isBackendConnected}>
                <MessageSquare className="h-4 w-4 mr-2" />
                LLM Query
              </TabsTrigger>
            </TabsList>

            <TabsContent value="web">
              <WebCrawlerTab 
                isBackendConnected={isBackendConnected}
                systemState={systemState}
                onSuccess={setSuccessMessage}
                onError={setSessionCheckError}
                apiBaseUrl={API_BASE_URL}
              />
            </TabsContent>

            <TabsContent value="llm">
              <LLMConversationTab
                systemState={systemState}
                setSystemState={setSystemState}
                isBackendConnected={isBackendConnected}
                stats={stats}
                loadStats={loadStats}
                onSuccess={setSuccessMessage}
                onError={setSessionCheckError}
                apiBaseUrl={API_BASE_URL}
                wsRef={wsRef}
              />
            </TabsContent>

            <TabsContent value="llm-query">
              <LLMQueryTab
                isBackendConnected={isBackendConnected}
                systemState={systemState}
                stats={stats}
                onSuccess={setSuccessMessage}
                onError={setSessionCheckError}
                apiBaseUrl={API_BASE_URL}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}