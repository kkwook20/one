// frontend/src/components/Argosa/function/DataCollection.tsx
// 통합 버전 - WebSocket 실시간 업데이트 + 자동 세션 관리 + 모든 기능 포함

import { useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { 
  Globe, 
  Bot, 
  Database, 
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  FolderOpen,
  MessageSquare,
  TrendingUp,
  X,
  Save,
  ChevronDown,
  Trash2,
  File,
  Timer,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
  Eye,
  EyeOff,
  Chrome,
  Activity,
  Search
} from "lucide-react";

// API Configuration
const API_BASE_URL = 'http://localhost:8000/api/argosa';
const WS_URL = 'ws://localhost:8000/api/argosa/ws/state';

// Type definitions
interface SystemState {
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

interface SessionInfo {
  platform: string;
  valid: boolean;
  last_checked: string;
  expires_at: string | null;
  source: 'cache' | 'extension' | 'firefox' | 'timeout';
  status: string;
}

interface SyncStatus {
  sync_id: string;
  status: string;
  progress: number;
  current_platform?: string;
  collected: number;
  message: string;
}

interface SectionProps {
  title: string;
  children: ReactNode;
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

interface DailyStats {
  today: number;
  yesterday: number;
  dayBefore: number;
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

interface FileListItem {
  platform: string;
  files: string[];
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

interface ApiQuota {
  [api: string]: {
    used: number;
    limit: number;
    remaining: number;
    percentage_used: number;
  };
}

interface SiteStats {
  [domain: string]: {
    success_rate: number;
    avg_relevance: number;
    visits: number;
    requires_login: boolean;
    valuable_paths: string[];
  };
}

interface SearchResults {
  query: string;
  results: Record<string, any>;
  quality_score: number;
  improved_query?: string;
  metadata?: {
    search_id: string;
    iterations: number;
    apis_used: string[];
    sites_crawled: string[];
    timestamp: string;
  };
}

// Platform configurations
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

// Helper functions
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

const formatDate = (dateString: string | null | undefined) => {
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

export default function DataCollection() {
  // State
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
  
  const [stats, setStats] = useState<any>(null);
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
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [filesList, setFilesList] = useState<FileListItem[]>([]);
  const [checkingSession, setCheckingSession] = useState<string | null>(null);
  const [openingLoginPlatform, setOpeningLoginPlatform] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sessionCheckError, setSessionCheckError] = useState<string | null>(null);
  const [scheduleFailure, setScheduleFailure] = useState<ScheduleFailure | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  
  // Web Crawler states
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [searchObjective, setSearchObjective] = useState('');
  const [searchSources, setSearchSources] = useState({
    apis: true,
    websites: false,
    focused: false,
    ai_enhanced: true
  });
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [apiQuota, setApiQuota] = useState<ApiQuota>({});
  const [siteStats, setSiteStats] = useState<SiteStats>({});
  
  // LLM Query states
  const [llmQuery, setLlmQuery] = useState('');
  const [queryType, setQueryType] = useState('question');
  const [llmProvider, setLlmProvider] = useState('lm_studio');
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [isQuerying, setIsQuerying] = useState(false);
  const [llmResponse, setLlmResponse] = useState<any>(null);
  const [analysisType, setAnalysisType] = useState('pattern');
  const [analysisQuestions, setAnalysisQuestions] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [providerStats, setProviderStats] = useState<any>({});
  const [queryHistory, setQueryHistory] = useState<any[]>([]);
  
  // WebSocket and timer refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionAutoCheckRef = useRef<NodeJS.Timeout | null>(null);
  const loginCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // ======================== WebSocket Connection ========================
  
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
          if (message.type === 'state_update') {
            setSystemState(message.data);
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
  
  // ======================== API Calls ========================
  
  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/llm/conversations/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, []);
  
  const loadScheduleFailure = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/llm/schedule/last-failure`);
      if (response.ok) {
        const data = await response.json();
        if (data.failure) {
          setScheduleFailure(data);
        } else {
          setScheduleFailure(null);
        }
      }
    } catch (error) {
      console.error('Failed to load schedule failure:', error);
    }
  }, []);
  
  const checkSessionManual = async (platform: string) => {
    setCheckingSession(platform);
    
    try {
      const response = await fetch(`${API_BASE_URL}/sessions/check-immediate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          platform, 
          force_fresh: true 
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Update local state immediately
        setSystemState(prev => ({
          ...prev,
          sessions: {
            ...prev.sessions,
            [platform]: result
          }
        }));
        
        return result.valid;
      }
      
      return false;
      
    } catch (error) {
      console.error('Session check error:', error);
      setSessionCheckError(`Failed to check session for ${PLATFORMS[platform]?.name}`);
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
      .map(p => ({ platform: p.key, enabled: true }));
    
    if (enabledPlatforms.length === 0) {
      setSuccessMessage('Please enable at least one platform');
      setTimeout(() => setSuccessMessage(null), 3000);
      return;
    }
    
    // Check sessions before sync
    const invalidSessions = [];
    for (const { platform } of enabledPlatforms) {
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
      const response = await fetch(`${API_BASE_URL}/llm/firefox/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: enabledPlatforms,
          settings: {
            ...syncSettings,
            debug: syncSettings.firefoxVisible
          }
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        
        if (error.invalidSessions?.length > 0) {
          const platformNames = error.invalidSessions.map((p: string) => 
            PLATFORMS[p]?.name || p
          ).join(', ');
          
          setSessionCheckError(`Invalid sessions for: ${platformNames}. Please log in and try again.`);
          
          // Update session states
          setSystemState(prev => {
            const updatedSessions = { ...prev.sessions };
            error.invalidSessions.forEach((platform: string) => {
              if (updatedSessions[platform]) {
                updatedSessions[platform].valid = false;
              }
            });
            return { ...prev, sessions: updatedSessions };
          });
          
          // Offer to open login
          if (window.confirm(`${platformNames} requires login.\n\nWould you like to open the login page?`)) {
            openLoginPage(error.invalidSessions[0]);
          }
        } else if (error.reason === 'smart_scheduling') {
          setSuccessMessage('Sync skipped: Data is already up to date');
          setTimeout(() => setSuccessMessage(null), 5000);
        } else {
          throw new Error(error.detail || error.error || 'Sync failed');
        }
        
        return;
      }
      
      const result = await response.json();
      console.log('Sync started:', result);
      
      // Clear any schedule failure
      setScheduleFailure(null);
      
    } catch (error: any) {
      console.error('Failed to start sync:', error);
      setSessionCheckError(`Error: ${error.message}`);
      setTimeout(() => setSessionCheckError(null), 5000);
    }
  };
  
  const cancelSync = async () => {
    if (!systemState.sync_status?.sync_id) return;
    
    try {
      await fetch(`${API_BASE_URL}/llm/sync/cancel/${systemState.sync_status.sync_id}`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('Failed to cancel sync:', error);
    }
  };
  
  const openLoginPage = async (platform: string) => {
    const config = PLATFORMS[platform];
    if (!config || openingLoginPlatform) return;
    
    console.log(`🔐 Opening login for ${platform}`);
    setOpeningLoginPlatform(platform);
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/sessions/open-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platform,
          url: config.url,
          profileName: 'llm-collector'
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Opening ${config.name} login page`);
        
        // Start checking for successful login
        let checkCount = 0;
        const maxChecks = 60; // 5 minutes
        
        loginCheckIntervalRef.current = setInterval(async () => {
          checkCount++;
          
          const isValid = await checkSessionManual(platform);
          
          if (isValid) {
            console.log(`✅ ${platform} login detected!`);
            
            setOpeningLoginPlatform(null);
            if (loginCheckIntervalRef.current) {
              clearInterval(loginCheckIntervalRef.current);
              loginCheckIntervalRef.current = null;
            }
            
            setSuccessMessage(`${config.name} login successful!`);
            setTimeout(() => setSuccessMessage(null), 5000);
          }
          
          if (checkCount >= maxChecks) {
            console.log(`⏱️ Login monitoring timeout for ${platform}`);
            setOpeningLoginPlatform(null);
            if (loginCheckIntervalRef.current) {
              clearInterval(loginCheckIntervalRef.current);
              loginCheckIntervalRef.current = null;
            }
          }
        }, 5000);
        
      } else {
        console.error(`❌ Failed to open ${config.name} login page`);
        setOpeningLoginPlatform(null);
      }
    } catch (error) {
      console.error(`❌ Failed to open login page: ${error}`);
      setOpeningLoginPlatform(null);
    }
  };
  
  const cleanData = async () => {
    if (!window.confirm(
      'Delete all collected data?\n\n' +
      'This will permanently remove all conversation files.\n' +
      'This action cannot be undone!'
    )) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/conversations/clean?days=0`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const result = await response.json();
        
        setSuccessMessage(`Deleted ${result.deleted} files.`);
        setTimeout(() => setSuccessMessage(null), 5000);
        
        // Reload stats
        await loadStats();
      }
    } catch (error) {
      console.error('Failed to clean data');
    }
  };
  
  const viewFiles = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/llm/conversations/files`);
      
      if (response.ok) {
        const data = await response.json();
        setFilesList(data.files || []);
        setShowFilesModal(true);
      }
    } catch (error) {
      console.error('Failed to load files');
    }
  };
  
  // ======================== Web Crawler Functions ========================
  
  const executeWebSearch = async () => {
    if (!webSearchQuery.trim() || isSearching) return;
    
    setIsSearching(true);
    setSearchResults(null);
    
    try {
      // Prepare search sources
      const sources = [];
      if (searchSources.apis) sources.push('apis');
      if (searchSources.websites) sources.push('websites');
      if (searchSources.focused) sources.push('focused');
      
      const context: any = {
        objective: searchObjective,
        ai_enhanced: searchSources.ai_enhanced
      };
      
      // Add Firefox profile path if available
      if (systemState.firefox_status === 'ready') {
        context.firefox_profile_path = '/path/to/firefox/profile'; // This should come from backend
      }
      
      const response = await fetch(`${API_BASE_URL}/crawler/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: webSearchQuery,
          context: context
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        setSearchResults(result);
        
        // Show success message if quality is good
        if (result.quality_score >= 0.7) {
          setSuccessMessage(`Search completed with ${(result.quality_score * 100).toFixed(0)}% quality`);
          setTimeout(() => setSuccessMessage(null), 5000);
        }
      } else {
        const error = await response.json();
        throw new Error(error.detail || 'Search failed');
      }
      
    } catch (error: any) {
      console.error('Search error:', error);
      setSessionCheckError(`Search failed: ${error.message}`);
      setTimeout(() => setSessionCheckError(null), 5000);
    } finally {
      setIsSearching(false);
    }
  };
  
  const loadApiQuota = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/crawler/quota`);
      
      if (response.ok) {
        const data = await response.json();
        setApiQuota(data);
      }
    } catch (error) {
      console.error('Failed to load API quota:', error);
    }
  };
  
  const loadSiteStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/crawler/sites/stats`);
      
      if (response.ok) {
        const data = await response.json();
        setSiteStats(data);
      }
    } catch (error) {
      console.error('Failed to load site stats:', error);
    }
  };
  
  // ======================== LLM Query Functions ========================
  
  const executeLLMQuery = async () => {
    if (!llmQuery.trim() || isQuerying) return;
    
    setIsQuerying(true);
    setLlmResponse(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/query/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: llmQuery,
          query_type: queryType,
          provider: llmProvider,
          temperature: temperature,
          max_tokens: maxTokens
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        setLlmResponse(result);
        
        // Reload provider stats
        await loadProviderStats();
      } else {
        const error = await response.json();
        throw new Error(error.detail || 'Query failed');
      }
      
    } catch (error: any) {
      console.error('LLM query error:', error);
      setSessionCheckError(`Query failed: ${error.message}`);
      setTimeout(() => setSessionCheckError(null), 5000);
    } finally {
      setIsQuerying(false);
    }
  };
  
  const analyzeConversations = async () => {
    setIsAnalyzing(true);
    setAnalysisResults(null);
    
    try {
      // Get all conversations from stats
      const conversationsResponse = await fetch(`${API_BASE_URL}/llm/conversations/stats`);
      if (!conversationsResponse.ok) throw new Error('Failed to load conversations');
      
      const statsData = await conversationsResponse.json();
      
      // Prepare questions
      const questions = analysisQuestions.split('\n').filter(q => q.trim());
      
      const response = await fetch(`${API_BASE_URL}/llm/query/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: statsData,
          analysis_type: analysisType,
          questions: questions,
          output_format: 'structured',
          provider: llmProvider
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        setAnalysisResults(result);
      } else {
        throw new Error('Analysis failed');
      }
      
    } catch (error: any) {
      console.error('Analysis error:', error);
      setSessionCheckError(`Analysis failed: ${error.message}`);
      setTimeout(() => setSessionCheckError(null), 5000);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const comparePlatforms = async () => {
    setIsAnalyzing(true);
    setAnalysisResults(null);
    
    try {
      // Get platform data
      const platformData: any = {};
      
      for (const platform of Object.keys(platformConfigs)) {
        const response = await fetch(`${API_BASE_URL}/llm/conversations/files`);
        if (response.ok) {
          const data = await response.json();
          const platformFiles = data.files.find((f: any) => f.platform === platform);
          if (platformFiles) {
            platformData[platform] = platformFiles.files || [];
          }
        }
      }
      
      const response = await fetch(`${API_BASE_URL}/llm/query/compare/platforms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(platformData)
      });
      
      if (response.ok) {
        const result = await response.json();
        setAnalysisResults(result);
      } else {
        throw new Error('Comparison failed');
      }
      
    } catch (error: any) {
      console.error('Comparison error:', error);
      setSessionCheckError(`Comparison failed: ${error.message}`);
      setTimeout(() => setSessionCheckError(null), 5000);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const loadProviderStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/llm/query/stats/providers`);
      
      if (response.ok) {
        const data = await response.json();
        setProviderStats(data);
      }
    } catch (error) {
      console.error('Failed to load provider stats:', error);
    }
  };
  
  const loadQueryHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/llm/query/history?limit=20`);
      
      if (response.ok) {
        const data = await response.json();
        setQueryHistory(data);
      }
    } catch (error) {
      console.error('Failed to load query history:', error);
    }
  };
  
  // ======================== Platform Management ========================
  
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
  
  // ======================== Effects ========================
  
  // Initialize
  useEffect(() => {
    // Connect WebSocket
    connectWebSocket();
    
    // Load initial data
    loadStats();
    loadScheduleFailure();
    loadApiQuota();
    loadSiteStats();
    loadProviderStats();
    loadQueryHistory();
    
    // Check all sessions on mount
    checkAllSessions();
    
    // Set up periodic refresh
    statsIntervalRef.current = setInterval(() => {
      loadStats();
      loadScheduleFailure();
    }, 30000);
    
    // Set up automatic session checking (every 30 seconds)
    sessionAutoCheckRef.current = setInterval(() => {
      checkAllSessions();
    }, 30000);
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (sessionAutoCheckRef.current) {
        clearInterval(sessionAutoCheckRef.current);
      }
      if (loginCheckIntervalRef.current) {
        clearInterval(loginCheckIntervalRef.current);
      }
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [connectWebSocket, loadStats, loadScheduleFailure]);
  
  // Save sync settings when changed
  useEffect(() => {
    localStorage.setItem('syncSettings', JSON.stringify(syncSettings));
  }, [syncSettings]);
  
  // Auto-clear messages
  useEffect(() => {
    if (sessionCheckError) {
      const timer = setTimeout(() => setSessionCheckError(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [sessionCheckError]);
  
  // ======================== Helper Functions ========================
  
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
  
  const isBackendConnected = wsRef.current?.readyState === WebSocket.OPEN || 
    systemState.extension_status === 'connected' ||
    Object.keys(systemState.sessions).length > 0;
  
  const canSync = isBackendConnected && 
    systemState.system_status === 'idle' &&
    Object.values(platformConfigs).some(p => p.enabled);
    
  const getDailyStats = () => {
    if (!stats?.daily_stats) return { today: 0, yesterday: 0, dayBefore: 0 };
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const dayBefore = new Date(Date.now() - 172800000).toISOString().split('T')[0];
    
    let totals = { today: 0, yesterday: 0, dayBefore: 0 };
    
    Object.entries(stats.daily_stats).forEach(([platform, platformStats]: [string, any]) => {
      totals.today += platformStats[today] || 0;
      totals.yesterday += platformStats[yesterday] || 0;
      totals.dayBefore += platformStats[dayBefore] || 0;
      
      // Update platform counts
      if (platformConfigs[platform]) {
        platformConfigs[platform].todayCount = platformStats[today] || 0;
        platformConfigs[platform].yesterdayCount = platformStats[yesterday] || 0;
        platformConfigs[platform].dayBeforeCount = platformStats[dayBefore] || 0;
      }
    });
    
    return totals;
  };
  
  const dailyStats = getDailyStats();

  return (
    <div className="h-full w-full flex flex-col text-gray-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">LLM Conversation Collector</h1>
            <p className="text-sm text-gray-600">Collect and analyze your AI conversations</p>
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
          {/* Backend Error */}
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

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Panel */}
            <div className="lg:col-span-2 space-y-6">
              <Section title="Data Sources">
                <Tabs defaultValue="llm" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="web" disabled={systemState.system_status !== 'idle'}>
                      <Globe className="h-4 w-4 mr-2" />
                      Web Crawler
                    </TabsTrigger>
                    <TabsTrigger value="llm" className="relative">
                      <Bot className="h-4 w-4 mr-2" />
                      LLM Models
                      {systemState.system_status === 'collecting' && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="llm" className="relative">
                      <Bot className="h-4 w-4 mr-2" />
                      LLM Models
                      {systemState.system_status === 'collecting' && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="llm-query" className="space-y-4">
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
                                        {stats?.latest_sync?.[config.key] && (
                                          <span className="text-xs text-gray-400">
                                            • Last: {formatDate(stats.latest_sync[config.key])}
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
                            onClick={systemState.system_status === 'collecting' ? cancelSync : startSync}
                            disabled={!canSync || checkingSession !== null}
                            variant={systemState.system_status === 'collecting' ? "destructive" : "default"}
                          >
                            {systemState.system_status === 'collecting' ? (
                              <>
                                <X className="h-4 w-4 mr-2" />
                                Cancel Sync
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Sync All Enabled
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
                  </TabsContent>

                  <TabsContent value="web" className="space-y-4">
                    {/* Search Interface */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Web Search & Crawling</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3">
                          <div>
                            <Label>Search Query</Label>
                            <div className="flex gap-2 mt-1">
                              <Input
                                placeholder="Enter your search query..."
                                value={webSearchQuery}
                                onChange={(e) => setWebSearchQuery(e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter' && webSearchQuery.trim()) {
                                    executeWebSearch();
                                  }
                                }}
                                disabled={isSearching}
                              />
                              <Button
                                onClick={executeWebSearch}
                                disabled={!webSearchQuery.trim() || isSearching}
                              >
                                {isSearching ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Searching...
                                  </>
                                ) : (
                                  <>
                                    <Search className="h-4 w-4 mr-2" />
                                    Search
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>

                          <div>
                            <Label>Search Objective (Optional)</Label>
                            <Input
                              placeholder="What are you looking for specifically?"
                              value={searchObjective}
                              onChange={(e) => setSearchObjective(e.target.value)}
                              disabled={isSearching}
                              className="mt-1"
                            />
                          </div>

                          <div>
                            <Label>Search Sources</Label>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={searchSources.apis}
                                  onChange={(e) => setSearchSources(prev => ({ ...prev, apis: e.target.checked }))}
                                  disabled={isSearching}
                                  className="rounded"
                                />
                                <span className="text-sm">APIs (Google, News)</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={searchSources.websites}
                                  onChange={(e) => setSearchSources(prev => ({ ...prev, websites: e.target.checked }))}
                                  disabled={isSearching}
                                  className="rounded"
                                />
                                <span className="text-sm">Direct Website Crawl</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={searchSources.focused}
                                  onChange={(e) => setSearchSources(prev => ({ ...prev, focused: e.target.checked }))}
                                  disabled={isSearching}
                                  className="rounded"
                                />
                                <span className="text-sm">Focused Sites</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={searchSources.ai_enhanced}
                                  onChange={(e) => setSearchSources(prev => ({ ...prev, ai_enhanced: e.target.checked }))}
                                  disabled={isSearching}
                                  className="rounded"
                                />
                                <span className="text-sm">AI Enhancement</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* API Quota Status */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>API Quota Status</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={loadApiQuota}
                            disabled={!isBackendConnected}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {Object.entries(apiQuota).map(([api, quota]) => (
                            <div key={api} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-medium capitalize">{api}</span>
                                <span className="text-xs text-gray-500">
                                  {quota.used} / {quota.limit} used
                                </span>
                              </div>
                              <Progress value={quota.percentage_used} className="h-2" />
                              <p className="text-xs text-gray-500">
                                {quota.remaining} requests remaining
                              </p>
                            </div>
                          ))}
                          {Object.keys(apiQuota).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4">
                              No API quota data available
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Search Results */}
                    {searchResults && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between">
                            <span>Search Results</span>
                            <Badge variant={searchResults.quality_score >= 0.7 ? "default" : "secondary"}>
                              Quality: {(searchResults.quality_score * 100).toFixed(0)}%
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {/* Improved Query Suggestion */}
                            {searchResults.improved_query && searchResults.improved_query !== webSearchQuery && (
                              <Alert className="bg-blue-50 border-blue-200">
                                <AlertCircle className="h-4 w-4 text-blue-600" />
                                <AlertDescription className="text-blue-800">
                                  <strong>Suggested improved query:</strong> "{searchResults.improved_query}"
                                  <Button
                                    size="sm"
                                    variant="link"
                                    className="ml-2 p-0 h-auto"
                                    onClick={() => {
                                      setWebSearchQuery(searchResults.improved_query);
                                      executeWebSearch();
                                    }}
                                  >
                                    Try it
                                  </Button>
                                </AlertDescription>
                              </Alert>
                            )}

                            {/* Results by Source */}
                            {Object.entries(searchResults.results).map(([source, data]: [string, any]) => (
                              <div key={source} className="border rounded-lg p-4">
                                <h4 className="font-medium mb-2 flex items-center gap-2">
                                  <Globe className="h-4 w-4 text-gray-500" />
                                  {source}
                                  {data.error && (
                                    <Badge variant="destructive" className="ml-auto">Error</Badge>
                                  )}
                                </h4>
                                
                                {data.error ? (
                                  <p className="text-sm text-red-600">{data.error}</p>
                                ) : (
                                  <div className="space-y-2">
                                    {data.analysis && (
                                      <div className="text-sm space-y-1">
                                        {Object.entries(data.analysis).map(([key, value]) => (
                                          <div key={key}>
                                            <span className="font-medium">{key}: </span>
                                            <span className="text-gray-600">
                                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {data.results && Array.isArray(data.results) && (
                                      <div className="mt-2 space-y-2">
                                        {data.results.slice(0, 3).map((result: any, idx: number) => (
                                          <div key={idx} className="p-2 bg-gray-50 rounded text-sm">
                                            <a 
                                              href={result.link || result.url} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:underline font-medium"
                                            >
                                              {result.title}
                                            </a>
                                            <p className="text-gray-600 text-xs mt-1">
                                              {result.snippet || result.description}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Metadata */}
                            <div className="text-xs text-gray-500 pt-2 border-t">
                              <div className="flex flex-wrap gap-4">
                                <span>Search ID: {searchResults.metadata?.search_id}</span>
                                <span>Iterations: {searchResults.metadata?.iterations}</span>
                                <span>APIs used: {searchResults.metadata?.apis_used?.join(', ')}</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Site Statistics */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>Site Statistics</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={loadSiteStats}
                            disabled={!isBackendConnected}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {Object.entries(siteStats).map(([domain, stats]) => (
                            <div key={domain} className="border rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium text-sm">{domain}</h5>
                                {stats.requires_login && (
                                  <Badge variant="secondary" className="text-xs">
                                    Login Required
                                  </Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Success Rate:</span>
                                  <span className="ml-1 font-medium">
                                    {(stats.success_rate * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Relevance:</span>
                                  <span className="ml-1 font-medium">
                                    {(stats.avg_relevance * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Visits:</span>
                                  <span className="ml-1 font-medium">{stats.visits}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Valuable Paths:</span>
                                  <span className="ml-1 font-medium">{stats.valuable_paths.length}</span>
                                </div>
                              </div>
                              {stats.valuable_paths.length > 0 && (
                                <div className="mt-2 pt-2 border-t">
                                  <p className="text-xs text-gray-500">Top paths:</p>
                                  <div className="text-xs mt-1">
                                    {stats.valuable_paths.slice(0, 3).join(', ')}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          {Object.keys(siteStats).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4">
                              No site statistics available yet
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="llm" className="space-y-4">
                    {/* Query Interface */}
                    <Card>
                      <CardHeader>
                        <CardTitle>LLM Query Service</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3">
                          <div>
                            <Label>Query</Label>
                            <textarea
                              className="w-full p-2 border rounded-md resize-none"
                              rows={4}
                              placeholder="Enter your query here..."
                              value={llmQuery}
                              onChange={(e) => setLlmQuery(e.target.value)}
                              disabled={isQuerying}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label>Query Type</Label>
                              <select
                                className="w-full p-2 border rounded-md"
                                value={queryType}
                                onChange={(e) => setQueryType(e.target.value)}
                                disabled={isQuerying}
                              >
                                <option value="question">Question</option>
                                <option value="analysis">Analysis</option>
                                <option value="extraction">Extraction</option>
                                <option value="summary">Summary</option>
                                <option value="comparison">Comparison</option>
                                <option value="prediction">Prediction</option>
                              </select>
                            </div>

                            <div>
                              <Label>Provider</Label>
                              <select
                                className="w-full p-2 border rounded-md"
                                value={llmProvider}
                                onChange={(e) => setLlmProvider(e.target.value)}
                                disabled={isQuerying}
                              >
                                <option value="lm_studio">LM Studio (Local)</option>
                                <option value="openai">OpenAI</option>
                                <option value="anthropic">Anthropic</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="flex items-center gap-2">
                                Temperature
                                <span className="text-xs text-gray-500">{temperature}</span>
                              </Label>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={temperature}
                                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                className="w-full"
                                disabled={isQuerying}
                              />
                            </div>

                            <div>
                              <Label>Max Tokens</Label>
                              <Input
                                type="number"
                                value={maxTokens}
                                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2000)}
                                min="100"
                                max="4000"
                                disabled={isQuerying}
                              />
                            </div>
                          </div>

                          <Button
                            onClick={executeLLMQuery}
                            disabled={!llmQuery.trim() || isQuerying}
                            className="w-full"
                          >
                            {isQuerying ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Send Query
                              </>
                            )}
                          </Button>
                        </div>

                        {/* Query Response */}
                        {llmResponse && (
                          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium">Response</h4>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">
                                  {llmResponse.model}
                                </Badge>
                                <span className="text-xs text-gray-500">
                                  {llmResponse.processing_time.toFixed(2)}s
                                </span>
                              </div>
                            </div>
                            <div className="text-sm">
                              {typeof llmResponse.response === 'string' ? (
                                <p className="whitespace-pre-wrap">{llmResponse.response}</p>
                              ) : (
                                <pre className="bg-white p-2 rounded overflow-x-auto">
                                  {JSON.stringify(llmResponse.response, null, 2)}
                                </pre>
                              )}
                            </div>
                            {llmResponse.token_usage && (
                              <div className="mt-2 text-xs text-gray-500">
                                Tokens: {llmResponse.token_usage.prompt_tokens} prompt + 
                                {llmResponse.token_usage.completion_tokens} completion = 
                                {llmResponse.token_usage.total_tokens} total
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Data Analysis */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Data Analysis</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3">
                          <div>
                            <Label>Analysis Type</Label>
                            <select
                              className="w-full p-2 border rounded-md"
                              value={analysisType}
                              onChange={(e) => setAnalysisType(e.target.value)}
                            >
                              <option value="pattern">Pattern Analysis</option>
                              <option value="statistical">Statistical Analysis</option>
                              <option value="comparative">Comparative Analysis</option>
                              <option value="predictive">Predictive Analysis</option>
                              <option value="diagnostic">Diagnostic Analysis</option>
                              <option value="prescriptive">Prescriptive Analysis</option>
                            </select>
                          </div>

                          <div>
                            <Label>Analysis Questions (one per line)</Label>
                            <textarea
                              className="w-full p-2 border rounded-md resize-none"
                              rows={3}
                              placeholder="What patterns do you see?&#10;What are the main trends?"
                              value={analysisQuestions}
                              onChange={(e) => setAnalysisQuestions(e.target.value)}
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={analyzeConversations}
                              disabled={!backendConnected || isAnalyzing}
                              className="flex-1"
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Analyzing...
                                </>
                              ) : (
                                <>
                                  <TrendingUp className="h-4 w-4 mr-2" />
                                  Analyze Conversations
                                </>
                              )}
                            </Button>
                            <Button
                              onClick={comparePlatforms}
                              disabled={!backendConnected || isAnalyzing}
                              variant="outline"
                            >
                              Compare Platforms
                            </Button>
                          </div>
                        </div>

                        {/* Analysis Results */}
                        {analysisResults && (
                          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                            <h4 className="font-medium mb-2">Analysis Results</h4>
                            <div className="text-sm space-y-2">
                              {analysisResults.analysis_type && (
                                <div>
                                  <span className="font-medium">Type:</span> {analysisResults.analysis_type}
                                </div>
                              )}
                              {analysisResults.conversations_analyzed && (
                                <div>
                                  <span className="font-medium">Conversations analyzed:</span> {analysisResults.conversations_analyzed}
                                </div>
                              )}
                              <div className="mt-2">
                                {typeof analysisResults.results === 'string' ? (
                                  <p className="whitespace-pre-wrap">{analysisResults.results}</p>
                                ) : (
                                  <pre className="bg-white p-2 rounded overflow-x-auto">
                                    {JSON.stringify(analysisResults.results, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Provider Statistics */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>Provider Statistics</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={loadProviderStats}
                            disabled={!isBackendConnected}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {Object.entries(providerStats).map(([provider, stats]) => (
                            <div key={provider} className="border rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium text-sm capitalize">{provider}</h5>
                                <Badge variant={stats.success_rate > 90 ? "default" : "secondary"}>
                                  {stats.success_rate.toFixed(0)}% success
                                </Badge>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Total:</span>
                                  <span className="ml-1 font-medium">{stats.total_queries}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Success:</span>
                                  <span className="ml-1 font-medium text-green-600">{stats.successful_queries}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Errors:</span>
                                  <span className="ml-1 font-medium text-red-600">{stats.error_count}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {Object.keys(providerStats).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4">
                              No provider statistics available yet
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Query History */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>Query History</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={loadQueryHistory}
                            disabled={!isBackendConnected}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {queryHistory.map((entry, idx) => (
                            <div key={idx} className="text-sm p-2 bg-gray-50 rounded">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{entry.query}</span>
                                <Badge variant="outline" className="text-xs">
                                  {entry.query_type}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                <span>{formatDate(entry.timestamp)}</span>
                                <span>{entry.provider}</span>
                                <span>{entry.processing_time.toFixed(2)}s</span>
                              </div>
                            </div>
                          ))}
                          {queryHistory.length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4">
                              No query history available
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </Section>
            </div>

            {/* Right Panel */}
            <div className="space-y-6">
              <Section title="Statistics">
                <div className="space-y-4">
                  <StatCard
                    title="Total Conversations"
                    value={systemState.total_conversations.toString()}
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
                      {stats?.latest_sync && Object.entries(stats.latest_sync)
                        .filter(([platform]) => platformConfigs[platform])
                        .sort(([, a], [, b]) => new Date(b as string).getTime() - new Date(a as string).getTime())
                        .slice(0, 5)
                        .map(([platform, syncTime]) => (
                          <ActivityItem
                            key={platform}
                            time={formatDate(syncTime as string)}
                            action="Sync completed"
                            source={platformConfigs[platform].name}
                            count={`${platformConfigs[platform].todayCount || 0} conversations`}
                            type="success"
                          />
                        ))}
                      {(!stats?.latest_sync || Object.keys(stats.latest_sync).length === 0) && (
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
          </div>
        </div>
      </main>

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