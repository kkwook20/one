# backend/routers/argosa/collection/youtube_analyzer.py - YouTube 검색 및 비디오 분석 서비스

from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, List, Optional, Any, Union
from enum import Enum
from datetime import datetime, timedelta
from pydantic import BaseModel, Field, validator
import json
import logging
import asyncio
import os
import re
import hashlib
import subprocess
from pathlib import Path
import aiofiles
import aiohttp
from urllib.parse import urlparse, parse_qs
import tempfile
import shutil

logger = logging.getLogger(__name__)

# Shared services import
try:
    from ..shared.cache_manager import cache_manager
    from ..shared.metrics import metrics
    from ..shared.firefox_manager import firefox_manager
    HAS_SHARED_SERVICES = True
except ImportError as e:
    logger.warning(f"[YouTube Analyzer] Shared services not available: {e}")
    cache_manager = None
    metrics = None
    firefox_manager = None
    HAS_SHARED_SERVICES = False

# ======================== Configuration ========================

# 데이터 경로
BASE_DATA_PATH = Path(os.getenv("ARGOSA_DATA_PATH", "./data/argosa"))
YOUTUBE_DATA_PATH = BASE_DATA_PATH / "youtube"
DOWNLOADS_PATH = YOUTUBE_DATA_PATH / "downloads"
TRANSCRIPTS_PATH = YOUTUBE_DATA_PATH / "transcripts"
TEMP_PATH = YOUTUBE_DATA_PATH / "temp"

# API 설정
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3"

# 다운로드 설정
MAX_VIDEO_DURATION = 3600  # 1시간
MAX_VIDEO_SIZE = 500 * 1024 * 1024  # 500MB
DOWNLOAD_QUALITY = "720p"  # 기본 화질
TEMP_RETENTION_HOURS = 24  # 임시 파일 보관 시간

# 디렉토리 생성
for path in [YOUTUBE_DATA_PATH, DOWNLOADS_PATH, TRANSCRIPTS_PATH, TEMP_PATH]:
    path.mkdir(parents=True, exist_ok=True)

# ======================== Data Models ========================

class SearchType(str, Enum):
    """검색 유형"""
    VIDEO = "video"
    CHANNEL = "channel"
    PLAYLIST = "playlist"
    LIVE = "live"

class AnalysisType(str, Enum):
    """분석 유형"""
    TRANSCRIPT = "transcript"
    SUMMARY = "summary"
    KEY_POINTS = "key_points"
    SENTIMENT = "sentiment"
    TOPICS = "topics"
    FULL = "full"

class YouTubeSearchRequest(BaseModel):
    """YouTube 검색 요청"""
    query: str = Field(..., min_length=1, max_length=500)
    search_type: SearchType = SearchType.VIDEO
    max_results: int = Field(default=10, ge=1, le=50)
    language: str = Field(default="ko", pattern="^[a-z]{2}$")
    order: str = Field(default="relevance", pattern="^(relevance|date|rating|viewCount)$")
    published_after: Optional[datetime] = None
    duration: Optional[str] = Field(default=None, pattern="^(short|medium|long)$")
    
    @validator('query')
    def validate_query(cls, v):
        return v.strip()

class VideoAnalysisRequest(BaseModel):
    """비디오 분석 요청"""
    video_id: str = Field(..., pattern="^[a-zA-Z0-9_-]{11}$")
    analysis_types: List[AnalysisType] = [AnalysisType.TRANSCRIPT, AnalysisType.SUMMARY]
    target_language: str = Field(default="ko", pattern="^[a-z]{2}$")
    keep_original: bool = False  # 원본 파일 유지 여부
    
class YouTubeSearchResult(BaseModel):
    """YouTube 검색 결과"""
    video_id: str
    title: str
    description: str
    channel_name: str
    channel_id: str
    published_at: datetime
    duration: Optional[str]
    view_count: Optional[int]
    like_count: Optional[int]
    thumbnail_url: str
    video_url: str

class VideoAnalysisResult(BaseModel):
    """비디오 분석 결과"""
    video_id: str
    title: str
    analysis_results: Dict[str, Any]
    metadata: Dict[str, Any]
    transcript_path: Optional[str]
    processing_time: float
    analyzed_at: datetime

