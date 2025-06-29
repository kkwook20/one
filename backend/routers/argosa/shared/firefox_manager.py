# backend/routers/argosa/shared/firefox_manager.py
"""
독립적인 Firefox Manager - 여러 모듈에서 공유 사용
Firefox 브라우저 인스턴스를 관리하고 상태를 추적
WebSocket 서버, Native Messaging, 상태 관리 모두 포함
"""

import os
import sys
import asyncio
import subprocess
import platform
import json
import logging
import psutil
import time
from typing import Optional, Dict, Any, List, Callable, Tuple, Set
from datetime import datetime, timedelta
from pathlib import Path
import aiofiles
from enum import Enum
from fastapi import WebSocket, WebSocketDisconnect
import uuid

logger = logging.getLogger(__name__)

class FirefoxStatus(Enum):
    """Firefox 상태"""
    CLOSED = "closed"
    STARTING = "starting"
    READY = "ready"
    ERROR = "error"
    TERMINATING = "terminating"

class FirefoxEvent(Enum):
    """Firefox 이벤트 타입"""
    STARTED = "started"
    STOPPED = "stopped"
    CRASHED = "crashed"
    READY = "ready"
    ERROR = "error"

class FirefoxManager:
    """
    Firefox 브라우저를 관리하는 독립적인 매니저
    - 프로세스 생명주기 관리
    - 상태 추적 및 이벤트 발생
    - 프로필 관리
    - 자동 재시작
    - WebSocket 서버 및 상태 브로드캐스트
    - Native Messaging 통신
    """
    
    def __init__(self):
        # 프로세스 관련
        self._process: Optional[subprocess.Popen] = None
        self._pid: Optional[int] = None
        self._status: FirefoxStatus = FirefoxStatus.CLOSED
        
        # 경로 설정
        self.profile_path = Path("F:/ONE_AI/firefox-profile")
        self.extension_path = Path("F:/ONE_AI/firefox_util/llm-collector")
        
        # 실행 파일 경로 (Windows)
        self.firefox_paths = [
            r"C:\Program Files\Firefox Developer Edition\firefox.exe",
        ]
        
        # 상태 관리
        self._start_time: Optional[datetime] = None
        self._stop_time: Optional[datetime] = None
        self._crash_count: int = 0
        self._manual_stop: bool = False  # 수동으로 종료했는지 추적
        
        # 시스템 상태 (전체 시스템 상태 관리)
        self._system_state = {
            "system_status": "idle",  # idle, ready, collecting, error
            "firefox_status": "closed",  # closed, ready, error
            "extension_status": "disconnected",  # connected, disconnected
            "extension_last_seen": None,
            "sessions": {},  # 각 플랫폼별 세션 상태
            "data_sources_active": 0,
            "total_conversations": 0
        }
        
        # WebSocket 연결 관리
        self._active_websockets: Set[WebSocket] = set()
        
        # Native Messaging
        self._pending_commands: Dict[str, asyncio.Future] = {}
        self._command_lock = asyncio.Lock()
        
        # 설정
        self._auto_restart: bool = True
        self._startup_timeout: int = 30  # seconds
        
        # 이벤트 리스너
        self._event_listeners: Dict[FirefoxEvent, List[Callable]] = {
            event: [] for event in FirefoxEvent
        }
        
        # 브로드캐스트 중복 방지
        self._last_broadcast_state = {}  # 마지막 브로드캐스트 상태
        
        # 동기화
        self._lock = asyncio.Lock()
        self._monitor_task: Optional[asyncio.Task] = None
        # Extension timeout task 제거됨 - 이벤트 기반으로 변경
        
        logger.debug("[FirefoxManager] Initialized")
    
    def get_status(self) -> FirefoxStatus:
        """현재 Firefox 상태 반환"""
        return self._status
    
    def is_running(self) -> bool:
        """Firefox가 실행 중인지 확인"""
        return self._status in [FirefoxStatus.READY, FirefoxStatus.STARTING]
    
    def add_event_listener(self, event: FirefoxEvent, callback: Callable):
        """이벤트 리스너 추가"""
        self._event_listeners[event].append(callback)
        logger.debug(f"[FirefoxManager] Added listener for {event.value}")
    
    async def _emit_event(self, event: FirefoxEvent, data: Optional[Dict[str, Any]] = None):
        """이벤트 발생"""
        logger.debug(f"[FirefoxManager] Event: {event.value}")
        
        for listener in self._event_listeners[event]:
            try:
                if asyncio.iscoroutinefunction(listener):
                    await listener(event, data or {})
                else:
                    listener(event, data or {})
            except Exception as e:
                logger.error(f"[FirefoxManager] Event listener error: {e}")
    
    def _find_firefox_executable(self) -> Optional[str]:
        """Firefox 실행 파일 찾기"""
        for path in self.firefox_paths:
            if os.path.exists(path):
                logger.debug(f"[FirefoxManager] Found Firefox")
                return path
        
        # PATH에서 찾기
        try:
            result = subprocess.run(["where", "firefox"], capture_output=True, text=True)
            if result.returncode == 0 and result.stdout.strip():
                path = result.stdout.strip().split('\n')[0]
                logger.debug(f"[FirefoxManager] Found Firefox in PATH")
                return path
        except:
            pass
        
        logger.error("[FirefoxManager] Firefox executable not found")
        return None
    
    async def _prepare_profile(self):
        """프로필 준비"""
        try:
            # 프로필 디렉토리 생성
            self.profile_path.mkdir(parents=True, exist_ok=True)
            
            # 잠금 파일 제거
            for lock_file in ['parent.lock', 'lock', '.parentlock']:
                lock_path = self.profile_path / lock_file
                if lock_path.exists():
                    try:
                        lock_path.unlink()
                        logger.debug(f"[FirefoxManager] Removed lock file: {lock_file}")
                    except:
                        pass
            
            # 기본 설정 작성
            prefs_content = """
user_pref("browser.startup.homepage", "about:blank");
user_pref("browser.startup.page", 0);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.tabs.warnOnCloseOtherTabs", false);
user_pref("browser.sessionstore.warnOnQuit", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("toolkit.telemetry.enabled", false);
user_pref("toolkit.telemetry.unified", false);
user_pref("app.update.enabled", false);
user_pref("app.update.auto", false);
user_pref("extensions.update.enabled", false);
user_pref("extensions.update.autoUpdateDefault", false);
"""
            
            prefs_path = self.profile_path / "prefs.js"
            async with aiofiles.open(prefs_path, 'w') as f:
                await f.write(prefs_content.strip())
            
            logger.debug("[FirefoxManager] Profile prepared")
            
        except Exception as e:
            logger.error(f"[FirefoxManager] Failed to prepare profile: {e}")
            raise
    
    async def _find_existing_firefox(self) -> Optional[int]:
        """우리 프로필을 사용하는 기존 Firefox 찾기"""
        try:
            profile_str = str(self.profile_path).lower()
            
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    info = proc.info
                    if not info['name'] or 'firefox' not in info['name'].lower():
                        continue
                    
                    cmdline = info.get('cmdline', [])
                    if not cmdline:
                        continue
                    
                    # 명령줄에서 프로필 경로 확인
                    cmdline_str = ' '.join(str(arg).lower() for arg in cmdline)
                    if profile_str in cmdline_str or 'firefox-profile' in cmdline_str:
                        pid = info['pid']
                        logger.debug(f"[FirefoxManager] Found existing Firefox (PID: {pid})")
                        return pid
                
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        
        except Exception as e:
            logger.error(f"[FirefoxManager] Error finding existing Firefox: {e}")
        
        return None
    
    async def start(self) -> bool:
        """Firefox 시작"""
        async with self._lock:
            try:
                # 이미 실행 중인지 확인
                if self._status == FirefoxStatus.READY:
                    logger.debug("[FirefoxManager] Firefox already running")
                    return True
                
                if self._status == FirefoxStatus.STARTING:
                    logger.debug("[FirefoxManager] Firefox already starting")
                    return False
                
                # 기존 Firefox 확인
                existing_pid = await self._find_existing_firefox()
                if existing_pid:
                    self._pid = existing_pid
                    self._status = FirefoxStatus.READY
                    self._start_time = datetime.now()
                    self._manual_stop = False
                    
                    await self._emit_event(FirefoxEvent.READY, {
                        "pid": self._pid,
                        "reused": True
                    })
                    
                    # Firefox 상태만 업데이트
                    await self.update_state("firefox_status", "ready")
                    
                    # 모니터링 시작
                    await self._start_monitoring()
                    return True
                
                # Firefox 실행 파일 찾기
                firefox_exe = self._find_firefox_executable()
                if not firefox_exe:
                    self._status = FirefoxStatus.ERROR
                    await self._emit_event(FirefoxEvent.ERROR, {
                        "error": "Firefox executable not found"
                    })
                    return False
                
                # 프로필 준비
                await self._prepare_profile()
                
                # Firefox 시작
                cmd = [
                    firefox_exe,
                    "-profile", str(self.profile_path),
                    "--new-window", "about:blank"
                ]
                
                logger.debug("[FirefoxManager] Starting Firefox")
                
                # Windows에서 콘솔 창 숨기기
                startupinfo = None
                if platform.system() == 'Windows':
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    startupinfo.wShowWindow = subprocess.SW_HIDE
                
                self._process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    startupinfo=startupinfo
                )
                
                # 시작 대기
                await asyncio.sleep(2)
                
                # 프로세스 상태 확인
                if self._process.poll() is None:
                    # 프로세스가 실행 중
                    self._pid = self._process.pid
                    self._status = FirefoxStatus.READY
                    self._start_time = datetime.now()
                    self._manual_stop = False
                    
                    logger.debug(f"[FirefoxManager] Firefox started (PID: {self._pid})")
                    
                    await self._emit_event(FirefoxEvent.STARTED, {
                        "pid": self._pid
                    })
                    
                    # Firefox 상태만 업데이트
                    await self.update_state("firefox_status", "ready")
                    
                    # 준비 완료 이벤트
                    await asyncio.sleep(3)  # Firefox 완전 로드 대기
                    await self._emit_event(FirefoxEvent.READY, {
                        "pid": self._pid
                    })
                    
                    # 모니터링 시작
                    await self._start_monitoring()
                    
                    # Extension 설치 안내
                    self._print_extension_guide()
                    
                    return True
                
                else:
                    # Firefox가 즉시 종료됨
                    exit_code = self._process.poll()
                    error_msg = f"Firefox exited immediately with code: {exit_code}"
                    
                    # stderr 확인
                    if self._process.stderr:
                        stderr = self._process.stderr.read().decode('utf-8', errors='ignore')
                        if stderr:
                            error_msg += f"\nError: {stderr}"
                    
                    logger.error(f"[FirefoxManager] {error_msg}")
                    
                    self._status = FirefoxStatus.ERROR
                    self._process = None
                    self._pid = None
                    
                    await self._emit_event(FirefoxEvent.ERROR, {
                        "error": error_msg,
                        "exit_code": exit_code
                    })
                    
                    return False
                
            except Exception as e:
                logger.error(f"[FirefoxManager] Failed to start Firefox: {e}")
                self._status = FirefoxStatus.ERROR
                
                await self._emit_event(FirefoxEvent.ERROR, {
                    "error": str(e)
                })
                
                return False
    
    async def stop(self) -> bool:
        """Firefox 종료"""
        async with self._lock:
            try:
                if self._status == FirefoxStatus.CLOSED:
                    logger.debug("[FirefoxManager] Firefox not running")
                    return True
                
                logger.info("[FirefoxManager] Stopping Firefox...")
                self._status = FirefoxStatus.TERMINATING
                self._manual_stop = True  # 수동 종료 표시
                
                # 모니터링 중지
                if self._monitor_task and not self._monitor_task.done():
                    self._monitor_task.cancel()
                    try:
                        await self._monitor_task
                    except asyncio.CancelledError:
                        pass
                
                # 프로세스 종료
                terminated = False
                
                if self._pid:
                    try:
                        proc = psutil.Process(self._pid)
                        proc.terminate()
                        proc.wait(timeout=5)
                        terminated = True
                    except psutil.TimeoutExpired:
                        logger.warning("[FirefoxManager] Timeout, force killing")
                        proc.kill()
                        terminated = True
                    except psutil.NoSuchProcess:
                        terminated = True
                    except Exception as e:
                        logger.error(f"[FirefoxManager] Error terminating process: {e}")
                
                if self._process and not terminated:
                    try:
                        self._process.terminate()
                        self._process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        self._process.kill()
                    except:
                        pass
                
                # 상태 초기화
                self._process = None
                self._pid = None
                self._status = FirefoxStatus.CLOSED
                self._stop_time = datetime.now()
                
                logger.info("[FirefoxManager] Firefox stopped")
                
                await self._emit_event(FirefoxEvent.STOPPED, {
                    "uptime": (self._stop_time - self._start_time).total_seconds() if self._start_time else 0
                })
                
                return True
                
            except Exception as e:
                logger.error(f"[FirefoxManager] Failed to stop Firefox: {e}")
                return False
    
    async def restart(self) -> bool:
        """Firefox 재시작"""
        logger.info("[FirefoxManager] Restarting Firefox...")
        
        await self.stop()
        await asyncio.sleep(2)  # 완전 종료 대기
        
        return await self.start()
    
    async def _start_monitoring(self):
        """프로세스 모니터링 시작"""
        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()
        
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.debug("[FirefoxManager] Started monitoring")
    
    async def _monitor_loop(self):
        """프로세스 모니터링 루프"""
        try:
            logger.info("[FirefoxManager] Monitor loop started")
            loop_count = 0
            while self._status in [FirefoxStatus.READY, FirefoxStatus.STARTING]:
                loop_count += 1
                logger.debug(f"[FirefoxManager] Monitor loop iteration #{loop_count} - sleeping 30s")
                await asyncio.sleep(30)  # 30초마다 확인
                
                # 프로세스 상태 확인
                is_running = False
                
                if self._pid:
                    try:
                        proc = psutil.Process(self._pid)
                        is_running = proc.is_running()
                    except psutil.NoSuchProcess:
                        is_running = False
                
                if self._process and not is_running:
                    poll_result = self._process.poll()
                    is_running = poll_result is None
                
                if not is_running:
                    # 수동으로 종료한 경우는 재시작하지 않음
                    if self._manual_stop:
                        logger.info("[FirefoxManager] Firefox was manually stopped, not restarting")
                        break
                    
                    # 업타임이 짧으면 사용자가 의도적으로 종료한 것으로 간주
                    uptime_seconds = (datetime.now() - self._start_time).total_seconds() if self._start_time else 0
                    is_likely_manual_close = uptime_seconds < 10  # 10초 미만이면 의도적 종료로 간주
                    
                    if is_likely_manual_close:
                        logger.info(f"[FirefoxManager] Firefox closed quickly (uptime: {uptime_seconds:.1f}s), likely manual close - not restarting")
                        self._status = FirefoxStatus.CLOSED
                        self._process = None
                        self._pid = None
                        await self.update_state("firefox_status", "closed")
                        break
                    
                    logger.warning(f"[FirefoxManager] Firefox process terminated unexpectedly (uptime: {uptime_seconds:.1f}s)")
                    
                    self._crash_count += 1
                    self._status = FirefoxStatus.CLOSED
                    self._process = None
                    self._pid = None
                    
                    # Firefox 상태만 업데이트 - Extension 상태는 건드리지 않음
                    await self.update_state("firefox_status", "closed")
                    
                    # 충돌 정보 수집
                    crash_info = {
                        "crash_count": self._crash_count,
                        "uptime_seconds": uptime_seconds
                    }
                    
                    await self._emit_event(FirefoxEvent.CRASHED, crash_info)
                    
                    # 자동 재시작 - 더 지능적으로 판단
                    should_restart = (
                        self._auto_restart and 
                        self._crash_count < 3 and  # 3회 이상 크래시 시 중단
                        uptime_seconds > 30  # 30초 이상 실행된 경우만 재시작
                    )
                    
                    if should_restart:
                        logger.info(f"[FirefoxManager] Auto-restarting Firefox (crash #{self._crash_count})")
                        
                        # 점진적 대기 시간 (1차: 3초, 2차: 6초, 3차: 10초)
                        wait_time = min(3 + (self._crash_count * 3), 10)
                        await asyncio.sleep(wait_time)
                        
                        # 프로필 잠금 파일 정리
                        await self._prepare_profile()
                        
                        if await self.start():
                            logger.info("[FirefoxManager] Auto-restart successful")
                            # 모니터링은 start()에서 다시 시작됨
                        else:
                            logger.error("[FirefoxManager] Auto-restart failed")
                            await self._emit_event(FirefoxEvent.ERROR, {
                                "error": "Auto-restart failed",
                                "crash_count": self._crash_count
                            })
                    else:
                        if self._crash_count >= 3:
                            logger.warning("[FirefoxManager] Too many crashes, auto-restart disabled")
                        elif uptime_seconds <= 30:
                            logger.info("[FirefoxManager] Short uptime, likely manual close - not restarting")
                        else:
                            logger.info("[FirefoxManager] Auto-restart is disabled")
                    
                    break
        
        except asyncio.CancelledError:
            logger.debug("[FirefoxManager] Monitoring cancelled")
        except Exception as e:
            logger.error(f"[FirefoxManager] Monitoring error: {e}")
    
    def _print_extension_guide(self):
        """Extension 설치 가이드 출력"""
        logger.info("=" * 60)
        logger.info("[FirefoxManager] Extension Installation Guide:")
        logger.info("1. Open Firefox and press F12 for DevTools")
        logger.info("2. Navigate to: about:debugging#/runtime/this-firefox")
        logger.info("3. Click 'Load Temporary Add-on...'")
        logger.info(f"4. Browse to: {self.extension_path}")
        logger.info("5. Select: manifest.json")
        logger.info("6. The extension should appear in the extensions list")
        logger.info("=" * 60)
    
    async def get_info(self) -> Dict[str, Any]:
        """Firefox 정보 반환"""
        info = {
            "status": self._status.value,
            "pid": self._pid,
            "profile_path": str(self.profile_path),
            "extension_path": str(self.extension_path),
            "is_running": self.is_running(),
            "start_time": self._start_time.isoformat() if self._start_time else None,
            "uptime_seconds": (datetime.now() - self._start_time).total_seconds() if self._start_time and self.is_running() else 0,
            "crash_count": self._crash_count,
            "auto_restart": self._auto_restart,
            "manual_stop": self._manual_stop
        }
        
        # 메모리 및 CPU 사용량
        if self._pid and self.is_running():
            try:
                proc = psutil.Process(self._pid)
                info["memory_mb"] = proc.memory_info().rss / 1024 / 1024
                info["cpu_percent"] = proc.cpu_percent(interval=0.1)
            except:
                pass
        
        return info
    
    # ======================== State Management ========================
    
    async def update_state(self, key: str, value: Any):
        """시스템 상태 업데이트 - 간단한 버전"""
        async with self._lock:
            old_value = self._system_state.get(key)
            
            # 변경사항이 없으면 무시
            if old_value == value:
                return
            
            # 상태 업데이트
            self._system_state[key] = value
            logger.info(f"🔥 [FirefoxManager] State updated: {key}: {old_value} → {value}")
            
            # system_status 자동 계산
            if key in ["firefox_status", "extension_status"]:
                firefox_ready = self._system_state.get("firefox_status") == "ready"
                extension_connected = self._system_state.get("extension_status") == "connected"
                
                if firefox_ready and extension_connected:
                    new_system_status = "ready"
                else:
                    new_system_status = "idle"
                
                if self._system_state.get("system_status") != new_system_status:
                    self._system_state["system_status"] = new_system_status
                    logger.info(f"🔥 [FirefoxManager] System status updated: {new_system_status}")
            
        # 브로드캐스트는 락 밖에서
        await self.broadcast_state()
    
    
    # Extension 타임아웃 체커 제거됨 - 이벤트 기반으로 변경
    # Extension이 disconnect 이벤트를 명시적으로 보낼 때만 상태 변경
    
    async def broadcast_state(self, force: bool = False):
        """모든 WebSocket 클라이언트에 상태 브로드캐스트 - 중복 방지"""
        if not self._active_websockets:
            return
        
        state_data = self.get_system_state()
        
        # 마지막 브로드캐스트와 동일한 데이터인지 확인 (extension_last_seen 제외)
        state_for_comparison = {k: v for k, v in state_data.items() if k != "extension_last_seen"}
        
        # 상태가 변경되지 않았으면 브로드캐스트 하지 않음
        if not force and self._last_broadcast_state == state_for_comparison:
            logger.debug(f"[FirefoxManager] Skipping broadcast - no state change")
            return
        
        # Stack trace to find who's calling broadcast
        import traceback
        stack = traceback.extract_stack()
        caller = stack[-3] if len(stack) > 3 else None
        caller_info = f"{caller.filename}:{caller.lineno} in {caller.name}" if caller else "Unknown"
        
        logger.info(f"🔥🔥🔥 [FirefoxManager] BROADCASTING STATE: system={state_data.get('system_status')}, firefox={state_data.get('firefox_status')}, extension={state_data.get('extension_status')} 🔥🔥🔥")
        logger.info(f"🔥 [FirefoxManager] Broadcast called from: {caller_info}")
        self._last_broadcast_state = state_for_comparison.copy()
        
        disconnected = set()
        successful_count = 0
        
        for websocket in self._active_websockets:
            try:
                await websocket.send_json({
                    "type": "state_update",
                    "data": state_data
                })
                successful_count += 1
            except Exception as e:
                # WebSocket 에러는 조용히 처리 (연결 끊김은 정상적인 상황)
                disconnected.add(websocket)
        
        # 연결이 끊긴 WebSocket 제거
        for ws in disconnected:
            self._active_websockets.discard(ws)
        
        # Broadcast completed silently
    
    def get_system_state(self) -> Dict[str, Any]:
        """현재 시스템 상태 반환"""
        return self._system_state.copy()
    
    # ======================== WebSocket Management ========================
    
    async def websocket_handler(self, websocket: WebSocket):
        """WebSocket 연결 처리"""
        await websocket.accept()
        self._active_websockets.add(websocket)
        
        websocket_id = id(websocket)
        logger.info(f"🔥🔥🔥 [FirefoxManager] WebSocket client connected (ID: {websocket_id}). Total clients: {len(self._active_websockets)} 🔥🔥🔥")
        
        # Heartbeat task for this connection
        heartbeat_task = None
        
        async def send_heartbeat():
            """Send heartbeat every 30 seconds to keep connection alive"""
            try:
                while True:
                    await asyncio.sleep(30)  # Send heartbeat every 30 seconds
                    if websocket in self._active_websockets:
                        try:
                            await websocket.send_json({
                                "type": "heartbeat",
                                "timestamp": datetime.now().isoformat()
                            })
                            logger.debug(f"[FirefoxManager] Heartbeat sent to WebSocket {websocket_id}")
                        except Exception as e:
                            logger.debug(f"[FirefoxManager] Heartbeat failed for {websocket_id}: {e}")
                            break
                    else:
                        break
            except asyncio.CancelledError:
                logger.debug(f"[FirefoxManager] Heartbeat task cancelled for {websocket_id}")
        
        try:
            # Start heartbeat task
            heartbeat_task = asyncio.create_task(send_heartbeat())
            
            # 현재 상태 전송 - 메모리 상태를 그대로 사용 (재확인하지 않음)
            current_state = self.get_system_state()
            
            logger.info(f"[FirefoxManager] Sending initial state to WebSocket client: firefox={current_state.get('firefox_status')}, extension={current_state.get('extension_status')}")
            
            await websocket.send_json({
                "type": "state_update",
                "data": current_state
            })
            
            # 연결 유지
            while True:
                try:
                    # Add timeout to receive to detect dead connections
                    message = await asyncio.wait_for(websocket.receive_json(), timeout=60.0)
                    
                    if message.get("type") == "request_update":
                        # 상태 업데이트 요청 시 메모리 상태를 그대로 전송 (재확인하지 않음)
                        current_state = self.get_system_state()
                        
                        await websocket.send_json({
                            "type": "state_update",
                            "data": current_state
                        })
                    elif message.get("type") == "pong":
                        # Client responded to heartbeat
                        logger.debug(f"[FirefoxManager] Pong received from WebSocket {websocket_id}")
                    
                except asyncio.TimeoutError:
                    # No message received in 60 seconds, check if connection is still alive
                    logger.debug(f"[FirefoxManager] WebSocket {websocket_id} timeout, sending ping")
                    try:
                        await websocket.send_json({"type": "ping"})
                    except:
                        logger.info(f"[FirefoxManager] WebSocket {websocket_id} appears to be disconnected")
                        break
                except WebSocketDisconnect:
                    break
                except Exception as e:
                    logger.error(f"[FirefoxManager] WebSocket error: {e}")
                    break
        
        finally:
            # Cancel heartbeat task
            if heartbeat_task and not heartbeat_task.done():
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass
            
            self._active_websockets.discard(websocket)
            logger.info(f"[FirefoxManager] WebSocket client disconnected. Remaining clients: {len(self._active_websockets)}")
            try:
                await websocket.close()
            except:
                pass
    
    # ======================== Native Messaging ========================
    
    async def handle_native_status(self, status: Dict[str, Any]) -> Dict[str, Any]:
        """Native Host 상태 업데이트 처리"""
        logger.info(f"[FirefoxManager] Native status update: {status}")
        
        status_type = status.get('status')
        
        # Extension 연결 상태 업데이트
        if status_type in ['connected', 'ready', 'alive'] or status.get('extension_ready'):
            if self._system_state["extension_status"] != "connected":
                logger.info(f"🔥🔥🔥 [FirefoxManager] NATIVE STATUS TRIGGERING STATE CHANGE: {status_type} 🔥🔥🔥")
                await self.update_state("extension_status", "connected")
                # Firefox 상태는 이미 ready일 것이므로 변경하지 않음 - 중복 제거
                # await self.update_state("firefox_status", "ready")
                # await self.update_state("system_status", "ready")  # 자동 계산됨
                logger.info("[FirefoxManager] Extension connected - system ready")
            
            # last_seen만 조용히 업데이트 (브로드캐스트 없음)
            self._system_state["extension_last_seen"] = datetime.now().isoformat()
            
            # 세션 정보 업데이트
            if 'sessions' in status:
                await self.update_state("sessions", status['sessions'])
        
        elif status_type == 'disconnected':
            logger.info(f"🔥🔥🔥 [FirefoxManager] NATIVE STATUS DISCONNECTED 🔥🔥🔥")
            await self.update_state("extension_status", "disconnected")
            # Firefox 상태는 변경하지 않음 - Extension만 끊어진 것
            # await self.update_state("firefox_status", "closed")
            # await self.update_state("system_status", "idle")  # 자동 계산됨
            logger.info("[FirefoxManager] Extension disconnected")
        
        return {"status": "ok", "updated": True}
    
    async def handle_native_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Native Messaging 메시지 처리"""
        msg_type = message.get('type')
        msg_id = message.get('id')
        data = message.get('data', {})
        
        logger.info(f"🔥🔥🔥 [FirefoxManager] NATIVE MESSAGE RECEIVED: {msg_type} 🔥🔥🔥")
        logger.info(f"🔥 Message ID: {msg_id}")
        logger.info(f"🔥 Data: {json.dumps(data, indent=2)}")
        
        # 메시지 타입별 처리
        if msg_type == "init":
            # 상태가 실제로 변했을 때만 업데이트 (이벤트 기반)
            current_status = self._system_state.get("extension_status")
            if current_status != "connected":
                await self.update_state("extension_status", "connected")
                # Firefox 상태는 이미 ready 상태일 것이므로 변경하지 않음
                # await self.update_state("firefox_status", "ready")
                # system_status는 자동 계산됨
                logger.info(f"🔥🔥🔥 [FirefoxManager] EXTENSION INITIALIZED - SYSTEM READY 🔥🔥🔥")
            
            # last_seen은 브로드캐스트 없이 내부 업데이트만
            self._system_state["extension_last_seen"] = datetime.now().isoformat()
            return {"status": "initialized"}
        
        elif msg_type == "session_update":
            # 세션 업데이트 처리
            platform = data.get('platform')
            if platform:
                sessions = self._system_state.get("sessions", {})
                sessions[platform] = {
                    'platform': platform,
                    'valid': data.get('valid', False),
                    'last_checked': datetime.now().isoformat(),
                    'source': data.get('source', 'unknown'),
                    'status': 'active' if data.get('valid') else 'expired',
                    'error': data.get('error')
                }
                await self.update_state("sessions", sessions)
            
            # 명령 완료 처리
            if msg_id:
                await self._complete_command(msg_id, {"success": True, **data})
            
            return {"status": "updated"}
        
        elif msg_type in ["heartbeat", "extension_heartbeat"]:
            # Heartbeat 제거됨 - 이벤트 기반으로 변경
            # Extension은 연결/해제 시에만 명시적으로 알림
            logger.debug(f"[FirefoxManager] Heartbeat ignored (event-based system)")
            
            # last_seen만 조용히 업데이트 (브로드캐스트 없음)
            self._system_state["extension_last_seen"] = datetime.now().isoformat()
            
            return {"status": "ignored"}
        
        elif msg_type == "error":
            error_msg = data.get('error', 'Unknown error')
            command_id = data.get('command_id')
            
            if command_id:
                await self._complete_command(command_id, {"success": False, "error": error_msg})
            
            return {"status": "error", "message": error_msg}
        
        return {"status": "processed"}
    
    async def send_native_command(self, command_type: str, data: Dict[str, Any]) -> str:
        """Native 명령 전송 준비"""
        command_id = str(uuid.uuid4())
        data['command_id'] = command_id
        
        # 명령을 큐에 추가 (실제 구현은 command_queue 사용)
        # 여기서는 command_id만 반환
        logger.info(f"[FirefoxManager] Prepared command {command_type}: {command_id}")
        
        return command_id
    
    async def wait_for_command_response(self, command_id: str, timeout: int = 30) -> Dict[str, Any]:
        """명령 응답 대기"""
        future = asyncio.Future()
        
        async with self._command_lock:
            self._pending_commands[command_id] = future
        
        try:
            return await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError:
            async with self._command_lock:
                self._pending_commands.pop(command_id, None)
            raise Exception("Command timeout")
    
    async def _complete_command(self, command_id: str, result: Dict[str, Any]):
        """명령 완료 처리"""
        async with self._command_lock:
            future = self._pending_commands.pop(command_id, None)
            if future and not future.done():
                future.set_result(result)
    
    # ======================== API Methods ========================
    
    async def check_firefox_status(self) -> Dict[str, Any]:
        """Firefox와 Extension 상태 확인 및 시작"""
        result = await self.ensure_running()
        
        return {
            "firefox_started": result,
            "firefox_status": self._system_state["firefox_status"],
            "extension_status": self._system_state["extension_status"],
            "already_running": self.is_running() and not result
        }
    
    async def open_login_page(self, platform: str) -> Dict[str, Any]:
        """로그인 페이지 열기"""
        # Firefox가 실행 중이 아니면 먼저 시작
        if not self.is_running():
            logger.info("[FirefoxManager] Firefox not running, starting it first")
            await self.ensure_running()
            # Firefox 시작 후 잠시 대기
            await asyncio.sleep(3)
        
        # Platform별 URL 매핑
        platform_urls = {
            'chatgpt': 'https://chat.openai.com',
            'claude': 'https://claude.ai',
            'gemini': 'https://gemini.google.com',
            'deepseek': 'https://chat.deepseek.com',
            'grok': 'https://grok.x.com',
            'perplexity': 'https://www.perplexity.ai'
        }
        
        url = platform_urls.get(platform)
        if not url:
            raise Exception(f"Unknown platform: {platform}")
        
        # Extension이 없어도 직접 URL 열기
        if self._system_state["extension_status"] != "connected":
            logger.warning("[FirefoxManager] Extension not connected, opening URL directly")
            
            # Firefox에서 직접 URL 열기
            try:
                import platform as platform_module
                if self._pid and platform_module.system() == 'Windows':
                    # Windows에서 실행 중인 Firefox에 URL 열기
                    subprocess.run([
                        self._find_firefox_executable(),
                        "-new-tab",
                        url
                    ], check=False)
                    logger.info(f"[FirefoxManager] Opened {url} in Firefox")
                else:
                    logger.warning("[FirefoxManager] Cannot open URL directly in this environment")
            except Exception as e:
                logger.error(f"[FirefoxManager] Failed to open URL directly: {e}")
        
        # command_queue를 통한 Extension 명령 시도
        try:
            from .command_queue import command_queue
            if command_queue:
                await command_queue.enqueue(
                    "open_login_page",
                    {"platform": platform},
                    priority=2  # HIGH priority
                )
                logger.info(f"[FirefoxManager] Enqueued open_login_page command for {platform}")
            else:
                logger.warning("[FirefoxManager] command_queue not available")
        except ImportError:
            logger.error("[FirefoxManager] Failed to import command_queue")
        
        command_id = await self.send_native_command(
            "open_login_page",
            {"platform": platform}
        )
        
        logger.info(f"[FirefoxManager] Login page open request for {platform} completed")
        
        return {
            "success": True,
            "command_id": command_id,
            "firefox_status": self._system_state["firefox_status"],
            "extension_status": self._system_state["extension_status"],
            "url": url
        }
    
    async def ensure_running(self) -> bool:
        """Firefox가 실행 중인지 확인하고 필요시 시작"""
        if self.is_running():
            return True
        
        return await self.start()
    
    async def initialize(self) -> bool:
        """Firefox Manager 초기화"""
        logger.debug("[FirefoxManager] Initializing...")
        
        # Extension 타임아웃 체커 제거됨 - 이벤트 기반으로 변경
        
        # Firefox 프로세스 확인
        existing_pid = await self._find_existing_firefox()
        if existing_pid:
            logger.debug("[FirefoxManager] Found existing Firefox")
            await self.update_state("firefox_status", "ready")
            self._pid = existing_pid
            self._status = FirefoxStatus.READY
            self._start_time = datetime.now()
        else:
            await self.update_state("firefox_status", "closed")
        
        # Extension 상태는 초기화하지 않음 - heartbeat가 오면 자동으로 connected
        # 기존 상태를 유지하거나 기본값을 disconnected로 설정
        if "extension_status" not in self._system_state:
            await self.update_state("extension_status", "disconnected")
        # else: 기존 상태 유지
        
        # 프로필 경로 확인
        if not self.profile_path.exists():
            logger.info(f"[FirefoxManager] Creating profile directory: {self.profile_path}")
            self.profile_path.mkdir(parents=True, exist_ok=True)
        
        # Extension 경로 확인
        if not self.extension_path.exists():
            logger.warning(f"[FirefoxManager] Extension path not found: {self.extension_path}")
        
        # Firefox 실행 파일 확인
        firefox_exe = self._find_firefox_executable()
        if not firefox_exe:
            logger.error("[FirefoxManager] Firefox executable not found")
            return False
        
        logger.info(f"[FirefoxManager] Firefox executable: {firefox_exe}")
        
        # 자동 시작 옵션 확인 - 안전한 자동 실행
        auto_start = os.getenv("FIREFOX_AUTO_START", "true").lower() == "true"  # 기본값 다시 true
        if auto_start and not existing_pid:
            logger.info("[FirefoxManager] Auto-start is enabled, starting Firefox safely...")
            try:
                # 기존 Firefox 프로세스가 없을 때만 시작
                result = await self.start()
                if result:
                    logger.info("[FirefoxManager] Firefox started automatically")
                else:
                    logger.warning("[FirefoxManager] Auto-start failed, Firefox may start manually")
            except Exception as e:
                logger.warning(f"[FirefoxManager] Auto-start error (non-critical): {e}")
        elif existing_pid:
            logger.info(f"[FirefoxManager] Using existing Firefox process (PID: {existing_pid})")
        else:
            logger.info("[FirefoxManager] Auto-start disabled, Firefox can be started manually")
        
        return True
    
    async def cleanup(self):
        """정리 작업"""
        logger.info("[FirefoxManager] Cleaning up...")
        self._auto_restart = False
        
        # Extension timeout 태스크 제거됨 - 이벤트 기반으로 변경
        
        # Firefox 프로세스는 종료하지 않음 - 사용자가 실행한 것일 수 있음
        logger.info("[FirefoxManager] Cleanup completed - Firefox process left running")

# 싱글톤 인스턴스
_firefox_manager: Optional[FirefoxManager] = None

def get_firefox_manager() -> FirefoxManager:
    """Firefox Manager 인스턴스 반환"""
    global _firefox_manager
    if _firefox_manager is None:
        _firefox_manager = FirefoxManager()
    return _firefox_manager

# 편의 함수들
async def start_firefox() -> bool:
    """Firefox 시작"""
    manager = get_firefox_manager()
    return await manager.start()

async def stop_firefox() -> bool:
    """Firefox 종료"""
    manager = get_firefox_manager()
    return await manager.stop()

async def restart_firefox() -> bool:
    """Firefox 재시작"""
    manager = get_firefox_manager()
    return await manager.restart()

async def ensure_firefox_running() -> bool:
    """Firefox 실행 확인"""
    manager = get_firefox_manager()
    return await manager.ensure_running()

async def get_firefox_status() -> Dict[str, Any]:
    """Firefox 상태 정보"""
    manager = get_firefox_manager()
    return await manager.get_info()

async def get_system_state() -> Dict[str, Any]:
    """시스템 상태 정보"""
    manager = get_firefox_manager()
    return manager.get_system_state()

async def handle_websocket(websocket: WebSocket):
    """WebSocket 연결 처리"""
    manager = get_firefox_manager()
    return await manager.websocket_handler(websocket)

async def handle_native_status(status: Dict[str, Any]) -> Dict[str, Any]:
    """Native 상태 업데이트 처리"""
    manager = get_firefox_manager()
    return await manager.handle_native_status(status)

async def handle_native_message(message: Dict[str, Any]) -> Dict[str, Any]:
    """Native 메시지 처리"""
    manager = get_firefox_manager()
    return await manager.handle_native_message(message)

async def check_firefox_and_extension() -> Dict[str, Any]:
    """Firefox와 Extension 상태 확인"""
    manager = get_firefox_manager()
    return await manager.check_firefox_status()

async def open_login_page(platform: str) -> Dict[str, Any]:
    """로그인 페이지 열기"""
    manager = get_firefox_manager()
    return await manager.open_login_page(platform)

# 초기화 시 사용
firefox_manager = get_firefox_manager()
