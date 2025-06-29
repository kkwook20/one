/**
 * WebCrawlerTab.tsx
 * 
 * AI Web Search & Crawler Management UI
 * AI가 데이터 분석 중 자동으로 웹 검색을 수행하고 결과를 수집
 * 다양한 검색 엔진 API를 관리하고 검색 결과를 번역
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Search,
  Loader2,
  Globe,
  AlertCircle,
  Settings,
  Key,
  Save,
  BarChart3,
  Brain,
  Clock,
  TrendingUp
} from "lucide-react";

// ======================== Type Definitions ========================

interface WebCrawlerTabProps {
  isBackendConnected: boolean;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
  apiBaseUrl: string;
}

interface SearchEngine {
  enabled: boolean;
  api_key?: string;
  cse_id?: string;
  client_id?: string;
  client_secret?: string;
}

interface CrawlerSettings {
  search_engines: Record<string, SearchEngine>;
}

// ======================== Main Component ========================

export default function WebCrawlerTab({
  isBackendConnected,
  onSuccess,
  onError,
  apiBaseUrl
}: WebCrawlerTabProps) {
  // ==================== State Management ====================
  
  // Search engine metadata (hardcoded)
  const searchEngineMetadata: Record<string, { name: string; description: string; daily_limit: number; requires_api_key: boolean }> = {
    google: {
      name: "Google Search",
      description: "Google Custom Search API",
      daily_limit: 100,
      requires_api_key: true
    },
    naver: {
      name: "Naver Search",
      description: "Korean search engine",
      daily_limit: 25000,
      requires_api_key: true
    },
    duckduckgo: {
      name: "DuckDuckGo",
      description: "Privacy-focused search (no API key needed)",
      daily_limit: -1,
      requires_api_key: false
    },
    bing: {
      name: "Bing Search",
      description: "Microsoft Bing Search API",
      daily_limit: 1000,
      requires_api_key: true
    },
    serper: {
      name: "Serper.dev",
      description: "Developer-friendly search API",
      daily_limit: 2500,
      requires_api_key: true
    },
    serpapi: {
      name: "SerpApi",
      description: "Google search results API",
      daily_limit: 100,
      requires_api_key: true
    },
    github: {
      name: "GitHub Search",
      description: "Search AI models, datasets, code on GitHub",
      daily_limit: 5000,
      requires_api_key: true
    },
    huggingface: {
      name: "Hugging Face",
      description: "AI models, datasets, and spaces search",
      daily_limit: -1,
      requires_api_key: false
    },
    kaggle: {
      name: "Kaggle Search",
      description: "ML datasets and notebooks search",
      daily_limit: 1000,
      requires_api_key: true
    },
    arxiv: {
      name: "arXiv Search",
      description: "AI/ML research papers search",
      daily_limit: -1,
      requires_api_key: false
    },
    paperswithcode: {
      name: "Papers with Code",
      description: "ML papers with implementation search",
      daily_limit: -1,
      requires_api_key: false
    },
    dockerhub: {
      name: "Docker Hub",
      description: "AI orchestration containers search",
      daily_limit: -1,
      requires_api_key: false
    }
  };
  
  // Settings and Configuration
  const [crawlerSettings, setCrawlerSettings] = useState<CrawlerSettings | null>(null);
  const [editingEngine, setEditingEngine] = useState<string | null>(null);
  const [showApiKeyInput, setShowApiKeyInput] = useState<Record<string, boolean>>({});
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Search Statistics
  const [searchStats, setSearchStats] = useState<{
    total_searches: number;
    searches_by_engine: Record<string, number>;
    searches_today_by_engine: Record<string, number>;
    recent_searches: Array<{
      id: string;
      timestamp: string;
      query: string;
      engine: string;
      results_count: number;
      ai_reasoning: string;
      context: string;
    }>;
  } | null>(null);
  
  // ==================== API Functions ====================
  
  const loadCrawlerSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const response = await fetch(`${apiBaseUrl}/search-engines/settings`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCrawlerSettings(data.settings);
        }
      } else {
        // 백엔드가 재시작되지 않은 경우 기본 설정 사용
        console.warn('Failed to load settings from server, using defaults');
        setCrawlerSettings({
          search_engines: {
            google: { enabled: false, api_key: "", cse_id: "" },
            naver: { enabled: false, client_id: "", client_secret: "" },
            duckduckgo: { enabled: true },
            bing: { enabled: false, api_key: "" },
            serper: { enabled: false, api_key: "" },
            serpapi: { enabled: false, api_key: "" },
            github: { enabled: false, api_key: "" },
            huggingface: { enabled: true },
            kaggle: { enabled: false, api_key: "" },
            arxiv: { enabled: true },
            paperswithcode: { enabled: true },
            dockerhub: { enabled: true }
          }
        });
      }
    } catch (error) {
      console.error('Failed to load crawler settings:', error);
      // 네트워크 에러 시에도 기본 설정 사용
      setCrawlerSettings({
        search_engines: {
          google: { enabled: false, api_key: "", cse_id: "" },
          naver: { enabled: false, client_id: "", client_secret: "" },
          duckduckgo: { enabled: true },
          bing: { enabled: false, api_key: "" },
          serper: { enabled: false, api_key: "" },
          serpapi: { enabled: false, api_key: "" },
          github: { enabled: false, api_key: "" },
          huggingface: { enabled: true },
          kaggle: { enabled: false, api_key: "" },
          arxiv: { enabled: true },
          paperswithcode: { enabled: true },
          dockerhub: { enabled: true }
        }
      });
    } finally {
      setIsLoadingSettings(false);
    }
  }, [apiBaseUrl]);
  
  const saveAllSettings = async () => {
    if (!crawlerSettings) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/search-engines/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crawlerSettings)
      });
      
      if (response.ok) {
        onSuccess('Search engine settings saved successfully');
        await loadCrawlerSettings();
      } else {
        const errorText = await response.text();
        console.error('Save settings failed:', response.status, errorText);
        throw new Error(`Failed to save settings: ${response.status} ${errorText}`);
      }
    } catch (error: any) {
      onError(`Failed to save settings: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  const updateSearchEngineConfig = async (engineId: string, config: Partial<SearchEngine>) => {
    if (!crawlerSettings) return;
    
    // Update local state
    const updatedSettings = {
      ...crawlerSettings,
      search_engines: {
        ...crawlerSettings.search_engines,
        [engineId]: {
          ...crawlerSettings.search_engines[engineId],
          ...config
        }
      }
    };
    
    setCrawlerSettings(updatedSettings);
  };
  
  const toggleSearchEngine = async (engineId: string) => {
    if (!crawlerSettings) return;
    
    const engine = crawlerSettings.search_engines[engineId];
    const metadata = searchEngineMetadata[engineId];
    if (!engine || !metadata) return;
    
    // Check if API key is required and not set
    if (!engine.enabled && metadata.requires_api_key && !engine.api_key) {
      onError(`API key required for ${metadata.name}`);
      setEditingEngine(engineId);
      setShowApiKeyInput({ ...showApiKeyInput, [engineId]: true });
      return;
    }
    
    await updateSearchEngineConfig(engineId, { enabled: !engine.enabled });
  };
  
  const loadSearchStats = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/search-engines/stats`);
      if (response.ok) {
        const data = await response.json();
        setSearchStats(data);
      } else {
        // 백엔드가 재시작되지 않은 경우 빈 통계 사용
        setSearchStats({
          total_searches: 0,
          searches_by_engine: {},
          searches_today_by_engine: {},
          recent_searches: []
        });
      }
    } catch (error) {
      console.error('Failed to load search stats:', error);
      // 에러 시에도 빈 통계 사용
      setSearchStats({
        total_searches: 0,
        searches_by_engine: {},
        searches_today_by_engine: {},
        recent_searches: []
      });
    }
  }, [apiBaseUrl]);
  
  // ==================== Effects ====================
  
  useEffect(() => {
    if (isBackendConnected) {
      loadCrawlerSettings();
      loadSearchStats();
    }
  }, [isBackendConnected, loadCrawlerSettings, loadSearchStats]);
  
  // Auto-refresh search stats
  useEffect(() => {
    if (isBackendConnected) {
      const interval = setInterval(loadSearchStats, 30000); // 30초마다 갱신
      return () => clearInterval(interval);
    }
  }, [isBackendConnected, loadSearchStats]);
  
  // ==================== Render ====================
  
  if (isLoadingSettings && !crawlerSettings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Connection Status Alert */}
      {!isBackendConnected && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Backend not connected. Search engine settings cannot be loaded.
          </AlertDescription>
        </Alert>
      )}

      {/* Search Engines Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Search Engines Configuration
            </span>
            <Button
              size="sm"
              onClick={saveAllSettings}
              disabled={!isBackendConnected || isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Settings
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {crawlerSettings && Object.entries(crawlerSettings.search_engines).map(([engineId, engine]) => {
              const metadata = searchEngineMetadata[engineId];
              if (!metadata) return null;
              
              return (
                <div 
                  key={engineId} 
                  className={`rounded-lg p-4 transition-all duration-300 ${
                    engine.enabled ? 'bg-gray-50' : 'bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center">
                          <Globe className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h4 className="font-medium">{metadata.name}</h4>
                          <p className="text-xs text-gray-500">{metadata.description}</p>
                          {metadata.daily_limit > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                              Daily limit: {metadata.daily_limit} queries
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {metadata.requires_api_key && !engine.api_key && (
                          <Badge variant="outline" className="text-xs">
                            <Key className="h-3 w-3 mr-1" />
                            API Key Required
                          </Badge>
                        )}
                        <Switch
                          checked={engine.enabled}
                          onCheckedChange={() => toggleSearchEngine(engineId)}
                          disabled={!isBackendConnected}
                        />
                      </div>
                    </div>
                    
                    {/* Search Statistics for this engine */}
                    {searchStats && (
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>
                          Today: <strong>{searchStats.searches_today_by_engine[engineId] || 0}</strong> searches
                        </span>
                        <span>
                          Total: <strong>{searchStats.searches_by_engine[engineId] || 0}</strong> searches
                        </span>
                      </div>
                    )}
                    
                    {/* API Key Input */}
                    {(editingEngine === engineId || showApiKeyInput[engineId]) && metadata.requires_api_key && (
                      <div className="space-y-2 pt-2 border-t">
                        <div>
                          <Label className="text-sm">API Key</Label>
                          <Input
                            type="password"
                            placeholder={`Enter ${metadata.name} API key`}
                            defaultValue={engine.api_key}
                            onChange={(e) => {
                              updateSearchEngineConfig(engineId, { api_key: e.target.value });
                            }}
                            className="mt-1"
                          />
                        </div>
                        
                        {engineId === 'google' && (
                          <div>
                            <Label className="text-sm">Custom Search Engine ID</Label>
                            <Input
                              placeholder="Enter Google CSE ID"
                              defaultValue={engine.cse_id}
                              onChange={(e) => {
                                updateSearchEngineConfig(engineId, { cse_id: e.target.value });
                              }}
                              className="mt-1"
                            />
                          </div>
                        )}
                        
                        {engineId === 'naver' && (
                          <>
                            <div>
                              <Label className="text-sm">Client ID</Label>
                              <Input
                                placeholder="Enter Naver Client ID"
                                defaultValue={engine.client_id}
                                onChange={(e) => {
                                  updateSearchEngineConfig(engineId, { client_id: e.target.value });
                                }}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-sm">Client Secret</Label>
                              <Input
                                type="password"
                                placeholder="Enter Naver Client Secret"
                                defaultValue={engine.client_secret}
                                onChange={(e) => {
                                  updateSearchEngineConfig(engineId, { client_secret: e.target.value });
                                }}
                                className="mt-1"
                              />
                            </div>
                          </>
                        )}
                        
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingEngine(null);
                              setShowApiKeyInput({ ...showApiKeyInput, [engineId]: false });
                            }}
                          >
                            Done
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {!showApiKeyInput[engineId] && metadata.requires_api_key && engine.api_key && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingEngine(engineId);
                          setShowApiKeyInput({ ...showApiKeyInput, [engineId]: true });
                        }}
                        className="text-xs"
                      >
                        <Key className="h-3 w-3 mr-1" />
                        Update API Key
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Info Message */}
      <Alert>
        <Search className="h-4 w-4" />
        <AlertDescription>
          These search engines will be used by AI during data analysis to automatically gather relevant information from the web.
          DuckDuckGo is enabled by default and doesn't require an API key.
        </AlertDescription>
      </Alert>

      {/* Search Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            AI Search Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {searchStats ? (
            <div className="space-y-4">
              {/* Total Count */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-6 w-6 text-blue-500" />
                  <div>
                    <p className="text-sm text-gray-600">Total AI Searches</p>
                    <p className="text-2xl font-bold">{searchStats.total_searches}</p>
                  </div>
                </div>
              </div>

              {/* Search by Engine */}
              <div>
                <h4 className="text-sm font-medium mb-3">Searches by Engine</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(searchStats.searches_by_engine).map(([engine, count]) => {
                    const metadata = searchEngineMetadata[engine];
                    return (
                      <div key={engine} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">{metadata?.name || engine}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Searches with AI Reasoning */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Recent AI Searches & Reasoning
                </h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {searchStats.recent_searches.map((search) => (
                    <div key={search.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{search.query}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(search.timestamp).toLocaleString()}
                            </span>
                            <span>{searchEngineMetadata[search.engine]?.name || search.engine}</span>
                            <span>{search.results_count} results</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* AI Reasoning */}
                      <div className="mt-2 p-2 bg-blue-50 rounded">
                        <p className="text-xs font-medium text-blue-900 mb-1">AI Reasoning:</p>
                        <p className="text-xs text-blue-800">{search.ai_reasoning}</p>
                      </div>
                      
                      {/* Context */}
                      {search.context && (
                        <div className="mt-2 text-xs text-gray-600">
                          <span className="font-medium">Context:</span> {search.context}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {searchStats.recent_searches.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No AI searches yet</p>
                      <p className="text-xs">AI will search when analyzing data</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading search statistics...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}