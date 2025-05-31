# backend/app/api/webhooks.py

from fastapi import APIRouter, Request, Response, HTTPException
from typing import Dict, Any
import json
from datetime import datetime

from app.nodes.trigger import trigger_node
from app.utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhooks"])

@router.post("/{webhook_path:path}")
async def handle_webhook_post(webhook_path: str, request: Request):
    """POST 웹훅 핸들러"""
    try:
        # 요청 본문 파싱
        content_type = request.headers.get("content-type", "")
        
        if "application/json" in content_type:
            body = await request.json()
        elif "application/x-www-form-urlencoded" in content_type:
            form_data = await request.form()
            body = dict(form_data)
        else:
            body = await request.body()
            body = body.decode('utf-8') if isinstance(body, bytes) else str(body)
            
        # 웹훅 데이터
        webhook_data = {
            "path": f"/{webhook_path}",
            "method": "POST",
            "headers": dict(request.headers),
            "body": body,
            "query_params": dict(request.query_params),
            "client": f"{request.client.host}:{request.client.port}" if request.client else None,
            "received_at": datetime.now().isoformat()
        }
        
        # Trigger 노드에서 처리
        trigger_id = trigger_node.handle_webhook(f"/webhook/{webhook_path}", "POST", webhook_data)
        
        if trigger_id:
            return {
                "status": "success",
                "message": "Webhook received and processed",
                "trigger_id": trigger_id,
                "timestamp": datetime.now().isoformat()
            }
        else:
            raise HTTPException(status_code=404, detail="Webhook not found or inactive")
            
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{webhook_path:path}")
async def handle_webhook_get(webhook_path: str, request: Request):
    """GET 웹훅 핸들러"""
    try:
        webhook_data = {
            "path": f"/{webhook_path}",
            "method": "GET",
            "headers": dict(request.headers),
            "query_params": dict(request.query_params),
            "client": f"{request.client.host}:{request.client.port}" if request.client else None,
            "received_at": datetime.now().isoformat()
        }
        
        trigger_id = trigger_node.handle_webhook(f"/webhook/{webhook_path}", "GET", webhook_data)
        
        if trigger_id:
            return {
                "status": "success",
                "message": "Webhook received and processed",
                "trigger_id": trigger_id
            }
        else:
            raise HTTPException(status_code=404, detail="Webhook not found or inactive")
            
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))