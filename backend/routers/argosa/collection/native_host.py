# native_host.py - Firefox Manager 사용 버전
import sys
import json
import struct
import asyncio
import logging
from logging.handlers import RotatingFileHandler
import os
from typing import Dict, Any, Optional, List, Set
import traceback
from datetime import datetime
import aiohttp
import select
import threading
from queue import Queue

# Python path 설정 - Firefox Manager import 를 위해
import sys
from pathlib import Path

# 백엔드 루트 디렉토리를 Python path에 추가
backend_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_root))

# Firefox manager import
try:
    from routers.argosa.shared.firefox_manager import get_firefox_manager, FirefoxEvent
    firefox_manager = get_firefox_manager()
    print(f"[NativeHost] Firefox Manager imported successfully: {firefox_manager is not None}")
except ImportError as e:
    print(f"[NativeHost] Failed to import Firefox Manager: {e}")
    firefox_manager = None
    FirefoxEvent = None

# 로깅 설정
log_dir = os.path.join(os.getenv('PROGRAMDATA', 'C:\\ProgramData'), 'Argosa')
os.makedirs(log_dir, exist_ok=True)
log_path = os.path.join(log_dir, 'native_host.log')

# RotatingFileHandler 설정
# maxBytes: 10MB, backupCount: 5개 파일 유지
handler = RotatingFileHandler(
    log_path,
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5,  # 5개의 백업 파일 유지
    encoding='utf-8'
)

handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)

# Windows 바이너리 모드 설정
if sys.platform == "win32":
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

class LoginTabTracker:
    """로그인 탭 추적만 담당"""
    
    def __init__(self):
        self.login_tabs: Dict[str, Dict[str, Any]] = {}  # platform -> {tab_id, start_time}
        logger.info("LoginTabTracker initialized")
    
    def add_login_tab(self, platform: str, tab_id: str):
        """로그인 탭 추적 시작"""
        self.login_tabs[platform] = {
            'tab_id': tab_id,
            'start_time': datetime.now().isoformat()
        }
        logger.info(f"Tracking login tab for {platform}: {tab_id}")
    
    def remove_login_tab(self, platform: str):
        """로그인 탭 제거"""
        if platform in self.login_tabs:
            del self.login_tabs[platform]
            logger.info(f"Stopped tracking login tab for {platform}")
    
    def get_all_platforms(self) -> List[str]:
        """추적 중인 모든 플랫폼 반환"""
        return list(self.login_tabs.keys())
    
    def clear_all(self):
        """모든 추적 중인 탭 제거"""
        self.login_tabs.clear()

