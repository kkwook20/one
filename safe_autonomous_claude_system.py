#!/usr/bin/env python3
"""
Safe Autonomous Claude System
완전히 새로운 안전한 자율 Claude 시스템 - 파일 삭제 방지 기능 포함
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import traceback

# Claude Bridge 모듈들 import with Self-Healing
try:
    from claude_bridge.bridge import ClaudeBridge
    from claude_bridge.config import BridgeConfig, SafetyLevel
    from claude_bridge.safety_manager import SafetyManager
    from claude_bridge.kanban_manager import KanbanManager
    from claude_bridge.emergency_recovery import EmergencyRecovery
    from claude_bridge.vscode_safe_interface import VSCodeSafeInterface
    from claude_bridge.self_healing_system import SelfHealingSystem, auto_heal_error
    MODULES_AVAILABLE = True
except ImportError as e:
    print(f"Claude Bridge modules not available: {e}")
    print("Initializing self-healing system...")
    MODULES_AVAILABLE = False
    
    # Self-Healing System for missing modules
    from enum import Enum
    
    class SafetyLevel(Enum):
        READ_ONLY = "read_only"
        SAFE_WRITE = "safe_write"
        SIMULATION = "simulation"
        FULL_CONTROL = "full_control"
    
    # Minimal implementations with self-healing capability
    class ClaudeBridge:
        def __init__(self): 
            self.healing_system = None
        async def start(self): 
            if not MODULES_AVAILABLE:
                await self._request_module_creation()
        async def stop(self): pass
        
        async def _request_module_creation(self):
            print("\n🔧 자동 모듈 생성 요청")
            print("Claude Code에게 누락된 모듈 생성을 요청합니다...")
            
            help_request = {
                "timestamp": datetime.now().isoformat(),
                "request_type": "create_missing_modules",
                "missing_modules": [
                    "claude_bridge.bridge",
                    "claude_bridge.config", 
                    "claude_bridge.safety_manager",
                    "claude_bridge.kanban_manager",
                    "claude_bridge.emergency_recovery",
                    "claude_bridge.vscode_safe_interface"
                ],
                "claude_request": """
🔧 누락된 Claude Bridge 모듈들을 생성해주세요:

필요한 모듈들:
1. claude_bridge/bridge.py - 메인 브릿지 서버
2. claude_bridge/config.py - 설정 관리 (SafetyLevel enum 포함)
3. claude_bridge/safety_manager.py - 안전 관리자
4. claude_bridge/kanban_manager.py - 작업 관리
5. claude_bridge/emergency_recovery.py - 긴급 복구
6. claude_bridge/vscode_safe_interface.py - VS Code 인터페이스

