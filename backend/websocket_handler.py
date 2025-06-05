# backend/websocket_handler.py - 단순화된 버전

from fastapi import WebSocket, WebSocketDisconnect
import asyncio
from typing import Dict
import json
import time
import random

# WebSocket 연결 관리
websocket_connections: Dict[str, WebSocket] = {}

async def websocket_endpoint(websocket: WebSocket, client_id: str = None):
    """WebSocket 연결 처리 - 단순화된 버전"""
    # client_id가 없으면 생성
    if not client_id:
        client_id = f"client-{int(time.time())}-{random.randint(1000, 9999)}"
    
    try:
        # 연결 수락은 이미 main.py에서 했으므로 생략
        websocket_connections[client_id] = websocket
        print(f"Client connected: {client_id}. Total connections: {len(websocket_connections)}")
        
        # 연결 확인 메시지 전송
        await websocket.send_json({
            "type": "connection_established",
            "clientId": client_id
        })
        
        # 연결 유지
        while True:
            try:
                # 클라이언트로부터 메시지 대기
                message = await websocket.receive_text()
                
                # ping/pong 처리
                if message == "pong":
                    continue
                    
                # 기타 메시지 처리
                print(f"Received from {client_id}: {message}")
                
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"Error receiving message: {e}")
                break
                
    except Exception as e:
        print(f"WebSocket error for client {client_id}: {e}")
    finally:
        # 연결 제거
        if client_id in websocket_connections:
            del websocket_connections[client_id]
        print(f"Client disconnected: {client_id}. Total connections: {len(websocket_connections)}")

async def broadcast_to_all(message: dict):
    """모든 연결된 클라이언트에게 메시지 전송"""
    if not websocket_connections:
        print("No active connections to broadcast to")
        return
        
    disconnected = []
    
    # 모든 클라이언트에게 메시지 전송
    for client_id, websocket in websocket_connections.items():
        try:
            await websocket.send_json(message)
            print(f"Sent to {client_id}: {message['type']}")
        except Exception as e:
            print(f"Failed to send to {client_id}: {e}")
            disconnected.append(client_id)
    
    # 연결이 끊긴 클라이언트 제거
    for client_id in disconnected:
        if client_id in websocket_connections:
            del websocket_connections[client_id]
            print(f"Removed disconnected client: {client_id}")

async def send_to_client(client_id: str, message: dict):
    """특정 클라이언트에게 메시지 전송"""
    if client_id in websocket_connections:
        try:
            await websocket_connections[client_id].send_json(message)
        except Exception as e:
            print(f"Failed to send to {client_id}: {e}")
            if client_id in websocket_connections:
                del websocket_connections[client_id]