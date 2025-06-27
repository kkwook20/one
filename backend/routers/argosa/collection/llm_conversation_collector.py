# backend/routers/argosa/collection/llm_conversation_collector.py - LLM 플랫폼 대화 수집 모듈

from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from pathlib import Path
from pydantic import BaseModel
import json
import logging
import asyncio
import uuid

logger = logging.getLogger(__name__)

# ======================== Configuration ========================

LLM_DATA_PATH = Path("./data/argosa/llm-conversations")
SUPPORTED_PLATFORMS = ["chatgpt", "claude", "gemini", "deepseek", "grok", "perplexity", "pplx"]

# ======================== Data Models ========================

class ConversationData(BaseModel):
    """대화 데이터 모델"""
    id: str
    platform: str
    title: str
    messages: List[Dict[str, Any]]
    created_at: str
    updated_at: str
    metadata: Dict[str, Any] = {}

class CollectionStats(BaseModel):
    """수집 통계 모델"""
    platform: str
    total_conversations: int
    new_conversations: int
    updated_conversations: int
    last_sync: Optional[str]
    file_count: int

class ConversationSaveRequest(BaseModel):
    """대화 저장 요청 모델"""
    platform: str
    conversations: List[Dict[str, Any]]
    timestamp: Optional[str] = None
    metadata: Dict[str, Any] = {}

# ======================== LLM Conversation Collector ========================

