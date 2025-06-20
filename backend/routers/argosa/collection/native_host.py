# native_host_improved.py - Firefox 프로세스 모니터링 포함
import sys
import json
import struct
import asyncio
import logging
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

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_path, mode='a', encoding='utf-8'),
    ]
)

logger = logging.getLogger(__name__)

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
        
        for platform, info in list(self.login_tabs.items()):
            logger.info(f"Sending firefox_closed event for {platform}")
            await self.callback('firefox_closed', {
                'platform': platform,
                'error': 'Firefox was closed',
                'source': 'firefox_monitor'
            })
        self.login_tabs.clear()
    
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
            logger.info(f"Sent to extension: {message.get('type')}")
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
    
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
        
        logger.info(f"Handling extension message: type={msg_type}, id={msg_id}")
        
        try:
            if msg_type == 'init':
                # Firefox 모니터링 시작
                self.firefox_monitor.start_monitoring()
                
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
                # 하트비트 처리
                await self.notify_backend('native/status', {
                    'status': 'alive',
                    'timestamp': datetime.now().isoformat(),
                    'sessions': data.get('sessions', {}),
                    'firefox_running': len(self.firefox_monitor.firefox_pids) > 0
                })
                
                return {
                    'type': 'heartbeat_ack',
                    'id': msg_id,
                    'timestamp': datetime.now().isoformat()
                }
            
            elif msg_type == 'session_update':
                # 세션 업데이트
                platform = data.get('platform')
                source = data.get('source')
                
                # 로그인 성공이면 추적 중지
                if data.get('valid') and source == 'login_detection':
                    self.firefox_monitor.remove_login_tab(platform)
                
                # 백엔드로 전달
                await self.notify_backend('native/message', {
                    'type': 'session_update',
                    'id': msg_id,
                    'data': data
                })
                
                return None
            
            else:
                # 기타 메시지는 백엔드로 전달
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
        buffer = b''
        
        while self.running:
            try:
                chunk = await asyncio.get_event_loop().run_in_executor(
                    None, 
                    lambda: sys.stdin.buffer.read(1024)
                )
                
                if not chunk:
                    logger.info("Extension disconnected")
                    self.running = False
                    break
                
                buffer += chunk
                
                # 메시지 처리
                while len(buffer) >= 4:
                    message_length = struct.unpack('I', buffer[:4])[0]
                    
                    if len(buffer) >= 4 + message_length:
                        message_data = buffer[4:4 + message_length]
                        buffer = buffer[4 + message_length:]
                        
                        try:
                            message = json.loads(message_data.decode('utf-8'))
                            response = await self.handle_extension_message(message)
                            if response:
                                await self.send_to_extension(response)
                        except Exception as e:
                            logger.error(f"Failed to process message: {e}")
                    else:
                        break
                        
            except Exception as e:
                logger.error(f"Error reading stdin: {e}")
                self.running = False
                break
    
    async def run(self):
        """메인 실행"""
        logger.info("Starting main loop...")
        
        try:
            await self.initialize_session()
            
            # 태스크 실행
            tasks = [
                asyncio.create_task(self.read_stdin()),
                asyncio.create_task(self.command_polling_loop())
            ]
            
            await asyncio.gather(*tasks)
            
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