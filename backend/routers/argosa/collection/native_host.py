# native_host_improved.py - 개선된 Native Host
import sys
hello = b'{"type":"boot"}'           # 내용은 자유
import json
import struct
import asyncio
import logging
import os
from typing import Dict, Any, Optional
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
        # 디버깅용 파일 핸들러 추가
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
    # stdin/stdout을 바이너리 모드로 설정
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

class SimpleNativeHost:
    """간단한 Native Host 구현"""
    
    def __init__(self):
        self.backend_url = "http://localhost:8000/api/argosa"
        self.session: Optional[aiohttp.ClientSession] = None
        self.running = True
        logger.info("SimpleNativeHost initialized")
    
    async def send_to_extension(self, message: Dict[str, Any]):
        """Extension으로 메시지 전송"""
        try:
            encoded = NativeProtocol.encode_message(message)
            sys.stdout.buffer.write(encoded)
            sys.stdout.buffer.flush()
            logger.debug(f"Sent to extension: {message.get('type', 'unknown')}")
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
    
    async def handle_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """메시지 처리"""
        msg_type = message.get('type', 'unknown')
        msg_id = message.get('id', 'no-id')
        
        logger.info(f"Handling message: type={msg_type}, id={msg_id}")
        
        try:
            if msg_type == 'init':
                logger.info("Extension initialized")
                return {
                    'type': 'init_response',
                    'id': msg_id,
                    'status': 'ready',
                    'capabilities': ['collect', 'llm_query', 'session_check']
                }
            
            elif msg_type == 'heartbeat':
                logger.debug("Heartbeat received")
                return {
                    'type': 'heartbeat_ack',
                    'id': msg_id,
                    'timestamp': datetime.now().isoformat()
                }
            
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
                            response = await self.handle_message(message)
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
    
    async def backend_polling(self):
        """백엔드 명령 폴링 (선택적)"""
        # 간단한 버전에서는 폴링 없이 Extension 요청에만 응답
        pass
    
    async def run(self):
        """메인 실행 루프"""
        logger.info("Starting main loop...")
        
        try:
            # stdin 읽기만 실행
            await self.read_stdin()
            
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Fatal error in main loop: {e}")
            logger.error(traceback.format_exc())
        finally:
            logger.info("Native Host shutting down...")
            if self.session:
                await self.session.close()

def main():
    """메인 진입점"""
    logger.info("Main function called")
    
    try:
        # 이벤트 루프 생성 및 실행
        host = SimpleNativeHost()
        asyncio.run(host.run())
    except Exception as e:
        logger.error(f"Fatal error in main: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    logger.info("Script started as __main__")
    main()