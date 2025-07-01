# backend/routers/argosa/data_collection.py - 전체 코드 (수정된 버전)

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import Dict, List, Optional, Any, Set
import asyncio
import json
from datetime import datetime, timedelta
from pydantic import BaseModel
from pathlib import Path
import os
import uuid
import logging
from enum import Enum
import traceback

# 설정
logger = logging.getLogger(__name__)

# Shared 모듈에서 import
try:
    from routers.argosa.shared.cache_manager import cache_manager
    from routers.argosa.shared.llm_tracker import llm_tracker
    from routers.argosa.shared.command_queue import command_queue
    from routers.argosa.shared.metrics import metrics
    from routers.argosa.shared.conversation_saver import conversation_saver
    from routers.argosa.shared.error_handler import error_handler, with_retry, ErrorSeverity
except ImportError as e:
    logger.warning(f"Failed to import shared modules: {e}")
    # Fallback for testing environments
    cache_manager = None
    llm_tracker = None
    command_queue = None
    metrics = None
    conversation_saver = None
    error_handler = None
    with_retry = lambda func: func
    ErrorSeverity = None

# Firefox manager import (독립적인 모듈)
try:
    from routers.argosa.shared.firefox_manager import (
        get_firefox_manager, 
        FirefoxStatus, 
        FirefoxEvent
    )
    firefox_manager = get_firefox_manager()
    logger.debug(f"Firefox manager: {firefox_manager is not None}")
except ImportError as e:
    logger.error(f"Failed to import firefox_manager: {e}")
    logger.error("Firefox manager will not be available")
    firefox_manager = None
    FirefoxStatus = None
    FirefoxEvent = None
    traceback.print_exc()

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

# SystemState removed - using FirefoxManager's state management

class SessionCache(BaseModel):
    platform: str
    valid: bool
    last_checked: str
    expires_at: Optional[str] = None
    source: str = "cache"  # cache, extension, firefox, timeout
    cookies: Optional[List[Dict[str, Any]]] = None
    status: str = "unknown"  # active, expired, checking, unknown

# ======================== State Management ========================

# SystemStateManager removed - using FirefoxManager directly for all state management

# ======================== Firefox Monitor Integration ========================
# FirefoxMonitor removed - FirefoxManager handles all monitoring directly
# All FirefoxMonitor methods removed - using FirefoxManager directly

# Global instances - Using FirefoxManager for all state management
# state_manager removed - using firefox_manager directly
firefox_monitor = None  # Disabled - FirefoxManager handles all monitoring
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
        
        # Update system state via Firefox Manager
        if firefox_manager:
            current_sessions = firefox_manager.get_system_state().get("sessions", {})
            current_sessions[platform] = session_info.dict()
            await firefox_manager.update_state("sessions", current_sessions)
        
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

@router.get("/test-claude-status") 
async def test_claude_status():
    """Test endpoint to verify our route is working"""
    logger.info(f"🔥🔥🔥 TEST CLAUDE STATUS ENDPOINT CALLED! 🔥🔥🔥")
    return {"test": "claude", "working": True, "timestamp": "now"}

@router.get("/status-fixed")
async def get_system_status_fixed():
    """WORKING status endpoint that reads from file"""
    logger.info(f"✅✅✅ FIXED STATUS ENDPOINT CALLED! ✅✅✅")
    
    import json
    import os
    from datetime import datetime
    
    try:
        abs_path = os.path.abspath("./data/argosa/system_state.json")
        logger.info(f"✅ Reading from: {abs_path}")
        
        with open(abs_path, 'r') as f:
            file_data = json.load(f)
        
        logger.info(f"✅ File data: extension={file_data.get('extension_status')}, firefox={file_data.get('firefox_status')}")
        
        return {
            "status": "operational",
            "system": "argosa", 
            "state": file_data,
            "timestamp": datetime.now().isoformat(),
            "source": "WORKING_ENDPOINT",
            "message": "This endpoint works and reads from file!"
        }
    except Exception as e:
        logger.error(f"✅ Error: {e}")
        return {"status": "error", "error": str(e)}

