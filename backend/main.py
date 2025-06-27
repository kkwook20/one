# backend/main.py - 모듈화된 3개 시스템 지원 버전 (디버깅 로그 추가)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
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

# Local imports
from storage import ensure_directories

# Router imports
from routers import oneai, neuronet, projects
from routers.argosa import router as argosa_router

# argosa의 initialize와 shutdown 함수는 __init__.py에서 export되었으므로 같이 import
from routers.argosa import initialize as argosa_initialize, shutdown as argosa_shutdown

# 전역 변수
shutdown_event = asyncio.Event()
background_tasks = []
connected_clients: Dict[str, WebSocket] = {}

# Create FastAPI app
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

# Include routers
app.include_router(oneai.router, prefix="/api/oneai", tags=["One AI"])
app.include_router(argosa_router)  # prefix와 tags는 argosa_router 내부에서 이미 설정됨
app.include_router(neuronet.router, prefix="/api/neuronet", tags=["NeuroNet"])
app.include_router(projects.router, prefix="/projects", tags=["Projects"])
print(f"[DEBUG] Argosa router paths: {[r.path for r in argosa_router.routes]}", flush=True)

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
        
        # Argosa shutdown with LLM tracker cleanup
        async def quick_argosa_shutdown():
            try:
                print("[Shutdown] Shutting down Argosa...", flush=True)
                
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