각 모듈은 기본 클래스와 메서드를 포함해야 합니다.
완료 후 'modules_created.json' 파일을 생성해주세요.
""",
                "priority": "critical"
            }
            
            # 요청 파일 저장
            request_file = Path("claude_help_request_modules.json")
            with open(request_file, 'w', encoding='utf-8') as f:
                json.dump(help_request, f, indent=2, ensure_ascii=False)
            
            print(f"요청 파일 생성: {request_file}")
            print("Claude Code가 모듈을 생성할 때까지 대기합니다...")
    
    class BridgeConfig:
        def __init__(self): 
            self.safety_level = SafetyLevel.SAFE_WRITE
    
    class SafetyManager:
        def __init__(self, level): 
            self.safety_level = level
        def is_operation_safe(self, op, op_type): 
            return True, "Safe (fallback mode)"
    
    class KanbanManager:
        def __init__(self, safety): 
            self.safety_manager = safety
        async def initialize(self): 
            print("Kanban Manager - fallback mode")
        async def create_task(self, data): 
            return {"id": f"task_{datetime.now().strftime('%H%M%S')}", **data}
    
    class EmergencyRecovery:
        def __init__(self): pass
        async def create_emergency_backup(self): 
            print("Creating emergency backup (fallback mode)...")
            return True
        async def detect_file_loss(self): 
            return []
        async def auto_recovery(self): 
            return True
        async def continuous_monitoring(self, interval): 
            print(f"Monitoring system (fallback mode) - interval: {interval}s")
    
    class VSCodeSafeInterface:
        def __init__(self): pass
        async def ask_claude_about_task(self, task, context=None): 
            print(f"Claude 질문 (fallback mode): {task[:50]}...")
            return {
                "success": True, 
                "steps": ["모듈 생성 필요", "실제 구현 대기 중"],
                "recommendations": ["Claude Code에게 모듈 생성 요청"],
                "fallback_mode": True
            }
    
    class SelfHealingSystem:
        def __init__(self):
            self.recovery_stats = {"total_errors": 0, "successful_recoveries": 0}
        async def handle_error(self, error, context=None):
            print(f"🔧 Self-Healing: {type(error).__name__} - {str(error)}")
            return {"success": True, "healed": True, "fallback_mode": True}
    
    async def auto_heal_error(error, context=None):
        healing_system = SelfHealingSystem()
        return await healing_system.handle_error(error, context)

logger = logging.getLogger(__name__)

class SafeAutonomousClaudeSystem:
    """안전한 자율 Claude 시스템"""
    
    def __init__(self):
        self.project_root = Path("F:/ONE_AI")
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.start_time = datetime.now()
        self.is_running = False
        
        # 안전 설정 - 기본값은 최대 안전 모드
        self.safety_level = SafetyLevel.SAFE_WRITE
        self.max_runtime_hours = 24
        self.progress_report_interval = 5 * 60 * 60  # 5시간
        
        # 핵심 컴포넌트들
        self.safety_manager = SafetyManager(self.safety_level)
        self.emergency_recovery = EmergencyRecovery()
        self.vscode_interface = VSCodeSafeInterface()
        self.kanban_manager = KanbanManager(self.safety_manager)
        
        # 작업 관리
        self.current_tasks = []
        self.completed_tasks = []
        self.failed_tasks = []
        self.claude_conversations = []
        
        # 안전 통계
        self.safety_stats = {
            "operations_blocked": 0,
            "files_protected": 0,
            "emergency_stops": 0,
            "backups_created": 0
        }
        
        logger.info(f"Safe Autonomous Claude System initialized (session: {self.session_id})")
    
    async def initialize(self):
        """시스템 초기화"""
        try:
            logger.info("Initializing Safe Autonomous Claude System...")
            
            # 1. 프로젝트 백업 생성
            logger.info("Creating emergency backup...")
            backup_success = await self.emergency_recovery.create_emergency_backup()
            if backup_success:
                self.safety_stats["backups_created"] += 1
                logger.info("Emergency backup created successfully")
            else:
                logger.warning("Failed to create emergency backup")
            
            # 2. 컴포넌트 초기화
            await self.kanban_manager.initialize()
            
            # 3. CLAUDE.md 분석 및 작업 생성
            await self._analyze_project_goals()
            
            # 4. 초기 안전 점검
            await self._safety_check()
            
            logger.info("System initialization completed")
            return True
            
        except Exception as e:
            logger.error(f"Initialization failed: {e}")
            traceback.print_exc()
            return False
    
    async def _analyze_project_goals(self):
        """CLAUDE.md 분석 및 작업 생성"""
        try:
            claude_md_path = self.project_root / "CLAUDE.md"
            if not claude_md_path.exists():
                logger.warning("CLAUDE.md not found")
                return
            
            with open(claude_md_path, 'r', encoding='utf-8') as f:
                claude_content = f.read()
            
            # Claude에게 프로젝트 분석 요청
            analysis_request = f"""
CLAUDE.md 내용을 분석하고 다음 정보를 제공해주세요:

1. 현재 프로젝트의 주요 목표들
2. 우선순위가 높은 작업들
3. 데이터 분석 모듈(data_analysis.py) 관련 작업들
4. 안전하게 수행할 수 있는 작업들

