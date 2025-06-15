# backend/routers/argosa/collection/native_host_improved.py

import sys
import json
import struct
import asyncio
import logging
from typing import Dict, Any, Optional, Callable, List
from enum import Enum
from datetime import datetime
import aiohttp

class NativeProtocol:
    """Native Messaging 프로토콜 정의"""
    
    @staticmethod
    def encode_message(message: Dict[str, Any]) -> bytes:
        """메시지를 Native Messaging 형식으로 인코딩"""
        encoded = json.dumps(message).encode('utf-8')
        return struct.pack('I', len(encoded)) + encoded
    
    @staticmethod
    def decode_message(data: bytes) -> Optional[Dict[str, Any]]:
        """Native Messaging 형식 메시지 디코딩"""
        if len(data) < 4:
            return None
        
        message_length = struct.unpack('I', data[:4])[0]
        if len(data) < 4 + message_length:
            return None
            
        message_bytes = data[4:4 + message_length]
        return json.loads(message_bytes.decode('utf-8'))

class MessageHandler:
    """메시지 핸들러 등록 및 처리"""
    
    def __init__(self):
        self._handlers: Dict[str, Callable] = {}
        self._default_handler: Optional[Callable] = None
    
    def register(self, message_type: str):
        """데코레이터로 핸들러 등록"""
        def decorator(func):
            self._handlers[message_type] = func
            return func
        return decorator
    
    def set_default(self, func: Callable):
        """기본 핸들러 설정"""
        self._default_handler = func
        return func
    
    async def handle(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """메시지 처리"""
        msg_type = message.get('type')
        
        if msg_type in self._handlers:
            handler = self._handlers[msg_type]
            return await handler(message)
        elif self._default_handler:
            return await self._default_handler(message)
        else:
            return {
                'type': 'error',
                'error': f'Unknown message type: {msg_type}'
            }

class ImprovedNativeHost:
    """개선된 Native Host"""
    
    def __init__(self):
        self.backend_url = "http://localhost:8000/api/argosa"
        self.session: Optional[aiohttp.ClientSession] = None
        self.handler = MessageHandler()
        self.running = True
        
        # 핸들러 등록
        self._register_handlers()
    
    def _register_handlers(self):
        """메시지 핸들러 등록"""
        
        @self.handler.register('init')
        async def handle_init(message: Dict[str, Any]) -> Dict[str, Any]:
            """초기화 처리"""
            logger.info(f"Extension initialized: {message.get('data', {})}")
            
            # 백엔드에 연결 상태 업데이트
            await self._update_backend_status('connected')
            
            return {
                'type': 'init_response',
                'status': 'ready',
                'capabilities': ['collect', 'llm_query', 'crawl', 'session_check']
            }
        
        @self.handler.register('heartbeat')
        async def handle_heartbeat(message: Dict[str, Any]) -> Dict[str, Any]:
            """하트비트 처리"""
            data = message.get('data', {})
            
            # 세션 상태 업데이트
            if 'sessions' in data:
                await self._update_sessions(data['sessions'])
            
            return {'type': 'heartbeat_ack', 'timestamp': datetime.now().isoformat()}
        
        @self.handler.register('collection_result')
        async def handle_collection_result(message: Dict[str, Any]) -> Dict[str, Any]:
            """수집 결과 처리"""
            data = message.get('data', {})
            
            # LLM 대화 필터링
            result = await self._send_to_backend('/native/collection', {
                'platform': data.get('platform'),
                'conversations': data.get('conversations', []),
                'metadata': {
                    'source': 'native_collection',
                    'timestamp': datetime.now().isoformat()
                }
            })
            
            # 백엔드로 전송
            result = await self._send_to_backend('/native/collection', filtered_data)
            
            return {
                'type': 'collection_ack',
                'saved': result.get('saved', 0),
                'filtered': result.get('filtered', 0)
            }
        
        @self.handler.register('llm_query_result')
        async def handle_llm_query(message: Dict[str, Any]) -> Dict[str, Any]:
            """LLM 질의 결과 처리"""
            data = message.get('data', {})
            
            # LLM 대화로 추적
            self.llm_tracking.track(
                conversation_id=data.get('conversation_id'),
                platform=data.get('platform'),
                metadata=data
            )
            
            # 백엔드로 전송
            result = await self._send_to_backend('/native/llm_result', data)
            
            return {'type': 'llm_ack', 'tracked': True}
    
    async def _send_to_backend(self, endpoint: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """백엔드로 데이터 전송"""
        if not self.session:
            self.session = aiohttp.ClientSession()
        
        try:
            async with self.session.post(
                f"{self.backend_url}{endpoint}",
                json=data,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Backend error: {response.status}")
                    return {'error': f'Backend returned {response.status}'}
                    
        except asyncio.TimeoutError:
            logger.error("Backend request timeout")
            return {'error': 'Request timeout'}
        except Exception as e:
            logger.error(f"Backend request failed: {e}")
            return {'error': str(e)}
    
    async def _update_backend_status(self, status: str):
        """백엔드 상태 업데이트"""
        await self._send_to_backend('/native/status', {
            'status': status,
            'timestamp': datetime.now().isoformat()
        })
    
    async def _update_sessions(self, sessions: Dict[str, bool]):
        """세션 상태 업데이트"""
        await self._send_to_backend('/native/sessions', {
            'sessions': sessions,
            'timestamp': datetime.now().isoformat()
        })
    
    async def command_polling_loop(self):
        """백엔드 명령 폴링"""
        while self.running:
            try:
                # 대기 중인 명령 가져오기
                commands = await self._get_pending_commands()
                
                for command in commands:
                    # Extension으로 명령 전송
                    await self._send_to_extension(command)
                
                await asyncio.sleep(2)  # 2초마다 확인
                
            except Exception as e:
                logger.error(f"Command polling error: {e}")
                await asyncio.sleep(5)  # 에러시 5초 대기
    
    async def _get_pending_commands(self) -> List[Dict[str, Any]]:
        """대기 중인 명령 가져오기"""
        try:
            result = await self._send_to_backend('/commands/pending', {})
            return result.get('commands', [])
        except:
            return []
    
    async def _send_to_extension(self, command: Dict[str, Any]):
        """Extension으로 명령 전송"""
        message = {
            'id': command.get('id'),
            'type': command.get('type'),
            'data': command.get('data', {}),
            'timestamp': datetime.now().isoformat()
        }
        
        # LLM 추적 정보 추가
        if command['type'] == 'collect_conversations':
            message['data']['exclude_llm_ids'] = self.llm_tracking.get_tracked_ids()
        
        # 메시지 전송
        encoded = NativeProtocol.encode_message(message)
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()
    
    async def run(self):
        """메인 실행 루프"""
        logger.info("Improved Native Host starting...")
        
        # 백그라운드 태스크 시작
        tasks = [
            asyncio.create_task(self.command_polling_loop()),
            asyncio.create_task(self.message_processing_loop())
        ]
        
        try:
            await asyncio.gather(*tasks)
        finally:
            # 정리
            await self._update_backend_status('disconnected')
            if self.session:
                await self.session.close()
    
    async def message_processing_loop(self):
        """메시지 처리 루프"""
        buffer = b''
        
        while self.running:
            try:
                # stdin에서 읽기 (비동기)
                chunk = await asyncio.get_event_loop().run_in_executor(
                    None, sys.stdin.buffer.read, 1024
                )
                
                if not chunk:
                    logger.info("Extension disconnected")
                    self.running = False
                    break
                
                buffer += chunk
                
                # 완전한 메시지 처리
                while len(buffer) >= 4:
                    message_length = struct.unpack('I', buffer[:4])[0]
                    
                    if len(buffer) >= 4 + message_length:
                        # 메시지 추출
                        message_data = buffer[:4 + message_length]
                        buffer = buffer[4 + message_length:]
                        
                        # 메시지 처리
                        message = NativeProtocol.decode_message(message_data)
                        if message:
                            response = await self.handler.handle(message)
                            
                            # 응답 전송
                            if response:
                                encoded = NativeProtocol.encode_message(response)
                                sys.stdout.buffer.write(encoded)
                                sys.stdout.buffer.flush()
                    else:
                        break  # 메시지 불완전
                        
            except Exception as e:
                logger.error(f"Message processing error: {e}")

if __name__ == "__main__":
    # Windows 바이너리 모드 설정
    if sys.platform == "win32":
        import os
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    
    # 로깅 설정
    log_path = 'C:\\ProgramData\\Argosa\\native_host.log' 
    if sys.platform == "win32":
        log_dir = 'C:\\ProgramData\\Argosa'
    else:
        log_dir = os.path.expanduser('~/.argosa')  # 홈 디렉토리 사용
    
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, 'native_host.log')
    
    logging.basicConfig(
        filename=log_path,
        level=logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    logger = logging.getLogger(__name__)
    
    # 실행
    try:
        host = ImprovedNativeHost()
        asyncio.run(host.run())
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)