@router.get("/status")
async def get_system_status():
    """Get system status - FROM MEMORY NOT FILE"""
    # Firefox Manager의 메모리 상태를 직접 반환 (파일 아님!)
    if firefox_manager:
        system_state = firefox_manager.get_system_state()
        logger.debug(f"Status from memory: extension={system_state.get('extension_status')}, firefox={system_state.get('firefox_status')}")
        
        return {
            "status": "operational",
            "system": "argosa", 
            "state": system_state,  # 메모리 상태를 반환
            "timestamp": datetime.now().isoformat(),
            "source": "memory"
        }
    else:
        # Firefox manager가 없으면 기본값
        return {
            "status": "operational",
            "system": "argosa",
            "state": {
                "system_status": "idle",
                "firefox_status": "closed",
                "extension_status": "disconnected",
                "sessions": {},
                "data_sources_active": 0,
                "total_conversations": 0
            },
            "timestamp": datetime.now().isoformat(),
            "source": "default"
        }

@router.get("/test-correction")
async def test_state_correction():
    """🔧 테스트: 상태 보정 로직 확인"""
    try:
        metrics_summary = await metrics.get_metrics_summary()
        current_time = datetime.now()
        
        if firefox_manager:
            system_state = firefox_manager.get_system_state()
        else:
            system_state = {
                "system_status": "idle",
                "firefox_status": "closed", 
                "extension_status": "disconnected"
            }
        
        result = {
            "test": "State correction test",
            "timestamp": current_time.isoformat(),
            "metrics_available": bool(metrics_summary),
            "system_state": system_state
        }
        
        if metrics_summary and "counters" in metrics_summary:
            extension_heartbeat_count = metrics_summary["counters"].get("native_message.extension_heartbeat", 0)
            init_count = metrics_summary["counters"].get("native_message.init", 0)
            
            result["metrics"] = {
                "heartbeat_count": extension_heartbeat_count,
                "init_count": init_count
            }
            
            # 보정 로직 테스트
            if extension_heartbeat_count > 0 and init_count > 0:
                last_seen_str = system_state.get("extension_last_seen")
                if last_seen_str:
                    try:
                        last_seen = datetime.fromisoformat(last_seen_str.replace('Z', '+00:00'))
                        time_diff = (current_time - last_seen.replace(tzinfo=None)).total_seconds()
                        
                        result["correction_check"] = {
                            "last_seen": last_seen_str,
                            "time_diff_seconds": time_diff,
                            "should_be_connected": time_diff < 120,
                            "current_status": system_state.get("extension_status"),
                            "would_correct_to": "connected" if time_diff < 120 else "disconnected"
                        }
                    except Exception as e:
                        result["correction_error"] = str(e)
        
        return result
        
    except Exception as e:
        return {"error": str(e), "test": "failed"}

@router.post("/force-state-update")
async def force_state_update():
    """🔧 메트릭 기반으로 상태를 강제 업데이트"""
    try:
        if not metrics:
            return {"status": "error", "message": "Metrics not available"}
        
        metrics_summary = await metrics.get_metrics_summary()
        current_time = datetime.now()
        
        if metrics_summary and "counters" in metrics_summary:
            extension_heartbeat_count = metrics_summary["counters"].get("native_message.extension_heartbeat", 0)
            init_count = metrics_summary["counters"].get("native_message.init", 0)
            
            logger.info(f"🔧 Force update: heartbeat={extension_heartbeat_count}, init={init_count}")
            
            if extension_heartbeat_count > 0 and init_count > 0:
                # Firefox manager와 state_manager 모두 업데이트
                if firefox_manager:
                    try:
                        await firefox_manager.update_state("extension_status", "connected")
                        await firefox_manager.update_state("firefox_status", "ready") 
                        await firefox_manager.update_state("system_status", "ready")
                        logger.info("🔧 Firefox manager state force updated")
                    except Exception as e:
                        logger.error(f"Error updating Firefox manager state: {e}")
                
                # No additional state manager needed - Firefox Manager is the single source of truth
                logger.info("🔧 Firefox Manager is the only state source - no additional updates needed")
                
                return {
                    "status": "success", 
                    "message": "State force updated based on metrics",
                    "metrics": {
                        "heartbeat_count": extension_heartbeat_count,
                        "init_count": init_count
                    }
                }
            else:
                return {
                    "status": "no_update", 
                    "message": "No extension activity detected in metrics",
                    "metrics": {
                        "heartbeat_count": extension_heartbeat_count,
                        "init_count": init_count
                    }
                }
        else:
            return {"status": "error", "message": "No metrics data available"}
            
    except Exception as e:
        logger.error(f"Error in force state update: {e}")
        return {"status": "error", "message": str(e)}

