# backend/app/api/websocket.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Set
import json
import asyncio
from datetime import datetime

from app.utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter()

class ConnectionManager:
    """WebSocket 연결 관리자"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.node_subscriptions: Dict[str, Set[str]] = {}  # node_id -> client_ids
        self.client_subscriptions: Dict[str, Set[str]] = {}  # client_id -> node_ids
        
    async def connect(self, websocket: WebSocket, client_id: str):
        """클라이언트 연결"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.client_subscriptions[client_id] = set()
        logger.info(f"Client {client_id} connected")
        
    def disconnect(self, client_id: str):
        """클라이언트 연결 해제"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            
            # 구독 정리
            for node_id in self.client_subscriptions.get(client_id, []):
                if node_id in self.node_subscriptions:
                    self.node_subscriptions[node_id].discard(client_id)
                    
            if client_id in self.client_subscriptions:
                del self.client_subscriptions[client_id]
                
            logger.info(f"Client {client_id} disconnected")
            
    async def subscribe_to_node(self, client_id: str, node_id: str):
        """노드 로그 구독"""
        if client_id in self.active_connections:
            if node_id not in self.node_subscriptions:
                self.node_subscriptions[node_id] = set()
                
            self.node_subscriptions[node_id].add(client_id)
            self.client_subscriptions[client_id].add(node_id)
            
            await self.send_personal_message(
                f"Subscribed to node {node_id}",
                client_id
            )
            
    async def unsubscribe_from_node(self, client_id: str, node_id: str):
        """노드 로그 구독 해제"""
        if node_id in self.node_subscriptions:
            self.node_subscriptions[node_id].discard(client_id)
            
        if client_id in self.client_subscriptions:
            self.client_subscriptions[client_id].discard(node_id)
            
        await self.send_personal_message(
            f"Unsubscribed from node {node_id}",
            client_id
        )
        
    async def send_personal_message(self, message: str, client_id: str):
        """특정 클라이언트에게 메시지 전송"""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_json({
                "type": "system",
                "message": message,
                "timestamp": datetime.now().isoformat()
            })
            
    async def send_node_log(self, node_id: str, log_data: Dict[str, Any]):
        """노드 로그를 구독자들에게 전송"""
        if node_id in self.node_subscriptions:
            message = {
                "type": "node_log",
                "node_id": node_id,
                "log": log_data,
                "timestamp": datetime.now().isoformat()
            }
            
            # 구독자들에게 전송
            disconnected_clients = []
            
            for client_id in self.node_subscriptions[node_id]:
                if client_id in self.active_connections:
                    try:
                        websocket = self.active_connections[client_id]
                        await websocket.send_json(message)
                    except Exception as e:
                        logger.error(f"Failed to send to {client_id}: {e}")
                        disconnected_clients.append(client_id)
                        
            # 연결이 끊긴 클라이언트 정리
            for client_id in disconnected_clients:
                self.disconnect(client_id)
                
    async def broadcast_event(self, event_type: str, event_data: Dict[str, Any]):
        """모든 클라이언트에게 이벤트 브로드캐스트"""
        message = {
            "type": "event",
            "event_type": event_type,
            "data": event_data,
            "timestamp": datetime.now().isoformat()
        }
        
        disconnected_clients = []
        
        for client_id, websocket in self.active_connections.items():
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Failed to broadcast to {client_id}: {e}")
                disconnected_clients.append(client_id)
                
        # 연결이 끊긴 클라이언트 정리
        for client_id in disconnected_clients:
            self.disconnect(client_id)

# 전역 연결 관리자
manager = ConnectionManager()

@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket 엔드포인트"""
    await manager.connect(websocket, client_id)
    
    try:
        while True:
            # 클라이언트로부터 메시지 수신
            data = await websocket.receive_json()
            
            message_type = data.get("type")
            
            if message_type == "subscribe":
                node_id = data.get("node_id")
                if node_id:
                    await manager.subscribe_to_node(client_id, node_id)
                    
            elif message_type == "unsubscribe":
                node_id = data.get("node_id")
                if node_id:
                    await manager.unsubscribe_from_node(client_id, node_id)
                    
            elif message_type == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": datetime.now().isoformat()
                })
                
            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                })
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}")
        manager.disconnect(client_id)