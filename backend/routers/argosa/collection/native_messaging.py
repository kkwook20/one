# backend/routers/argosa/collection/native_messaging.py

import sys
import json
import struct
import asyncio
import logging
import threading
import queue
import time
from typing import Dict, Any, Optional
from enum import Enum
import aiohttp
import os

# Windows 바이너리 모드 설정
if sys.platform == "win32":
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

# 로깅 설정 (파일로만)
logging.basicConfig(
    filename='C:\\ProgramData\\Argosa\\native_messaging.log',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class MessageType(Enum):
    # Extension → Native
    INIT = "init"
    READY = "ready"
    HEARTBEAT = "heartbeat"
    SESSION_UPDATE = "session_update"
    COLLECTION_RESULT = "collection_result"
    LLM_QUERY_RESULT = "llm_query_result"
    CRAWL_RESULT = "crawl_result"
    ERROR = "error"
    
    # Native → Extension  
    COLLECT_CONVERSATIONS = "collect_conversations"
    EXECUTE_LLM_QUERY = "execute_llm_query"
    CRAWL_WEB = "crawl_web"
    CHECK_SESSION = "check_session"
    UPDATE_SETTINGS = "update_settings"

class NativeMessagingBridge:
    def __init__(self):
        self.backend_url = "http://localhost:8000/api/argosa"
        self.message_queue = queue.Queue()
        self.pending_responses = {}
        self.running = True
        self.session = None
        
    def read_message(self) -> Optional[Dict[str, Any]]:
        """Extension으로부터 메시지 읽기"""
        try:
            # 길이 헤더 읽기
            raw_length = sys.stdin.buffer.read(4)
            if len(raw_length) != 4:
                return None
                
            message_length = struct.unpack('I', raw_length)[0]
            
            # 메시지 본문 읽기
            message_bytes = sys.stdin.buffer.read(message_length)
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
    
    def read_loop(self):
        """동기 읽기 루프 (별도 스레드)"""
        while self.running:
            message = self.read_message()
            if message:
                self.message_queue.put(message)
            else:
                # Extension 종료
                self.running = False
                break
    
    async def process_loop(self):
        """비동기 메시지 처리 루프"""
        while self.running:
            try:
                # 큐에서 메시지 가져오기
                message = self.message_queue.get(timeout=0.1)
                await self.handle_message(message)
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Process error: {e}")
    
    async def handle_message(self, message: Dict[str, Any]):
        """메시지 처리 with 재시도"""
        msg_type = message.get('type')
        msg_id = message.get('id')
        data = message.get('data', {})
        
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                # 백엔드로 전달
                if not self.session:
                    self.session = aiohttp.ClientSession()
                
                async with self.session.post(
                    f"{self.backend_url}/native/handle",
                    json=message,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    
                    if response.status == 200:
                        result = await response.json()
                        
                        # 응답이 필요한 경우
                        if msg_id and result:
                            self.send_message({
                                'id': msg_id,
                                'type': 'response',
                                'data': result
                            })
                        break  # 성공 시 루프 종료
                        
                    elif response.status >= 500:  # 서버 에러는 재시도
                        logger.warning(f"Server error {response.status}, attempt {attempt + 1}/{max_retries}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(1)
                            continue
                        else:
                            # 최대 재시도 후 에러 응답
                            error_text = await response.text()
                            raise aiohttp.ClientError(f"Server error after {max_retries} attempts: {error_text}")
                    
                    else:  # 4xx 등 클라이언트 에러는 재시도하지 않음
                        error_text = await response.text()
                        raise aiohttp.ClientError(f"Client error {response.status}: {error_text}")
                        
            except aiohttp.ClientError as e:
                logger.error(f"Backend communication error (attempt {attempt + 1}/{max_retries}): {e}")
                
                if attempt < max_retries - 1:
                    await asyncio.sleep(1)
                    continue
                    
                # 최대 재시도 후 에러 응답
                if msg_id:
                    self.send_message({
                        'id': msg_id,
                        'type': 'error',
                        'error': f"Backend communication failed: {str(e)}"
                    })
                break
                
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                
                # 예상치 못한 에러는 즉시 응답
                if msg_id:
                    self.send_message({
                        'id': msg_id,
                        'type': 'error',
                        'error': str(e)
                    })
                break
    
    def run(self):
        """메인 실행"""
        logger.info("Native Messaging Bridge started")
        
        # 초기화 메시지
        self.send_message({
            'type': 'native_ready',
            'version': '1.0',
            'capabilities': ['collect', 'llm_query', 'crawl']
        })
        
        # 읽기 스레드 시작
        read_thread = threading.Thread(target=self.read_loop)
        read_thread.daemon = True
        read_thread.start()
        
        # 처리 루프 실행
        try:
            asyncio.run(self.process_loop())
        finally:
            if self.session:
                asyncio.run(self.session.close())

if __name__ == "__main__":
    bridge = NativeMessagingBridge()
    bridge.run()