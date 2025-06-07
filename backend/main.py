# backend/main.py - 중복 제거 및 정리된 버전

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Optional, List
import asyncio
import json
import os
import time
import random
from datetime import datetime
import threading
import httpx

# Local imports
from models import Section, Node, ExecuteRequest, Position
from storage import save_node_data, ensure_directories, sections_db
from execution import execute_python_code, get_connected_outputs
from constants import GROUPS

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

# WebSocket 연결 관리
active_connections: Dict[str, WebSocket] = {}

# 파일 저장 락
save_lock = threading.Lock()

# LM Studio 연결 정보 저장
lm_studio_connections: Dict[str, Dict] = {}

def save_sections_to_file():
    """섹션 데이터를 파일로 저장 (동기식)"""
    with save_lock:
        try:
            os.makedirs(os.path.dirname(SECTIONS_DATA_FILE), exist_ok=True)
            
            # Pydantic 모델을 JSON으로 직접 변환
            data = {}
            for section_id, section in sections_db.items():
                # model_dump()를 사용하여 중첩된 모델도 모두 dict로 변환
                section_dict = section.model_dump(mode='python')
                data[section_id] = section_dict
            
            # JSON 저장
            temp_file = f"{SECTIONS_DATA_FILE}.tmp"
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False, default=str)
            
            # 원자적 파일 교체
            if os.path.exists(SECTIONS_DATA_FILE):
                backup_file = f"{SECTIONS_DATA_FILE}.backup"
                if os.path.exists(backup_file):
                    os.remove(backup_file)
                os.rename(SECTIONS_DATA_FILE, backup_file)
            
            os.rename(temp_file, SECTIONS_DATA_FILE)
            
            return True
            
        except Exception as e:
            print(f"Error saving sections: {e}")
            return False

def load_sections_from_file():
    """파일에서 섹션 데이터 로드"""
    if os.path.exists(SECTIONS_DATA_FILE):
        try:
            with open(SECTIONS_DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            sections_db.clear()
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
            return False
    return False

def create_default_sections():
    """기본 섹션 생성"""
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
    
    try:
        while True:
            message = await websocket.receive_text()
            if message == "pong":
                continue
                
    except WebSocketDisconnect:
        del active_connections[client_id]
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
    """모든 섹션 조회"""
    sections_list = []
    for section in sections_db.values():
        if hasattr(section, 'model_dump'):
            section_dict = section.model_dump()
        else:
            section_dict = section.dict()
        
        # Position 객체를 dict로 변환
        for node in section_dict.get('nodes', []):
            if 'position' in node and hasattr(node.get('position'), 'x'):
                node['position'] = {
                    'x': node['position'].x,
                    'y': node['position'].y
                }
        
        sections_list.append(section_dict)
    
    return sections_list

@app.get("/sections/{section_id}")
async def get_section(section_id: str):
    """특정 섹션 조회"""
    if section_id not in sections_db:
        raise HTTPException(status_code=404, detail="Section not found")
    
    section = sections_db[section_id]
    if hasattr(section, 'model_dump'):
        section_dict = section.model_dump()
    else:
        section_dict = section.dict()
    
    # Position 객체를 dict로 변환
    for node in section_dict.get('nodes', []):
        if 'position' in node and hasattr(node.get('position'), 'x'):
            node['position'] = {
                'x': node['position'].x,
                'y': node['position'].y
            }
    
    return section_dict

@app.put("/sections/{section_id}")
async def update_section(section_id: str, section_data: dict):
    """섹션 업데이트"""
    try:
        if section_id not in sections_db:
            raise HTTPException(status_code=404, detail=f"Section {section_id} not found")
        
        # 기존 섹션 가져오기
        existing_section = sections_db[section_id]
        
        # nodes를 처리하여 Position 객체로 변환
        nodes = []
        for node_data in section_data.get('nodes', []):
            # position 처리
            if 'position' in node_data and isinstance(node_data['position'], dict):
                pos_dict = node_data['position']
                if 'x' in pos_dict and 'y' in pos_dict:
                    # Position 객체로 변환
                    position = Position(
                        x=float(pos_dict.get('x', 0)),
                        y=float(pos_dict.get('y', 0))
                    )
                    node_data['position'] = position
            
            # Node 객체 생성
            try:
                node = Node(**node_data)
                nodes.append(node)
            except Exception as e:
                continue
        
        # 섹션 업데이트
        existing_section.nodes = nodes
        if 'name' in section_data:
            existing_section.name = section_data['name']
        if 'group' in section_data:
            existing_section.group = section_data['group']
        if 'inputConfig' in section_data:
            existing_section.inputConfig = section_data.get('inputConfig')
        if 'outputConfig' in section_data:
            existing_section.outputConfig = section_data.get('outputConfig')
        
        # 메모리 DB에 저장
        sections_db[section_id] = existing_section
        
        # 파일에 저장
        save_sections_to_file()
        
        return {"status": "success", "message": "Section updated"}
        
    except Exception as e:
        print(f"Error updating section: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
        
        # AI 모델 정보 추가
        execution_context = {
            "inputs": connected_outputs,
            "model": node.model,
            "lmStudioUrl": node.lmStudioUrl
        }
        
        result = await execute_python_code(node.id, request.code or "", execution_context, request.sectionId)
        
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
    # LM Studio를 통해서만 모델 사용 가능
    return {"data": []}

@app.post("/lmstudio/connect")
async def connect_lmstudio(request: dict):
    """LM Studio 연결 테스트 및 모델 목록 가져오기"""
    url = request.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    # URL 정규화
    if not url.startswith(("http://", "https://")):
        url = f"http://{url}"
    
    if not url.endswith("/"):
        url = f"{url}/"
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # LM Studio의 모델 목록 API 호출
            models_url = f"{url}v1/models"
            response = await client.get(models_url)
            
            if response.status_code == 200:
                data = response.json()
                models = []
                
                # OpenAI 형식의 응답 파싱
                if "data" in data:
                    for model in data["data"]:
                        models.append({
                            "id": model.get("id", "unknown"),
                            "name": model.get("id", "Unknown Model"),
                            "type": "lmstudio"
                        })
                
                # 연결 정보 저장
                connection_id = f"conn_{int(time.time())}"
                lm_studio_connections[connection_id] = {
                    "url": url,
                    "models": models,
                    "connected_at": datetime.now().isoformat()
                }
                
                return {
                    "success": True,
                    "connectionId": connection_id,
                    "models": models,
                    "url": url
                }
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"LM Studio returned status {response.status_code}"
                )
                
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=408,
            detail="Connection timeout. Make sure LM Studio is running and accessible."
        )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to LM Studio. Make sure it's running on the specified address."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Connection failed: {str(e)}"
        )

@app.get("/lmstudio/models/{connection_id}")
async def get_lmstudio_models(connection_id: str):
    """저장된 LM Studio 모델 목록 반환"""
    if connection_id not in lm_studio_connections:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    connection = lm_studio_connections[connection_id]
    return {
        "models": connection["models"],
        "url": connection["url"]
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

# 주기적 자동 저장 (5분마다)
async def periodic_save():
    """5분마다 자동 저장"""
    while True:
        await asyncio.sleep(300)  # 5분
        save_sections_to_file()

# 자동 저장 태스크 시작
asyncio.create_task(periodic_save())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)