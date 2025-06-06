# backend/websocket_handler.py - 정리된 버전
# 주의: 현재 이 파일은 사용되지 않습니다. main.py에 WebSocket 로직이 통합되어 있습니다.
# 향후 WebSocket 로직을 분리할 때 참고용으로 보관

from typing import Dict, Any

async def send_progress(node_id: str, progress: float, message: str = "", broadcast_func=None):
    """진행률 업데이트 전송"""
    if broadcast_func:
        await broadcast_func({
            "type": "progress",
            "nodeId": node_id,
            "progress": progress,
            "message": message
        })

async def send_update(update_type: str, data: dict, broadcast_func=None):
    """일반 업데이트 전송"""
    if broadcast_func:
        await broadcast_func({
            "type": update_type,
            **data
        })

async def send_node_execution_start(node_id: str, broadcast_func=None):
    """노드 실행 시작 알림"""
    await send_update("node_execution_start", {"nodeId": node_id}, broadcast_func)

async def send_node_execution_complete(node_id: str, broadcast_func=None):
    """노드 실행 완료 알림"""
    await send_update("node_execution_complete", {"nodeId": node_id}, broadcast_func)

async def send_node_execution_error(node_id: str, error: str, broadcast_func=None):
    """노드 실행 에러 알림"""
    await send_update("node_execution_error", {"nodeId": node_id, "error": error}, broadcast_func)

async def send_node_output_updated(node_id: str, output: Any, broadcast_func=None):
    """노드 출력 업데이트 알림"""
    await send_update("node_output_updated", {"nodeId": node_id, "output": output}, broadcast_func)