# backend/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

from app.api import nodes, edges, canvas, variables, webhooks, websocket
from app.core.engine import engine
from app.core.variable_resolver import global_variable_resolver
from app.storage.node_storage import node_storage
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 수명주기 관리"""
    # 시작 시
    logger.info("Starting AI Production Pipeline...")
    
    # 초기화
    await global_variable_resolver.initialize()
    await node_storage.initialize()
    
    # 스케줄러 시작 (Trigger 노드용)
    from app.nodes.trigger import trigger_node
    # 저장된 트리거 상태 복원
    logger.info("Restoring saved triggers...")
    
    yield
    
    # 종료 시
    logger.info("Shutting down AI Production Pipeline...")
    # 정리 작업

app = FastAPI(
    title="AI Production Pipeline API",
    version="2.0.0",
    lifespan=lifespan
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
app.include_router(nodes.router)
app.include_router(edges.router)
app.include_router(canvas.router)
app.include_router(variables.router)
app.include_router(webhooks.router)
app.include_router(websocket.router)

@app.get("/")
async def root():
    return {
        "message": "AI Production Pipeline API",
        "version": "2.0.0",
        "features": [
            "Node-based workflow with 7 node types",
            "Global variable system",
            "Version control for nodes",
            "Task management with status tracking",
            "AI auto-improvement (LM Studio integration)",
            "Real-time WebSocket support",
            "Webhook triggers",
            "Memory management system",
            "Workflow orchestration"
        ],
        "node_types": [
            "worker - Code execution with 3-panel editor",
            "supervisor - Code modification and optimization",
            "planner - Workflow evaluation and planning",
            "watcher - Data collection and monitoring",
            "flow - Execution flow control",
            "memory - Data storage and retrieval",
            "trigger - Event-based workflow triggers"
        ]
    }

@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {
        "status": "healthy",
        "running_nodes": len(await engine.get_running_nodes()),
        "timestamp": datetime.now().isoformat()
    }

@app.get("/stats")
async def get_system_stats():
    """시스템 통계"""
    return {
        "total_nodes": await node_storage.count_nodes(),
        "running_nodes": await engine.get_running_nodes(),
        "registered_variables": len(global_variable_resolver.get_all_variables()),
        "active_websockets": len(ws_manager.active_connections),
        "timestamp": datetime.now().isoformat()
    }