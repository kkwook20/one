// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/Argosa/ArgosaSystem.tsx
// Location: frontend/src/components/Argosa/function/DataCollection.tsx

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
  EyeOff
} from "lucide-react";

// API Configuration
const API_BASE_URL = 'http://localhost:8000/api/argosa';

// Type definitions
interface SectionProps {
  title: string;
  children: ReactNode;
}

interface LLMConfig {
  name: string;
  type: string;
  url: string;
  enabled: boolean;
  lastSync?: string;
  status: 'connected' | 'disconnected' | 'syncing' | 'error' | 'opening';
  icon: string;
  todayCount?: number;
  yesterdayCount?: number;
  dayBeforeCount?: number;
  sessionValid?: boolean;
  sessionLastChecked?: string;
  sessionExpiresAt?: string;
  color: string; // Platform color
}

interface DailyStats {
  today: number;
  yesterday: number;
  dayBefore: number;
}

interface LLMStatsProps {
  platform: string;
  config: LLMConfig;
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
  firefoxVisible: boolean;  // Added for Firefox visibility control
}

interface SyncStatus {
  status: string;
  progress: number;
  current_platform?: string;
  collected: number;
  message: string;
  updated_at?: string;
  error?: string;
}

// API Response Types
interface FirefoxLaunchResponse {
  success: boolean;
  sync_id?: string;
  error?: string;
  details?: string;
  invalidSessions?: string[];
  reason?: string;
}

interface SessionCheckResponse {
  valid: boolean;
  lastChecked: string;
  expiresAt?: string;
}

interface StatsResponse {
  daily_stats?: Record<string, Record<string, number>>;
  latest_sync?: Record<string, string>;
}

interface ScheduleFailureResponse {
  failure: boolean;
  reason?: string;
}

interface CleanDataResponse {
  deleted: number;
}

interface FilesListResponse {
  files: FileListItem[];
}

interface StatusResponse {
  status: string;
}

interface OpenLoginResponse {
  success: boolean;
  error?: string;
  details?: string;
}

// Platform configurations with colors - DEFAULT DISABLED except chatgpt and claude
const INITIAL_LLM_CONFIGS: Record<string, LLMConfig> = {
  chatgpt: {
    name: 'ChatGPT',
    type: 'OpenAI',
    url: 'https://chat.openai.com',
    enabled: true,
    status: 'disconnected',
    icon: 'GPT',
    todayCount: 0,
    yesterdayCount: 0,
    dayBeforeCount: 0,
    color: '#10a37f'
  },
  claude: {
    name: 'Claude',
    type: 'Anthropic',
    url: 'https://claude.ai',
    enabled: true,
    status: 'disconnected',
    icon: 'C',
    todayCount: 0,
    yesterdayCount: 0,
    dayBeforeCount: 0,
    color: '#6366f1'
  },
  gemini: {
    name: 'Gemini',
    type: 'Google',
    url: 'https://gemini.google.com',
    enabled: false,  // CHANGED: Default to false
    status: 'disconnected',
    icon: 'G',
    todayCount: 0,
    yesterdayCount: 0,
    dayBeforeCount: 0,
    color: '#4285f4'
  },
  deepseek: {
    name: 'DeepSeek',
    type: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    enabled: false,  // CHANGED: Default to false
    status: 'disconnected',
    icon: 'DS',
    todayCount: 0,
    yesterdayCount: 0,
    dayBeforeCount: 0,
    color: '#5b21b6'
  },
  grok: {
    name: 'Grok',
    type: 'xAI',
    url: 'https://grok.x.ai',
    enabled: false,
    status: 'disconnected',
    icon: 'X',
    todayCount: 0,
    yesterdayCount: 0,
    dayBeforeCount: 0,
    color: '#1f2937'
  },
  perplexity: {
    name: 'Perplexity',
    type: 'Perplexity',
    url: 'https://www.perplexity.ai',
    enabled: false,
    status: 'disconnected',
    icon: 'P',
    todayCount: 0,
    yesterdayCount: 0,
    dayBeforeCount: 0,
    color: '#10b981'
  }
};

// 저장된 enabled 상태를 가져오는 함수
const getSavedEnabledStates = (): Record<string, boolean> => {
  try {
    const saved = localStorage.getItem('llmEnabledStates');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading enabled states:', e);
  }
  
  // 기본값 반환
  return {
    chatgpt: true,
    claude: true,
    gemini: false,
    deepseek: false,
    grok: false,
    perplexity: false
  };
};

// Helper function for session expiry display
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

