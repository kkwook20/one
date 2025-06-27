/**
 * WebCrawlerTab.tsx
 * 
 * Web Crawler 탭 UI
 * 모든 state와 함수는 DataCollection.tsx에서 props로 전달받음
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Search,
  Loader2,
  RefreshCw,
  Globe,
  AlertCircle
} from "lucide-react";

import type { SystemState } from "../DataCollection";

// ======================== Type Definitions ========================

interface WebCrawlerTabProps {
  isBackendConnected: boolean;
  systemState: SystemState;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
  apiBaseUrl: string;
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

// ======================== Main Component ========================

export default function WebCrawlerTab({
  isBackendConnected,
  systemState,
  onSuccess,
  onError,
  apiBaseUrl
}: WebCrawlerTabProps) {
  // ==================== State Management ====================
  
  // Search States
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [searchObjective, setSearchObjective] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  
  // Statistics States
  const [apiQuota, setApiQuota] = useState<ApiQuota>({});
  const [siteStats, setSiteStats] = useState<SiteStats>({});
  
  // ==================== API Functions ====================
  
  const executeWebSearch = async () => {
    if (!webSearchQuery.trim() || isSearching) return;
    
    setIsSearching(true);
    setSearchResults(null);
    
    try {
      // API 호출을 위한 context 구성
      const context: any = {
        objective: searchObjective || undefined
      };
      
      const response = await fetch(`${apiBaseUrl}/crawler/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: webSearchQuery,
          context: context,
          timeout: 300 // 5분 타임아웃
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        setSearchResults(result);
        
        // Show success message if quality is good
        if (result.quality_score >= 0.7) {
          onSuccess(`Search completed with ${(result.quality_score * 100).toFixed(0)}% quality`);
        }
      } else {
        const error = await response.json();
        throw new Error(error.detail || 'Search failed');
      }
      
    } catch (error: any) {
      console.error('Search error:', error);
      onError(`Search failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };
  
  const loadApiQuota = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/crawler/quota`);
      
      if (response.ok) {
        const data = await response.json();
        setApiQuota(data);
      }
    } catch (error) {
      console.error('Failed to load API quota:', error);
    }
  }, [apiBaseUrl]);
  
  const loadSiteStats = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/crawler/sites/stats`);
      
      if (response.ok) {
        const data = await response.json();
        setSiteStats(data);
      }
    } catch (error) {
      console.error('Failed to load site stats:', error);
    }
  }, [apiBaseUrl]);
  
  // ==================== Effects ====================
  
  useEffect(() => {
    if (isBackendConnected) {
      loadApiQuota();
      loadSiteStats();
    }
  }, [isBackendConnected, loadApiQuota, loadSiteStats]);
  
  // ==================== Render ====================
  
  return (
    <div className="space-y-4">
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
                  disabled={!webSearchQuery.trim() || isSearching || !isBackendConnected}
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
                        setWebSearchQuery(searchResults.improved_query!);
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
    </div>
  );
}