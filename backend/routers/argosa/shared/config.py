# backend/routers/argosa/shared/config.py
"""공통 설정"""

from typing import Dict, Any
import os
from pathlib import Path

# 기본 설정
DEFAULT_SETTINGS = {
    "sync_interval": 1440,  # 분 단위 (24시간)
    "max_conversations": 20,
    "delay_between_platforms": 5,
    "retry_attempts": 3,
    "request_timeout": 30,
    "platforms": {
        "chatgpt": {"enabled": True},
        "claude": {"enabled": True},
        "gemini": {"enabled": True},
        "deepseek": {"enabled": False},
        "grok": {"enabled": False},
        "perplexity": {"enabled": False}
    }
}

# 경로 설정
BASE_DIR = Path(os.getenv("ARGOSA_DATA_PATH", "./data/argosa"))
CONVERSATIONS_DIR = BASE_DIR / "llm-conversations"
CACHE_DIR = BASE_DIR / "cache"
LOGS_DIR = BASE_DIR / "logs"

# API 설정
SUPPORTED_PLATFORMS = ["chatgpt", "claude", "gemini", "deepseek", "grok", "perplexity"]

# 타임아웃 설정
COLLECTION_TIMEOUT = 300  # 5분
LLM_QUERY_TIMEOUT = 120  # 2분
CRAWL_TIMEOUT = 60  # 1분

def get_platform_config(platform: str) -> Dict[str, Any]:
    """플랫폼별 설정 반환"""
    configs = {
        "chatgpt": {
            "name": "ChatGPT",
            "api_base": "https://chat.openai.com/backend-api",
            "conversation_list": "/conversations",
            "conversation_detail": "/conversation/{id}"
        },
        "claude": {
            "name": "Claude",
            "api_base": "https://claude.ai/api",
            "conversation_list": "/chat_conversations",
            "conversation_detail": "/chat_conversations/{id}"
        },
        "gemini": {
            "name": "Gemini",
            "api_base": "https://gemini.google.com/api",
            "conversation_list": "/conversations",
            "conversation_detail": "/conversations/{id}"
        },
        "deepseek": {
            "name": "DeepSeek",
            "api_base": "https://chat.deepseek.com/api/v0",
            "conversation_list": "/chat/conversations",
            "conversation_detail": "/chat/conversation/{id}"
        },
        "grok": {
            "name": "Grok",
            "api_base": "https://grok.x.ai/api",
            "conversation_list": "/conversations",
            "conversation_detail": "/conversations/{id}"
        },
        "perplexity": {
            "name": "Perplexity",
            "api_base": "https://www.perplexity.ai/api",
            "conversation_list": "/conversations",
            "conversation_detail": "/conversations/{id}"
        }
    }
    
    return configs.get(platform, {})