# backend/routers/argosa/data_collection.py - Argosa 핵심 데이터 수집 시스템

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from typing import Dict, List, Optional, Any, Set, Tuple
import asyncio
import json
from datetime import datetime, timedelta
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
from collections import defaultdict

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
SCHEDULE_CONFIG_PATH = DATA_PATH / "schedule_config.json"
SCHEDULE_FAILURE_PATH = DATA_PATH / "schedule_failure.json"
SYNC_CONFIG_PATH = DATA_PATH / "sync_config.json"

# ======================== Data Models ========================

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

class Command(BaseModel):
    id: str
    type: str  # sync_now, check_session, update_settings, etc.
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
    source: str = "cache"  # cache, extension, firefox
    cookies: Optional[List[Dict[str, Any]]] = None
    status: str = "unknown"  # active, expired, checking, unknown

class SyncRequest(BaseModel):
    platforms: List[Dict[str, Any]]
    settings: Dict[str, Any]

class SyncProgress(BaseModel):
    sync_id: str
    status: str
    progress: int = 0
    current_platform: Optional[str] = None
    collected: int = 0
    message: str = ""

class ScheduleConfig(BaseModel):
    enabled: bool
    startTime: str
    interval: str
    platforms: List[str]
    settings: Dict[str, Any]

class SessionStatus(BaseModel):
    platform: str
    valid: bool
    lastChecked: str
    expiresAt: Optional[str] = None

class SessionCheckRequest(BaseModel):
    platforms: List[str]

class SingleSessionCheckRequest(BaseModel):
    platform: str
    enabled: bool = True

class OpenLoginRequest(BaseModel):
    platform: str
    url: str
    profileName: str = "llm-collector"

class SessionUpdate(BaseModel):
    platform: str
    valid: bool = True
    cookies: Optional[Dict[str, Any]] = None
    headers: Optional[Dict[str, str]] = None

# ======================== Enhanced Firefox Session Management ========================

class EnhancedFirefoxSessionManager:
    """Firefox Extension과 통신하는 세션 관리자"""
    
    def __init__(self):
        self.extension_port = int(os.getenv("FIREFOX_EXTENSION_PORT", "9292"))
        self.profile_path = os.getenv("FIREFOX_PROFILE_PATH", "")
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
        """Save state to file"""
        async with self.state_lock:
            try:
                STATE_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
                with open(STATE_FILE_PATH, 'w') as f:
                    json.dump(self.state.dict(), f, indent=2)
            except Exception as e:
                logger.error(f"Failed to save state: {e}")
                
    async def update_state(self, key: str, value: Any):
        """Update state and broadcast"""
        async with self.state_lock:
            if hasattr(self.state, key):
                setattr(self.state, key, value)
            await self.save_state()
            await self.broadcast_state()
            
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
            
    async def save_queue(self):
        """Save queue to file"""
        async with self.queue_lock:
            try:
                COMMAND_QUEUE_PATH.parent.mkdir(parents=True, exist_ok=True)
                with open(COMMAND_QUEUE_PATH, 'w') as f:
                    json.dump([cmd.dict() for cmd in self.queue], f, indent=2)
            except Exception as e:
                logger.error(f"Failed to save command queue: {e}")
                
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
            
    async def fail_command(self, command_id: str, error: str):
        """Mark command as failed"""
        async with self.queue_lock:
            for cmd in self.queue:
                if cmd.id == command_id:
                    cmd.status = "failed"
                    cmd.result = {"error": error}
                    break
            await self.save_queue()

# Global command queue
command_queue = UnifiedCommandQueue()

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
            
    async def save_cache(self):
        """Save session cache to file"""
        try:
            SESSION_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            cache_data = {k: v.dict() for k, v in self.cache.items()}
            with open(SESSION_CACHE_PATH, 'w') as f:
                json.dump(cache_data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save session cache: {e}")
            
    async def check_session(self, platform: str, force_fresh: bool = False) -> SessionCache:
        """Check session with caching"""
        # Check cache first
        if not force_fresh and platform in self.cache:
            cached = self.cache[platform]
            cache_time = datetime.fromisoformat(cached.last_checked)
            if (datetime.now() - cache_time).seconds < self.cache_ttl:
                logger.info(f"Session cache hit for {platform}")
                return cached
                
        # Request fresh check from Extension
        logger.info(f"Requesting fresh session check for {platform}")
        cmd_id = await command_queue.add_command(
            "check_session_now",
            {"platform": platform},
            priority=CommandPriority.URGENT
        )
        
        # Wait for response (max 2 seconds)
        start_time = time.time()
        while time.time() - start_time < 2.0:
            await asyncio.sleep(0.1)
            
            # Check if command completed
            async with command_queue.queue_lock:
                for cmd in command_queue.queue:
                    if cmd.id == cmd_id and cmd.status == "completed":
                        if cmd.result:
                            session_info = SessionCache(
                                platform=platform,
                                valid=cmd.result.get("valid", False),
                                last_checked=datetime.now().isoformat(),
                                expires_at=cmd.result.get("expires_at"),
                                source="extension",
                                cookies=cmd.result.get("cookies"),
                                status=cmd.result.get("status", "unknown")
                            )
                            self.cache[platform] = session_info
                            await self.save_cache()
                            return session_info
                            
        # Timeout - return invalid session
        logger.warning(f"Session check timeout for {platform}")
        return SessionCache(
            platform=platform,
            valid=False,
            last_checked=datetime.now().isoformat(),
            source="timeout",
            status="error"
        )
        
    async def update_session(self, platform: str, valid: bool, cookies: Optional[List[Dict]] = None, 
                           session_data: Optional[Dict] = None, reason: str = "manual", source: str = "extension"):
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
        
        logger.info(f"Updated {platform}: valid={valid}, expires={expires_at}, reason={reason}")
        return valid

# Global session manager
session_manager = UnifiedSessionManager()

# ======================== Schedule Management ========================

class ScheduleManager:
    def __init__(self):
        self.config: Optional[ScheduleConfig] = None
        self.load_config()
        
    def load_config(self):
        """Load schedule configuration"""
        try:
            if SCHEDULE_CONFIG_PATH.exists():
                with open(SCHEDULE_CONFIG_PATH, 'r') as f:
                    data = json.load(f)
                    self.config = ScheduleConfig(**data)
        except Exception as e:
            logger.error(f"Failed to load schedule config: {e}")
            
    async def save_config(self):
        """Save schedule configuration"""
        try:
            if self.config:
                SCHEDULE_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
                with open(SCHEDULE_CONFIG_PATH, 'w') as f:
                    json.dump(self.config.dict(), f, indent=2)
                    
                # Update system state
                await state_manager.update_state("schedule_enabled", self.config.enabled)
                
        except Exception as e:
            logger.error(f"Failed to save schedule config: {e}")

# Global schedule manager
schedule_manager = ScheduleManager()

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

# ======================== API Endpoints ========================

@router.get("/status")
async def get_system_status():
    """Get system status"""
    firefox_status = {
        "available": session_manager.firefox_session_manager.extension_available,
        "port": session_manager.firefox_session_manager.extension_port
    }
    
    return {
        "status": "operational",
        "system": "argosa",
        "state": state_manager.state.dict(),
        "firefox_extension": firefox_status,
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
        
        # Keep connection alive
        while True:
            await asyncio.sleep(1)
            
    except WebSocketDisconnect:
        active_websockets.discard(websocket)

# ======================== Session Management Endpoints ========================

@router.post("/sessions/check")
async def check_sessions(request: SessionCheckRequest):
    """Check multiple platform sessions"""
    try:
        sessions = []
        
        for platform in request.platforms:
            session_info = await session_manager.check_session(platform)
            sessions.append(SessionStatus(
                platform=platform,
                valid=session_info.valid,
                lastChecked=session_info.last_checked,
                expiresAt=session_info.expires_at
            ))
        
        return {"sessions": sessions}
        
    except Exception as e:
        logger.error(f"Error checking sessions: {e}")
        return {"sessions": []}

@router.post("/sessions/check-single")
async def check_single_session(request: SingleSessionCheckRequest):
    """Check single platform session"""
    logger.info(f"Session Check: Platform: {request.platform}, Enabled: {request.enabled}")
    
    try:
        session_info = await session_manager.check_session(request.platform)
        
        return {
            "platform": request.platform,
            "valid": session_info.valid,
            "lastChecked": session_info.last_checked,
            "expiresAt": session_info.expires_at,
            "cookies": bool(session_info.cookies),
            "status": session_info.status
        }
        
    except Exception as e:
        logger.error(f"Error checking session: {e}")
        return {
            "platform": request.platform,
            "valid": False,
            "lastChecked": datetime.now().isoformat(),
            "expiresAt": None,
            "cookies": False,
            "status": "error"
        }

@router.post("/sessions/open-login")
async def open_login_page(request: OpenLoginRequest):
    """Open platform login page"""
    try:
        # Launch Firefox with login command
        command = {
            "action": "open_login",
            "platform": request.platform,
            "url": request.url,
            "settings": {"profileName": request.profileName}
        }
        
        success = await firefox_manager.launch_firefox_with_command(command)
        
        if success:
            return {
                "success": True,
                "message": f"Opening {request.platform} login page",
                "details": "Please log in and the session will be automatically detected"
            }
        else:
            return {
                "success": False,
                "error": "Failed to launch Firefox",
                "details": "Check Firefox installation and profile"
            }
            
    except Exception as e:
        logger.error(f"Error opening login page: {e}")
        return {
            "success": False,
            "error": str(e),
            "details": "Unexpected error occurred"
        }

@router.post("/sessions/update")
async def update_session_endpoint(update: SessionUpdate):
    """Update session status from Extension"""
    logger.info(f"Session Update: Platform: {update.platform}, Valid: {update.valid}")
    
    try:
        # Parse cookies
        cookies_list = []
        if update.cookies:
            for cookie_data in update.cookies.values():
                if isinstance(cookie_data, dict):
                    cookies_list.append(cookie_data)
        
        # Update session
        await session_manager.update_session(
            update.platform,
            update.valid,
            cookies=cookies_list,
            session_data=update.cookies,
            reason="extension_update"
        )
        
        logger.info(f"Successfully updated {update.platform} session")
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Error updating session: {e}")
        return {"success": False, "error": str(e)}

# ======================== Firefox Control Endpoints ========================

@router.post("/firefox/launch")
async def launch_firefox_sync(request: SyncRequest, background_tasks: BackgroundTasks):
    """Launch Firefox and trigger Extension sync"""
    logger.info("Firefox launch request received")
    
    try:
        # Get enabled platforms
        enabled_platforms = [
            p["platform"] for p in request.platforms
            if p.get("enabled", True)
        ]
        
        if not enabled_platforms:
            return {
                "success": False,
                "error": "No platforms enabled for sync",
                "details": "Please enable at least one platform"
            }
        
        # Update system state
        await state_manager.update_state("system_status", "preparing")
        
        # Create sync command
        sync_id = str(uuid.uuid4())
        
        command = {
            "action": "sync",
            "sync_id": sync_id,
            "platforms": request.platforms,
            "settings": request.settings,
            "timestamp": datetime.now().isoformat(),
            "auto_close": True
        }
        
        # Save sync config for Extension
        sync_config = {
            "id": sync_id,
            "platforms": request.platforms,
            "settings": request.settings,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "auto_close": True
        }
        
        SYNC_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(SYNC_CONFIG_PATH, 'w') as f:
            json.dump(sync_config, f, indent=2)
        
        # Launch Firefox
        firefox_visible = request.settings.get("firefoxVisible", True)
        success = await firefox_manager.launch_firefox_with_command(command, visible=firefox_visible)
        
        if success:
            await state_manager.update_state("sync_status", {
                "sync_id": sync_id,
                "status": "started",
                "progress": 0,
                "message": "Firefox launched, waiting for Extension..."
            })
            
            return {
                "success": True,
                "sync_id": sync_id,
                "message": "Firefox launched and sync triggered",
                "debug_mode": request.settings.get("debug", firefox_visible),
                "firefox_visible": firefox_visible
            }
        else:
            await state_manager.update_state("system_status", "idle")
            return {
                "success": False,
                "error": "Failed to launch Firefox",
                "details": "Check Firefox installation"
            }
            
    except Exception as e:
        logger.error(f"Error launching Firefox: {e}")
        await state_manager.update_state("system_status", "error")
        return {
            "success": False,
            "error": str(e),
            "details": "Unexpected error occurred"
        }

@router.get("/sync/status/{sync_id}")
async def get_sync_status(sync_id: str):
    """Get sync progress status"""
    try:
        if state_manager.state.sync_status and state_manager.state.sync_status.get("sync_id") == sync_id:
            return state_manager.state.sync_status
        
        return {
            "status": "pending",
            "progress": 0,
            "message": "Waiting for extension to start...",
            "updated_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {"status": "error", "error": str(e)}

@router.post("/sync/cancel/{sync_id}")
async def cancel_sync(sync_id: str):
    """Cancel ongoing sync"""
    if state_manager.state.sync_status and state_manager.state.sync_status.get("sync_id") == sync_id:
        # Add cancel command
        await command_queue.add_command(
            "cancel_sync",
            {"sync_id": sync_id},
            priority=CommandPriority.URGENT
        )
        
        # Update state
        await state_manager.update_state("system_status", "idle")
        await state_manager.update_state("sync_status", None)
        
        # Kill Firefox
        await firefox_manager.close_firefox()
        
        return {"success": True, "message": "Sync cancelled"}
    else:
        raise HTTPException(status_code=404, detail="Sync not found")

@router.post("/sync/progress")
async def update_sync_progress(progress: SyncProgress):
    """Update sync progress"""
    sync_status = {
        "sync_id": progress.sync_id,
        "status": progress.status,
        "progress": progress.progress,
        "current_platform": progress.current_platform,
        "collected": progress.collected,
        "message": progress.message
    }
    
    await state_manager.update_state("sync_status", sync_status)
    
    # Auto-close Firefox on completion
    if progress.status == "completed":
        await state_manager.update_state("system_status", "idle")
        
        # Check if auto-close is enabled
        if SYNC_CONFIG_PATH.exists():
            with open(SYNC_CONFIG_PATH, 'r') as f:
                sync_config = json.load(f)
                
            if sync_config.get("auto_close", True):
                # Close Firefox after 3 seconds
                async def close_firefox_delayed():
                    await asyncio.sleep(3)
                    await firefox_manager.close_firefox()
                
                asyncio.create_task(close_firefox_delayed())
    
    return {"success": True}

@router.get("/sync/config")
async def get_sync_config():
    """Get sync config for Extension"""
    if SYNC_CONFIG_PATH.exists():
        with open(SYNC_CONFIG_PATH, 'r') as f:
            config = json.load(f)
            
        # Check if config is recent (within 1 hour)
        if config.get("created_at"):
            created = datetime.fromisoformat(config["created_at"])
            if (datetime.now() - created).total_seconds() > 3600:
                return {"status": "no_config"}
                
        return config
    else:
        return {"status": "no_config"}

# ======================== Schedule Management Endpoints ========================

@router.post("/sync/schedule")
async def schedule_sync(config: ScheduleConfig):
    """Configure automatic sync schedule"""
    try:
        if not config.platforms:
            return {"success": False, "error": "No platforms enabled for schedule"}
        
        # Save schedule config
        schedule_manager.config = config
        await schedule_manager.save_config()
        
        logger.info(f"Saved schedule for platforms: {config.platforms}")
        
        return {"success": True, "message": "Schedule updated"}
        
    except Exception as e:
        logger.error(f"Error updating schedule: {e}")
        return {"success": False, "error": str(e)}

@router.post("/sync/trigger-scheduled")
async def trigger_scheduled_sync(background_tasks: BackgroundTasks):
    """Trigger scheduled sync"""
    try:
        if not schedule_manager.config or not schedule_manager.config.enabled:
            return {"success": False, "error": "Scheduled sync is disabled"}
        
        enabled_platforms = schedule_manager.config.platforms
        
        if not enabled_platforms:
            return {"success": False, "error": "No enabled platforms in schedule"}
        
        request = SyncRequest(
            platforms=[
                {"platform": p, "enabled": True}
                for p in enabled_platforms
            ],
            settings=schedule_manager.config.settings
        )
        
        result = await launch_firefox_sync(request, background_tasks)
        return result
        
    except Exception as e:
        return {"success": False, "error": str(e)}

# ======================== Extension Communication Endpoints ========================

@router.post("/extension/heartbeat")
async def extension_heartbeat(heartbeat: ExtensionHeartbeat):
    """Receive heartbeat from Extension"""
    await extension_monitor.update_heartbeat(heartbeat)
    return {"status": "received"}

@router.get("/commands/next")
async def get_next_command():
    """Get next command for Extension"""
    command = await command_queue.get_next_command()
    if command:
        return command.dict()
    return {"type": "none"}

@router.post("/commands/response/{command_id}")
async def command_response(command_id: str, response: Dict[str, Any]):
    """Receive command response from Extension"""
    await command_queue.complete_command(command_id, response)
    return {"status": "received"}

@router.get("/settings/current")
async def get_current_settings():
    """Get current settings for Extension"""
    return {
        "maxConversations": 20,
        "randomDelay": 5,
        "minCheckGap": 30000,
        "heartbeatInterval": 10000
    }

# ======================== Initialization and Shutdown ========================

async def initialize():
    """Initialize Argosa core system"""
    logger.info("Initializing Argosa core system...")
    
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

# Run initialization on import
asyncio.create_task(initialize())