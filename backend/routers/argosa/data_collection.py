# backend/routers/argosa/data_collection.py - 통합된 Argosa 데이터 수집 시스템 (세션 관리 개선)

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, UploadFile, File
from typing import Dict, List, Optional, Any, Tuple
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
import aiohttp
import traceback

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

# SessionUpdate 모델 추가
class SessionUpdate(BaseModel):
    platform: str
    valid: bool = True
    cookies: Optional[Dict[str, Any]] = None
    headers: Optional[Dict[str, str]] = None

# 데이터 수집 관련 모델
class DataSource(BaseModel):
    id: str
    name: str
    type: str  # chat, web, youtube, file, api, llm
    status: str  # active, inactive, error
    lastSync: Optional[str] = None
    config: Dict[str, Any] = {}

class CollectionTask(BaseModel):
    id: str
    source: str
    query: str
    status: str  # pending, collecting, completed, failed
    createdAt: str
    completedAt: Optional[str] = None
    results: List[Dict[str, Any]] = []
    error: Optional[str] = None

class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class SearchRequest(BaseModel):
    query: str
    sources: List[str] = ["web"]
    limit: int = 10

# In-memory storage for data collection
data_sources: Dict[str, DataSource] = {}
collection_tasks: Dict[str, CollectionTask] = {}
collected_data: List[Dict[str, Any]] = []

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

def get_firefox_command(profile_name: str = "llm-collector", headless: bool = False):
    """Get Firefox launch command based on OS"""
    system = platform.system()
    
    base_args = ["--no-remote", "-P", profile_name]
    
    # headless 모드 추가 (Linux/macOS에서만)
    if headless and system in ["Linux", "Darwin"]:
        base_args.append("--headless")
    
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
                return [path] + base_args
        
        # PATH에서 firefox 찾기
        firefox_in_path = shutil.which("firefox")
        if firefox_in_path:
            print(f"[Firefox] Found Firefox in PATH: {firefox_in_path}")
            return [firefox_in_path] + base_args
            
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
                return [path] + base_args
                
        raise Exception("Firefox not found on macOS. Please install Firefox.")
        
    else:  # Linux
        firefox_in_path = shutil.which("firefox")
        if firefox_in_path:
            return [firefox_in_path] + base_args
            
        # Try common Linux paths
        firefox_paths = [
            "/usr/bin/firefox",
            "/usr/local/bin/firefox",
            "/snap/bin/firefox"
        ]
        
        for path in firefox_paths:
            if os.path.exists(path):
                return [path] + base_args
                
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

# ======================== 개선된 세션 관리 함수 ========================

async def verify_session_with_firefox(platform: str) -> bool:
    """Firefox를 통해 실제 세션 상태를 확인"""
    print(f"[Session] Verifying {platform} session with Firefox...")
    
    try:
        # Platform URLs
        platform_urls = {
            'chatgpt': 'https://chat.openai.com',
            'claude': 'https://claude.ai',
            'gemini': 'https://gemini.google.com',
            'deepseek': 'https://chat.deepseek.com',
            'grok': 'https://grok.x.ai',
            'perplexity': 'https://www.perplexity.ai'
        }
        
        if platform not in platform_urls:
            return False
        
        # 세션 체크 트리거 파일 생성
        trigger_file = SYNC_STATUS_PATH / f"session-verify-{platform}.trigger"
        trigger_file.write_text(json.dumps({
            "platform": platform,
            "action": "verify_session",
            "timestamp": datetime.now().isoformat()
        }))
        
        # Firefox 실행
        firefox_cmd = get_firefox_command("llm-collector")
        check_url = f"{platform_urls[platform]}#verify-session-{platform}"
        
        process = subprocess.Popen(firefox_cmd + [check_url])
        
        # 결과 파일 경로
        result_file = SYNC_STATUS_PATH / f"session-verify-{platform}.result"
        
        # 최대 15초 대기
        max_wait = 15
        for i in range(max_wait):
            await asyncio.sleep(1)
            
            # Extension이 결과를 저장했는지 확인
            if result_file.exists():
                try:
                    with open(result_file, 'r') as f:
                        result = json.load(f)
                    
                    # 정리
                    trigger_file.unlink()
                    result_file.unlink()
                    
                    # Firefox 종료
                    try:
                        if platform.system() == "Windows":
                            subprocess.run(["taskkill", "/F", "/PID", str(process.pid)], capture_output=True)
                        else:
                            process.terminate()
                    except:
                        pass
                    
                    return result.get("valid", False)
                except:
                    pass
        
        # 시간 초과
        print(f"[Session] Verification timeout for {platform}")
        
        # 정리
        try:
            trigger_file.unlink()
            if result_file.exists():
                result_file.unlink()
            process.terminate()
        except:
            pass
        
        return False
        
    except Exception as e:
        print(f"[Session] Error verifying {platform}: {e}")
        return False

