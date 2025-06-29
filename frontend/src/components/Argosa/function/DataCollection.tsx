// frontend/src/components/Argosa/function/DataCollection.tsx 

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
  CheckCircle,
  Youtube
} from "lucide-react";

// 하위 탭 컴포넌트들
import WebCrawlerTab from "./collection/WebCrawlerTab";
import LLMQueryTab from "./collection/LLMQueryTab";
import LLMConversationTab from "./collection/LLMConversationTab";
import YouTubeTab from "./collection/YouTubeTab";

// ======================== Constants ========================
const API_BASE_URL = 'http://localhost:8000/api/argosa/data';
const WS_URL = 'ws://localhost:8000/api/argosa/data/ws/state';

// 임시: 검색 엔진 설정용 별도 API - 사용 안함, 대신 argosa 라우터 사용
// const SEARCH_API_BASE_URL = 'http://localhost:8000/api/simple';

const SEARCH_API_BASE_URL = 'http://localhost:8000/api/argosa/data';

// ======================== Type Definitions ========================

export interface SystemState {
  system_status: 'idle' | 'ready' | 'collecting' | 'error';
  sessions: Record<string, SessionInfo>;
  sync_status: SyncStatus | null;
  firefox_status: 'closed' | 'ready' | 'error';
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
    system_status: 'idle',
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
  const isSystemInitializing = systemState.system_status === 'idle' && (!isFirefoxReady || !isExtensionConnected);
  const isSystemReady = systemState.system_status === 'ready';
  const isSystemCollecting = systemState.system_status === 'collecting';
  
  // ==================== WebSocket Management ====================
  
  const connectWebSocket = useCallback(() => {
    // 중복 연결 방지
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected, skipping...');
      return;
    }
    
    // 기존 연결 종료
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
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
            const timestamp = new Date().toISOString();
            console.log(`[WebSocket ${timestamp}] State update received`);
            
            // Stack trace to see who's sending updates
            console.trace('[WebSocket] State update stack trace');
            
            setSystemState(prevState => {
              const stateChanged = 
                prevState.system_status !== message.data.system_status ||
                prevState.firefox_status !== message.data.firefox_status ||
                prevState.extension_status !== message.data.extension_status;
              
              if (stateChanged) {
                console.log(`[${timestamp}] 🔄 STATE CHANGE DETECTED:`, {
                  system: `${prevState.system_status} → ${message.data.system_status}`,
                  firefox: `${prevState.firefox_status} → ${message.data.firefox_status}`,
                  extension: `${prevState.extension_status} → ${message.data.extension_status}`
                });
              } else {
                console.log(`[${timestamp}] ✓ No state change (only metadata update)`);
              }
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
              
              // 중요한 상태 변경 체크 (extension_last_seen 제외)
              const hasImportantChange = 
                prevState.system_status !== message.data.system_status ||
                prevState.firefox_status !== message.data.firefox_status ||
                prevState.extension_status !== message.data.extension_status ||
                JSON.stringify(prevState.sessions) !== JSON.stringify(message.data.sessions);
              
              // 중요한 변경사항이 없으면 기존 상태 유지
              if (!hasImportantChange) {
                // extension_last_seen만 업데이트
                return {
                  ...prevState,
                  extension_last_seen: message.data.extension_last_seen
                };
              }
              
              // 백엔드에서 온 상태를 그대로 사용
              return message.data;
            });
          } else if (message.type === 'heartbeat') {
            // Respond to heartbeat with pong
            console.log('[WebSocket] Heartbeat received, sending pong');
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
          } else if (message.type === 'ping') {
            // Respond to ping with pong
            console.log('[WebSocket] Ping received, sending pong');
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setBackendError('WebSocket connection error');
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket disconnected', { code: event.code, reason: event.reason });
        wsRef.current = null;
        
        // Only reconnect if it wasn't a clean close
        if (event.code !== 1000) {
          // Reconnect after 30 seconds to reduce reconnection frequency
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('WebSocket reconnecting...');
            connectWebSocket();
          }, 30000); // Increased from 10s to 30s
        } else {
          console.log('WebSocket closed cleanly, not reconnecting');
        }
      };
      
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setBackendError('Cannot connect to backend server');
    }
  }, []);
  
  // ==================== API Functions ====================
  
  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/llm/conversations/stats/all`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, []);
  
  
  // ==================== Effects ====================
  
  // Initialize (removed duplicate WebSocket connection)
  // WebSocket connection is now handled in main initialization effect only
  
  // Auto-check and update system status - 제거됨
  // system_status는 백엔드에서 관리하므로 프론트엔드에서 계산하지 않음
  
  // Firefox 자동 실행 로직 비활성화 - 안정성을 위해
  useEffect(() => {
    const checkAndStartFirefox = async () => {
      // Firefox 자동 실행 비활성화 - 사용자가 수동으로 시작하도록 유도
      if (isBackendConnected && !isFirefoxReady && systemState.firefox_status === 'closed' && !hasCheckedFirefox.current) {
        console.log('Backend connected and Firefox not running - manual start required');
        hasCheckedFirefox.current = true; // 중복 체크 방지
        // checkFirefoxStatus 호출 제거 - 수동 시작만 허용
      }
    };
    
    checkAndStartFirefox();
  }, [isBackendConnected, isFirefoxReady, systemState.firefox_status]);
  
  // Firefox 상태가 변경되면 체크 플래그 리셋
  useEffect(() => {
    if (systemState.firefox_status === 'closed') {
      hasCheckedFirefox.current = false;
    }
  }, [systemState.firefox_status]);
  
  // Main initialization effect - Single WebSocket connection
  useEffect(() => {
    console.log('[DataCollection] Component mounted, initializing...');
    console.log('[DataCollection] API Base URL:', API_BASE_URL);
    
    // Connect WebSocket (ONLY ONCE) - This is the single source of truth for state
    connectWebSocket();
    
    // Load initial data
    loadStats();
    // WebSocket이 모든 상태를 제공하므로 별도 상태 체크 불필요
    
    // Set up periodic refresh - 통계만 갱신
    statsIntervalRef.current = setInterval(() => {
      loadStats();
    }, 30000); // 30초마다 통계 갱신
    
    return () => {
      console.log('[DataCollection] Component unmounting, cleaning up...');
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
  }, []); // Empty dependency array - only run once on mount
  
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
                  <div>• Firefox: {isFirefoxReady ? 'Ready' : 'Not running'}</div>
                  <div>• Extension: {isExtensionConnected ? 'Connected' : 'Waiting...'}</div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
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
              <TabsTrigger value="youtube" disabled={!isBackendConnected}>
                <Youtube className="h-4 w-4 mr-2" />
                YouTube
              </TabsTrigger>
            </TabsList>

            <TabsContent value="web">
              <WebCrawlerTab 
                isBackendConnected={isBackendConnected}
                onSuccess={setSuccessMessage}
                onError={setSessionCheckError}
                apiBaseUrl={SEARCH_API_BASE_URL}
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

            <TabsContent value="youtube">
              <YouTubeTab />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}