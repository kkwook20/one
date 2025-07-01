#!/usr/bin/env python3
"""
Automation Control - VS Code 및 시스템 자동화 제어
안전한 키보드/마우스 제어 with 강력한 보안 장치
"""

import asyncio
import time
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import json

# 선택적 import - 패키지가 없어도 동작
try:
    import pyautogui
    import pytesseract
    from PIL import Image, ImageGrab
    AUTOMATION_AVAILABLE = True
except ImportError as e:
    print(f"Automation packages not available: {e}")
    print("Run: pip install pyautogui pytesseract pillow")
    AUTOMATION_AVAILABLE = False
    
    # Mock classes for testing
    class pyautogui:
        @staticmethod
        def screenshot(): return None
        @staticmethod
        def click(x, y): pass
        @staticmethod
        def hotkey(*keys): pass
        @staticmethod
        def typewrite(text): pass
        @staticmethod
        def press(key): pass
    
    class pytesseract:
        @staticmethod
        def image_to_string(img): return ""

from .safety_manager import SafetyManager, SafetyLevel

logger = logging.getLogger(__name__)

class VSCodeAutomation:
    """VS Code 안전 자동화 제어"""
    
    def __init__(self, safety_manager: SafetyManager):
        self.safety_manager = safety_manager
        self.automation_enabled = AUTOMATION_AVAILABLE
        self.interaction_log = []
        
        # VS Code 설정
        self.vscode_title_patterns = ["Visual Studio Code", "Claude", "Code"]
        self.claude_window_title = "Claude"
        
        # 안전 설정
        self.max_delete_operations = 3  # 최대 삭제 작업 수
        self.delete_confirmation_required = True
        self.emergency_stop_key = "ctrl+shift+esc"
        
        # 작업 제한
        self.operation_counts = {
            "delete": 0,
            "select_all": 0,
            "file_operations": 0
        }
        
        # 금지된 작업 패턴
        self.forbidden_patterns = [
            "ctrl+a,delete",  # 전체 선택 후 삭제
            "ctrl+a,del",
            "shift+delete",   # 영구 삭제
            "alt+f4",        # 프로그램 종료
        ]
        
        logger.info(f"VSCodeAutomation initialized (automation: {self.automation_enabled})")
    
    async def initialize(self):
        """초기화"""
        if not self.automation_enabled:
            logger.warning("Automation not available - running in simulation mode")
            return
        
        # PyAutoGUI 안전 설정
        pyautogui.FAILSAFE = True  # 마우스를 화면 모서리로 이동하면 중단
        pyautogui.PAUSE = 0.5      # 각 작업 사이에 0.5초 대기
        
        logger.info("VS Code automation initialized with safety settings")
    
    async def is_ready(self) -> bool:
        """준비 상태 확인"""
        return self.automation_enabled
    
    async def cleanup(self):
        """정리"""
        # 상호작용 로그 저장
        await self._save_interaction_log()
    
    def _is_operation_safe(self, operation: str, context: Dict[str, Any] = None) -> Tuple[bool, str]:
        """작업 안전성 검사"""
        
        # 금지된 패턴 확인
        operation_lower = operation.lower()
        for pattern in self.forbidden_patterns:
            if pattern in operation_lower:
                return False, f"Forbidden operation pattern: {pattern}"
        
        # 삭제 작업 제한
        if "delete" in operation_lower or "del" in operation_lower:
            if self.operation_counts["delete"] >= self.max_delete_operations:
                return False, f"Delete operation limit exceeded ({self.max_delete_operations})"
            
            if self.delete_confirmation_required:
                return False, "Delete operation requires manual confirmation"
        
        # 전체 선택 작업 제한
        if "ctrl+a" in operation_lower or "select_all" in operation_lower:
            if self.operation_counts["select_all"] >= 2:
                return False, "Select all operation limit exceeded"
        
        return True, "Operation appears safe"
    
    async def safe_automation_action(self, action: str, **kwargs) -> Dict[str, Any]:
        """안전한 자동화 작업 실행"""
        try:
            # 안전성 검사
            is_safe, reason = self._is_operation_safe(action, kwargs)
            if not is_safe:
                logger.error(f"Unsafe automation action blocked: {reason}")
                return {"success": False, "error": reason, "action": action}
            
            # 시뮬레이션 모드
            if not self.automation_enabled:
                logger.info(f"SIMULATION: {action} with {kwargs}")
                return {"success": True, "simulated": True, "action": action}
            
            # 실제 작업 실행
            result = await self._execute_automation_action(action, **kwargs)
            
            # 작업 기록
            self._log_interaction(action, kwargs, result)
            
            return result
            
        except Exception as e:
            logger.error(f"Automation action failed: {e}")
            return {"success": False, "error": str(e), "action": action}
    
    async def _execute_automation_action(self, action: str, **kwargs) -> Dict[str, Any]:
        """자동화 작업 실제 실행"""
        
        if action == "screenshot":
            return await self._take_screenshot(**kwargs)
        
        elif action == "click":
            return await self._safe_click(kwargs.get("x"), kwargs.get("y"))
        
        elif action == "type":
            return await self._safe_type(kwargs.get("text", ""))
        
        elif action == "hotkey":
            return await self._safe_hotkey(kwargs.get("keys", []))
        
        elif action == "find_window":
            return await self._find_vscode_window()
        
        elif action == "read_screen":
            return await self._read_screen_text(**kwargs)
        
        else:
            return {"success": False, "error": f"Unknown action: {action}"}
    
    async def _take_screenshot(self, region: Optional[Tuple[int, int, int, int]] = None) -> Dict[str, Any]:
        """스크린샷 촬영"""
        try:
            if region:
                screenshot = pyautogui.screenshot(region=region)
            else:
                screenshot = pyautogui.screenshot()
            
            # 임시 파일로 저장
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            screenshot_path = Path(f"./claude_bridge/.logs/screenshot_{timestamp}.png")
            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            screenshot.save(screenshot_path)
            
            return {
                "success": True,
                "screenshot_path": str(screenshot_path),
                "size": screenshot.size
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _safe_click(self, x: int, y: int) -> Dict[str, Any]:
        """안전한 클릭"""
        try:
            # 화면 경계 확인
            screen_width, screen_height = pyautogui.size()
            if not (0 <= x <= screen_width and 0 <= y <= screen_height):
                return {"success": False, "error": "Click coordinates out of screen bounds"}
            
            pyautogui.click(x, y)
            await asyncio.sleep(0.1)  # 짧은 대기
            
            return {"success": True, "clicked": {"x": x, "y": y}}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _safe_type(self, text: str) -> Dict[str, Any]:
        """안전한 텍스트 입력"""
        try:
            # 위험한 텍스트 패턴 확인
            dangerous_patterns = ["rm -rf", "del /f /s /q", "format", "shutdown"]
            text_lower = text.lower()
            
            for pattern in dangerous_patterns:
                if pattern in text_lower:
                    return {"success": False, "error": f"Dangerous text pattern detected: {pattern}"}
            
            pyautogui.typewrite(text, interval=0.02)  # 천천히 입력
            
            return {"success": True, "text_typed": text[:100]}  # 처음 100자만 로그
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _safe_hotkey(self, keys: List[str]) -> Dict[str, Any]:
        """안전한 단축키"""
        try:
            # 위험한 단축키 조합 확인
            keys_str = "+".join(keys).lower()
            
            # 특별 제한 - 전체 선택 후 삭제 방지
            if keys_str in ["ctrl+a", "ctrl+shift+a"]:
                self.operation_counts["select_all"] += 1
                if self.operation_counts["select_all"] > 2:
                    return {"success": False, "error": "Select all operation limit exceeded"}
            
            # 삭제 키 제한
            if "delete" in keys_str or "del" in keys_str:
                self.operation_counts["delete"] += 1
                if self.operation_counts["delete"] > self.max_delete_operations:
                    return {"success": False, "error": "Delete operation limit exceeded"}
            
            pyautogui.hotkey(*keys)
            await asyncio.sleep(0.2)  # 단축키 처리 대기
            
            return {"success": True, "hotkey": keys}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _find_vscode_window(self) -> Dict[str, Any]:
        """VS Code 창 찾기"""
        try:
            # 이 부분은 플랫폼별로 구현 필요
            # Windows의 경우 win32gui 사용 가능
            # 현재는 기본 구현
            
            return {
                "success": True,
                "found": True,
                "window_title": "VS Code (simulated)",
                "note": "Window detection not fully implemented"
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _read_screen_text(self, region: Optional[Tuple[int, int, int, int]] = None) -> Dict[str, Any]:
        """화면 텍스트 읽기 (OCR)"""
        try:
            # 스크린샷 촬영
            if region:
                screenshot = pyautogui.screenshot(region=region)
            else:
                screenshot = pyautogui.screenshot()
            
            # OCR로 텍스트 추출
            text = pytesseract.image_to_string(screenshot)
            
            return {
                "success": True,
                "text": text,
                "text_length": len(text)
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def _log_interaction(self, action: str, kwargs: Dict[str, Any], result: Dict[str, Any]):
        """상호작용 로그"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "parameters": kwargs,
            "result": result,
            "safety_level": self.safety_manager.safety_level.value
        }
        
        self.interaction_log.append(log_entry)
        
        # 로그가 너무 많아지면 정리
        if len(self.interaction_log) > 1000:
            self.interaction_log = self.interaction_log[-500:]
    
    async def _save_interaction_log(self):
        """상호작용 로그 저장"""
        try:
            log_file = Path("./claude_bridge/.logs/automation_log.json")
            log_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(log_file, 'w', encoding='utf-8') as f:
                json.dump(self.interaction_log, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Automation log saved: {log_file}")
            
        except Exception as e:
            logger.error(f"Failed to save automation log: {e}")
    
    async def interact_with_claude(self, message: str, wait_response: bool = True) -> Dict[str, Any]:
        """Claude와 상호작용 (안전 모드)"""
        try:
            # 메시지 안전성 확인
            is_safe, reason = self.safety_manager.is_operation_safe(message, "interaction")
            if not is_safe:
                return {"success": False, "error": f"Message blocked: {reason}"}
            
            logger.info(f"Claude interaction: {message[:100]}...")
            
            # 시뮬레이션 모드
            if not self.automation_enabled:
                return {
                    "success": True,
                    "simulated": True,
                    "message": message,
                    "response": "Simulated Claude response"
                }
            
            # 실제 상호작용 로직은 여기에 구현
            # 현재는 기본 응답 반환
            
            return {
                "success": True,
                "message_sent": message,
                "response": "Real Claude interaction not implemented yet",
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Claude interaction failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def handle_action(self, action_data: Dict[str, Any]) -> Dict[str, Any]:
        """액션 처리"""
        action_type = action_data.get("type")
        parameters = action_data.get("parameters", {})
        
        if action_type == "automation":
            return await self.safe_automation_action(
                parameters.get("action"),
                **parameters.get("kwargs", {})
            )
        
        elif action_type == "claude_interaction":
            return await self.interact_with_claude(
                parameters.get("message", ""),
                parameters.get("wait_response", True)
            )
        
        else:
            return {"success": False, "error": f"Unknown action type: {action_type}"}
    
    def reset_operation_counts(self):
        """작업 카운트 리셋"""
        self.operation_counts = {key: 0 for key in self.operation_counts}
        logger.info("Operation counts reset")
    
    def get_safety_status(self) -> Dict[str, Any]:
        """안전 상태 조회"""
        return {
            "automation_enabled": self.automation_enabled,
            "operation_counts": self.operation_counts.copy(),
            "max_delete_operations": self.max_delete_operations,
            "delete_confirmation_required": self.delete_confirmation_required,
            "total_interactions": len(self.interaction_log),
            "safety_level": self.safety_manager.safety_level.value
        }

# 헬퍼 함수들
async def safe_vscode_action(action: str, **kwargs) -> Dict[str, Any]:
    """안전한 VS Code 작업"""
    from .safety_manager import get_safety_manager
    safety_manager = get_safety_manager()
    automation = VSCodeAutomation(safety_manager)
    await automation.initialize()
    return await automation.safe_automation_action(action, **kwargs)

async def safe_claude_interaction(message: str) -> Dict[str, Any]:
    """안전한 Claude 상호작용"""
    from .safety_manager import get_safety_manager
    safety_manager = get_safety_manager()
    automation = VSCodeAutomation(safety_manager)
    await automation.initialize()
    return await automation.interact_with_claude(message)

if __name__ == "__main__":
    async def test_automation():
        from .safety_manager import SafetyManager, SafetyLevel
        
        safety = SafetyManager(SafetyLevel.SIMULATION)
        automation = VSCodeAutomation(safety)
        await automation.initialize()
        
        # 안전한 작업 테스트
        result1 = await automation.safe_automation_action("screenshot")
        print(f"Screenshot: {result1}")
        
        # 위험한 작업 테스트 (차단되어야 함)
        result2 = await automation.safe_automation_action("hotkey", keys=["ctrl", "a"])
        print(f"Select all: {result2}")
        
        result3 = await automation.safe_automation_action("hotkey", keys=["delete"])
        print(f"Delete: {result3}")
        
        # 안전 상태 확인
        status = automation.get_safety_status()
        print(f"Safety status: {status}")
    
    asyncio.run(test_automation())