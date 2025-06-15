# backend/routers/argosa/shared/cache_manager.py
"""중앙 캐시 관리자"""

import asyncio
import json
from typing import Any, Dict, Optional, Tuple
from datetime import datetime, timedelta, timezone
import aioredis
import pickle
import hashlib
import logging

logger = logging.getLogger(__name__)

class CacheManager:
    """Redis 기반 중앙 캐시 관리"""
    
    def __init__(self, redis_url: str = "redis://localhost"):
        self.redis_url = redis_url
        self.redis: Optional[aioredis.Redis] = None
        self._local_cache: Dict[str, Tuple[Any, datetime]] = {}
        self._lock = asyncio.Lock()
        
    async def initialize(self):
        """Redis 연결 초기화"""
        try:
            self.redis = await aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=False  # 바이너리 데이터 처리
            )
            await self.redis.ping()
            logger.info("Redis cache connected")
        except Exception as e:
            logger.warning(f"Redis connection failed, using local cache only: {e}")
            self.redis = None
    
    def _generate_key(self, namespace: str, key: str) -> str:
        """네임스페이스를 포함한 캐시 키 생성"""
        return f"argosa:{namespace}:{key}"
    
    async def get(self, namespace: str, key: str) -> Optional[Any]:
        """캐시에서 값 가져오기"""
        cache_key = self._generate_key(namespace, key)
        
        # 로컬 캐시 먼저 확인
        async with self._lock:
            if cache_key in self._local_cache:
                value, expires_at = self._local_cache[cache_key]
                if datetime.now(timezone.utc) < expires_at:
                    return value
                else:
                    del self._local_cache[cache_key]
        
        # Redis 확인
        if self.redis:
            try:
                data = await self.redis.get(cache_key)
                if data:
                    value = pickle.loads(data)
                    # 로컬 캐시에도 저장
                    async with self._lock:
                        self._local_cache[cache_key] = (
                            value,
                            datetime.now(timezone.utc) + timedelta(minutes=5)
                        )
                    return value
            except Exception as e:
                logger.error(f"Redis get error: {e}")
        
        return None
    
    async def set(self, namespace: str, key: str, value: Any, 
                  ttl_seconds: int = 3600) -> bool:
        """캐시에 값 저장"""
        cache_key = self._generate_key(namespace, key)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        
        # 로컬 캐시 저장
        async with self._lock:
            self._local_cache[cache_key] = (value, expires_at)
        
        # Redis 저장
        if self.redis:
            try:
                data = pickle.dumps(value)
                await self.redis.setex(cache_key, ttl_seconds, data)
                return True
            except Exception as e:
                logger.error(f"Redis set error: {e}")
        
        return True  # 로컬 캐시는 성공
    
    async def delete(self, namespace: str, key: str) -> bool:
        """캐시에서 삭제"""
        cache_key = self._generate_key(namespace, key)
        
        # 로컬 캐시 삭제
        async with self._lock:
            self._local_cache.pop(cache_key, None)
        
        # Redis 삭제
        if self.redis:
            try:
                await self.redis.delete(cache_key)
                return True
            except Exception as e:
                logger.error(f"Redis delete error: {e}")
        
        return True
    
    async def clear_namespace(self, namespace: str):
        """네임스페이스의 모든 캐시 삭제"""
        pattern = self._generate_key(namespace, "*")
        
        # 로컬 캐시 정리
        async with self._lock:
            keys_to_delete = [k for k in self._local_cache if k.startswith(f"argosa:{namespace}:")]
            for key in keys_to_delete:
                del self._local_cache[key]
        
        # Redis 정리
        if self.redis:
            try:
                cursor = 0
                while True:
                    cursor, keys = await self.redis.scan(cursor, match=pattern, count=100)
                    if keys:
                        await self.redis.delete(*keys)
                    if cursor == 0:
                        break
            except Exception as e:
                logger.error(f"Redis clear namespace error: {e}")
    
    async def cleanup(self):
        """리소스 정리"""
        # cleanup task가 존재하고 실행 중인 경우만 취소
        if hasattr(self, '_cleanup_task') and self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        if self.redis:
            await self.redis.close()

# 싱글톤 인스턴스
cache_manager = CacheManager()