@router.websocket("/ws/state")
async def state_websocket(websocket: WebSocket):
    """WebSocket endpoint - Firefox Manager로 위임"""
    if firefox_manager:
        try:
            # Firefox Manager의 websocket_handler 메서드 직접 호출
            await firefox_manager.websocket_handler(websocket)
        except Exception as e:
            logger.error(f"WebSocket handler error: {e}")
            await websocket.close()
    else:
        # Firefox manager가 없으면 fallback 모드
        await websocket.accept()
        active_websockets.add(websocket)
        
        try:
            # Send minimal state since Firefox manager is not available
            await websocket.send_json({
                "type": "state_update",
                "data": {
                    "system_status": "idle",
                    "firefox_status": "closed",
                    "extension_status": "disconnected"
                }
            })
            
            # Keep connection alive
            while True:
                # Just wait for messages
                try:
                    data = await websocket.receive_json()
                    # Handle any incoming messages if needed
                except WebSocketDisconnect:
                    break
                    
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            active_websockets.discard(websocket)

@router.post("/firefox/start")
async def start_firefox():
    """Start Firefox with profile"""
    if not firefox_manager:
        raise HTTPException(status_code=503, detail="Firefox manager not available")
    
    try:
        # Update status - Firefox Manager handles this automatically
        
        # Start Firefox
        result = await firefox_manager.start()
        
        if result:
            # Firefox manager will emit events that update the state
            # Get current status
            info = await firefox_manager.get_info()
            
            return {
                "success": True,
                "status": info,
                "message": "Firefox started successfully"
            }
        else:
            # Firefox Manager handles error states automatically
            raise HTTPException(status_code=500, detail="Failed to start Firefox")
            
    except Exception as e:
        logger.error(f"Failed to start Firefox: {e}")
            # Firefox Manager will handle error states automatically
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/firefox/stop")
async def stop_firefox():
    """Stop Firefox"""
    if not firefox_manager:
        raise HTTPException(status_code=503, detail="Firefox manager not available")
    
    try:
        await firefox_manager.stop()
        
        # States will be updated by event handlers
        # Just return success
        
        return {"success": True, "message": "Firefox stopped"}
        
    except Exception as e:
        logger.error(f"Failed to stop Firefox: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/firefox/status")
async def get_firefox_status():
    """Get Firefox status"""
    if not firefox_manager:
        return {
            "available": False,
            "status": "unavailable",
            "message": "Firefox manager not available"
        }
    
    try:
        info = await firefox_manager.get_info()
        return {
            "available": True,
            "status": info
        }
    except Exception as e:
        logger.error(f"Failed to get Firefox status: {e}")
        return {
            "available": False,
            "status": "error",
            "message": str(e)
        }

# ======================== Native Messaging Endpoints ========================


