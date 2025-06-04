# ==============================================================================
# File: backend/main.py
# Related files: frontend/src/App.tsx, docker-compose.yml, global-vars-documentation.txt
# Location: backend/main.py
# ==============================================================================

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from typing import Dict

# Import models and storage
from models import Section, Node, Position
from storage import (
    sections_db, ensure_directories, create_global_vars_documentation,
    get_global_var
)
from docker_manager import start_vector_db, stop_vector_db
from websocket_handler import websocket_endpoint, websocket_connections
from ai_integration import get_available_models

# Import routers
from routers import nodes, sections, supervisor

# 섹션 초기화 함수
def initialize_default_sections():
    """백엔드 시작 시 기본 섹션 생성"""
    groups = {
        'preproduction': ['Script', 'Storyboard', 'Planning'],
        'postproduction': ['Modeling', 'Rigging', 'Texture', 'Animation', 'VFX', 'Lighting & Rendering', 'Sound Design', 'Compositing'],
        'director': ['Direction', 'Review']
    }
    
    for group, section_names in groups.items():
        for section_name in section_names:
            section_id = f"{group}-{section_name}".lower().replace(' ', '-').replace('&', '')
            
            # 이미 존재하는 섹션은 건너뛰기
            if section_id in sections_db:
                continue
                
            # 새 섹션 생성
            section = Section(
                id=section_id,
                name=section_name,
                group=group,
                nodes=[
                    Node(
                        id=f"input-{section_id}-{hash(section_id) % 10000}",
                        type="input",
                        label="Input",
                        position=Position(x=50, y=200),
                        isRunning=False
                    ),
                    Node(
                        id=f"output-{section_id}-{hash(section_id) % 10000 + 1}",
                        type="output",
                        label="Output",
                        position=Position(x=700, y=200),
                        isRunning=False
                    )
                ]
            )
            sections_db[section_id] = section
    
    print(f"Initialized {len(sections_db)} sections")

# Initialize
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting AI Pipeline System...")
    ensure_directories()
    print("Directories created")
    
    try:
        start_vector_db()
        print("Vector DB started")
    except Exception as e:
        print(f"Warning: Vector DB failed to start: {e}")
    
    create_global_vars_documentation()
    print("Documentation created")
    
    initialize_default_sections()  # 섹션 초기화 추가
    
    yield
    
    # Shutdown
    print("Shutting down AI Pipeline System...")
    try:
        stop_vector_db()
    except:
        pass

app = FastAPI(lifespan=lifespan)

# CORS - 모든 origin 허용 (개발 환경)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 환경에서는 모든 origin 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(nodes.router)
app.include_router(sections.router)
app.include_router(supervisor.router)

# WebSocket endpoint
@app.websocket("/ws/{client_id}")
async def ws_endpoint(websocket: WebSocket, client_id: str):
    await websocket_endpoint(websocket, client_id)

# Global variable endpoint
@app.get("/global-var/{var_path:path}")
async def get_global_variable(var_path: str):
    """Get global variable value"""
    value = get_global_var(var_path)
    if value is None:
        raise HTTPException(status_code=404, detail="Variable not found")
    return {"path": var_path, "value": value}

# Models endpoint
@app.get("/models")
async def get_models():
    """Get available LM Studio models"""
    try:
        return await get_available_models()
    except Exception as e:
        print(f"Error getting models: {e}")
        # 에러 발생 시 기본 모델 리스트 반환
        return {"data": [
            {"id": "none"},
            {"id": "llama-3.1-8b"},
            {"id": "mistral-7b"},
            {"id": "codellama-13b"}
        ]}

# Health check
@app.get("/")
async def root():
    return {
        "status": "running",
        "message": "AI Pipeline System API",
        "version": "1.0.0",
        "sections": len(sections_db),
        "endpoints": {
            "health": "/",
            "sections": "/sections",
            "models": "/models",
            "websocket": "/ws/{client_id}",
            "docs": "/docs"
        }
    }

# 추가 디버그 엔드포인트
@app.get("/debug/sections")
async def debug_sections():
    """디버그용: 현재 로드된 섹션 확인"""
    return {
        "count": len(sections_db),
        "sections": {
            section_id: {
                "name": section.name,
                "group": section.group,
                "nodes": len(section.nodes)
            }
            for section_id, section in sections_db.items()
        }
    }

@app.get("/debug/connections")
async def debug_connections():
    """디버그용: 현재 WebSocket 연결 확인"""
    return {
        "active_connections": len(websocket_connections),
        "clients": list(websocket_connections.keys())
    }

# 에러 핸들러
@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """전역 에러 핸들러"""
    print(f"Unhandled error: {exc}")
    return {"error": str(exc), "type": type(exc).__name__}

if __name__ == "__main__":
    import uvicorn
    # 개발 환경에서 더 자세한 로그 출력
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=True
    )