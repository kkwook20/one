# Related files: backend/main.py
# Location: backend/websocket_handler.py

from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Any

# Global state for websocket connections
websocket_connections: Dict[str, WebSocket] = {}

async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """Handle WebSocket connections"""
    await websocket.accept()
    websocket_connections[client_id] = websocket
    
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming messages if needed
    except WebSocketDisconnect:
        del websocket_connections[client_id]

async def send_progress(node_id: str, progress: float, message: str = ""):
    """Send progress update to connected clients"""
    data = {
        "type": "progress",
        "nodeId": node_id,
        "progress": progress,
        "message": message
    }
    
    for ws in websocket_connections.values():
        try:
            await ws.send_json(data)
        except:
            pass

async def send_update(update_type: str, data: Any):
    """Send general update to connected clients"""
    message = {
        "type": update_type,
        "data": data
    }
    
    for ws in websocket_connections.values():
        try:
            await ws.send_json(message)
        except:
            pass