@router.post("/check_firefox_status")
async def check_firefox_status():
    """Firefox와 Extension 상태 확인"""
    if firefox_manager:
        try:
            from routers.argosa.shared.firefox_manager import check_firefox_and_extension
            return await check_firefox_and_extension()
        except Exception as e:
            logger.error(f"Firefox status check error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        raise HTTPException(status_code=503, detail="Firefox manager not available")

@router.post("/sessions/ensure_firefox")
async def ensure_firefox_running(request: Dict[str, Any]):
    """로그인 페이지 열기"""
    platform = request.get('platform')
    if not platform:
        raise HTTPException(status_code=400, detail="Platform is required")
    
    if firefox_manager:
        try:
            from routers.argosa.shared.firefox_manager import open_login_page, get_system_state
            
            # 시스템 상태 확인 (Extension 없어도 진행)
            system_state = get_system_state()
            logger.info(f"[DataCollection] Current system state: firefox={system_state.get('firefox_status')}, extension={system_state.get('extension_status')}")
            
            # Extension 연결 상태는 경고만 하고 진행
            if system_state.get("extension_status") != "connected":
                logger.warning("[DataCollection] Extension not connected, but proceeding with login page open")
            
            result = await open_login_page(platform)
            return result
            
        except Exception as e:
            logger.error(f"Failed to open login page: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        raise HTTPException(status_code=503, detail="Firefox manager not available")

@router.post("/sessions/check/{platform}")
async def check_session_status(platform: str):
    """세션 상태 확인"""
    # Firefox가 준비되지 않았으면 에러  
    if firefox_manager:
        firefox_status = firefox_manager.get_system_state().get("firefox_status")
        if firefox_status != "ready":
            raise HTTPException(status_code=503, detail="Firefox is not ready")
    else:
        raise HTTPException(status_code=503, detail="Firefox manager not available")
    
    # Native Messaging으로 세션 체크 명령 전송
    command_id = await native_command_manager.send_command(
        "check_session",
        {"platform": platform}
    )
    
    # 응답 대기
    try:
        result = await native_command_manager.wait_for_response(command_id, timeout=20)
        return result
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="Session check timeout")

@router.post("/sessions/open_login/{platform}")
async def open_login_page(platform: str):
    """로그인 페이지 열기"""
    try:
        # Firefox가 준비되지 않았으면 시작
        if firefox_manager:
            firefox_status = firefox_manager.get_system_state().get("firefox_status")
            if firefox_status != "ready":
                logger.info("Firefox not ready, starting Firefox first...")
                await start_firefox()
                # Firefox 시작 후 잠시 대기
                await asyncio.sleep(3)
        else:
            raise HTTPException(status_code=503, detail="Firefox manager not available")
        
        # 명령 전송
        command_id = await native_command_manager.send_command(
            "open_login_page",
            {"platform": platform}
        )
        
        # 로그인 페이지가 열릴 때까지 기다리지 않고 바로 응답
        return {
            "success": True,
            "command_id": command_id,
            "message": f"Opening {platform} login page..."
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
    
    if firefox_manager:
        await firefox_manager.update_state("sessions", sessions)
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
@router.post("/../native/status", include_in_schema=False)  # 구버전 호환 
async def update_native_status(status: Dict[str, Any]):
    """Native Host 상태 업데이트"""
    status_type = status.get('status')
    
    # 상태 변경시에만 로깅 (heartbeat는 조용히 처리)
    if status_type not in ['alive', 'heartbeat']:
        logger.info(f"🔥 Extension status: {status_type}, ready: {status.get('extension_ready')}")
    else:
        # heartbeat나 alive도 가끔 로깅해서 패턴 확인
        import time
        current_time = int(time.time())
        if current_time % 60 == 0:  # 매 분마다 한 번씩 로깅
            logger.debug(f"[DataCollection] Periodic status update: {status_type}")
    
    status_type = status.get('status')
    
    # Extension 상태 업데이트 - 디바운싱으로 안정화
    if firefox_manager:
        current_time = datetime.now().isoformat()
        
        # Firefox Manager에 위임 - 중복 처리 제거
        logger.info(f"🔥 [DataCollection] Delegating native status to Firefox Manager: {status_type}")
        result = await firefox_manager.handle_native_status(status)
        return result
    else:
        logger.warning("Firefox manager not available for status update")
        return {"status": "error", "message": "Firefox manager not available"}

@router.post("/native/message")
@router.post("/../native/message", include_in_schema=False)  # 구버전 호환
async def handle_native_message(message: Dict[str, Any]):
    """Native Messaging Bridge로부터 메시지 처리 - Firefox Manager에 위임"""
    
    # 🔥 상세한 로깅 추가
    logger.info("=" * 80)
    logger.info("🔥🔥🔥 NATIVE MESSAGE RECEIVED 🔥🔥🔥")
    logger.info(f"Message type: {message.get('type')}")
    logger.info(f"Message: {json.dumps(message, indent=2)}")
    logger.info("=" * 80)
    
    msg_type = message.get('type')
    logger.info(f"🔥 Native message type: {msg_type} - delegating to Firefox Manager")
    
    # 메트릭 기록
    if metrics:
        await metrics.increment_counter(f"native_message.{msg_type}")
        logger.info(f"🔥 Metric recorded: native_message.{msg_type}")
    
    # Firefox Manager에 모든 처리 위임
    if firefox_manager:
        try:
            logger.info(f"🔥 Firefox Manager available, calling handle_native_message")
            result = await firefox_manager.handle_native_message(message)
            logger.info(f"🔥 Firefox Manager processed {msg_type}: {result}")
            
            # Firefox Manager handles all state management - no syncing needed
            logger.info(f"🔥 Firefox Manager processed message successfully")
            
            logger.info("=" * 80)
            return result
        except Exception as e:
            logger.error(f"Firefox Manager failed to process {msg_type}: {e}")
            logger.error(f"Stack trace: {traceback.format_exc()}")
            return {"status": "error", "message": str(e)}
    else:
        logger.error("🔥 Firefox Manager not available!")
        logger.error(f"🔥 firefox_manager object: {firefox_manager}")
        return {"status": "error", "message": "Firefox Manager not available"}
    
# 에러 처리가 적용된 명령 처리 함수
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
    
    # 수집 중 상태는 프론트엔드에서 관리
    
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
    options = request.get('options', {})
    
    if not url:
        raise HTTPException(status_code=400, detail="URL required")
    
    try:
        result = await process_command_with_retry(
            "crawl_web",
            {
                "url": url,
                "options": options
            }
        )
        
        return {
            "success": True,
            "url": url,
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

@router.post("/firefox/force-update")
async def force_firefox_update():
    """Firefox Manager 상태 강제 업데이트"""
    if not firefox_manager:
        return {"error": "Firefox Manager not available"}
    
    try:
        # 강제로 상태를 connected로 업데이트
        await firefox_manager.update_state("extension_status", "connected")
        await firefox_manager.update_state("firefox_status", "ready")
        await firefox_manager.update_state("system_status", "ready")
        
        # 현재 시간으로 last_seen 업데이트
        await firefox_manager.update_state("extension_last_seen", datetime.now().isoformat())
        
        # 현재 상태 반환
        current_state = firefox_manager.get_system_state()
        
        return {
            "status": "updated",
            "state": current_state
        }
    except Exception as e:
        logger.error(f"Failed to force update Firefox state: {e}")
        return {"error": str(e)}

@router.get("/extension/diagnose")
async def diagnose_extension():
    """Extension 연결 상태 진단"""
    
    diagnosis = {
        "backend_time": datetime.now().isoformat(),
        "backend_status": "running",
        "firefox_manager_available": firefox_manager is not None,
        "current_state": None,
        "last_heartbeat": None,
        "heartbeat_age_seconds": None,
        "expected_status": None,
        "api_endpoints": {
            "native_status": "/api/argosa/data/native/status",
            "native_message": "/api/argosa/data/native/message",
            "websocket": "/api/argosa/data/ws/state"
        }
    }
    
    if firefox_manager:
        # 현재 상태
        diagnosis["current_state"] = firefox_manager.get_system_state()
        
        # Heartbeat 나이 계산
        last_seen_str = diagnosis["current_state"].get("extension_last_seen")
        if last_seen_str:
            try:
                last_seen = datetime.fromisoformat(last_seen_str.replace('Z', '+00:00'))
                time_diff = (datetime.now() - last_seen.replace(tzinfo=None)).total_seconds()
                diagnosis["last_heartbeat"] = last_seen_str
                diagnosis["heartbeat_age_seconds"] = time_diff
                
                # 예상 상태 계산
                if time_diff < 120:  # 2분
                    diagnosis["expected_status"] = "connected"
                else:
                    diagnosis["expected_status"] = "disconnected"
            except Exception as e:
                diagnosis["heartbeat_parse_error"] = str(e)
    
    return diagnosis

@router.get("/debug/state-changes")
async def debug_state_changes():
    """상태 변경 디버그 정보"""
    if not firefox_manager:
        return {"error": "Firefox Manager not available"}
    
    # 최근 상태 변경 기록을 위한 글로벌 리스트 추가
    if not hasattr(firefox_manager, '_state_change_history'):
        firefox_manager._state_change_history = []
    
    return {
        "current_state": firefox_manager.get_system_state(),
        "state_change_history": firefox_manager._state_change_history[-20:],  # 최근 20개
        "active_websockets": len(firefox_manager._active_websockets),
        "firefox_status": firefox_manager._status.value if hasattr(firefox_manager._status, 'value') else str(firefox_manager._status),
        "monitor_task_running": firefox_manager._monitor_task is not None and not firefox_manager._monitor_task.done() if hasattr(firefox_manager, '_monitor_task') else False
    }

@router.get("/firefox/diagnose")
async def diagnose_firefox():
    """Firefox Manager 진단"""
    
    diagnosis = {
        "firefox_manager_available": firefox_manager is not None,
        "firefox_manager_id": id(firefox_manager) if firefox_manager else None,
        "current_state": None,
        "internal_state": None,
        "update_test": None
    }
    
    if firefox_manager:
        # 현재 상태
        diagnosis["current_state"] = firefox_manager.get_system_state()
        
        # 내부 상태 직접 확인
        diagnosis["internal_state"] = {
            "extension_status": firefox_manager._system_state.get("extension_status"),
            "firefox_status": firefox_manager._system_state.get("firefox_status"),
            "system_status": firefox_manager._system_state.get("system_status"),
            "extension_last_seen": firefox_manager._system_state.get("extension_last_seen")
        }
        
        # update_state 테스트
        try:
            test_time = datetime.now().isoformat()
            await firefox_manager.update_state("extension_last_seen", test_time)
            
            # 업데이트 후 확인
            updated_value = firefox_manager._system_state.get("extension_last_seen")
            diagnosis["update_test"] = {
                "success": updated_value == test_time,
                "set_value": test_time,
                "actual_value": updated_value
            }
        except Exception as e:
            diagnosis["update_test"] = {
                "success": False,
                "error": str(e)
            }
    
    return diagnosis


# ======================== LLM Query Settings Endpoints ========================

@router.get("/llm/query/settings")
async def get_llm_query_settings():
    """LLM Query 설정 가져오기"""
    try:
        settings_path = Path(__file__).parent / "collection" / "settings" / "llm_query_settings.json"
        if settings_path.exists():
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
            return settings
        else:
            # 기본 설정 반환
            default_settings = {
                "auto_query_enabled": True,
                "max_queries_per_analysis": 5,
                "allowed_providers": ["chatgpt", "claude", "gemini"],
                "query_timeout": 30,
                "firefox_visible": True
            }
            return default_settings
    except Exception as e:
        logger.error(f"Failed to get LLM query settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/llm/query/settings")
async def update_llm_query_settings(settings: Dict[str, Any]):
    """LLM Query 설정 업데이트"""
    try:
        settings_path = Path(__file__).parent / "collection" / "settings" / "llm_query_settings.json"
        
        # 디렉토리 생성
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 저장
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
            
        logger.info(f"LLM query settings updated: {settings}")
        return settings
        
    except Exception as e:
        logger.error(f"Failed to update LLM query settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/llm/query/activities")
async def get_llm_query_activities():
    """LLM Query 활동 내역 가져오기"""
    try:
        # TODO: 실제 활동 내역은 데이터베이스나 파일에서 로드
        # 여기서는 빈 배열 반환
        return {"activities": []}
    except Exception as e:
        logger.error(f"Failed to get LLM query activities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/llm/query/analysis/status")
async def get_llm_analysis_status():
    """LLM 분석 상태 가져오기"""
    try:
        # TODO: 실제 분석 상태는 메모리나 데이터베이스에서 로드
        return {
            "current_analysis": None,
            "queries_sent": 0,
            "queries_completed": 0,
            "last_query_time": None,
            "analysis_progress": 0
        }
    except Exception as e:
        logger.error(f"Failed to get LLM analysis status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/llm/query/stats")
async def get_llm_query_stats():
    """LLM Query 통계 가져오기"""
    try:
        # TODO: 실제 통계는 데이터베이스나 파일에서 로드
        return {}
    except Exception as e:
        logger.error(f"Failed to get LLM query stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/llm/query/activities/clear")
async def clear_llm_query_activities():
    """완료된 LLM Query 활동 내역 삭제"""
    try:
        # TODO: 실제 삭제 로직 구현
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to clear LLM query activities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ======================== Initialization and Shutdown ========================

async def initialize():
    """Initialize Argosa core system"""
    logger.debug("Initializing Argosa core system...")
    
    # Create directories
    DATA_PATH.mkdir(parents=True, exist_ok=True)
    
    # Initialize shared services only if they exist
    if cache_manager:
        await cache_manager.initialize()
    else:
        logger.warning("Cache manager not available, skipping initialization")
    
    if command_queue:
        await command_queue.initialize()
        # Command handlers 등록
        command_queue.register_handler("collect_conversations", handle_collect_command)
        command_queue.register_handler("execute_llm_query", handle_llm_query_command)
        command_queue.register_handler("crawl_web", handle_crawl_command)
    else:
        logger.warning("Command queue not available, skipping initialization")
    
    if metrics:
        await metrics.initialize()
    else:
        logger.warning("Metrics not available, skipping initialization")
    
    # State management is now handled entirely by Firefox Manager
    logger.debug("State management delegated to Firefox Manager")
    
    # Firefox Manager 초기화 및 상태 동기화
    if firefox_manager:
        try:
            # Firefox Manager initialization with state preservation
            logger.debug("Initializing Firefox Manager...")
            
            # Initialize Firefox Manager - it becomes the single source of truth for state
            await firefox_manager.initialize()
            logger.debug("Firefox manager initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Firefox manager: {e}")
            # Firefox Manager initialization failed - fallback mode
            logger.warning("Running without Firefox Manager - limited functionality")
    else:
        logger.warning("Firefox manager not available")
        # Firefox Manager not available - limited state management
        logger.warning("Firefox Manager not available - system will have limited state management capabilities")
    
    logger.debug("Argosa core system initialized")

async def shutdown():
    """Shutdown Argosa core system"""
    logger.info("Shutting down Argosa core system...")
    
    # Firefox Manager 정리 (모니터링과 WebSocket 포함)
    if firefox_manager:
        await firefox_manager.cleanup()
    else:
        # Legacy firefox_monitor 중지 - DISABLED
        # firefox_monitor.stop_monitor()
        pass
    
    # Close WebSocket connections (firefox_manager가 처리하지 않는 것들)
    for websocket in list(active_websockets):
        try:
            await websocket.close()
        except:
            pass
    active_websockets.clear()
    
    # Shutdown shared services
    if command_queue:
        await command_queue.shutdown()
    if metrics:
        await metrics.shutdown()
    if cache_manager:
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

# Debug: File loading completion check
logger.debug("Data collection module loaded")
