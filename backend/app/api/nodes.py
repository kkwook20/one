# backend/app/api/nodes.py (일부 수정)
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import datetime
import uuid

from app.core.engine import WorkflowEngine
from app.storage.node_storage import node_storage
from app.core.variable_resolver import global_variable_resolver
from app.models.node import Node, TaskItem, VersionHistory

router = APIRouter(prefix="/api/nodes", tags=["nodes"])

class NodeExecuteRequest(BaseModel):
    """노드 실행 요청"""
    node_id: str
    task_items: Optional[List[TaskItem]] = None
    use_ai_improvement: bool = False  # AI 자동 개선 사용 여부

class NodeVersionRequest(BaseModel):
    """노드 버전 관리 요청"""
    node_id: str
    action: str  # "save", "restore", "list"
    version_id: Optional[str] = None
    message: Optional[str] = None

class NodeCodeUpdateRequest(BaseModel):
    """노드 코드 업데이트 요청"""
    node_id: str
    code: str
    editor_type: Optional[str] = "code"  # code, input, output (Worker Node용)
    auto_save_version: bool = True

# 기존 엔드포인트들...

@router.post("/execute")
async def execute_node(request: NodeExecuteRequest, background_tasks: BackgroundTasks):
    """노드 실행 (작업 항목 지원)"""
    try:
        # 노드 데이터 로드
        node_data = await node_storage.load_node_data(request.node_id)
        if not node_data:
            raise HTTPException(status_code=404, detail=f"Node not found: {request.node_id}")
        
        # 작업 항목 업데이트
        if request.task_items:
            node_data['task_items'] = [item.dict() for item in request.task_items]
            await node_storage.save_node_data(request.node_id, node_data)
        
        # 엔진 인스턴스 생성
        engine = WorkflowEngine()
        
        # 백그라운드에서 실행
        background_tasks.add_task(
            engine.execute_node,
            request.node_id,
            use_ai_improvement=request.use_ai_improvement
        )
        
        return {
            "message": f"Node {request.node_id} execution started",
            "execution_id": str(uuid.uuid4())
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/version")
async def manage_node_version(request: NodeVersionRequest):
    """노드 버전 관리"""
    try:
        if request.action == "save":
            # 현재 버전 저장
            version_id = await node_storage.save_version(
                request.node_id,
                message=request.message
            )
            return {"version_id": version_id, "message": "Version saved successfully"}
            
        elif request.action == "restore":
            # 특정 버전 복원
            if not request.version_id:
                raise HTTPException(status_code=400, detail="version_id is required for restore")
            
            success = await node_storage.restore_version(
                request.node_id,
                request.version_id
            )
            if not success:
                raise HTTPException(status_code=404, detail="Version not found")
            
            return {"message": f"Restored to version {request.version_id}"}
            
        elif request.action == "list":
            # 버전 목록 조회
            versions = await node_storage.get_version_history(request.node_id)
            return {"versions": versions}
            
        else:
            raise HTTPException(status_code=400, detail=f"Invalid action: {request.action}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/code")
async def update_node_code(request: NodeCodeUpdateRequest):
    """노드 코드 업데이트"""
    try:
        # 자동 버전 저장
        if request.auto_save_version:
            await node_storage.save_version(
                request.node_id,
                message=f"Auto-save before code update ({request.editor_type})"
            )
        
        # 코드 저장
        if request.editor_type == "code":
            success = await node_storage.save_code(request.node_id, request.code)
        else:
            # Worker Node의 다른 편집기 타입 처리
            node_data = await node_storage.load_node_data(request.node_id)
            if not node_data:
                raise HTTPException(status_code=404, detail="Node not found")
            
            if request.editor_type == "input":
                node_data['input_template'] = request.code
            elif request.editor_type == "output":
                node_data['output_template'] = request.code
            
            await node_storage.save_node_data(request.node_id, node_data)
            success = True
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save code")
        
        # 글로벌 변수 업데이트
        if request.editor_type == "code":
            variables = global_variable_resolver.extract_variables_from_code(request.code)
            # 변수 등록은 실행 시에 처리
        
        return {"message": "Code updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{node_id}/task-items")
async def get_task_items(node_id: str):
    """노드의 작업 항목 조회"""
    try:
        node_data = await node_storage.load_node_data(node_id)
        if not node_data:
            raise HTTPException(status_code=404, detail="Node not found")
        
        task_items = node_data.get('task_items', [])
        return {"task_items": task_items}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{node_id}/task-items")
async def update_task_items(node_id: str, task_items: List[TaskItem]):
    """노드의 작업 항목 업데이트"""
    try:
        node_data = await node_storage.load_node_data(node_id)
        if not node_data:
            raise HTTPException(status_code=404, detail="Node not found")
        
        node_data['task_items'] = [item.dict() for item in task_items]
        await node_storage.save_node_data(node_id, node_data)
        
        return {"message": "Task items updated successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{node_id}/statistics")
async def get_node_statistics(node_id: str):
    """노드 실행 통계 조회"""
    try:
        stats = await node_storage.get_statistics(node_id)
        return stats
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{node_id}/files")
async def list_node_files(node_id: str):
    """노드의 파일 목록 조회"""
    try:
        files = await node_storage.list_files(node_id)
        return {"files": files}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))