import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, List, Set, Any, Optional, Callable
from fastapi import WebSocket, WebSocketDisconnect
from dataclasses import dataclass, field
import uuid

logger = logging.getLogger(__name__)

@dataclass
class Client:
    """WebSocket 클라이언트 정보"""
    id: str
    websocket: WebSocket
    connected_at: datetime
    user_info: Dict[str, Any] = field(default_factory=dict)
    subscriptions: Set[str] = field(default_factory=set)

class WebSocketManager:
    """WebSocket 연결 관리자"""
    
    def __init__(self):
        # 연결된 클라이언트
        self.clients: Dict[str, Client] = {}
        
        # 채널별 구독자
        self.channels: Dict[str, Set[str]] = {}
        
        # 노드별 클라이언트 매핑
        self.node_clients: Dict[str, str] = {}
        
        # 메시지 핸들러
        self.message_handlers: Dict[str, Callable] = {}
        
        # 연결 이벤트 핸들러
        self.connection_handlers: List[Callable] = []
        self.disconnection_handlers: List[Callable] = []
        
        # 통계
        self.stats = {
            "total_connections": 0,
            "total_messages_sent": 0,
            "total_messages_received": 0
        }
    
    async def connect(
        self, 
        websocket: WebSocket, 
        user_info: Optional[Dict[str, Any]] = None
    ) -> str:
        """새 클라이언트 연결"""
        await websocket.accept()
        
        # 클라이언트 ID 생성
        client_id = str(uuid.uuid4())
        
        # 클라이언트 정보 저장
        client = Client(
            id=client_id,
            websocket=websocket,
            connected_at=datetime.now(),
            user_info=user_info or {}
        )
        
        self.clients[client_id] = client
        self.stats["total_connections"] += 1
        
        # 연결 이벤트 발생
        await self._trigger_connection_handlers(client)
        
        # 환영 메시지 전송
        await self.send_to_client(client_id, {
            "type": "connection",
            "status": "connected",
            "clientId": client_id,
            "timestamp": datetime.now().isoformat()
        })
        
        logger.info(f"Client {client_id} connected. Total clients: {len(self.clients)}")
        
        return client_id
    
    def disconnect(self, client_id: str):
        """클라이언트 연결 해제"""
        if client_id not in self.clients:
            return
        
        client = self.clients[client_id]
        
        # 구독 해제
        for channel in client.subscriptions:
            self.unsubscribe(client_id, channel)
        
        # 노드 매핑 제거
        node_ids = [
            node_id for node_id, cid in self.node_clients.items() 
            if cid == client_id
        ]
        for node_id in node_ids:
            del self.node_clients[node_id]
        
        # 클라이언트 제거
        del self.clients[client_id]
        
        # 연결 해제 이벤트 발생
        asyncio.create_task(self._trigger_disconnection_handlers(client))
        
        logger.info(f"Client {client_id} disconnected. Total clients: {len(self.clients)}")
    
    async def send_to_client(self, client_id: str, message: Dict[str, Any]) -> bool:
        """특정 클라이언트에게 메시지 전송"""
        if client_id not in self.clients:
            return False
        
        client = self.clients[client_id]
        
        try:
            await client.websocket.send_json(message)
            self.stats["total_messages_sent"] += 1
            return True
        except Exception as e:
            logger.error(f"Error sending message to client {client_id}: {e}")
            return False
    
    async def send_to_node(self, node_id: str, message: Dict[str, Any]) -> bool:
        """특정 노드를 소유한 클라이언트에게 메시지 전송"""
        client_id = self.node_clients.get(node_id)
        if client_id:
            return await self.send_to_client(client_id, message)
        return False
    
    async def broadcast(self, message: Dict[str, Any], exclude: Optional[str] = None):
        """모든 클라이언트에게 브로드캐스트"""
        tasks = []
        
        for client_id in self.clients:
            if client_id != exclude:
                tasks.append(self.send_to_client(client_id, message))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def send_to_channel(
        self, 
        channel: str, 
        message: Dict[str, Any],
        exclude: Optional[str] = None
    ):
        """특정 채널 구독자에게 메시지 전송"""
        if channel not in self.channels:
            return
        
        tasks = []
        
        for client_id in self.channels[channel]:
            if client_id != exclude:
                tasks.append(self.send_to_client(client_id, message))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    
    def subscribe(self, client_id: str, channel: str) -> bool:
        """채널 구독"""
        if client_id not in self.clients:
            return False
        
        # 채널이 없으면 생성
        if channel not in self.channels:
            self.channels[channel] = set()
        
        # 구독 추가
        self.channels[channel].add(client_id)
        self.clients[client_id].subscriptions.add(channel)
        
        logger.info(f"Client {client_id} subscribed to channel {channel}")
        return True
    
    def unsubscribe(self, client_id: str, channel: str) -> bool:
        """채널 구독 해제"""
        if client_id not in self.clients:
            return False
        
        if channel in self.channels:
            self.channels[channel].discard(client_id)
            
            # 빈 채널 제거
            if not self.channels[channel]:
                del self.channels[channel]
        
        self.clients[client_id].subscriptions.discard(channel)
        
        logger.info(f"Client {client_id} unsubscribed from channel {channel}")
        return True
    
    def register_node(self, client_id: str, node_id: str) -> bool:
        """노드를 클라이언트에 등록"""
        if client_id not in self.clients:
            return False
        
        self.node_clients[node_id] = client_id
        return True
    
    def unregister_node(self, node_id: str) -> bool:
        """노드 등록 해제"""
        if node_id in self.node_clients:
            del self.node_clients[node_id]
            return True
        return False
    
    def register_handler(self, message_type: str, handler: Callable):
        """메시지 핸들러 등록"""
        self.message_handlers[message_type] = handler
    
    def on_connect(self, handler: Callable):
        """연결 이벤트 핸들러 등록"""
        self.connection_handlers.append(handler)
    
    def on_disconnect(self, handler: Callable):
        """연결 해제 이벤트 핸들러 등록"""
        self.disconnection_handlers.append(handler)
    
    async def handle_message(
        self, 
        client_id: str, 
        message: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """메시지 처리"""
        self.stats["total_messages_received"] += 1
        
        message_type = message.get("type")
        
        # 기본 메시지 타입 처리
        if message_type == "ping":
            return {"type": "pong", "timestamp": datetime.now().isoformat()}
        
        elif message_type == "subscribe":
            channel = message.get("channel")
            if channel:
                success = self.subscribe(client_id, channel)
                return {
                    "type": "subscription",
                    "channel": channel,
                    "status": "subscribed" if success else "failed"
                }
        
        elif message_type == "unsubscribe":
            channel = message.get("channel")
            if channel:
                success = self.unsubscribe(client_id, channel)
                return {
                    "type": "subscription",
                    "channel": channel,
                    "status": "unsubscribed" if success else "failed"
                }
        
        elif message_type == "register_node":
            node_id = message.get("nodeId")
            if node_id:
                success = self.register_node(client_id, node_id)
                return {
                    "type": "node_registration",
                    "nodeId": node_id,
                    "status": "registered" if success else "failed"
                }
        
        # 커스텀 핸들러 확인
        if message_type in self.message_handlers:
            handler = self.message_handlers[message_type]
            try:
                return await handler(client_id, message)
            except Exception as e:
                logger.error(f"Error in message handler for {message_type}: {e}")
                return {
                    "type": "error",
                    "error": str(e),
                    "originalType": message_type
                }
        
        return None
    
    async def _trigger_connection_handlers(self, client: Client):
        """연결 이벤트 핸들러 실행"""
        for handler in self.connection_handlers:
            try:
                await handler(client)
            except Exception as e:
                logger.error(f"Error in connection handler: {e}")
    
    async def _trigger_disconnection_handlers(self, client: Client):
        """연결 해제 이벤트 핸들러 실행"""
        for handler in self.disconnection_handlers:
            try:
                await handler(client)
            except Exception as e:
                logger.error(f"Error in disconnection handler: {e}")
    
    def get_client_info(self, client_id: str) -> Optional[Dict[str, Any]]:
        """클라이언트 정보 조회"""
        if client_id not in self.clients:
            return None
        
        client = self.clients[client_id]
        
        return {
            "id": client.id,
            "connectedAt": client.connected_at.isoformat(),
            "userInfo": client.user_info,
            "subscriptions": list(client.subscriptions),
            "nodes": [
                node_id for node_id, cid in self.node_clients.items() 
                if cid == client_id
            ]
        }
    
    def get_stats(self) -> Dict[str, Any]:
        """통계 정보 조회"""
        return {
            **self.stats,
            "current_connections": len(self.clients),
            "channels": len(self.channels),
            "registered_nodes": len(self.node_clients),
            "channel_info": {
                channel: len(subscribers) 
                for channel, subscribers in self.channels.items()
            }
        }
    
    async def broadcast_node_update(
        self, 
        node_id: str, 
        update_type: str,
        data: Dict[str, Any]
    ):
        """노드 업데이트 브로드캐스트"""
        message = {
            "type": "node_update",
            "nodeId": node_id,
            "updateType": update_type,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        
        # 노드를 구독한 모든 클라이언트에게 전송
        await self.send_to_channel(f"node:{node_id}", message)
    
    async def broadcast_workflow_update(
        self,
        workflow_id: str,
        update_type: str,
        data: Dict[str, Any]
    ):
        """워크플로우 업데이트 브로드캐스트"""
        message = {
            "type": "workflow_update",
            "workflowId": workflow_id,
            "updateType": update_type,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        
        # 워크플로우를 구독한 모든 클라이언트에게 전송
        await self.send_to_channel(f"workflow:{workflow_id}", message)
    
    async def stream_logs(
        self,
        client_id: str,
        source: str,
        logs: List[str]
    ):
        """로그 스트리밍"""
        for log in logs:
            await self.send_to_client(client_id, {
                "type": "log",
                "source": source,
                "content": log,
                "timestamp": datetime.now().isoformat()
            })
            
            # 스트리밍 효과를 위한 작은 지연
            await asyncio.sleep(0.01)


# 싱글톤 인스턴스
websocket_manager = WebSocketManager()

# WebSocket 엔드포인트 헬퍼
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 엔드포인트 처리"""
    client_id = await websocket_manager.connect(websocket)
    
    try:
        while True:
            # 메시지 수신
            data = await websocket.receive_json()
            
            # 메시지 처리
            response = await websocket_manager.handle_message(client_id, data)
            
            # 응답 전송
            if response:
                await websocket_manager.send_to_client(client_id, response)
                
    except WebSocketDisconnect:
        websocket_manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
        websocket_manager.disconnect(client_id)