class ImprovedNativeHost:
    """개선된 Native Host - Firefox Manager 사용"""
    
    def __init__(self):
        # Backend URL 설정
        self.backend_url = os.environ.get('ARGOSA_BACKEND_URL', 'http://localhost:8000/api/argosa/data')
        self.session: Optional[aiohttp.ClientSession] = None
        self.running = True
        self.pending_commands = []
        
        # 로그인 탭 추적기
        self.login_tab_tracker = LoginTabTracker()
        
        # Firefox Manager 이벤트 리스너 등록
        if firefox_manager and FirefoxEvent:
            firefox_manager.add_event_listener(FirefoxEvent.CRASHED, self.handle_firefox_crashed)
            firefox_manager.add_event_listener(FirefoxEvent.STOPPED, self.handle_firefox_stopped)
            logger.info("Registered Firefox event listeners")
        
        # 비동기 stdin 읽기를 위한 큐와 쓰레드
        self.stdin_queue = Queue()
        self.stdin_thread = None
        
        logger.info(f"ImprovedNativeHost initialized with backend URL: {self.backend_url}")
    
    def _stdin_reader_thread(self):
        """별도 쓰레드에서 stdin 읽기"""
        logger.info("[NativeHost] Stdin reader thread started")
        message_count = 0
        try:
            while self.running:
                try:
                    # 메시지 길이 읽기 (4바이트)
                    length_bytes = sys.stdin.buffer.read(4)
                    if not length_bytes:
                        logger.warning("[NativeHost] Empty read from stdin - connection closed")
                        break
                    
                    if len(length_bytes) != 4:
                        logger.error(f"Invalid length bytes: got {len(length_bytes)}, expected 4")
                        break
                    
                    # 메시지 길이 파싱
                    message_length = struct.unpack('I', length_bytes)[0]
                    
                    # 메시지 길이 검증
                    if message_length > 1024 * 1024:  # 1MB 제한
                        logger.error(f"Message too large: {message_length} bytes")
                        break
                    
                    # 메시지 본문 읽기
                    message_bytes = sys.stdin.buffer.read(message_length)
                    if not message_bytes or len(message_bytes) != message_length:
                        logger.error(f"Incomplete message: got {len(message_bytes) if message_bytes else 0}, expected {message_length}")
                        break
                    
                    # 큐에 메시지 추가
                    message_count += 1
                    if message_count % 10 == 0:
                        logger.debug(f"[NativeHost] Processed {message_count} messages from extension")
                    self.stdin_queue.put(message_bytes)
                    
                except Exception as e:
                    logger.error(f"Error in stdin reader thread: {e}")
                    break
        except Exception as e:
            logger.error(f"Stdin reader thread crashed: {e}")
        finally:
            # 종료 신호
            self.stdin_queue.put(None)
            logger.info("Stdin reader thread stopped")
    
    async def initialize_session(self):
        """HTTP 세션 초기화"""
        if not self.session:
            self.session = aiohttp.ClientSession()
            logger.info("HTTP session initialized")
    
    async def handle_firefox_crashed(self, event: FirefoxEvent, data: Dict[str, Any]):
        """Firefox 크래시 이벤트 처리"""
        await self._handle_firefox_closed('crashed')
    
    async def handle_firefox_stopped(self, event: FirefoxEvent, data: Dict[str, Any]):
        """Firefox 정상 종료 이벤트 처리"""
        await self._handle_firefox_closed('stopped')
    
    async def _handle_firefox_closed(self, reason: str):
        """Firefox 종료 처리"""
        logger.info(f"Firefox closed: {reason}")
        
        # 로그인 대기 중인 모든 플랫폼에 대해 알림
        platforms = self.login_tab_tracker.get_all_platforms()
        for platform in platforms:
            logger.info(f"Notifying backend that Firefox closed for {platform}")
            # Backend에 알림
            await self.notify_backend('native/message', {
                'type': 'session_update',
                'id': f'firefox_closed_{platform}_{datetime.now().timestamp()}',
                'data': {
                    'platform': platform,
                    'valid': False,
                    'source': 'firefox_closed',
                    'error': 'Firefox was closed',
                    'status': 'firefox_closed'
                }
            })
        
        # 모든 추적 중인 탭 제거
        self.login_tab_tracker.clear_all()
    
    async def send_to_extension(self, message: Dict[str, Any]):
        """Extension으로 메시지 전송"""
        try:
            encoded = self.encode_message(message)
            sys.stdout.buffer.write(encoded)
            sys.stdout.buffer.flush()
            logger.debug(f"Sent to extension: {message.get('type')}")
        except Exception as e:
            logger.error(f"Failed to send message to extension: {e}")
    
    def encode_message(self, message: Dict[str, Any]) -> bytes:
        """메시지 인코딩"""
        encoded = json.dumps(message).encode('utf-8')
        length_bytes = struct.pack('I', len(encoded))
        return length_bytes + encoded
    
    async def handle_extension_message(self, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extension 메시지 처리"""
        msg_type = message.get('type', 'unknown')
        msg_id = message.get('id', 'no-id')
        data = message.get('data', {})
        
        # heartbeat 제거됨 - 이벤트 기반으로 변경
        if msg_type == 'heartbeat':
            logger.debug(f"Heartbeat ignored (event-based system): {data.get('timestamp')}")
            return None
        
        # Keep-alive ping 처리
        if msg_type == 'ping':
            # Ping은 연결 유지용이므로 간단히 pong 응답
            return {
                'type': 'pong',
                'id': msg_id,
                'timestamp': datetime.now().isoformat()
            }
        
        logger.info(f"Handling extension message: type={msg_type}, id={msg_id}")
        
        try:
            if msg_type == 'init':
                logger.info(f"🔥🔥🔥 [NativeHost] Extension INIT received at {datetime.now().isoformat()} 🔥🔥🔥")
                # Firefox Manager가 모니터링을 담당하므로 여기서는 하지 않음
                # 백엔드에 연결 상태 즉시 알림
                await self.notify_backend('native/message', {
                    'type': 'init',
                    'id': msg_id,
                    'data': {
                        'status': 'connected',
                        'extension_connected': True,
                        'timestamp': datetime.now().isoformat()
                    }
                })
                
                return {
                    'type': 'init_response',
                    'id': msg_id,
                    'status': 'ready',
                    'capabilities': ['collect', 'llm_query', 'session_check', 'open_login_page']
                }
            
            elif msg_type == 'init_ack':
                # Extension이 init_response를 받았다는 확인
                logger.info(f"🔥🔥🔥 [NativeHost] Extension acknowledged initialization at {datetime.now().isoformat()} 🔥🔥🔥")
                # 백엔드에 완전 연결 상태 알림
                await self.notify_backend('native/status', {
                    'status': 'fully_connected',
                    'extension_ready': True,
                    'native_ready': True,
                    'timestamp': datetime.now().isoformat()
                })
                return None
            
            elif msg_type == 'session_update':
                # 세션 업데이트
                platform = data.get('platform')
                source = data.get('source')
                
                # 로그인 성공이면 추적 중지
                if data.get('valid') and source == 'login_detection':
                    self.login_tab_tracker.remove_login_tab(platform)
                
                # 탭이 닫히거나 Firefox가 종료된 경우도 추적 중지
                elif source in ['tab_closed', 'firefox_closed']:
                    self.login_tab_tracker.remove_login_tab(platform)
                
                # 백엔드로 전달
                await self.notify_backend('native/message', {
                    'type': 'session_update',
                    'id': msg_id,
                    'data': data
                })
                
                return None
            
            elif msg_type in ['collection_result', 'llm_query_result', 'session_check_result', 'error']:
                # 이런 메시지들은 바로 백엔드로 전달
                await self.notify_backend('native/message', message)
                return None
                
            else:
                # 기타 메시지는 백엔드로 전달
                logger.warning(f"Unknown message type from extension: {msg_type}")
                await self.notify_backend('native/message', message)
                return None
                
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            logger.error(traceback.format_exc())
            return {
                'type': 'error',
                'id': msg_id,
                'error': str(e)
            }
    
    async def notify_backend(self, endpoint: str, data: Dict[str, Any]):
        """백엔드에 알림"""
        try:
            if not self.session:
                await self.initialize_session()
            
            url = f"{self.backend_url}/{endpoint}"
            
            async with self.session.post(url, json=data) as response:
                if response.status == 200:
                    logger.debug(f"Backend notified successfully: {endpoint}")
                else:
                    logger.error(f"Backend notification failed: {response.status}")
                    
        except Exception as e:
            logger.error(f"Failed to notify backend: {e}")
    
    async def poll_backend_commands(self):
        """백엔드 명령 polling"""
        poll_count = 0
        while self.running:
            try:
                poll_count += 1
                if poll_count % 12 == 0:  # 매 분마다 로그 (5초 * 12 = 60초)
                    logger.debug(f"[NativeHost] Polling iteration #{poll_count}")
                
                if not self.session:
                    await self.initialize_session()
                
                # 백엔드에서 대기 중인 명령 가져오기
                url = f"{self.backend_url}/commands/pending"
                async with self.session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        commands = data.get('commands', [])
                        
                        for cmd in commands:
                            # Extension으로 전달
                            await self.send_to_extension({
                                'type': 'command',
                                'id': cmd.get('id'),
                                'command': cmd.get('type'),
                                'data': cmd.get('data', {})
                            })
                            
                            # 백엔드에 완료 알림
                            complete_url = f"{self.backend_url}/commands/complete/{cmd.get('id')}"
                            await self.session.post(complete_url, json={'status': 'sent'})
                
            except Exception as e:
                logger.error(f"Polling error: {e}")
            
            # 5초마다 polling
            await asyncio.sleep(5)
    
    async def handle_stdin_message(self, raw_message: bytes):
        """STDIN 메시지 처리"""
        try:
            message = json.loads(raw_message)
            
            # Extension 메시지 처리
            response = await self.handle_extension_message(message)
            
            # 응답이 있으면 Extension으로 전송
            if response:
                await self.send_to_extension(response)
                
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode message: {e}")
            logger.error(f"Raw message: {raw_message[:100]}...")
        except Exception as e:
            logger.error(f"Error handling stdin message: {e}")
            logger.error(traceback.format_exc())
    
    async def run(self):
        """메인 실행 루프 - 비동기 방식"""
        logger.info("Native host started")
        
        # HTTP 세션 초기화
        await self.initialize_session()
        
        # stdin 읽기 쓰레드 시작
        self.stdin_thread = threading.Thread(target=self._stdin_reader_thread, daemon=True)
        self.stdin_thread.start()
        logger.info("Stdin reader thread started")
        
        # Backend polling 시작
        polling_task = asyncio.create_task(self.poll_backend_commands())
        
        try:
            while self.running:
                try:
                    # 비동기적으로 큐에서 메시지 확인
                    await asyncio.sleep(0.1)  # CPU 사용률 조절
                    
                    # 큐에서 메시지 가져오기 (비블로킹)
                    try:
                        # 큐가 비어있으면 None 반환
                        message_bytes = None
                        if not self.stdin_queue.empty():
                            message_bytes = self.stdin_queue.get_nowait()
                        
                        # 메시지가 없으면 계속 대기
                        if message_bytes is None:
                            continue
                        
                        # 종료 신호 확인 (stdin 쓰레드에서 None을 보냄)
                        # 실제로는 stdin_reader_thread에서 self.stdin_queue.put(None)을 호출
                        # 하지만 여기서는 빈 큐를 체크하므로 이 조건은 실행되지 않음
                        
                        # 메시지 처리
                        await self.handle_stdin_message(message_bytes)
                        
                    except Exception as e:
                        logger.error(f"Error processing message from queue: {e}")
                        logger.error(traceback.format_exc())
                        # 계속 실행
                        continue
                        
                except Exception as e:
                    logger.error(f"Error in main loop: {e}")
                    logger.error(traceback.format_exc())
                    await asyncio.sleep(1)  # 오류 후 잠시 대기
                    
        except KeyboardInterrupt:
            logger.info("Native host interrupted")
        finally:
            # 정리 작업
            self.running = False
            
            # 쓰레드 종료 대기
            if self.stdin_thread and self.stdin_thread.is_alive():
                logger.info("Waiting for stdin thread to finish...")
                self.stdin_thread.join(timeout=2)
            
            # 태스크 정리
            polling_task.cancel()
            try:
                await polling_task
            except asyncio.CancelledError:
                pass
            
            if self.session:
                await self.session.close()
            
            logger.info("Native host stopped")

# 메인 실행
if __name__ == "__main__":
    # 로그 시작 메시지
    logger.info("=" * 50)
    logger.info("Native Host Starting...")
    logger.info(f"Python version: {sys.version}")
    logger.info(f"Log path: {log_path}")
    
    # 비동기 실행
    native_host = ImprovedNativeHost()
    asyncio.run(native_host.run())