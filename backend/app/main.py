# backend/app/main.py

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import asyncio
from typing import Dict, List
import json

from app.api import workflows, nodes, executions
from app.core.engine import WorkflowEngine
from app.utils.logger import setup_logger
from app.config import settings

# 로거 설정
logger = setup_logger(__name__)

# WebSocket 연결 관리
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        if client_id not in self.active_connections:
            self.active_connections[client_id] = []
        self.active_connections[client_id].append(websocket)
        logger.info(f"Client {client_id} connected")
        
    def disconnect(self, websocket: WebSocket, client_id: str):
        if client_id in self.active_connections:
            self.active_connections[client_id].remove(websocket)
            if not self.active_connections[client_id]:
                del self.active_connections[client_id]
        logger.info(f"Client {client_id} disconnected")
        
    async def send_message(self, client_id: str, message: dict):
        if client_id in self.active_connections:
            for connection in self.active_connections[client_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to {client_id}: {e}")
                    
    async def broadcast(self, message: dict):
        for client_id in self.active_connections:
            await self.send_message(client_id, message)

# 전역 인스턴스
manager = ConnectionManager()
engine = WorkflowEngine(manager)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 생명주기 관리"""
    # 시작 시
    logger.info("Starting Workflow Engine...")
    
    # 백그라운드 태스크 시작
    asyncio.create_task(engine.start_background_tasks())
    
    yield
    
    # 종료 시
    logger.info("Shutting down Workflow Engine...")
    await engine.shutdown()

# FastAPI 앱 생성
app = FastAPI(
    title="Workflow Engine API",
    description="Node-based workflow automation engine",
    version="1.0.0",
    lifespan=lifespan
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # Vite 기본 포트 포함
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
app.include_router(workflows.router, prefix="/api/workflows", tags=["workflows"])
app.include_router(nodes.router, prefix="/api/nodes", tags=["nodes"])
app.include_router(executions.router, prefix="/api/executions", tags=["executions"])

# 정적 파일 서빙 (워크스페이스)
app.mount("/workspace", StaticFiles(directory=settings.WORKSPACE_PATH), name="workspace")

@app.get("/")
async def root():
    """API 루트"""
    return {
        "name": "Workflow Engine API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "api": "/docs",
            "websocket": "/ws/{client_id}",
            "workflows": "/api/workflows",
            "nodes": "/api/nodes",
            "executions": "/api/executions"
        }
    }

@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {
        "status": "healthy",
        "engine": engine.get_status(),
        "connections": len(manager.active_connections)
    }

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket 엔드포인트"""
    await manager.connect(websocket, client_id)
    
    try:
        while True:
            # 클라이언트로부터 메시지 수신
            data = await websocket.receive_json()
            
            # 메시지 타입에 따라 처리
            message_type = data.get("type")
            
            if message_type == "ping":
                # 핑퐁
                await websocket.send_json({"type": "pong"})
                
            elif message_type == "subscribe":
                # 특정 워크플로우 구독
                workflow_id = data.get("workflowId")
                if workflow_id:
                    engine.subscribe_client(client_id, workflow_id)
                    
            elif message_type == "unsubscribe":
                # 구독 해제
                workflow_id = data.get("workflowId")
                if workflow_id:
                    engine.unsubscribe_client(client_id, workflow_id)
                    
            elif message_type == "execute":
                # 워크플로우 실행 요청
                workflow_id = data.get("workflowId")
                mode = data.get("mode", "manual")
                if workflow_id:
                    execution_id = await engine.execute_workflow(
                        workflow_id, 
                        client_id=client_id,
                        mode=mode
                    )
                    await websocket.send_json({
                        "type": "execution_started",
                        "executionId": execution_id,
                        "workflowId": workflow_id
                    })
                    
            elif message_type == "stop":
                # 실행 중지
                execution_id = data.get("executionId")
                if execution_id:
                    await engine.stop_execution(execution_id)
                    
            elif message_type == "get_logs":
                # 로그 요청
                execution_id = data.get("executionId")
                if execution_id:
                    logs = engine.get_execution_logs(execution_id)
                    await websocket.send_json({
                        "type": "logs",
                        "executionId": execution_id,
                        "logs": logs
                    })
                    
    except WebSocketDisconnect:
        manager.disconnect(websocket, client_id)
        engine.unsubscribe_all(client_id)
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
        manager.disconnect(websocket, client_id)

# 개발 모드에서 자동 리로드를 위한 설정
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )