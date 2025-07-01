#!/usr/bin/env python3
"""
Self-Healing System - 자가 복구 시스템
에러 발생 시 Claude Code에게 자동으로 도움 요청하고 문제 해결
"""

import asyncio
import json
import logging
import traceback
import sys
import importlib
import inspect
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime
import subprocess

logger = logging.getLogger(__name__)

class ErrorAnalyzer:
    """에러 분석기"""
    
    def __init__(self):
        self.error_patterns = {
            "ImportError": "import_error",
            "ModuleNotFoundError": "module_not_found", 
            "NameError": "name_error",
            "AttributeError": "attribute_error",
            "SyntaxError": "syntax_error",
            "FileNotFoundError": "file_not_found",
            "PermissionError": "permission_error"
        }
    
    def analyze_error(self, error: Exception, traceback_str: str) -> Dict[str, Any]:
        """에러 분석"""
        error_type = type(error).__name__
        error_msg = str(error)
        
        analysis = {
            "error_type": error_type,
            "error_message": error_msg,
            "error_category": self.error_patterns.get(error_type, "unknown"),
            "traceback": traceback_str,
            "timestamp": datetime.now().isoformat(),
            "severity": self._assess_severity(error_type),
            "suggested_fixes": self._suggest_fixes(error_type, error_msg),
            "missing_dependencies": self._extract_missing_dependencies(error_msg),
            "file_context": self._extract_file_context(traceback_str)
        }
        
        return analysis
    
    def _assess_severity(self, error_type: str) -> str:
        """에러 심각도 평가"""
        critical_errors = ["SyntaxError", "IndentationError"]
        high_errors = ["ImportError", "ModuleNotFoundError", "NameError"]
        medium_errors = ["AttributeError", "TypeError", "ValueError"]
        
        if error_type in critical_errors:
            return "critical"
        elif error_type in high_errors:
            return "high"
        elif error_type in medium_errors:
            return "medium"
        else:
            return "low"
    
    def _suggest_fixes(self, error_type: str, error_msg: str) -> List[str]:
        """수정 방법 제안"""
        fixes = []
        
        if error_type == "ModuleNotFoundError":
            module_name = self._extract_module_name(error_msg)
            if module_name:
                fixes.extend([
                    f"pip install {module_name}",
                    f"Create missing module: {module_name}",
                    f"Check if module path is correct"
                ])
        
        elif error_type == "NameError":
            var_name = self._extract_variable_name(error_msg)
            if var_name:
                fixes.extend([
                    f"Define variable: {var_name}",
                    f"Import {var_name} from appropriate module",
                    f"Check spelling of {var_name}"
                ])
        
        elif error_type == "AttributeError":
            fixes.extend([
                "Check if object has the required attribute",
                "Import the correct module",
                "Initialize object properly"
            ])
        
        elif error_type == "SyntaxError":
            fixes.extend([
                "Check syntax around the error line",
                "Check indentation",
                "Check for missing parentheses or quotes"
            ])
        
        return fixes
    
    def _extract_missing_dependencies(self, error_msg: str) -> List[str]:
        """누락된 의존성 추출"""
        dependencies = []
        
        if "No module named" in error_msg:
            import re
            match = re.search(r"No module named '([^']+)'", error_msg)
            if match:
                dependencies.append(match.group(1))
        
        return dependencies
    
    def _extract_file_context(self, traceback_str: str) -> Dict[str, Any]:
        """파일 컨텍스트 추출"""
        lines = traceback_str.split('\n')
        file_info = {}
        
        for line in lines:
            if 'File "' in line and 'line' in line:
                import re
                match = re.search(r'File "([^"]+)", line (\d+)', line)
                if match:
                    file_info = {
                        "file_path": match.group(1),
                        "line_number": int(match.group(2))
                    }
                    break
        
        return file_info
    
    def _extract_module_name(self, error_msg: str) -> Optional[str]:
        """모듈명 추출"""
        import re
        match = re.search(r"No module named '([^']+)'", error_msg)
        return match.group(1) if match else None
    
    def _extract_variable_name(self, error_msg: str) -> Optional[str]:
        """변수명 추출"""
        import re
        match = re.search(r"name '([^']+)' is not defined", error_msg)
        return match.group(1) if match else None

class ClaudeCodeInterface:
    """Claude Code 인터페이스"""
    
    def __init__(self, project_root: str = "F:/ONE_AI"):
        self.project_root = Path(project_root)
        self.help_requests_dir = self.project_root / ".claude_help_requests"
        self.help_requests_dir.mkdir(exist_ok=True)
        
        # 요청 템플릿
        self.request_templates = {
            "import_error": self._import_error_template,
            "module_not_found": self._module_not_found_template,
            "name_error": self._name_error_template,
            "syntax_error": self._syntax_error_template,
            "general_error": self._general_error_template
        }
    
    async def request_help(self, error_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Claude Code에게 도움 요청"""
        try:
            error_category = error_analysis.get("error_category", "general_error")
            template_func = self.request_templates.get(error_category, self._general_error_template)
            
            # 요청 메시지 생성
            request = template_func(error_analysis)
            
            # 요청 파일 저장
            request_id = datetime.now().strftime("%Y%m%d_%H%M%S")
            request_file = self.help_requests_dir / f"help_request_{request_id}.json"
            
            with open(request_file, 'w', encoding='utf-8') as f:
                json.dump(request, f, indent=2, ensure_ascii=False)
            
            # 사용자에게 알림
            print(f"\n{'='*60}")
            print("🆘 CLAUDE CODE에게 자동 도움 요청!")
            print(f"{'='*60}")
            print(f"에러: {error_analysis['error_type']}")
            print(f"메시지: {error_analysis['error_message']}")
            print(f"요청 파일: {request_file}")
            print("\n🔴 다음 작업을 해주세요:")
            print("1. VS Code에서 위 파일을 열어서 요청 내용 확인")
            print("2. 문제를 해결하고 코드 수정")
            print("3. 'fix_completed.json' 파일 생성하여 완료 신호")
            print(f"{'='*60}")
            
            # 응답 대기
            response = await self._wait_for_response(request_id)
            
            return response
            
        except Exception as e:
            logger.error(f"Failed to request help from Claude: {e}")
            return {"success": False, "error": str(e)}
    
    def _import_error_template(self, error_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Import 에러 템플릿"""
        return {
            "request_type": "import_error_fix",
            "error_details": error_analysis,
            "claude_request": f"""
🔧 IMPORT ERROR 수정 요청

에러 정보:
- 타입: {error_analysis['error_type']}
- 메시지: {error_analysis['error_message']}
- 파일: {error_analysis.get('file_context', {}).get('file_path', 'Unknown')}

누락된 모듈들: {error_analysis.get('missing_dependencies', [])}

요청 사항:
1. 누락된 모듈들을 설치하거나 생성해주세요
2. Import 구문을 올바르게 수정해주세요
3. 필요하다면 대체 구현을 제공해주세요

완료 후 다음 형식으로 응답해주세요:
{{
  "success": true,
  "actions_taken": ["실행한 작업들"],
  "files_modified": ["수정된 파일들"],
  "next_steps": ["다음 단계들"]
}}
""",
            "suggested_fixes": error_analysis.get("suggested_fixes", []),
            "priority": "high",
            "timestamp": datetime.now().isoformat()
        }
    
    def _module_not_found_template(self, error_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """모듈 누락 에러 템플릿"""
        missing_modules = error_analysis.get("missing_dependencies", [])
        
        return {
            "request_type": "module_not_found_fix",
            "error_details": error_analysis,
            "claude_request": f"""
📦 MODULE NOT FOUND 수정 요청

누락된 모듈: {missing_modules}

요청 사항:
1. 필요한 패키지 설치: pip install {' '.join(missing_modules)}
2. 모듈이 프로젝트 내부 모듈이라면 해당 파일 생성
3. Import 경로 확인 및 수정
4. __init__.py 파일 생성 (필요시)

완료 후 응답 형식:
{{
  "success": true,
  "modules_installed": ["설치된 모듈들"],
  "files_created": ["생성된 파일들"],
  "import_fixes": ["수정된 import 구문들"]
}}
""",
            "missing_modules": missing_modules,
            "priority": "high",
            "timestamp": datetime.now().isoformat()
        }
    
    def _name_error_template(self, error_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """이름 에러 템플릿"""
        return {
            "request_type": "name_error_fix",
            "error_details": error_analysis,
            "claude_request": f"""
🔤 NAME ERROR 수정 요청

에러: {error_analysis['error_message']}

요청 사항:
1. 정의되지 않은 변수/함수/클래스 확인
2. 필요한 import 구문 추가
3. 변수/함수 정의 추가
4. 오타 수정

완료 후 응답:
{{
  "success": true,
  "definitions_added": ["추가된 정의들"],
  "imports_added": ["추가된 import들"],
  "typos_fixed": ["수정된 오타들"]
}}
""",
            "priority": "medium",
            "timestamp": datetime.now().isoformat()
        }
    
    def _syntax_error_template(self, error_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """문법 에러 템플릿"""
        return {
            "request_type": "syntax_error_fix",
            "error_details": error_analysis,
            "claude_request": f"""
⚠️ SYNTAX ERROR 수정 요청

에러: {error_analysis['error_message']}
파일: {error_analysis.get('file_context', {}).get('file_path', 'Unknown')}
라인: {error_analysis.get('file_context', {}).get('line_number', 'Unknown')}

요청 사항:
1. 문법 오류 수정
2. 들여쓰기 확인
3. 괄호, 따옴표 짝 맞추기
4. 코드 검증

완료 후 응답:
{{
  "success": true,
  "syntax_fixes": ["수정된 문법 오류들"],
  "files_fixed": ["수정된 파일들"]
}}
""",
            "priority": "critical",
            "timestamp": datetime.now().isoformat()
        }
    
    def _general_error_template(self, error_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """일반 에러 템플릿"""
        return {
            "request_type": "general_error_fix",
            "error_details": error_analysis,
            "claude_request": f"""
🔧 일반 에러 수정 요청

에러 타입: {error_analysis['error_type']}
에러 메시지: {error_analysis['error_message']}
심각도: {error_analysis['severity']}

제안된 수정 방법:
{chr(10).join(f"- {fix}" for fix in error_analysis.get('suggested_fixes', []))}

요청 사항:
1. 에러 원인 분석
2. 적절한 수정 방법 적용
3. 코드 테스트
4. 재발 방지 방안 제시

완료 후 응답:
{{
  "success": true,
  "root_cause": "근본 원인",
  "fix_applied": "적용된 수정",
  "prevention": "재발 방지 방안"
}}
""",
            "priority": error_analysis['severity'],
            "timestamp": datetime.now().isoformat()
        }
    
    async def _wait_for_response(self, request_id: str, timeout: int = 300) -> Dict[str, Any]:
        """Claude의 응답 대기"""
        response_file = self.help_requests_dir / f"response_{request_id}.json"
        completion_file = self.help_requests_dir / "fix_completed.json"
        
        start_time = datetime.now()
        
        while (datetime.now() - start_time).seconds < timeout:
            # 완료 신호 확인
            if completion_file.exists():
                try:
                    with open(completion_file, 'r', encoding='utf-8') as f:
                        response = json.load(f)
                    
                    # 완료 파일 삭제
                    completion_file.unlink()
                    
                    return response
                    
                except Exception as e:
                    logger.error(f"Error reading completion file: {e}")
            
            # 응답 파일 확인
            if response_file.exists():
                try:
                    with open(response_file, 'r', encoding='utf-8') as f:
                        response = json.load(f)
                    
                    # 응답 파일 삭제
                    response_file.unlink()
                    
                    return response
                    
                except Exception as e:
                    logger.error(f"Error reading response file: {e}")
            
            await asyncio.sleep(5)  # 5초마다 확인
        
        # 타임아웃
        return {
            "success": False,
            "error": "Claude response timeout",
            "timeout": timeout
        }

class SelfHealingSystem:
    """자가 복구 시스템"""
    
    def __init__(self, project_root: str = "F:/ONE_AI"):
        self.project_root = Path(project_root)
        self.error_analyzer = ErrorAnalyzer()
        self.claude_interface = ClaudeCodeInterface(project_root)
        
        # 복구 통계
        self.recovery_stats = {
            "total_errors": 0,
            "successful_recoveries": 0,
            "failed_recoveries": 0,
            "claude_requests": 0
        }
        
        logger.info("Self-Healing System initialized")
    
    async def handle_error(self, error: Exception, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """에러 처리 및 자동 복구"""
        try:
            self.recovery_stats["total_errors"] += 1
            
            # 에러 분석
            traceback_str = traceback.format_exc()
            error_analysis = self.error_analyzer.analyze_error(error, traceback_str)
            
            logger.error(f"Error detected: {error_analysis['error_type']} - {error_analysis['error_message']}")
            
            # 컨텍스트 추가
            if context:
                error_analysis["context"] = context
            
            # 자동 수정 시도
            auto_fix_result = await self._attempt_auto_fix(error_analysis)
            
            if auto_fix_result["success"]:
                self.recovery_stats["successful_recoveries"] += 1
                return auto_fix_result
            
            # Claude Code에게 도움 요청
            self.recovery_stats["claude_requests"] += 1
            claude_response = await self.claude_interface.request_help(error_analysis)
            
            if claude_response.get("success"):
                self.recovery_stats["successful_recoveries"] += 1
                
                # 수정 후 재시도
                retry_result = await self._retry_after_fix(context)
                return retry_result
            else:
                self.recovery_stats["failed_recoveries"] += 1
                return {
                    "success": False,
                    "error": "Failed to get help from Claude Code",
                    "original_error": error_analysis
                }
            
        except Exception as healing_error:
            logger.critical(f"Self-healing system error: {healing_error}")
            return {
                "success": False,
                "error": "Self-healing system failed",
                "healing_error": str(healing_error),
                "original_error": str(error)
            }
    
    async def _attempt_auto_fix(self, error_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """자동 수정 시도"""
        try:
            error_category = error_analysis.get("error_category")
            
            if error_category == "module_not_found":
                return await self._auto_fix_missing_modules(error_analysis)
            elif error_category == "import_error":
                return await self._auto_fix_import_error(error_analysis)
            else:
                return {"success": False, "reason": "No auto-fix available"}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _auto_fix_missing_modules(self, error_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """누락된 모듈 자동 설치"""
        try:
            missing_modules = error_analysis.get("missing_dependencies", [])
            
            for module in missing_modules:
                # 일반적인 패키지명 매핑
                package_mapping = {
                    "claude_bridge.executor": None,  # 내부 모듈
                    "claude_bridge.config": None,    # 내부 모듈
                    "aiofiles": "aiofiles",
                    "aiohttp": "aiohttp",
                    "PIL": "Pillow",
                    "cv2": "opencv-python"
                }
                
                package_name = package_mapping.get(module)
                
                if package_name:
                    # pip install 시도
                    result = subprocess.run(
                        [sys.executable, "-m", "pip", "install", package_name],
                        capture_output=True,
                        text=True
                    )
                    
                    if result.returncode == 0:
                        logger.info(f"Successfully installed {package_name}")
                    else:
                        logger.error(f"Failed to install {package_name}: {result.stderr}")
                        return {"success": False, "error": f"Package installation failed: {package_name}"}
                
                elif module.startswith("claude_bridge"):
                    # 내부 모듈 - Claude에게 요청 필요
                    return {"success": False, "reason": "Internal module missing - need Claude help"}
            
            return {"success": True, "modules_installed": missing_modules}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _auto_fix_import_error(self, error_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Import 에러 자동 수정"""
        # 간단한 import 수정만 시도
        # 복잡한 경우는 Claude에게 위임
        return {"success": False, "reason": "Complex import error - need Claude help"}
    
    async def _retry_after_fix(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """수정 후 재시도"""
        try:
            # 모듈 재로드
            if context and "module_name" in context:
                module_name = context["module_name"]
                if module_name in sys.modules:
                    importlib.reload(sys.modules[module_name])
            
            return {"success": True, "retried": True}
            
        except Exception as e:
            return {"success": False, "retry_error": str(e)}
    
    def get_recovery_stats(self) -> Dict[str, Any]:
        """복구 통계 조회"""
        success_rate = 0
        if self.recovery_stats["total_errors"] > 0:
            success_rate = (self.recovery_stats["successful_recoveries"] / self.recovery_stats["total_errors"]) * 100
        
        return {
            **self.recovery_stats,
            "success_rate": round(success_rate, 2)
        }

# 전역 자가 복구 시스템
_global_healing_system: Optional[SelfHealingSystem] = None

def get_healing_system() -> SelfHealingSystem:
    """전역 자가 복구 시스템 반환"""
    global _global_healing_system
    if _global_healing_system is None:
        _global_healing_system = SelfHealingSystem()
    return _global_healing_system

async def auto_heal_error(error: Exception, context: Dict[str, Any] = None) -> Dict[str, Any]:
    """에러 자동 복구"""
    healing_system = get_healing_system()
    return await healing_system.handle_error(error, context)

# 데코레이터
def self_healing(func: Callable) -> Callable:
    """자가 복구 데코레이터"""
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            context = {
                "function_name": func.__name__,
                "module_name": func.__module__,
                "args": str(args)[:100],
                "kwargs": str(kwargs)[:100]
            }
            
            healing_result = await auto_heal_error(e, context)
            
            if healing_result.get("success"):
                # 수정 후 재시도
                try:
                    return await func(*args, **kwargs)
                except Exception as retry_error:
                    logger.error(f"Retry failed: {retry_error}")
                    raise retry_error
            else:
                # 복구 실패시 원래 에러 발생
                raise e
    
    return wrapper

if __name__ == "__main__":
    async def test_healing():
        healing_system = SelfHealingSystem()
        
        # 테스트 에러 생성
        try:
            import non_existent_module
        except ImportError as e:
            result = await healing_system.handle_error(e)
            print(f"Healing result: {result}")
        
        # 통계 확인
        stats = healing_system.get_recovery_stats()
        print(f"Recovery stats: {stats}")
    
    asyncio.run(test_healing())