# backend/app/api/templates.py

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from app.services.template_service import template_service
from app.utils.auth import get_current_user

router = APIRouter()

class CreateFromTemplateRequest(BaseModel):
    template_id: str
    name: str
    customizations: Optional[Dict[str, Any]] = None

class SaveAsTemplateRequest(BaseModel):
    workflow_id: str
    template_name: str
    category: str = "custom"
    tags: Optional[List[str]] = None

@router.get("/templates")
async def list_templates(
    category: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    """템플릿 목록 조회"""
    templates = template_service.list_templates(category)
    
    return {
        "templates": [
            {
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "category": t.category,
                "tags": t.tags,
                "node_count": len(t.nodes),
                "edge_count": len(t.edges)
            }
            for t in templates
        ]
    }

@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    current_user = Depends(get_current_user)
):
    """템플릿 상세 조회"""
    template = template_service.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "category": template.category,
        "tags": template.tags,
        "nodes": template.nodes,
        "edges": template.edges,
        "variables": template.variables,
        "settings": template.settings,
        "metadata": template.metadata
    }

@router.post("/templates/create-workflow")
async def create_from_template(
    request: CreateFromTemplateRequest,
    current_user = Depends(get_current_user)
):
    """템플릿에서 워크플로우 생성"""
    try:
        workflow = template_service.create_from_template(
            template_id=request.template_id,
            name=request.name,
            customizations=request.customizations
        )
        
        # 워크플로우 저장 (engine에 추가)
        from app.main import engine
        engine.save_workflow(workflow)
        
        return {
            "workflow_id": workflow.id,
            "name": workflow.metadata['name'],
            "template_id": request.template_id
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/templates/save")
async def save_as_template(
    request: SaveAsTemplateRequest,
    current_user = Depends(get_current_user)
):
    """워크플로우를 템플릿으로 저장"""
    try:
        # 워크플로우 가져오기
        from app.main import engine
        workflow = engine.workflows.get(request.workflow_id)
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        template = template_service.save_as_template(
            workflow=workflow,
            template_name=request.template_name,
            category=request.category,
            tags=request.tags
        )
        
        return {
            "template_id": template.id,
            "name": template.name,
            "category": template.category
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/templates/categories")
async def get_categories(current_user = Depends(get_current_user)):
    """템플릿 카테고리 목록"""
    templates = template_service.list_templates()
    categories = {}
    
    for template in templates:
        if template.category not in categories:
            categories[template.category] = 0
        categories[template.category] += 1
    
    return {
        "categories": [
            {"name": cat, "count": count}
            for cat, count in categories.items()
        ]
    }