async def update_session_status(platform: str, valid: bool, cookies: Optional[List[Dict]] = None, 
                              session_data: Optional[Dict] = None, reason: str = "manual"):
    """세션 상태 업데이트 - 쿠키 기반 검증"""
    print(f"[Session] Updating {platform}: valid={valid}, reason={reason}")
    
    # 세션 데이터 로드
    sessions = {}
    if SESSION_DATA_PATH.exists():
        with open(SESSION_DATA_PATH, 'r') as f:
            sessions = json.load(f)
    
    # 기존 상태가 "checking"이고 valid가 False인 경우 처리
    current_session = sessions.get(platform, {})
    if current_session.get("status") == "checking" and not valid:
        print(f"[Session] {platform} is in checking status, keeping as checking")
        return True
    
    # 세션 정보 업데이트
    sessions[platform] = {
        "valid": valid,
        "lastChecked": datetime.now().isoformat(),
        "expiresAt": None,
        "status": "active" if valid else "expired",
        "cookies": cookies or [],
        "sessionData": session_data or {},
        "updateReason": reason,
        "updateTime": datetime.now().isoformat()
    }
    
    # 쿠키에서 만료 시간 추출
    if valid and cookies:
        max_expiry = None
        for cookie in cookies:
            if cookie.get("expires"):
                expiry_time = datetime.fromtimestamp(cookie["expires"])
                if max_expiry is None or expiry_time > max_expiry:
                    max_expiry = expiry_time
        
        if max_expiry:
            sessions[platform]["expiresAt"] = max_expiry.isoformat()
        else:
            # 쿠키에 만료 시간이 없으면 7일로 설정
            sessions[platform]["expiresAt"] = (datetime.now() + timedelta(days=7)).isoformat()
    elif valid and not cookies:
        # 쿠키 정보 없이 valid인 경우 7일로 설정
        sessions[platform]["expiresAt"] = (datetime.now() + timedelta(days=7)).isoformat()
    
    # 저장
    SESSION_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SESSION_DATA_PATH, 'w') as f:
        json.dump(sessions, f, indent=2)
    
    print(f"[Session] Updated {platform}: valid={valid}, expires={sessions[platform].get('expiresAt')}")
    return valid

async def check_session_validity(platform: str) -> Tuple[bool, Optional[str]]:
    """세션 유효성 확인 - 만료 시간 체크 포함"""
    print(f"[Session] Checking validity for {platform}")
    
    if not SESSION_DATA_PATH.exists():
        return False, None
    
    with open(SESSION_DATA_PATH, 'r') as f:
        sessions = json.load(f)
    
    session = sessions.get(platform, {})
    
    # checking 상태는 valid로 간주
    if session.get("status") == "checking":
        print(f"[Session] {platform} is in checking status, treating as valid")
        # checking 상태를 active로 자동 변경
        session["status"] = "active"
        session["valid"] = True
        session["lastChecked"] = datetime.now().isoformat()
        sessions[platform] = session
        with open(SESSION_DATA_PATH, 'w') as f:
            json.dump(sessions, f, indent=2)
        return True, None
    
    # valid 필드 확인
    if not session.get("valid", False):
        return False, session.get("expiresAt")
    
    # 만료 시간 확인
    expires_at = session.get("expiresAt")
    if expires_at:
        expire_time = datetime.fromisoformat(expires_at)
        if expire_time < datetime.now():
            print(f"[Session] {platform} session expired at {expires_at}")
            # 만료된 세션 업데이트
            await update_session_status(platform, False, reason="expired")
            return False, None
    
    # 마지막 체크가 24시간 이상 지났으면 재확인 필요
    last_checked = session.get("lastChecked")
    if last_checked:
        last_time = datetime.fromisoformat(last_checked)
        if (datetime.now() - last_time).total_seconds() > 86400:
            print(f"[Session] {platform} session needs refresh (>24h)")
            return False, expires_at
    
    return True, expires_at

# ======================== Data Collection Helper Functions ========================

async def analyze_chat_messages(messages: List[ChatMessage]) -> List[Dict[str, Any]]:
    """Analyze chat messages for insights"""
    insights = []
    
    # Extract questions
    questions = [msg for msg in messages if msg.role == "user" and "?" in msg.content]
    if questions:
        insights.append({
            "type": "questions",
            "content": [q.content for q in questions],
            "count": len(questions)
        })
    
    # Extract topics (simple keyword extraction)
    all_text = " ".join([msg.content for msg in messages])
    keywords = extract_keywords(all_text)
    
    insights.append({
        "type": "topics",
        "content": keywords,
        "relevance": "high"
    })
    
    # Extract action items
    action_keywords = ["todo", "need to", "should", "must", "will"]
    actions = []
    for msg in messages:
        for keyword in action_keywords:
            if keyword in msg.content.lower():
                actions.append(msg.content)
                break
    
    if actions:
        insights.append({
            "type": "action_items",
            "content": actions,
            "priority": "medium"
        })
    
    return insights

