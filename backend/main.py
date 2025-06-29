# backend/main.py - 모듈화된 3개 시스템 지원 버전 (디버깅 로그 추가)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
import signal
import sys
import asyncio
import os
import threading
import traceback
import logging
from typing import Dict
from datetime import datetime

# 재귀 깊이 증가 (conversation 저장 시 재귀 문제 방지)
sys.setrecursionlimit(5000)

# 버퍼링 비활성화 - 로그 즉시 출력
sys.stdout = sys.stderr = sys.__stdout__

# 로그 디렉토리 생성 (로깅 설정보다 먼저)
os.makedirs('./logs', exist_ok=True)

# 상세한 로깅 설정 (force=True로 uvicorn 설정 덮어쓰기)
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s',
    handlers=[
        logging.FileHandler('./logs/backend_detailed.log', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ],
    force=True  # uvicorn의 기본 설정을 덮어쓰기
)

# argosa 모듈 로깅 레벨 설정
logging.getLogger('routers.argosa').setLevel(logging.DEBUG)
logging.getLogger('routers.argosa.data_collection').setLevel(logging.DEBUG)
logging.getLogger('routers.argosa.shared.firefox_manager').setLevel(logging.DEBUG)

# uvicorn과 FastAPI 로깅 활성화
logging.getLogger('uvicorn').setLevel(logging.DEBUG)
logging.getLogger('uvicorn.access').setLevel(logging.DEBUG)
logging.getLogger('uvicorn.error').setLevel(logging.DEBUG)
logging.getLogger('fastapi').setLevel(logging.DEBUG)

# Local imports
from storage import ensure_directories

# Router imports
from routers import oneai, neuronet, projects
from routers.argosa import router as argosa_router
# search_settings_simple removed - functionality integrated into web_crawler_agent

# argosa의 initialize와 shutdown 함수는 __init__.py에서 export되었으므로 같이 import
from routers.argosa import initialize as argosa_initialize, shutdown as argosa_shutdown

# 전역 변수
shutdown_event = asyncio.Event()
background_tasks = []
connected_clients: Dict[str, WebSocket] = {}

# Create FastAPI app
# Modified: 2025-06-29 - Trigger nodemon restart for new search engine endpoints
# Force restart: Search engine settings endpoints added
# Nodemon restart trigger: 2025-06-29 21:17 - COMPLETE FIX - all parts updated
# Fix cache_manager None issue: 2025-06-29 21:50 - Fixed initialize() function
# Final fix: 2025-06-29 21:57 - Direct implementation in main.py working
# LLM Query Settings fix: 2025-06-29 22:15 - Added direct endpoints
# Status endpoint fix: 2025-06-29 22:13 - Force server restart with SystemStateManager fix
# Search settings consolidation: 2025-06-29 - Integrated into web_crawler_agent
app = FastAPI(
    title="3D Animation Automation System", 
    description="AI-powered system for 3D animation production",
    version="1.0.0"
)

# CORS configuration - Firefox Extension 지원
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "moz-extension://*",      # Firefox Extension
    "chrome-extension://*",    # Chrome Extension (future support)
]

# Add production URLs if defined
if os.getenv("FRONTEND_URL"):
    origins.append(os.getenv("FRONTEND_URL"))

