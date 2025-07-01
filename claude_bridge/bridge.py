#!/usr/bin/env python3
"""
Claude Bridge - Main Server
안전한 Claude 브릿지 시스템의 메인 서버
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional, Set
from datetime import datetime
import traceback
from enum import Enum

# FastAPI imports
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Local imports
from .config import BridgeConfig
from .executor import CommandExecutor
from .browser_control import BrowserController
from .automation_control import VSCodeAutomation
from .monitor import SystemMonitor
from .kanban_manager import KanbanManager
from .safety_manager import SafetyManager, SafetyLevel

logger = logging.getLogger(__name__)

class BridgeStatus(Enum):
    """브릿지 상태"""
    STARTING = "starting"
    READY = "ready"
    RUNNING = "running"
    ERROR = "error"
    SHUTDOWN = "shutdown"

class ClaudeBridge:
    """메인 Claude 브릿지 서버"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config = BridgeConfig(config_path)
        self.status = BridgeStatus.STARTING
        self.start_time = datetime.now()
        
        # 컴포넌트 초기화
        self.safety_manager = SafetyManager(self.config.safety_level)
        self.executor = CommandExecutor(self.safety_manager)
        self.browser = BrowserController(self.safety_manager)
        self.vscode = VSCodeAutomation(self.safety_manager)
        self.monitor = SystemMonitor()
        self.kanban = KanbanManager(self.safety_manager)
        
        # WebSocket 연결 관리
        self.websockets: Set[WebSocket] = set()
        
        # FastAPI 앱 설정
        self.app = FastAPI(
            title="Claude Bridge",
            description="Safe bridge between Claude Code and system",
            version="1.0.0"
        )
        
        # CORS 설정
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        
        # 라우트 설정
        self._setup_routes()
        
        logger.info(f"ClaudeBridge initialized with safety level: {self.config.safety_level}")
    
    def _setup_routes(self):
        """API 라우트 설정"""
        
        @self.app.get("/")
        async def root():
            return {
                "service": "Claude Bridge",
                "status": self.status.value,
                "uptime": str(datetime.now() - self.start_time),
                "safety_level": self.config.safety_level.value
            }
        
        @self.app.get("/status")
        async def get_status():
            """시스템 상태 조회"""
            return {
                "bridge_status": self.status.value,
                "safety_level": self.config.safety_level.value,
                "components": {
                    "executor": self.executor.is_ready(),
                    "browser": await self.browser.is_ready(),
                    "vscode": await self.vscode.is_ready(),
                    "monitor": self.monitor.is_ready()
                },
                "system": await self.monitor.get_system_status(),
                "uptime": str(datetime.now() - self.start_time)
            }
        
        @self.app.post("/execute")
        async def execute_command(command: Dict[str, Any]):
            """명령 실행"""
            try:
                # 안전성 검사
                if not self.safety_manager.is_command_safe(command):
                    raise HTTPException(status_code=403, detail="Command not allowed by safety policy")
                
                result = await self.executor.execute(command)
                return {"success": True, "result": result}
                
            except Exception as e:
                logger.error(f"Command execution failed: {e}")
                return {"success": False, "error": str(e)}
        
        @self.app.post("/browser/navigate")
        async def browser_navigate(data: Dict[str, Any]):
            """브라우저 탐색"""
            try:
                url = data.get("url")
                result = await self.browser.navigate(url)
                return {"success": True, "result": result}
                
            except Exception as e:
                logger.error(f"Browser navigation failed: {e}")
                return {"success": False, "error": str(e)}
        
        @self.app.post("/vscode/interact")
        async def vscode_interact(data: Dict[str, Any]):
            """VS Code Claude 인터페이스와 상호작용"""
            try:
                message = data.get("message")
                wait_response = data.get("wait_response", True)
                
                result = await self.vscode.interact_with_claude(message, wait_response)
                return {"success": True, "result": result}
                
            except Exception as e:
                logger.error(f"VS Code interaction failed: {e}")
                return {"success": False, "error": str(e)}
        
        @self.app.get("/kanban")
        async def get_kanban():
            """칸반 보드 조회"""
            return await self.kanban.get_board()
        
        @self.app.post("/kanban/task")
        async def create_task(task_data: Dict[str, Any]):
            """작업 생성"""
            return await self.kanban.create_task(task_data)
        
        @self.app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            """WebSocket 연결"""
            await websocket.accept()
            self.websockets.add(websocket)
            
            try:
                while True:
                    data = await websocket.receive_text()
                    message = json.loads(data)
                    
                    # 메시지 처리
                    response = await self._handle_websocket_message(message)
                    await websocket.send_text(json.dumps(response))
                    
            except WebSocketDisconnect:
                pass
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
            finally:
                self.websockets.discard(websocket)
    
    async def _handle_websocket_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """WebSocket 메시지 처리"""
        try:
            msg_type = message.get("type")
            data = message.get("data", {})
            
            if msg_type == "execute":
                if not self.safety_manager.is_command_safe(data):
                    return {"type": "error", "message": "Command not allowed"}
                
                result = await self.executor.execute(data)
                return {"type": "result", "data": result}
                
            elif msg_type == "browser_action":
                result = await self.browser.handle_action(data)
                return {"type": "result", "data": result}
                
            elif msg_type == "vscode_action":
                result = await self.vscode.handle_action(data)
                return {"type": "result", "data": result}
                
            elif msg_type == "status":
                status = await self.get_system_status()
                return {"type": "status", "data": status}
                
            else:
                return {"type": "error", "message": f"Unknown message type: {msg_type}"}
                
        except Exception as e:
            logger.error(f"WebSocket message handling failed: {e}")
            return {"type": "error", "message": str(e)}
    
    async def broadcast_message(self, message: Dict[str, Any]):
        """모든 WebSocket 클라이언트에 메시지 브로드캐스트"""
        if not self.websockets:
            return
        
        message_text = json.dumps(message)
        disconnected = set()
        
        for websocket in self.websockets:
            try:
                await websocket.send_text(message_text)
            except:
                disconnected.add(websocket)
        
        # 연결이 끊어진 WebSocket 제거
        for websocket in disconnected:
            self.websockets.discard(websocket)
    
    async def get_system_status(self) -> Dict[str, Any]:
        """시스템 상태 조회"""
        return {
            "bridge_status": self.status.value,
            "safety_level": self.config.safety_level.value,
            "uptime": str(datetime.now() - self.start_time),
            "components": {
                "executor": self.executor.is_ready(),
                "browser": await self.browser.is_ready(),
                "vscode": await self.vscode.is_ready(),
                "monitor": self.monitor.is_ready()
            },
            "system": await self.monitor.get_system_status(),
            "kanban": await self.kanban.get_summary()
        }
    
    async def start(self):
        """브릿지 시작"""
        try:
            logger.info("Starting Claude Bridge...")
            
            # 컴포넌트 초기화
            await self.executor.initialize()
            await self.browser.initialize()
            await self.vscode.initialize()
            await self.monitor.initialize()
            await self.kanban.initialize()
            
            self.status = BridgeStatus.READY
            logger.info("Claude Bridge is ready")
            
            # 브로드캐스트
            await self.broadcast_message({
                "type": "status_change",
                "status": "ready"
            })
            
        except Exception as e:
            logger.error(f"Failed to start bridge: {e}")
            self.status = BridgeStatus.ERROR
            raise
    
    async def stop(self):
        """브릿지 정지"""
        try:
            logger.info("Stopping Claude Bridge...")
            
            self.status = BridgeStatus.SHUTDOWN
            
            # 브로드캐스트
            await self.broadcast_message({
                "type": "status_change",
                "status": "shutdown"
            })
            
            # 컴포넌트 정리
            await self.executor.cleanup()
            await self.browser.cleanup()
            await self.vscode.cleanup()
            await self.monitor.cleanup()
            await self.kanban.cleanup()
            
            # WebSocket 연결 정리
            for websocket in self.websockets.copy():
                try:
                    await websocket.close()
                except:
                    pass
            
            logger.info("Claude Bridge stopped")
            
        except Exception as e:
            logger.error(f"Error stopping bridge: {e}")
    
    def run(self, host: str = "127.0.0.1", port: int = 8888):
        """브릿지 실행"""
        try:
            logger.info(f"Starting Claude Bridge on {host}:{port}")
            
            # 시작 코루틴
            async def startup():
                await self.start()
            
            # 종료 코루틴
            async def shutdown():
                await self.stop()
            
            # 이벤트 핸들러 등록
            self.app.add_event_handler("startup", startup)
            self.app.add_event_handler("shutdown", shutdown)
            
            # 서버 실행
            uvicorn.run(
                self.app,
                host=host,
                port=port,
                log_level="info"
            )
            
        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        except Exception as e:
            logger.error(f"Bridge runtime error: {e}")
            traceback.print_exc()

# 헬퍼 함수들
def create_bridge(config_path: Optional[str] = None) -> ClaudeBridge:
    """브릿지 인스턴스 생성"""
    return ClaudeBridge(config_path)

def run_bridge(host: str = "127.0.0.1", port: int = 8888, config_path: Optional[str] = None):
    """브릿지 실행"""
    bridge = create_bridge(config_path)
    bridge.run(host, port)

if __name__ == "__main__":
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(f"claude_bridge_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
        ]
    )
    
    # 실행
    run_bridge()