async def search_web(query: str, limit: int) -> List[Dict[str, Any]]:
    """Search web for information"""
    # Simulate web search
    await asyncio.sleep(1)
    
    results = []
    for i in range(min(limit, 3)):
        results.append({
            "type": "web",
            "title": f"Result {i+1} for: {query}",
            "url": f"https://example.com/result{i+1}",
            "snippet": f"This is a relevant snippet about {query}...",
            "relevance": 0.9 - (i * 0.1)
        })
    
    return results

async def search_youtube(query: str, limit: int) -> List[Dict[str, Any]]:
    """Search YouTube for videos"""
    # Simulate YouTube search
    await asyncio.sleep(0.5)
    
    results = []
    for i in range(min(limit, 2)):
        results.append({
            "type": "youtube",
            "title": f"Video: {query} Tutorial Part {i+1}",
            "url": f"https://youtube.com/watch?v=example{i+1}",
            "duration": "10:25",
            "views": 150000 - (i * 50000),
            "channel": "Tech Channel"
        })
    
    return results

def extract_keywords(text: str) -> List[str]:
    """Simple keyword extraction"""
    # In production, use NLP libraries
    common_words = {"the", "is", "at", "which", "on", "a", "an", "and", "or", "but"}
    words = text.lower().split()
    word_freq = {}
    
    for word in words:
        if word not in common_words and len(word) > 3:
            word_freq[word] = word_freq.get(word, 0) + 1
    
    # Get top keywords
    sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
    return [word for word, freq in sorted_words[:10]]

async def cleanup_expired_sessions():
    """만료된 세션 자동 정리"""
    try:
        if not SESSION_DATA_PATH.exists():
            return
        
        with open(SESSION_DATA_PATH, 'r') as f:
            session_data = json.load(f)
        
        updated = False
        now = datetime.now()
        
        for platform, session_info in list(session_data.items()):
            expires_at = session_info.get("expiresAt")
            if expires_at:
                expire_date = datetime.fromisoformat(expires_at)
                if expire_date < now:
                    print(f"[Session] Cleaning expired session for {platform}")
                    session_data[platform]["valid"] = False
                    session_data[platform]["status"] = "expired"
                    updated = True
        
        if updated:
            with open(SESSION_DATA_PATH, 'w') as f:
                json.dump(session_data, f, indent=2)
            print("[Session] Expired sessions cleaned")
            
    except Exception as e:
        print(f"[Session] Error cleaning sessions: {e}")

# ======================== Initialization ========================

async def initialize():
    """Initialize Argosa system"""
    print("[Argosa] Initializing AI analysis and data collection system...")
    
    LLM_DATA_PATH.mkdir(parents=True, exist_ok=True)
    SYNC_STATUS_PATH.mkdir(parents=True, exist_ok=True)
    
    # 세션 정리 실행
    await cleanup_expired_sessions()
    
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
    
    # Initialize default data sources
    default_sources = [
        DataSource(
            id="llm_collector",
            name="LLM Conversations",
            type="llm",
            status="active",
            config={"platforms": ["chatgpt", "claude", "gemini", "deepseek", "grok", "perplexity"]}
        ),
        DataSource(
            id="web_default",
            name="Web Search",
            type="web",
            status="active",
            config={"engine": "default", "safe_search": True}
        ),
        DataSource(
            id="youtube_default",
            name="YouTube",
            type="youtube",
            status="active",
            config={"region": "US", "language": "en"}
        ),
        DataSource(
            id="chat_default",
            name="Chat Conversations",
            type="chat",
            status="active",
            config={"models": ["gpt", "claude", "llama"]}
        )
    ]
    
    for source in default_sources:
        data_sources[source.id] = source
    
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
    
    # Clear data
    data_sources.clear()
    collection_tasks.clear()
    collected_data.clear()
    
    print("[Argosa] Shutdown complete")

# ======================== System Status ========================

@router.get("/status")
async def get_argosa_status():
    """Get Argosa system status for extension connection check"""
    print("[DEBUG] Argosa status endpoint called!")
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
                "data_collection": True,
                "data_analysis": False,
                "prediction": False,
            },
            "storage": {
                "llm_data_path": str(LLM_DATA_PATH),
                "exists": llm_data_exists,
                "total_conversations": total_conversations,
                "platform_stats": platform_stats
            },
            "data_sources": len(data_sources),
            "active_tasks": len([t for t in collection_tasks.values() if t.status == "collecting"]),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