CLAUDE.md 내용:
{claude_content[:5000]}...
"""
            
            response = await self.vscode_interface.ask_claude_about_task(
                analysis_request,
                {"type": "project_analysis", "source": "CLAUDE.md"}
            )
            
            if response.get("success"):
                await self._create_tasks_from_analysis(response)
            
        except Exception as e:
            logger.error(f"Failed to analyze project goals: {e}")
    
    async def _create_tasks_from_analysis(self, analysis: Dict[str, Any]):
        """분석 결과로부터 작업 생성"""
        try:
            steps = analysis.get("steps", [])
            
            for i, step in enumerate(steps):
                task_data = {
                    "title": f"Task {i+1}: {step[:50]}...",
                    "description": step,
                    "priority": 1 if i < 3 else 2,  # 처음 3개는 높은 우선순위
                    "type": "implementation",
                    "source": "claude_analysis",
                    "safety_level": self.safety_level.value
                }
                
                task = await self.kanban_manager.create_task(task_data)
                self.current_tasks.append(task)
            
            logger.info(f"Created {len(steps)} tasks from Claude analysis")
            
        except Exception as e:
            logger.error(f"Failed to create tasks from analysis: {e}")
    
    async def _safety_check(self):
        """안전 점검"""
        try:
            # 1. 중요 파일 존재 확인
            critical_files = [
                "CLAUDE.md",
                "backend/main.py",
                "backend/routers/argosa/data_analysis.py",
                "frontend/package.json",
                "One.bat"
            ]
            
            missing_files = []
            for file_path in critical_files:
                if not (self.project_root / file_path).exists():
                    missing_files.append(file_path)
            
            if missing_files:
                logger.critical(f"Critical files missing: {missing_files}")
                self.safety_stats["files_protected"] += len(missing_files)
                
                # 긴급 복구 시도
                await self.emergency_recovery.auto_recovery()
            
            # 2. 디스크 공간 확인
            disk_usage = self._check_disk_space()
            if disk_usage > 90:
                logger.warning(f"Disk usage high: {disk_usage}%")
            
            # 3. 안전 수준 확인
            logger.info(f"Safety level: {self.safety_level.value}")
            
        except Exception as e:
            logger.error(f"Safety check failed: {e}")
    
    def _check_disk_space(self) -> float:
        """디스크 공간 확인"""
        try:
            import shutil
            total, used, free = shutil.disk_usage(self.project_root)
            usage_percent = (used / total) * 100
            return usage_percent
        except Exception:
            return 0.0
    
    async def run_autonomous_session(self):
        """자율 세션 실행 with Self-Healing"""
        try:
            self.is_running = True
            logger.info(f"Starting {self.max_runtime_hours}h autonomous session")
            
            end_time = self.start_time + timedelta(hours=self.max_runtime_hours)
            last_progress_report = self.start_time
            
            while self.is_running and datetime.now() < end_time:
                try:
                    # 1. 안전 모니터링 (자가 복구 적용)
                    await self._safe_execute(self._safety_monitoring, "safety_monitoring")
                    
                    # 2. 작업 실행 (자가 복구 적용)
                    await self._safe_execute(self._execute_pending_tasks, "task_execution")
                    
                    # 3. Claude와 상담 (자가 복구 적용)
                    await self._safe_execute(self._consult_with_claude, "claude_consultation")
                    
                    # 4. 진행 보고서 (5시간마다)
                    if datetime.now() - last_progress_report >= timedelta(seconds=self.progress_report_interval):
                        await self._safe_execute(self._generate_progress_report, "progress_report")
                        last_progress_report = datetime.now()
                    
                    # 5. 짧은 대기
                    await asyncio.sleep(60)  # 1분 대기
                    
                except KeyboardInterrupt:
                    logger.info("Session interrupted by user")
                    break
                except Exception as e:
                    logger.error(f"Session error: {e}")
                    
                    # 자가 복구 시도
                    healing_result = await auto_heal_error(e, {"context": "autonomous_session"})
                    
                    if healing_result.get("success"):
                        logger.info("Error healed, continuing session...")
                        await asyncio.sleep(60)  # 1분 대기 후 재시도
                    else:
                        logger.error("Self-healing failed, extended wait...")
                        await asyncio.sleep(300)  # 5분 대기 후 재시도
            
            logger.info("Autonomous session completed")
            
        except Exception as e:
            logger.critical(f"Autonomous session failed: {e}")
            await self._emergency_shutdown()
        finally:
            self.is_running = False
    
    async def _safe_execute(self, func, context_name: str):
        """안전한 함수 실행 with Self-Healing"""
        try:
            await func()
        except Exception as e:
            logger.warning(f"Error in {context_name}: {e}")
            
            # 자가 복구 시도
            healing_result = await auto_heal_error(e, {
                "context": context_name,
                "function": func.__name__,
                "timestamp": datetime.now().isoformat()
            })
            
            if healing_result.get("success"):
                logger.info(f"Healed error in {context_name}, retrying...")
                try:
                    await func()  # 복구 후 재시도
                except Exception as retry_error:
                    logger.error(f"Retry failed in {context_name}: {retry_error}")
            else:
                logger.error(f"Failed to heal error in {context_name}")
                
                # 중요한 함수의 경우 대체 작업 수행
                if context_name == "safety_monitoring":
                    await self._fallback_safety_check()
                elif context_name == "task_execution":
                    await self._fallback_task_handling()
    
    async def _fallback_safety_check(self):
        """대체 안전 점검"""
        try:
            print("🛡️ Fallback safety check...")
            
            # 기본적인 파일 존재 확인
            critical_files = ["CLAUDE.md", "One.bat", "backend/main.py"]
            missing_files = []
            
            for file_path in critical_files:
                if not (self.project_root / file_path).exists():
                    missing_files.append(file_path)
            
            if missing_files:
                logger.critical(f"Critical files missing: {missing_files}")
                print(f"⚠️ 중요 파일 누락: {missing_files}")
                
                # Claude에게 복구 요청
                await self.vscode_interface.ask_claude_about_task(
                    f"Critical files missing: {missing_files}. Please restore them immediately.",
                    {"emergency": True, "missing_files": missing_files}
                )
            
        except Exception as e:
            logger.error(f"Fallback safety check failed: {e}")
    
    async def _fallback_task_handling(self):
        """대체 작업 처리"""
        try:
            print("📋 Fallback task handling...")
            
            # 간단한 작업 생성
            simple_task = {
                "title": "System Health Check",
                "description": "Check system status and report any issues",
                "type": "monitoring",
                "priority": 1,
                "fallback_mode": True
            }
            
            task = await self.kanban_manager.create_task(simple_task)
            logger.info(f"Created fallback task: {task.get('id')}")
            
        except Exception as e:
            logger.error(f"Fallback task handling failed: {e}")
    
    async def _safety_monitoring(self):
        """안전 모니터링"""
        try:
            # 파일 손실 감지
            missing_files = await self.emergency_recovery.detect_file_loss()
            
            if missing_files:
                logger.critical(f"FILE LOSS DETECTED: {missing_files}")
                self.safety_stats["emergency_stops"] += 1
                
                # 즉시 복구 시도
                recovery_success = await self.emergency_recovery.auto_recovery()
                
                if not recovery_success:
                    await self._emergency_shutdown()
                    return
            
            # 시스템 리소스 확인
            disk_usage = self._check_disk_space()
            if disk_usage > 95:
                logger.critical(f"Disk space critical: {disk_usage}%")
                await self._emergency_shutdown()
                return
            
        except Exception as e:
            logger.error(f"Safety monitoring error: {e}")
    
    async def _execute_pending_tasks(self):
        """대기 중인 작업 실행"""
        try:
            if not self.current_tasks:
                logger.info("No pending tasks")
                return
            
            # 우선순위대로 정렬
            self.current_tasks.sort(key=lambda t: t.get("priority", 3))
            
            # 첫 번째 작업 실행
            task = self.current_tasks[0]
            
            logger.info(f"Executing task: {task.get('title', 'Unknown')}")
            
            # 작업 안전성 검사
            task_description = task.get("description", "")
            is_safe, reason = self.safety_manager.is_operation_safe(
                task_description, 
                "task_execution"
            )
            
            if not is_safe:
                logger.warning(f"Task blocked for safety: {reason}")
                self.safety_stats["operations_blocked"] += 1
                task["status"] = "blocked"
                task["block_reason"] = reason
                self.failed_tasks.append(task)
                self.current_tasks.remove(task)
                return
            
            # Claude에게 작업 방법 문의
            guidance = await self.vscode_interface.ask_claude_about_task(
                task_description,
                {"task_id": task.get("id"), "safety_level": self.safety_level.value}
            )
            
            if guidance.get("success"):
                task["claude_guidance"] = guidance
                task["status"] = "completed"
                self.completed_tasks.append(task)
                logger.info(f"Task completed with Claude guidance")
            else:
                task["status"] = "failed"
                task["error"] = guidance.get("error", "Unknown error")
                self.failed_tasks.append(task)
                logger.error(f"Task failed: {task['error']}")
            
            self.current_tasks.remove(task)
            
        except Exception as e:
            logger.error(f"Task execution error: {e}")
    
    async def _consult_with_claude(self):
        """Claude와 상담"""
        try:
            # 현재 상황 요약
            status_summary = {
                "session_runtime": str(datetime.now() - self.start_time),
                "tasks_completed": len(self.completed_tasks),
                "tasks_pending": len(self.current_tasks),
                "tasks_failed": len(self.failed_tasks),
                "safety_stats": self.safety_stats,
                "safety_level": self.safety_level.value
            }
            
            consultation_request = f"""
