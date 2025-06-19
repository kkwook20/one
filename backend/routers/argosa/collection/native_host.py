# native_host.py - 완전한 Native Host (백엔드 폴링 포함)
import sys
import json
import struct
import asyncio
import logging
import os
from typing import Dict, Any, Optional, List
import traceback
from datetime import datetime
import aiohttp

# ===== 로깅 설정 (최상단에서 즉시 실행) =====

log_dir = os.path.join(os.getenv('PROGRAMDATA', 'C:\\ProgramData'), 'Argosa')
os.makedirs(log_dir, exist_ok=True)
log_path = os.path.join(log_dir, 'native_host.log')

# 로깅 설정
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_path, mode='a', encoding='utf-8'),
        logging.FileHandler(os.path.join(log_dir, 'native_host_debug.log'), mode='w', encoding='utf-8')
    ]
)

logger = logging.getLogger(__name__)

# 시작 로그
logger.info("="*60)
logger.info("Native Host Starting...")
logger.info(f"Python: {sys.executable}")
logger.info(f"Script: {os.path.abspath(__file__)}")
logger.info(f"Working Directory: {os.getcwd()}")
logger.info(f"Log Path: {log_path}")
logger.info("="*60)

# Windows 바이너리 모드 설정
if sys.platform == "win32":
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    logger.info("Windows binary mode set")

class NativeProtocol:
    """Native Messaging 프로토콜"""
    
    @staticmethod
    def encode_message(message: Dict[str, Any]) -> bytes:
        """메시지 인코딩"""
        try:
            encoded = json.dumps(message).encode('utf-8')
            length_bytes = struct.pack('I', len(encoded))
            return length_bytes + encoded
        except Exception as e:
            logger.error(f"Failed to encode message: {e}")
            raise
    
    @staticmethod
    def decode_length(data: bytes) -> Optional[int]:
        """메시지 길이 디코딩"""
        if len(data) < 4:
            return None
        return struct.unpack('I', data[:4])[0]
    
    @staticmethod
    def decode_message(data: bytes) -> Optional[Dict[str, Any]]:
        """메시지 디코딩"""
        try:
            if len(data) < 4:
                return None
            
            message_length = struct.unpack('I', data[:4])[0]
            if len(data) < 4 + message_length:
                return None
            
            message_bytes = data[4:4 + message_length]
            return json.loads(message_bytes.decode('utf-8'))
        except Exception as e:
            logger.error(f"Failed to decode message: {e}")
            return None

