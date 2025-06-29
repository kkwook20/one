# backend/routers/argosa/collection/__init__.py
"""Argosa Collection Modules"""

# Import routers from collection modules
try:
    from .llm_conversation_collector import router as llm_conversation_router
except ImportError:
    llm_conversation_router = None

try:
    from .llm_query_service import router as llm_query_router
except ImportError:
    llm_query_router = None

try:
    from .web_crawler_agent import crawler_router as web_crawler_router
except ImportError:
    web_crawler_router = None

try:
    from .youtube_analyzer import youtube_router
except ImportError:
    youtube_router = None

__all__ = [
    'llm_conversation_router',
    'llm_query_router', 
    'web_crawler_router',
    'youtube_router'
]