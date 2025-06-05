# backend/routers/execute_flow.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
from typing import Dict, Optional
from storage import sections_db
from websocket_handler import broadcast_to_all
import time

router = APIRouter()

class ExecuteFlowRequest(BaseModel):
    sectionId: str
    startNodeId: str

class ExecuteNodeRequest(BaseModel):
    nodeId: str
    sectionId: str
    code: Optional[str] = ""
    inputs: Optional[Dict] = {}

# 실행 중인 노드 추적
running_nodes = {}

@router.post("/execute-flow")
async def execute_flow(request: ExecuteFlowRequest):
    """Flow 실행 - Input 노드부터 시작"""
    section = sections_db.get(request.sectionId)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Input 노드 확인
    start_node = next((n for n in section.nodes if n.id == request.startNodeId), None)
    if not start_node:
        raise HTTPException(status_code=404, detail="Start node not found")
    
    # 비동기로 flow 실행
    asyncio.create_task(run_flow_async(section, start_node))
    
    return {"success": True, "message": "Flow execution started"}

@router.post("/execute")
async def execute_node(request: ExecuteNodeRequest):
    """개별 노드 실행"""
    section = sections_db.get(request.sectionId)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    node = next((n for n in section.nodes if n.id == request.nodeId), None)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    # 비동기로 노드 실행
    asyncio.create_task(run_node_async(node, request.code))
    
    return {"success": True, "message": f"Node {request.nodeId} execution started"}

@router.post("/stop/{node_id}")
async def stop_node(node_id: str):
    """노드 실행 중지"""
    if node_id in running_nodes:
        running_nodes[node_id] = False
        await broadcast_to_all({
            "type": "node_execution_stopped",
            "nodeId": node_id
        })
    return {"success": True}

async def run_flow_async(section, start_node):
    """Flow 실행 로직"""
    visited = set()
    queue = [start_node]
    
    while queue:
        current_node = queue.pop(0)
        if current_node.id in visited:
            continue
            
        visited.add(current_node.id)
        
        # 노드 실행
        await run_node_async(current_node, current_node.code if hasattr(current_node, 'code') else "")
        
        # 연결된 다음 노드들 찾기
        for node in section.nodes:
            if hasattr(node, 'connectedFrom') and node.connectedFrom:
                if current_node.id in node.connectedFrom and node.id not in visited:
                    queue.append(node)

async def run_node_async(node, code: str):
    """노드 실행 시뮬레이션"""
    node_id = node.id
    running_nodes[node_id] = True
    
    try:
        # 실행 시작 알림
        await broadcast_to_all({
            "type": "node_execution_start",
            "nodeId": node_id
        })
        
        # 진행률 시뮬레이션
        for i in range(101):
            if not running_nodes.get(node_id, True):
                break
                
            await broadcast_to_all({
                "type": "progress",
                "nodeId": node_id,
                "progress": i / 100
            })
            await asyncio.sleep(0.05)  # 50ms 간격
        
        # 출력 생성
        output = f"Output from {node.label or node.type} node"
        await broadcast_to_all({
            "type": "node_output_updated",
            "nodeId": node_id,
            "output": output
        })
        
        # 완료 알림
        await broadcast_to_all({
            "type": "node_execution_complete",
            "nodeId": node_id
        })
        
    except Exception as e:
        # 에러 알림
        await broadcast_to_all({
            "type": "node_execution_error",
            "nodeId": node_id,
            "error": str(e)
        })
    finally:
        if node_id in running_nodes:
            del running_nodes[node_id]