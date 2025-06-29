// frontend/src/components/Argosa/function/collection/YouTubeTab.tsx

import React, { useState, useCallback } from 'react';
import { Search, Play, Download, Loader2, FileText, BarChart, Brain, Video, Clock, Eye, ThumbsUp, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import axios from 'axios';

interface YouTubeSearchResult {
  video_id: string;
  title: string;
  description: string;
  channel_name: string;
  channel_id: string;
  published_at: string;
  duration: string;
  view_count: number;
  like_count: number;
  thumbnail_url: string;
  video_url: string;
}

interface VideoAnalysisResult {
  video_id: string;
  title: string;
  analysis_results: {
    transcript?: {
      text: string;
      segments: Array<{
        start: number;
        end: number;
        text: string;
      }>;
    };
    summary?: {
      summary: string;
      method: string;
    };
    key_points?: string[];
    sentiment?: {
      sentiment: string;
      score: number;
      positive_count: number;
      negative_count: number;
    };
    topics?: string[];
  };
  metadata: any;
  transcript_path?: string;
  processing_time: number;
  analyzed_at: string;
}

export default function YouTubeTab() {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'video' | 'channel' | 'playlist'>('video');
  const [maxResults, setMaxResults] = useState(10);
  const [language, setLanguage] = useState('ko');
  const [orderBy, setOrderBy] = useState('relevance');
  const [duration, setDuration] = useState<string>('all');
  
  // Results state
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeSearchResult | null>(null);
  const [analysisResults, setAnalysisResults] = useState<Record<string, VideoAnalysisResult>>({});
  
  // Analysis options
  const [analysisTypes, setAnalysisTypes] = useState({
    transcript: true,
    summary: true,
    key_points: true,
    sentiment: false,
    topics: false
  });
  const [targetLanguage, setTargetLanguage] = useState('ko');
  const [keepOriginal, setKeepOriginal] = useState(false);
  
  // UI state
  const [isSearching, setIsSearching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('search');
  
  // 검색 실행
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setError('검색어를 입력해주세요');
      return;
    }
    
    setIsSearching(true);
    setError(null);
    
    try {
      const response = await axios.post('/api/argosa/data/youtube/search', {
        query: searchQuery,
        search_type: searchType,
        max_results: maxResults,
        language: language,
        order: orderBy,
        duration: duration === 'all' ? undefined : duration
      });
      
      setSearchResults(response.data);
      if (response.data.length === 0) {
        setError('검색 결과가 없습니다');
      }
    } catch (err: any) {
      console.error('YouTube search error:', err);
      setError(err.response?.data?.detail || 'YouTube 검색 중 오류가 발생했습니다');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchType, maxResults, language, orderBy, duration]);
  
  // 비디오 분석
  const handleAnalyze = useCallback(async (video: YouTubeSearchResult) => {
    setIsAnalyzing(video.video_id);
    setError(null);
    
    try {
      const selectedTypes = Object.entries(analysisTypes)
        .filter(([_, enabled]) => enabled)
        .map(([type, _]) => type);
        
      const response = await axios.post('/api/argosa/data/youtube/analyze', {
        video_id: video.video_id,
        analysis_types: selectedTypes,
        target_language: targetLanguage,
        keep_original: keepOriginal
      });
      
      setAnalysisResults(prev => ({
        ...prev,
        [video.video_id]: response.data
      }));
      
      setActiveTab('analysis');
    } catch (err: any) {
      console.error('Video analysis error:', err);
      setError(err.response?.data?.detail || '비디오 분석 중 오류가 발생했습니다');
    } finally {
      setIsAnalyzing(null);
    }
  }, [analysisTypes, targetLanguage, keepOriginal]);
  
  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };
  
  // 조회수 포맷팅
  const formatCount = (count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };
  
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="search">
            <Search className="w-4 h-4 mr-2" />
            검색
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <Brain className="w-4 h-4 mr-2" />
            분석 결과
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="search" className="space-y-4">
          {/* 검색 폼 */}
          <Card>
            <CardHeader>
              <CardTitle>YouTube 검색</CardTitle>
              <CardDescription>
                YouTube 비디오를 검색하고 내용을 분석합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="검색어를 입력하세요..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <Button 
                  onClick={handleSearch}
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
              
              {/* 검색 옵션 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>검색 유형</Label>
                  <Select value={searchType} onValueChange={(value: any) => setSearchType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">비디오</SelectItem>
                      <SelectItem value="channel">채널</SelectItem>
                      <SelectItem value="playlist">재생목록</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>정렬 기준</Label>
                  <Select value={orderBy} onValueChange={setOrderBy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relevance">관련성</SelectItem>
                      <SelectItem value="date">업로드 날짜</SelectItem>
                      <SelectItem value="viewCount">조회수</SelectItem>
                      <SelectItem value="rating">평점</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>영상 길이</Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger>
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="short">짧음 (4분 이하)</SelectItem>
                      <SelectItem value="medium">중간 (4-20분)</SelectItem>
                      <SelectItem value="long">긴 영상 (20분 이상)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>최대 결과</Label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={maxResults}
                    onChange={(e) => setMaxResults(Number(e.target.value))}
                  />
                </div>
              </div>
              
              {/* 분석 옵션 */}
              <div className="space-y-2">
                <Label>분석 옵션</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="transcript"
                      checked={analysisTypes.transcript}
                      onCheckedChange={(checked) => 
                        setAnalysisTypes(prev => ({ ...prev, transcript: checked as boolean }))}
                    />
                    <Label htmlFor="transcript">트랜스크립트</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="summary"
                      checked={analysisTypes.summary}
                      onCheckedChange={(checked) => 
                        setAnalysisTypes(prev => ({ ...prev, summary: checked as boolean }))}
                    />
                    <Label htmlFor="summary">요약</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="key_points"
                      checked={analysisTypes.key_points}
                      onCheckedChange={(checked) => 
                        setAnalysisTypes(prev => ({ ...prev, key_points: checked as boolean }))}
                    />
                    <Label htmlFor="key_points">핵심 포인트</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="sentiment"
                      checked={analysisTypes.sentiment}
                      onCheckedChange={(checked) => 
                        setAnalysisTypes(prev => ({ ...prev, sentiment: checked as boolean }))}
                    />
                    <Label htmlFor="sentiment">감성 분석</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="topics"
                      checked={analysisTypes.topics}
                      onCheckedChange={(checked) => 
                        setAnalysisTypes(prev => ({ ...prev, topics: checked as boolean }))}
                    />
                    <Label htmlFor="topics">주제 추출</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="keep_original"
                      checked={keepOriginal}
                      onCheckedChange={(checked) => setKeepOriginal(checked as boolean)}
                    />
                    <Label htmlFor="keep_original">원본 파일 유지</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* 에러 메시지 */}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>오류</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {/* 검색 결과 */}
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {searchResults.map((video) => (
                <Card key={video.video_id} className="overflow-hidden">
                  <div className="flex">
                    {/* 썸네일 */}
                    <div className="w-48 h-32 flex-shrink-0">
                      <img
                        src={video.thumbnail_url}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    {/* 비디오 정보 */}
                    <div className="flex-1 p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold line-clamp-2 mb-1">
                            {video.title}
                          </h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            {video.channel_name}
                          </p>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {video.duration}
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {formatCount(video.view_count)}
                            </span>
                            <span className="flex items-center gap-1">
                              <ThumbsUp className="w-3 h-3" />
                              {formatCount(video.like_count)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(video.published_at)}
                            </span>
                          </div>
                          <p className="text-sm line-clamp-2 mt-2">
                            {video.description}
                          </p>
                        </div>
                        
                        {/* 액션 버튼 */}
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(video.video_url, '_blank')}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleAnalyze(video)}
                            disabled={isAnalyzing === video.video_id}
                          >
                            {isAnalyzing === video.video_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Brain className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      
                      {/* 분석 상태 */}
                      {analysisResults[video.video_id] && (
                        <Badge variant="secondary" className="mt-2">
                          분석 완료
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="analysis" className="space-y-4">
          {/* 분석 결과 목록 */}
          {Object.entries(analysisResults).length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Video className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  아직 분석된 비디오가 없습니다
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(analysisResults).map(([videoId, analysis]) => (
                <Card key={videoId}>
                  <CardHeader>
                    <CardTitle className="text-lg">{analysis.title}</CardTitle>
                    <CardDescription>
                      분석 시간: {analysis.processing_time.toFixed(2)}초 | 
                      분석 완료: {formatDate(analysis.analyzed_at)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="transcript">
                      <TabsList>
                        {analysis.analysis_results.transcript && (
                          <TabsTrigger value="transcript">트랜스크립트</TabsTrigger>
                        )}
                        {analysis.analysis_results.summary && (
                          <TabsTrigger value="summary">요약</TabsTrigger>
                        )}
                        {analysis.analysis_results.key_points && (
                          <TabsTrigger value="key_points">핵심 포인트</TabsTrigger>
                        )}
                        {analysis.analysis_results.sentiment && (
                          <TabsTrigger value="sentiment">감성 분석</TabsTrigger>
                        )}
                        {analysis.analysis_results.topics && (
                          <TabsTrigger value="topics">주제</TabsTrigger>
                        )}
                      </TabsList>
                      
                      {/* 트랜스크립트 */}
                      {analysis.analysis_results.transcript && (
                        <TabsContent value="transcript">
                          <ScrollArea className="h-96">
                            <div className="space-y-2 p-4">
                              {analysis.analysis_results.transcript.segments.map((segment, idx) => (
                                <div key={idx} className="flex gap-2">
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {Math.floor(segment.start / 60)}:{String(Math.floor(segment.start % 60)).padStart(2, '0')}
                                  </span>
                                  <p className="text-sm">{segment.text}</p>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </TabsContent>
                      )}
                      
                      {/* 요약 */}
                      {analysis.analysis_results.summary && (
                        <TabsContent value="summary">
                          <div className="p-4">
                            <p className="text-sm">{analysis.analysis_results.summary.summary}</p>
                            <Badge variant="outline" className="mt-2">
                              {analysis.analysis_results.summary.method === 'llm' ? 'AI 요약' : '추출적 요약'}
                            </Badge>
                          </div>
                        </TabsContent>
                      )}
                      
                      {/* 핵심 포인트 */}
                      {analysis.analysis_results.key_points && (
                        <TabsContent value="key_points">
                          <div className="p-4">
                            <ul className="space-y-2">
                              {analysis.analysis_results.key_points.map((point, idx) => (
                                <li key={idx} className="flex gap-2">
                                  <span className="text-muted-foreground">•</span>
                                  <span className="text-sm">{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </TabsContent>
                      )}
                      
                      {/* 감성 분석 */}
                      {analysis.analysis_results.sentiment && (
                        <TabsContent value="sentiment">
                          <div className="p-4 space-y-4">
                            <div className="flex items-center gap-4">
                              <Badge 
                                variant={
                                  analysis.analysis_results.sentiment.sentiment === 'positive' ? 'default' :
                                  analysis.analysis_results.sentiment.sentiment === 'negative' ? 'destructive' :
                                  'secondary'
                                }
                              >
                                {analysis.analysis_results.sentiment.sentiment === 'positive' ? '긍정적' :
                                 analysis.analysis_results.sentiment.sentiment === 'negative' ? '부정적' :
                                 '중립'}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                점수: {(analysis.analysis_results.sentiment.score * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">긍정 단어:</span> {analysis.analysis_results.sentiment.positive_count}
                              </div>
                              <div>
                                <span className="text-muted-foreground">부정 단어:</span> {analysis.analysis_results.sentiment.negative_count}
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                      )}
                      
                      {/* 주제 */}
                      {analysis.analysis_results.topics && (
                        <TabsContent value="topics">
                          <div className="p-4">
                            <div className="flex flex-wrap gap-2">
                              {analysis.analysis_results.topics.map((topic, idx) => (
                                <Badge key={idx} variant="outline">
                                  {topic}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </TabsContent>
                      )}
                    </Tabs>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}