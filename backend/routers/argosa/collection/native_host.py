# backend/routers/argosa/collection/native_host.py

#!/usr/bin/env python3
import sys
import json
import struct
import asyncio
import logging
import os
import time
from typing import Dict, Any, Optional, List
from enum import Enum
import aiohttp
from datetime import datetime
import traceback

# Windows 바이너리 모드 설정
if sys.platform == "win32":
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

# 로깅 설정
LOG_PATH = 'C:\\ProgramData\\Argosa\\native_host.log'
os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)

logging.basicConfig(
    filename=LOG_PATH,
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class MessageType(Enum):
    # Extension → Native
    INIT = "init"
    READY = "ready"
    HEARTBEAT = "heartbeat"
    SESSION_CHECK = "session_check"
    COLLECTION_COMPLETE = "collection_complete"
    LLM_QUERY_COMPLETE = "llm_query_complete"
    CRAWL_COMPLETE = "crawl_complete"
    ERROR = "error"
    
    # Native → Extension  
    COLLECT_CONVERSATIONS = "collect_conversations"
    EXECUTE_LLM_QUERY = "execute_llm_query"
    CRAWL_WEB = "crawl_web"
    CHECK_SESSION = "check_session"
    UPDATE_SETTINGS = "update_settings"

class NativeHost:
    def __init__(self):
        self.backend_url = "http://localhost:8000/api/argosa"
        self.session: Optional[aiohttp.ClientSession] = None
        self.running = True
        self.pending_commands = {}
        self.llm_conversation_ids = set()
        
    def read_message(self) -> Optional[Dict[str, Any]]:
        """Extension으로부터 메시지 읽기"""
        try:
            # 4바이트 길이 헤더
            raw_length = sys.stdin.buffer.read(4)
            if len(raw_length) != 4:
                return None
                
            message_length = struct.unpack('I', raw_length)[0]
            
            # 메시지 본문
            message_bytes = sys.stdin.buffer.read(message_length)
            if len(message_bytes) != message_length:
                logger.error(f"Expected {message_length} bytes, got {len(message_bytes)}")
                return None
                
            message = json.loads(message_bytes.decode('utf-8'))
            logger.debug(f"Received: {message}")
            return message
            
        except Exception as e:
            logger.error(f"Read error: {e}")
            return None
    
    def send_message(self, message: Dict[str, Any]):
        """Extension으로 메시지 전송"""
        try:
            encoded = json.dumps(message).encode('utf-8')
            
            # 길이 헤더 + 메시지
            sys.stdout.buffer.write(struct.pack('I', len(encoded)))
            sys.stdout.buffer.write(encoded)
            sys.stdout.buffer.flush()
            
            logger.debug(f"Sent: {message}")
            
        except Exception as e:
            logger.error(f"Send error: {e}")
    
    async def initialize_session(self):
        """HTTP 세션 초기화"""
        if not self.session:
            self.session = aiohttp.ClientSession()
            logger.info("HTTP session initialized")
    
    async def get_pending_commands(self) -> List[Dict[str, Any]]:
        """백엔드에서 대기 중인 명령 가져오기"""
        try:
            async with self.session.get(f"{self.backend_url}/commands/pending") as resp:
                if resp.status == 200:
                    commands = await resp.json()
                    return commands.get('commands', [])
        except Exception as e:
            logger.error(f"Failed to get commands: {e}")
        return []
    
    async def process_extension_message(self, message: Dict[str, Any]):
        """Extension 메시지 처리"""
        msg_type = message.get('type')
        msg_id = message.get('id')
        data = message.get('data', {})
        
        logger.info(f"Processing {msg_type} message")
        
        try:
            # 백엔드로 전달
            async with self.session.post(
                f"{self.backend_url}/native/handle",
                json=message
            ) as response:
                
                if response.status == 200:
                    result = await response.json()
                    
                    # 명령에 대한 응답인 경우
                    if msg_id in self.pending_commands:
                        command_info = self.pending_commands.pop(msg_id)
                        
                        # 백엔드에 완료 알림
                        await self.notify_command_complete(
                            command_info['backend_id'], 
                            result
                        )
                        
                else:
                    logger.error(f"Backend error: {response.status}")
                    
        except Exception as e:
            logger.error(f"Process error: {e}\n{traceback.format_exc()}")
    
    async def send_command_to_extension(self, command: Dict[str, Any]):
        """Extension으로 명령 전송"""
        # 고유 ID 생성
        command_id = f"cmd_{int(time.time())}_{len(self.pending_commands)}"
        
        # LLM 대화 ID 목록 추가
        if command['type'] == MessageType.COLLECT_CONVERSATIONS.value:
            command['data']['exclude_llm_ids'] = list(self.llm_conversation_ids)
        
        # 전송할 메시지
        message = {
            'id': command_id,
            'type': command['type'],
            'data': command.get('data', {}),
            'timestamp': datetime.now().isoformat()
        }
        
        # 대기 목록에 추가
        self.pending_commands[command_id] = {
            'backend_id': command.get('id'),
            'sent_at': time.time()
        }
        
        # Extension으로 전송
        self.send_message(message)
        logger.info(f"Sent command {command_id} to extension")
    
    async def notify_command_complete(self, backend_id: str, result: Dict[str, Any]):
        """백엔드에 명령 완료 알림"""
        try:
            async with self.session.post(
                f"{self.backend_url}/commands/complete/{backend_id}",
                json=result
            ) as response:
                
                if response.status == 200:
                    logger.info(f"Command {backend_id} completed")
                else:
                    logger.error(f"Failed to notify completion: {response.status}")
                    
        except Exception as e:
            logger.error(f"Completion notification error: {e}")
    
    async def check_commands_periodically(self):
        """주기적으로 백엔드 명령 확인"""
        while self.running:
            try:
                commands = await self.get_pending_commands()
                
                for command in commands:
                    await self.send_command_to_extension(command)
                
                # 오래된 pending 명령 정리
                current_time = time.time()
                timeout_commands = []
                
                for cmd_id, info in self.pending_commands.items():
                    if current_time - info['sent_at'] > 300:  # 5분 타임아웃
                        timeout_commands.append(cmd_id)
                
                for cmd_id in timeout_commands:
                    info = self.pending_commands.pop(cmd_id)
                    await self.notify_command_complete(
                        info['backend_id'],
                        {'error': 'Command timeout'}
                    )
                
            except Exception as e:
                logger.error(f"Command check error: {e}")
            
            await asyncio.sleep(2)  # 2초마다 확인
    
    async def track_llm_conversations(self, message: Dict[str, Any]):
        """LLM 대화 추적"""
        if message.get('type') == MessageType.LLM_QUERY_COMPLETE.value:
            conversation_id = message.get('data', {}).get('conversation_id')
            if conversation_id:
                self.llm_conversation_ids.add(conversation_id)
                logger.info(f"Tracking LLM conversation: {conversation_id}")
    
    async def send_heartbeat(self):
        """주기적 heartbeat"""
        while self.running:
            try:
                self.send_message({
                    'type': 'native_heartbeat',
                    'timestamp': datetime.now().isoformat(),
                    'status': 'alive'
                })
            except:
                pass
            
            await asyncio.sleep(10)  # 10초마다
    
    async def async_main(self):
        """비동기 메인 루프"""
        logger.info("Native Host started")
        
        # HTTP 세션 초기화
        await self.initialize_session()
        
        # 초기화 메시지
        self.send_message({
            'type': 'native_init',
            'version': '1.0',
            'capabilities': ['collect', 'llm_query', 'crawl']
        })
        
        # 백그라운드 태스크 시작
        tasks = [
            asyncio.create_task(self.check_commands_periodically()),
            asyncio.create_task(self.send_heartbeat())
        ]
        
        # 메시지 읽기 루프
        while self.running:
            # 동기 읽기를 비동기로 처리
            loop = asyncio.get_event_loop()
            message = await loop.run_in_executor(None, self.read_message)
            
            if message:
                # LLM 대화 추적
                await self.track_llm_conversations(message)
                
                # 메시지 처리
                await self.process_extension_message(message)
            elif message is None:
                # stdin 닫힘 - Extension 종료
                logger.info("Extension disconnected")
                self.running = False
                break
            
            await asyncio.sleep(0.01)
        
        # 정리
        for task in tasks:
            task.cancel()
        
        if self.session:
            await self.session.close()
        
        logger.info("Native Host stopped")
    
    def run(self):
        """실행 진입점"""
        try:
            asyncio.run(self.async_main())
        except Exception as e:
            logger.error(f"Fatal error: {e}\n{traceback.format_exc()}")
            sys.exit(1)

if __name__ == "__main__":
    host = NativeHost()
    host.run()