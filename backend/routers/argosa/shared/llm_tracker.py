# backend/routers/argosa/shared/llm_tracker.py
"""중앙 LLM 대화 추적 관리"""

import asyncio
from typing import Set, Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
import logging
import json
from pathlib import Path

logger = logging.getLogger(__name__)

class LLMTracker:
    """중앙 집중식 LLM 대화 추적"""
    
    def __init__(self):
        self._tracked_ids: Set[str] = set()
        self._metadata: Dict[str, Dict[str, Any]] = {}
        self._platform_stats: Dict[str, int] = {}
        self._lock = asyncio.Lock()
        self._persistence_file = Path("./data/argosa/llm_tracking.json")
        self._load_state()
    
    def _load_state(self):
        """저장된 상태 로드"""
        try:
            if self._persistence_file.exists():
                with open(self._persistence_file, 'r') as f:
                    data = json.load(f)
                    self._tracked_ids = set(data.get('tracked_ids', []))
                    self._metadata = data.get('metadata', {})
                    self._platform_stats = data.get('platform_stats', {})
                    logger.info(f"Loaded {len(self._tracked_ids)} tracked LLM conversations")
        except Exception as e:
            logger.error(f"Failed to load LLM tracking state: {e}")
    
    async def _save_state(self):
        """상태 저장"""
        async with self._lock:
            try:
                self._persistence_file.parent.mkdir(parents=True, exist_ok=True)
                data = {
                    'tracked_ids': list(self._tracked_ids),
                    'metadata': self._metadata,
                    'platform_stats': self._platform_stats,
                    'last_saved': datetime.now(timezone.utc).isoformat()
                }
                
                # 임시 파일에 먼저 저장
                temp_file = self._persistence_file.with_suffix('.tmp')
                with open(temp_file, 'w') as f:
                    json.dump(data, f, indent=2)
                
                # 원자적 교체
                temp_file.replace(self._persistence_file)
                
            except Exception as e:
                logger.error(f"Failed to save LLM tracking state: {e}")
    
    async def track(self, conversation_id: str, platform: str, 
                   metadata: Optional[Dict[str, Any]] = None) -> bool:
        """LLM 대화 추적"""
        async with self._lock:
            if conversation_id in self._tracked_ids:
                logger.debug(f"Conversation {conversation_id} already tracked")
                return False
            
            self._tracked_ids.add(conversation_id)
            self._metadata[conversation_id] = {
                'platform': platform,
                'tracked_at': datetime.now(timezone.utc).isoformat(),
                'source': 'llm_query',
                **(metadata or {})
            }
            
            # 플랫폼별 통계 업데이트
            self._platform_stats[platform] = self._platform_stats.get(platform, 0) + 1
            
            logger.info(f"Tracked LLM conversation: {conversation_id} on {platform}")
        
        # 비동기 저장
        asyncio.create_task(self._save_state())
        return True
    
    async def is_tracked(self, conversation_id: str) -> bool:
        """추적된 대화인지 확인"""
        async with self._lock:
            return conversation_id in self._tracked_ids
    
    async def get_tracked_ids(self, platform: Optional[str] = None) -> List[str]:
        """추적된 ID 목록 반환"""
        async with self._lock:
            if platform:
                return [
                    cid for cid, meta in self._metadata.items()
                    if meta.get('platform') == platform
                ]
            return list(self._tracked_ids)
    
    async def filter_conversations(self, conversations: List[Dict[str, Any]], 
                                 platform: str) -> Dict[str, Any]:
        """LLM 대화 필터링"""
        filtered = []
        excluded_ids = []
        excluded_metadata = []
        
        async with self._lock:
            for conv in conversations:
                conv_id = conv.get('id')
                conv_metadata = conv.get('metadata', {})
                
                # 여러 조건으로 LLM 대화 체크
                is_llm = (
                    conv_id in self._tracked_ids or
                    conv_metadata.get('source') == 'llm_query' or
                    conv_metadata.get('is_llm_query', False) or
                    conv_metadata.get('generated_by') == 'extension_llm'
                )
                
                if is_llm:
                    excluded_ids.append(conv_id)
                    # 새로 발견된 LLM 대화도 추적
                    if conv_id not in self._tracked_ids:
                        self._tracked_ids.add(conv_id)
                        self._metadata[conv_id] = {
                            'platform': platform,
                            'tracked_at': datetime.now(timezone.utc).isoformat(),
                            'source': 'discovered',
                            **conv_metadata
                        }
                else:
                    filtered.append(conv)
        
        # 비동기 저장
        if excluded_ids:
            asyncio.create_task(self._save_state())
        
        return {
            'conversations': filtered,
            'excluded_ids': excluded_ids,
            'excluded_count': len(excluded_ids),
            'total_before_filter': len(conversations),
            'filter_stats': {
                'platform': platform,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
        }
    
    async def get_stats(self) -> Dict[str, Any]:
        """추적 통계 반환"""
        async with self._lock:
            total_tracked = len(self._tracked_ids)
            
            # 시간별 통계
            time_stats = {}
            for meta in self._metadata.values():
                tracked_date = meta.get('tracked_at', '').split('T')[0]
                if tracked_date:
                    time_stats[tracked_date] = time_stats.get(tracked_date, 0) + 1
            
            return {
                'total_tracked': total_tracked,
                'platform_breakdown': dict(self._platform_stats),
                'daily_tracking': time_stats,
                'sources': self._count_sources()
            }
    
    def _count_sources(self) -> Dict[str, int]:
        """소스별 카운트"""
        sources = {}
        for meta in self._metadata.values():
            source = meta.get('source', 'unknown')
            sources[source] = sources.get(source, 0) + 1
        return sources
    
    async def cleanup_old_tracking(self, days: int = 30):
        """오래된 추적 정보 정리"""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        removed_count = 0
        
        async with self._lock:
            ids_to_remove = []
            
            for conv_id, meta in self._metadata.items():
                tracked_at_str = meta.get('tracked_at', '')
                if tracked_at_str:
                    try:
                        tracked_at = datetime.fromisoformat(tracked_at_str.replace('Z', '+00:00'))
                        if tracked_at < cutoff:
                            ids_to_remove.append(conv_id)
                    except:
                        pass
            
            # 제거
            for conv_id in ids_to_remove:
                self._tracked_ids.discard(conv_id)
                platform = self._metadata.pop(conv_id, {}).get('platform')
                if platform and platform in self._platform_stats:
                    self._platform_stats[platform] = max(0, self._platform_stats[platform] - 1)
                removed_count += 1
        
        if removed_count > 0:
            await self._save_state()
            logger.info(f"Cleaned up {removed_count} old LLM tracking records")
        
        return removed_count

# 싱글톤 인스턴스
llm_tracker = LLMTracker()