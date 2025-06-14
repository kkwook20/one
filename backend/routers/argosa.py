# backend/routers/argosa.py - Argosa 시스템 라우터 (세션 체크 트리거 개선)

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from typing import Dict, List, Optional, Any
import asyncio
import json
from datetime import datetime, timedelta
from pydantic import BaseModel
from pathlib import Path
import hashlib
import os
import subprocess
import platform
import uuid
import sys
import shutil

# Create router
router = APIRouter()

# WebSocket connections for Argosa
active_connections: Dict[str, WebSocket] = {}

# Configuration
LLM_DATA_PATH = Path("./data/argosa/llm-conversations")
SYNC_CONFIG_PATH = Path("./data/argosa/llm-conversations/sync-config.json")
SYNC_STATUS_PATH = Path("./data/argosa/llm-conversations")
SESSION_DATA_PATH = Path("./data/argosa/llm-conversations/sessions.json")
SCHEDULE_FAILURE_PATH = Path("./data/argosa/llm-conversations/schedule-failure.json")

# ======================== Data Models ========================

# Firefox 제어 관련 모델
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

# 세션 관련 모델
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

# ======================== Helper Functions ========================

async def check_firefox_running():
    """Firefox 실행 여부 확인"""
    system = platform.system()
    
    if system == "Windows":
        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq firefox.exe"],
            capture_output=True,
            text=True
        )
        return "firefox.exe" in result.stdout
    else:
        result = subprocess.run(
            ["pgrep", "-x", "firefox"],
            capture_output=True
        )
        return result.returncode == 0

def get_firefox_command(profile_name: str = "llm-collector"):
    """Get Firefox launch command based on OS"""
    system = platform.system()
    
    if system == "Windows":
        # 여러 Firefox 경로 시도
        firefox_paths = [
            r"C:\Program Files\Firefox Developer Edition\firefox.exe",
            r"C:\Program Files\Mozilla Firefox\firefox.exe",
            r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Mozilla Firefox\firefox.exe"),
            os.path.expandvars(r"%ProgramFiles%\Mozilla Firefox\firefox.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe")
        ]
        
        for path in firefox_paths:
            if os.path.exists(path):
                print(f"[Firefox] Found Firefox at: {path}")
                return [path, "--no-remote", "-P", profile_name]
        
        # PATH에서 firefox 찾기
        firefox_in_path = shutil.which("firefox")
        if firefox_in_path:
            print(f"[Firefox] Found Firefox in PATH: {firefox_in_path}")
            return [firefox_in_path, "--no-remote", "-P", profile_name]
            
        # 상세한 에러 메시지
        error_msg = "Firefox not found in any of these locations:\n"
        for path in firefox_paths:
            error_msg += f"  - {path}\n"
        error_msg += "\nPlease install Firefox or add it to your PATH"
        raise Exception(error_msg)
        
    elif system == "Darwin":  # macOS
        firefox_paths = [
            "/Applications/Firefox.app/Contents/MacOS/firefox",
            "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
            os.path.expanduser("~/Applications/Firefox.app/Contents/MacOS/firefox")
        ]
        
        for path in firefox_paths:
            if os.path.exists(path):
                return [path, "--no-remote", "-P", profile_name]
                
        raise Exception("Firefox not found on macOS. Please install Firefox.")
        
    else:  # Linux
        firefox_in_path = shutil.which("firefox")
        if firefox_in_path:
            return [firefox_in_path, "--no-remote", "-P", profile_name]
            
        # Try common Linux paths
        firefox_paths = [
            "/usr/bin/firefox",
            "/usr/local/bin/firefox",
            "/snap/bin/firefox"
        ]
        
        for path in firefox_paths:
            if os.path.exists(path):
                return [path, "--no-remote", "-P", profile_name]
                
        raise Exception("Firefox not found. Please install Firefox: sudo apt install firefox")

async def monitor_firefox_process(process, sync_id):
    """Firefox 프로세스 모니터링"""
    try:
        await asyncio.sleep(10)
        
        while True:
            if process.poll() is not None:
                print(f"[Firefox] Process terminated with code: {process.returncode}")
                
                status_file = SYNC_STATUS_PATH / f"sync-status-{sync_id}.json"
                if status_file.exists():
                    with open(status_file, 'r') as f:
                        current_status = json.load(f)
                    
                    if current_status.get("status") in ["pending", "syncing"]:
                        with open(status_file, 'w') as f:
                            json.dump({
                                "status": "error",
                                "progress": current_status.get("progress", 0),
                                "message": "Firefox was closed unexpectedly",
                                "updated_at": datetime.now().isoformat()
                            }, f)
                break
            
            await asyncio.sleep(2)
            
    except Exception as e:
        print(f"[Firefox] Error monitoring process: {e}")

