# native_host_improved.py - Firefox 프로세스 모니터링 포함
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
import psutil
import threading

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

class FirefoxMonitor:
    """Firefox 프로세스 모니터링"""
    
    def __init__(self, callback):
        self.callback = callback
        self.monitoring = False
        self.firefox_pids: Set[int] = set()
        self.login_tabs: Dict[str, Dict[str, Any]] = {}  # platform -> {tab_id, start_time}
        self._monitor_thread = None
        # Firefox 모니터링 자동 시작
        self.start_monitoring()
        
    def start_monitoring(self):
        """모니터링 시작"""
        if not self.monitoring:
            self.monitoring = True
            self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
            self._monitor_thread.start()
            logger.info("Firefox monitoring started")
    
    def stop_monitoring(self):
        """모니터링 중지"""
        self.monitoring = False
        if self._monitor_thread:
            self._monitor_thread.join(timeout=2)
        logger.info("Firefox monitoring stopped")
    
    def _monitor_loop(self):
        """Firefox 프로세스 모니터링 루프"""
        while self.monitoring:
            try:
                # 현재 Firefox 프로세스들 찾기
                current_pids = set()
                for proc in psutil.process_iter(['pid', 'name']):
                    if proc.info['name'] and 'firefox' in proc.info['name'].lower():
                        current_pids.add(proc.info['pid'])
                
                # 종료된 프로세스 감지
                closed_pids = self.firefox_pids - current_pids
                if closed_pids and len(current_pids) == 0:  # Firefox가 완전히 종료됨
                    logger.info(f"Firefox completely closed (was tracking: {closed_pids})")
                    # Firefox가 종료되면 모든 로그인 대기 중인 플랫폼에 대해 알림
                    try:
                        # 새로운 이벤트 루프에서 실행
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        loop.run_until_complete(self._handle_firefox_closed())
                        loop.close()
                    except Exception as e:
                        logger.error(f"Error handling Firefox closed: {e}")
                
                # 새로운 프로세스 감지
                new_pids = current_pids - self.firefox_pids
                if new_pids:
                    logger.info(f"New Firefox processes: {new_pids}")
                
                self.firefox_pids = current_pids
                
            except Exception as e:
                logger.error(f"Monitor loop error: {e}")
            
            # 1초마다 체크
            import time
            time.sleep(1)
    
    async def _handle_firefox_closed(self):
        """Firefox 종료 처리"""
        logger.info(f"Handling Firefox closed event. Login tabs: {list(self.login_tabs.keys())}")
        
        # 로그인 대기 중인 플랫폼에 대해 알림
        for platform, info in list(self.login_tabs.items()):
            logger.info(f"Sending firefox_closed event for {platform}")
            await self.callback('firefox_closed', {
                'platform': platform,
                'error': 'Firefox was closed',
                'source': 'firefox_monitor'
            })
        self.login_tabs.clear()
        
        # Firefox 종료 자체도 백엔드에 알림
        logger.info("Notifying backend that Firefox completely closed")
        await self.callback('firefox_closed', {
            'firefox_status': 'closed',
            'extension_status': 'disconnected',
            'source': 'firefox_monitor'
        })
    
    def add_login_tab(self, platform: str, tab_info: Dict[str, Any]):
        """로그인 탭 추가"""
        self.login_tabs[platform] = {
            **tab_info,
            'start_time': datetime.now()
        }
        logger.info(f"Tracking login tab for {platform}")
    
    def remove_login_tab(self, platform: str):
        """로그인 탭 제거"""
        if platform in self.login_tabs:
            del self.login_tabs[platform]
            logger.info(f"Stopped tracking login tab for {platform}")

