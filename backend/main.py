# backend/main.py - 파일 저장 기능 수정 버전

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

from models import Section, Node, ExecuteRequest, Position
from storage import save_node_data, ensure_directories
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

# 데이터 저장 파일 경로
SECTIONS_DATA_FILE = "data/sections_data.json"

# 메모리 DB
sections_db: Dict[str, Section] = {}

# WebSocket 연결 관리
active_connections: Dict[str, WebSocket] = {}

def save_sections_to_file():
    """섹션 데이터를 파일로 저장"""
    try:
        os.makedirs(os.path.dirname(SECTIONS_DATA_FILE), exist_ok=True)
        
        # Pydantic 모델을 dict로 변환
        data = {}
        for section_id, section in sections_db.items():
            # Pydantic v2의 model_dump() 메서드 사용
            if hasattr(section, 'model_dump'):
                section_dict = section.model_dump()
            else:
                section_dict = section.dict()
            
            data[section_id] = section_dict
        
        # JSON 저장
        temp_file = f"{SECTIONS_DATA_FILE}.tmp"
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        if os.path.exists(SECTIONS_DATA_FILE):
            os.remove(SECTIONS_DATA_FILE)
        os.rename(temp_file, SECTIONS_DATA_FILE)
        
        print(f"Sections saved to {SECTIONS_DATA_FILE}")
    except Exception as e:
        print(f"Error saving sections: {e}")
        import traceback
        traceback.print_exc()

def load_sections_from_file():
    """파일에서 섹션 데이터 로드"""
    global sections_db
    
    if os.path.exists(SECTIONS_DATA_FILE):
        try:
            with open(SECTIONS_DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            sections_db = {}
            for section_id, section_data in data.items():
                # nodes를 처리하여 Position 객체로 변환
                nodes = []
                for node_data in section_data.get('nodes', []):
                    # position이 dict인 경우 Position 객체로 변환
                    if 'position' in node_data and isinstance(node_data['position'], dict):
                        pos_dict = node_data['position']
                        # x, y가 있는지 확인
                        if 'x' in pos_dict and 'y' in pos_dict:
                            node_data['position'] = Position(
                                x=float(pos_dict['x']),
                                y=float(pos_dict['y'])
                            )
                        else:
                            # 기본값 설정
                            if node_data['type'] == 'input':
                                node_data['position'] = Position(x=100, y=200)
                            elif node_data['type'] == 'output':
                                node_data['position'] = Position(x=700, y=200)
                            else:
                                node_data['position'] = Position(x=400, y=200)
                    
                    nodes.append(Node(**node_data))
                
                section_data['nodes'] = nodes
                sections_db[section_id] = Section(**section_data)
            
            print(f"Loaded {len(sections_db)} sections from {SECTIONS_DATA_FILE}")
            return True
        except Exception as e:
            print(f"Error loading sections: {e}")
            import traceback
            traceback.print_exc()
            return False
    return False

def create_default_sections():
    """기본 섹션 생성"""
    from constants import GROUPS
    
    for group, sections in GROUPS.items():
        for idx, section_name in enumerate(sections):
            section_id = f"{group}-{section_name.lower().replace(' ', '-')}"
            if section_id not in sections_db:
                sections_db[section_id] = Section(
                    id=section_id,
                    name=section_name,
                    group=group,
                    nodes=[
                        Node(
                            id=f"input-{section_id}",
                            type="input",
                            label="Input",
                            position=Position(x=100, y=200),
                            isRunning=False
                        ),
                        Node(
                            id=f"output-{section_id}",
                            type="output", 
                            label="Output",
                            position=Position(x=700, y=200),
                            isRunning=False,
                            connectedFrom=[]
                        )
                    ]
                )

@app.on_event("startup")
async def startup_event():
    ensure_directories()
    
    # 저장된 데이터 로드 시도
    if not load_sections_from_file():
        # 로드 실패 시 기본 섹션 생성
        print("Creating default sections...")
        create_default_sections()
        save_sections_to_file()

@app.on_event("shutdown")
async def shutdown_event():
    """서버 종료 시 데이터 저장"""
    save_sections_to_file()

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    active_connections[client_id] = websocket
    print(f"Client {client_id} connected")
    
    try:
        while True:
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
    
    for client_id in disconnected:
        del active_connections[client_id]

# API 엔드포인트들

@app.get("/sections")
async def get_sections():
    # Pydantic 모델을 dict로 변환하여 반환
    sections_list = []
    for section in sections_db.values():
        if hasattr(section, 'model_dump'):
            sections_list.append(section.model_dump())
        else:
            sections_list.append(section.dict())
    
    return sections_list

@app.get("/sections/{section_id}")
async def get_section(section_id: str):
    if section_id not in sections_db:
        raise HTTPException(status_code=404, detail="Section not found")
    
    section = sections_db[section_id]
    if hasattr(section, 'model_dump'):
        return section.model_dump()
    else:
        return section.dict()

@app.put("/sections/{section_id}")
async def update_section(section_id: str, section_data: dict):
    try:
        # dict로 받은 데이터를 Pydantic 모델로 변환
        # position dict를 Position 객체로 변환
        for node_data in section_data.get('nodes', []):
            if 'position' in node_data and isinstance(node_data['position'], dict):
                node_data['position'] = Position(**node_data['position'])
        
        # Section 모델로 변환
        section = Section(**section_data)
        sections_db[section_id] = section
        
        # 파일에 저장 (비동기로 실행)
        asyncio.create_task(asyncio.to_thread(save_sections_to_file))
        
        # 응답은 dict로 반환
        if hasattr(section, 'model_dump'):
            return section.model_dump()
        else:
            return section.dict()
            
    except Exception as e:
        print(f"Error updating section: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

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
            
            # 변경사항 저장
            save_sections_to_file()
            
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
    
    # 변경사항 저장
    save_sections_to_file()
    
    return {"deactivated": node.isDeactivated}

# 나머지 엔드포인트들은 동일...

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)