async def should_sync_today(platform: str) -> bool:
    """오늘 sync를 해야 하는지 판단 - 개선된 로직"""
    try:
        platform_path = LLM_DATA_PATH / platform
        if not platform_path.exists():
            return True
        
        today = datetime.now().date()
        yesterday = today - timedelta(days=1)
        
        # 최근 2일간의 파일 확인
        recent_files = []
        for file in platform_path.glob("*.json"):
            file_date_str = file.stem.split('_')[0]
            try:
                file_date = datetime.strptime(file_date_str, "%Y-%m-%d").date()
                if file_date >= yesterday:
                    recent_files.append((file_date, file))
            except:
                continue
        
        # 오늘 데이터가 있는지 확인
        today_files = [f for d, f in recent_files if d == today]
        yesterday_files = [f for d, f in recent_files if d == yesterday]
        
        # 오늘 데이터가 이미 있고, 충분한 대화가 수집되었다면 skip
        if today_files:
            with open(today_files[0], 'r') as f:
                data = json.load(f)
                conv_count = len(data.get("conversations", []))
                if conv_count >= 10:  # 최소 10개 이상의 대화가 있으면 충분
                    print(f"[Smart Schedule] {platform}: Today's data already exists with {conv_count} conversations")
                    return False
        
        # 어제 데이터가 없으면 sync 필요
        if not yesterday_files:
            print(f"[Smart Schedule] {platform}: Yesterday's data missing, sync needed")
            return True
        
        # 어제 데이터가 있지만 오늘 데이터가 없으면 sync 필요
        if yesterday_files and not today_files:
            print(f"[Smart Schedule] {platform}: Today's data missing, sync needed")
            return True
        
        return False
        
    except Exception as e:
        print(f"Error checking sync necessity: {e}")
        return True

# ======================== Session Check Trigger ========================

async def trigger_session_check_in_firefox(platform: str, profile_name: str = "llm-collector"):
    """Firefox를 열어서 세션 체크를 트리거"""
    try:
        # 세션 체크 트리거 파일 생성
        trigger_file = SYNC_STATUS_PATH / f"session-check-{platform}.trigger"
        trigger_file.write_text(json.dumps({
            "platform": platform,
            "action": "check_session",
            "timestamp": datetime.now().isoformat()
        }))
        
        # Firefox 실행 (특별한 URL로)
        firefox_cmd = get_firefox_command(profile_name)
        check_url = f"about:blank#check-session-{platform}"
        
        process = subprocess.Popen(firefox_cmd + [check_url])
        
        # 30초 후 자동으로 Firefox 종료
        async def auto_close():
            await asyncio.sleep(30)
            try:
                if platform.system() == "Windows":
                    subprocess.run(["taskkill", "/F", "/PID", str(process.pid)], capture_output=True)
                else:
                    process.terminate()
            except:
                pass
        
        # 백그라운드에서 자동 종료 실행
        asyncio.create_task(auto_close())
        
        return True
        
    except Exception as e:
        print(f"[Session Check] Failed to trigger check: {e}")
        return False

# ======================== Initialization ========================

async def initialize():
    """Initialize Argosa system"""
    print("[Argosa] Initializing AI analysis system...")
    
    LLM_DATA_PATH.mkdir(parents=True, exist_ok=True)
    SYNC_STATUS_PATH.mkdir(parents=True, exist_ok=True)
    
    for platform in ["chatgpt", "claude", "gemini", "deepseek", "grok", "perplexity", "custom"]:
        platform_path = LLM_DATA_PATH / platform
        platform_path.mkdir(exist_ok=True)
    
    schedule_path = LLM_DATA_PATH / "schedule.json"
    if not schedule_path.exists():
        default_schedule = {
            "enabled": False,
            "time": "09:00",
            "interval": "daily",
            "platforms": [],
            "settings": {},
            "updated_at": datetime.now().isoformat()
        }
        with open(schedule_path, 'w') as f:
            json.dump(default_schedule, f, indent=2)
    
    print("[Argosa] Initialized successfully")