class ImprovedNativeHost:
    """개선된 Native Host - Firefox 모니터링 포함"""
    
    def __init__(self):
        self.backend_url = "http://localhost:8000/api/argosa"
        self.session: Optional[aiohttp.ClientSession] = None
        self.running = True
        self.pending_commands = []
        
        # Firefox 모니터
        self.firefox_monitor = FirefoxMonitor(self.handle_firefox_event)
        
        logger.info("ImprovedNativeHost initialized")
    
    async def initialize_session(self):
        """HTTP 세션 초기화"""
        if not self.session:
            self.session = aiohttp.ClientSession()
            logger.info("HTTP session initialized")
    
    async def handle_firefox_event(self, event_type: str, data: Dict[str, Any]):
        """Firefox 이벤트 처리"""
        logger.info(f"Firefox event: {event_type}, data: {data}")
        
        if event_type == 'firefox_closed':
            platform = data.get('platform')
            if platform:
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
    
    async def send_to_extension(self, message: Dict[str, Any]):
        """Extension으로 메시지 전송"""
        try:
            encoded = self.encode_message(message)
            sys.stdout.buffer.write(encoded)
            sys.stdout.buffer.flush()
            logger.info(f"Sent to extension: {message.get('type')} (size: {len(encoded)})")
            logger.debug(f"Full message: {message}")
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            logger.error(traceback.format_exc())
    
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
        
        # heartbeat는 DEBUG 레벨로만 로깅
        if msg_type == 'heartbeat':
            logger.debug(f"Heartbeat received: {data.get('timestamp')}")
            await self.notify_backend('native/message', message)
            return None
        
        logger.info(f"Handling extension message: type={msg_type}, id={msg_id}")
        
        try:
            if msg_type == 'init':
                # Firefox 모니터링 시작
                self.firefox_monitor.start_monitoring()
                
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
                logger.info("Extension acknowledged initialization")
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
                    self.firefox_monitor.remove_login_tab(platform)
                
                # 탭이 닫히거나 Firefox가 종료된 경우도 추적 중지
                elif source in ['tab_closed', 'firefox_closed']:
                    self.firefox_monitor.remove_login_tab(platform)
                
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
            
            url = f"{self.backend_url}/data/{endpoint}"
            
            async with self.session.post(url, json=data, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status != 200:
                    logger.error(f"Backend notification failed: {response.status}")
                else:
                    logger.debug(f"Backend notified: {endpoint}")
        except Exception as e:
            logger.error(f"Failed to notify backend: {e}")
    
    async def command_polling_loop(self):
        """백엔드 명령 폴링"""
        logger.info("Starting command polling loop")
        
        while self.running:
            try:
                if not self.session:
                    await self.initialize_session()
                
                # 명령 가져오기
                url = f"{self.backend_url}/data/commands/pending"
                async with self.session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                    if response.status == 200:
                        data = await response.json()
                        commands = data.get('commands', [])
                        
                        # 명령이 있을 때만 로그
                        if commands:
                            logger.info(f"Got {len(commands)} pending commands")
                            for cmd in commands:
                                await self.process_backend_command(cmd)
                
                await asyncio.sleep(2)
                
            except asyncio.TimeoutError:
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Command polling error: {e}")
                await asyncio.sleep(5)
    
    async def process_backend_command(self, command: Dict[str, Any]):
        """백엔드 명령 처리"""
        command_type = command.get('type')
        command_id = command.get('id')
        data = command.get('data', {})
        
        logger.info(f"Processing command: {command_type}")
        
        # 플랫폼 URL 매핑
        platform_urls = {
            'chatgpt': 'https://chat.openai.com',
            'claude': 'https://claude.ai',
            'gemini': 'https://gemini.google.com',
            'deepseek': 'https://chat.deepseek.com',
            'grok': 'https://grok.x.ai',
            'perplexity': 'https://www.perplexity.ai'
        }
        
        if command_type == 'open_login_page':
            platform = data.get('platform')
            command_id = data.get('command_id')
            url = platform_urls.get(platform)
            
            if platform and url:
                logger.info(f"Opening login page for {platform}: {url}")
                # 로그인 탭 추적 시작
                self.firefox_monitor.add_login_tab(platform, {
                    'command_id': command_id,
                    'url': url,
                    'timestamp': datetime.now().isoformat()
                })
                
                # Extension으로 전달 (URL 포함)
                await self.send_to_extension({
                    'type': command_type,
                    'id': command_id,
                    'data': {
                        **data,
                        'url': url  # URL 추가
                    }
                })
        else:
            # Extension으로 전달
            await self.send_to_extension({
                'type': command_type,
                'id': command_id,
                'data': data
            })
        
        # 명령 전송 완료 알림
        complete_url = f"{self.backend_url}/data/commands/complete/{command_id}"
        try:
            await self.session.post(complete_url, json={'status': 'sent'})
        except Exception as e:
            logger.error(f"Failed to mark command complete: {e}")
    
    async def read_stdin(self):
        """stdin에서 메시지 읽기"""
        logger.info("Starting stdin reader...")
        
        # 동기 방식으로 읽기 (Windows에서 더 안정적)
        def read_stdin_sync():
            buffer = b''
            
            while self.running:
                try:
                    # 4바이트 길이 헤더 읽기
                    while len(buffer) < 4:
                        chunk = sys.stdin.buffer.read(1)
                        if not chunk:
                            logger.info("Extension disconnected - no data")
                            return None
                        buffer += chunk
                    
                    # 메시지 길이 추출
                    message_length = struct.unpack('I', buffer[:4])[0]
                    
                    # heartbeat가 아닌 경우만 길이 로깅
                    if message_length != 261:  # heartbeat는 보통 261 바이트
                        logger.debug(f"Message length: {message_length}")
                    
                    # 메시지 본문 읽기
                    buffer = b''
                    while len(buffer) < message_length:
                        remaining = message_length - len(buffer)
                        chunk = sys.stdin.buffer.read(remaining)
                        if not chunk:
                            logger.error("Extension disconnected while reading message")
                            return None
                        buffer += chunk
                    
                    # 메시지 디코드
                    try:
                        message = json.loads(buffer.decode('utf-8'))
                        
                        # heartbeat가 아닌 경우만 전체 메시지 로깅
                        if message.get('type') != 'heartbeat':
                            logger.info(f"Received from extension: {message}")
                        
                        return message
                    except Exception as e:
                        logger.error(f"Failed to decode message: {e}")
                        logger.error(f"Raw data: {buffer}")
                        continue
                        
                except Exception as e:
                    logger.error(f"Error in read_stdin_sync: {e}")
                    logger.error(traceback.format_exc())
                    return None
        
        # 비동기로 실행
        try:
            while self.running:
                message = await asyncio.get_event_loop().run_in_executor(
                    None, read_stdin_sync
                )
                
                if message is None:
                    logger.info("Stdin reader stopping - no message")
                    self.running = False
                    break
                
                # 메시지 처리
                try:
                    response = await self.handle_extension_message(message)
                    if response:
                        await self.send_to_extension(response)
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    logger.error(traceback.format_exc())
                    
        except Exception as e:
            logger.error(f"Fatal error in read_stdin: {e}")
            logger.error(traceback.format_exc())
            self.running = False
        
        logger.info("Stdin reader stopped")
    
    async def run(self):
        """메인 실행"""
        logger.info("Starting main loop...")
        
        try:
            await self.initialize_session()
            
            # 태스크 실행
            stdin_task = asyncio.create_task(self.read_stdin())
            polling_task = asyncio.create_task(self.command_polling_loop())
            
            logger.info("Tasks created - waiting for stdin and command polling")
            
            await asyncio.gather(stdin_task, polling_task)
            
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Fatal error: {e}")
            logger.error(traceback.format_exc())
        finally:
            logger.info("Shutting down...")
            self.running = False
            
            # Firefox 모니터링 중지
            self.firefox_monitor.stop_monitoring()
            
            # 연결 해제 알림
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
    logger.info("=== Native Host Starting (Improved Version) ===")
    
    try:
        host = ImprovedNativeHost()
        asyncio.run(host.run())
    except Exception as e:
        logger.error(f"Fatal error in main: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()