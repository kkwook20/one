# backend/routers/argosa/data_collection.py - Argosa 핵심 데이터 수집 시스템 (개선된 버전)

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
from functools import wraps

# 설정
logger = logging.getLogger(__name__)

# Create router
router = APIRouter()

# WebSocket connections
active_websockets: Set[WebSocket] = set()

# Configuration paths
DATA_PATH = Path("./data/argosa")
STATE_FILE_PATH = DATA_PATH / "system_state.json"
COMMAND_QUEUE_PATH = DATA_PATH / "command_queue.json"
SESSION_CACHE_PATH = DATA_PATH / "session_cache.json"
EXTENSION_HEARTBEAT_PATH = DATA_PATH / "extension_heartbeat.json"

# ======================== Enhanced Error Handling ========================

def with_retry(max_retries: int = 3, delay: float = 1.0):
    """재시도 데코레이터"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    if attempt < max_retries - 1:
                        await asyncio.sleep(delay * (attempt + 1))
                    logger.warning(f"Retry {attempt + 1}/{max_retries} for {func.__name__}: {e}")
            raise last_error
        return wrapper
    return decorator

def with_fallback(fallback_value=None):
    """폴백 데코레이터"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Fallback for {func.__name__}: {e}")
                return fallback_value
        return wrapper
    return decorator

# ======================== Metrics System ========================

class MetricsCollector:
    """간단한 메트릭 수집기"""
    def __init__(self):
        self.counters: Dict[str, int] = {}
        self.gauges: Dict[str, float] = {}
        self.events: List[Dict[str, Any]] = []
        self._lock = asyncio.Lock()
        
    async def increment_counter(self, name: str, value: int = 1):
        """카운터 증가"""
        async with self._lock:
            self.counters[name] = self.counters.get(name, 0) + value
            
    async def set_gauge(self, name: str, value: float):
        """게이지 설정"""
        async with self._lock:
            self.gauges[name] = value
            
    async def record_event(self, event_type: str, tags: Dict[str, Any] = None):
        """이벤트 기록"""
        async with self._lock:
            self.events.append({
                "type": event_type,
                "timestamp": datetime.now().isoformat(),
                "tags": tags or {}
            })
            # 최근 1000개만 유지
            if len(self.events) > 1000:
                self.events = self.events[-1000:]
                
    async def get_summary(self) -> Dict[str, Any]:
        """메트릭 요약"""
        async with self._lock:
            return {
                "counters": self.counters.copy(),
                "gauges": self.gauges.copy(),
                "recent_events": self.events[-10:]
            }

# Global metrics collector
metrics = MetricsCollector()

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

class CommandPriority:
    NORMAL = 0
    HIGH = 1
    URGENT = 2

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

class Command(BaseModel):
    id: str
    type: str  # collect_conversations, execute_llm_query, crawl_web, etc.
    priority: int = CommandPriority.NORMAL
    data: Dict[str, Any]
    timestamp: str
    status: str = "pending"  # pending, processing, completed, failed
    result: Optional[Dict[str, Any]] = None

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

# ======================== LLM Tracker ========================

class LLMTracker:
    """LLM 대화 추적기"""
    def __init__(self):
        self.tracked_ids: Dict[str, Set[str]] = {}
        self._lock = asyncio.Lock()
        
    async def track(self, conversation_id: str, platform: str, metadata: Dict[str, Any]):
        """대화 추적"""
        async with self._lock:
            if platform not in self.tracked_ids:
                self.tracked_ids[platform] = set()
            self.tracked_ids[platform].add(conversation_id)
            
        await metrics.increment_counter(f"llm_tracked.{platform}")
        logger.info(f"Tracking LLM conversation: {conversation_id} on {platform}")
        
    async def get_tracked_ids(self, platform: str) -> List[str]:
        """추적 중인 ID 목록"""
        async with self._lock:
            return list(self.tracked_ids.get(platform, set()))
            
    async def filter_conversations(self, conversations: List[Dict], platform: str) -> Dict[str, Any]:
        """LLM 대화 필터링"""
        tracked = await self.get_tracked_ids(platform)
        filtered = []
        excluded = 0
        
        for conv in conversations:
            if conv.get('id') not in tracked:
                filtered.append(conv)
            else:
                excluded += 1
                
        return {
            "conversations": filtered,
            "excluded_count": excluded,
            "filter_stats": {
                "total": len(conversations),
                "filtered": len(filtered),
                "excluded": excluded
            }
        }

