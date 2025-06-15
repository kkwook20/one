# backend/routers/argosa/shared/conversation_saver.py
"""중앙화된 대화 저장 서비스"""

from typing import Dict, List, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class ConversationSaver:
    """대화 저장을 위한 공유 서비스"""
    
    def __init__(self):
        self._collector = None
    
    def set_collector(self, collector):
        """컬렉터 설정 (초기화 시)"""
        self._collector = collector
    
    async def save_conversations(self, platform: str, conversations: List[Dict[str, Any]], 
                               metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """대화 저장"""
        if not self._collector:
            raise RuntimeError("Conversation collector not initialized")
        
        return await self._collector.save_conversations(
            platform=platform,
            conversations=conversations,
            metadata=metadata or {}
        )

# 싱글톤 인스턴스
conversation_saver = ConversationSaver()