# Development mode - allow all origins (use with caution)
if os.getenv("DEVELOPMENT_MODE") == "true":
    origins.append("*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# HTTP 요청 로깅 미들웨어
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = datetime.now()
    
    # 요청 로깅
    logger = logging.getLogger("http_requests")
    logger.info(f"🔥 HTTP {request.method} {request.url.path} - Headers: {dict(request.headers)}")
    
    # argosa API 호출에 대해서는 더 자세한 로깅
    if "/api/argosa/" in str(request.url.path):
        logger.info(f"🎯 ARGOSA API CALL: {request.method} {request.url.path}")
        if request.method in ["POST", "PUT", "PATCH"]:
            # 요청 body도 로깅 (너무 크지 않은 경우)
            try:
                body = await request.body()
                if len(body) < 1000:  # 1KB 미만만 로깅
                    logger.info(f"🎯 Request body: {body.decode('utf-8', errors='ignore')}")
            except:
                pass
    
    response = await call_next(request)
    
    # 응답 로깅
    process_time = (datetime.now() - start_time).total_seconds()
    logger.info(f"🔥 Response {response.status_code} for {request.method} {request.url.path} - {process_time:.3f}s")
    
    return response

# Exception handler for HTTP exceptions to ensure CORS headers are included
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

# General exception handler for unhandled errors
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger = logging.getLogger(__name__)
    logger.error(f"Unhandled exception: {exc}")
    logger.error(traceback.format_exc())
    
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

# Removed override - will fix in the actual endpoint

# Include routers
app.include_router(oneai.router, prefix="/api/oneai", tags=["One AI"])
app.include_router(argosa_router)  # prefix와 tags는 argosa_router 내부에서 이미 설정됨
app.include_router(neuronet.router, prefix="/api/neuronet", tags=["NeuroNet"])
app.include_router(projects.router, prefix="/projects", tags=["Projects"])
# Search settings are now handled by web_crawler_agent in argosa router
print(f"[DEBUG] Argosa router paths: {[r.path for r in argosa_router.routes]}", flush=True)

# Debug endpoint to list all routes
@app.get("/debug/routes")
async def list_routes():
    routes = []
    for route in app.routes:
        if hasattr(route, "path") and hasattr(route, "methods"):
            routes.append({
                "path": route.path,
                "methods": list(route.methods) if route.methods else [],
                "name": route.name
            })
    return {"total": len(routes), "routes": sorted(routes, key=lambda x: x["path"])}

# Root endpoint
@app.get("/")
async def root():
    print("[API] Root endpoint called", flush=True)
    return {
        "message": "3D Animation Automation System API",
        "systems": {
            "oneai": "AI Production Pipeline",
            "argosa": "Information Analysis & Prediction",
            "neuronet": "AI Training Automation"
        },
        "version": "1.0.0"
    }

# Health check endpoint
@app.get("/health")
async def health_check():
    print("[API] Health check called", flush=True)
    return {
        "status": "healthy",
        "systems": {
            "oneai": "operational",
            "argosa": "operational",
            "neuronet": "development"
        }
    }

# Search engine settings endpoints are now handled by web_crawler_agent
# Available at:
# GET  /api/argosa/data/settings
# PUT  /api/argosa/data/settings
# GET  /api/argosa/data/stats
# POST /api/argosa/data/stats/record

# ======================== LLM Query Settings - Direct Implementation ========================

@app.get("/api/argosa/data/llm/query/settings")
async def get_llm_query_settings_direct():
    """LLM Query 설정 가져오기 - 직접 구현"""
    import json
    from pathlib import Path
    try:
        backend_path = Path(__file__).parent
        settings_path = backend_path / "routers" / "argosa" / "collection" / "settings" / "llm_query_settings.json"
        
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
        print(f"❌ Failed to get LLM query settings: {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/argosa/data/llm/query/settings")
async def update_llm_query_settings_direct(settings: dict):
    """LLM Query 설정 업데이트 - 직접 구현"""
    import json
    from pathlib import Path
    try:
        backend_path = Path(__file__).parent
        settings_path = backend_path / "routers" / "argosa" / "collection" / "settings" / "llm_query_settings.json"
        
        # 디렉토리 생성
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 저장
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
            
        print(f"✅ LLM query settings updated: {settings}", flush=True)
        return settings
        
    except Exception as e:
        print(f"❌ Failed to update LLM query settings: {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/argosa/data/llm/query/activities")
async def get_llm_query_activities_direct():
    """LLM Query 활동 내역 가져오기 - 직접 구현"""
    return {"activities": []}

@app.get("/api/argosa/data/llm/query/analysis/status")
async def get_llm_analysis_status_direct():
    """LLM 분석 상태 가져오기 - 직접 구현"""
    return {
        "current_analysis": None,
        "queries_sent": 0,
        "queries_completed": 0,
        "last_query_time": None,
        "analysis_progress": 0
    }

@app.get("/api/argosa/data/llm/query/stats")
async def get_llm_query_stats_direct():
    """LLM Query 통계 가져오기 - 직접 구현"""
    return {}

@app.delete("/api/argosa/data/llm/query/activities/clear")
async def clear_llm_query_activities_direct():
    """완료된 LLM Query 활동 내역 삭제 - 직접 구현"""
    return {"success": True}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """범용 WebSocket 엔드포인트"""
    await websocket.accept()
    connected_clients[client_id] = websocket
    
    try:
        print(f"[WebSocket] Client {client_id} connected", flush=True)
        
        # 초기 메시지 전송
        await websocket.send_json({
            "type": "connection",
            "status": "connected",
            "client_id": client_id,
            "message": "Successfully connected to server"
        })
        
        # 메시지 수신 대기
        while True:
            data = await websocket.receive_json()
            
            # Echo back 또는 다른 처리
            await websocket.send_json({
                "type": "echo",
                "data": data
            })
                
    except WebSocketDisconnect:
        print(f"[WebSocket] Client {client_id} disconnected", flush=True)
    finally:
        if client_id in connected_clients:
            del connected_clients[client_id]
            
# Shutdown 핸들러
def handle_shutdown(sig, frame):
    """Ctrl+C 시 즉시 종료"""
    print("\n[Shutdown] Immediate shutdown requested...", flush=True)
    
    # 강제 종료 모드
    if hasattr(sys, '_is_shutting_down'):
        # 두 번째 Ctrl+C는 즉시 종료
        print("[Shutdown] Force quit!", flush=True)
        os._exit(0)
    
    sys._is_shutting_down = True
    
    # 비동기 작업 없이 바로 종료
    try:
        # shutdown_event만 설정
        shutdown_event.set()
        
        # 모든 태스크 즉시 취소
        loop = asyncio.get_event_loop()
        for task in asyncio.all_tasks(loop):
            task.cancel()
        
        # 1초 후 강제 종료
        def force_exit():
            print("[Shutdown] Force exit after timeout", flush=True)
            os._exit(0)
        
        timer = threading.Timer(1.0, force_exit)
        timer.start()
        
    except Exception:
        os._exit(0)

# Signal 핸들러 등록
signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

# Windows의 경우 추가 핸들러
if sys.platform == "win32":
    signal.signal(signal.SIGBREAK, handle_shutdown)

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize all systems on startup"""
    print("[Startup] Initializing 3D Animation Automation System...", flush=True)
    
    # Ensure required directories exist
    ensure_directories()
    
    try:
        # Initialize One AI system
        print("[Startup] Initializing One AI system...", flush=True)
        try:
            await oneai.initialize()
            print("[Startup] One AI initialized successfully", flush=True)
        except Exception as e:
            print(f"[Startup] One AI initialization error: {e}", flush=True)
            print(f"[Startup] Traceback: {traceback.format_exc()}", flush=True)
            # One AI는 선택적이므로 계속 진행
        
        # Initialize Argosa system
        print("[Startup] Initializing Argosa system...", flush=True)
        try:
            await argosa_initialize()
            print("[Startup] Argosa initialized successfully", flush=True)
            
            # Argosa 초기화 후 LLM tracker와 conversation_saver 연결
            try:
                from routers.argosa.shared.llm_tracker import llm_tracker
                from routers.argosa.shared.conversation_saver import conversation_saver
                
                conversation_saver.set_llm_tracker(llm_tracker)
                print("[Startup] LLM tracker registered with conversation_saver", flush=True)
                
                # LLM tracker 통계 출력
                stats = await llm_tracker.get_stats()
                print(f"[Startup] LLM tracker stats: {stats['total_tracked']} tracked conversations", flush=True)
                
            except ImportError as e:
                print(f"[Startup] Warning: Could not setup LLM tracker integration: {e}", flush=True)
                # LLM tracker는 선택적이므로 계속 진행
            except Exception as e:
                print(f"[Startup] Error setting up LLM tracker: {e}", flush=True)
                print(f"[Startup] Traceback: {traceback.format_exc()}", flush=True)
            
            # Firefox Manager 초기화
            try:
                from routers.argosa.shared.firefox_manager import get_firefox_manager
                
                firefox_manager = get_firefox_manager()
                if await firefox_manager.initialize():
                    print("[Startup] Firefox Manager initialized successfully", flush=True)
                    
                    # Firefox 상태 확인
                    info = await firefox_manager.get_info()
                    print(f"[Startup] Firefox Manager status: {info.get('status')}", flush=True)
                    print(f"[Startup] Firefox running: {info.get('is_running')}", flush=True)
                    if info.get('pid'):
                        print(f"[Startup] Firefox PID: {info.get('pid')}", flush=True)
                else:
                    print("[Startup] Firefox Manager initialization failed", flush=True)
                    
            except ImportError as e:
                print(f"[Startup] Warning: Could not setup Firefox Manager: {e}", flush=True)
                # Firefox Manager는 선택적이므로 계속 진행
            except Exception as e:
                print(f"[Startup] Error setting up Firefox Manager: {e}", flush=True)
                print(f"[Startup] Traceback: {traceback.format_exc()}", flush=True)
            
        except Exception as e:
            print(f"[Startup] Argosa initialization error: {e}", flush=True)
            print(f"[Startup] Traceback: {traceback.format_exc()}", flush=True)
            # Argosa는 필수이므로 실패 시 종료
            raise
        
        # Initialize NeuroNet system
        print("[Startup] Initializing NeuroNet system...", flush=True)
        try:
            await neuronet.initialize()
            print("[Startup] NeuroNet initialized successfully", flush=True)
        except Exception as e:
            print(f"[Startup] NeuroNet initialization error: {e}", flush=True)
            print(f"[Startup] Traceback: {traceback.format_exc()}", flush=True)
            # NeuroNet은 개발 중이므로 계속 진행
        
        print("[Startup] All systems initialization completed", flush=True)
        
        # OneAI periodic task가 있다면 추가
        try:
            if hasattr(oneai, 'start_periodic_tasks'):
                print("[Startup] Starting OneAI periodic tasks...", flush=True)
                task = asyncio.create_task(oneai.start_periodic_tasks(shutdown_event))
                background_tasks.append(task)
                print("[Startup] OneAI periodic tasks started", flush=True)
        except Exception as e:
            print(f"[Startup] Error starting periodic tasks: {e}", flush=True)
            # 주기적 작업은 선택적이므로 계속 진행
            
        print("[Startup] Application startup completed successfully", flush=True)
        
    except Exception as e:
        print(f"[Startup] Critical error during initialization: {e}", flush=True)
        print(f"[Startup] Traceback: {traceback.format_exc()}", flush=True)
        # 초기화 실패 시 종료
        sys.exit(1)

# Shutdown event
@app.on_event("shutdown")
async def shutdown_handler():
    """Cleanup all systems on shutdown"""
    print("[Shutdown] FastAPI shutdown event triggered...", flush=True)
    
    # shutdown_event 설정
    shutdown_event.set()
    
    try:
        # 1. 먼저 모든 백그라운드 태스크 즉시 취소
        if background_tasks:
            print("[Shutdown] Cancelling background tasks...", flush=True)
            for task in background_tasks:
                task.cancel()
            
            # 태스크 취소 대기 (짧은 timeout)
            try:
                await asyncio.wait_for(
                    asyncio.gather(*background_tasks, return_exceptions=True),
                    timeout=1.0
                )
            except asyncio.TimeoutError:
                print("[Shutdown] Background tasks cancellation timeout", flush=True)
        
        # 2. 모든 시스템 동시에 shutdown (병렬 처리)
        print("[Shutdown] Shutting down all systems simultaneously...", flush=True)
        
        shutdown_tasks = []
        
        # OneAI shutdown (save 없이 빠른 종료)
        async def quick_oneai_shutdown():
            try:
                print("[Shutdown] Shutting down OneAI...", flush=True)
                # save 작업 건너뛰기 옵션
                if hasattr(oneai, 'quick_shutdown'):
                    await oneai.quick_shutdown()
                else:
                    await asyncio.wait_for(oneai.shutdown(), timeout=2.0)
                print("[Shutdown] OneAI shutdown completed", flush=True)
            except asyncio.TimeoutError:
                print("[Shutdown] OneAI shutdown timeout - forcing", flush=True)
            except Exception as e:
                print(f"[Shutdown] OneAI error: {e}", flush=True)
        
        # Argosa shutdown with LLM tracker and Firefox cleanup
        async def quick_argosa_shutdown():
            try:
                print("[Shutdown] Shutting down Argosa...", flush=True)
                
                # Firefox Manager cleanup
                try:
                    from routers.argosa.shared.firefox_manager import get_firefox_manager
                    firefox_manager = get_firefox_manager()
                    await firefox_manager.cleanup()
                    print("[Shutdown] Firefox Manager cleaned up", flush=True)
                except Exception as e:
                    print(f"[Shutdown] Firefox cleanup error: {e}", flush=True)
                
                # LLM tracker 상태 저장 (옵션)
                try:
                    from routers.argosa.shared.llm_tracker import llm_tracker
                    await llm_tracker._save_state()
                    print("[Shutdown] LLM tracker state saved", flush=True)
                except:
                    pass  # 실패해도 계속 진행
                
                await asyncio.wait_for(argosa_shutdown(), timeout=1.0)
                print("[Shutdown] Argosa shutdown completed", flush=True)
            except asyncio.TimeoutError:
                print("[Shutdown] Argosa shutdown timeout", flush=True)
            except Exception as e:
                print(f"[Shutdown] Argosa error: {e}", flush=True)
        
        # NeuroNet shutdown
        async def quick_neuronet_shutdown():
            try:
                print("[Shutdown] Shutting down NeuroNet...", flush=True)
                await asyncio.wait_for(neuronet.shutdown(), timeout=1.0)
                print("[Shutdown] NeuroNet shutdown completed", flush=True)
            except asyncio.TimeoutError:
                print("[Shutdown] NeuroNet shutdown timeout", flush=True)
            except Exception as e:
                print(f"[Shutdown] NeuroNet error: {e}", flush=True)
        
        # 각 시스템 shutdown task 생성
        shutdown_tasks.append(asyncio.create_task(quick_oneai_shutdown()))
        shutdown_tasks.append(asyncio.create_task(quick_argosa_shutdown()))
        shutdown_tasks.append(asyncio.create_task(quick_neuronet_shutdown()))
        
        # 모든 shutdown 동시 실행 (최대 3초 대기)
        await asyncio.wait_for(
            asyncio.gather(*shutdown_tasks, return_exceptions=True),
            timeout=3.0
        )
        
        print("[Shutdown] All systems shut down", flush=True)
        
    except asyncio.TimeoutError:
        print("[Shutdown] Timeout - forcing shutdown", flush=True)
    except Exception as e:
        print(f"[Shutdown] Error: {e}", flush=True)
        print(f"[Shutdown] Traceback: {traceback.format_exc()}", flush=True)

@app.get("/debug/routes")
async def debug_routes():
    """모든 등록된 라우트 확인"""
    print("[DEBUG] Routes endpoint called", flush=True)
    routes = []
    for route in app.routes:
        if hasattr(route, "path"):
            routes.append({
                "path": route.path,
                "methods": list(route.methods) if hasattr(route, "methods") else []
            })
    return {"routes": routes}

# Removed test endpoint


# Removed test endpoint

# Removed duplicate endpoint

@app.get("/debug/llm-tracker")
async def debug_llm_tracker():
    """LLM tracker 상태 확인"""
    try:
        from routers.argosa.shared.llm_tracker import llm_tracker
        stats = await llm_tracker.get_stats()
        return {
            "status": "operational",
            "stats": stats
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    import logging
    
    # 모든 uvicorn 관련 로거 비활성화
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    
    # 또는 특정 핸들러 제거
    uvicorn_logger = logging.getLogger("uvicorn.access")
    uvicorn_logger.handlers = []
    uvicorn_logger.propagate = False
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="warning"
    )