# Global LLM tracker
llm_tracker = LLMTracker()

# ======================== Enhanced Firefox Session Management ========================

class EnhancedFirefoxSessionManager:
    """Firefox Extension과 통신하는 세션 관리자"""
    
    def __init__(self):
        self.extension_port = int(os.getenv("FIREFOX_EXTENSION_PORT", "9292"))
        self.extension_available = False
        self._check_extension_availability()
        
    def _check_extension_availability(self):
        """Extension 사용 가능 여부 확인"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('localhost', self.extension_port))
            sock.close()
            self.extension_available = (result == 0)
            
            if self.extension_available:
                logger.info(f"Firefox extension available on port {self.extension_port}")
            else:
                logger.warning(f"Firefox extension not available on port {self.extension_port}")
                
        except Exception as e:
            logger.error(f"Error checking Firefox extension: {e}")
            self.extension_available = False

# ======================== Improved State Management ========================

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
            
    @with_retry(max_retries=3, delay=0.5)
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
        await metrics.record_event("state_update", {"field": key})
            
    @with_fallback(fallback_value=None)
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

# ======================== Command Queue ========================

class UnifiedCommandQueue:
    def __init__(self):
        self.queue: List[Command] = []
        self.queue_lock = asyncio.Lock()
        self.handlers: Dict[str, Any] = {}
        self.load_queue()
        
    def load_queue(self):
        """Load queue from file"""
        try:
            if COMMAND_QUEUE_PATH.exists():
                with open(COMMAND_QUEUE_PATH, 'r') as f:
                    data = json.load(f)
                    self.queue = [Command(**cmd) for cmd in data]
        except Exception as e:
            logger.error(f"Failed to load command queue: {e}")
            
    @with_retry(max_retries=3, delay=0.5)
    async def save_queue(self):
        """Save queue to file with retry"""
        async with self.queue_lock:
            try:
                COMMAND_QUEUE_PATH.parent.mkdir(parents=True, exist_ok=True)
                with open(COMMAND_QUEUE_PATH, 'w') as f:
                    json.dump([cmd.dict() for cmd in self.queue], f, indent=2)
            except Exception as e:
                logger.error(f"Failed to save command queue: {e}")
                raise
                
    async def add_command(self, command_type: str, data: Dict[str, Any], priority: int = CommandPriority.NORMAL) -> str:
        """Add command to queue"""
        async with self.queue_lock:
            command = Command(
                id=str(uuid.uuid4()),
                type=command_type,
                priority=priority,
                data=data,
                timestamp=datetime.now().isoformat(),
                status="pending"
            )
            self.queue.append(command)
            
        await self.save_queue()
        await metrics.increment_counter(f"command_added.{command_type}")
        return command.id
            
    async def get_next_command(self) -> Optional[Command]:
        """Get next command by priority"""
        async with self.queue_lock:
            # Sort by priority (descending) and timestamp (ascending)
            self.queue.sort(key=lambda x: (-x.priority, x.timestamp))
            
            for cmd in self.queue:
                if cmd.status == "pending":
                    cmd.status = "processing"
                    await self.save_queue()
                    return cmd
            return None
            
    async def complete_command(self, command_id: str, result: Dict[str, Any] = None):
        """Mark command as completed"""
        async with self.queue_lock:
            for cmd in self.queue:
                if cmd.id == command_id:
                    cmd.status = "completed"
                    cmd.result = result
                    break
                    
        await self.save_queue()
        await metrics.increment_counter("command_completed")
            
    async def fail_command(self, command_id: str, error: str):
        """Mark command as failed"""
        async with self.queue_lock:
            for cmd in self.queue:
                if cmd.id == command_id:
                    cmd.status = "failed"
                    cmd.result = {"error": error}
                    break
                    
        await self.save_queue()
        await metrics.increment_counter("command_failed")
        
    def register_handler(self, command_type: str, handler):
        """핸들러 등록"""
        self.handlers[command_type] = handler
        
    async def get_stats(self) -> Dict[str, Any]:
        """큐 통계"""
        async with self.queue_lock:
            return {
                "total": len(self.queue),
                "pending": sum(1 for cmd in self.queue if cmd.status == "pending"),
                "processing": sum(1 for cmd in self.queue if cmd.status == "processing"),
                "completed": sum(1 for cmd in self.queue if cmd.status == "completed"),
                "failed": sum(1 for cmd in self.queue if cmd.status == "failed")
            }

# Global command queue
command_queue = UnifiedCommandQueue()

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
        await command_queue.add_command(
            command_type,
            data,
            priority=CommandPriority.HIGH
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
        self.firefox_session_manager = EnhancedFirefoxSessionManager()
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
            
    @with_retry(max_retries=3, delay=0.5)
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
            now = datetime.now(timezone.utc) if timestamp.tzinfo else datetime.now()
            age = now - timestamp
            return age.total_seconds() / 60
        except:
            return None

# Global session manager
session_manager = UnifiedSessionManager()

# ======================== Firefox Management ========================

class ImprovedFirefoxManager:
    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
        self.monitor_thread: Optional[threading.Thread] = None
        
    def get_firefox_command(self, profile_name: str = "llm-collector", headless: bool = False) -> List[str]:
        """Get Firefox launch command based on OS"""
        system = platform.system()
        base_args = ["--no-remote", "-P", profile_name]
        
        if headless and system in ["Linux", "Darwin"]:
            base_args.append("--headless")
        
        if system == "Windows":
            firefox_paths = [
                r"C:\Program Files\Firefox Developer Edition\firefox.exe",
                r"C:\Program Files\Mozilla Firefox\firefox.exe",
                r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
            ]
            
            for path in firefox_paths:
                if os.path.exists(path):
                    logger.info(f"Found Firefox at: {path}")
                    return [path] + base_args
                    
            firefox_in_path = shutil.which("firefox")
            if firefox_in_path:
                return [firefox_in_path] + base_args
                
            raise Exception("Firefox not found. Please install Firefox.")
            
        elif system == "Darwin":  # macOS
            firefox_paths = [
                "/Applications/Firefox.app/Contents/MacOS/firefox",
                "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
            ]
            
            for path in firefox_paths:
                if os.path.exists(path):
                    return [path] + base_args
                    
            raise Exception("Firefox not found on macOS. Please install Firefox.")
            
        else:  # Linux
            firefox_in_path = shutil.which("firefox")
            if firefox_in_path:
                return [firefox_in_path] + base_args
                
            raise Exception("Firefox not found. Please install Firefox: sudo apt install firefox")
            
    async def check_firefox_running(self) -> bool:
        """Check if Firefox is running"""
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                if 'firefox' in proc.info['name'].lower():
                    return True
            except:
                pass
        return False
            
    async def kill_existing_firefox(self):
        """Kill any existing Firefox processes"""
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                if 'firefox' in proc.info['name'].lower():
                    logger.info(f"Killing existing Firefox process: {proc.info['pid']}")
                    proc.terminate()
                    proc.wait(timeout=5)
            except:
                pass
                
    def monitor_firefox_process(self):
        """Monitor Firefox process in background thread"""
        while self.process and self.process.poll() is None:
            time.sleep(2)
            
        # Firefox exited
        logger.warning("Firefox process exited")
        asyncio.create_task(state_manager.update_state("firefox_status", "closed"))
        
    async def launch_firefox_with_command(self, command: Dict[str, Any], visible: bool = True) -> bool:
        """Launch Firefox with URL command"""
        try:
            # Kill existing Firefox
            await self.kill_existing_firefox()
            await asyncio.sleep(1)
            
            # Get Firefox command
            profile_name = command.get("settings", {}).get("profileName", "llm-collector")
            use_headless = not visible and platform.system() in ["Linux", "Darwin"]
            firefox_cmd = self.get_firefox_command(profile_name, headless=use_headless)
            
            # Launch Firefox
            logger.info(f"Launching Firefox with command: {command['action']}")
            
            if platform.system() == "Windows" and not visible:
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = subprocess.SW_MINIMIZE
                
                self.process = subprocess.Popen(
                    firefox_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    startupinfo=startupinfo
                )
            else:
                self.process = subprocess.Popen(
                    firefox_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
            
            # Start monitoring thread
            self.monitor_thread = threading.Thread(target=self.monitor_firefox_process)
            self.monitor_thread.start()
            
            # Update state
            await state_manager.update_state("firefox_status", "opening")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to launch Firefox: {e}")
            await state_manager.update_state("firefox_status", "error")
            return False
            
    async def close_firefox(self):
        """Close Firefox gracefully"""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                self.process.kill()
            self.process = None

# Global Firefox manager
firefox_manager = ImprovedFirefoxManager()

# ======================== Extension Communication ========================

class ExtensionMonitor:
    def __init__(self):
        self.last_heartbeat: Optional[datetime] = None
        self.check_interval = 10  # seconds
        asyncio.create_task(self.start_monitoring())
        
    async def start_monitoring(self):
        """Start monitoring Extension heartbeat"""
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

# Global Extension monitor
extension_monitor = ExtensionMonitor()

# ======================== API Endpoints (기존 경로 유지) ========================

@router.get("/status")
async def get_system_status():
    """Get system status"""
    firefox_status = {
        "available": session_manager.firefox_session_manager.extension_available,
        "port": session_manager.firefox_session_manager.extension_port
    }
    
    session_health = await session_manager.check_session_health()
    queue_stats = await command_queue.get_stats()
    metrics_summary = await metrics.get_summary()
    
    return {
        "status": "operational",
        "system": "argosa",
        "state": state_manager.state.dict(),
        "firefox_extension": firefox_status,
        "sessions": session_health,
        "command_queue": queue_stats,
        "metrics": metrics_summary,
        "timestamp": datetime.now().isoformat()
    }

@router.websocket("/ws/state")
async def state_websocket(websocket: WebSocket):
    """WebSocket for real-time state updates"""
    await websocket.accept()
    active_websockets.add(websocket)
    
    try:
        # Send current state
        await websocket.send_json({
            "type": "state_update",
            "data": state_manager.state.dict()
        })
        
        # Keep connection alive with ping/pong
        while True:
            try:
                await websocket.send_json({"type": "ping"})
                await asyncio.sleep(30)
            except:
                break
            
    except WebSocketDisconnect:
        active_websockets.discard(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        active_websockets.discard(websocket)

# ======================== Command Queue Endpoints ========================

@router.get("/commands/pending")
async def get_pending_commands():
    """Native Host가 가져갈 명령들"""
    commands = []
    
    # 명령 큐에서 대기 중인 것들
    async with command_queue.queue_lock:
        for cmd in command_queue.queue:
            if cmd.status == "pending":
                commands.append({
                    'id': cmd.id,
                    'type': cmd.type,
                    'data': cmd.data,
                    'priority': cmd.priority
                })
    
    return {"commands": commands[:5]}  # 최대 5개

@router.post("/commands/complete/{command_id}")
async def complete_command_endpoint(command_id: str, result: Dict[str, Any]):
    """명령 완료 알림"""
    await command_queue.complete_command(command_id, result)
    
    # Native 명령 관리자에도 알림
    await native_command_manager.complete_command(command_id, result)
    
    return {"status": "completed"}

# ======================== Native Message Handler ========================

@router.post("/native/message")
async def handle_native_message(message: Dict[str, Any]):
    """Native Messaging Bridge로부터 메시지 처리"""
    
    msg_type = message.get('type')
    msg_id = message.get('id')
    data = message.get('data', {})
    
    logger.info(f"Native message received: {msg_type}")
    
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
            
            await session_manager.update_session(
                platform=platform,
                valid=valid,
                cookies=cookies,
                source="native"
            )
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
            logger.error(f"Native error: {error_msg}")
            
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

# ======================== Native Collection Endpoints ========================

@router.post("/collect/start")
async def start_collection_native(request: Dict[str, Any]):
    """Native Messaging을 통한 대화 수집"""
    platforms = request.get('platforms', [])
    settings = request.get('settings', {})
    
    # Firefox 실행 확인
    if state_manager.state.firefox_status != "ready":
        # Firefox 시작
        success = await firefox_manager.launch_firefox_with_command({
            "action": "start",
            "native_messaging": True
        })
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to start Firefox")
        
        # Extension 준비 대기
        await asyncio.sleep(3)
    
    # Native 명령 전송
    command_id = await native_command_manager.send_command(
        "collect_conversations",
        {
            "platforms": platforms,
            "exclude_llm": True,
            "settings": settings
        }
    )
    
    # 응답 대기
    try:
        result = await native_command_manager.wait_for_response(command_id, timeout=60)
        return {
            "success": True,
            "collected": result.get('collected', 0),
            "excluded_llm": result.get('excluded', 0)
        }
    except asyncio.TimeoutError:
        return {
            "success": False,
            "error": "Collection timeout"
        }

@router.post("/query/llm")
async def query_llm_native(request: Dict[str, Any]):
    """Native Messaging을 통한 LLM 질문"""
    platform = request.get('platform')
    query = request.get('query')
    
    if not platform or not query:
        raise HTTPException(status_code=400, detail="Platform and query required")
    
    # Native 명령 전송
    command_id = await native_command_manager.send_command(
        "execute_llm_query",
        {
            "platform": platform,
            "query": query,
            "mark_as_llm": True
        }
    )
    
    # 응답 대기 (LLM은 시간이 걸림)
    try:
        result = await native_command_manager.wait_for_response(command_id, timeout=120)
        return {
            "success": True,
            "conversation_id": result.get('conversation_id'),
            "response": result.get('response'),
            "metadata": {
                "source": "llm_query",
                "platform": platform
            }
        }
    except asyncio.TimeoutError:
        return {
            "success": False,
            "error": "LLM query timeout"
        }

@router.post("/crawl/web")
async def crawl_web_native(request: Dict[str, Any]):
    """Native Messaging을 통한 웹 크롤링"""
    url = request.get('url')
    search_query = request.get('query')
    
    if not url:
        raise HTTPException(status_code=400, detail="URL required")
    
    # Native 명령 전송
    command_id = await native_command_manager.send_command(
        "crawl_web",
        {
            "url": url,
            "search_query": search_query,
            "extract_rules": request.get('extract_rules', {})
        }
    )
    
    # 응답 대기
    try:
        result = await native_command_manager.wait_for_response(command_id, timeout=30)
        return {
            "success": True,
            "content": result.get('content'),
            "extracted": result.get('extracted_data', {})
        }
    except asyncio.TimeoutError:
        return {
            "success": False,
            "error": "Crawl timeout"
        }

# ======================== Metrics Endpoints ========================

@router.get("/metrics/summary")
async def get_metrics_summary():
    """메트릭 요약"""
    return await metrics.get_summary()

# ======================== Initialization and Shutdown ========================

async def initialize():
    """Initialize Argosa core system"""
    logger.info("Initializing Argosa core system with improvements...")
    
    # Create directories
    DATA_PATH.mkdir(parents=True, exist_ok=True)
    
    # Initialize state
    await state_manager.update_state("system_status", "idle")
    await state_manager.update_state("firefox_status", "closed")
    await state_manager.update_state("extension_status", "disconnected")
    
    logger.info("Argosa core system initialized")

async def shutdown():
    """Shutdown Argosa core system"""
    logger.info("Shutting down Argosa core system...")
    
    # Close WebSocket connections
    for websocket in list(active_websockets):
        try:
            await websocket.close()
        except:
            pass
    active_websockets.clear()
    
    # Kill Firefox if running
    await firefox_manager.close_firefox()
    
    logger.info("Argosa core system shutdown complete")

# Internal helper for saving conversations
async def save_conversations_internal(data: Dict[str, Any]):
    """내부 대화 저장 함수"""
    # 기존 llm_conversation_collector의 로직 활용
    from .collection.llm_conversation_collector import collector
    
    return await collector.save_conversations(
        platform=data['platform'],
        conversations=data['conversations'],
        metadata=data.get('metadata', {})
    )

# Run initialization on import
asyncio.create_task(initialize())