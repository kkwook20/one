# backend/main.py - 단순화된 버전

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import asyncio
import json
import os
import sys
import time
import random
from datetime import datetime

# 경로 설정
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import Section, Node, ExecuteRequest
from storage import sections_db, save_node_data, ensure_directories
from execution import execute_python_code, get_connected_outputs

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket 연결 관리
active_connections: Dict[str, WebSocket] = {}

@app.on_event("startup")
async def startup_event():
    ensure_directories()
    # 기본 섹션 생성
    from constants import GROUPS
    for group, sections in GROUPS.items():
        for idx, section_name in enumerate(sections):
            section_id = f"{group}-{section_name.lower().replace(' ', '-')}"
            if section_id not in sections_db:
                # Input과 Output 노드를 가진 기본 섹션 생성
                sections_db[section_id] = Section(
                    id=section_id,
                    name=section_name,
                    group=group,
                    nodes=[
                        Node(
                            id=f"input-{section_id}",
                            type="input",
                            label="Input",
                            position={"x": 100, "y": 200},
                            isRunning=False
                        ),
                        Node(
                            id=f"output-{section_id}",
                            type="output", 
                            label="Output",
                            position={"x": 700, "y": 200},
                            isRunning=False,
                            connectedFrom=[f"input-{section_id}"]
                        )
                    ]
                )

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    active_connections[client_id] = websocket
    print(f"Client {client_id} connected")
    
    try:
        while True:
            # 연결 유지를 위한 대기
            message = await websocket.receive_text()
            if message == "pong":
                continue
                
    except WebSocketDisconnect:
        del active_connections[client_id]
        print(f"Client {client_id} disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        if client_id in active_connections:
            del active_connections[client_id]

# 구버전 호환을 위한 /ws 엔드포인트
@app.websocket("/ws")
async def websocket_endpoint_legacy(websocket: WebSocket):
    import time
    import random
    client_id = f"client-{int(time.time())}-{random.randint(1000, 9999)}"
    await websocket_endpoint(websocket, client_id)

async def broadcast_message(message: dict):
    """모든 연결된 클라이언트에게 메시지 전송"""
    disconnected = []
    for client_id, ws in active_connections.items():
        try:
            await ws.send_json(message)
        except:
            disconnected.append(client_id)
    
    # 연결 끊긴 클라이언트 제거
    for client_id in disconnected:
        del active_connections[client_id]

# API 엔드포인트들

@app.get("/sections")
async def get_sections():
    return list(sections_db.values())

@app.get("/sections/{section_id}")
async def get_section(section_id: str):
    if section_id not in sections_db:
        raise HTTPException(status_code=404, detail="Section not found")
    return sections_db[section_id]

@app.put("/sections/{section_id}")
async def update_section(section_id: str, section: Section):
    sections_db[section_id] = section
    return section

@app.post("/execute")
async def execute_node_endpoint(request: ExecuteRequest):
    """노드 실행"""
    section = sections_db.get(request.sectionId)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    node = next((n for n in section.nodes if n.id == request.nodeId), None)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    # 비동기 실행
    asyncio.create_task(execute_node_task(request, node, section))
    
    return {"status": "started", "nodeId": request.nodeId}

async def execute_node_task(request: ExecuteRequest, node: Node, section: Section):
    """노드 실행 태스크"""
    try:
        # 시작 알림
        await broadcast_message({
            "type": "node_execution_start",
            "nodeId": node.id
        })
        
        # 진행률 업데이트
        for i in range(0, 101, 20):
            await broadcast_message({
                "type": "progress",
                "nodeId": node.id,
                "progress": i / 100
            })
            await asyncio.sleep(0.2)
        
        # 코드 실행
        all_sections = list(sections_db.values())
        connected_outputs = get_connected_outputs(node, section, all_sections)
        result = await execute_python_code(node.id, request.code or "", connected_outputs, request.sectionId)
        
        if result["success"]:
            # 노드 출력 업데이트
            node.output = result["output"]
            
            # 결과 전송
            await broadcast_message({
                "type": "node_output_updated",
                "nodeId": node.id,
                "output": result["output"]
            })
            
            # 완료 알림
            await broadcast_message({
                "type": "node_execution_complete",
                "nodeId": node.id
            })
        else:
            # 에러 전송
            await broadcast_message({
                "type": "node_execution_error",
                "nodeId": node.id,
                "error": result.get("error", "Unknown error")
            })
            
    except Exception as e:
        await broadcast_message({
            "type": "node_execution_error",
            "nodeId": node.id,
            "error": str(e)
        })

@app.post("/execute-flow")
async def execute_flow_endpoint(request: dict):
    """플로우 실행"""
    section_id = request.get("sectionId")
    start_node_id = request.get("startNodeId")
    
    if not section_id or not start_node_id:
        raise HTTPException(status_code=400, detail="Missing sectionId or startNodeId")
    
    section = sections_db.get(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # 비동기 실행
    asyncio.create_task(execute_flow_task(section, start_node_id))
    
    return {"success": True, "message": "Flow execution started"}

async def execute_flow_task(section: Section, start_node_id: str):
    """플로우 실행 태스크"""
    try:
        # Input 노드부터 시작하여 연결된 모든 노드 실행
        visited = set()
        queue = [start_node_id]
        
        while queue:
            node_id = queue.pop(0)
            if node_id in visited:
                continue
                
            visited.add(node_id)
            node = next((n for n in section.nodes if n.id == node_id), None)
            
            if not node:
                continue
            
            # 노드 실행
            if node.type in ['worker', 'supervisor', 'planner']:
                request = ExecuteRequest(
                    nodeId=node.id,
                    sectionId=section.id,
                    code=node.code or ""
                )
                await execute_node_task(request, node, section)
            
            # 다음 노드들 찾기
            for next_node in section.nodes:
                if next_node.connectedFrom and node_id in next_node.connectedFrom:
                    queue.append(next_node.id)
                    
    except Exception as e:
        print(f"Flow execution error: {e}")

@app.post("/stop/{node_id}")
async def stop_node(node_id: str):
    """노드 실행 중지"""
    # 간단히 중지 메시지만 전송
    await broadcast_message({
        "type": "node_execution_stopped",
        "nodeId": node_id
    })
    return {"success": True}

@app.get("/models")
async def get_models():
    """AI 모델 목록 반환"""
    return {
        "data": [
            {"id": "llama-3.1-8b"},
            {"id": "mistral-7b"},
            {"id": "codellama-13b"}
        ]
    }

@app.post("/node/{node_id}/deactivate")
async def toggle_node_deactivation(node_id: str, request: dict):
    """노드 비활성화 토글"""
    section_id = request.get('sectionId')
    
    section = sections_db.get(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    node = next((n for n in section.nodes if n.id == node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    node.isDeactivated = not node.isDeactivated
    
    return {"deactivated": node.isDeactivated}

@app.post("/supervisor/execute")
async def execute_supervisor(request: dict):
    """Supervisor 실행 (더미 구현)"""
    return {
        "success": True,
        "modifiedCode": "# Modified code",
        "score": 85,
        "modificationId": f"mod-{time.time()}"
    }

@app.post("/supervisor/accept-modification")
async def accept_modification(request: dict):
    """수정사항 승인"""
    return {"success": True}

@app.post("/supervisor/reject-modification") 
async def reject_modification(request: dict):
    """수정사항 거부"""
    return {"success": True}

@app.post("/planner/evaluate-section")
async def evaluate_section(request: dict):
    """섹션 평가"""
    return {
        "id": f"eval-{time.time()}",
        "timestamp": datetime.now().isoformat(),
        "sectionId": request.get("sectionId"),
        "plannerId": request.get("plannerId"),
        "nodeEvaluations": [],
        "overallAssessment": "Section evaluation complete",
        "status": "pending"
    }

@app.post("/planner/accept-evaluation")
async def accept_evaluation(request: dict):
    """평가 승인"""
    return {"success": True}

@app.post("/planner/reject-evaluation")
async def reject_evaluation(request: dict):
    """평가 거부"""
    return {"success": True}

@app.get("/versions/{node_id}")
async def get_versions(node_id: str, limit: int = 5):
    """버전 히스토리 반환"""
    return []

@app.post("/restore-version")
async def restore_version(request: dict):
    """버전 복원"""
    return {"success": True}

@app.post("/sections/update-output-node/{section_id}")
async def update_output_node(section_id: str):
    """Output 노드 업데이트"""
    return {"success": True, "output": {}}

@app.post("/sections/export-output/{section_id}")
async def export_output(section_id: str):
    """출력 내보내기"""
    return {"data": {}}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)