# backend/routers/argosa/shared/conversation_saver.py
"""중앙화된 대화 저장 유틸리티"""

from typing import Dict, List, Any
from datetime import datetime
from pathlib import Path
import json
import logging

logger = logging.getLogger(__name__)

class ConversationSaver:
    """대화 파일 저장 유틸리티"""
    
    def __init__(self, base_path: str = "./data/argosa/llm-conversations"):
        self.base_path = Path(base_path)
        self._llm_tracker = None
    
    def set_llm_tracker(self, tracker):
        """LLM 트래커 설정"""
        self._llm_tracker = tracker
        logger.info("ConversationSaver: LLM tracker registered")
    
    async def save_conversations(self, platform: str, conversations: List[Dict[str, Any]], 
                               metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """대화를 파일로 저장"""
        metadata = metadata or {}
        
        # 디렉토리 확인
        platform_path = self.base_path / platform
        platform_path.mkdir(parents=True, exist_ok=True)
        
        # 파일명 생성
        date_str = datetime.now().strftime("%Y-%m-%d")
        file_count = len(list(platform_path.glob(f"{date_str}_*.json")))
        filename = f"{date_str}_conversation_{file_count + 1}.json"
        
        # 데이터 정리
        clean_conversations = []
        for conv in conversations:
            try:
                clean_conv = {
                    "id": str(conv.get("id", "")),
                    "platform": platform,
                    "title": str(conv.get("title", "Untitled")),
                    "created_at": str(conv.get("created_at", datetime.now().isoformat())),
                    "updated_at": str(conv.get("updated_at", datetime.now().isoformat())),
                    "messages": [
                        {
                            "role": str(msg.get("role", "unknown")),
                            "content": str(msg.get("content", "")),
                            "timestamp": str(msg.get("timestamp", "")) if msg.get("timestamp") else None,
                            "index": int(msg.get("index", i)) if isinstance(msg.get("index"), (int, str)) else i
                        }
                        for i, msg in enumerate(conv.get("messages", [])[:1000])  # 메시지 수 제한
                    ],
                    "metadata": {
                        k: v for k, v in conv.get("metadata", {}).items()
                        if k not in ["_sa_instance_state", "query", "query_class"] and not k.startswith("_")
                    }
                }
                clean_conversations.append(clean_conv)
            except Exception as e:
                logger.error(f"Error cleaning conversation {conv.get('id')}: {e}")
                continue
        
        # 저장 데이터
        save_data = {
            "platform": platform,
            "timestamp": datetime.now().isoformat(),
            "conversations": clean_conversations,
            "metadata": {
                "count": len(clean_conversations),
                "collected_at": datetime.now().isoformat(),
                **{k: v for k, v in metadata.items() if not k.startswith("_")}  # 내부 플래그 제외
            }
        }
        
        # 파일 저장
        file_path = platform_path / filename
        temp_path = file_path.with_suffix('.tmp')
        
        try:
            json_str = json.dumps(save_data, ensure_ascii=False, indent=2)
            with open(temp_path, 'w', encoding='utf-8') as f:
                f.write(json_str)
            temp_path.replace(file_path)
            
            logger.info(f"Saved {len(clean_conversations)} conversations to {filename}")
            
        except Exception as e:
            if temp_path.exists():
                temp_path.unlink()
            logger.error(f"JSON serialization error: {e}")
            raise e
        
        return {
            "success": True,
            "filename": filename,
            "path": str(file_path),
            "count": len(clean_conversations)
        }
    
    async def save_single_conversation(self, platform: str, conversation: Dict[str, Any],
                                     metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """단일 대화 저장 (편의 메서드)"""
        return await self.save_conversations(
            platform=platform,
            conversations=[conversation],
            metadata=metadata
        )

# 싱글톤 인스턴스
conversation_saver = ConversationSaver()

# 편의 함수들
async def save_conversations(platform: str, conversations: List[Dict[str, Any]], 
                           metadata: Dict[str, Any] = None) -> Dict[str, Any]:
    """대화 저장 편의 함수"""
    return await conversation_saver.save_conversations(platform, conversations, metadata)

async def save_single_conversation(platform: str, conversation: Dict[str, Any],
                                 metadata: Dict[str, Any] = None) -> Dict[str, Any]:
    """단일 대화 저장 편의 함수"""
    return await conversation_saver.save_single_conversation(platform, conversation, metadata)