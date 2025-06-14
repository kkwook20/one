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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  Chrome,
  Timer,
  Lock,
  Unlock,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
  Calendar
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
}

interface SyncStatus {
  status: string;
  progress: number;
  current_platform?: string;
  collected: number;
  message: string;
  updated_at?: string;
}

// Platform configurations with colors
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
    enabled: false,
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
    enabled: false,
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

export default function DataCollection() {
  const [isRunning, setIsRunning] = useState(false);
  const [llmConfigs, setLlmConfigs] = useState(INITIAL_LLM_CONFIGS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [filesList, setFilesList] = useState<FileListItem[]>([]);
  const [debugMode, setDebugMode] = useState(true);
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
    dataRetention: 30
  });
  const [currentSyncId, setCurrentSyncId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [scheduleFailureReason, setScheduleFailureReason] = useState<string | null>(null);
  const [isCheckingSessions, setIsCheckingSessions] = useState(false);
  const [openingLoginPlatform, setOpeningLoginPlatform] = useState<string | null>(null);
  const [sessionCheckError, setSessionCheckError] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  
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

  // Calculate session expiry display
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
    } else {
      return `${hours}h`;
    }
  };

  // Check backend connection
  const checkBackendConnection = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${API_BASE_URL}/status`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
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
        const stats = await response.json();
        
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const dayBefore = new Date(Date.now() - 172800000).toISOString().split('T')[0];
        
        setLlmConfigs(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(platform => {
            const platformStats = stats.daily_stats?.[platform] || {};
            updated[platform].todayCount = platformStats[today] || 0;
            updated[platform].yesterdayCount = platformStats[yesterday] || 0;
            updated[platform].dayBeforeCount = platformStats[dayBefore] || 0;
            
            if (stats.latest_sync?.[platform]) {
              updated[platform].lastSync = stats.latest_sync[platform];
            }
          });
          return updated;
        });
      }
    } catch (error) {
      // Silently fail
    }
  }, [backendConnected]);

  // Check schedule failures
  const checkScheduleFailures = useCallback(async () => {
    if (!backendConnected) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/schedule/last-failure`);
      if (response.ok) {
        const data = await response.json();
        
        if (data.failure) {
          setScheduleFailureReason(data.reason);
          localStorage.setItem('argosa_schedule_failure', data.reason);
        } else {
          setScheduleFailureReason(null);
          localStorage.removeItem('argosa_schedule_failure');
        }
      }
    } catch (error) {
      // Silently fail
    }
  }, [backendConnected]);

  // Check session status
  const checkSessionStatus = useCallback(async (showProgress = false) => {
    if (isCheckingSessions || !backendConnected) return;
    
    setIsCheckingSessions(true);
    setSessionCheckError(null);
    let hasAnyInvalidSession = false;
    
    try {
      const platforms = Object.keys(llmConfigs);
      const updatedConfigs = { ...llmConfigs };
      
      for (let i = 0; i < platforms.length; i++) {
        const platform = platforms[i];
        
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
          const response = await fetch(`${API_BASE_URL}/llm/sessions/check-single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: platform,
              enabled: updatedConfigs[platform].enabled
            })
          });
          
          if (response.ok) {
            const sessionData = await response.json();
            
            updatedConfigs[platform] = {
              ...updatedConfigs[platform],
              sessionValid: sessionData.valid,
              sessionLastChecked: sessionData.lastChecked,
              sessionExpiresAt: sessionData.expiresAt,
              status: 'disconnected'
            };
            
            if (!sessionData.valid && updatedConfigs[platform].enabled) {
              hasAnyInvalidSession = true;
            }
            
            setLlmConfigs({ ...updatedConfigs });
          }
        } catch (error) {
          // Silently fail for individual platform
        }
        
        if (i < platforms.length - 1 && showProgress) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
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

  // Open login page for specific platform
  const handleOpenLogin = async (platform: string) => {
    const config = llmConfigs[platform];
    if (!config || openingLoginPlatform || !backendConnected) return;
    
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
      
      const result = await response.json();
      
      if (result.success) {
        // Start monitoring session updates
        if (sessionUpdateIntervalRef.current) {
          clearInterval(sessionUpdateIntervalRef.current);
        }
        
        let checkCount = 0;
        sessionUpdateIntervalRef.current = setInterval(async () => {
          checkCount++;
          
          // Check session status for this platform
          const response = await fetch(`${API_BASE_URL}/llm/sessions/check-single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: platform,
              enabled: false // Don't trigger re-check
            })
          });
          
          if (response.ok) {
            const sessionData = await response.json();
            
            if (sessionData.valid) {
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
              
              // Clear interval
              if (sessionUpdateIntervalRef.current) {
                clearInterval(sessionUpdateIntervalRef.current);
                sessionUpdateIntervalRef.current = null;
              }
              
              // Remove session issue flag if all enabled platforms are valid
              setTimeout(() => checkSessionStatus(), 1000);
            }
          }
          
          // Stop after 2 minutes
          if (checkCount > 24) {
            if (sessionUpdateIntervalRef.current) {
              clearInterval(sessionUpdateIntervalRef.current);
              sessionUpdateIntervalRef.current = null;
            }
            
            setLlmConfigs(prev => ({
              ...prev,
              [platform]: {
                ...prev[platform],
                status: 'disconnected'
              }
            }));
          }
        }, 5000); // Check every 5 seconds
        
      } else {
        alert(
          `❌ Failed to open ${config.name} login page\n\n` +
          `Error: ${result.error}\n` +
          `${result.details || ''}\n\n` +
          `Troubleshooting:\n` +
          `1. Make sure Firefox is installed\n` +
          `2. Create Firefox profile: firefox -P\n` +
          `3. Name the profile: "llm-collector"`
        );
        
        setLlmConfigs(prev => ({
          ...prev,
          [platform]: {
            ...prev[platform],
            status: 'disconnected'
          }
        }));
      }
    } catch (error) {
      alert(`❌ Failed to open login page\n\nError: ${error}`);
      
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
        const status = await response.json();
        setSyncStatus(status);
        
        // Update platform status
        if (status.current_platform) {
          setLlmConfigs(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(key => {
              updated[key].status = key === status.current_platform ? 'syncing' : 'disconnected';
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
              updated[key].status = 'disconnected';
            });
            return updated;
          });
          
          // Reload stats
          await loadStats();
          
          // Show appropriate message
          if (status.status === 'completed') {
            alert(`✅ Sync completed!\n\nCollected ${status.collected} conversations.`);
          } else if (status.status === 'cancelled') {
            alert(`⚠️ Sync was cancelled.`);
          } else if (status.error === 'session_expired') {
            alert(`❌ Sync failed: Session expired\n\nPlease log in and try again.`);
            checkSessionStatus();
          } else {
            alert(`❌ Sync failed: ${status.message}`);
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
            updated[key].status = 'disconnected';
          });
          return updated;
        });
        
        alert('✅ Sync cancelled successfully');
      }
    } catch (error) {
      // Silently fail
    }
  };

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      // Load saved settings
      const savedConfigs = localStorage.getItem('llmConfigs');
      const savedSyncSettings = localStorage.getItem('syncSettings');
      
      if (savedConfigs) {
        try {
          setLlmConfigs(JSON.parse(savedConfigs));
        } catch (e) {
          // Ignore parse errors
        }
      }
      
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

  // Save configs
  useEffect(() => {
    localStorage.setItem('llmConfigs', JSON.stringify(llmConfigs));
    updateDailyTotals();
  }, [llmConfigs, updateDailyTotals]);

  // Save sync settings
  useEffect(() => {
    localStorage.setItem('syncSettings', JSON.stringify(syncSettings));
  }, [syncSettings]);

  // Handle toggle platform
  const handleTogglePlatform = (platform: string) => {
    setLlmConfigs(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        enabled: !prev[platform].enabled
      }
    }));
  };

  // Handle sync now
  const handleSyncNow = async () => {
    if (isRunning) {
      alert('Sync is already in progress.');
      return;
    }
    
    // Check backend
    if (!backendConnected) {
      const isConnected = await checkBackendConnection();
      if (!isConnected) {
        alert(
          '❌ Cannot connect to backend server\n\n' +
          'Please ensure:\n' +
          '1. Backend server is running: python main.py\n' +
          '2. Server is on http://localhost:8000\n' +
          '3. Check firewall settings'
        );
        return;
      }
    }
    
    // Check enabled platforms
    const enabledPlatforms = Object.entries(llmConfigs)
      .filter(([_, config]) => config.enabled);
    
    if (enabledPlatforms.length === 0) {
      alert('Please enable at least one platform.');
      return;
    }
    
    // Check sessions
    const invalidSessions = enabledPlatforms
      .filter(([_, config]) => !config.sessionValid)
      .map(([_, config]) => config.name);
    
    if (invalidSessions.length > 0) {
      alert(
        `⚠️ Session expired for:\n${invalidSessions.join(', ')}\n\n` +
        `Please log in to these platforms first.`
      );
      return;
    }
    
    setIsRunning(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/firefox/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: enabledPlatforms.map(([key, config]) => ({
            platform: key,
            enabled: config.enabled
          })),
          settings: {
            ...syncSettings,
            debug: debugMode
          }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setCurrentSyncId(result.sync_id);
        alert(
          '🚀 Firefox launched!\n\n' +
          'The extension will now collect conversations.\n' +
          'Progress will be shown here.'
        );
      } else {
        if (result.invalidSessions) {
          alert(
            `❌ Invalid sessions:\n${result.invalidSessions.join(', ')}\n\n` +
            `Please log in first.`
          );
          checkSessionStatus();
        } else if (result.reason === 'smart_scheduling') {
          alert('⚠️ ' + result.error);
        } else {
          alert(`Failed: ${result.error}\n\n${result.details || ''}`);
        }
        setIsRunning(false);
      }
    } catch (error) {
      alert('Failed to start sync');
      setIsRunning(false);
    }
  };

  // Handle save schedule
  const handleSaveSchedule = async () => {
    if (!backendConnected) {
      alert('Backend not connected');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/sync/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: syncSettings.interval !== 'manual',
          startTime: syncSettings.startTime,
          interval: syncSettings.interval,
          platforms: Object.entries(llmConfigs)
            .filter(([_, config]) => config.enabled)
            .map(([key]) => key),
          settings: syncSettings
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('✅ Schedule saved!');
      } else {
        alert(`Failed: ${result.error}`);
      }
    } catch (error) {
      alert('Failed to save schedule');
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
      alert('Backend not connected');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/conversations/clean?days=0`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const result = await response.json();
        
        setDailyTotals({ today: 0, yesterday: 0, dayBefore: 0 });
        
        setLlmConfigs(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            updated[key].todayCount = 0;
            updated[key].yesterdayCount = 0;
            updated[key].dayBeforeCount = 0;
          });
          return updated;
        });
        
        alert(`✅ Deleted ${result.deleted} files.`);
      }
    } catch (error) {
      alert('Failed to clean data');
    }
  };

  // Handle view files
  const handleViewFiles = async () => {
    if (!backendConnected) {
      alert('Backend not connected');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/llm/conversations/files`);
      
      if (response.ok) {
        const data = await response.json();
        setFilesList(data.files || []);
        setShowFilesModal(true);
      }
    } catch (error) {
      alert('Failed to load files');
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
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">Backend Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <span className="text-red-600">Backend Disconnected</span>
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

                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <Chrome className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="font-medium text-yellow-900 mb-1">Firefox Extension</h4>
                              <p className="text-xs text-yellow-700">
                                Profile: "llm-collector"
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
                          {isCheckingSessions && (
                            <span className="text-sm text-blue-600 flex items-center gap-1">
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              Checking sessions...
                            </span>
                          )}
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
                        {Object.entries(llmConfigs).map(([key, config]) => (
                          <div 
                            key={key} 
                            className={`rounded-lg p-4 space-y-3 transition-all duration-300 ${
                              isCheckingSessions && config.status === 'syncing' 
                                ? 'ring-2 ring-blue-400 bg-blue-50' 
                                : config.status === 'opening'
                                ? 'ring-2 ring-yellow-400 bg-yellow-50'
                                : config.status === 'syncing' && isRunning
                                ? 'ring-2 ring-green-400 bg-green-50'
                                : 'bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div 
                                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm text-white transition-colors`}
                                  style={{ backgroundColor: config.color }}
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
                                      <span className="text-xs text-blue-600 flex items-center gap-1">
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                        Checking...
                                      </span>
                                    ) : config.status === 'opening' ? (
                                      <span className="text-xs text-yellow-600 flex items-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Opening login page...
                                      </span>
                                    ) : config.status === 'syncing' && isRunning ? (
                                      <span className="text-xs text-green-600 flex items-center gap-1">
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                        Collecting...
                                      </span>
                                    ) : config.sessionValid ? (
                                      <>
                                        <span className="text-xs text-green-600 flex items-center gap-1">
                                          <Unlock className="h-3 w-3" />
                                          Session active
                                        </span>
                                        {config.sessionExpiresAt && (
                                          <span className="text-xs text-green-600 flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {getSessionExpiryDisplay(config.sessionExpiresAt)}
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-xs text-red-600 flex items-center gap-1">
                                        <Lock className="h-3 w-3" />
                                        {config.enabled ? 'Session expired' : 'Not logged in'}
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
                                {!config.sessionValid && config.enabled && (
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

                        {/* Advanced Options */}
                        {showAdvanced && (
                          <Card className="mt-4">
                            <CardContent className="pt-6 space-y-4">
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
                              <div className="flex items-center justify-between">
                                <div>
                                  <label className="text-sm font-medium">Debug Mode</label>
                                  <p className="text-xs text-gray-500">Show Firefox window</p>
                                </div>
                                <Switch
                                  checked={debugMode}
                                  onCheckedChange={setDebugMode}
                                  disabled={isRunning}
                                />
                              </div>
                              <div className="pt-2 space-y-2">
                                <Button 
                                  variant="secondary" 
                                  className="w-full"
                                  onClick={() => {
                                    localStorage.setItem('syncSettings', JSON.stringify(syncSettings));
                                    alert('✅ Settings saved!');
                                  }}
                                >
                                  <Save className="h-4 w-4 mr-2" />
                                  Save Settings
                                </Button>
                                {syncSettings.interval !== 'manual' && (
                                  <Button 
                                    variant="outline" 
                                    className="w-full"
                                    onClick={handleSaveSchedule}
                                    disabled={!backendConnected}
                                  >
                                    <Clock className="h-4 w-4 mr-2" />
                                    Configure Schedule
                                  </Button>
                                )}
                              </div>
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
                <FolderOpen className="h-5 w-5 text-blue-600" />
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
                        style={{ backgroundColor: llmConfigs[platform]?.color || '#888' }}
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
    if (config.status === 'syncing') return <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />;
    if (config.sessionValid) return <CheckCircle className="h-3 w-3 text-green-500" />;
    return <AlertCircle className="h-3 w-3 text-yellow-500" />;
  };
  
  return (
    <Card>
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
          <span className={`text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
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