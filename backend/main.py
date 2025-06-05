# backend/main.py 에서 WebSocket CORS 설정 추가

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json

app = FastAPI()

# CORS 설정 - WebSocket을 위해 필요
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # React 앱 주소
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket 연결 관리
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_route(websocket: WebSocket):
    """단순화된 WebSocket endpoint"""
    try:
        # 연결 수락
        await websocket.accept()
        print("WebSocket connection accepted")
        
        # websocket_handler로 위임
        await websocket_endpoint(websocket)
        
    except Exception as e:
        print(f"WebSocket connection error: {e}")
        try:
            await websocket.close()
        except:
            pass

# 노드 실행 시 WebSocket으로 상태 전송
async def send_node_status(node_id: str, status: str, progress: float = None, output: str = None):
    message = {
        "type": f"node_{status}",
        "nodeId": node_id
    }
    
    if progress is not None:
        message["type"] = "progress"
        message["progress"] = progress
    
    if output is not None:
        message["type"] = "node_output_updated"
        message["output"] = output
    
    await manager.broadcast(message)

# Flow 실행 엔드포인트
@app.post("/execute-flow")
async def execute_flow(request: dict):
    section_id = request.get("sectionId")
    start_node_id = request.get("startNodeId")
    
    if not section_id or not start_node_id:
        return {"error": "Missing sectionId or startNodeId"}
    
    # 비동기로 flow 실행
    asyncio.create_task(run_flow(section_id, start_node_id))
    
    return {"success": True, "message": "Flow execution started"}

async def run_flow(section_id: str, start_node_id: str):
    # 여기에 실제 flow 실행 로직 구현
    await send_node_status(start_node_id, "execution_start")
    
    # 시뮬레이션 - 실제로는 노드 실행 로직
    for i in range(101):
        await asyncio.sleep(0.05)  # 50ms 간격
        await send_node_status(start_node_id, "progress", progress=i/100)
    
    await send_node_status(start_node_id, "execution_complete")
    await send_node_status(start_node_id, "output_updated", output="Execution completed successfully")

# 개별 노드 실행
@app.post("/execute")
async def execute_node(request: dict):
    node_id = request.get("nodeId")
    section_id = request.get("sectionId")
    code = request.get("code", "")
    
    # 비동기로 노드 실행
    asyncio.create_task(run_node(node_id, code))
    
    return {"success": True, "message": f"Node {node_id} execution started"}

async def run_node(node_id: str, code: str):
    await send_node_status(node_id, "execution_start")
    
    try:
        # 노드 타입에 따른 실행 로직
        for i in range(101):
            await asyncio.sleep(0.02)
            await send_node_status(node_id, "progress", progress=i/100)
        
        # 결과 생성
        output = f"Output from node {node_id}"
        await send_node_status(node_id, "output_updated", output=output)
        await send_node_status(node_id, "execution_complete")
        
    except Exception as e:
        await send_node_status(node_id, "execution_error", output=str(e))