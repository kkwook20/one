# ============= data_collection.py =============
# backend/routers/argosa/data_collection.py - 전체 코드

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import Dict, List, Optional, Any, Set
import asyncio
import json
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from pathlib import Path
import os
import subprocess
import platform
import uuid
import shutil
import logging
import socket
import time
import psutil
import threading
from enum import Enum

# Shared 모듈에서 import
from .shared.cache_manager import cache_manager
from .shared.llm_tracker import llm_tracker
from .shared.command_queue import command_queue
from .shared.metrics import metrics
from .shared.conversation_saver import conversation_saver
from .shared.error_handler import error_handler, with_retry, ErrorSeverity

# 설정
logger = logging.getLogger(__name__)

# Create router
router = APIRouter()

# WebSocket connections
active_websockets: Set[WebSocket] = set()

# Configuration paths
DATA_PATH = Path("./data/argosa")
STATE_FILE_PATH = DATA_PATH / "system_state.json"
SESSION_CACHE_PATH = DATA_PATH / "session_cache.json"

# ======================== Data Models ========================

class MessageType(Enum):
    """Native Messaging 메시지 타입"""
    INIT = "init"
    SESSION_UPDATE = "session_update"
    COLLECTION_RESULT = "collection_result"
    LLM_QUERY_RESULT = "llm_query_result"
    CRAWL_RESULT = "crawl_result"
    ERROR = "error"

class SystemState(BaseModel):
    system_status: str = "idle"  # idle, preparing, collecting, error
    sessions: Dict[str, Dict[str, Any]] = {}
    sync_status: Optional[Dict[str, Any]] = None
    firefox_status: str = "closed"  # closed, opening, ready, error
    extension_status: str = "disconnected"  # connected, disconnected
    extension_last_seen: Optional[str] = None
    schedule_enabled: bool = False
    data_sources_active: int = 0
    total_conversations: int = 0

class SessionCache(BaseModel):
    platform: str
    valid: bool
    last_checked: str
    expires_at: Optional[str] = None
    source: str = "cache"  # cache, extension, firefox, timeout
    cookies: Optional[List[Dict[str, Any]]] = None
    status: str = "unknown"  # active, expired, checking, unknown

# ======================== State Management ========================

class SystemStateManager:
    def __init__(self):
        self.state = SystemState()
        self.state_lock = asyncio.Lock()
        self.load_state()
        
    def load_state(self):
        """Load state from file"""
        try:
            if STATE_FILE_PATH.exists():
                with open(STATE_FILE_PATH, 'r') as f:
                    data = json.load(f)
                    self.state = SystemState(**data)
        except Exception as e:
            logger.error(f"Failed to load state: {e}")
            
    async def save_state(self):
        """Save state to file with retry"""
        async with self.state_lock:
            try:
                STATE_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
                with open(STATE_FILE_PATH, 'w') as f:
                    json.dump(self.state.dict(), f, indent=2)
            except Exception as e:
                logger.error(f"Failed to save state: {e}")
                raise
                
    async def update_state(self, key: str, value: Any):
        """Update state and broadcast"""
        async with self.state_lock:
            if hasattr(self.state, key):
                setattr(self.state, key, value)
                
        await self.save_state()
        await self.broadcast_state()
        
        # 메트릭 기록
        await metrics.record_event("state_update", tags={"field": key})
            
    async def broadcast_state(self):
        """Broadcast state to all connected WebSocket clients"""
        if active_websockets:
            state_data = self.state.dict()
            disconnected = set()
            
            for websocket in active_websockets:
                try:
                    await websocket.send_json({
                        "type": "state_update",
                        "data": state_data
                    })
                except:
                    disconnected.add(websocket)
                    
            # Remove disconnected websockets
            for ws in disconnected:
                active_websockets.discard(ws)

# ======================== Firefox Manager ========================

class FirefoxManager:
    """Firefox 프로세스 시작 및 모니터링 통합 관리"""
    
    def __init__(self, state_manager):
        self.state_manager = state_manager
        self.monitor_thread = None
        self.running = False
        self.firefox_path = r"C:\Program Files\Firefox Developer Edition\firefox.exe"
        self.profile_path = r'F:\ONE_AI\firefox-profile'
        
    async def check_and_start(self):
        """Firefox 상태 확인 및 시작"""
        firefox_running = any(p.name().lower().startswith('firefox') for p in psutil.process_iter())
        
        if not firefox_running:
            logger.info("Firefox not running, starting...")
            try:
                subprocess.Popen([self.firefox_path, '-profile', self.profile_path])
                await self.state_manager.update_state("firefox_status", "opening")
                await asyncio.sleep(5)
                await self.state_manager.update_state("firefox_status", "ready")
                
                return {"firefox_started": True, "firefox_status": "ready"}
            except Exception as e:
                logger.error(f"Failed to start Firefox: {e}")
                await self.state_manager.update_state("firefox_status", "error")
                return {"firefox_started": False, "firefox_status": "error", "error": str(e)}
        else:
            logger.info("Firefox already running")
            await self.state_manager.update_state("firefox_status", "ready")
            return {"firefox_started": False, "firefox_status": "ready", "already_running": True}
    
    def start_monitor(self):
        """모니터링 시작"""
        if not self.running:
            self.running = True
            self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self.monitor_thread.start()
            logger.info("Firefox monitor started")
    
    def _monitor_loop(self):
        """Firefox 프로세스 모니터링 루프"""
        firefox_pids = set()
        
        while self.running:
            current_pids = {p.info['pid'] for p in psutil.process_iter(['pid', 'name']) 
                           if p.info['name'] and 'firefox' in p.info['name'].lower()}
            
            if current_pids != firefox_pids:
                if not current_pids and firefox_pids:  # Firefox 종료
                    logger.info(f"Firefox CLOSED! (was tracking PIDs: {firefox_pids})")
                    asyncio.run_coroutine_threadsafe(
                        self._handle_firefox_closed(),
                        asyncio.get_event_loop()
                    )
                elif current_pids and not firefox_pids:  # Firefox 시작
                    logger.info(f"Firefox STARTED! (PIDs: {current_pids})")
                    asyncio.run_coroutine_threadsafe(
                        self.state_manager.update_state("firefox_status", "ready"),
                        asyncio.get_event_loop()
                    )
                
                firefox_pids = current_pids
            
            time.sleep(1)
    
    async def _handle_firefox_closed(self):
        """Firefox 종료 처리"""
        await self.state_manager.update_state("firefox_status", "closed")
        await self.state_manager.update_state("extension_status", "disconnected")
        
        # system_status도 초기화로 되돌림
        if self.state_manager.state.system_status == "initializing":
            await self.state_manager.update_state("system_status", "idle")
        
        # 모든 세션 무효화
        sessions = self.state_manager.state.sessions.copy()
        for platform in sessions:
            sessions[platform] = {
                'platform': platform,
                'valid': False,
                'last_checked': datetime.now().isoformat(),
                'source': 'firefox_closed',
                'status': 'firefox_closed',
                'error': 'Firefox was closed'
            }
        await self.state_manager.update_state("sessions", sessions)
        await self.state_manager.broadcast_state()
    
    def stop_monitor(self):
        """모니터링 중지"""
        self.running = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=2)

# Global instances
state_manager = SystemStateManager()
firefox_manager = FirefoxManager(state_manager)
session_manager = None  # UnifiedSessionManager 정의 후 초기화
native_command_manager = None  # NativeCommandManager 정의 후 초기화

# ======================== Native Messaging Support ========================

class NativeCommandManager:
    """Native Messaging 명령 관리"""
    
    def __init__(self):
        self.pending_commands: Dict[str, asyncio.Future] = {}
        self._lock = asyncio.Lock()
        
    async def send_command(self, command_type: str, data: Dict[str, Any]) -> str:
        """명령 전송 준비"""
        command_id = str(uuid.uuid4())
        
        # Command에 ID 추가
        data['command_id'] = command_id
        
        # LLM 대화 제외 목록 추가
        if command_type == "collect_conversations":
            exclude_ids = []
            for platform in data.get('platforms', []):
                platform_ids = await llm_tracker.get_tracked_ids(platform)
                exclude_ids.extend(platform_ids)
            data['exclude_ids'] = exclude_ids
        
        # 명령 큐에 추가
        await command_queue.enqueue(
            command_type,
            data,
            priority=2  # HIGH priority
        )
        
        return command_id
    
    async def wait_for_response(self, command_id: str, timeout: int = 30) -> Dict[str, Any]:
        """응답 대기"""
        future = asyncio.Future()
        
        async with self._lock:
            self.pending_commands[command_id] = future
        
        try:
            return await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError:
            async with self._lock:
                self.pending_commands.pop(command_id, None)
            raise HTTPException(status_code=408, detail="Command timeout")
    
    async def complete_command(self, command_id: str, result: Dict[str, Any]):
        """명령 완료 처리"""
        async with self._lock:
            future = self.pending_commands.pop(command_id, None)
            if future and not future.done():
                future.set_result(result)

# ======================== Session Management ========================