async def shutdown():
    """Shutdown Argosa system"""
    print("[Argosa] Shutting down...")
    
    for client_id in list(active_connections.keys()):
        try:
            await active_connections[client_id].close()
        except:
            pass
        active_connections.pop(client_id, None)
    
    print("[Argosa] Shutdown complete")

# ======================== System Status ========================

@router.get("/status")
async def get_argosa_status():
    """Get Argosa system status for extension connection check"""
    try:
        # Check if directories exist
        llm_data_exists = LLM_DATA_PATH.exists()
        sync_status_exists = SYNC_STATUS_PATH.exists()
        
        # Count total conversations
        total_conversations = 0
        platform_stats = {}
        
        if llm_data_exists:
            for platform_dir in LLM_DATA_PATH.iterdir():
                if platform_dir.is_dir() and platform_dir.name in ["chatgpt", "claude", "gemini", "deepseek", "grok", "perplexity"]:
                    conv_count = 0
                    for json_file in platform_dir.glob("*.json"):
                        try:
                            with open(json_file, 'r') as f:
                                data = json.load(f)
                                conv_count += len(data.get("conversations", []))
                        except:
                            conv_count += 1
                    platform_stats[platform_dir.name] = conv_count
                    total_conversations += conv_count
        
        return {
            "status": "operational",
            "system": "argosa",
            "features": {
                "llm_collector": True,
                "data_analysis": False,
                "prediction": False,
            },
            "storage": {
                "llm_data_path": str(LLM_DATA_PATH),
                "exists": llm_data_exists,
                "total_conversations": total_conversations,
                "platform_stats": platform_stats
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

# ======================== LLM Conversation Endpoints ========================

@router.get("/llm/conversations/stats")
async def get_conversation_stats():
    """대화 수집 통계 반환"""
    try:
        stats = {
            "daily_stats": {},
            "latest_sync": {},
            "total_conversations": 0
        }
        
        for platform in ["chatgpt", "claude", "gemini", "deepseek", "grok", "perplexity"]:
            platform_path = LLM_DATA_PATH / platform
            if platform_path.exists():
                platform_stats = {}
                latest_file_time = None
                
                for file in platform_path.glob("*.json"):
                    date_str = file.stem.split('_')[0]
                    if date_str not in platform_stats:
                        platform_stats[date_str] = 0
                    
                    # 파일 내용을 읽어서 실제 대화 수 계산
                    try:
                        with open(file, 'r') as f:
                            data = json.load(f)
                            conversation_count = len(data.get("conversations", []))
                            platform_stats[date_str] += conversation_count
                    except:
                        platform_stats[date_str] += 1
                    
                    file_time = datetime.fromtimestamp(file.stat().st_mtime)
                    if latest_file_time is None or file_time > latest_file_time:
                        latest_file_time = file_time
                
                stats["daily_stats"][platform] = platform_stats
                if latest_file_time:
                    stats["latest_sync"][platform] = latest_file_time.isoformat()
        
        for platform_stats in stats["daily_stats"].values():
            stats["total_conversations"] += sum(platform_stats.values())
        
        return stats
        
    except Exception as e:
        print(f"Error getting stats: {e}")
        return {
            "daily_stats": {},
            "latest_sync": {},
            "total_conversations": 0
        }

@router.get("/llm/conversations/files")
async def get_conversation_files():
    """수집된 대화 파일 목록 반환"""
    try:
        files_list = []
        
        for platform in ["chatgpt", "claude", "gemini", "deepseek", "grok", "perplexity"]:
            platform_path = LLM_DATA_PATH / platform
            if platform_path.exists():
                files = [f.name for f in platform_path.glob("*.json")]
                files_list.append({
                    "platform": platform,
                    "files": sorted(files, reverse=True)[:10]
                })
        
        return {"files": files_list}
        
    except Exception as e:
        print(f"Error getting files: {e}")
        return {"files": []}

@router.delete("/llm/conversations/clean")
async def clean_conversations(days: int = 0):
    """오래된 대화 데이터 삭제"""
    try:
        deleted_count = 0
        
        if days == 0:
            for platform in ["chatgpt", "claude", "gemini", "deepseek", "grok", "perplexity"]:
                platform_path = LLM_DATA_PATH / platform
                if platform_path.exists():
                    for file in platform_path.glob("*.json"):
                        file.unlink()
                        deleted_count += 1
        else:
            cutoff_date = datetime.now() - timedelta(days=days)
            for platform in ["chatgpt", "claude", "gemini", "deepseek", "grok", "perplexity"]:
                platform_path = LLM_DATA_PATH / platform
                if platform_path.exists():
                    for file in platform_path.glob("*.json"):
                        if datetime.fromtimestamp(file.stat().st_mtime) < cutoff_date:
                            file.unlink()
                            deleted_count += 1
        
        return {"success": True, "deleted": deleted_count}
        
    except Exception as e:
        print(f"Error cleaning data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ======================== Session Management ========================

@router.post("/llm/sessions/check")
async def check_sessions(request: SessionCheckRequest):
    """각 플랫폼의 세션 상태 확인"""
    try:
        sessions = []
        
        session_data = {}
        if SESSION_DATA_PATH.exists():
            with open(SESSION_DATA_PATH, 'r') as f:
                session_data = json.load(f)
        
        for platform in request.platforms:
            session_info = session_data.get(platform, {})
            
            expires_at = session_info.get("expiresAt")
            if expires_at:
                expires_date = datetime.fromisoformat(expires_at)
                is_valid = expires_date > datetime.now()
            else:
                last_checked = session_info.get("lastChecked")
                if last_checked:
                    last_date = datetime.fromisoformat(last_checked)
                    # 24시간 이내면 유효한 것으로 간주
                    is_valid = (datetime.now() - last_date).total_seconds() < 86400
                else:
                    is_valid = False
            
            sessions.append(SessionStatus(
                platform=platform,
                valid=is_valid,
                lastChecked=session_info.get("lastChecked", datetime.now().isoformat()),
                expiresAt=expires_at
            ))
        
        return {"sessions": sessions}
        
    except Exception as e:
        print(f"Error checking sessions: {e}")
        return {"sessions": []}

@router.post("/llm/sessions/check-single")
async def check_single_session(request: SingleSessionCheckRequest):
    """단일 플랫폼의 세션 상태 확인"""
    try:
        session_data = {}
        if SESSION_DATA_PATH.exists():
            with open(SESSION_DATA_PATH, 'r') as f:
                session_data = json.load(f)
        
        session_info = session_data.get(request.platform, {})
        
        expires_at = session_info.get("expiresAt")
        if expires_at:
            expires_date = datetime.fromisoformat(expires_at)
            is_valid = expires_date > datetime.now()
        else:
            last_checked = session_info.get("lastChecked")
            if last_checked:
                last_date = datetime.fromisoformat(last_checked)
                # 24시간 이내면 유효한 것으로 간주
                is_valid = (datetime.now() - last_date).total_seconds() < 86400
            else:
                is_valid = False
        
        # 실제 세션 체크가 필요한 경우 Firefox 트리거
        if request.enabled and not is_valid:
            # 마지막 체크로부터 1시간 이상 지났으면 실제 체크
            should_recheck = True
            if last_checked:
                last_date = datetime.fromisoformat(last_checked)
                hours_since_check = (datetime.now() - last_date).total_seconds() / 3600
                should_recheck = hours_since_check > 1
            
            if should_recheck:
                # Firefox를 통한 실제 세션 체크 트리거
                await trigger_session_check_in_firefox(request.platform)
        
        return {
            "platform": request.platform,
            "valid": is_valid,
            "lastChecked": session_info.get("lastChecked", datetime.now().isoformat()),
            "expiresAt": expires_at
        }
        
    except Exception as e:
        print(f"Error checking session for {request.platform}: {e}")
        return {
            "platform": request.platform,
            "valid": False,
            "lastChecked": datetime.now().isoformat(),
            "expiresAt": None
        }

@router.post("/llm/sessions/open-login")
async def open_login_page(request: OpenLoginRequest):
    """플랫폼 로그인 페이지 열기"""
    try:
        # Firefox 명령어 가져오기
        try:
            firefox_cmd = get_firefox_command(request.profileName)
        except Exception as e:
            print(f"[Firefox] Error getting command: {e}")
            return {
                "success": False, 
                "error": str(e),
                "details": "Firefox not found. Please check installation."
            }
        
        # Firefox 실행
        try:
            print(f"[Firefox] Opening {request.platform} at {request.url}")
            
            # 특별한 URL 파라미터 추가 (Extension이 감지할 수 있도록)
            login_url = f"{request.url}#llm-collector-login"
            subprocess.Popen(firefox_cmd + [login_url])
            
            # 세션 파일 업데이트 (checking 상태로)
            session_data = {}
            if SESSION_DATA_PATH.exists():
                with open(SESSION_DATA_PATH, 'r') as f:
                    session_data = json.load(f)
            
            session_data[request.platform] = {
                "valid": False,
                "lastChecked": datetime.now().isoformat(),
                "expiresAt": None,
                "status": "checking"
            }
            
            SESSION_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(SESSION_DATA_PATH, 'w') as f:
                json.dump(session_data, f, indent=2)
            
            return {
                "success": True, 
                "message": f"Opening {request.platform} login page",
                "details": "Please log in and the session will be automatically detected"
            }
            
        except Exception as e:
            print(f"[Firefox] Error launching: {e}")
            return {
                "success": False, 
                "error": f"Failed to launch Firefox: {str(e)}",
                "details": "Check if Firefox profile exists"
            }
        
    except Exception as e:
        print(f"[Firefox] Unexpected error: {e}")
        return {
            "success": False, 
            "error": str(e),
            "details": "Unexpected error occurred"
        }

@router.post("/llm/sessions/update")
async def update_session_status(platform: str, valid: bool = True):
    """Extension에서 세션 상태 업데이트"""
    try:
        session_data = {}
        if SESSION_DATA_PATH.exists():
            with open(SESSION_DATA_PATH, 'r') as f:
                session_data = json.load(f)
        
        # 세션 유효기간을 7일로 설정 (대부분의 플랫폼이 일주일 정도 유지)
        expires_at = None
        if valid:
            expires_at = (datetime.now() + timedelta(days=7)).isoformat()
        
        session_data[platform] = {
            "valid": valid,
            "lastChecked": datetime.now().isoformat(),
            "expiresAt": expires_at
        }
        
        SESSION_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(SESSION_DATA_PATH, 'w') as f:
            json.dump(session_data, f, indent=2)
        
        print(f"[Session] Updated {platform} session: valid={valid}")
        
        return {"success": True}
        
    except Exception as e:
        return {"success": False, "error": str(e)}

# ======================== Schedule Management ========================

@router.get("/llm/schedule/last-failure")
async def get_last_schedule_failure():
    """마지막 스케줄 실패 정보 반환"""
    try:
        if SCHEDULE_FAILURE_PATH.exists():
            with open(SCHEDULE_FAILURE_PATH, 'r') as f:
                failure_data = json.load(f)
                
            if failure_data.get("timestamp"):
                failure_time = datetime.fromisoformat(failure_data["timestamp"])
                # 24시간 이내의 실패만 반환
                if (datetime.now() - failure_time).total_seconds() < 86400:
                    return {
                        "failure": True,
                        "reason": failure_data.get("reason", "unknown"),
                        "timestamp": failure_data["timestamp"],
                        "details": failure_data.get("details", {})
                    }
        
        return {"failure": False}
        
    except Exception as e:
        print(f"Error getting schedule failure: {e}")
        return {"failure": False}

# ======================== Firefox Control ========================

@router.post("/llm/firefox/launch")
async def launch_firefox_sync(request: SyncRequest, background_tasks: BackgroundTasks):
    """Firefox를 실행하고 Extension sync를 트리거"""
    print(f"[Firefox] Launch request received: {request.dict()}")
    
    try:
        # 1. 세션 체크
        enabled_platforms = [p["platform"] for p in request.platforms if p.get("enabled", True)]
        
        session_data = {}
        if SESSION_DATA_PATH.exists():
            with open(SESSION_DATA_PATH, 'r') as f:
                session_data = json.load(f)
        
        invalid_sessions = []
        for platform in enabled_platforms:
            session_info = session_data.get(platform, {})
            if not session_info.get("valid", False):
                invalid_sessions.append(platform)
        
        if invalid_sessions:
            failure_data = {
                "reason": "session_expired",
                "timestamp": datetime.now().isoformat(),
                "details": {
                    "invalid_sessions": invalid_sessions,
                    "message": f"Invalid sessions for: {', '.join(invalid_sessions)}"
                }
            }
            
            SCHEDULE_FAILURE_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(SCHEDULE_FAILURE_PATH, 'w') as f:
                json.dump(failure_data, f, indent=2)
            
            return {
                "success": False,
                "error": f"Invalid sessions for: {', '.join(invalid_sessions)}",
                "invalidSessions": invalid_sessions
            }
        
        # 2. 스마트 스케줄링 체크
        platforms_to_sync = []
        for platform in enabled_platforms:
            if await should_sync_today(platform):
                platforms_to_sync.append(platform)
        
        if not platforms_to_sync:
            failure_data = {
                "reason": "smart_scheduling",
                "timestamp": datetime.now().isoformat(),
                "details": {
                    "message": "No platforms need syncing today (data already up to date)",
                    "skipped_platforms": enabled_platforms
                }
            }
            
            SCHEDULE_FAILURE_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(SCHEDULE_FAILURE_PATH, 'w') as f:
                json.dump(failure_data, f, indent=2)
            
            return {
                "success": False,
                "error": "No platforms need syncing today (data already up to date)",
                "reason": "smart_scheduling"
            }
        
        # 3. 필터링된 플랫폼으로 sync 진행
        filtered_platforms = [p for p in request.platforms 
                            if p["platform"] in platforms_to_sync]
        
        sync_id = str(uuid.uuid4())
        sync_config = {
            "id": sync_id,
            "platforms": filtered_platforms,
            "settings": request.settings,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "auto_close": True  # sync 완료 후 Firefox 자동 종료
        }
        
        print(f"[Firefox] Saving sync config with ID: {sync_id}")
        print(f"[Firefox] Platforms to sync: {platforms_to_sync}")
        
        SYNC_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(SYNC_CONFIG_PATH, 'w') as f:
            json.dump(sync_config, f, indent=2)
        
        # 4. Firefox 실행
        profile_name = request.settings.get("profileName", "llm-collector")
        
        try:
            firefox_cmd = get_firefox_command(profile_name)
            print(f"[Firefox] Command to execute: {firefox_cmd}")
        except Exception as e:
            print(f"[Firefox] Failed to get Firefox command: {e}")
            return {
                "success": False,
                "error": str(e),
                "details": "Please check Firefox installation"
            }
        
        print("[Firefox] Checking if Firefox is already running...")
        is_running = await check_firefox_running()
        print(f"[Firefox] Is running: {is_running}")
        
        debug_mode = request.settings.get("debug", True)
        
        if not is_running:
            print(f"[Firefox] Starting Firefox with command: {firefox_cmd}")
            try:
                # sync trigger URL로 시작
                start_url = "about:blank#llm-sync-trigger"
                
                process = subprocess.Popen(
                    firefox_cmd + [start_url],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
                print(f"[Firefox] Process started with PID: {process.pid}")
                
                # 프로세스 모니터링 시작
                background_tasks.add_task(monitor_firefox_process, process, sync_id)
                
                # Firefox 시작 대기
                await asyncio.sleep(5)
                print("[Firefox] Firefox startup wait completed")
                
            except Exception as e:
                print(f"[Firefox] Failed to start Firefox: {e}")
                return {
                    "success": False,
                    "error": f"Failed to start Firefox: {str(e)}",
                    "details": "Check Firefox installation and profile"
                }
        else:
            print("[Firefox] Opening new tab in existing instance")
            subprocess.Popen(firefox_cmd + ["about:blank#llm-sync-trigger"])
        
        # 초기 상태 파일 생성
        status_file = SYNC_STATUS_PATH / f"sync-status-{sync_id}.json"
        with open(status_file, 'w') as f:
            json.dump({
                "status": "pending",
                "progress": 0,
                "message": "Waiting for extension to start...",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }, f)
        
        print(f"[Firefox] Sync initiated successfully with ID: {sync_id}")
        
        # 스케줄 실패 기록 삭제
        if SCHEDULE_FAILURE_PATH.exists():
            SCHEDULE_FAILURE_PATH.unlink()
        
        return {
            "success": True,
            "sync_id": sync_id,
            "message": "Firefox launched and sync triggered",
            "debug_mode": debug_mode,
            "platforms_to_sync": platforms_to_sync
        }
        
    except Exception as e:
        print(f"[Firefox] Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "details": "Unexpected error occurred"
        }

@router.get("/llm/sync/status/{sync_id}")
async def get_sync_status(sync_id: str):
    """Sync 진행 상태 확인"""
    try:
        status_file = SYNC_STATUS_PATH / f"sync-status-{sync_id}.json"
        
        if status_file.exists():
            with open(status_file, 'r') as f:
                status = json.load(f)
                
            # timeout 체크 (5분)
            if status.get("updated_at"):
                last_update = datetime.fromisoformat(status["updated_at"])
                if (datetime.now() - last_update).total_seconds() > 300:
                    status["status"] = "timeout"
                    status["message"] = "Sync timeout - no response from extension"
                    
            return status
        else:
            return {
                "status": "pending",
                "progress": 0,
                "message": "Waiting for extension to start...",
                "updated_at": datetime.now().isoformat()
            }
    except Exception as e:
        return {"status": "error", "error": str(e)}

@router.post("/llm/sync/cancel/{sync_id}")
async def cancel_sync(sync_id: str):
    """진행 중인 sync 취소"""
    try:
        status_file = SYNC_STATUS_PATH / f"sync-status-{sync_id}.json"
        
        if status_file.exists():
            with open(status_file, 'w') as f:
                json.dump({
                    "status": "cancelled",
                    "progress": 0,
                    "message": "Sync cancelled by user",
                    "updated_at": datetime.now().isoformat()
                }, f)
        
        # Firefox 종료
        if platform.system() == "Windows":
            subprocess.run(["taskkill", "/F", "/IM", "firefox.exe"], capture_output=True)
        else:
            subprocess.run(["pkill", "firefox"], capture_output=True)
        
        return {"success": True, "message": "Sync cancelled"}
        
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/llm/sync/schedule")
async def schedule_sync(config: ScheduleConfig):
    """자동 sync 스케줄 설정"""
    try:
        schedule_config = {
            "enabled": config.enabled,
            "time": config.startTime,
            "interval": config.interval,
            "platforms": config.platforms,
            "settings": config.settings,
            "updated_at": datetime.now().isoformat()
        }
        
        schedule_path = LLM_DATA_PATH / "schedule.json"
        with open(schedule_path, 'w') as f:
            json.dump(schedule_config, f, indent=2)
        
        # Cron job 설정 (Linux/Mac)
        if platform.system() != "Windows":
            try:
                import subprocess
                
                # 현재 디렉토리의 run_sync.py 스크립트 경로
                script_path = Path(__file__).parent.parent / "scripts" / "run_sync.py"
                if not script_path.exists():
                    # 스크립트 생성
                    script_path.parent.mkdir(exist_ok=True)
                    with open(script_path, 'w') as f:
                        f.write("""#!/usr/bin/env python3
import requests
import sys

try:
    response = requests.post('http://localhost:8000/api/argosa/llm/sync/trigger-scheduled')
    if response.ok:
        print("Scheduled sync triggered successfully")
    else:
        print(f"Failed to trigger sync: {response.status_code}")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
""")
                    script_path.chmod(0o755)
                
                # Crontab 업데이트
                result = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
                if result.returncode == 0:
                    current_cron = result.stdout
                    new_cron = '\n'.join([line for line in current_cron.split('\n') 
                                        if 'llm-collector-sync' not in line and line.strip()])
                else:
                    new_cron = ""
                
                if config.enabled and config.interval != 'manual':
                    hour, minute = config.startTime.split(":")
                    if config.interval == 'daily':
                        cron_schedule = f"{minute} {hour} * * *"
                    elif config.interval == '12h':
                        cron_schedule = f"{minute} {hour},{(int(hour)+12)%24} * * *"
                    elif config.interval == '6h':
                        hours = ','.join([str((int(hour)+i*6)%24) for i in range(4)])
                        cron_schedule = f"{minute} {hours} * * *"
                    else:
                        cron_schedule = f"{minute} {hour} * * *"
                    
                    new_job = f"{cron_schedule} {sys.executable} {script_path} # llm-collector-sync"
                    new_cron = new_cron.strip() + '\n' + new_job + '\n'
                
                process = subprocess.Popen(['crontab', '-'], stdin=subprocess.PIPE, text=True)
                process.communicate(input=new_cron)
                
            except Exception as e:
                print(f"Failed to update crontab: {e}")
        else:
            # Windows Task Scheduler
            print("Windows Task Scheduler integration not implemented yet")
            # TODO: Windows Task Scheduler 구현
        
        return {"success": True, "message": "Schedule updated"}
        
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/llm/sync/config")
async def get_sync_config():
    """Extension이 읽을 sync 설정 반환"""
    if SYNC_CONFIG_PATH.exists():
        with open(SYNC_CONFIG_PATH, 'r') as f:
            config = json.load(f)
            
        # 설정이 1시간 이상 오래되었으면 무시
        if config.get("created_at"):
            created = datetime.fromisoformat(config["created_at"])
            if (datetime.now() - created).total_seconds() > 3600:
                return {"status": "no_config"}
                
        return config
    else:
        return {"status": "no_config"}

@router.post("/llm/sync/progress")
async def update_sync_progress(progress: SyncProgress):
    """Extension이 진행상황 업데이트"""
    try:
        status_file = SYNC_STATUS_PATH / f"sync-status-{progress.sync_id}.json"
        
        status = {
            "status": progress.status,
            "progress": progress.progress,
            "current_platform": progress.current_platform,
            "collected": progress.collected,
            "message": progress.message,
            "updated_at": datetime.now().isoformat()
        }
        
        with open(status_file, 'w') as f:
            json.dump(status, f, indent=2)
        
        # WebSocket으로 실시간 업데이트 전송
        for client_id, websocket in active_connections.items():
            try:
                await websocket.send_json({
                    "type": "sync_progress",
                    "data": status
                })
            except:
                pass
        
        # sync 완료 시 Firefox 자동 종료
        if progress.status == "completed":
            # sync config 확인
            if SYNC_CONFIG_PATH.exists():
                with open(SYNC_CONFIG_PATH, 'r') as f:
                    sync_config = json.load(f)
                    
                if sync_config.get("auto_close", True):
                    # 3초 후 Firefox 종료
                    async def close_firefox():
                        await asyncio.sleep(3)
                        if platform.system() == "Windows":
                            subprocess.run(["taskkill", "/F", "/IM", "firefox.exe"], capture_output=True)
                        else:
                            subprocess.run(["pkill", "firefox"], capture_output=True)
                    
                    asyncio.create_task(close_firefox())
        
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/llm/sync/trigger-scheduled")
async def trigger_scheduled_sync(background_tasks: BackgroundTasks):
    """스케줄된 sync 실행"""
    try:
        schedule_path = LLM_DATA_PATH / "schedule.json"
        
        if not schedule_path.exists():
            return {"success": False, "error": "No schedule configuration found"}
        
        with open(schedule_path, 'r') as f:
            schedule = json.load(f)
        
        if not schedule.get('enabled'):
            return {"success": False, "error": "Scheduled sync is disabled"}
        
        request = SyncRequest(
            platforms=[{"platform": p, "enabled": True} for p in schedule.get("platforms", [])],
            settings=schedule.get("settings", {})
        )
        
        result = await launch_firefox_sync(request, background_tasks)
        return result
        
    except Exception as e:
        failure_data = {
            "reason": "exception",
            "timestamp": datetime.now().isoformat(),
            "details": {
                "error": str(e),
                "message": "Unexpected error during scheduled sync"
            }
        }
        
        SCHEDULE_FAILURE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(SCHEDULE_FAILURE_PATH, 'w') as f:
            json.dump(failure_data, f, indent=2)
        
        return {"success": False, "error": str(e)}

@router.post("/llm/conversations/save")
async def save_conversations(data: Dict[str, Any]):
    """Extension에서 수집한 대화 데이터 저장"""
    try:
        platform = data.get("platform")
        conversations = data.get("conversations", [])
        timestamp = data.get("timestamp", datetime.now().isoformat())
        
        if not platform:
            return {"success": False, "error": "Platform not specified"}
        
        platform_path = LLM_DATA_PATH / platform
        platform_path.mkdir(exist_ok=True)
        
        # 오늘 날짜로 파일명 생성
        date_str = datetime.now().strftime("%Y-%m-%d")
        file_count = len(list(platform_path.glob(f"{date_str}_*.json")))
        filename = f"{date_str}_conversation_{file_count + 1}.json"
        
        file_path = platform_path / filename
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump({
                "platform": platform,
                "timestamp": timestamp,
                "conversations": conversations,
                "metadata": {
                    "count": len(conversations),
                    "collected_at": datetime.now().isoformat()
                }
            }, f, ensure_ascii=False, indent=2)
        
        print(f"[LLM Collector] Saved {len(conversations)} conversations to {filename}")
        
        return {
            "success": True,
            "filename": filename,
            "count": len(conversations)
        }
        
    except Exception as e:
        print(f"Error saving conversations: {e}")
        return {"success": False, "error": str(e)}

# ======================== WebSocket Endpoint ========================

@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """Argosa WebSocket connection"""
    await websocket.accept()
    active_connections[client_id] = websocket
    
    try:
        await websocket.send_json({
            "type": "connection",
            "status": "connected",
            "client_id": client_id
        })
        
        while True:
            data = await websocket.receive_json()
            
            # Handle different message types
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            
            # Broadcast to other clients if needed
            for other_id, other_ws in active_connections.items():
                if other_id != client_id:
                    try:
                        await other_ws.send_json(data)
                    except:
                        pass
                        
    except WebSocketDisconnect:
        active_connections.pop(client_id, None)
        print(f"[Argosa] Client {client_id} disconnected")