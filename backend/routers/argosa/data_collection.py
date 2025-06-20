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
EXTENSION_HEARTBEAT_PATH = DATA_PATH / "extension_heartbeat.json"

# ======================== Data Models ========================

class MessageType(Enum):
    """Native Messaging 메시지 타입"""
    INIT = "init"
    HEARTBEAT = "heartbeat"
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

class ExtensionHeartbeat(BaseModel):
    timestamp: str
    status: str
    firefox_pid: Optional[int] = None
    sessions: Optional[Dict[str, bool]] = None
    version: str = "2.0"

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

# Global state manager
state_manager = SystemStateManager()

# ======================== Firefox Running ========================
@router.post("/sessions/ensure_firefox")
async def ensure_firefox_running(request: Dict[str, Any]):
    """Firefox가 실행 중인지 확인하고, 아니면 실행"""
    
    platform = request.get('platform')
    if not platform:
        raise HTTPException(status_code=400, detail="Platform is required")
    
    logger.info(f"🔐 Ensuring Firefox for {platform} login")
    
    # Firefox 프로세스 확인
    firefox_running = any(p.name().lower().startswith('firefox') for p in psutil.process_iter())
    
    if not firefox_running:
        logger.info("Firefox not running, starting...")
        # Firefox 실행
        profile_path = request.get('profile_path', 'F:\\ONE_AI\\firefox-profile')
        try:
            subprocess.Popen([
                r"C:\Program Files\Firefox Developer Edition\firefox.exe",
                '-profile', profile_path
            ])
            
            # Firefox 상태 업데이트
            await state_manager.update_state("firefox_status", "opening")
            
            # Extension 로드 대기
            await asyncio.sleep(5)
            
            # Firefox 상태 업데이트
            await state_manager.update_state("firefox_status", "ready")
            
        except Exception as e:
            logger.error(f"Failed to start Firefox: {e}")
            await state_manager.update_state("firefox_status", "error")
            raise HTTPException(status_code=500, detail=f"Failed to start Firefox: {str(e)}")
    else:
        logger.info("Firefox already running")
        await state_manager.update_state("firefox_status", "ready")
    
    # Native Messaging으로 로그인 페이지 열기 명령 전송
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

# 전역 Native 명령 관리자
native_command_manager = NativeCommandManager()

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

# Global session manager
session_manager = UnifiedSessionManager()

# ======================== Extension Communication ========================

class ExtensionMonitor:
    def __init__(self):
        self.last_heartbeat: Optional[datetime] = None
        self.check_interval = 10  # seconds
        self._monitor_task = None
        
    async def start_monitoring(self):
        """Start monitoring Extension heartbeat"""
        if self._monitor_task is None:
            self._monitor_task = asyncio.create_task(self._monitoring_loop())
    
    async def _monitoring_loop(self):
        """Monitoring loop"""
        while True:
            await asyncio.sleep(self.check_interval)
            await self.check_heartbeat()
            
    async def check_heartbeat(self):
        """Check Extension heartbeat status"""
        try:
            if EXTENSION_HEARTBEAT_PATH.exists():
                with open(EXTENSION_HEARTBEAT_PATH, 'r') as f:
                    data = json.load(f)
                    heartbeat = ExtensionHeartbeat(**data)
                    
                last_seen = datetime.fromisoformat(heartbeat.timestamp)
                
                # Update state
                if (datetime.now() - last_seen).seconds < 30:
                    await state_manager.update_state("extension_status", "connected")
                    await state_manager.update_state("extension_last_seen", heartbeat.timestamp)
                else:
                    await state_manager.update_state("extension_status", "disconnected")
                    
        except Exception as e:
            logger.error(f"Error checking heartbeat: {e}")
            await state_manager.update_state("extension_status", "disconnected")
            
    async def update_heartbeat(self, heartbeat: ExtensionHeartbeat):
        """Update heartbeat from Extension"""
        try:
            EXTENSION_HEARTBEAT_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(EXTENSION_HEARTBEAT_PATH, 'w') as f:
                json.dump(heartbeat.dict(), f)
                
            self.last_heartbeat = datetime.now()
            await state_manager.update_state("extension_status", "connected")
            await state_manager.update_state("extension_last_seen", heartbeat.timestamp)
            
            # Update session info if provided
            if heartbeat.sessions:
                for platform, valid in heartbeat.sessions.items():
                    await session_manager.update_session(platform, valid, source="heartbeat")
                    
        except Exception as e:
            logger.error(f"Error updating heartbeat: {e}")
    
    async def stop_monitoring(self):
        """Stop monitoring"""
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

# Global Extension monitor
extension_monitor = ExtensionMonitor()

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
    return {"status": "ok"}

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
            # Extension 초기화
            await state_manager.update_state("extension_status", "connected")
            await state_manager.update_state("firefox_status", "ready")
            return {"status": "initialized"}
            
        elif msg_type == MessageType.HEARTBEAT.value:
            # Heartbeat 처리
            await extension_monitor.update_heartbeat(ExtensionHeartbeat(
                timestamp=datetime.now().isoformat(),
                status="active",
                sessions=data.get('sessions', {})
            ))
            return {"status": "alive"}
            
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
    
    # Start extension monitoring
    await extension_monitor.start_monitoring()
    
    # Command handlers 등록
    command_queue.register_handler("collect_conversations", handle_collect_command)
    command_queue.register_handler("execute_llm_query", handle_llm_query_command)
    command_queue.register_handler("crawl_web", handle_crawl_command)
    command_queue.register_handler("open_login_page", handle_open_login_command) 
    
    # Initialize state
    await state_manager.update_state("system_status", "idle")
    await state_manager.update_state("firefox_status", "closed")
    await state_manager.update_state("extension_status", "disconnected")
    
    logger.info("Argosa core system initialized")

async def shutdown():
    """Shutdown Argosa core system"""
    logger.info("Shutting down Argosa core system...")
    
    # Stop extension monitoring
    await extension_monitor.stop_monitoring()
    
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
    """로그인 페이지 열기 명령 처리"""
    platform = command.data.get('platform')
    
    platform_urls = {
        'chatgpt': 'https://chat.openai.com',
        'claude': 'https://claude.ai',
        'gemini': 'https://gemini.google.com',
        'deepseek': 'https://chat.deepseek.com',
        'grok': 'https://grok.x.ai',
        'perplexity': 'https://www.perplexity.ai'
    }
    
    url = platform_urls.get(platform)
    if url:
        return {
            "status": "processed", 
            "command_id": command.id, 
            "url": url,
            "platform": platform,
            "action": "open_tab"
        }
    
    return {"status": "error", "command_id": command.id}

# Internal helper for saving conversations
async def save_conversations_internal(data: Dict[str, Any]):
    """내부 대화 저장 함수"""
    return await conversation_saver.save_conversations(
        platform=data['platform'],
        conversations=data['conversations'],
        metadata=data.get('metadata', {})
    )