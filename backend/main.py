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
from models import Section
from storage import (
    sections_db, ensure_directories, create_global_vars_documentation,
    get_global_var
)
from docker_manager import start_vector_db, stop_vector_db
from websocket_handler import websocket_endpoint, websocket_connections
from ai_integration import get_available_models

# Import routers
from routers import nodes, sections, supervisor

# Initialize
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    ensure_directories()
    start_vector_db()
    create_global_vars_documentation()
    yield
    # Shutdown
    stop_vector_db()

app = FastAPI(lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
    return await get_available_models()

# Health check
@app.get("/")
async def root():
    return {"status": "running", "message": "AI Pipeline System API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)