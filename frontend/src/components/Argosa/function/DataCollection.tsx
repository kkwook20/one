// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/Argosa/ArgosaSystem.tsx
// Location: frontend/src/components/Argosa/function/DataCollection.tsx

import { useState, useEffect, ReactNode, useCallback } from "react";
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
  Play, 
  Pause, 
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
  Loader2
} from "lucide-react";

// API Configuration
const API_BASE_URL = 'http://localhost:8000/api/argosa/llm';

// Type definitions
interface SectionProps {
  title: string;
  children: ReactNode;
}

// LLMConfig interface with session fields
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
  profileName: string;
  startTime: string;
  interval: string;
  maxConversations: number;
  randomDelay: number;
  dataRetention: number;
}

interface SyncStatus {
  status: string;
  progress: number;
  current_platform: string;
  collected: number;
  message: string;
  updated_at?: string;
}

// LLM Configurations
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
    dayBeforeCount: 0
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
    dayBeforeCount: 0
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
    dayBeforeCount: 0
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
    dayBeforeCount: 0
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
    dayBeforeCount: 0
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
    dayBeforeCount: 0
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
    profileName: 'llm-collector',
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

  // Update daily totals when configs change
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
  const checkBackendConnection = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/argosa/status', {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      if (response.ok) {
        setBackendError(null);
        return true;
      } else {
        setBackendError('Backend server responded with an error');
        return false;
      }
    } catch (error) {
      setBackendError('Cannot connect to backend server. Please ensure it is running on port 8000.');
      return false;
    }
  };

  // Load stats from API
  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/conversations/stats`);
      if (response.ok) {
        const stats = await response.json();
        
        // Update platform counts from API stats
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
            
            // Update last sync from API
            if (stats.latest_sync?.[platform]) {
              updated[platform].lastSync = stats.latest_sync[platform];
            }
          });
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, []);

  // Check for schedule failures
  const checkScheduleFailures = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/schedule/last-failure`);
      if (response.ok) {
        const data = await response.json();
        if (data.failure) {
          setScheduleFailureReason(data.reason);
          // Set flag for ArgosaSystem
          localStorage.setItem('argosa_schedule_failure', data.reason);
        } else {
          setScheduleFailureReason(null);
          localStorage.removeItem('argosa_schedule_failure');
        }
      }
    } catch (error) {
      console.error('Failed to check schedule failures:', error);
    }
  }, []);

  // Check session status with sequential checking
  const checkSessionStatus = useCallback(async (showProgress = false) => {
    if (isCheckingSessions) return;
    
    setIsCheckingSessions(true);
    setSessionCheckError(null);
    let hasAnyInvalidSession = false;
    
    try {
      // Check backend connection first
      const isConnected = await checkBackendConnection();
      if (!isConnected) {
        setSessionCheckError('Cannot connect to backend server');
        setIsCheckingSessions(false);
        return;
      }

      // Get all platforms in order
      const platforms = Object.keys(llmConfigs);
      const updatedConfigs = { ...llmConfigs };
      
      // Check each platform sequentially
      for (let i = 0; i < platforms.length; i++) {
        const platform = platforms[i];
        
        if (showProgress) {
          // Update UI to show which platform is being checked
          setLlmConfigs(prev => ({
            ...prev,
            [platform]: {
              ...prev[platform],
              status: 'syncing' // Temporarily show syncing status
            }
          }));
        }
        
        try {
          const response = await fetch(`${API_BASE_URL}/sessions/check-single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: platform,
              enabled: llmConfigs[platform].enabled
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
            
            // Check if session is invalid and platform is enabled
            if (!sessionData.valid && updatedConfigs[platform].enabled) {
              hasAnyInvalidSession = true;
            }
            
            setLlmConfigs({ ...updatedConfigs });
          }
        } catch (error) {
          console.error(`Failed to check ${platform} session:`, error);
        }
        
        // Add delay between checks to avoid overwhelming the server
        if (i < platforms.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }
      
      // Update session issue flag
      if (hasAnyInvalidSession) {
        localStorage.setItem('argosa_session_issue', 'true');
      } else {
        localStorage.removeItem('argosa_session_issue');
      }
      
    } catch (error) {
      console.error('Failed to check sessions:', error);
      setSessionCheckError('Failed to check sessions. Please check backend connection.');
    } finally {
      setIsCheckingSessions(false);
    }
  }, [llmConfigs]);

  // Open platform login
  const handleOpenLogin = async (platform: string) => {
    const config = llmConfigs[platform];
    if (!config || openingLoginPlatform) return;
    
    setOpeningLoginPlatform(platform);
    
    // Update platform status to opening
    setLlmConfigs(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        status: 'opening'
      }
    }));
    
    try {
      const response = await fetch(`${API_BASE_URL}/sessions/open-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platform,
          url: config.url,
          profileName: syncSettings.profileName
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(
          `✅ Opening ${config.name} login page in Firefox...\n\n` +
          `${result.details || 'Please log in and then click "Check Session" to verify.'}`
        );
        
        // Reset status after a delay
        setTimeout(() => {
          setLlmConfigs(prev => ({
            ...prev,
            [platform]: {
              ...prev[platform],
              status: 'disconnected'
            }
          }));
          // Check session after 10 seconds
          checkSessionStatus();
        }, 10000);
      } else {
        // Show detailed error message
        alert(
          `❌ Failed to open ${config.name} login page\n\n` +
          `Error: ${result.error}\n` +
          `${result.details || ''}`
        );
        
        // Reset status
        setLlmConfigs(prev => ({
          ...prev,
          [platform]: {
            ...prev[platform],
            status: 'disconnected'
          }
        }));
      }
    } catch (error) {
      console.error('Failed to open login page:', error);
      
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please check if backend is running.';
        } else {
          errorMessage = error.message;
        }
      }
      
      alert(
        `❌ Failed to open login page\n\n` +
        `Error: ${errorMessage}\n\n` +
        `Please ensure:\n` +
        `1. Backend server is running on port 8000\n` +
        `2. Firefox is installed\n` +
        `3. Firefox profile "${syncSettings.profileName}" exists`
      );
      
      // Reset status
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

  // Check sync status with timeout
  const checkSyncStatus = useCallback(async () => {
    if (!currentSyncId || !isRunning) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/sync/status/${currentSyncId}`);
      if (response.ok) {
        const status = await response.json();
        setSyncStatus(status);
        
        // Timeout check (5 minutes)
        if (status.updated_at) {
          const lastUpdate = new Date(status.updated_at);
          const now = new Date();
          const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
          
          if (diffMinutes > 5) {
            // Cancel after 5 minutes of no updates
            setIsRunning(false);
            setCurrentSyncId(null);
            setSyncStatus(null);
            
            // Reset all platform status
            setLlmConfigs(prev => {
              const updated = { ...prev };
              Object.keys(updated).forEach(key => {
                updated[key].status = 'disconnected';
              });
              return updated;
            });
            
            alert('⚠️ Sync timeout!\n\nNo response from Firefox extension for 5 minutes.\nSync has been cancelled.');
            return;
          }
        }
        
        // Update platform status
        if (status.current_platform) {
          setLlmConfigs(prev => ({
            ...prev,
            [status.current_platform]: {
              ...prev[status.current_platform],
              status: 'syncing'
            }
          }));
        }
        
        // Check if completed, cancelled, or error
        if (status.status === 'completed' || status.status === 'error' || status.status === 'cancelled') {
          setIsRunning(false);
          setCurrentSyncId(null);
          setSyncStatus(null);
          await loadStats();
          
          if (status.status === 'completed') {
            alert(`✅ Sync completed!\n\nCollected ${status.collected} conversations.`);
          } else if (status.status === 'cancelled') {
            alert(`⚠️ Sync was cancelled.`);
          } else {
            alert(`❌ Sync failed: ${status.message}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to check sync status:', error);
    }
  }, [currentSyncId, isRunning, loadStats]);

  // Cancel sync function
  const handleCancelSync = async () => {
    if (!isRunning || !currentSyncId) return;
    
    try {
      // Update sync status to cancelled
      const response = await fetch(`${API_BASE_URL}/sync/cancel/${currentSyncId}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setIsRunning(false);
        setCurrentSyncId(null);
        setSyncStatus(null);
        
        // Reset all platform status
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
      console.error('Failed to cancel sync:', error);
    }
  };

  // Load saved data and stats on mount
  useEffect(() => {
    const savedConfigs = localStorage.getItem('llmConfigs');
    const savedSyncSettings = localStorage.getItem('syncSettings');
    
    if (savedConfigs) {
      setLlmConfigs(JSON.parse(savedConfigs));
    }
    if (savedSyncSettings) {
      setSyncSettings(JSON.parse(savedSyncSettings));
    }
    
    // Check backend connection first
    checkBackendConnection().then(isConnected => {
      if (isConnected) {
        // Load stats from API
        loadStats();
        
        // Check sessions when component mounts (page load)
        setTimeout(() => {
          checkSessionStatus(true);
        }, 1000);
        
        // Check for schedule failures
        checkScheduleFailures();
      }
    });
    
    // Set up periodic refresh for stats only (not sessions)
    const statsInterval = setInterval(() => {
      checkBackendConnection().then(isConnected => {
        if (isConnected) {
          loadStats();
        }
      });
    }, 30000); // Refresh every 30 seconds
    
    const failureInterval = setInterval(checkScheduleFailures, 60000); // Check failures every minute
    
    return () => {
      clearInterval(statsInterval);
      clearInterval(failureInterval);
    };
  }, []); // Remove dependencies to avoid re-running on every update

  // Check sync status periodically when running
  useEffect(() => {
    if (isRunning && currentSyncId) {
      const interval = setInterval(checkSyncStatus, 2000); // Check every 2 seconds
      return () => clearInterval(interval);
    }
  }, [isRunning, currentSyncId, checkSyncStatus]);

  // Save configs when they change
  useEffect(() => {
    localStorage.setItem('llmConfigs', JSON.stringify(llmConfigs));
    updateDailyTotals();
  }, [llmConfigs, updateDailyTotals]);

  // Save sync settings when they change
  useEffect(() => {
    localStorage.setItem('syncSettings', JSON.stringify(syncSettings));
  }, [syncSettings]);

  const handleTogglePlatform = (platform: string) => {
    setLlmConfigs(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        enabled: !prev[platform].enabled
      }
    }));
  };

  const handleSyncNow = async () => {
    if (isRunning) {
      alert('Sync is already in progress. Please wait for it to complete.');
      return;
    }
    
    // Check backend connection first
    const isConnected = await checkBackendConnection();
    if (!isConnected) {
      alert(
        '❌ Cannot connect to backend server\n\n' +
        'Please ensure:\n' +
        '1. Backend server is running (python main.py)\n' +
        '2. It is accessible on http://localhost:8000\n' +
        '3. No firewall is blocking the connection'
      );
      return;
    }
    
    // Check if any enabled platform has invalid session
    const enabledPlatforms = Object.entries(llmConfigs)
      .filter(([_, config]) => config.enabled);
    
    const invalidSessions = enabledPlatforms
      .filter(([_, config]) => !config.sessionValid)
      .map(([key, config]) => config.name);
    
    if (invalidSessions.length > 0) {
      alert(
        `⚠️ Session expired for:\n${invalidSessions.join(', ')}\n\n` +
        `Please log in to these platforms before syncing.`
      );
      return;
    }
    
    setIsRunning(true);
    
    try {
      // Launch Firefox and trigger sync
      const response = await fetch(`${API_BASE_URL}/firefox/launch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          platforms: enabledPlatforms.map(([key, config]) => ({
            platform: key,
            ...config
          })),
          settings: syncSettings,
          debug: debugMode
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setCurrentSyncId(result.sync_id);
        alert(
          '🚀 Firefox launched and sync started!\n\n' +
          'The extension will now collect conversations from all enabled platforms.\n' +
          'This window will show progress updates.'
        );
      } else {
        alert(`Failed to start sync: ${result.error}\n\n${result.details || ''}`);
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('Failed to connect to backend server');
      setIsRunning(false);
    }
  };

  const handleSaveSchedule = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/sync/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
        alert('✅ Schedule saved! Automatic sync is now configured.');
      } else {
        alert(`Failed to save schedule: ${result.error}`);
      }
    } catch (error) {
      alert('Failed to save schedule');
    }
  };

  const handleCleanData = async () => {
    const confirmMsg = `Are you sure you want to delete all collected conversation data?\n\nThis will permanently remove:\n• All conversation files\n• Metadata files\n• Collection history\n\nBackend storage path: ./data/argosa/llm-conversations\n\nThis action cannot be undone!`;
    
    if (!window.confirm(confirmMsg)) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/conversations/clean?days=0`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Reset local stats
        setDailyTotals({ today: 0, yesterday: 0, dayBefore: 0 });
        
        // Update configs to reset counts
        setLlmConfigs(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            updated[key].todayCount = 0;
            updated[key].yesterdayCount = 0;
            updated[key].dayBeforeCount = 0;
          });
          return updated;
        });
        
        alert(`Data cleaned successfully! Deleted ${result.deleted} conversations.`);
      } else {
        alert('Failed to clean data');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert('Error connecting to backend: ' + errorMessage);
    }
  };

  const handleViewFiles = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/conversations/files`);
      
      if (response.ok) {
        const data = await response.json();
        setFilesList(data.files || []);
        setShowFilesModal(true);
      } else {
        // If API endpoint doesn't exist, show sample data
        const sampleFiles = [
          { platform: 'chatgpt', files: ['2025-01-13_conversation_1.json', '2025-01-13_conversation_2.json'] },
          { platform: 'claude', files: ['2025-01-13_conversation_1.json'] },
          { platform: 'gemini', files: [] }
        ];
        setFilesList(sampleFiles);
        setShowFilesModal(true);
      }
    } catch (error) {
      // Show sample data if API fails
      const sampleFiles = [
        { platform: 'chatgpt', files: ['2025-01-13_conversation_1.json', '2025-01-13_conversation_2.json'] },
        { platform: 'claude', files: ['2025-01-13_conversation_1.json'] },
        { platform: 'gemini', files: [] }
      ];
      setFilesList(sampleFiles);
      setShowFilesModal(true);
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
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
          {/* Backend Connection Error */}
          {backendError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Backend Connection Error:</strong> {backendError}
                <br />
                Please ensure the backend server is running with: <code className="bg-red-100 px-1 rounded">python main.py</code>
              </AlertDescription>
            </Alert>
          )}

          {/* Sync Progress Bar */}
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
            {/* Left Panel - Sources */}
            <div className="lg:col-span-2 space-y-6">
              <Section title="Data Sources">
                <Tabs 
                  defaultValue="llm" 
                  className="w-full"
                  onValueChange={(value) => {
                    if (value === 'llm' && !backendError) {
                      // Check sessions when LLM tab is clicked
                      checkSessionStatus(true);
                    }
                  }}
                >
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="web" disabled={isRunning}>
                      <Globe className="h-4 w-4 mr-2" />
                      Web Crawler
                    </TabsTrigger>
                    <TabsTrigger 
                      value="llm" 
                      className="relative"
                    >
                      <Bot className="h-4 w-4 mr-2" />
                      LLM Models
                      {isRunning && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                        </span>
                      )}
                      {isCheckingSessions && (
                        <RefreshCw className="h-3 w-3 ml-1 animate-spin" />
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
                            The last scheduled sync could not be completed:
                          </p>
                          <div className="bg-white/80 rounded p-3 text-sm text-red-700">
                            {scheduleFailureReason === 'session_expired' && (
                              <>
                                <strong>Session Expired:</strong> One or more platforms require re-login.
                                Please check session status below and log in to the expired platforms.
                              </>
                            )}
                            {scheduleFailureReason === 'smart_scheduling' && (
                              <>
                                <strong>Already Up to Date:</strong> Recent data already exists.
                                The system skipped sync to avoid duplicate data collection.
                              </>
                            )}
                            {scheduleFailureReason && !['session_expired', 'smart_scheduling'].includes(scheduleFailureReason) && (
                              <>
                                <strong>Error:</strong> {scheduleFailureReason}
                              </>
                            )}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setScheduleFailureReason(null);
                                localStorage.removeItem('argosa_schedule_failure');
                              }}
                            >
                              Dismiss
                            </Button>
                            {scheduleFailureReason === 'session_expired' && (
                              <Button
                                size="sm"
                                onClick={() => checkSessionStatus(true)}
                                disabled={isCheckingSessions}
                              >
                                Check Sessions Now
                              </Button>
                            )}
                          </div>
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
                          >
                            <FolderOpen className="h-4 w-4 mr-2" />
                            View Files
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Backend Storage Info */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <Database className="h-5 w-5 text-blue-600 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="font-medium text-blue-900 mb-1">Backend Storage Location</h4>
                              <div className="bg-white rounded p-2 font-mono text-sm text-gray-700 mb-2">
                                ./data/argosa/llm-conversations
                              </div>
                              <p className="text-xs text-blue-700">
                                All collected conversations are automatically stored in platform-specific subfolders:
                              </p>
                              <ul className="text-xs text-blue-600 mt-1 space-y-0.5">
                                <li>• /chatgpt - ChatGPT conversations</li>
                                <li>• /claude - Claude conversations</li>
                                <li>• /gemini - Gemini conversations</li>
                                <li>• /deepseek - DeepSeek conversations</li>
                              </ul>
                            </div>
                          </div>
                        </div>

                        {/* Extension Storage Info */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <Chrome className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="font-medium text-yellow-900 mb-1">Firefox Extension</h4>
                              <p className="text-xs text-yellow-700">
                                The extension runs in Firefox with your saved login sessions.
                                Make sure Firefox is installed with the "llm-collector" profile.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Daily Statistics */}
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="text-sm font-medium mb-3">Collection Statistics</h4>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-gray-900">{dailyTotals.today}</div>
                              <div className="text-xs text-gray-500">Today</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-gray-900">{dailyTotals.yesterday}</div>
                              <div className="text-xs text-gray-500">Yesterday</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-gray-900">{dailyTotals.dayBefore}</div>
                              <div className="text-xs text-gray-500">2 days ago</div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* LLM Platform Configurations */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>LLM Platforms</span>
                          <div className="flex items-center gap-2">
                            {isCheckingSessions && (
                              <span className="text-sm text-blue-600 flex items-center gap-1">
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                Checking sessions...
                              </span>
                            )}
                            {isRunning && !isCheckingSessions && (
                              <div className="flex items-center gap-2 text-sm text-blue-600">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                <span>Syncing...</span>
                              </div>
                            )}
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Session Check Error */}
                        {sessionCheckError && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{sessionCheckError}</AlertDescription>
                          </Alert>
                        )}

                        {/* Session Checking Progress */}
                        {isCheckingSessions && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                            <div className="flex items-center gap-3">
                              <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                              <div className="flex-1">
                                <h4 className="font-medium text-blue-900">Checking Sessions</h4>
                                <p className="text-xs text-blue-700">
                                  Checking login status for all platforms sequentially...
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Firefox Setup Info */}
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                            <div className="flex-1">
                              <h4 className="font-medium text-green-900 mb-1">Quick Setup</h4>
                              <ol className="text-xs text-green-700 space-y-1">
                                <li>1. Firefox profile "llm-collector" is configured</li>
                                <li>2. Extension is installed and connected to backend</li>
                                <li>3. Login to each platform once in Firefox</li>
                                <li>4. Session status is checked when you open this tab</li>
                                <li>5. Click "Sync All Enabled" to collect conversations</li>
                              </ol>
                            </div>
                          </div>
                        </div>

                        {/* Session Status Info */}
                        {Object.values(llmConfigs).some(c => c.enabled && !c.sessionValid) && !isCheckingSessions && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                              <div className="flex-1">
                                <h4 className="font-medium text-yellow-900 mb-1">Session Required</h4>
                                <p className="text-xs text-yellow-700">
                                  Some platforms require login. Click the "Login" button next to each platform
                                  to open the login page in Firefox. After logging in, click the LLM Models tab
                                  again to refresh session status.
                                </p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => checkSessionStatus(true)}
                                  disabled={isCheckingSessions}
                                >
                                  <RefreshCw className={`h-3 w-3 mr-1 ${isCheckingSessions ? 'animate-spin' : ''}`} />
                                  {isCheckingSessions ? 'Checking...' : 'Check All Sessions'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {Object.entries(llmConfigs).map(([key, config]) => (
                          <div 
                            key={key} 
                            className={`rounded-lg p-4 space-y-3 transition-all duration-300 ${
                              isCheckingSessions && config.status === 'syncing' 
                                ? 'ring-2 ring-blue-400 bg-blue-50' 
                                : config.status === 'opening'
                                ? 'ring-2 ring-yellow-400 bg-yellow-50'
                                : 'bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${
                                  isCheckingSessions && config.status === 'syncing'
                                    ? 'bg-blue-200 text-blue-700'
                                    : config.status === 'opening'
                                    ? 'bg-yellow-200 text-yellow-700'
                                    : 'bg-gray-200 text-gray-700'
                                }`}>
                                  {config.icon}
                                </div>
                                <div>
                                  <h4 className="font-medium">{config.name}</h4>
                                  <p className="text-xs text-gray-500">{config.url}</p>
                                  <p className="text-xs text-gray-400 mt-1">
                                    Today: {config.todayCount || 0} | Yesterday: {config.yesterdayCount || 0} | 2 days ago: {config.dayBeforeCount || 0}
                                  </p>
                                  {/* Session Status */}
                                  <div className="flex items-center gap-2 mt-1">
                                    {isCheckingSessions && config.status === 'syncing' ? (
                                      <span className="text-xs text-blue-600 flex items-center gap-1">
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                        Checking session...
                                      </span>
                                    ) : config.status === 'opening' ? (
                                      <span className="text-xs text-yellow-600 flex items-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Opening login page...
                                      </span>
                                    ) : config.sessionValid ? (
                                      <span className="text-xs text-green-600 flex items-center gap-1">
                                        <Unlock className="h-3 w-3" />
                                        Session active
                                      </span>
                                    ) : (
                                      <span className="text-xs text-red-600 flex items-center gap-1">
                                        <Lock className="h-3 w-3" />
                                        Session expired
                                      </span>
                                    )}
                                    {config.sessionExpiresAt && !isCheckingSessions && config.status !== 'opening' && (
                                      <span className="text-xs text-gray-400">
                                        (expires {new Date(config.sessionExpiresAt).toLocaleDateString()})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={
                                  config.status === 'connected' ? 'default' : 
                                  config.status === 'syncing' ? 'outline' : 
                                  config.status === 'opening' ? 'secondary' :
                                  'secondary'
                                }>
                                  {config.status === 'syncing' && isCheckingSessions ? 'checking...' : 
                                   config.status === 'opening' ? 'opening...' : 
                                   config.status}
                                </Badge>
                                {!config.sessionValid && config.enabled && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenLogin(key)}
                                    disabled={isRunning || isCheckingSessions || openingLoginPlatform !== null}
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
                            disabled={(!isRunning && Object.values(llmConfigs).filter(c => c.enabled).length === 0) || isCheckingSessions || !!backendError}
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
                                <label className="text-sm font-medium">Firefox Profile</label>
                                <Input 
                                  type="text" 
                                  value={syncSettings.profileName}
                                  onChange={(e) => setSyncSettings(prev => ({ ...prev, profileName: e.target.value }))}
                                  placeholder="Profile name"
                                  className="mt-1" 
                                />
                                <p className="text-xs text-gray-500 mt-1">Firefox profile name with saved logins</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium">Sync Schedule</label>
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                  <div>
                                    <label className="text-xs text-gray-500">Start Time</label>
                                    <Input 
                                      type="time" 
                                      value={syncSettings.startTime}
                                      onChange={(e) => setSyncSettings(prev => ({ ...prev, startTime: e.target.value }))}
                                      className="mt-1" 
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Daily sync start time</p>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-500">Interval</label>
                                    <select 
                                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-md"
                                      value={syncSettings.interval}
                                      onChange={(e) => setSyncSettings(prev => ({ ...prev, interval: e.target.value }))}
                                    >
                                      <option value="daily">Daily (Recommended)</option>
                                      <option value="12h">Every 12 hours</option>
                                      <option value="6h">Every 6 hours</option>
                                      <option value="manual">Manual only</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <label className="text-sm font-medium">Max Conversations per Sync</label>
                                <Input 
                                  type="number" 
                                  value={syncSettings.maxConversations}
                                  onChange={(e) => setSyncSettings(prev => ({ ...prev, maxConversations: parseInt(e.target.value) || 20 }))}
                                  className="mt-1" 
                                />
                                <p className="text-xs text-gray-500 mt-1">Limit to avoid detection</p>
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
                                <p className="text-xs text-gray-500 mt-1">Delay between actions for human-like behavior</p>
                              </div>
                              <div className="flex items-center justify-between">
                                <div>
                                  <label className="text-sm font-medium">Debug Mode</label>
                                  <p className="text-xs text-gray-500 mt-1">Show Firefox window during sync</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Switch
                                    id="debug-mode"
                                    checked={debugMode}
                                    onCheckedChange={setDebugMode}
                                    disabled={isRunning}
                                  />
                                  <Label htmlFor="debug-mode" className="text-sm">
                                    {debugMode ? 'Visible' : 'Hidden'}
                                  </Label>
                                </div>
                              </div>
                              <div>
                                <label className="text-sm font-medium">Data Retention (days)</label>
                                <Input 
                                  type="number" 
                                  value={syncSettings.dataRetention}
                                  onChange={(e) => setSyncSettings(prev => ({ ...prev, dataRetention: parseInt(e.target.value) || 30 }))}
                                  min="1" 
                                  max="365" 
                                  className="mt-1" 
                                />
                                <p className="text-xs text-gray-500 mt-1">Automatically delete data older than this</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3">
                                <h5 className="text-xs font-medium text-gray-700 mb-1">How it works:</h5>
                                <ul className="text-xs text-gray-600 mt-1 space-y-0.5">
                                  <li>• Backend launches Firefox with the specified profile</li>
                                  <li>• Extension reads sync configuration from backend</li>
                                  <li>• Visits each enabled platform and collects conversations</li>
                                  <li>• Saves data to backend storage via API</li>
                                  <li>• Updates progress in real-time</li>
                                </ul>
                                {syncSettings.interval !== 'manual' && (
                                  <div className="mt-3 pt-3 border-t">
                                    <p className="text-xs text-gray-700">
                                      <Timer className="h-3 w-3 inline mr-1" />
                                      Automatic sync: {syncSettings.startTime} 
                                      {syncSettings.interval !== 'daily' && ` (${syncSettings.interval})`}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="pt-2 space-y-2">
                                <Button 
                                  variant="secondary" 
                                  className="w-full"
                                  onClick={() => {
                                    localStorage.setItem('syncSettings', JSON.stringify(syncSettings));
                                    alert('Settings saved locally!');
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
                                    disabled={!!backendError}
                                  >
                                    <Clock className="h-4 w-4 mr-2" />
                                    Configure Auto Schedule
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {/* Cleanup */}
                        <div className="flex gap-2 pt-2">
                          <Button 
                            variant="destructive" 
                            className="w-full"
                            onClick={handleCleanData}
                            disabled={isRunning || isCheckingSessions || !!backendError}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Clean All Data
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="web" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Web Crawler Configuration</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-500">Web crawler functionality for other sources...</p>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="api" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>API/Database Connection</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-500">API and database connection settings...</p>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </Section>
            </div>

            {/* Right Panel - Stats & Monitoring */}
            <div className="space-y-6">
              <Section title="Collection Statistics">
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
                    change={`+${dailyTotals.today}`}
                    trend="up"
                  />
                </div>
              </Section>

              <Section title="Connected LLM Sources">
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
                Collected Conversation Files
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
                  <p>No conversation files found</p>
                </div>
              ) : (
                filesList.map(({ platform, files }) => (
                  <div key={platform} className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold">
                        {llmConfigs[platform]?.icon || platform[0].toUpperCase()}
                      </div>
                      {llmConfigs[platform]?.name || platform}
                      <Badge variant="secondary">{files.length} files</Badge>
                    </h4>
                    {files.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No files collected yet</p>
                    ) : (
                      <div className="space-y-1">
                        {files.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800">
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
                  <strong>Storage Path:</strong> <code className="bg-gray-200 px-1 rounded">./data/argosa/llm-conversations</code>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Files are stored in JSON format and contain conversation history, timestamps, and metadata.
                </p>
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    alert('To access files directly, navigate to:\n./data/argosa/llm-conversations');
                  }}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Open in Explorer
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowFilesModal(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Components --------------------------- */

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
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gray-400" />
            <span className="font-medium text-sm">{platform}</span>
          </div>
          <div className="flex items-center gap-1">
            {config.status === 'connected' && <CheckCircle className="h-3 w-3 text-green-500" />}
            {config.status === 'syncing' && <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />}
            {config.status === 'error' && <AlertCircle className="h-3 w-3 text-red-500" />}
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500">Today</span>
            <span className="font-medium">{config.todayCount || 0} conversations</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500">Yesterday</span>
            <span className="font-medium">{config.yesterdayCount || 0} conversations</span>
          </div>
        </div>
        
        {(config.todayCount ?? 0) > 0 && (
          <div className="mt-2 pt-2 border-t flex items-center justify-between">
            <span className="text-xs text-gray-500">Change</span>
            <span className="text-xs font-medium flex items-center gap-1 text-green-600">
              +{(config.todayCount ?? 0) - (config.yesterdayCount ?? 0)}
              <TrendingUp className="h-3 w-3" />
            </span>
          </div>
        )}
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
      <span className="text-xs text-gray-500 w-32 flex-shrink-0">{time}</span>
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