# ======================== Data Collection Endpoints ========================

@router.get("/sources")
async def get_data_sources():
    """Get all configured data sources"""
    return list(data_sources.values())

@router.post("/sources")
async def add_data_source(source: DataSource):
    """Add a new data source"""
    source.id = f"source_{uuid.uuid4().hex[:8]}"
    data_sources[source.id] = source
    return source

@router.delete("/sources/{source_id}")
async def remove_data_source(source_id: str):
    """Remove a data source"""
    if source_id not in data_sources:
        raise HTTPException(status_code=404, detail="Source not found")
    
    del data_sources[source_id]
    return {"message": "Source removed successfully"}

@router.post("/chat/process")
async def process_chat_conversation(messages: List[ChatMessage]):
    """Process chat conversation for insights"""
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    
    task = CollectionTask(
        id=task_id,
        source="chat",
        query="Chat conversation analysis",
        status="collecting",
        createdAt=datetime.now().isoformat()
    )
    
    collection_tasks[task_id] = task
    
    # Process messages
    insights = await analyze_chat_messages(messages)
    
    task.results = insights
    task.status = "completed"
    task.completedAt = datetime.now().isoformat()
    
    # Store in collected data
    for insight in insights:
        collected_data.append({
            "id": f"data_{uuid.uuid4().hex[:8]}",
            "source": "chat",
            "type": insight["type"],
            "content": insight["content"],
            "timestamp": datetime.now().isoformat()
        })
    
    return task

@router.post("/search")
async def search_data(request: SearchRequest):
    """Search for data across multiple sources"""
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    
    task = CollectionTask(
        id=task_id,
        source="multi",
        query=request.query,
        status="collecting",
        createdAt=datetime.now().isoformat()
    )
    
    collection_tasks[task_id] = task
    
    results = []
    
    # Search different sources
    if "web" in request.sources:
        web_results = await search_web(request.query, request.limit)
        results.extend(web_results)
    
    if "youtube" in request.sources:
        youtube_results = await search_youtube(request.query, request.limit)
        results.extend(youtube_results)
    
    task.results = results
    task.status = "completed"
    task.completedAt = datetime.now().isoformat()
    
    return task

@router.post("/collect/schedule")
async def schedule_collection(source_id: str, interval: int = 3600):
    """Schedule periodic data collection"""
    if source_id not in data_sources:
        raise HTTPException(status_code=404, detail="Source not found")
    
    # In production, this would create a scheduled task
    return {
        "source_id": source_id,
        "interval": interval,
        "status": "scheduled",
        "next_run": datetime.now().isoformat()
    }

@router.get("/tasks")
async def get_collection_tasks(status: Optional[str] = None):
    """Get collection tasks"""
    tasks = list(collection_tasks.values())
    
    if status:
        tasks = [t for t in tasks if t.status == status]
    
    return tasks

