/**
 * DataCollection.tsx - 메인 파일 (전체 코드)
 * 
 * WebSocket ping/pong 제거 버전
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
  system_status: 'idle' | 'preparing' | 'collecting' | 'error';
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
  
  // ==================== WebSocket Management ====================
  
  const connectWebSocket = useCallback(() => {
    console.log('Connecting to WebSocket...');
    
    try {
      const ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        wsRef.current = ws;
        setBackendError(null);
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', message.type);
          
          if (message.type === 'state_update') {
            console.log('[WebSocket] State update:', message.data);
            setSystemState(message.data);
          }
          // ping/pong 제거됨
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
          setSystemState(data.state);
        }
      }
    } catch (error) {
      console.error('Failed to load system status:', error);
    }
  }, []);
  
  // ==================== Effects ====================
  
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
  
  // ==================== Computed Values ====================
  
  const isBackendConnected = wsRef.current?.readyState === WebSocket.OPEN || 
    systemState.extension_status === 'connected' ||
    Object.keys(systemState.sessions).length > 0;
  
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
          <div className="flex items-center gap-2">
            {/* Backend Status */}
            <div className="flex items-center gap-2 text-sm">
              {isBackendConnected ? (
                <>
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-gray-600">Backend</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <span className="text-gray-600">Backend</span>
                </>
              )}
            </div>
            
            {/* Extension Status */}
            <div className="flex items-center gap-2 text-sm">
              {systemState.extension_status === 'connected' ? (
                <>
                  <Chrome className="h-4 w-4 text-green-500" />
                  <span className="text-gray-600">Extension</span>
                  {systemState.extension_last_seen && (
                    <span className="text-xs text-gray-400">
                      ({formatDate(systemState.extension_last_seen)})
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Chrome className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-400">Extension</span>
                </>
              )}
            </div>
            
            {/* System Status */}
            <Badge variant={systemState.system_status === 'collecting' ? "default" : "secondary"}>
              {systemState.system_status}
            </Badge>
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
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
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

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="web" disabled={systemState.system_status !== 'idle'}>
                <Globe className="h-4 w-4 mr-2" />
                Web Crawler
              </TabsTrigger>
              <TabsTrigger value="llm" className="relative">
                <Bot className="h-4 w-4 mr-2" />
                LLM Conversations
                {systemState.system_status === 'collecting' && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="llm-query" disabled={systemState.system_status !== 'idle'}>
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