# backend/services/firefox_manager.py

import asyncio
from typing import Optional, Dict, Any
from enum import Enum
import os

class FirefoxMode(Enum):
    EXTENSION = "extension"  # Extension 통신용
    CRAWLER = "crawler"      # 웹 크롤링용
    HYBRID = "hybrid"        # 둘 다 사용

class UnifiedFirefoxManager:
    """통합 Firefox 관리자 (싱글톤)"""
    
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.firefox_process = None
            self.selenium_driver = None
            self.mode = FirefoxMode.HYBRID
            self.profile_path = os.getenv("FIREFOX_PROFILE_PATH", "")
            self.extension_port = int(os.getenv("FIREFOX_EXTENSION_PORT", "9292"))
            self.is_running = False
            self.current_users = set()  # 현재 사용 중인 모듈들
            self.initialized = True
    
    async def request_firefox(self, requester: str, mode: FirefoxMode = FirefoxMode.HYBRID) -> Dict[str, Any]:
        """Firefox 사용 요청"""
        async with self._lock:
            self.current_users.add(requester)
            
            if not self.is_running:
                await self._start_firefox(mode)
            
            return {
                "status": "granted",
                "mode": self.mode,
                "extension_port": self.extension_port,
                "driver": self.selenium_driver if mode != FirefoxMode.EXTENSION else None
            }
    
    async def release_firefox(self, requester: str):
        """Firefox 사용 해제"""
        async with self._lock:
            self.current_users.discard(requester)
            
            # 아무도 사용하지 않으면 종료 고려
            if not self.current_users and self.auto_close:
                await asyncio.sleep(30)  # 30초 대기
                if not self.current_users:  # 다시 확인
                    await self._stop_firefox()