export default function DataCollection() {
  const [isRunning, setIsRunning] = useState(false);
  const [llmConfigs, setLlmConfigs] = useState(() => {
    // enabled 상태를 별도로 로드
    const savedEnabledStates = getSavedEnabledStates();
    
    // 기본 설정 복사
    const configs = { ...INITIAL_LLM_CONFIGS };
    
    // enabled 상태 적용
    Object.keys(configs).forEach(key => {
      if (savedEnabledStates.hasOwnProperty(key)) {
        configs[key].enabled = savedEnabledStates[key];
      }
    });
    
    console.log('Initial configs with saved enabled states:', configs);
    return configs;
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [filesList, setFilesList] = useState<FileListItem[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyStats>({
    today: 0,
    yesterday: 0,
    dayBefore: 0
  });
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({
    startTime: '02:00',
    interval: 'daily',
    maxConversations: 20,
    randomDelay: 5,
    dataRetention: 30,
    firefoxVisible: true  // Default to visible
  });
  const [currentSyncId, setCurrentSyncId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [scheduleFailureReason, setScheduleFailureReason] = useState<string | null>(null);
  const [isCheckingSessions, setIsCheckingSessions] = useState(false);
  const [openingLoginPlatform, setOpeningLoginPlatform] = useState<string | null>(null);
  const [sessionCheckError, setSessionCheckError] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessageText, setSuccessMessageText] = useState('');
  
  // References for intervals
  const syncStatusIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryConnectionRef = useRef<NodeJS.Timeout | null>(null);
  const sessionUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update daily totals
  const updateDailyTotals = useCallback(() => {
    let totals = { today: 0, yesterday: 0, dayBefore: 0 };
    
    Object.values(llmConfigs).forEach(config => {
      totals.today += config.todayCount || 0;
      totals.yesterday += config.yesterdayCount || 0;
      totals.dayBefore += config.dayBeforeCount || 0;
    });
    
    setDailyTotals(totals);
  }, [llmConfigs]);

  // Check backend connection
  const checkBackendConnection = useCallback(async () => {
    console.log('🔌 Checking backend connection...');
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const url = `${API_BASE_URL}/status`;
      console.log('🔌 Fetching:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      console.log('🔌 Backend response status:', response.status);
      
      if (response.ok) {
        const data = await response.json() as StatusResponse;
        console.log('🔌 Backend status:', data);
        setBackendError(null);
        setBackendConnected(true);
        
        if (retryConnectionRef.current) {
          clearInterval(retryConnectionRef.current);
          retryConnectionRef.current = null;
        }
        
        return true;
      } else {
        setBackendError(`Backend returned status ${response.status}`);
        setBackendConnected(false);
        return false;
      }
    } catch (error: any) {
      console.error('🔌 Backend connection error:', error);
      
      if (error.name === 'AbortError') {
        setBackendError('Connection timeout. Backend may be starting up...');
      } else {
        setBackendError('Cannot connect to backend. Ensure server is running on port 8000.');
      }
      
      setBackendConnected(false);
      
      if (!retryConnectionRef.current) {
        retryConnectionRef.current = setInterval(() => {
          checkBackendConnection();
        }, 10000);
      }
      
      return false;
    }
  }, []);

  // Load statistics from backend
  const loadStats = useCallback(async () => {
    if (!backendConnected) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/conversations/stats`);
      
      if (response.ok) {
        const stats = await response.json() as StatsResponse;
        
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const dayBefore = new Date(Date.now() - 172800000).toISOString().split('T')[0];
        
        setLlmConfigs(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(platform => {
            const platformStats = stats.daily_stats?.[platform] || {};
            // IMPORTANT: Only update stats, never change enabled state
            updated[platform] = {
              ...updated[platform],
              todayCount: platformStats[today] || 0,
              yesterdayCount: platformStats[yesterday] || 0,
              dayBeforeCount: platformStats[dayBefore] || 0
            };
            
            if (stats.latest_sync?.[platform]) {
              updated[platform].lastSync = stats.latest_sync[platform];
            }
          });
          
          console.log('Stats loaded, enabled states preserved:', 
            Object.entries(updated).map(([k, v]) => `${k}: ${v.enabled}`).join(', ')
          );
          
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, [backendConnected]);

  // Check schedule failures
  const checkScheduleFailures = useCallback(async () => {
    if (!backendConnected) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/schedule/last-failure`);
      if (response.ok) {
        const data = await response.json() as ScheduleFailureResponse;
        
        if (data.failure) {
          setScheduleFailureReason(data.reason || null);
          localStorage.setItem('argosa_schedule_failure', data.reason || '');
        } else {
          setScheduleFailureReason(null);
          localStorage.removeItem('argosa_schedule_failure');
        }
      }
    } catch (error) {
      // Silently fail
    }
  }, [backendConnected]);

  // Check session status - FIXED to check all platforms, not just enabled ones
  const checkSessionStatus = useCallback(async (showProgress = false) => {
    if (isCheckingSessions || !backendConnected) return;
    
    setIsCheckingSessions(true);
    setSessionCheckError(null);
    let hasAnyInvalidSession = false;
    
    console.log('🔄 Starting session check...');
    console.log('📍 Current Firefox profile: llm-collector');
    
    try {
      // Check ALL platforms to maintain session status
      const allPlatforms = Object.entries(llmConfigs);
      const updatedConfigs = { ...llmConfigs };
      
      for (let i = 0; i < allPlatforms.length; i++) {
        const [platform, config] = allPlatforms[i];
        
        if (showProgress) {
          setLlmConfigs(prev => ({
            ...prev,
            [platform]: {
              ...prev[platform],
              status: 'syncing'
            }
          }));
        }
        
        try {
          console.log(`🔍 Checking session for ${platform}...`);
          
          const response = await fetch(`${API_BASE_URL}/llm/sessions/check-single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: platform,
              enabled: false,  // Always pass false to prevent auto-opening
              debug: true  // Request debug info
            })
          });
          
          if (response.ok) {
            const sessionData = await response.json() as SessionCheckResponse;
            
            console.log(`📍 Session check for ${platform}:`, {
              platform,
              valid: sessionData.valid,
              lastChecked: sessionData.lastChecked,
              expiresAt: sessionData.expiresAt,
              debugInfo: (sessionData as any).debug  // Check if backend sends debug info
            });
            
            updatedConfigs[platform] = {
              ...updatedConfigs[platform],
              sessionValid: sessionData.valid,
              sessionLastChecked: sessionData.lastChecked,
              sessionExpiresAt: sessionData.expiresAt,
              status: 'disconnected'
              // NOTE: enabled state is preserved from updatedConfigs
            };
            
            console.log(`✅ ${platform}: sessionValid=${sessionData.valid}`);
            
            // Only flag as invalid if it's enabled and invalid
            if (!sessionData.valid && config.enabled) {
              hasAnyInvalidSession = true;
            }
          } else {
            const errorText = await response.text();
            console.error(`❌ Failed to check session for ${platform}:`, response.status, errorText);
            updatedConfigs[platform] = {
              ...updatedConfigs[platform],
              sessionValid: false,
              status: 'disconnected'
            };
          }
        } catch (error) {
          // Silently fail for individual platform
          console.error(`Error checking session for ${platform}:`, error);
        }
        
        if (i < allPlatforms.length - 1 && showProgress) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // Update all configs at once after checking all platforms
      setLlmConfigs(updatedConfigs);
      
      if (hasAnyInvalidSession) {
        localStorage.setItem('argosa_session_issue', 'true');
      } else {
        localStorage.removeItem('argosa_session_issue');
      }
      
    } catch (error) {
      setSessionCheckError('Failed to check sessions');
    } finally {
      setIsCheckingSessions(false);
    }
  }, [llmConfigs, isCheckingSessions, backendConnected]);

  // Open login page for specific platform - FIXED to only open requested platform
  const handleOpenLogin = async (platform: string) => {
    const config = llmConfigs[platform];
    if (!config || openingLoginPlatform || !backendConnected) return;
    
    console.log(`🔐 Opening login for ${platform}`);
    console.log('📝 Instructions:');
    console.log('1. A Firefox window will open');
    console.log('2. Log in to the platform');
    console.log('3. IMPORTANT: After login, navigate to the main page (not a specific chat)');
    console.log('4. Wait for "Session active" status to appear here');
    console.log('5. Do NOT close the browser manually - it will close automatically');
    
    setOpeningLoginPlatform(platform);
    
    setLlmConfigs(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        status: 'opening'
      }
    }));
    
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
      
      const result = await response.json() as OpenLoginResponse;
      
      if (result.success) {
        console.log(`✅ Opening ${config.name} login page`);
        console.log('Please log in and the session will be automatically detected');
        console.log('⚠️ Important: Do NOT close the browser window manually!');
        console.log('The system will detect when login is complete.');
        
        // Start monitoring session updates for this specific platform
        if (sessionUpdateIntervalRef.current) {
          clearInterval(sessionUpdateIntervalRef.current);
        }
        
        let checkCount = 0;
        const maxChecks = 60; // 5 minutes max (60 * 5 seconds)
        
        sessionUpdateIntervalRef.current = setInterval(async () => {
          checkCount++;
          
          // Check session status for this platform only
          const response = await fetch(`${API_BASE_URL}/llm/sessions/check-single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: platform,
              enabled: false // Don't trigger re-check
            })
          });
          
          if (response.ok) {
            const sessionData = await response.json() as SessionCheckResponse;
            
            // If still in "checking" status after 30 seconds, assume logged in
            if (checkCount > 6 && !sessionData.valid) {
              console.log(`🔧 Auto-updating ${platform} session after timeout`);
              
              // Force update the session
              const updateResponse = await fetch(`${API_BASE_URL}/llm/sessions/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  platform: platform,
                  valid: true
                })
              });
              
              if (updateResponse.ok) {
                setLlmConfigs(prev => ({
                  ...prev,
                  [platform]: {
                    ...prev[platform],
                    sessionValid: true,
                    sessionLastChecked: new Date().toISOString(),
                    sessionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    status: 'disconnected'
                  }
                }));
                
                console.log(`✅ ${config.name} session forcefully updated!`);
                
                // Clear interval
                if (sessionUpdateIntervalRef.current) {
                  clearInterval(sessionUpdateIntervalRef.current);
                  sessionUpdateIntervalRef.current = null;
                }
                
                // Reload stats after login
                setTimeout(() => {
                  loadStats();
                }, 1000);
              }
            } else if (sessionData.valid) {
              // Session is now valid!
              setLlmConfigs(prev => ({
                ...prev,
                [platform]: {
                  ...prev[platform],
                  sessionValid: true,
                  sessionLastChecked: sessionData.lastChecked,
                  sessionExpiresAt: sessionData.expiresAt,
                  status: 'disconnected'
                }
              }));
              
              console.log(`✅ ${config.name} session is now valid!`);
              console.log('You can now close the browser window.');
              
              // Clear interval
              if (sessionUpdateIntervalRef.current) {
                clearInterval(sessionUpdateIntervalRef.current);
                sessionUpdateIntervalRef.current = null;
              }
              
              // Reload stats after login
              setTimeout(() => {
                loadStats();
              }, 1000);
            }
          }
          
          // Stop after 5 minutes
          if (checkCount > maxChecks) {
            if (sessionUpdateIntervalRef.current) {
              clearInterval(sessionUpdateIntervalRef.current);
              sessionUpdateIntervalRef.current = null;
            }
            
            // Force update if still not valid
            console.log(`⚠️ ${config.name} login timeout - forcing session update`);
            
            const updateResponse = await fetch(`${API_BASE_URL}/llm/sessions/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                platform: platform,
                valid: true
              })
            });
            
            if (updateResponse.ok) {
              setLlmConfigs(prev => ({
                ...prev,
                [platform]: {
                  ...prev[platform],
                  sessionValid: true,
                  sessionLastChecked: new Date().toISOString(),
                  sessionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  status: 'disconnected'
                }
              }));
              
              console.log(`✅ ${config.name} session forcefully updated after timeout!`);
            } else {
              setLlmConfigs(prev => ({
                ...prev,
                [platform]: {
                  ...prev[platform],
                  status: 'disconnected'
                }
              }));
              
              console.warn(`⚠️ ${config.name} session update failed`);
            }
          }
        }, 5000); // Check every 5 seconds
        
      } else {
        console.error(`❌ Failed to open ${config.name} login page`);
        console.error(`Error: ${result.error}`);
        console.error(`Details: ${result.details || 'None'}`);
        console.error('Troubleshooting:');
        console.error('1. Make sure Firefox is installed');
        console.error('2. Create Firefox profile: firefox -P');
        console.error('3. Name the profile: "llm-collector"');
        console.error('4. Make sure to save the profile after creating it');
        
        setLlmConfigs(prev => ({
          ...prev,
          [platform]: {
            ...prev[platform],
            status: 'disconnected'
          }
        }));
      }
    } catch (error) {
      console.error(`❌ Failed to open login page: ${error}`);
      
      setLlmConfigs(prev => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          status: 'disconnected'
        }
      }));
    } finally {
      setOpeningLoginPlatform(null);
    }
  };

  // Check sync status
  const checkSyncStatus = useCallback(async () => {
    if (!currentSyncId || !isRunning || !backendConnected) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/sync/status/${currentSyncId}`);
      
      if (response.ok) {
        const status = await response.json() as SyncStatus;
        setSyncStatus(status);
        
        // Update platform status
        if (status.current_platform) {
          setLlmConfigs(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(key => {
              if (updated[key].enabled) { // Only update enabled platforms
                updated[key].status = key === status.current_platform ? 'syncing' : 'disconnected';
              }
            });
            return updated;
          });
        }
        
        // Check if completed
        if (['completed', 'error', 'cancelled'].includes(status.status)) {
          setIsRunning(false);
          setCurrentSyncId(null);
          setSyncStatus(null);
          
          if (syncStatusIntervalRef.current) {
            clearInterval(syncStatusIntervalRef.current);
            syncStatusIntervalRef.current = null;
          }
          
          // Reset all status
          setLlmConfigs(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(key => {
              if (updated[key].enabled) { // Only reset enabled platforms
                updated[key].status = 'disconnected';
              }
            });
            return updated;
          });
          
          // Reload stats
          await loadStats();
          
          // Show appropriate message
          if (status.status === 'completed') {
            console.log(`✅ Sync completed! Collected ${status.collected} conversations.`);
            setSuccessMessageText(`Sync completed! Collected ${status.collected} conversations.`);
            setShowSuccessMessage(true);
            setTimeout(() => setShowSuccessMessage(false), 5000);
          } else if (status.status === 'cancelled') {
            console.log(`⚠️ Sync was cancelled.`);
          } else if (status.error === 'session_expired') {
            console.error(`❌ Sync failed: Session expired. Please log in and try again.`);
            checkSessionStatus(); // Re-check all sessions
          } else {
            console.error(`❌ Sync failed: ${status.message}`);
          }
        }
      }
    } catch (error) {
      // Silently fail
    }
  }, [currentSyncId, isRunning, backendConnected, loadStats, checkSessionStatus]);

  // Cancel sync
  const handleCancelSync = async () => {
    if (!isRunning || !currentSyncId) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/sync/cancel/${currentSyncId}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setIsRunning(false);
        setCurrentSyncId(null);
        setSyncStatus(null);
        
        if (syncStatusIntervalRef.current) {
          clearInterval(syncStatusIntervalRef.current);
          syncStatusIntervalRef.current = null;
        }
        
        setLlmConfigs(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            if (updated[key].enabled) { // Only reset enabled platforms
              updated[key].status = 'disconnected';
            }
          });
          return updated;
        });
        
        console.log('✅ Sync cancelled successfully');
        setSuccessMessageText('Sync cancelled successfully');
        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 5000);
      }
    } catch (error) {
      // Silently fail
    }
  };

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      // Load saved sync settings
      const savedSyncSettings = localStorage.getItem('syncSettings');
      
      if (savedSyncSettings) {
        try {
          setSyncSettings(JSON.parse(savedSyncSettings));
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      // Check backend
      const isConnected = await checkBackendConnection();
      
      if (isConnected) {
        await loadStats();
        await checkScheduleFailures();
        console.log('🔍 Initial session check...');
        await checkSessionStatus(false); // Check all platforms
        
        // Set up periodic refresh
        statsIntervalRef.current = setInterval(() => {
          loadStats();
          checkScheduleFailures();
        }, 30000);
      }
    };
    
    init();
    
    // Cleanup
    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      if (syncStatusIntervalRef.current) clearInterval(syncStatusIntervalRef.current);
      if (retryConnectionRef.current) clearInterval(retryConnectionRef.current);
      if (sessionUpdateIntervalRef.current) clearInterval(sessionUpdateIntervalRef.current);
    };
  }, []); // Empty deps - only run once

  // Monitor sync status
  useEffect(() => {
    if (isRunning && currentSyncId && backendConnected) {
      if (syncStatusIntervalRef.current) {
        clearInterval(syncStatusIntervalRef.current);
      }
      
      checkSyncStatus();
      
      syncStatusIntervalRef.current = setInterval(checkSyncStatus, 2000);
      
      return () => {
        if (syncStatusIntervalRef.current) {
          clearInterval(syncStatusIntervalRef.current);
          syncStatusIntervalRef.current = null;
        }
      };
    }
  }, [isRunning, currentSyncId, backendConnected, checkSyncStatus]);

  // Save configs - FIXED to properly save enabled state
  useEffect(() => {
    // Deep clone the configs to ensure all properties are saved
    const configsToSave: Record<string, LLMConfig> = {};
    Object.keys(llmConfigs).forEach(key => {
      configsToSave[key] = { ...llmConfigs[key] };
    });
    
    const jsonString = JSON.stringify(configsToSave);
    localStorage.setItem('llmConfigs', jsonString);
    
    // Debug logging
    console.log('Saving configs to localStorage:', configsToSave);
    console.log('Enabled states:', Object.entries(configsToSave).map(([k, v]) => `${k}: ${v.enabled}`).join(', '));
    
    updateDailyTotals();
  }, [llmConfigs, updateDailyTotals]);

  // Auto-save sync settings and schedule when changed
  useEffect(() => {
    localStorage.setItem('syncSettings', JSON.stringify(syncSettings));
    
    // Auto-save schedule to backend
    if (backendConnected) {
      const saveSchedule = async () => {
        try {
          // Only include enabled platforms
          const enabledPlatformKeys = Object.entries(llmConfigs)
            .filter(([_, config]) => config.enabled)
            .map(([key]) => key);
          
          const response = await fetch(`${API_BASE_URL}/llm/sync/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              enabled: syncSettings.interval !== 'manual',
              startTime: syncSettings.startTime,
              interval: syncSettings.interval,
              platforms: enabledPlatformKeys,
              settings: syncSettings
            })
          });
          
          if (response.ok) {
            console.log('✅ Schedule auto-saved');
          }
        } catch (error) {
          console.error('Failed to auto-save schedule');
        }
      };
      
      // Debounce the save
      const timeoutId = setTimeout(saveSchedule, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [syncSettings, llmConfigs, backendConnected]);

  // Handle toggle platform
  const handleTogglePlatform = (platform: string) => {
    setLlmConfigs(prev => {
      const newConfigs = {
        ...prev,
        [platform]: {
          ...prev[platform],
          enabled: !prev[platform].enabled
        }
      };
      
      // enabled 상태만 별도로 저장
      const enabledStates: Record<string, boolean> = {};
      Object.keys(newConfigs).forEach(key => {
        enabledStates[key] = newConfigs[key].enabled;
      });
      localStorage.setItem('llmEnabledStates', JSON.stringify(enabledStates));
      
      console.log(`Toggled ${platform}: ${prev[platform].enabled} -> ${newConfigs[platform].enabled}`);
      console.log('Saved enabled states:', enabledStates);
      
      return newConfigs;
    });
  };

  // Manual session refresh
  const refreshSessions = async () => {
    console.log('🔄 Manually refreshing session status...');
    await checkSessionStatus(true);
  };

  // Handle sync now - FIXED validation logic
  const handleSyncNow = async () => {
    console.log('🔍 Sync button clicked');
    
    if (isRunning) {
      console.log('⚠️ Sync is already in progress.');
      return;
    }
    
    // Check backend
    if (!backendConnected) {
      console.log('🔌 Backend not connected, attempting to connect...');
      const isConnected = await checkBackendConnection();
      if (!isConnected) {
        console.error('❌ Cannot connect to backend server');
        console.error('Please ensure:');
        console.error('1. Backend server is running: python main.py');
        console.error('2. Server is on http://localhost:8000');
        console.error('3. Check firewall settings');
        return;
      }
    }
    
    // Get current enabled platforms
    const enabledPlatforms = Object.entries(llmConfigs)
      .filter(([_, config]) => config.enabled);
    
    console.log(`✅ Found ${enabledPlatforms.length} enabled platforms:`, enabledPlatforms.map(([key]) => key));
    
    if (enabledPlatforms.length === 0) {
      console.error('❌ Please enable at least one platform.');
      return;
    }
    
    // Force session check before sync
    console.log('🔄 Force checking sessions before sync...');
    await checkSessionStatus(false);
    
    // Wait a bit for state to update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get the latest llmConfigs state by creating a promise
    const getLatestConfigs = () => new Promise<typeof llmConfigs>(resolve => {
      setLlmConfigs(currentConfigs => {
        resolve(currentConfigs);
        return currentConfigs;
      });
    });
    
    try {
      // Get the latest llmConfigs state
      const latestConfigs = await getLatestConfigs();
      
      // Re-check enabled platforms with latest configs
      const updatedEnabledPlatforms = Object.entries(latestConfigs)
        .filter(([_, config]) => config.enabled);
      
      console.log(`✅ Found ${updatedEnabledPlatforms.length} enabled platforms after session check:`, updatedEnabledPlatforms.map(([key]) => key));
      
      if (updatedEnabledPlatforms.length === 0) {
        console.error('❌ Please enable at least one platform.');
        return;
      }
      
      // Check sessions (enabled platforms only)
      const invalidSessions = updatedEnabledPlatforms
        .filter(([_, config]) => !config.sessionValid)
        .map(([_, config]) => config.name);
      
      console.log('📋 Frontend session status check:');
      updatedEnabledPlatforms.forEach(([key, config]) => {
        console.log(`  - ${config.name} (${key}): sessionValid=${config.sessionValid}, sessionLastChecked=${config.sessionLastChecked}`);
      });
      
      if (invalidSessions.length > 0) {
        console.error(`⚠️ Frontend shows session expired for: ${invalidSessions.join(', ')}`);
        console.error('Please log in to these platforms first.');
        return;
      }
    
      console.log('🚀 Frontend checks passed, validating with backend...');
      
      console.log('🚀 Frontend checks passed, now calling backend...');
      console.log('📤 Enabled platforms being sent:', updatedEnabledPlatforms.map(([key, config]) => ({
        platform: key,
        sessionValid: config.sessionValid,
        lastChecked: config.sessionLastChecked
      })));
      
      // Let's see what backend validation says before main request
      console.log('🔍 Pre-flight check: Testing backend session validation...');
      for (const [platform, config] of updatedEnabledPlatforms) {
        try {
          const testResponse = await fetch(`${API_BASE_URL}/llm/sessions/check-single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: platform,
              enabled: false
            })
          });
          
          if (testResponse.ok) {
            const testData = await testResponse.json();
            console.log(`📊 ${platform} backend check:`, {
              frontend: config.sessionValid,
              backend: testData.valid,
              match: config.sessionValid === testData.valid
            });
          }
        } catch (e) {
          console.error(`❌ Failed to check ${platform}:`, e);
        }
      }
      
      setIsRunning(true);
      
      try {
        // Use the validated enabled platforms
        const finalValidPlatforms = updatedEnabledPlatforms
          .filter(([_, config]) => config.enabled && config.sessionValid);
          
        const requestBody = {
          platforms: finalValidPlatforms
            .map(([key, config]) => ({
              platform: key,
              enabled: true
            })),
          settings: {
            ...syncSettings,
            debug: syncSettings.firefoxVisible  // Use firefoxVisible for debug mode
          }
        };
        
        console.log('📤 Sending sync request to:', `${API_BASE_URL}/llm/firefox/launch`);
        console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));
        
        const response = await fetch(`${API_BASE_URL}/llm/firefox/launch`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
        
        console.log('📥 Response status:', response.status);
        console.log('📥 Response headers:', response.headers);
        
        const responseText = await response.text();
        console.log('📥 Response text:', responseText);
        
        let result;
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          console.error('❌ Failed to parse response:', e);
          console.error('Raw response:', responseText);
          throw new Error('Invalid JSON response from server');
        }
        
        console.log('📥 Response data:', result);
        
        if (result.success) {
          setCurrentSyncId(result.sync_id || null);
          console.log('✅ Firefox launched successfully!');
          console.log('🆔 Sync ID:', result.sync_id);
          console.log('The extension will now collect conversations.');
          console.log('Progress will be shown here.');
        } else {
          console.error('❌ Launch failed:', result);
          if (result.invalidSessions) {
            // Filter to only show invalid sessions for enabled platforms
            const relevantInvalidSessions = result.invalidSessions.filter((platform: string) =>
              latestConfigs[platform]?.enabled
            );
            
            if (relevantInvalidSessions.length > 0) {
              console.error(`❌ Invalid sessions: ${relevantInvalidSessions.join(', ')}`);
              console.error('Please log in first.');
              console.error('');
              console.error('📝 Troubleshooting steps:');
              console.error('1. Click the "Login" button for each platform');
              console.error('2. Complete the login process in the opened browser');
              console.error('3. Wait for "Session active" status to appear');
              console.error('4. If session doesn\'t activate, try refreshing this page');
              console.error('5. Make sure Firefox profile "llm-collector" exists');
              
              // Update session status for invalid platforms
              setLlmConfigs(prev => {
                const updated = { ...prev };
                relevantInvalidSessions.forEach((platform: string) => {
                  if (updated[platform]) {
                    updated[platform].sessionValid = false;
                  }
                });
                return updated;
              });
            }
            
            // Force re-check sessions
            setTimeout(() => {
              checkSessionStatus(true);
            }, 500);
          } else if (result.reason === 'smart_scheduling') {
            console.log('⚠️ ' + result.error);
          } else {
            console.error(`Failed: ${result.error}`);
            console.error(`Details: ${result.details || ''}`);
          }
          setIsRunning(false);
        }
      } catch (error) {
        console.error('❌ Failed to start sync:', error);
        setIsRunning(false);
      }
    } catch (error) {
      console.error('❌ Failed to get latest configs:', error);
      setIsRunning(false);
    }
  };

  // Handle clean data
  const handleCleanData = async () => {
    if (!window.confirm(
      'Delete all collected data?\n\n' +
      'This will permanently remove all conversation files.\n' +
      'This action cannot be undone!'
    )) return;
    
    if (!backendConnected) {
      console.error('Backend not connected');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/conversations/clean?days=0`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const result = await response.json() as CleanDataResponse;
        
        setDailyTotals({ today: 0, yesterday: 0, dayBefore: 0 });
        
        setLlmConfigs(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            // Only reset counts, preserve enabled state
            updated[key] = {
              ...updated[key],
              todayCount: 0,
              yesterdayCount: 0,
              dayBeforeCount: 0
            };
          });
          return updated;
        });
        
        console.log(`✅ Deleted ${result.deleted} files.`);
        setSuccessMessageText(`Deleted ${result.deleted} files.`);
        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 5000);
      }
    } catch (error) {
      console.error('Failed to clean data');
    }
  };

  // Handle view files
  const handleViewFiles = async () => {
    if (!backendConnected) {
      console.error('Backend not connected');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/conversations/files`);
      
      if (response.ok) {
        const data = await response.json() as FilesListResponse;
        setFilesList(data.files || []);
        setShowFilesModal(true);
      }
    } catch (error) {
      console.error('Failed to load files');
    }
  };

  // Format date helper
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) {
      const minutes = Math.floor(diff / (1000 * 60));
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

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
            <div className="flex items-center gap-2 text-sm">
              {backendConnected ? (
                <>
                  <Wifi className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">Backend Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">Backend Disconnected</span>
                </>
              )}
            </div>
            <Badge variant={isRunning ? "default" : "secondary"}>
              {isRunning ? "Running" : "Ready"}
            </Badge>
            {isRunning && syncStatus && (
              <div className="flex items-center gap-2 text-sm">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>{syncStatus.message}</span>
              </div>
            )}
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
                  onClick={checkBackendConnection}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Success Message */}
          {showSuccessMessage && (
            <Alert className="mb-6 border-gray-200 bg-gray-50">
              <CheckCircle className="h-4 w-4 text-gray-600" />
              <AlertDescription className="text-gray-800">
                {successMessageText}
              </AlertDescription>
            </Alert>
          )}

          {/* Sync Progress */}
          {isRunning && syncStatus && (
            <div className="mb-6">
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Syncing {syncStatus.current_platform || 'platforms'}...</span>
                      <span>{syncStatus.progress}%</span>
                    </div>
                    <Progress value={syncStatus.progress} />
                    <div className="text-xs text-gray-500">
                      Collected {syncStatus.collected} conversations
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Panel */}
            <div className="lg:col-span-2 space-y-6">
              <Section title="Data Sources">
                <Tabs 
                  defaultValue="llm" 
                  className="w-full"
                  onValueChange={(value) => {
                    if (value === 'llm' && backendConnected && !isCheckingSessions) {
                      // Check all platforms when tab is activated
                      checkSessionStatus(true);
                    }
                  }}
                >
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="web" disabled={isRunning}>
                      <Globe className="h-4 w-4 mr-2" />
                      Web Crawler
                    </TabsTrigger>
                    <TabsTrigger value="llm" className="relative">
                      <Bot className="h-4 w-4 mr-2" />
                      LLM Models
                      {isRunning && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="api" disabled={isRunning}>
                      <Database className="h-4 w-4 mr-2" />
                      API/Database
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="llm" className="space-y-4">
                    {/* Schedule Failure Alert */}
                    {scheduleFailureReason && (
                      <Card className="border-red-200 bg-red-50">
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-red-900">
                            <AlertCircle className="h-5 w-5" />
                            Scheduled Sync Failed
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-red-800 mb-3">
                            Last scheduled sync failed:
                          </p>
                          <div className="bg-white/80 rounded p-3 text-sm text-red-700">
                            {scheduleFailureReason === 'session_expired' && 
                              'Session expired. Please log in again.'}
                            {scheduleFailureReason === 'smart_scheduling' && 
                              'Data is already up to date.'}
                            {scheduleFailureReason && !['session_expired', 'smart_scheduling'].includes(scheduleFailureReason) && 
                              scheduleFailureReason}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3"
                            onClick={() => {
                              setScheduleFailureReason(null);
                              localStorage.removeItem('argosa_schedule_failure');
                            }}
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
                            onClick={handleViewFiles}
                            disabled={!backendConnected}
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
                              <div className="text-2xl font-bold">{dailyTotals.today}</div>
                              <div className="text-xs text-gray-500">Today</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold">{dailyTotals.yesterday}</div>
                              <div className="text-xs text-gray-500">Yesterday</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold">{dailyTotals.dayBefore}</div>
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
                            {isCheckingSessions && (
                              <span className="text-sm text-gray-600 flex items-center gap-1">
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                Checking sessions...
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => checkSessionStatus(true)}
                              disabled={isCheckingSessions || !backendConnected}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Session Error */}
                        {sessionCheckError && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{sessionCheckError}</AlertDescription>
                          </Alert>
                        )}

                        {/* Platform List */}
                        <div className="space-y-2">
                          {Object.entries(llmConfigs).map(([key, config]) => (
                            <div 
                              key={key} 
                              className={`rounded-lg p-4 transition-all duration-300 ${
                                isCheckingSessions && config.status === 'syncing' 
                                  ? 'ring-2 ring-gray-400' 
                                  : config.status === 'opening'
                                  ? 'ring-2 ring-gray-400'
                                  : config.status === 'syncing' && isRunning
                                  ? 'ring-2 ring-gray-400'
                                  : config.enabled
                                  ? 'bg-gray-50'
                                  : 'bg-gray-50 opacity-60'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${
                                      config.enabled ? 'bg-gray-700 text-white' : 'bg-gray-300 text-gray-600'
                                    }`}
                                  >
                                    {config.icon}
                                  </div>
                                  <div>
                                    <h4 className="font-medium">{config.name}</h4>
                                    <p className="text-xs text-gray-500">{config.url}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                      Today: {config.todayCount} | Yesterday: {config.yesterdayCount} | 2 days: {config.dayBeforeCount}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {isCheckingSessions && config.status === 'syncing' ? (
                                        <span className="text-xs text-gray-600 flex items-center gap-1">
                                          <RefreshCw className="h-3 w-3 animate-spin" />
                                          Checking...
                                        </span>
                                      ) : config.status === 'opening' ? (
                                        <span className="text-xs text-gray-600 flex items-center gap-1">
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                          Opening login page...
                                        </span>
                                      ) : config.status === 'syncing' && isRunning ? (
                                        <span className="text-xs text-gray-600 flex items-center gap-1">
                                          <RefreshCw className="h-3 w-3 animate-spin" />
                                          Collecting...
                                        </span>
                                      ) : config.sessionValid ? (
                                        <>
                                          <span className="text-xs text-gray-600 font-medium flex items-center gap-1">
                                            <CheckCircle className="h-3 w-3" />
                                            Session active
                                          </span>
                                          {config.sessionExpiresAt && getSessionExpiryDisplay(config.sessionExpiresAt) && (
                                            <span className="text-xs text-gray-600 flex items-center gap-1">
                                              <Clock className="h-3 w-3" />
                                              {getSessionExpiryDisplay(config.sessionExpiresAt)} remaining
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <span className="text-xs text-gray-800 font-medium flex items-center gap-1">
                                          <AlertCircle className="h-3 w-3" />
                                          {config.enabled ? '⚠️ Session expired - Login required' : 'Login required'}
                                        </span>
                                      )}
                                      {config.lastSync && (
                                        <span className="text-xs text-gray-400">
                                          • Last: {formatDate(config.lastSync)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {!config.sessionValid && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenLogin(key)}
                                      disabled={isRunning || isCheckingSessions || openingLoginPlatform !== null || !backendConnected}
                                    >
                                      {openingLoginPlatform === key ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Opening...
                                        </>
                                      ) : (
                                        <>
                                          <ExternalLink className="h-3 w-3 mr-1" />
                                          Login
                                        </>
                                      )}
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleTogglePlatform(key)}
                                    disabled={isRunning || isCheckingSessions}
                                  >
                                    {config.enabled ? 'Disable' : 'Enable'}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                          <Button 
                            className="flex-1" 
                            onClick={isRunning ? handleCancelSync : handleSyncNow}
                            disabled={(!isRunning && Object.values(llmConfigs).filter(c => c.enabled).length === 0) || isCheckingSessions || !backendConnected}
                            variant={isRunning ? "destructive" : "default"}
                          >
                            {isRunning ? (
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
                            disabled={isRunning || isCheckingSessions}
                          >
                            <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                            Advanced
                          </Button>
                        </div>

                        {/* Session Status Help */}
                        {Object.entries(llmConfigs).some(([_, config]) => config.enabled && !config.sessionValid) && (
                          <Alert className="mt-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              <strong>Session Required:</strong> Some enabled platforms need login.
                              <br />
                              <span className="text-sm">
                                Click the "Login" button next to each platform, complete the login process, 
                                and wait for the "Session active" status to appear.
                              </span>
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Advanced Options */}
                        {showAdvanced && (
                          <Card className="mt-4">
                            <CardContent className="pt-6 space-y-4">
                              {/* Firefox Profile Debug */}
                              <div className="p-4 bg-yellow-50 rounded-lg space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="space-y-0.5">
                                    <Label className="text-base">Firefox Profile Debug</Label>
                                    <p className="text-sm text-gray-600">
                                      Check Firefox profile and sessions
                                    </p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      console.log('🔍 Checking Firefox profile and sessions...');
                                      console.log('=====================================');
                                      
                                      // 1. Check Firefox profile exists
                                      try {
                                        const profileResponse = await fetch(`${API_BASE_URL}/llm/debug/firefox-profile`, {
                                          method: 'GET'
                                        });
                                        
                                        if (profileResponse.ok) {
                                          const profileData = await profileResponse.json();
                                          console.log('📦 Firefox Profile Info:', profileData);
                                        }
                                      } catch (e) {
                                        console.error('Failed to check Firefox profile:', e);
                                      }
                                      
                                      // 2. Check each platform's session in detail
                                      console.log('\n📋 Detailed Session Check:');
                                      for (const [platform, config] of Object.entries(llmConfigs)) {
                                        if (!config.enabled) continue;
                                        
                                        console.log(`\n🔍 Checking ${platform}...`);
                                        
                                        try {
                                          // Check session with debug flag
                                          const response = await fetch(`${API_BASE_URL}/llm/sessions/check-single`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                              platform: platform,
                                              enabled: false,
                                              debug: true,
                                              verbose: true  // Request verbose output
                                            })
                                          });
                                          
                                          if (response.ok) {
                                            const data = await response.json();
                                            console.log(`${platform} session details:`, data);
                                            
                                            // Compare with frontend state
                                            console.log(`Frontend state: sessionValid=${config.sessionValid}`);
                                            console.log(`Backend state: sessionValid=${data.valid}`);
                                            
                                            if (config.sessionValid !== data.valid) {
                                              console.warn(`⚠️ State mismatch for ${platform}!`);
                                            }
                                          } else {
                                            const errorText = await response.text();
                                            console.error(`Failed to check ${platform}:`, errorText);
                                          }
                                          
                                          // Also check the actual cookies
                                          const cookieResponse = await fetch(`${API_BASE_URL}/llm/debug/cookies/${platform}`, {
                                            method: 'GET'
                                          });
                                          
                                          if (cookieResponse.ok) {
                                            const cookieData = await cookieResponse.json();
                                            console.log(`${platform} cookies:`, cookieData);
                                          }
                                          
                                        } catch (e) {
                                          console.error(`Error checking ${platform}:`, e);
                                        }
                                      }
                                      
                                      console.log('\n=====================================');
                                      console.log('✅ Debug check complete. Check console for details.');
                                    }}
                                    disabled={!backendConnected}
                                  >
                                    Debug Sessions
                                  </Button>
                                </div>
                                
                                <Alert className="bg-yellow-100 border-yellow-200">
                                  <AlertCircle className="h-4 w-4 text-yellow-800" />
                                  <AlertDescription className="text-yellow-800">
                                    <strong>Session Sync Issues?</strong><br />
                                    1. Close ALL Firefox windows<br />
                                    2. Click "Check Profile" button<br />
                                    3. Re-login to each platform<br />
                                    4. Wait for "Session active" before syncing<br />
                                    <br />
                                    <strong>Still not working?</strong><br />
                                    Try manual Firefox profile reset:<br />
                                    <code className="bg-yellow-200 px-1 rounded">rm -rf ~/.mozilla/firefox/*.llm-collector</code>
                                  </AlertDescription>
                                </Alert>
                                
                                {/* Manual Session Update */}
                                <div className="p-4 bg-green-50 rounded-lg space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                      <Label className="text-base">Manual Session Update</Label>
                                      <p className="text-sm text-gray-600">
                                        If login was successful but session not detected
                                      </p>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={async () => {
                                        console.log('🔧 Manually updating sessions...');
                                        
                                        // Get enabled platforms
                                        const enabledPlatforms = Object.entries(llmConfigs)
                                          .filter(([_, config]) => config.enabled)
                                          .map(([key]) => key);
                                        
                                        for (const platform of enabledPlatforms) {
                                          console.log(`📝 Updating ${platform} session...`);
                                          
                                          try {
                                            const response = await fetch(`${API_BASE_URL}/llm/sessions/update`, {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                platform: platform,
                                                valid: true
                                              })
                                            });
                                            
                                            if (response.ok) {
                                              const result = await response.json();
                                              console.log(`✅ ${platform} session updated:`, result);
                                            } else {
                                              console.error(`❌ Failed to update ${platform} session`);
                                            }
                                          } catch (error) {
                                            console.error(`❌ Error updating ${platform}:`, error);
                                          }
                                        }
                                        
                                        // Refresh session status
                                        setTimeout(() => {
                                          checkSessionStatus(true);
                                        }, 1000);
                                        
                                        setSuccessMessageText('Sessions manually updated');
                                        setShowSuccessMessage(true);
                                        setTimeout(() => setShowSuccessMessage(false), 5000);
                                      }}
                                      disabled={!backendConnected || isCheckingSessions}
                                    >
                                      Force Update Sessions
                                    </Button>
                                  </div>
                                  
                                  <Alert className="bg-green-100 border-green-200">
                                    <AlertCircle className="h-4 w-4 text-green-800" />
                                    <AlertDescription className="text-green-800">
                                      <strong>Use this if:</strong><br />
                                      1. You logged in successfully<br />
                                      2. But session shows as "Login required"<br />
                                      3. Extension may not be working properly
                                    </AlertDescription>
                                  </Alert>
                                </div>
                              </div>

                              {/* Firefox Visibility Toggle */}
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
                                    onCheckedChange={(checked) => setSyncSettings(prev => ({ ...prev, firefoxVisible: checked }))}
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
                                      onChange={(e) => setSyncSettings(prev => ({ ...prev, startTime: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <select 
                                      className="w-full px-3 py-2 border border-gray-200 rounded-md"
                                      value={syncSettings.interval}
                                      onChange={(e) => setSyncSettings(prev => ({ ...prev, interval: e.target.value }))}
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
                                  onChange={(e) => setSyncSettings(prev => ({ ...prev, maxConversations: parseInt(e.target.value) || 20 }))}
                                  className="mt-1" 
                                />
                              </div>
                              
                              <div>
                                <label className="text-sm font-medium">Random Delay (seconds)</label>
                                <Input 
                                  type="number" 
                                  value={syncSettings.randomDelay}
                                  onChange={(e) => setSyncSettings(prev => ({ ...prev, randomDelay: parseInt(e.target.value) || 5 }))}
                                  min="2" 
                                  max="30" 
                                  className="mt-1" 
                                />
                              </div>
                              
                              <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                  All settings are automatically saved when changed. No need to click save buttons!
                                  <br />
                                  <button
                                    className="text-blue-600 underline text-sm mt-2"
                                    onClick={() => {
                                      if (window.confirm('Reset all settings to default?\n\nThis will clear all saved configurations.')) {
                                        localStorage.removeItem('llmConfigs');
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
                          onClick={handleCleanData}
                          disabled={isRunning || isCheckingSessions || !backendConnected}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Clean All Data
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="web" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Web Crawler</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-500">Coming soon...</p>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="api" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>API/Database</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-500">Coming soon...</p>
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
                    value={Object.values(llmConfigs).reduce((sum, c) => sum + (c.todayCount || 0) + (c.yesterdayCount || 0) + (c.dayBeforeCount || 0), 0).toString()}
                    change={`+${dailyTotals.today}`}
                    trend="up"
                  />
                  <StatCard
                    title="Active Platforms"
                    value={Object.values(llmConfigs).filter(c => c.enabled).length.toString()}
                    change="+0"
                    trend="up"
                  />
                  <StatCard
                    title="Today's Sync"
                    value={dailyTotals.today.toString()}
                    change={dailyTotals.today > dailyTotals.yesterday ? `+${dailyTotals.today - dailyTotals.yesterday}` : `${dailyTotals.today - dailyTotals.yesterday}`}
                    trend={dailyTotals.today >= dailyTotals.yesterday ? "up" : "down"}
                  />
                </div>
              </Section>

              <Section title="Active Sources">
                <div className="space-y-3">
                  {Object.entries(llmConfigs)
                    .filter(([_, config]) => config.enabled)
                    .map(([key, config]) => (
                      <LLMStats
                        key={key}
                        platform={config.name}
                        config={config}
                      />
                    ))}
                  {Object.values(llmConfigs).filter(c => c.enabled).length === 0 && (
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
                      {Object.entries(llmConfigs)
                        .filter(([_, config]) => config.lastSync)
                        .sort(([, a], [, b]) => new Date(b.lastSync!).getTime() - new Date(a.lastSync!).getTime())
                        .slice(0, 5)
                        .map(([key, config]) => (
                          <ActivityItem
                            key={key}
                            time={formatDate(config.lastSync)}
                            action="Sync completed"
                            source={config.name}
                            count={`${config.todayCount || 0} conversations`}
                            type="success"
                          />
                        ))}
                      {Object.values(llmConfigs).filter(c => c.lastSync).length === 0 && (
                        <div className="text-center text-gray-500 py-4">
                          <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm">No activity yet</p>
                        </div>
                      )}
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
                        className="w-6 h-6 rounded text-white bg-gray-700 flex items-center justify-center text-xs font-bold"
                      >
                        {llmConfigs[platform]?.icon || '?'}
                      </div>
                      {llmConfigs[platform]?.name || platform}
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

function LLMStats({ platform, config }: LLMStatsProps) {
  const getStatusIcon = () => {
    if (config.status === 'syncing') return <RefreshCw className="h-3 w-3 text-gray-500 animate-spin" />;
    if (config.sessionValid) return <CheckCircle className="h-3 w-3 text-gray-500" />;
    return <AlertCircle className="h-3 w-3 text-gray-500" />;
  };
  
  const getSessionStatus = () => {
    if (config.sessionValid && config.sessionExpiresAt) {
      const expiry = getSessionExpiryDisplay(config.sessionExpiresAt);
      return expiry ? `Active (${expiry})` : 'Active';
    }
    return 'Expired';
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
  const isPositive = trend === "up";
  
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-gray-600">{title}</p>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-2xl font-bold">{value}</span>
          <span className={`text-sm text-gray-600`}>
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
      case 'success': return <CheckCircle className="h-3 w-3 text-gray-600" />;
      case 'error': return <AlertCircle className="h-3 w-3 text-gray-600" />;
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