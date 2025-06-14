# backend/main.py - 모듈화된 3개 시스템 지원 버전 (빠른 종료 개선)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import signal
import sys
import asyncio
import os
import threading
import traceback

# Local imports
from storage import ensure_directories

# Router imports
from routers import oneai, argosa, neuronet, projects

# 전역 변수
shutdown_event = asyncio.Event()
background_tasks = []

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
app.include_router(argosa.router, prefix="/api/argosa", tags=["Argosa"])
app.include_router(neuronet.router, prefix="/api/neuronet", tags=["NeuroNet"])
app.include_router(projects.router, prefix="/projects", tags=["Projects"])

# Root endpoint
@app.get("/")
async def root():
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
    return {
        "status": "healthy",
        "systems": {
            "oneai": "operational",
            "argosa": "operational",
            "neuronet": "development"
        }
    }

# Shutdown 핸들러
def handle_shutdown(sig, frame):
    """Ctrl+C 시 즉시 종료"""
    print("\n[Shutdown] Immediate shutdown requested...")
    
    # 강제 종료 모드
    if hasattr(sys, '_is_shutting_down'):
        # 두 번째 Ctrl+C는 즉시 종료
        print("[Shutdown] Force quit!")
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
            print("[Shutdown] Force exit after timeout")
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
    print("[Startup] Initializing 3D Animation Automation System...")
    
    # Ensure required directories exist
    ensure_directories()
    
    try:
        # Initialize One AI system
        print("[Startup] Initializing One AI system...")
        try:
            await oneai.initialize()
            print("[Startup] One AI initialized successfully")
        except Exception as e:
            print(f"[Startup] One AI initialization error: {e}")
            print(f"[Startup] Traceback: {traceback.format_exc()}")
            # One AI는 선택적이므로 계속 진행
        
        # Initialize Argosa system
        print("[Startup] Initializing Argosa system...")
        try:
            await argosa.initialize()
            print("[Startup] Argosa initialized successfully")
        except Exception as e:
            print(f"[Startup] Argosa initialization error: {e}")
            print(f"[Startup] Traceback: {traceback.format_exc()}")
            # Argosa는 필수이므로 실패 시 종료
            raise
        
        # Initialize NeuroNet system
        print("[Startup] Initializing NeuroNet system...")
        try:
            await neuronet.initialize()
            print("[Startup] NeuroNet initialized successfully")
        except Exception as e:
            print(f"[Startup] NeuroNet initialization error: {e}")
            print(f"[Startup] Traceback: {traceback.format_exc()}")
            # NeuroNet은 개발 중이므로 계속 진행
        
        print("[Startup] All systems initialization completed")
        
        # OneAI periodic task가 있다면 추가
        try:
            if hasattr(oneai, 'start_periodic_tasks'):
                print("[Startup] Starting OneAI periodic tasks...")
                task = asyncio.create_task(oneai.start_periodic_tasks(shutdown_event))
                background_tasks.append(task)
                print("[Startup] OneAI periodic tasks started")
        except Exception as e:
            print(f"[Startup] Error starting periodic tasks: {e}")
            # 주기적 작업은 선택적이므로 계속 진행
            
        print("[Startup] Application startup completed successfully")
        
    except Exception as e:
        print(f"[Startup] Critical error during initialization: {e}")
        print(f"[Startup] Traceback: {traceback.format_exc()}")
        # 초기화 실패 시 종료
        sys.exit(1)

# Shutdown event
@app.on_event("shutdown")
async def shutdown_handler():
    """Cleanup all systems on shutdown"""
    print("[Shutdown] FastAPI shutdown event triggered...")
    
    # shutdown_event 설정
    shutdown_event.set()
    
    try:
        # 1. 먼저 모든 백그라운드 태스크 즉시 취소
        if background_tasks:
            print("[Shutdown] Cancelling background tasks...")
            for task in background_tasks:
                task.cancel()
            
            # 태스크 취소 대기 (짧은 timeout)
            try:
                await asyncio.wait_for(
                    asyncio.gather(*background_tasks, return_exceptions=True),
                    timeout=1.0
                )
            except asyncio.TimeoutError:
                print("[Shutdown] Background tasks cancellation timeout")
        
        # 2. 모든 시스템 동시에 shutdown (병렬 처리)
        print("[Shutdown] Shutting down all systems simultaneously...")
        
        shutdown_tasks = []
        
        # OneAI shutdown (save 없이 빠른 종료)
        async def quick_oneai_shutdown():
            try:
                print("[Shutdown] Shutting down OneAI...")
                # save 작업 건너뛰기 옵션
                if hasattr(oneai, 'quick_shutdown'):
                    await oneai.quick_shutdown()
                else:
                    await asyncio.wait_for(oneai.shutdown(), timeout=2.0)
                print("[Shutdown] OneAI shutdown completed")
            except asyncio.TimeoutError:
                print("[Shutdown] OneAI shutdown timeout - forcing")
            except Exception as e:
                print(f"[Shutdown] OneAI error: {e}")
        
        # Argosa shutdown
        async def quick_argosa_shutdown():
            try:
                print("[Shutdown] Shutting down Argosa...")
                await asyncio.wait_for(argosa.shutdown(), timeout=1.0)
                print("[Shutdown] Argosa shutdown completed")
            except asyncio.TimeoutError:
                print("[Shutdown] Argosa shutdown timeout")
            except Exception as e:
                print(f"[Shutdown] Argosa error: {e}")
        
        # NeuroNet shutdown
        async def quick_neuronet_shutdown():
            try:
                print("[Shutdown] Shutting down NeuroNet...")
                await asyncio.wait_for(neuronet.shutdown(), timeout=1.0)
                print("[Shutdown] NeuroNet shutdown completed")
            except asyncio.TimeoutError:
                print("[Shutdown] NeuroNet shutdown timeout")
            except Exception as e:
                print(f"[Shutdown] NeuroNet error: {e}")
        
        # 각 시스템 shutdown task 생성
        shutdown_tasks.append(asyncio.create_task(quick_oneai_shutdown()))
        shutdown_tasks.append(asyncio.create_task(quick_argosa_shutdown()))
        shutdown_tasks.append(asyncio.create_task(quick_neuronet_shutdown()))
        
        # 모든 shutdown 동시 실행 (최대 3초 대기)
        await asyncio.wait_for(
            asyncio.gather(*shutdown_tasks, return_exceptions=True),
            timeout=3.0
        )
        
        print("[Shutdown] All systems shut down")
        
    except asyncio.TimeoutError:
        print("[Shutdown] Timeout - forcing shutdown")
    except Exception as e:
        print(f"[Shutdown] Error: {e}")
        print(f"[Shutdown] Traceback: {traceback.format_exc()}")

if __name__ == "__main__":
    import uvicorn
    
    # 빠른 종료를 위한 설정
    os.environ['PYTHONUNBUFFERED'] = '1'
    
    # Pydantic 경고 억제
    import warnings
    warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")
    
    print("[Main] Starting server...")
    print("[Main] Python version:", sys.version)
    print("[Main] Working directory:", os.getcwd())
    print("[Main] Available systems: OneAI, Argosa, NeuroNet")
    
    # uvicorn 설정 (빠른 종료 최적화)
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info",
        access_log=False,  # 액세스 로그 끄기 (더 빠름)
        use_colors=True,
        reload=False,  # reload 끄기 (더 빠른 종료)
        workers=1  # 단일 워커 (더 빠른 종료)
    )