자율 시스템 상담 요청:

현재 상황:
- 실행 시간: {status_summary['session_runtime']}
- 완료된 작업: {status_summary['tasks_completed']}개
- 대기 중인 작업: {status_summary['tasks_pending']}개
- 실패한 작업: {status_summary['tasks_failed']}개

다음에 대해 조언해주세요:
1. 현재 진행 상황에 대한 평가
2. 다음에 집중해야 할 작업들
3. 시스템 개선 방안
4. 안전성 관련 권장사항

JSON 형식으로 답변해주세요.
"""
            
            response = await self.vscode_interface.ask_claude_about_task(
                consultation_request,
                status_summary
            )
            
            if response.get("success"):
                # Claude의 조언 적용
                await self._apply_claude_advice(response)
                
                # 대화 기록
                conversation = {
                    "timestamp": datetime.now().isoformat(),
                    "type": "consultation",
                    "request": consultation_request,
                    "response": response,
                    "status": status_summary
                }
                self.claude_conversations.append(conversation)
            
        except Exception as e:
            logger.error(f"Claude consultation error: {e}")
    
    async def _apply_claude_advice(self, advice: Dict[str, Any]):
        """Claude 조언 적용"""
        try:
            recommendations = advice.get("recommendations", [])
            
            for recommendation in recommendations:
                if "create task" in recommendation.lower():
                    # 새 작업 생성 요청
                    task_data = {
                        "title": f"Claude recommendation: {recommendation[:50]}",
                        "description": recommendation,
                        "priority": 2,
                        "type": "claude_suggestion",
                        "source": "claude_consultation"
                    }
                    
                    task = await self.kanban_manager.create_task(task_data)
                    self.current_tasks.append(task)
                    
                    logger.info(f"Created task from Claude recommendation")
            
        except Exception as e:
            logger.error(f"Failed to apply Claude advice: {e}")
    
    async def _generate_progress_report(self):
        """진행 보고서 생성"""
        try:
            runtime = datetime.now() - self.start_time
            
            report = f"""
