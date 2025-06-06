# backend/websocket_handler.py - 단순화된 버전
# main.py와의 연동을 위한 헬퍼 함수들만 포함

async def send_progress(node_id: str, progress: float, message: str = ""):
    """진행률 업데이트 전송"""
    from main import broadcast_message
    await broadcast_message({
        "type": "progress",
        "nodeId": node_id,
        "progress": progress,
        "message": message
    })

async def send_update(update_type: str, data: dict):
    """일반 업데이트 전송"""
    from main import broadcast_message
    await broadcast_message({
        "type": update_type,
        **data
    })