class CompleteNativeHost:
    """완전한 Native Host 구현"""
    
    def __init__(self):
        self.backend_url = "http://localhost:8000/api/argosa"
        self.session: Optional[aiohttp.ClientSession] = None
        self.running = True
        self.pending_commands = []
        logger.info("CompleteNativeHost initialized")
    
    async def initialize_session(self):
        """HTTP 세션 초기화"""
        if not self.session:
            self.session = aiohttp.ClientSession()
            logger.info("HTTP session initialized")
    
    async def send_to_extension(self, message: Dict[str, Any]):
        """Extension으로 메시지 전송"""
        try:
            encoded = NativeProtocol.encode_message(message)
            sys.stdout.buffer.write(encoded)
            sys.stdout.buffer.flush()
            logger.info(f"Sent to extension: {message}")
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
    
    async def handle_extension_message(self, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extension에서 온 메시지 처리"""
        msg_type = message.get('type', 'unknown')
        msg_id = message.get('id', 'no-id')
        data = message.get('data', {})
        
        logger.info(f"Handling extension message: type={msg_type}, id={msg_id}")
        
        try:
            if msg_type == 'init':
                logger.info("Extension initialized")
                # 백엔드에 연결 상태 알림
                await self.notify_backend('native/status', {
                    'status': 'connected',
                    'timestamp': datetime.now().isoformat()
                })
                
                return {
                    'type': 'init_response',
                    'id': msg_id,
                    'status': 'ready',
                    'capabilities': ['collect', 'llm_query', 'session_check', 'open_login_page']
                }
            
            elif msg_type == 'heartbeat':
                logger.debug("Heartbeat received")
                # 백엔드에 상태 업데이트
                await self.notify_backend('native/status', {
                    'status': 'alive',
                    'timestamp': datetime.now().isoformat(),
                    'sessions': data.get('sessions', {})
                })
                
                return {
                    'type': 'heartbeat_ack',
                    'id': msg_id,
                    'timestamp': datetime.now().isoformat()
                }
            
            elif msg_type == 'session_update':
                # 세션 업데이트를 백엔드로 전달
                logger.info(f"Session update: {data}")
                
                # 백엔드로 전달할 때 메시지 타입 명확히
                backend_message = {
                    'type': 'session_update',
                    'id': msg_id,
                    'data': data
                }
                
                await self.notify_backend('native/message', backend_message)
                
                # command_id가 있으면 명령 완료 처리
                if data.get('command_id'):
                    complete_url = f"{self.backend_url}/data/commands/complete/{data['command_id']}"
                    try:
                        await self.session.post(complete_url, json={
                            'status': 'completed',
                            'result': data
                        })
                    except Exception as e:
                        logger.error(f"Failed to complete command: {e}")
                
                return None
            
            elif msg_type == 'collection_result':
                # 수집 결과를 백엔드로 전달
                logger.info(f"Collection result for {data.get('platform')}: {len(data.get('conversations', []))} conversations")
                await self.notify_backend('native/message', message)
                return None
            
            elif msg_type == 'llm_query_result':
                # LLM 질의 결과를 백엔드로 전달
                logger.info(f"LLM query result: {data.get('conversation_id')}")
                await self.notify_backend('native/message', message)
                return None
            
            elif msg_type == 'error':
                # 에러를 백엔드로 전달
                logger.error(f"Extension error: {data}")
                await self.notify_backend('native/message', message)
                return None
            
            else:
                logger.warning(f"Unknown message type: {msg_type}")
                return {
                    'type': 'error',
                    'id': msg_id,
                    'error': f'Unknown message type: {msg_type}'
                }
                
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            logger.error(traceback.format_exc())
            return {
                'type': 'error',
                'id': msg_id,
                'error': str(e)
            }
    
    async def notify_backend(self, endpoint: str, data: Dict[str, Any]):
        """백엔드에 알림 전송"""
        try:
            if not self.session:
                await self.initialize_session()
            
            url = f"{self.backend_url}/data/{endpoint}"
            logger.debug(f"Notifying backend: {url}")
            
            async with self.session.post(url, json=data, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status != 200:
                    logger.error(f"Backend notification failed: {response.status}")
                else:
                    logger.debug(f"Backend notified successfully: {endpoint}")
        except Exception as e:
            logger.error(f"Failed to notify backend: {e}")
    
    async def command_polling_loop(self):
        """백엔드에서 명령 폴링 - 핵심 기능!"""
        logger.info("Starting command polling loop")
        
        while self.running:
            try:
                if not self.session:
                    await self.initialize_session()
                
                # 백엔드에서 대기 중인 명령 가져오기
                url = f"{self.backend_url}/data/commands/pending"
                async with self.session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                    if response.status == 200:
                        data = await response.json()
                        commands = data.get('commands', [])
                        
                        if commands:
                            logger.info(f"Got {len(commands)} commands from backend")
                        
                        for cmd in commands:
                            logger.info(f"Processing command: {cmd}")
                            
                            # 명령 타입과 데이터 추출
                            command_id = cmd.get('id')
                            command_type = cmd.get('type')
                            command_data = cmd.get('data', {})
                            
                            # Extension으로 전송할 메시지 구성
                            extension_message = {
                                'type': command_type,
                                'id': command_id,
                                'data': command_data
                            }
                            
                            # 특별한 명령 처리
                            if command_type == 'open_login_page':
                                logger.info(f"🔐 Open login page command for: {command_data.get('platform')}")
                                # Extension이 이해할 수 있는 형식으로 변환
                                extension_message = {
                                    'type': 'open_login_page',
                                    'id': command_id,
                                    'data': {
                                        'platform': command_data.get('platform')
                                    }
                                }
                            
                            # Extension으로 명령 전송
                            await self.send_to_extension(extension_message)
                            
                            # 명령 완료 표시 (옵션)
                            if command_id:
                                complete_url = f"{self.backend_url}/data/commands/complete/{command_id}"
                                try:
                                    await self.session.post(complete_url, json={'status': 'sent'})
                                except Exception as e:
                                    logger.error(f"Failed to mark command complete: {e}")
                
                # 폴링 간격 (2초)
                await asyncio.sleep(2)
                
            except asyncio.TimeoutError:
                logger.debug("Command polling timeout (normal)")
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Command polling error: {e}")
                await asyncio.sleep(5)  # 에러 시 더 긴 대기
    
    async def read_stdin(self):
        """stdin에서 메시지 읽기"""
        buffer = b''
        
        while self.running:
            try:
                # stdin에서 데이터 읽기
                chunk = await asyncio.get_event_loop().run_in_executor(
                    None, 
                    lambda: sys.stdin.buffer.read(1024)
                )
                
                if not chunk:
                    logger.info("Extension disconnected (no data)")
                    self.running = False
                    break
                
                buffer += chunk
                
                # 완전한 메시지 처리
                while len(buffer) >= 4:
                    message_length = NativeProtocol.decode_length(buffer)
                    if message_length is None:
                        break
                    
                    if len(buffer) >= 4 + message_length:
                        # 메시지 추출
                        message_data = buffer[:4 + message_length]
                        buffer = buffer[4 + message_length:]
                        
                        # 메시지 디코딩
                        message = NativeProtocol.decode_message(message_data)
                        if message:
                            # 메시지 처리
                            response = await self.handle_extension_message(message)
                            if response:
                                await self.send_to_extension(response)
                    else:
                        # 메시지가 아직 불완전함
                        break
                        
            except Exception as e:
                logger.error(f"Error reading stdin: {e}")
                logger.error(traceback.format_exc())
                self.running = False
                break
    
    async def run(self):
        """메인 실행 루프"""
        logger.info("Starting main loop...")
        
        try:
            # HTTP 세션 초기화
            await self.initialize_session()
            
            # 두 개의 태스크를 병렬로 실행
            tasks = [
                asyncio.create_task(self.read_stdin()),
                asyncio.create_task(self.command_polling_loop())  # 이게 핵심!
            ]
            
            # 모든 태스크 완료 대기
            await asyncio.gather(*tasks)
            
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Fatal error in main loop: {e}")
            logger.error(traceback.format_exc())
        finally:
            logger.info("Native Host shutting down...")
            self.running = False
            
            # 백엔드에 연결 해제 알림
            try:
                await self.notify_backend('native/status', {
                    'status': 'disconnected',
                    'timestamp': datetime.now().isoformat()
                })
            except:
                pass
            
            if self.session:
                await self.session.close()

def main():
    """메인 진입점"""
    logger.info("Main function called")
    
    try:
        # 이벤트 루프 생성 및 실행
        host = CompleteNativeHost()
        asyncio.run(host.run())
    except Exception as e:
        logger.error(f"Fatal error in main: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    logger.info("Script started as __main__")
    main()