class LLMConversationCollector:
    """LLM 플랫폼별 대화 수집 관리자"""
    
    def __init__(self):
        self.platforms = SUPPORTED_PLATFORMS
        self.collection_history = {}
        self.llm_conversation_ids = set()  # LLM 질의로 생성된 대화 ID 추적
        self._ensure_directories()
        
    def _ensure_directories(self):
        """필요한 디렉토리 생성"""
        for platform in self.platforms:
            platform_path = LLM_DATA_PATH / platform
            platform_path.mkdir(parents=True, exist_ok=True)
    
    def track_llm_conversation(self, conversation_id: str, metadata: Dict[str, Any]):
        """LLM 질의로 생성된 대화 추적"""
        self.llm_conversation_ids.add(conversation_id)
        logger.info(f"Tracking LLM conversation: {conversation_id} - {metadata}")
    
    def is_llm_conversation(self, conversation_id: str) -> bool:
        """LLM 질의로 생성된 대화인지 확인"""
        return conversation_id in self.llm_conversation_ids
    
    async def save_conversations(self, platform: str, conversations: List[Dict[str, Any]], 
                            timestamp: str = None, metadata: Dict[str, Any] = {}) -> Dict[str, Any]:
        
        if platform not in self.platforms:
            raise ValueError(f"Unsupported platform: {platform}")
        
        # LLM 필터링
        filtered_conversations = []
        excluded_count = 0
        
        # LLM tracker 사용 시도
        try:
            from ..shared.llm_tracker import llm_tracker
            filtered_result = await llm_tracker.filter_conversations(conversations, platform)
            filtered_conversations = filtered_result['conversations']
            excluded_count = filtered_result['excluded_count']
        except ImportError:
            # llm_tracker 없으면 기본 필터링
            for conv in conversations:
                conv_id = conv.get("id", "")
                conv_metadata = conv.get("metadata", {})
                
                is_llm = (
                    self.is_llm_conversation(conv_id) or
                    conv_metadata.get("source") == "llm_query" or
                    conv_metadata.get("is_llm_query", False)
                )
                
                if is_llm:
                    excluded_count += 1
                    logger.debug(f"Excluding LLM conversation: {conv_id}")
                else:
                    filtered_conversations.append(conv)
        
        if excluded_count > 0:
            logger.info(f"Excluded {excluded_count} LLM-generated conversations")
        
        # 필터링된 대화가 없으면 저장하지 않음
        if not filtered_conversations:
            logger.info(f"No conversations to save after filtering for {platform}")
            return {
                "success": True,
                "filename": None,
                "count": 0,
                "excluded_llm_count": excluded_count,
                "message": "All conversations were LLM-generated and excluded"
            }
        
        # conversation_saver 사용하여 저장
        try:
            from ..shared.conversation_saver import conversation_saver
            result = await conversation_saver.save_conversations(
                platform=platform,
                conversations=filtered_conversations,
                metadata={
                    "excluded_llm_count": excluded_count,
                    "total_before_filter": len(conversations),
                    **metadata
                }
            )
            
            # 히스토리 업데이트
            self.collection_history[platform] = {
                "last_sync": datetime.now().isoformat(),
                "conversation_count": result.get("count", 0),
                "excluded_llm_count": excluded_count,
                "last_file": result.get("filename", "")
            }
            
            # 결과에 excluded_llm_count 추가
            return {
                **result,
                "excluded_llm_count": excluded_count
            }
            
        except ImportError:
            logger.error("conversation_saver not available")
            raise RuntimeError("conversation_saver module is required")
        except Exception as e:
            logger.error(f"Failed to save conversations: {e}")
            raise
    
    async def get_conversations(self, platform: str, date: str = None, 
                              limit: int = None, include_llm: bool = False) -> List[ConversationData]:
        """저장된 대화 조회"""
        
        if platform not in self.platforms:
            raise ValueError(f"Unsupported platform: {platform}")
        
        platform_path = LLM_DATA_PATH / platform
        conversations = []
        
        # 날짜별 필터링
        if date:
            pattern = f"{date}_*.json"
        else:
            pattern = "*.json"
        
        files = sorted(platform_path.glob(pattern), reverse=True)
        
        # 파일에서 대화 로드
        for file in files:
            if limit and len(conversations) >= limit:
                break
                
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                for conv in data.get("conversations", []):
                    # LLM 대화 필터링 (include_llm이 False인 경우)
                    if not include_llm:
                        conv_metadata = conv.get("metadata", {})
                        if conv_metadata.get("source") == "llm_query" or conv_metadata.get("is_llm_query", False):
                            continue
                    
                    conversations.append(ConversationData(
                        id=conv.get("id", str(uuid.uuid4())),
                        platform=platform,
                        title=conv.get("title", "Untitled"),
                        messages=conv.get("messages", []),
                        created_at=conv.get("created_at", data.get("timestamp")),
                        updated_at=conv.get("updated_at", data.get("timestamp")),
                        metadata=conv.get("metadata", {})
                    ))
                    
                    if limit and len(conversations) >= limit:
                        break
                        
            except Exception as e:
                logger.error(f"Error reading file {file}: {e}")
                continue
        
        return conversations
    
    async def get_platform_stats(self, platform: str = None) -> Dict[str, CollectionStats]:
        """플랫폼별 수집 통계"""
        
        stats = {}
        platforms_to_check = [platform] if platform else self.platforms
        
        for plat in platforms_to_check:
            if plat not in self.platforms:
                continue
                
            platform_path = LLM_DATA_PATH / plat
            
            # 파일 수와 대화 수 계산
            total_conversations = 0
            excluded_llm_count = 0
            file_count = 0
            latest_sync = None
            
            for file in platform_path.glob("*.json"):
                file_count += 1
                
                try:
                    with open(file, 'r') as f:
                        data = json.load(f)
                        conv_count = len(data.get("conversations", []))
                        total_conversations += conv_count
                        
                        # 메타데이터에서 제외된 LLM 대화 수 확인
                        metadata = data.get("metadata", {})
                        excluded_llm_count += metadata.get("excluded_llm_count", 0)
                        
                        # 최신 동기화 시간
                        file_time = datetime.fromtimestamp(file.stat().st_mtime)
                        if not latest_sync or file_time > latest_sync:
                            latest_sync = file_time
                            
                except Exception:
                    continue
            
            stats[plat] = CollectionStats(
                platform=plat,
                total_conversations=total_conversations,
                new_conversations=0,  # 실시간 계산 필요
                updated_conversations=0,
                last_sync=latest_sync.isoformat() if latest_sync else None,
                file_count=file_count
            )
        
        return stats
    
    async def clean_old_data(self, days_to_keep: int = 30) -> Dict[str, int]:
        """오래된 데이터 정리"""
        
        cutoff_date = datetime.now() - timedelta(days=days_to_keep)
        deleted_stats = {}
        
        for platform in self.platforms:
            platform_path = LLM_DATA_PATH / platform
            deleted_count = 0
            
            for file in platform_path.glob("*.json"):
                try:
                    # 파일명에서 날짜 추출
                    date_str = file.stem.split('_')[0]
                    file_date = datetime.strptime(date_str, "%Y-%m-%d")
                    
                    if file_date < cutoff_date:
                        file.unlink()
                        deleted_count += 1
                        
                except Exception as e:
                    logger.error(f"Error processing file {file}: {e}")
                    continue
            
            deleted_stats[platform] = deleted_count
        
        return deleted_stats
    
    async def search_conversations(self, query: str, platforms: List[str] = None,
                                 date_range: Dict[str, str] = None, include_llm: bool = False) -> List[Dict[str, Any]]:
        """대화 내용 검색"""
        
        platforms = platforms or self.platforms
        results = []
        
        for platform in platforms:
            if platform not in self.platforms:
                continue
                
            platform_path = LLM_DATA_PATH / platform
            
            for file in platform_path.glob("*.json"):
                try:
                    # 날짜 범위 체크
                    if date_range:
                        date_str = file.stem.split('_')[0]
                        file_date = datetime.strptime(date_str, "%Y-%m-%d")
                        
                        if date_range.get("start"):
                            start_date = datetime.strptime(date_range["start"], "%Y-%m-%d")
                            if file_date < start_date:
                                continue
                                
                        if date_range.get("end"):
                            end_date = datetime.strptime(date_range["end"], "%Y-%m-%d")
                            if file_date > end_date:
                                continue
                    
                    # 파일 내용 검색
                    with open(file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        
                    for conv in data.get("conversations", []):
                        # LLM 대화 필터링
                        if not include_llm:
                            conv_metadata = conv.get("metadata", {})
                            if conv_metadata.get("source") == "llm_query" or conv_metadata.get("is_llm_query", False):
                                continue
                        
                        # 제목 검색
                        if query.lower() in conv.get("title", "").lower():
                            results.append({
                                "platform": platform,
                                "conversation_id": conv.get("id"),
                                "title": conv.get("title"),
                                "match_type": "title",
                                "file": file.name
                            })
                            continue
                        
                        # 메시지 내용 검색
                        for msg in conv.get("messages", []):
                            if query.lower() in msg.get("content", "").lower():
                                results.append({
                                    "platform": platform,
                                    "conversation_id": conv.get("id"),
                                    "title": conv.get("title"),
                                    "match_type": "content",
                                    "message_role": msg.get("role"),
                                    "file": file.name
                                })
                                break
                                
                except Exception as e:
                    logger.error(f"Error searching file {file}: {e}")
                    continue
        
        return results
    
    async def export_conversations(self, platform: str, format: str = "json",
                                 date_range: Dict[str, str] = None, include_llm: bool = False) -> Dict[str, Any]:
        """대화 내보내기"""
        
        conversations = await self.get_conversations(platform, include_llm=include_llm)
        
        # 날짜 범위 필터링
        if date_range:
            filtered = []
            for conv in conversations:
                conv_date = datetime.fromisoformat(conv.created_at).date()
                
                if date_range.get("start"):
                    start = datetime.strptime(date_range["start"], "%Y-%m-%d").date()
                    if conv_date < start:
                        continue
                        
                if date_range.get("end"):
                    end = datetime.strptime(date_range["end"], "%Y-%m-%d").date()
                    if conv_date > end:
                        continue
                        
                filtered.append(conv)
            conversations = filtered
        
        # 형식에 따른 내보내기
        export_path = LLM_DATA_PATH / "exports"
        export_path.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        if format == "json":
            filename = f"{platform}_export_{timestamp}.json"
            file_path = export_path / filename
            
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump([conv.dict() for conv in conversations], f, 
                         ensure_ascii=False, indent=2)
        
        elif format == "txt":
            filename = f"{platform}_export_{timestamp}.txt"
            file_path = export_path / filename
            
            with open(file_path, 'w', encoding='utf-8') as f:
                for conv in conversations:
                    f.write(f"=== {conv.title} ===\n")
                    f.write(f"Created: {conv.created_at}\n\n")
                    
                    for msg in conv.messages:
                        f.write(f"{msg.get('role', 'unknown').upper()}: {msg.get('content', '')}\n\n")
                    
                    f.write("\n" + "="*50 + "\n\n")
        
        else:
            raise ValueError(f"Unsupported export format: {format}")
        
        return {
            "success": True,
            "filename": filename,
            "path": str(file_path),
            "conversation_count": len(conversations),
            "format": format
        }
    
    async def get_conversation_insights(self, platform: str, include_llm: bool = False) -> Dict[str, Any]:
        """대화 인사이트 분석"""
        
        conversations = await self.get_conversations(platform, include_llm=include_llm)
        
        # 기본 통계
        total_conversations = len(conversations)
        total_messages = sum(len(conv.messages) for conv in conversations)
        
        # 시간대별 분포
        hourly_distribution = {}
        daily_distribution = {}
        
        # 주제 분석 (간단한 키워드 추출)
        word_frequency = {}
        
        for conv in conversations:
            # 시간 분석
            created_time = datetime.fromisoformat(conv.created_at)
            hour = created_time.hour
            day = created_time.strftime("%A")
            
            hourly_distribution[hour] = hourly_distribution.get(hour, 0) + 1
            daily_distribution[day] = daily_distribution.get(day, 0) + 1
            
            # 키워드 추출 (제목에서)
            words = conv.title.lower().split()
            for word in words:
                if len(word) > 3:  # 짧은 단어 제외
                    word_frequency[word] = word_frequency.get(word, 0) + 1
        
        # 상위 키워드
        top_keywords = sorted(word_frequency.items(), key=lambda x: x[1], reverse=True)[:20]
        
        return {
            "platform": platform,
            "total_conversations": total_conversations,
            "total_messages": total_messages,
            "avg_messages_per_conversation": total_messages / total_conversations if total_conversations > 0 else 0,
            "hourly_distribution": hourly_distribution,
            "daily_distribution": daily_distribution,
            "top_keywords": top_keywords,
            "analysis_timestamp": datetime.now().isoformat()
        }

# ======================== API Router ========================

router = APIRouter(prefix="/llm/conversations", tags=["llm_conversations"])

# 전역 컬렉터 인스턴스
collector = LLMConversationCollector()

@router.post("/save")
async def save_conversations(request: ConversationSaveRequest):
    """대화 저장 API - LLM 소스 체크 추가"""
    try:
        result = await collector.save_conversations(
            platform=request.platform,
            conversations=request.conversations,
            timestamp=request.timestamp,
            metadata=request.metadata
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error saving conversations: {e}")
        raise HTTPException(status_code=500, detail="Failed to save conversations")

@router.get("/{platform}")
async def get_conversations(platform: str, date: Optional[str] = None, 
                           limit: Optional[int] = None, include_llm: bool = False):
    """대화 조회 API"""
    try:
        conversations = await collector.get_conversations(platform, date, limit, include_llm)
        return {
            "platform": platform,
            "conversations": [conv.dict() for conv in conversations],
            "count": len(conversations)
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting conversations: {e}")
        raise HTTPException(status_code=500, detail="Failed to get conversations")

@router.get("/stats/all")
async def get_all_stats():
    """전체 플랫폼 통계"""
    try:
        stats = await collector.get_platform_stats()
        return stats
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get statistics")

@router.get("/stats/{platform}")
async def get_platform_stats(platform: str):
    """특정 플랫폼 통계"""
    try:
        stats = await collector.get_platform_stats(platform)
        if platform not in stats:
            raise HTTPException(status_code=404, detail=f"No data for platform: {platform}")
        return stats[platform]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting platform stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get statistics")

@router.post("/search")
async def search_conversations(query: str, platforms: List[str] = None, 
                             date_range: Dict[str, str] = None, include_llm: bool = False):
    """대화 검색 API"""
    try:
        results = await collector.search_conversations(query, platforms, date_range, include_llm)
        return {
            "query": query,
            "results": results,
            "count": len(results)
        }
    except Exception as e:
        logger.error(f"Error searching conversations: {e}")
        raise HTTPException(status_code=500, detail="Failed to search conversations")

@router.post("/export/{platform}")
async def export_conversations(platform: str, format: str = "json", 
                             date_range: Dict[str, str] = None, include_llm: bool = False):
    """대화 내보내기 API"""
    try:
        result = await collector.export_conversations(platform, format, date_range, include_llm)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error exporting conversations: {e}")
        raise HTTPException(status_code=500, detail="Failed to export conversations")

@router.get("/insights/{platform}")
async def get_conversation_insights(platform: str, include_llm: bool = False):
    """대화 인사이트 API"""
    try:
        insights = await collector.get_conversation_insights(platform, include_llm)
        return insights
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting insights: {e}")
        raise HTTPException(status_code=500, detail="Failed to get insights")

@router.delete("/clean")
async def clean_old_data(days_to_keep: int = 30):
    """오래된 데이터 정리 API"""
    try:
        if days_to_keep < 7:
            raise HTTPException(status_code=400, detail="Minimum retention period is 7 days")
            
        deleted_stats = await collector.clean_old_data(days_to_keep)
        return {
            "success": True,
            "deleted_files": deleted_stats,
            "retention_days": days_to_keep
        }
    except Exception as e:
        logger.error(f"Error cleaning data: {e}")
        raise HTTPException(status_code=500, detail="Failed to clean old data")

@router.post("/track-llm/{conversation_id}")
async def track_llm_conversation(conversation_id: str, metadata: Dict[str, Any] = {}):
    """LLM 대화 추적 API"""
    collector.track_llm_conversation(conversation_id, metadata)
    return {"success": True, "conversation_id": conversation_id}

# ======================== Helper Functions ========================

async def get_conversation_count() -> int:
    """전체 대화 수 계산"""
    stats = await collector.get_platform_stats()
    return sum(stat.total_conversations for stat in stats.values())

async def get_latest_sync_time() -> Optional[str]:
    """최신 동기화 시간 조회"""
    stats = await collector.get_platform_stats()
    latest = None
    
    for stat in stats.values():
        if stat.last_sync:
            sync_time = datetime.fromisoformat(stat.last_sync)
            if not latest or sync_time > latest:
                latest = sync_time
    
    return latest.isoformat() if latest else None