class UnifiedSessionManager:
    def __init__(self):
        self.cache: Dict[str, SessionCache] = {}
        self.cache_ttl = 300  # 5 minutes
        self.load_cache()
        
    def load_cache(self):
        """Load session cache from file"""
        try:
            if SESSION_CACHE_PATH.exists():
                with open(SESSION_CACHE_PATH, 'r') as f:
                    data = json.load(f)
                    for platform, info in data.items():
                        self.cache[platform] = SessionCache(**info)
        except Exception as e:
            logger.error(f"Failed to load session cache: {e}")
            
    async def save_cache(self):
        """Save session cache to file with retry"""
        try:
            SESSION_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            cache_data = {k: v.dict() for k, v in self.cache.items()}
            with open(SESSION_CACHE_PATH, 'w') as f:
                json.dump(cache_data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save session cache: {e}")
            raise
            
    async def update_session(self, platform: str, valid: bool, cookies: Optional[List[Dict]] = None, 
                           session_data: Optional[Dict] = None, reason: str = "manual", source: str = "native"):
        """Update session cache"""
        expires_at = None
        if valid:
            if cookies:
                max_expiry = None
                for cookie in cookies:
                    if cookie.get("expires"):
                        expiry_time = datetime.fromtimestamp(cookie["expires"])
                        if max_expiry is None or expiry_time > max_expiry:
                            max_expiry = expiry_time
                expires_at = max_expiry.isoformat() if max_expiry else (datetime.now() + timedelta(days=7)).isoformat()
            else:
                expires_at = (datetime.now() + timedelta(days=7)).isoformat()
        
        session_info = SessionCache(
            platform=platform,
            valid=valid,
            last_checked=datetime.now().isoformat(),
            expires_at=expires_at,
            source=source,
            cookies=cookies,
            status="active" if valid else "expired"
        )
        
        self.cache[platform] = session_info
        await self.save_cache()
        
        # Update system state
        await state_manager.update_state("sessions", {
            **state_manager.state.sessions,
            platform: session_info.dict()
        })
        
        # 메트릭 업데이트
        await metrics.increment_counter(f"session_update.{platform}")
        await metrics.set_gauge(f"session_valid.{platform}", 1.0 if valid else 0.0)
        
        logger.info(f"Updated {platform}: valid={valid}, expires={expires_at}, reason={reason}")
        return valid
        
    async def check_session_health(self) -> Dict[str, Any]:
        """세션 상태 점검"""
        health = {
            "total": len(self.cache),
            "valid": sum(1 for s in self.cache.values() if s.valid),
            "expired": sum(1 for s in self.cache.values() if not s.valid),
            "platforms": {}
        }
        
        for platform, session in self.cache.items():
            health["platforms"][platform] = {
                "valid": session.valid,
                "last_checked": session.last_checked,
                "age_minutes": self._calculate_age_minutes(session.last_checked)
            }
        
        return health
    
    def _calculate_age_minutes(self, timestamp_str: Optional[str]) -> Optional[float]:
        """타임스탬프로부터 경과 시간 계산"""
        if not timestamp_str:
            return None
        
        try:
            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            now = datetime.now() if timestamp.tzinfo else datetime.now()
            age = now - timestamp
            return age.total_seconds() / 60
        except:
            return None

# Initialize managers
session_manager = UnifiedSessionManager()
native_command_manager = NativeCommandManager()

# ======================== API Endpoints ========================

@router.get("/status")
async def get_system_status():
    """Get system status"""
    session_health = await session_manager.check_session_health()
    queue_stats = await command_queue.get_stats()
    metrics_summary = await metrics.get_metrics_summary()
    
    return {
        "status": "operational",
        "system": "argosa",
        "state": state_manager.state.dict(),
        "sessions": session_health,
        "command_queue": queue_stats,
        "metrics": metrics_summary,
        "timestamp": datetime.now().isoformat()
    }

@router.websocket("/ws/state")
async def state_websocket(websocket: WebSocket):
    """WebSocket endpoint - ping/pong 제거"""
    await websocket.accept()
    active_websockets.add(websocket)
    
    try:
        # Send current state
        await websocket.send_json({
            "type": "state_update",
            "data": state_manager.state.dict()
        })
        
        # Keep connection alive - 메시지 대기만
        while True:
            try:
                # 클라이언트 메시지 대기 (ping/pong 제거)
                message = await websocket.receive_json()
                
                # 필요시 메시지 처리
                if message.get("type") == "request_update":
                    await websocket.send_json({
                        "type": "state_update",
                        "data": state_manager.state.dict()
                    })
                    
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                break
                
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        active_websockets.discard(websocket)
        try:
            await websocket.close()
        except:
            pass

# ======================== Firefox Management Endpoints ========================

@router.post("/check_firefox_status")
async def check_firefox_status():
    """Firefox와 Extension 상태 확인"""
    result = await firefox_manager.check_and_start()
    
    # Extension 상태도 함께 반환
    result["extension_status"] = state_manager.state.extension_status
    
    return result

@router.post("/sessions/ensure_firefox")
async def ensure_firefox_running(request: Dict[str, Any]):
    """로그인 페이지 열기"""
    platform = request.get('platform')
    if not platform:
        raise HTTPException(status_code=400, detail="Platform is required")
    
    logger.info(f"🔐 Opening login page for {platform}")
    
    # Extension 연결 확인
    if state_manager.state.extension_status != 'connected':
        raise HTTPException(status_code=503, detail="Extension not connected. Please check Firefox.")
    
    try:
        command_id = await native_command_manager.send_command(
            "open_login_page",
            {"platform": platform}
        )
        
        logger.info(f"✅ Sent open_login_page command: {command_id}")
        
        return {
            "success": True, 
            "command_id": command_id,
            "firefox_status": state_manager.state.firefox_status
        }
        
    except Exception as e:
        logger.error(f"Failed to send open_login_page command: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to open login page: {str(e)}")

@router.post("/sessions/clear_cache")
async def clear_session_cache():
    """세션 캐시 강제 초기화"""
    session_manager.cache.clear()
    
    # 모든 세션을 unknown 상태로
    sessions = {}
    for platform in ['chatgpt', 'claude', 'gemini', 'deepseek', 'grok', 'perplexity']:
        sessions[platform] = {
            'valid': False,
            'status': 'unknown',
            'source': 'cache_cleared'
        }
    
    await state_manager.update_state("sessions", sessions)
    return {"status": "cache_cleared"}

# ======================== Command Queue Endpoints ========================

@router.get("/commands/pending")
async def get_pending_commands():
    """Native Host가 가져갈 명령들"""
    commands = await command_queue.get_pending_commands(limit=5)
    return {"commands": commands}

@router.post("/commands/complete/{command_id}")
async def complete_command_endpoint(command_id: str, result: Dict[str, Any]):
    """명령 완료 알림"""
    # Native 명령 관리자에 알림
    await native_command_manager.complete_command(command_id, result)
    
    return {"status": "completed"}

# ======================== Native Message Handler ========================

@router.post("/native/status")
async def update_native_status(status: Dict[str, Any]):
    """Native Host 상태 업데이트"""
    logger.info(f"Native status update: {status}")
    
    status_type = status.get('status')
    
    # Extension 첫 연결이면 즉시 connected로
    if status_type in ['connected', 'ready', 'alive'] or status.get('extension_ready'):
        if state_manager.state.extension_status != "connected":
            await state_manager.update_state("extension_status", "connected")
            await state_manager.update_state("firefox_status", "ready")
            logger.info("Extension connected - marking as ready")
        
        await state_manager.update_state("extension_last_seen", datetime.now().isoformat())
        
        # sessions 정보가 있으면 업데이트
        if 'sessions' in status:
            await state_manager.update_state("sessions", status['sessions'])
    
    elif status_type == 'disconnected':
        # Extension 연결 해제
        await state_manager.update_state("extension_status", "disconnected")
        await state_manager.update_state("firefox_status", "closed")
        
        # system_status가 initializing이면 idle로
        if state_manager.state.system_status == "initializing":
            await state_manager.update_state("system_status", "idle")
        
        logger.info("Extension disconnected")
    
    # WebSocket으로 상태 브로드캐스트
    await state_manager.broadcast_state()
    
    return {"status": "ok", "updated": True}

@router.post("/native/message")
@with_retry(max_retries=3)  # 데코레이터 추가
async def handle_native_message(message: Dict[str, Any]):
    """Native Messaging Bridge로부터 메시지 처리"""
    
    msg_type = message.get('type')
    msg_id = message.get('id')
    data = message.get('data', {})
    
    logger.info(f"Native message received: {msg_type}")
    logger.debug(f"Message data: {data}")  # 디버깅용
    
    # 메트릭 기록
    await metrics.increment_counter(f"native_message.{msg_type}")
    
    try:
        if msg_type == MessageType.INIT.value:
            # Extension 초기화 - 세션 체크 명령 제거
            await state_manager.update_state("extension_status", "connected")
            await state_manager.update_state("firefox_status", "ready")
            return {"status": "initialized"}
            
        elif msg_type == MessageType.SESSION_UPDATE.value:
            # 세션 업데이트
            platform = data.get('platform')
            valid = data.get('valid', False)
            cookies = data.get('cookies', [])
            source = data.get('source', 'unknown')
            error = data.get('error')
            
            logger.info(f"Session update for {platform}: valid={valid}, source={source}, error={error}")
            
            # 세션 매니저 업데이트
            await session_manager.update_session(
                platform=platform,
                valid=valid,
                cookies=cookies,
                source=source,
                session_data={
                    'error': error,
                    'source': source,
                    'timestamp': datetime.now().isoformat()
                }
            )
            
            # Firefox가 종료된 경우 특별 처리
            if source == 'firefox_closed':
                logger.info(f"Firefox closed while waiting for {platform} login")
                
                # systemState 업데이트
                current_sessions = state_manager.state.sessions.copy()
                current_sessions[platform] = {
                    'platform': platform,
                    'valid': False,
                    'last_checked': datetime.now().isoformat(),
                    'expires_at': None,
                    'source': 'firefox_closed',
                    'status': 'firefox_closed',
                    'error': error or 'Firefox was closed'
                }
                await state_manager.update_state("sessions", current_sessions)
                
                # Firefox 상태도 업데이트
                await state_manager.update_state("firefox_status", "closed")
                await state_manager.update_state("extension_status", "disconnected")
                
                # WebSocket을 통해 즉시 브로드캐스트
                await state_manager.broadcast_state()
                
                return {"status": "firefox_closed"}
            
            # 특별한 source 처리
            elif source in ['tab_closed']:
                logger.info(f"Browser tab closed for {platform}: {source}")
                # systemState 업데이트
                current_sessions = state_manager.state.sessions.copy()
                current_sessions[platform] = {
                    'platform': platform,
                    'valid': False,
                    'last_checked': datetime.now().isoformat(),
                    'expires_at': None,
                    'source': source,
                    'status': source,
                    'error': error or 'Tab closed'
                }
                await state_manager.update_state("sessions", current_sessions)
                
            elif source == 'timeout':
                logger.info(f"Login timeout for {platform}")
                # systemState 업데이트
                current_sessions = state_manager.state.sessions.copy()
                current_sessions[platform] = {
                    'platform': platform,
                    'valid': False,
                    'last_checked': datetime.now().isoformat(),
                    'expires_at': None,
                    'source': 'timeout',
                    'status': 'timeout',
                    'error': error
                }
                await state_manager.update_state("sessions", current_sessions)
                
            elif source == 'login_detection' and valid:
                logger.info(f"Login detected for {platform}")
                # 로그인 성공 시 정상 세션 정보로 업데이트
                current_sessions = state_manager.state.sessions.copy()
                current_sessions[platform] = {
                    'platform': platform,
                    'valid': True,
                    'last_checked': datetime.now().isoformat(),
                    'expires_at': (datetime.now() + timedelta(days=7)).isoformat(),
                    'source': 'login_detection',
                    'status': 'active'
                }
                await state_manager.update_state("sessions", current_sessions)
            
            # WebSocket을 통해 즉시 브로드캐스트
            await state_manager.broadcast_state()
            
            # 명령 완료 처리 (msg_id로)
            if msg_id and msg_id.startswith('msg_'):  # Extension에서 온 메시지인 경우만
                await native_command_manager.complete_command(msg_id, {
                    "success": True,
                    "platform": platform,
                    "source": source,
                    "valid": valid
                })
            
            return {"status": "updated"}
            
        elif msg_type == MessageType.COLLECTION_RESULT.value:
            # 대화 수집 결과
            platform = data.get('platform')
            conversations = data.get('conversations', [])
            excluded_ids = data.get('excluded_llm_ids', [])
            command_id = data.get('command_id')
            
            # LLM 필터링
            filtered = await llm_tracker.filter_conversations(conversations, platform)
            
            # 저장
            if filtered["conversations"]:
                save_response = await save_conversations_internal({
                    "platform": platform,
                    "conversations": filtered["conversations"],
                    "metadata": {
                        "source": "native_collection",
                        **filtered["filter_stats"]
                    }
                })
                
                logger.info(f"Saved {len(filtered['conversations'])} conversations from {platform}")
            
            # 명령 완료
            if command_id:
                await native_command_manager.complete_command(command_id, {
                    "success": True,
                    "collected": len(filtered["conversations"]),
                    "excluded": filtered["excluded_count"]
                })
            
            return {"status": "saved", "count": len(filtered["conversations"])}
            
        elif msg_type == MessageType.LLM_QUERY_RESULT.value:
            # LLM 질문 결과
            conversation_id = data.get('conversation_id')
            platform = data.get('platform')
            query = data.get('query')
            response_text = data.get('response')
            command_id = data.get('command_id')
            
            # LLM 대화로 추적
            await llm_tracker.track(conversation_id, platform, {
                'query': query,
                'source': 'llm_query',
                'created_at': datetime.now().isoformat()
            })
            
            # 명령 완료
            if command_id:
                await native_command_manager.complete_command(command_id, data)
            
            return {"status": "tracked", "conversation_id": conversation_id}
            
        elif msg_type == MessageType.CRAWL_RESULT.value:
            # 웹 크롤링 결과
            url = data.get('url')
            content = data.get('content')
            extracted = data.get('extracted_data', {})
            command_id = data.get('command_id')
            
            # 명령 완료
            if command_id:
                await native_command_manager.complete_command(command_id, data)
            
            return {"status": "crawled", "url": url}
            
        elif msg_type == MessageType.ERROR.value:
            # 에러 처리
            error_msg = data.get('error', 'Unknown error')
            command_id = data.get('command_id')
            platform = data.get('platform')
            logger.error(f"Native error: {error_msg}")
            
            # 플랫폼 관련 에러인 경우 세션 상태 업데이트
            if platform:
                current_sessions = state_manager.state.sessions.copy()
                current_sessions[platform] = {
                    'platform': platform,
                    'valid': False,
                    'last_checked': datetime.now().isoformat(),
                    'expires_at': None,
                    'source': 'error',
                    'status': 'error',
                    'error': error_msg
                }
                await state_manager.update_state("sessions", current_sessions)
                await state_manager.broadcast_state()
            
            if command_id:
                await native_command_manager.complete_command(command_id, {
                    "success": False,
                    "error": error_msg
                })
            
            return {"status": "error", "message": error_msg}
            
        else:
            logger.warning(f"Unknown message type: {msg_type}")
            return {"status": "unknown", "type": msg_type}
            
    except Exception as e:
        logger.error(f"Native message handling error: {e}")
        await metrics.increment_counter("native_message.error")
        return {"status": "error", "message": str(e)}

# 에러 처리가 적용된 명령 처리 함수
@error_handler.with_error_handling(
    severity=ErrorSeverity.HIGH,
    max_retries=2,
    fallback_value={"status": "error", "message": "Command processing failed"}
)
async def process_command_with_retry(command_type: str, data: Dict[str, Any]):
    """에러 처리가 적용된 명령 처리"""
    # Native 명령 전송
    command_id = await native_command_manager.send_command(command_type, data)
    
    # 응답 대기
    result = await native_command_manager.wait_for_response(command_id, timeout=60)
    
    if not result.get("success", False):
        raise Exception(result.get("error", "Command failed"))
    
    return result

# ======================== Native Collection Endpoints ========================

@router.post("/collect/start")
async def start_collection_native(request: Dict[str, Any]):
    """Native Messaging을 통한 대화 수집"""
    platforms = request.get('platforms', [])
    settings = request.get('settings', {})
    
    try:
        result = await process_command_with_retry(
            "collect_conversations",
            {
                "platforms": platforms,
                "exclude_llm": True,
                "settings": settings
            }
        )
        
        return {
            "success": True,
            "collected": result.get('collected', 0),
            "excluded_llm": result.get('excluded', 0)
        }
    except Exception as e:
        logger.error(f"Collection failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@router.post("/query/llm")
async def query_llm_native(request: Dict[str, Any]):
    """Native Messaging을 통한 LLM 질문"""
    platform = request.get('platform')
    query = request.get('query')
    
    if not platform or not query:
        raise HTTPException(status_code=400, detail="Platform and query required")
    
    try:
        result = await process_command_with_retry(
            "execute_llm_query",
            {
                "platform": platform,
                "query": query,
                "mark_as_llm": True
            }
        )
        
        return {
            "success": True,
            "conversation_id": result.get('conversation_id'),
            "response": result.get('response'),
            "metadata": {
                "source": "llm_query",
                "platform": platform
            }
        }
    except Exception as e:
        logger.error(f"LLM query failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@router.post("/crawl/web")
async def crawl_web_native(request: Dict[str, Any]):
    """Native Messaging을 통한 웹 크롤링"""
    url = request.get('url')
    search_query = request.get('query')
    
    if not url:
        raise HTTPException(status_code=400, detail="URL required")
    
    try:
        result = await process_command_with_retry(
            "crawl_web",
            {
                "url": url,
                "search_query": search_query,
                "extract_rules": request.get('extract_rules', {})
            }
        )
        
        return {
            "success": True,
            "content": result.get('content'),
            "extracted": result.get('extracted_data', {})
        }
    except Exception as e:
        logger.error(f"Web crawl failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }

# ======================== Metrics Endpoints ========================

@router.get("/metrics/summary")
async def get_metrics_summary():
    """메트릭 요약"""
    return await metrics.get_metrics_summary()

# ======================== Initialization and Shutdown ========================

async def initialize():
    """Initialize Argosa core system"""
    logger.info("Initializing Argosa core system...")
    
    # Create directories
    DATA_PATH.mkdir(parents=True, exist_ok=True)
    
    # Initialize shared services
    await cache_manager.initialize()
    await command_queue.initialize()
    await metrics.initialize()
    
    # Command handlers 등록
    command_queue.register_handler("collect_conversations", handle_collect_command)
    command_queue.register_handler("execute_llm_query", handle_llm_query_command)
    command_queue.register_handler("crawl_web", handle_crawl_command)
    
    # Initialize state
    await state_manager.update_state("system_status", "idle")
    await state_manager.update_state("firefox_status", "closed")
    await state_manager.update_state("extension_status", "disconnected")
    
    # Firefox 모니터 시작
    firefox_manager.start_monitor()
    
    logger.info("Argosa core system initialized")

async def shutdown():
    """Shutdown Argosa core system"""
    logger.info("Shutting down Argosa core system...")
    
    # Firefox 모니터 중지
    firefox_manager.stop_monitor()
    
    # Close WebSocket connections
    for websocket in list(active_websockets):
        try:
            await websocket.close()
        except:
            pass
    active_websockets.clear()
    
    # Shutdown shared services
    await command_queue.shutdown()
    await metrics.shutdown()
    await cache_manager.cleanup()
    
    logger.info("Argosa core system shutdown complete")

# Command handlers
async def handle_collect_command(command):
    """대화 수집 명령 처리"""
    # Native Host로 전달될 명령
    return {"status": "processed", "command_id": command.id}

async def handle_llm_query_command(command):
    """LLM 질의 명령 처리"""
    return {"status": "processed", "command_id": command.id}

async def handle_crawl_command(command):
    """웹 크롤링 명령 처리"""
    return {"status": "processed", "command_id": command.id}

async def handle_open_login_command(command):
    """로그인 페이지 열기 명령 처리 - Native Host가 처리하도록 패스"""
    # 아무것도 하지 않음 - Native Host가 polling으로 가져감
    return {"status": "pending", "message": "Waiting for Native Host to process"}

# Internal helper for saving conversations
async def save_conversations_internal(data: Dict[str, Any]):
    """내부 대화 저장 함수"""
    return await conversation_saver.save_conversations(
        platform=data['platform'],
        conversations=data['conversations'],
        metadata=data.get('metadata', {})
    )

# ============= native_host.py =============
# native_host_improved.py - Firefox 프로세스 모니터링 포함
import sys
import json
import struct
import asyncio
import logging
import os
from typing import Dict, Any, Optional, List, Set
import traceback
from datetime import datetime
import aiohttp
import psutil
import threading

# 로깅 설정
log_dir = os.path.join(os.getenv('PROGRAMDATA', 'C:\\ProgramData'), 'Argosa')
os.makedirs(log_dir, exist_ok=True)
log_path = os.path.join(log_dir, 'native_host.log')

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_path, mode='a', encoding='utf-8'),
    ]
)

logger = logging.getLogger(__name__)

# Windows 바이너리 모드 설정
if sys.platform == "win32":
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

class FirefoxMonitor:
    """Firefox 프로세스 모니터링"""
    
    def __init__(self, callback):
        self.callback = callback
        self.monitoring = False
        self.firefox_pids: Set[int] = set()
        self.login_tabs: Dict[str, Dict[str, Any]] = {}  # platform -> {tab_id, start_time}
        self._monitor_thread = None
        # Firefox 모니터링 자동 시작
        self.start_monitoring()
        
    def start_monitoring(self):
        """모니터링 시작"""
        if not self.monitoring:
            self.monitoring = True
            self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self._monitor_thread.start()
            logger.info("Firefox monitoring started")
    
    def stop_monitoring(self):
        """모니터링 중지"""
        self.monitoring = False
        if self._monitor_thread:
            self._monitor_thread.join(timeout=2)
        logger.info("Firefox monitoring stopped")
    
    def _monitor_loop(self):
        """Firefox 프로세스 모니터링 루프"""
        while self.monitoring:
            try:
                # 현재 Firefox 프로세스들 찾기
                current_pids = set()
                for proc in psutil.process_iter(['pid', 'name']):
                    if proc.info['name'] and 'firefox' in proc.info['name'].lower():
                        current_pids.add(proc.info['pid'])
                
                # 종료된 프로세스 감지
                closed_pids = self.firefox_pids - current_pids
                if closed_pids and len(current_pids) == 0:  # Firefox가 완전히 종료됨
                    logger.info(f"Firefox completely closed (was tracking: {closed_pids})")
                    # Firefox가 종료되면 모든 로그인 대기 중인 플랫폼에 대해 알림
                    try:
                        # 새로운 이벤트 루프에서 실행
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        loop.run_until_complete(self._handle_firefox_closed())
                        loop.close()
                    except Exception as e:
                        logger.error(f"Error handling Firefox closed: {e}")
                
                # 새로운 프로세스 감지
                new_pids = current_pids - self.firefox_pids
                if new_pids:
                    logger.info(f"New Firefox processes: {new_pids}")
                
                self.firefox_pids = current_pids
                
            except Exception as e:
                logger.error(f"Monitor loop error: {e}")
            
            # 1초마다 체크
            import time
            time.sleep(1)
    
    async def _handle_firefox_closed(self):
        """Firefox 종료 처리"""
        logger.info(f"Handling Firefox closed event. Login tabs: {list(self.login_tabs.keys())}")
        
        # 로그인 대기 중인 플랫폼에 대해 알림
        for platform, info in list(self.login_tabs.items()):
            logger.info(f"Sending firefox_closed event for {platform}")
            await self.callback('firefox_closed', {
                'platform': platform,
                'error': 'Firefox was closed',
                'source': 'firefox_monitor'
            })
        self.login_tabs.clear()
        
        # Firefox 종료 자체도 백엔드에 알림
        logger.info("Notifying backend that Firefox completely closed")
        await self.callback('firefox_closed', {
            'firefox_status': 'closed',
            'extension_status': 'disconnected',
            'source': 'firefox_monitor'
        })
    
    def add_login_tab(self, platform: str, tab_info: Dict[str, Any]):
        """로그인 탭 추가"""
        self.login_tabs[platform] = {
            **tab_info,
            'start_time': datetime.now()
        }
        logger.info(f"Tracking login tab for {platform}")
    
    def remove_login_tab(self, platform: str):
        """로그인 탭 제거"""
        if platform in self.login_tabs:
            del self.login_tabs[platform]
            logger.info(f"Stopped tracking login tab for {platform}")

class ImprovedNativeHost:
    """개선된 Native Host - Firefox 모니터링 포함"""
    
    def __init__(self):
        self.backend_url = "http://localhost:8000/api/argosa"
        self.session: Optional[aiohttp.ClientSession] = None
        self.running = True
        self.pending_commands = []
        
        # Firefox 모니터
        self.firefox_monitor = FirefoxMonitor(self.handle_firefox_event)
        
        logger.info("ImprovedNativeHost initialized")
    
    async def initialize_session(self):
        """HTTP 세션 초기화"""
        if not self.session:
            self.session = aiohttp.ClientSession()
            logger.info("HTTP session initialized")
    
    async def handle_firefox_event(self, event_type: str, data: Dict[str, Any]):
        """Firefox 이벤트 처리"""
        logger.info(f"Firefox event: {event_type}, data: {data}")
        
        if event_type == 'firefox_closed':
            platform = data.get('platform')
            if platform:
                logger.info(f"Notifying backend that Firefox closed for {platform}")
                # Backend에 알림
                await self.notify_backend('native/message', {
                    'type': 'session_update',
                    'id': f'firefox_closed_{platform}_{datetime.now().timestamp()}',
                    'data': {
                        'platform': platform,
                        'valid': False,
                        'source': 'firefox_closed',
                        'error': 'Firefox was closed',
                        'status': 'firefox_closed'
                    }
                })
    
    async def send_to_extension(self, message: Dict[str, Any]):
        """Extension으로 메시지 전송"""
        try:
            encoded = self.encode_message(message)
            sys.stdout.buffer.write(encoded)
            sys.stdout.buffer.flush()
            logger.info(f"Sent to extension: {message.get('type')} (size: {len(encoded)})")
            logger.debug(f"Full message: {message}")
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            logger.error(traceback.format_exc())
    
    def encode_message(self, message: Dict[str, Any]) -> bytes:
        """메시지 인코딩"""
        encoded = json.dumps(message).encode('utf-8')
        length_bytes = struct.pack('I', len(encoded))
        return length_bytes + encoded
    
    async def handle_extension_message(self, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extension 메시지 처리"""
        msg_type = message.get('type', 'unknown')
        msg_id = message.get('id', 'no-id')
        data = message.get('data', {})
        
        logger.info(f"Handling extension message: type={msg_type}, id={msg_id}")
        
        try:
            if msg_type == 'init':
                # Firefox 모니터링 시작
                self.firefox_monitor.start_monitoring()
                
                # 백엔드에 연결 상태 즉시 알림
                await self.notify_backend('native/message', {
                    'type': 'init',
                    'id': msg_id,
                    'data': {
                        'status': 'connected',
                        'extension_connected': True,
                        'timestamp': datetime.now().isoformat()
                    }
                })
                
                return {
                    'type': 'init_response',
                    'id': msg_id,
                    'status': 'ready',
                    'capabilities': ['collect', 'llm_query', 'session_check', 'open_login_page']
                    # check_all_sessions 제거
                }
            
            elif msg_type == 'init_ack':
                # Extension이 init_response를 받았다는 확인
                logger.info("Extension acknowledged initialization")
                # 백엔드에 완전 연결 상태 알림
                await self.notify_backend('native/status', {
                    'status': 'fully_connected',
                    'extension_ready': True,
                    'native_ready': True,
                    'timestamp': datetime.now().isoformat()
                })
                return None
            
            elif msg_type == 'session_update':
                # 세션 업데이트
                platform = data.get('platform')
                source = data.get('source')
                
                # 로그인 성공이면 추적 중지
                if data.get('valid') and source == 'login_detection':
                    self.firefox_monitor.remove_login_tab(platform)
                
                # 탭이 닫히거나 Firefox가 종료된 경우도 추적 중지
                elif source in ['tab_closed', 'firefox_closed']:
                    self.firefox_monitor.remove_login_tab(platform)
                
                # 백엔드로 전달
                await self.notify_backend('native/message', {
                    'type': 'session_update',
                    'id': msg_id,
                    'data': data
                })
                
                return None
            
            elif msg_type in ['collection_result', 'llm_query_result', 'session_check_result', 'error']:
                # 이런 메시지들은 바로 백엔드로 전달
                await self.notify_backend('native/message', message)
                return None
                
            else:
                # 기타 메시지는 백엔드로 전달
                logger.warning(f"Unknown message type from extension: {msg_type}")
                await self.notify_backend('native/message', message)
                return None
                
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            logger.error(traceback.format_exc())
            return {
                'type': 'error',
                'id': msg_id,
                'error': str(e)
            }
    
    async def notify_backend(self, endpoint: str, data: Dict[str, Any]):
        """백엔드에 알림"""
        try:
            if not self.session:
                await self.initialize_session()
            
            url = f"{self.backend_url}/data/{endpoint}"
            
            async with self.session.post(url, json=data, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status != 200:
                    logger.error(f"Backend notification failed: {response.status}")
                else:
                    logger.debug(f"Backend notified: {endpoint}")
        except Exception as e:
            logger.error(f"Failed to notify backend: {e}")
    
    async def command_polling_loop(self):
        """백엔드 명령 폴링"""
        logger.info("Starting command polling loop")
        
        while self.running:
            try:
                if not self.session:
                    await self.initialize_session()
                
                # 명령 가져오기
                url = f"{self.backend_url}/data/commands/pending"
                async with self.session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                    if response.status == 200:
                        data = await response.json()
                        commands = data.get('commands', [])
                        
                        # 명령이 있을 때만 로그
                        if commands:
                            logger.info(f"Got {len(commands)} pending commands")
                            for cmd in commands:
                                await self.process_backend_command(cmd)
                
                await asyncio.sleep(2)
                
            except asyncio.TimeoutError:
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Command polling error: {e}")
                await asyncio.sleep(5)
    
    async def process_backend_command(self, command: Dict[str, Any]):
        """백엔드 명령 처리"""
        command_type = command.get('type')
        command_id = command.get('id')
        data = command.get('data', {})
        
        logger.info(f"Processing command: {command_type}")
        
        # 플랫폼 URL 매핑
        platform_urls = {
            'chatgpt': 'https://chat.openai.com',
            'claude': 'https://claude.ai',
            'gemini': 'https://gemini.google.com',
            'deepseek': 'https://chat.deepseek.com',
            'grok': 'https://grok.x.ai',
            'perplexity': 'https://www.perplexity.ai'
        }
        
        if command_type == 'open_login_page':
            platform = data.get('platform')
            command_id = data.get('command_id')
            url = platform_urls.get(platform)
            
            if platform and url:
                logger.info(f"Opening login page for {platform}: {url}")
                # 로그인 탭 추적 시작
                self.firefox_monitor.add_login_tab(platform, {
                    'command_id': command_id,
                    'url': url,
                    'timestamp': datetime.now().isoformat()
                })
                
                # Extension으로 전달 (URL 포함)
                await self.send_to_extension({
                    'type': command_type,
                    'id': command_id,
                    'data': {
                        **data,
                        'url': url  # URL 추가
                    }
                })
        else:
            # Extension으로 전달
            await self.send_to_extension({
                'type': command_type,
                'id': command_id,
                'data': data
            })
        
        # 명령 전송 완료 알림
        complete_url = f"{self.backend_url}/data/commands/complete/{command_id}"
        try:
            await self.session.post(complete_url, json={'status': 'sent'})
        except Exception as e:
            logger.error(f"Failed to mark command complete: {e}")
    
    async def read_stdin(self):
        """stdin에서 메시지 읽기"""
        logger.info("Starting stdin reader...")
        
        # 동기 방식으로 읽기 (Windows에서 더 안정적)
        def read_stdin_sync():
            buffer = b''
            
            while self.running:
                try:
                    # 4바이트 길이 헤더 읽기
                    while len(buffer) < 4:
                        chunk = sys.stdin.buffer.read(1)
                        if not chunk:
                            logger.info("Extension disconnected - no data")
                            return None
                        buffer += chunk
                    
                    # 메시지 길이 추출
                    message_length = struct.unpack('I', buffer[:4])[0]
                    logger.debug(f"Message length: {message_length}")
                    
                    # 메시지 본문 읽기
                    buffer = b''
                    while len(buffer) < message_length:
                        remaining = message_length - len(buffer)
                        chunk = sys.stdin.buffer.read(remaining)
                        if not chunk:
                            logger.error("Extension disconnected while reading message")
                            return None
                        buffer += chunk
                    
                    # 메시지 디코드
                    try:
                        message = json.loads(buffer.decode('utf-8'))
                        logger.info(f"Received from extension: {message}")
                        return message
                    except Exception as e:
                        logger.error(f"Failed to decode message: {e}")
                        logger.error(f"Raw data: {buffer}")
                        continue
                        
                except Exception as e:
                    logger.error(f"Error in read_stdin_sync: {e}")
                    logger.error(traceback.format_exc())
                    return None
        
        # 비동기로 실행
        try:
            while self.running:
                message = await asyncio.get_event_loop().run_in_executor(
                    None, read_stdin_sync
                )
                
                if message is None:
                    logger.info("Stdin reader stopping - no message")
                    self.running = False
                    break
                
                # 메시지 처리
                try:
                    response = await self.handle_extension_message(message)
                    if response:
                        await self.send_to_extension(response)
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    logger.error(traceback.format_exc())
                    
        except Exception as e:
            logger.error(f"Fatal error in read_stdin: {e}")
            logger.error(traceback.format_exc())
            self.running = False
        
        logger.info("Stdin reader stopped")
    
    async def run(self):
        """메인 실행"""
        logger.info("Starting main loop...")
        
        try:
            await self.initialize_session()
            
            # 태스크 실행
            stdin_task = asyncio.create_task(self.read_stdin())
            polling_task = asyncio.create_task(self.command_polling_loop())
            
            logger.info("Tasks created - waiting for stdin and command polling")
            
            await asyncio.gather(stdin_task, polling_task)
            
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Fatal error: {e}")
            logger.error(traceback.format_exc())
        finally:
            logger.info("Shutting down...")
            self.running = False
            
            # Firefox 모니터링 중지
            self.firefox_monitor.stop_monitoring()
            
            # 연결 해제 알림
            try:
                await self.notify_backend('native/status', {
                    'status': 'disconnected',
                    'timestamp': datetime.now().isoformat()
                })
            except:
                pass
            
            if self.session:
                await self.session.close()

def main():
    """메인 진입점"""
    logger.info("=== Native Host Starting (Improved Version) ===")
    
    try:
        host = ImprovedNativeHost()
        asyncio.run(host.run())
    except Exception as e:
        logger.error(f"Fatal error in main: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()