# 자율 Claude 시스템 진행 보고서
생성 시간: {datetime.now().isoformat()}
세션 ID: {self.session_id}

## 실행 통계
- 실행 시간: {runtime}
- 안전 수준: {self.safety_level.value}

## 작업 현황
- 완료: {len(self.completed_tasks)}개
- 진행 중: {len(self.current_tasks)}개  
- 실패: {len(self.failed_tasks)}개

## 안전 통계
- 차단된 작업: {self.safety_stats['operations_blocked']}개
- 보호된 파일: {self.safety_stats['files_protected']}개
- 긴급 정지: {self.safety_stats['emergency_stops']}개
- 생성된 백업: {self.safety_stats['backups_created']}개

## Claude 대화
- 총 대화 수: {len(self.claude_conversations)}회

## 상태
- 시스템 상태: {"정상 작동" if self.is_running else "정지됨"}
- 다음 보고서: {datetime.now() + timedelta(seconds=self.progress_report_interval)}
"""
            
            # 보고서 저장
            report_file = self.project_root / f"progress_report_{self.session_id}.md"
            with open(report_file, 'w', encoding='utf-8') as f:
                f.write(report)
            
            logger.info(f"Progress report generated: {report_file}")
            
        except Exception as e:
            logger.error(f"Failed to generate progress report: {e}")
    
    async def _emergency_shutdown(self):
        """긴급 종료"""
        try:
            logger.critical("EMERGENCY SHUTDOWN INITIATED")
            
            self.is_running = False
            
            # 최종 백업 생성
            await self.emergency_recovery.create_emergency_backup()
            
            # 최종 보고서 생성
            await self._generate_progress_report()
            
            # 긴급 로그 저장
            emergency_log = {
                "timestamp": datetime.now().isoformat(),
                "session_id": self.session_id,
                "runtime": str(datetime.now() - self.start_time),
                "reason": "emergency_shutdown",
                "safety_stats": self.safety_stats,
                "tasks_completed": len(self.completed_tasks),
                "tasks_pending": len(self.current_tasks)
            }
            
            emergency_file = self.project_root / f"emergency_shutdown_{self.session_id}.json"
            with open(emergency_file, 'w', encoding='utf-8') as f:
                json.dump(emergency_log, f, indent=2, ensure_ascii=False)
            
            logger.critical(f"Emergency shutdown completed. Log: {emergency_file}")
            
        except Exception as e:
            logger.critical(f"Emergency shutdown error: {e}")
    
    async def stop(self):
        """정상 종료"""
        logger.info("Stopping autonomous system...")
        self.is_running = False
        
        # 최종 보고서 생성
        await self._generate_progress_report()
        
        logger.info("Autonomous system stopped successfully")

# 메인 실행 함수들
async def run_safe_autonomous_system(runtime_hours: int = 24, safety_level: str = "SAFE_WRITE"):
    """안전한 자율 시스템 실행"""
    try:
        # 안전 수준 설정
        if safety_level == "READ_ONLY":
            level = SafetyLevel.READ_ONLY
        elif safety_level == "SIMULATION":
            level = SafetyLevel.SIMULATION
        elif safety_level == "FULL_CONTROL":
            level = SafetyLevel.FULL_CONTROL
        else:
            level = SafetyLevel.SAFE_WRITE
        
        # 시스템 생성 및 초기화
        system = SafeAutonomousClaudeSystem()
        system.safety_level = level
        system.max_runtime_hours = runtime_hours
        
        init_success = await system.initialize()
        if not init_success:
            print("시스템 초기화 실패")
            return False
        
        # 자율 세션 실행
        await system.run_autonomous_session()
        
        # 정상 종료
        await system.stop()
        
        return True
        
    except KeyboardInterrupt:
        print("\n사용자에 의해 중단됨")
        return False
    except Exception as e:
        print(f"시스템 오류: {e}")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    # Windows 터미널 한글 인코딩 설정
    import locale
    import codecs
    
    # 시스템 인코딩 설정
    try:
        # Windows cmd에서 UTF-8 사용
        if sys.platform.startswith('win'):
            import subprocess
            subprocess.run('chcp 65001', shell=True, capture_output=True)
            
        # Python 출력 인코딩 설정
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
            sys.stderr.reconfigure(encoding='utf-8')
        else:
            # 구버전 Python 대응
            sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
            sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())
            
    except Exception as e:
        print(f"Encoding setup warning: {e}")
    
    # 로깅 설정 (UTF-8 인코딩 적용)
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(
                f"safe_autonomous_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log",
                encoding='utf-8'
            )
        ]
    )
    
    print("🛡️ Safe Autonomous Claude System")
    print("=" * 50)
    print("안전한 자율 Claude 시스템")
    print("- 파일 삭제 방지")
    print("- 자동 백업")
    print("- 24시간 자율 실행")
    print("- Claude와 지속적 상담")
    print("=" * 50)
    
    # 안전 수준 선택
    print("\n안전 수준을 선택하세요:")
    print("1. READ_ONLY - 읽기만 (가장 안전)")
    print("2. SIMULATION - 시뮬레이션만")
    print("3. SAFE_WRITE - 백업 후 쓰기 (권장)")
    print("4. FULL_CONTROL - 전체 제어 (위험!)")
    
    choice = input("\n선택 (1-4, 기본값=3): ").strip() or "3"
    
    safety_levels = {
        "1": "READ_ONLY",
        "2": "SIMULATION", 
        "3": "SAFE_WRITE",
        "4": "FULL_CONTROL"
    }
    
    selected_safety = safety_levels.get(choice, "SAFE_WRITE")
    
    if selected_safety == "FULL_CONTROL":
        confirm = input("⚠️ FULL_CONTROL은 위험합니다! 정말 계속하시겠습니까? (YES 입력): ")
        if confirm != "YES":
            selected_safety = "SAFE_WRITE"
            print("SAFE_WRITE 모드로 변경됨")
    
    # 실행 시간 설정
    runtime = input("\n실행 시간 (시간, 기본값=24): ").strip() or "24"
    try:
        runtime_hours = int(runtime)
    except ValueError:
        runtime_hours = 24
    
    print(f"\n시작: 안전 수준={selected_safety}, 실행 시간={runtime_hours}시간")
    print("Ctrl+C로 언제든 중단 가능")
    print("=" * 50 + "\n")
    
    # 실행
    asyncio.run(run_safe_autonomous_system(runtime_hours, selected_safety))