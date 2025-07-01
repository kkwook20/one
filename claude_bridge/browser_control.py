#!/usr/bin/env python3
"""
Browser Control - 브라우저 제어 시스템
안전한 웹 브라우저 자동화
"""

import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import json

# 선택적 import
try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.firefox.options import Options as FirefoxOptions
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    
    # Mock classes
    class webdriver:
        class Chrome:
            def __init__(self, options=None): pass
            def get(self, url): pass
            def quit(self): pass
            def find_element(self, by, value): return MockElement()
        class Firefox:
            def __init__(self, options=None): pass
            def get(self, url): pass
            def quit(self): pass
    
    class MockElement:
        def click(self): pass
        def send_keys(self, text): pass
        @property
        def text(self): return "Mock Element Text"

from .safety_manager import SafetyManager

logger = logging.getLogger(__name__)

class BrowserController:
    """브라우저 제어기"""
    
    def __init__(self, safety_manager: SafetyManager):
        self.safety_manager = safety_manager
        self.selenium_available = SELENIUM_AVAILABLE
        self.driver = None
        self.browser_type = "chrome"
        self.headless = True
        
        # 브라우저 작업 로그
        self.action_log = []
        
        logger.info(f"Browser Controller initialized (selenium: {self.selenium_available})")
    
    async def initialize(self):
        """초기화"""
        if not self.selenium_available:
            logger.warning("Selenium not available - browser control will be simulated")
            return
        
        logger.info("Browser Controller ready")
    
    async def is_ready(self) -> bool:
        """준비 상태"""
        return True
    
    async def cleanup(self):
        """정리"""
        if self.driver:
            try:
                self.driver.quit()
            except Exception as e:
                logger.error(f"Error closing browser: {e}")
        
        # 작업 로그 저장
        await self._save_action_log()
    
    async def navigate(self, url: str) -> Dict[str, Any]:
        """페이지 탐색"""
        try:
            # 안전성 검사
            is_safe, reason = self.safety_manager.is_operation_safe(f"navigate {url}", "browser_navigation")
            if not is_safe:
                return {"success": False, "error": reason}
            
            # 시뮬레이션 모드
            if not self.selenium_available:
                result = {
                    "success": True,
                    "url": url,
                    "simulated": True,
                    "title": f"Simulated page for {url}"
                }
                await self._log_action("navigate", {"url": url}, result)
                return result
            
            # 실제 탐색
            if not self.driver:
                await self._create_driver()
            
            self.driver.get(url)
            
            result = {
                "success": True,
                "url": url,
                "title": self.driver.title,
                "current_url": self.driver.current_url
            }
            
            await self._log_action("navigate", {"url": url}, result)
            return result
            
        except Exception as e:
            error_result = {"success": False, "error": str(e), "url": url}
            await self._log_action("navigate", {"url": url}, error_result)
            return error_result
    
    async def _create_driver(self):
        """드라이버 생성"""
        try:
            if self.browser_type == "chrome":
                options = ChromeOptions()
                if self.headless:
                    options.add_argument("--headless")
                options.add_argument("--no-sandbox")
                options.add_argument("--disable-dev-shm-usage")
                self.driver = webdriver.Chrome(options=options)
            
            elif self.browser_type == "firefox":
                options = FirefoxOptions()
                if self.headless:
                    options.add_argument("--headless")
                self.driver = webdriver.Firefox(options=options)
            
            logger.info(f"Browser driver created: {self.browser_type}")
            
        except Exception as e:
            logger.error(f"Failed to create browser driver: {e}")
            raise
    
    async def click_element(self, selector: str, by: str = "css") -> Dict[str, Any]:
        """요소 클릭"""
        try:
            # 안전성 검사
            is_safe, reason = self.safety_manager.is_operation_safe(f"click {selector}", "browser_click")
            if not is_safe:
                return {"success": False, "error": reason}
            
            # 시뮬레이션 모드
            if not self.selenium_available or not self.driver:
                result = {
                    "success": True,
                    "selector": selector,
                    "simulated": True,
                    "action": "click"
                }
                await self._log_action("click", {"selector": selector, "by": by}, result)
                return result
            
            # 실제 클릭
            by_mapping = {
                "css": By.CSS_SELECTOR,
                "xpath": By.XPATH,
                "id": By.ID,
                "class": By.CLASS_NAME,
                "tag": By.TAG_NAME
            }
            
            by_type = by_mapping.get(by, By.CSS_SELECTOR)
            
            element = WebDriverWait(self.driver, 10).until(
                EC.element_to_be_clickable((by_type, selector))
            )
            
            element.click()
            
            result = {
                "success": True,
                "selector": selector,
                "by": by,
                "clicked": True
            }
            
            await self._log_action("click", {"selector": selector, "by": by}, result)
            return result
            
        except Exception as e:
            error_result = {"success": False, "error": str(e), "selector": selector}
            await self._log_action("click", {"selector": selector, "by": by}, error_result)
            return error_result
    
    async def type_text(self, selector: str, text: str, by: str = "css") -> Dict[str, Any]:
        """텍스트 입력"""
        try:
            # 안전성 검사
            is_safe, reason = self.safety_manager.is_operation_safe(f"type {text}", "browser_input")
            if not is_safe:
                return {"success": False, "error": reason}
            
            # 시뮬레이션 모드
            if not self.selenium_available or not self.driver:
                result = {
                    "success": True,
                    "selector": selector,
                    "text_length": len(text),
                    "simulated": True,
                    "action": "type"
                }
                await self._log_action("type", {"selector": selector, "text": text[:50]}, result)
                return result
            
            # 실제 입력
            by_mapping = {
                "css": By.CSS_SELECTOR,
                "xpath": By.XPATH,
                "id": By.ID,
                "class": By.CLASS_NAME
            }
            
            by_type = by_mapping.get(by, By.CSS_SELECTOR)
            
            element = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((by_type, selector))
            )
            
            element.clear()
            element.send_keys(text)
            
            result = {
                "success": True,
                "selector": selector,
                "text_length": len(text),
                "typed": True
            }
            
            await self._log_action("type", {"selector": selector, "text": text[:50]}, result)
            return result
            
        except Exception as e:
            error_result = {"success": False, "error": str(e), "selector": selector}
            await self._log_action("type", {"selector": selector, "text": text[:50]}, error_result)
            return error_result
    
    async def get_page_content(self) -> Dict[str, Any]:
        """페이지 내용 가져오기"""
        try:
            # 시뮬레이션 모드
            if not self.selenium_available or not self.driver:
                result = {
                    "success": True,
                    "title": "Simulated Page",
                    "url": "http://simulated.com",
                    "text_length": 1000,
                    "simulated": True
                }
                await self._log_action("get_content", {}, result)
                return result
            
            # 실제 내용 가져오기
            result = {
                "success": True,
                "title": self.driver.title,
                "url": self.driver.current_url,
                "page_source_length": len(self.driver.page_source),
                "text_length": len(self.driver.find_element(By.TAG_NAME, "body").text)
            }
            
            await self._log_action("get_content", {}, result)
            return result
            
        except Exception as e:
            error_result = {"success": False, "error": str(e)}
            await self._log_action("get_content", {}, error_result)
            return error_result
    
    async def handle_action(self, action_data: Dict[str, Any]) -> Dict[str, Any]:
        """액션 처리"""
        action_type = action_data.get("type")
        parameters = action_data.get("parameters", {})
        
        if action_type == "navigate":
            return await self.navigate(parameters.get("url"))
        
        elif action_type == "click":
            return await self.click_element(
                parameters.get("selector"),
                parameters.get("by", "css")
            )
        
        elif action_type == "type":
            return await self.type_text(
                parameters.get("selector"),
                parameters.get("text"),
                parameters.get("by", "css")
            )
        
        elif action_type == "get_content":
            return await self.get_page_content()
        
        else:
            return {"success": False, "error": f"Unknown action type: {action_type}"}
    
    async def _log_action(self, action: str, parameters: Dict[str, Any], result: Dict[str, Any]):
        """액션 로그"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "parameters": parameters,
            "result": result,
            "safety_level": self.safety_manager.safety_level.value
        }
        
        self.action_log.append(log_entry)
        
        # 로그가 너무 많아지면 정리
        if len(self.action_log) > 1000:
            self.action_log = self.action_log[-500:]
    
    async def _save_action_log(self):
        """액션 로그 저장"""
        try:
            log_file = Path("./claude_bridge/.logs/browser_log.json")
            log_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(log_file, 'w', encoding='utf-8') as f:
                json.dump(self.action_log, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Browser action log saved: {log_file}")
            
        except Exception as e:
            logger.error(f"Failed to save browser log: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """통계 조회"""
        total_actions = len(self.action_log)
        successful_actions = len([log for log in self.action_log if log["result"].get("success", False)])
        
        return {
            "selenium_available": self.selenium_available,
            "browser_type": self.browser_type,
            "driver_active": self.driver is not None,
            "total_actions": total_actions,
            "successful_actions": successful_actions,
            "success_rate": (successful_actions / max(total_actions, 1)) * 100,
            "safety_level": self.safety_manager.safety_level.value
        }

# 헬퍼 함수들
async def safe_navigate(url: str) -> Dict[str, Any]:
    """안전한 페이지 탐색"""
    from .safety_manager import get_safety_manager
    
    safety_manager = get_safety_manager()
    browser = BrowserController(safety_manager)
    await browser.initialize()
    
    result = await browser.navigate(url)
    await browser.cleanup()
    
    return result

if __name__ == "__main__":
    async def test_browser():
        from .safety_manager import SafetyManager, SafetyLevel
        
        safety = SafetyManager(SafetyLevel.SIMULATION)
        browser = BrowserController(safety)
        await browser.initialize()
        
        # 테스트 탐색
        result = await browser.navigate("https://example.com")
        print(f"Navigate result: {result}")
        
        # 통계 확인
        stats = browser.get_stats()
        print(f"Browser stats: {stats}")
        
        await browser.cleanup()
    
    asyncio.run(test_browser())