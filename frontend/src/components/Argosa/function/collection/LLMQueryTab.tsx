/**
 * LLMQueryTab.tsx
 * 
 * LLM Query 탭 UI
 * DataCollection.tsx에서 필요한 props 전달받아 사용
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare,
  Loader2,
  RefreshCw,
  TrendingUp
} from "lucide-react";

import type { SystemState } from "../DataCollection";
import { formatDate } from "../DataCollection";

// ======================== Type Definitions ========================

interface LLMQueryTabProps {
  isBackendConnected: boolean;
  systemState: SystemState;
  stats: any;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
  apiBaseUrl: string;
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
  
  // Query States
  const [llmQuery, setLlmQuery] = useState('');
  const [queryType, setQueryType] = useState('question');
  const [llmProvider, setLlmProvider] = useState('lm_studio');
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [isQuerying, setIsQuerying] = useState(false);
  const [llmResponse, setLlmResponse] = useState<any>(null);
  
  // Analysis States
  const [analysisType, setAnalysisType] = useState('pattern');
  const [analysisQuestions, setAnalysisQuestions] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  
  // Statistics States
  const [providerStats, setProviderStats] = useState<any>({});
  const [queryHistory, setQueryHistory] = useState<any[]>([]);
  
  // ==================== API Functions ====================
  
  const executeLLMQuery = async () => {
    if (!llmQuery.trim() || isQuerying) return;
    
    setIsQuerying(true);
    setLlmResponse(null);
    
    try {
      const response = await fetch(`${apiBaseUrl}/llm/query/process`, {
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
      onError(`Query failed: ${error.message}`);
    } finally {
      setIsQuerying(false);
    }
  };
  
  const analyzeConversations = async () => {
    setIsAnalyzing(true);
    setAnalysisResults(null);
    
    try {
      // Get all conversations from stats
      const conversationsResponse = await fetch(`${apiBaseUrl}/llm/conversations/stats`);
      if (!conversationsResponse.ok) throw new Error('Failed to load conversations');
      
      const statsData = await conversationsResponse.json();
      
      // Prepare questions
      const questions = analysisQuestions.split('\n').filter(q => q.trim());
      
      const response = await fetch(`${apiBaseUrl}/llm/query/analyze`, {
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
      onError(`Analysis failed: ${error.message}`);
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
      
      const response = await fetch(`${apiBaseUrl}/llm/conversations/files`);
      if (response.ok) {
        const data = await response.json();
        data.files.forEach((f: any) => {
          platformData[f.platform] = f.files || [];
        });
      }
      
      const compareResponse = await fetch(`${apiBaseUrl}/llm/query/compare/platforms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(platformData)
      });
      
      if (compareResponse.ok) {
        const result = await compareResponse.json();
        setAnalysisResults(result);
      } else {
        throw new Error('Comparison failed');
      }
      
    } catch (error: any) {
      console.error('Comparison error:', error);
      onError(`Comparison failed: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const loadProviderStats = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/llm/query/stats/providers`);
      
      if (response.ok) {
        const data = await response.json();
        setProviderStats(data);
      }
    } catch (error) {
      console.error('Failed to load provider stats:', error);
    }
  }, [apiBaseUrl]);
  
  const loadQueryHistory = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/llm/query/history?limit=20`);
      
      if (response.ok) {
        const data = await response.json();
        setQueryHistory(data);
      }
    } catch (error) {
      console.error('Failed to load query history:', error);
    }
  }, [apiBaseUrl]);
  
  // ==================== Effects ====================
  
  useEffect(() => {
    if (isBackendConnected) {
      loadProviderStats();
      loadQueryHistory();
    }
  }, [isBackendConnected, loadProviderStats, loadQueryHistory]);
  
  // ==================== Render ====================
  
  return (
    <div className="space-y-4">
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
              disabled={!llmQuery.trim() || isQuerying || !isBackendConnected}
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
                disabled={!isBackendConnected || isAnalyzing}
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
                disabled={!isBackendConnected || isAnalyzing}
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
            {Object.entries(providerStats).map(([provider, stats]: [string, any]) => (
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
    </div>
  );
}