# ======================== YouTube Analyzer Service ========================

class YouTubeAnalyzerService:
    """YouTube 검색 및 분석 서비스"""
    
    def __init__(self):
        self.router = APIRouter()
        self.http_client = None
        self.youtube_dl_path = self._find_youtube_dl()
        self.whisper_available = self._check_whisper()
        self._setup_routes()
        
    def _find_youtube_dl(self) -> Optional[str]:
        """youtube-dl 또는 yt-dlp 찾기"""
        for cmd in ["yt-dlp", "youtube-dl"]:
            try:
                result = subprocess.run([cmd, "--version"], 
                                     capture_output=True, text=True)
                if result.returncode == 0:
                    logger.info(f"Found {cmd} version: {result.stdout.strip()}")
                    return cmd
            except FileNotFoundError:
                continue
        
        logger.warning("youtube-dl/yt-dlp not found. Video download will not work.")
        return None
        
    def _check_whisper(self) -> bool:
        """OpenAI Whisper 사용 가능 여부 확인"""
        try:
            import whisper
            logger.info("OpenAI Whisper is available")
            return True
        except ImportError:
            logger.warning("OpenAI Whisper not available. Transcript generation will use alternative methods.")
            return False
    
    async def initialize(self):
        """서비스 초기화"""
        self.http_client = aiohttp.ClientSession()
        
        # 오래된 임시 파일 정리
        asyncio.create_task(self._cleanup_old_files())
        
        logger.debug("YouTube Analyzer Service initialized")
        
    async def shutdown(self):
        """서비스 종료"""
        if self.http_client:
            await self.http_client.close()
        logger.info("YouTube Analyzer Service shutdown")
    
    async def search_youtube(self, request: YouTubeSearchRequest) -> List[YouTubeSearchResult]:
        """YouTube 검색"""
        if not YOUTUBE_API_KEY:
            # API 키가 없으면 웹 스크래핑 사용
            return await self._search_youtube_scraping(request)
        
        # YouTube Data API 사용
        params = {
            "part": "snippet",
            "q": request.query,
            "type": request.search_type.value,
            "maxResults": request.max_results,
            "order": request.order,
            "key": YOUTUBE_API_KEY,
            "regionCode": request.language.upper(),
            "relevanceLanguage": request.language
        }
        
        if request.published_after:
            params["publishedAfter"] = request.published_after.isoformat() + "Z"
            
        if request.duration:
            params["videoDuration"] = request.duration
            
        try:
            async with self.http_client.get(f"{YOUTUBE_API_URL}/search", params=params) as response:
                if response.status != 200:
                    error_data = await response.json()
                    raise HTTPException(status_code=response.status, 
                                      detail=f"YouTube API error: {error_data}")
                
                data = await response.json()
                
                # 비디오 상세 정보 가져오기
                video_ids = [item["id"]["videoId"] for item in data.get("items", []) 
                           if item["id"]["kind"] == "youtube#video"]
                
                if video_ids:
                    details = await self._get_video_details(video_ids)
                else:
                    details = {}
                
                results = []
                for item in data.get("items", []):
                    if item["id"]["kind"] != "youtube#video":
                        continue
                        
                    video_id = item["id"]["videoId"]
                    snippet = item["snippet"]
                    detail = details.get(video_id, {})
                    
                    result = YouTubeSearchResult(
                        video_id=video_id,
                        title=snippet["title"],
                        description=snippet["description"],
                        channel_name=snippet["channelTitle"],
                        channel_id=snippet["channelId"],
                        published_at=datetime.fromisoformat(snippet["publishedAt"].replace("Z", "+00:00")),
                        duration=detail.get("duration"),
                        view_count=detail.get("viewCount"),
                        like_count=detail.get("likeCount"),
                        thumbnail_url=snippet["thumbnails"]["high"]["url"],
                        video_url=f"https://www.youtube.com/watch?v={video_id}"
                    )
                    results.append(result)
                
                # 캐시에 저장
                if cache_manager:
                    cache_key = f"youtube_search:{hashlib.md5(json.dumps(params, sort_keys=True).encode()).hexdigest()}"
                    await cache_manager.set(cache_key, results, ttl=3600)  # 1시간 캐시
                
                return results
                
        except Exception as e:
            logger.error(f"YouTube search failed: {e}")
            if "quota" in str(e).lower():
                # 할당량 초과 시 웹 스크래핑으로 폴백
                return await self._search_youtube_scraping(request)
            raise
    
    async def _search_youtube_scraping(self, request: YouTubeSearchRequest) -> List[YouTubeSearchResult]:
        """웹 스크래핑을 통한 YouTube 검색 (API 키 없을 때)"""
        # Firefox Manager 사용
        if firefox_manager and await firefox_manager.check_and_start():
            # Native Messaging을 통한 검색
            try:
                from ..data_collection import native_command_manager
                
                command_id = await native_command_manager.send_command(
                    "youtube_search",
                    {
                        "query": request.query,
                        "max_results": request.max_results,
                        "search_type": request.search_type.value
                    }
                )
                
                result = await native_command_manager.wait_for_response(command_id, timeout=30)
                
                if result.get("success"):
                    return [YouTubeSearchResult(**item) for item in result.get("results", [])]
                    
            except Exception as e:
                logger.error(f"Native YouTube search failed: {e}")
        
        # 폴백: 간단한 웹 스크래핑 (기본적인 구현)
        search_url = f"https://www.youtube.com/results?search_query={request.query}"
        
        # 실제 구현에서는 더 정교한 스크래핑 필요
        logger.warning("YouTube search without API key is limited")
        return []
    
    async def _get_video_details(self, video_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """비디오 상세 정보 조회"""
        if not video_ids or not YOUTUBE_API_KEY:
            return {}
            
        params = {
            "part": "contentDetails,statistics",
            "id": ",".join(video_ids),
            "key": YOUTUBE_API_KEY
        }
        
        try:
            async with self.http_client.get(f"{YOUTUBE_API_URL}/videos", params=params) as response:
                if response.status != 200:
                    return {}
                    
                data = await response.json()
                details = {}
                
                for item in data.get("items", []):
                    video_id = item["id"]
                    
                    # ISO 8601 duration을 읽기 쉬운 형식으로 변환
                    duration = self._parse_duration(item["contentDetails"]["duration"])
                    
                    details[video_id] = {
                        "duration": duration,
                        "viewCount": int(item["statistics"].get("viewCount", 0)),
                        "likeCount": int(item["statistics"].get("likeCount", 0))
                    }
                
                return details
                
        except Exception as e:
            logger.error(f"Failed to get video details: {e}")
            return {}
    
    def _parse_duration(self, iso_duration: str) -> str:
        """ISO 8601 duration을 읽기 쉬운 형식으로 변환"""
        # PT1H2M10S -> 1:02:10
        match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', iso_duration)
        if not match:
            return "Unknown"
            
        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        seconds = int(match.group(3) or 0)
        
        if hours:
            return f"{hours}:{minutes:02d}:{seconds:02d}"
        else:
            return f"{minutes}:{seconds:02d}"
    
    async def analyze_video(self, request: VideoAnalysisRequest, 
                          background_tasks: BackgroundTasks) -> VideoAnalysisResult:
        """비디오 분석"""
        video_id = request.video_id
        
        # 캐시 확인
        if cache_manager:
            cache_key = f"video_analysis:{video_id}:{','.join(request.analysis_types)}"
            cached = await cache_manager.get(cache_key)
            if cached:
                return VideoAnalysisResult(**cached)
        
        start_time = datetime.now()
        
        # 비디오 정보 가져오기
        video_info = await self._get_video_info(video_id)
        
        if not video_info:
            raise HTTPException(status_code=404, detail="Video not found")
        
        # 분석 결과 저장
        analysis_results = {}
        transcript_path = None
        
        # 트랜스크립트 생성/가져오기
        if AnalysisType.TRANSCRIPT in request.analysis_types:
            transcript_result = await self._get_or_generate_transcript(
                video_id, 
                video_info,
                request.target_language
            )
            analysis_results["transcript"] = transcript_result["transcript"]
            transcript_path = transcript_result.get("path")
        
        # 추가 분석 수행
        transcript_text = analysis_results.get("transcript", {}).get("text", "")
        
        if AnalysisType.SUMMARY in request.analysis_types and transcript_text:
            analysis_results["summary"] = await self._generate_summary(transcript_text)
            
        if AnalysisType.KEY_POINTS in request.analysis_types and transcript_text:
            analysis_results["key_points"] = await self._extract_key_points(transcript_text)
            
        if AnalysisType.SENTIMENT in request.analysis_types and transcript_text:
            analysis_results["sentiment"] = await self._analyze_sentiment(transcript_text)
            
        if AnalysisType.TOPICS in request.analysis_types and transcript_text:
            analysis_results["topics"] = await self._extract_topics(transcript_text)
        
        # 백그라운드에서 임시 파일 정리
        if not request.keep_original:
            background_tasks.add_task(self._cleanup_video_files, video_id)
        
        processing_time = (datetime.now() - start_time).total_seconds()
        
        result = VideoAnalysisResult(
            video_id=video_id,
            title=video_info["title"],
            analysis_results=analysis_results,
            metadata={
                "duration": video_info.get("duration"),
                "channel": video_info.get("channel"),
                "published_at": video_info.get("published_at"),
                "language": request.target_language
            },
            transcript_path=transcript_path,
            processing_time=processing_time,
            analyzed_at=datetime.now()
        )
        
        # 캐시에 저장
        if cache_manager:
            await cache_manager.set(cache_key, result.dict(), ttl=86400)  # 24시간 캐시
        
        # 메트릭 기록
        if metrics:
            await metrics.increment_counter("youtube_analysis.completed")
            await metrics.record_value("youtube_analysis.processing_time", processing_time)
        
        return result
    
    async def _get_video_info(self, video_id: str) -> Dict[str, Any]:
        """비디오 정보 조회"""
        if YOUTUBE_API_KEY:
            # API 사용
            params = {
                "part": "snippet,contentDetails",
                "id": video_id,
                "key": YOUTUBE_API_KEY
            }
            
            try:
                async with self.http_client.get(f"{YOUTUBE_API_URL}/videos", params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data["items"]:
                            item = data["items"][0]
                            return {
                                "title": item["snippet"]["title"],
                                "description": item["snippet"]["description"],
                                "channel": item["snippet"]["channelTitle"],
                                "published_at": item["snippet"]["publishedAt"],
                                "duration": self._parse_duration(item["contentDetails"]["duration"])
                            }
            except Exception as e:
                logger.error(f"Failed to get video info via API: {e}")
        
        # youtube-dl로 정보 가져오기
        if self.youtube_dl_path:
            try:
                cmd = [
                    self.youtube_dl_path,
                    "--dump-json",
                    f"https://www.youtube.com/watch?v={video_id}"
                ]
                
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    info = json.loads(result.stdout)
                    return {
                        "title": info.get("title", "Unknown"),
                        "description": info.get("description", ""),
                        "channel": info.get("uploader", "Unknown"),
                        "published_at": datetime.fromtimestamp(info.get("upload_date", 0)).isoformat(),
                        "duration": str(timedelta(seconds=info.get("duration", 0)))
                    }
                    
            except Exception as e:
                logger.error(f"Failed to get video info via youtube-dl: {e}")
        
        return None
    
    async def _get_or_generate_transcript(self, video_id: str, 
                                        video_info: Dict[str, Any],
                                        target_language: str) -> Dict[str, Any]:
        """트랜스크립트 생성 또는 가져오기"""
        transcript_file = TRANSCRIPTS_PATH / f"{video_id}_{target_language}.json"
        
        # 기존 트랜스크립트 확인
        if transcript_file.exists():
            try:
                async with aiofiles.open(transcript_file, 'r', encoding='utf-8') as f:
                    content = await f.read()
                    return json.loads(content)
            except Exception as e:
                logger.error(f"Failed to read existing transcript: {e}")
        
        # YouTube 자막 다운로드 시도
        transcript = await self._download_youtube_captions(video_id, target_language)
        
        if not transcript:
            # 비디오 다운로드 및 음성 인식
            transcript = await self._generate_transcript_from_audio(video_id, target_language)
        
        # 트랜스크립트 저장
        if transcript:
            transcript_data = {
                "video_id": video_id,
                "title": video_info["title"],
                "language": target_language,
                "transcript": transcript,
                "generated_at": datetime.now().isoformat(),
                "path": str(transcript_file)
            }
            
            async with aiofiles.open(transcript_file, 'w', encoding='utf-8') as f:
                await f.write(json.dumps(transcript_data, ensure_ascii=False, indent=2))
            
            return transcript_data
        
        return {"transcript": {"text": "", "segments": []}}
    
    async def _download_youtube_captions(self, video_id: str, language: str) -> Optional[Dict[str, Any]]:
        """YouTube 자막 다운로드"""
        if not self.youtube_dl_path:
            return None
            
        try:
            # 자막 목록 확인
            cmd = [
                self.youtube_dl_path,
                "--list-subs",
                f"https://www.youtube.com/watch?v={video_id}"
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0 and language in result.stdout:
                # 자막 다운로드
                subtitle_file = TEMP_PATH / f"{video_id}_{language}.vtt"
                
                cmd = [
                    self.youtube_dl_path,
                    "--write-sub",
                    "--sub-lang", language,
                    "--sub-format", "vtt",
                    "--skip-download",
                    "-o", str(TEMP_PATH / "%(id)s.%(ext)s"),
                    f"https://www.youtube.com/watch?v={video_id}"
                ]
                
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0 and subtitle_file.exists():
                    # VTT 파싱
                    transcript = await self._parse_vtt_file(subtitle_file)
                    
                    # 임시 파일 삭제
                    subtitle_file.unlink()
                    
                    return transcript
                    
        except Exception as e:
            logger.error(f"Failed to download YouTube captions: {e}")
            
        return None
    
    async def _parse_vtt_file(self, vtt_file: Path) -> Dict[str, Any]:
        """VTT 자막 파일 파싱"""
        segments = []
        full_text = []
        
        async with aiofiles.open(vtt_file, 'r', encoding='utf-8') as f:
            content = await f.read()
            
        # 간단한 VTT 파서
        lines = content.strip().split('\n')
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            # 타임스탬프 찾기
            if '-->' in line:
                time_match = re.match(r'(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})', line)
                if time_match:
                    start_time = self._vtt_time_to_seconds(time_match.group(1))
                    end_time = self._vtt_time_to_seconds(time_match.group(2))
                    
                    # 텍스트 수집
                    i += 1
                    text_lines = []
                    while i < len(lines) and lines[i].strip() != '':
                        text_lines.append(lines[i].strip())
                        i += 1
                    
                    text = ' '.join(text_lines)
                    # HTML 태그 제거
                    text = re.sub(r'<[^>]+>', '', text)
                    
                    if text:
                        segments.append({
                            "start": start_time,
                            "end": end_time,
                            "text": text
                        })
                        full_text.append(text)
            
            i += 1
        
        return {
            "text": ' '.join(full_text),
            "segments": segments
        }
    
    def _vtt_time_to_seconds(self, time_str: str) -> float:
        """VTT 시간 형식을 초로 변환"""
        parts = time_str.split(':')
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = float(parts[2])
        return hours * 3600 + minutes * 60 + seconds
    
    async def _generate_transcript_from_audio(self, video_id: str, 
                                            language: str) -> Optional[Dict[str, Any]]:
        """오디오에서 트랜스크립트 생성"""
        if not self.youtube_dl_path:
            return None
            
        video_file = None
        audio_file = None
        
        try:
            # 비디오 다운로드
            video_file = TEMP_PATH / f"{video_id}.mp4"
            
            cmd = [
                self.youtube_dl_path,
                "-f", "worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst",  # 최소 품질
                "-o", str(video_file),
                f"https://www.youtube.com/watch?v={video_id}"
            ]
            
            logger.info(f"Downloading video {video_id}...")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error(f"Video download failed: {result.stderr}")
                return None
            
            # 오디오 추출
            audio_file = TEMP_PATH / f"{video_id}.wav"
            
            cmd = [
                "ffmpeg",
                "-i", str(video_file),
                "-vn",  # 비디오 제외
                "-acodec", "pcm_s16le",
                "-ar", "16000",  # 16kHz 샘플링
                "-ac", "1",  # 모노
                str(audio_file)
            ]
            
            logger.info(f"Extracting audio from video {video_id}...")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error(f"Audio extraction failed: {result.stderr}")
                return None
            
            # Whisper로 음성 인식
            if self.whisper_available:
                import whisper
                
                logger.info(f"Transcribing audio with Whisper...")
                model = whisper.load_model("base")
                result = model.transcribe(
                    str(audio_file),
                    language=language,
                    task="transcribe"
                )
                
                return {
                    "text": result["text"],
                    "segments": [
                        {
                            "start": seg["start"],
                            "end": seg["end"],
                            "text": seg["text"]
                        }
                        for seg in result["segments"]
                    ]
                }
            else:
                # 대체 음성 인식 서비스 사용 (예: Google Speech-to-Text)
                logger.warning("Whisper not available, using alternative method")
                # 실제 구현 필요
                return None
                
        except Exception as e:
            logger.error(f"Failed to generate transcript from audio: {e}")
            return None
            
        finally:
            # 임시 파일 정리
            for file in [video_file, audio_file]:
                if file and file.exists():
                    try:
                        file.unlink()
                    except:
                        pass
    
    async def _generate_summary(self, text: str) -> Dict[str, Any]:
        """텍스트 요약 생성"""
        # LLM을 사용한 요약
        try:
            from ..data_collection import native_command_manager
            
            prompt = f"""
다음 비디오 트랜스크립트를 간결하게 요약해주세요:

{text[:3000]}...

요약:
"""
            
            command_id = await native_command_manager.send_command(
                "execute_llm_query",
                {
                    "platform": "chatgpt",
                    "query": prompt
                }
            )
            
            result = await native_command_manager.wait_for_response(command_id, timeout=30)
            
            if result.get("success"):
                return {
                    "summary": result.get("response", ""),
                    "method": "llm"
                }
                
        except Exception as e:
            logger.error(f"LLM summary generation failed: {e}")
        
        # 폴백: 간단한 추출적 요약
        sentences = text.split('.')[:5]  # 처음 5문장
        return {
            "summary": '. '.join(sentences) + '.',
            "method": "extractive"
        }
    
    async def _extract_key_points(self, text: str) -> List[str]:
        """핵심 포인트 추출"""
        # 간단한 구현 - 실제로는 더 정교한 알고리즘 필요
        sentences = text.split('.')
        
        # 중요 키워드 기반 필터링
        important_keywords = ["중요", "핵심", "결론", "요약", "첫째", "둘째", "마지막"]
        
        key_points = []
        for sentence in sentences:
            if any(keyword in sentence for keyword in important_keywords):
                key_points.append(sentence.strip())
                
            if len(key_points) >= 5:
                break
                
        return key_points if key_points else sentences[:3]
    
    async def _analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """감성 분석"""
        # 간단한 키워드 기반 분석 - 실제로는 ML 모델 사용
        positive_words = ["좋", "훌륭", "최고", "멋", "행복", "감사", "사랑"]
        negative_words = ["나쁘", "싫", "최악", "화", "슬프", "실망", "걱정"]
        
        positive_count = sum(1 for word in positive_words if word in text)
        negative_count = sum(1 for word in negative_words if word in text)
        
        total = positive_count + negative_count
        if total == 0:
            sentiment = "neutral"
            score = 0.5
        else:
            score = positive_count / total
            if score > 0.6:
                sentiment = "positive"
            elif score < 0.4:
                sentiment = "negative"
            else:
                sentiment = "neutral"
                
        return {
            "sentiment": sentiment,
            "score": score,
            "positive_count": positive_count,
            "negative_count": negative_count
        }
    
    async def _extract_topics(self, text: str) -> List[str]:
        """주제 추출"""
        # 간단한 빈도 기반 추출 - 실제로는 토픽 모델링 사용
        import collections
        
        # 불용어 제거 (간단한 한국어 불용어)
        stopwords = {"은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "로", "으로", "만", "까지"}
        
        words = re.findall(r'\w+', text.lower())
        filtered_words = [w for w in words if len(w) > 1 and w not in stopwords]
        
        word_freq = collections.Counter(filtered_words)
        
        # 상위 10개 토픽
        topics = [word for word, count in word_freq.most_common(10)]
        
        return topics
    
    async def _cleanup_video_files(self, video_id: str):
        """비디오 관련 임시 파일 정리"""
        patterns = [
            f"{video_id}.*",
            f"*{video_id}*"
        ]
        
        for pattern in patterns:
            for file in TEMP_PATH.glob(pattern):
                try:
                    if file.is_file():
                        file.unlink()
                        logger.info(f"Deleted temporary file: {file}")
                except Exception as e:
                    logger.error(f"Failed to delete {file}: {e}")
    
    async def _cleanup_old_files(self):
        """오래된 임시 파일 정기 정리"""
        while True:
            try:
                cutoff_time = datetime.now() - timedelta(hours=TEMP_RETENTION_HOURS)
                
                for file in TEMP_PATH.iterdir():
                    if file.is_file():
                        if datetime.fromtimestamp(file.stat().st_mtime) < cutoff_time:
                            file.unlink()
                            logger.info(f"Deleted old temporary file: {file}")
                            
            except Exception as e:
                logger.error(f"Cleanup error: {e}")
                
            # 6시간마다 실행
            await asyncio.sleep(21600)
    
    def _setup_routes(self):
        """라우트 설정"""
        
        @self.router.post("/search", response_model=List[YouTubeSearchResult])
        async def search_videos(request: YouTubeSearchRequest):
            """YouTube 비디오 검색"""
            return await self.search_youtube(request)
        
        @self.router.post("/analyze", response_model=VideoAnalysisResult)
        async def analyze_video(request: VideoAnalysisRequest, 
                              background_tasks: BackgroundTasks):
            """YouTube 비디오 분석"""
            return await self.analyze_video(request, background_tasks)
        
        @self.router.get("/analysis/{video_id}")
        async def get_analysis(video_id: str):
            """저장된 분석 결과 조회"""
            # 모든 가능한 분석 파일 찾기
            analysis_files = list(TRANSCRIPTS_PATH.glob(f"{video_id}_*.json"))
            
            if not analysis_files:
                raise HTTPException(status_code=404, detail="Analysis not found")
                
            results = []
            for file in analysis_files:
                try:
                    async with aiofiles.open(file, 'r', encoding='utf-8') as f:
                        content = await f.read()
                        results.append(json.loads(content))
                except Exception as e:
                    logger.error(f"Failed to read analysis file {file}: {e}")
                    
            return {"video_id": video_id, "analyses": results}
        
        @self.router.delete("/analysis/{video_id}")
        async def delete_analysis(video_id: str):
            """분석 결과 삭제"""
            deleted_files = []
            
            # 관련 파일 모두 삭제
            for pattern in [f"{video_id}_*.json", f"{video_id}.*"]:
                for file in TRANSCRIPTS_PATH.glob(pattern):
                    try:
                        file.unlink()
                        deleted_files.append(str(file.name))
                    except Exception as e:
                        logger.error(f"Failed to delete {file}: {e}")
                        
            for file in TEMP_PATH.glob(f"*{video_id}*"):
                try:
                    file.unlink()
                    deleted_files.append(str(file.name))
                except:
                    pass
                    
            return {
                "video_id": video_id,
                "deleted_files": deleted_files,
                "message": f"Deleted {len(deleted_files)} files"
            }
        
        @self.router.get("/stats")
        async def get_stats():
            """통계 정보"""
            transcript_count = len(list(TRANSCRIPTS_PATH.glob("*.json")))
            temp_files = len(list(TEMP_PATH.glob("*")))
            total_size = sum(f.stat().st_size for f in YOUTUBE_DATA_PATH.rglob("*") if f.is_file())
            
            return {
                "transcript_count": transcript_count,
                "temp_files": temp_files,
                "total_size_mb": round(total_size / 1024 / 1024, 2),
                "youtube_dl_available": bool(self.youtube_dl_path),
                "whisper_available": self.whisper_available,
                "youtube_api_configured": bool(YOUTUBE_API_KEY)
            }

# 싱글톤 인스턴스
youtube_analyzer = YouTubeAnalyzerService()

# 라우터 export
youtube_router = youtube_analyzer.router