@router.get("/tasks/{task_id}")
async def get_task_details(task_id: str):
    """Get details of a specific collection task"""
    if task_id not in collection_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return collection_tasks[task_id]

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file for data extraction"""
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    
    task = CollectionTask(
        id=task_id,
        source="file",
        query=f"File: {file.filename}",
        status="collecting",
        createdAt=datetime.now().isoformat()
    )
    
    collection_tasks[task_id] = task
    
    # Process file
    content = await file.read()
    
    # Extract data based on file type
    if file.filename.endswith('.json'):
        data = json.loads(content)
        task.results = [{"type": "json", "data": data}]
    elif file.filename.endswith('.txt'):
        text = content.decode('utf-8')
        task.results = [{"type": "text", "content": text}]
    else:
        task.results = [{"type": "file", "filename": file.filename, "size": len(content)}]
    
    task.status = "completed"
    task.completedAt = datetime.now().isoformat()
    
    return task

@router.get("/collected")
async def get_collected_data(source: Optional[str] = None, limit: int = 100):
    """Get collected data"""
    data = collected_data
    
    if source:
        data = [d for d in data if d.get("source") == source]
    
    return data[-limit:]

@router.post("/analyze/{data_id}")
async def analyze_data(data_id: str):
    """Trigger analysis on collected data"""
    # Find data
    data = next((d for d in collected_data if d["id"] == data_id), None)
    
    if not data:
        raise HTTPException(status_code=404, detail="Data not found")
    
    # Send to analysis module
    analysis_request = {
        "data": data,
        "requested_analysis": ["intent", "entities", "sentiment"]
    }
    
    # In production, this would call the analysis module
    return {
        "data_id": data_id,
        "analysis_status": "queued",
        "message": "Data sent for analysis"
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
        
        for platform in request.platforms:
            is_valid, expires_at = await check_session_validity(platform)
            
            # 세션 정보 가져오기
            session_data = {}
            if SESSION_DATA_PATH.exists():
                with open(SESSION_DATA_PATH, 'r') as f:
                    session_data = json.load(f)
            
            session_info = session_data.get(platform, {})
            
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
    """단일 플랫폼의 세션 상태 확인 - 개선된 버전"""
    print(f"\n[Session Check] Platform: {request.platform}, Enabled: {request.enabled}", flush=True)
    
    try:
        is_valid, expires_at = await check_session_validity(request.platform)
        
        # 세션 정보 가져오기
        session_data = {}
        if SESSION_DATA_PATH.exists():
            with open(SESSION_DATA_PATH, 'r') as f:
                session_data = json.load(f)
        
        session_info = session_data.get(request.platform, {})
        
        # 세션이 invalid이고 enabled인 경우 Firefox로 실제 검증
        if not is_valid and request.enabled:
            print(f"[Session Check] Session invalid and enabled, attempting Firefox verification...", flush=True)
            actual_valid = await verify_session_with_firefox(request.platform)
            if actual_valid:
                print(f"[Session Check] Firefox verification showed {request.platform} is actually logged in!")
                is_valid = await update_session_status(request.platform, True, reason="firefox_verified")
                # 업데이트된 정보 다시 로드
                with open(SESSION_DATA_PATH, 'r') as f:
                    session_data = json.load(f)
                session_info = session_data.get(request.platform, {})
                expires_at = session_info.get("expiresAt")
        
        # 쿠키 정보 포함
        has_cookies = len(session_info.get("cookies", [])) > 0
        
        response = {
            "platform": request.platform,
            "valid": is_valid,
            "lastChecked": session_info.get("lastChecked", datetime.now().isoformat()),
            "expiresAt": expires_at,
            "cookies": has_cookies,
            "sessionData": session_info.get("sessionData"),
            "status": session_info.get("status", "unknown")
        }
        
        print(f"[Session Check] Returning: {json.dumps(response, indent=2)}", flush=True)
        return response
        
    except Exception as e:
        print(f"[Session Check] ❌ Error: {e}", flush=True)
        print(f"[Session Check] Traceback: {traceback.format_exc()}", flush=True)
        return {
            "platform": request.platform,
            "valid": False,
            "lastChecked": datetime.now().isoformat(),
            "expiresAt": None,
            "cookies": False,
            "status": "error"
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
            await update_session_status(request.platform, False, reason="login_opened")
            
            # checking 상태로 변경
            session_data = {}
            if SESSION_DATA_PATH.exists():
                with open(SESSION_DATA_PATH, 'r') as f:
                    session_data = json.load(f)
            
            session_data[request.platform] = {
                **session_data.get(request.platform, {}),
                "status": "checking",
                "lastChecked": datetime.now().isoformat()
            }
            
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
async def update_session_status_endpoint(update: SessionUpdate):
    """Extension에서 세션 상태 업데이트 (개선된 버전)"""
    print(f"\n[Session Update] ===== RECEIVED UPDATE =====", flush=True)
    print(f"[Session Update] Platform: {update.platform}, Valid: {update.valid}", flush=True)
    print(f"[Session Update] Request from Extension detected!", flush=True)
    
    try:
        # 쿠키 정보 파싱
        cookies_list = []
        if update.cookies:
            for cookie_data in update.cookies.values():
                if isinstance(cookie_data, dict):
                    cookies_list.append(cookie_data)
        
        # 세션 상태 업데이트 (쿠키 정보 포함)
        await update_session_status(
            update.platform, 
            update.valid, 
            cookies=cookies_list,
            session_data=update.cookies,
            reason="extension_update"
        )
        
        print(f"[Session Update] ✅ Successfully updated {update.platform} session", flush=True)
        print(f"[Session Update] Cookies count: {len(cookies_list)}", flush=True)
        print(f"[Session Update] ===== UPDATE COMPLETE =====\n", flush=True)
        
        # 만료 시간 계산
        expires_at = None
        if update.valid and cookies_list:
            max_expiry = None
            for cookie in cookies_list:
                if cookie.get("expires"):
                    expiry_time = datetime.fromtimestamp(cookie["expires"])
                    if max_expiry is None or expiry_time > max_expiry:
                        max_expiry = expiry_time
            
            if max_expiry:
                expires_at = max_expiry.isoformat()
            else:
                expires_at = (datetime.now() + timedelta(days=7)).isoformat()
        elif update.valid:
            expires_at = (datetime.now() + timedelta(days=7)).isoformat()
        
        return {
            "success": True, 
            "expiresAt": expires_at,
            "cookiesReceived": len(cookies_list)
        }
        
    except Exception as e:
        print(f"[Session Update] ❌ Error: {e}", flush=True)
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
    """Firefox를 실행하고 Extension sync를 트리거 - 개선된 세션 검증"""
    print(f"\n[Firefox] ===== Launch Request Received =====", flush=True)
    print(f"[Firefox] Request data: {json.dumps(request.dict(), indent=2)}", flush=True)
    
    try:
        # Skip session check 옵션 확인
        skip_session_check = request.settings.get("skipSessionCheck", False)
        print(f"[Firefox] Skip session check: {skip_session_check}", flush=True)
        
        # 1. 세션 체크 (enabled 플랫폼만)
        enabled_platforms = [
            p["platform"] for p in request.platforms 
            if p.get("enabled", True)
        ]
        
        print(f"[Firefox] Enabled platforms: {enabled_platforms}", flush=True)
        
        if not enabled_platforms:
            return {
                "success": False,
                "error": "No platforms enabled for sync",
                "details": "Please enable at least one platform"
            }
        
        # 세션 검증을 skip하지 않는 경우
        if not skip_session_check:
            invalid_sessions = []
            
            for platform in enabled_platforms:
                is_valid, _ = await check_session_validity(platform)
                
                if not is_valid:
                    print(f"[Firefox] {platform} appears invalid, verifying with Firefox...", flush=True)
                    actual_valid = await verify_session_with_firefox(platform)
                    if actual_valid:
                        print(f"[Firefox] {platform} is actually logged in!", flush=True)
                        await update_session_status(platform, True, reason="firefox_verified")
                    else:
                        invalid_sessions.append(platform)
            
            print(f"[Firefox] Invalid sessions after verification: {invalid_sessions}", flush=True)
            
            if invalid_sessions:
                print(f"[Firefox] ❌ Session validation failed", flush=True)
                
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
        
        print(f"[Firefox] ✅ All sessions valid or skip session check enabled", flush=True)
        
        # 2. 스마트 스케줄링 체크 (enabled 플랫폼만)
        print(f"[Firefox] Checking smart scheduling...", flush=True)
        platforms_to_sync = []
        for platform in enabled_platforms:
            should_sync = await should_sync_today(platform)
            print(f"[Firefox] {platform} should sync today: {should_sync}", flush=True)
            if should_sync:
                platforms_to_sync.append(platform)
        
        if not platforms_to_sync:
            print(f"[Firefox] No platforms need syncing today", flush=True)
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
        
        # 3. 필터링된 플랫폼으로 sync 진행 (enabled만)
        filtered_platforms = [
            p for p in request.platforms 
            if p["platform"] in platforms_to_sync and p.get("enabled", True)
        ]
        
        sync_id = str(uuid.uuid4())
        sync_config = {
            "id": sync_id,
            "platforms": filtered_platforms,
            "settings": request.settings,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "auto_close": True  # sync 완료 후 Firefox 자동 종료
        }
        
        print(f"[Firefox] Creating sync config with ID: {sync_id}", flush=True)
        print(f"[Firefox] Platforms to sync: {platforms_to_sync}", flush=True)
        print(f"[Firefox] Sync config: {json.dumps(sync_config, indent=2)}", flush=True)
        
        SYNC_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(SYNC_CONFIG_PATH, 'w') as f:
            json.dump(sync_config, f, indent=2)
        
        # 4. Firefox 실행
        profile_name = request.settings.get("profileName", "llm-collector")
        
        # firefoxVisible 설정 확인 (false면 headless 모드)
        firefox_visible = request.settings.get("firefoxVisible", True)
        debug_mode = request.settings.get("debug", firefox_visible)  # debug를 firefoxVisible와 연동
        
        print(f"[Firefox] Profile name: {profile_name}", flush=True)
        print(f"[Firefox] Firefox visible: {firefox_visible}", flush=True)
        print(f"[Firefox] Debug mode: {debug_mode}", flush=True)
        
        # 실제로는 headless 모드가 Extension과 호환되지 않을 수 있으므로
        # 대신 창을 최소화하거나 다른 방법을 사용해야 할 수 있음
        use_headless = not firefox_visible and platform.system() in ["Linux", "Darwin"]
        
        try:
            firefox_cmd = get_firefox_command(profile_name, headless=use_headless)
            print(f"[Firefox] Command to execute: {' '.join(firefox_cmd)}", flush=True)
        except Exception as e:
            print(f"[Firefox] Failed to get Firefox command: {e}", flush=True)
            return {
                "success": False,
                "error": str(e),
                "details": "Please check Firefox installation"
            }
        
        print("[Firefox] Checking if Firefox is already running...", flush=True)
        is_running = await check_firefox_running()
        print(f"[Firefox] Is running: {is_running}", flush=True)
        
        if not is_running:
            print(f"[Firefox] Starting Firefox...", flush=True)
            try:
                # sync trigger URL로 시작
                start_url = "about:blank#llm-sync-trigger"
                
                # Windows에서는 창 최소화 옵션 사용
                if platform.system() == "Windows" and not firefox_visible:
                    # Windows에서 최소화 실행
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    startupinfo.wShowWindow = subprocess.SW_MINIMIZE
                    
                    process = subprocess.Popen(
                        firefox_cmd + [start_url],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        startupinfo=startupinfo
                    )
                else:
                    process = subprocess.Popen(
                        firefox_cmd + [start_url],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE
                    )
                
                print(f"[Firefox] Process started with PID: {process.pid}", flush=True)
                
                # 프로세스 모니터링 시작
                background_tasks.add_task(monitor_firefox_process, process, sync_id)
                
                # Firefox 시작 대기
                await asyncio.sleep(5)
                print("[Firefox] Firefox startup wait completed", flush=True)
                
            except Exception as e:
                print(f"[Firefox] Failed to start Firefox: {e}", flush=True)
                print(f"[Firefox] Traceback: {traceback.format_exc()}", flush=True)
                return {
                    "success": False,
                    "error": f"Failed to start Firefox: {str(e)}",
                    "details": "Check Firefox installation and profile"
                }
        else:
            print("[Firefox] Opening new tab in existing instance", flush=True)
            subprocess.Popen(firefox_cmd + ["about:blank#llm-sync-trigger"])
        
        # 초기 상태 파일 생성
        status_file = SYNC_STATUS_PATH / f"sync-status-{sync_id}.json"
        initial_status = {
            "status": "pending",
            "progress": 0,
            "message": "Waiting for extension to start...",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        with open(status_file, 'w') as f:
            json.dump(initial_status, f)
        
        print(f"[Firefox] Created initial status file: {status_file}", flush=True)
        print(f"[Firefox] ✅ Sync initiated successfully with ID: {sync_id}", flush=True)
        
        # 스케줄 실패 기록 삭제
        if SCHEDULE_FAILURE_PATH.exists():
            SCHEDULE_FAILURE_PATH.unlink()
        
        result = {
            "success": True,
            "sync_id": sync_id,
            "message": "Firefox launched and sync triggered",
            "debug_mode": debug_mode,
            "firefox_visible": firefox_visible,
            "platforms_to_sync": platforms_to_sync
        }
        
        print(f"[Firefox] Returning result: {json.dumps(result, indent=2)}", flush=True)
        print(f"[Firefox] ===== Launch Request Completed =====\n", flush=True)
        
        return result
        
    except Exception as e:
        print(f"[Firefox] ❌ Unexpected error: {str(e)}", flush=True)
        print(f"[Firefox] Traceback: {traceback.format_exc()}", flush=True)
        return {
            "success": False,
            "error": str(e),
            "details": "Unexpected error occurred"
        }

# ======================== Debug Endpoints ========================

@router.get("/llm/debug/firefox-profile")
async def debug_firefox_profile():
    """Firefox 프로파일 정보 디버깅"""
    print("\n[Debug] Firefox profile check requested", flush=True)
    
    try:
        result = {
            "profile_exists": False,
            "profile_path": None,
            "sessions_path": str(SESSION_DATA_PATH),
            "sessions_exists": SESSION_DATA_PATH.exists(),
            "firefox_installed": False,
            "firefox_locations": []
        }
        
        # Firefox 설치 확인
        try:
            firefox_cmd = get_firefox_command("llm-collector")
            result["firefox_installed"] = True
            result["firefox_command"] = ' '.join(firefox_cmd)
        except Exception as e:
            result["firefox_error"] = str(e)
        
        # Firefox 프로파일 경로 확인
        system = platform.system()
        if system == "Windows":
            profile_base = Path(os.environ.get('APPDATA', '')) / 'Mozilla' / 'Firefox' / 'Profiles'
        elif system == "Darwin":
            profile_base = Path.home() / 'Library' / 'Application Support' / 'Firefox' / 'Profiles'
        else:
            profile_base = Path.home() / '.mozilla' / 'firefox'
        
        result["profile_base"] = str(profile_base)
        
        # llm-collector 프로파일 찾기
        if profile_base.exists():
            for profile_dir in profile_base.glob("*.llm-collector"):
                result["profile_exists"] = True
                result["profile_path"] = str(profile_dir)
                
                # 프로파일 내 쿠키 파일 확인
                cookies_db = profile_dir / "cookies.sqlite"
                result["cookies_db_exists"] = cookies_db.exists()
                if cookies_db.exists():
                    result["cookies_db_size"] = cookies_db.stat().st_size
                break
        
        # sessions.json 내용
        if SESSION_DATA_PATH.exists():
            with open(SESSION_DATA_PATH, 'r') as f:
                result["sessions_content"] = json.load(f)
        
        print(f"[Debug] Profile info: {json.dumps(result, indent=2)}", flush=True)
        return result
        
    except Exception as e:
        print(f"[Debug] Error: {e}", flush=True)
        return {"error": str(e)}

@router.get("/llm/debug/cookies/{platform}")
async def debug_platform_cookies(platform: str):
    """특정 플랫폼의 쿠키 정보 디버깅"""
    print(f"\n[Debug] Cookie check for {platform}", flush=True)
    
    try:
        result = {
            "platform": platform,
            "session_valid": False,
            "cookies_found": False,
            "error": None
        }
        
        # sessions.json에서 플랫폼 정보 확인
        if SESSION_DATA_PATH.exists():
            with open(SESSION_DATA_PATH, 'r') as f:
                session_data = json.load(f)
                
            platform_session = session_data.get(platform, {})
            result["session_info"] = platform_session
            result["session_valid"] = platform_session.get("valid", False)
            result["cookies_count"] = len(platform_session.get("cookies", []))
            result["cookies_found"] = result["cookies_count"] > 0
        
        print(f"[Debug] Cookie info for {platform}: {json.dumps(result, indent=2)}", flush=True)
        return result
        
    except Exception as e:
        print(f"[Debug] Error: {e}", flush=True)
        return {"error": str(e), "platform": platform}

@router.post("/llm/firefox/toggle-visibility")
async def toggle_firefox_visibility():
    """Firefox 창 가시성 토글 (Windows에서만 작동)"""
    try:
        if platform.system() == "Windows":
            # Windows API를 사용하여 Firefox 창 찾기 및 토글
            import ctypes
            from ctypes import wintypes
            
            user32 = ctypes.windll.user32
            
            # Firefox 창 찾기
            def enum_windows_callback(hwnd, lParam):
                if user32.IsWindowVisible(hwnd):
                    length = user32.GetWindowTextLengthW(hwnd)
                    if length > 0:
                        title = ctypes.create_unicode_buffer(length + 1)
                        user32.GetWindowTextW(hwnd, title, length + 1)
                        if "Firefox" in title.value:
                            # 창이 보이면 숨기고, 숨겨져 있으면 보이게
                            if user32.IsWindowVisible(hwnd):
                                user32.ShowWindow(hwnd, 0)  # SW_HIDE
                            else:
                                user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                            return False
                return True
            
            # EnumWindows 콜백 타입 정의
            EnumWindowsProc = ctypes.WINFUNCTYPE(
                ctypes.c_bool, 
                ctypes.POINTER(ctypes.c_int), 
                ctypes.POINTER(ctypes.c_int)
            )
            
            # 콜백 실행
            user32.EnumWindows(EnumWindowsProc(enum_windows_callback), 0)
            
            return {"success": True, "message": "Firefox visibility toggled"}
            
        else:
            # Linux/macOS에서는 wmctrl 등을 사용할 수 있음
            return {
                "success": False, 
                "error": "Toggle visibility only supported on Windows currently"
            }
            
    except Exception as e:
        print(f"[Firefox] Error toggling visibility: {e}")
        return {"success": False, "error": str(e)}

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
        # platforms가 비어있으면 에러
        if not config.platforms:
            print(f"[Schedule] No platforms enabled for schedule")
            return {"success": False, "error": "No platforms enabled for schedule"}
        
        schedule_config = {
            "enabled": config.enabled,
            "time": config.startTime,
            "interval": config.interval,
            "platforms": config.platforms,  # Frontend에서 이미 enabled만 보냄
            "settings": config.settings,
            "updated_at": datetime.now().isoformat()
        }
        
        schedule_path = LLM_DATA_PATH / "schedule.json"
        with open(schedule_path, 'w') as f:
            json.dump(schedule_config, f, indent=2)
        
        print(f"[Schedule] Saved schedule for platforms: {config.platforms}")
        
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
    response = requests.post('http://localhost:8000/api/argosa/data/llm/sync/trigger-scheduled')
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
        
        # schedule에 저장된 platforms는 이미 enabled만 포함
        enabled_platforms = schedule.get("platforms", [])
        
        if not enabled_platforms:
            print(f"[Schedule] No enabled platforms in schedule")
            return {"success": False, "error": "No enabled platforms in schedule"}
        
        request = SyncRequest(
            platforms=[
                {"platform": p, "enabled": True} 
                for p in enabled_platforms
            ],
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
        
        # Add to collected data for unified view
        for conv in conversations:
            collected_data.append({
                "id": f"data_{uuid.uuid4().hex[:8]}",
                "source": "llm",
                "platform": platform,
                "type": "conversation",
                "content": conv,
                "timestamp": timestamp
            })
        
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