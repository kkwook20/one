#!/usr/bin/env python3
"""
Safety Manager - 안전 관리 시스템
파일 삭제나 위험한 작업을 방지하는 핵심 모듈
"""

import os
import re
import shutil
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Set
from datetime import datetime
from enum import Enum
from dataclasses import dataclass

logger = logging.getLogger(__name__)

class SafetyLevel(Enum):
    """안전 수준"""
    READ_ONLY = "read_only"          # 읽기만 가능
    SAFE_WRITE = "safe_write"        # 백업 후 쓰기
    SIMULATION = "simulation"        # 시뮬레이션만
    FULL_CONTROL = "full_control"    # 전체 제어 (위험!)

class OperationType(Enum):
    """작업 유형"""
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    EXECUTE = "execute"
    NETWORK = "network"
    SYSTEM = "system"

@dataclass
class SafetyRule:
    """안전 규칙"""
    name: str
    pattern: str
    operation: OperationType
    allowed: bool
    reason: str

class SafetyManager:
    """안전 관리자 - 모든 위험한 작업을 방지"""
    
    def __init__(self, safety_level: SafetyLevel = SafetyLevel.SAFE_WRITE):
        self.safety_level = safety_level
        self.project_root = Path("F:/ONE_AI")
        self.backup_dir = self.project_root / ".claude_bridge" / "backups"
        self.blocked_operations = []
        self.safety_violations = []
        
        # 백업 디렉토리 생성
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        # 안전 규칙 초기화
        self._initialize_safety_rules()
        
        logger.info(f"SafetyManager initialized with level: {safety_level.value}")
    
    def _initialize_safety_rules(self):
        """안전 규칙 초기화"""
        self.safety_rules = [
            # 파일 삭제 방지 (가장 중요!)
            SafetyRule("no_delete_all", r"rm\s+-rf\s+/", OperationType.DELETE, False, "System-wide deletion blocked"),
            SafetyRule("no_delete_all_win", r"del\s+/[fFsS]\s+/[qQ]\s+\*", OperationType.DELETE, False, "Windows bulk deletion blocked"),
            SafetyRule("no_format", r"format\s+[cCdDeE]:", OperationType.DELETE, False, "Drive formatting blocked"),
            SafetyRule("no_rmdir_force", r"rmdir\s+/[sS]\s+", OperationType.DELETE, False, "Force directory removal blocked"),
            
            # 시스템 명령 방지
            SafetyRule("no_shutdown", r"shutdown|reboot|halt", OperationType.SYSTEM, False, "System shutdown blocked"),
            SafetyRule("no_registry_edit", r"regedit|reg\s+delete", OperationType.SYSTEM, False, "Registry modification blocked"),
            SafetyRule("no_disk_ops", r"fdisk|diskpart", OperationType.SYSTEM, False, "Disk operations blocked"),
            
            # 네트워크 보안
            SafetyRule("no_malicious_download", r"wget|curl.*\.(exe|bat|cmd|ps1)$", OperationType.NETWORK, False, "Malicious download blocked"),
            
            # 프로젝트 파일 보호
            SafetyRule("protect_backend", r"del.*backend", OperationType.DELETE, False, "Backend deletion blocked"),
            SafetyRule("protect_frontend", r"del.*frontend", OperationType.DELETE, False, "Frontend deletion blocked"),
            SafetyRule("protect_claude_md", r"del.*CLAUDE\.md", OperationType.DELETE, False, "CLAUDE.md deletion blocked"),
        ]
    
    def is_operation_safe(self, operation: str, operation_type: OperationType) -> tuple[bool, str]:
        """작업이 안전한지 확인"""
        
        # READ_ONLY 모드에서는 읽기만 허용
        if self.safety_level == SafetyLevel.READ_ONLY:
            if operation_type != OperationType.READ:
                return False, f"READ_ONLY mode: {operation_type.value} operations not allowed"
        
        # SIMULATION 모드에서는 시뮬레이션만
        if self.safety_level == SafetyLevel.SIMULATION:
            return True, "SIMULATION mode: operation simulated"
        
        # 안전 규칙 검사
        for rule in self.safety_rules:
            if rule.operation == operation_type or rule.operation == OperationType.SYSTEM:
                if re.search(rule.pattern, operation, re.IGNORECASE):
                    if not rule.allowed:
                        self._log_safety_violation(operation, rule)
                        return False, f"BLOCKED: {rule.reason}"
        
        # FULL_CONTROL에서는 모든 것 허용 (위험!)
        if self.safety_level == SafetyLevel.FULL_CONTROL:
            return True, "FULL_CONTROL: operation allowed"
        
        return True, "Operation appears safe"
    
    def is_command_safe(self, command: Dict[str, Any]) -> bool:
        """명령이 안전한지 확인"""
        try:
            cmd_str = str(command)
            
            # 명령 유형 추론
            operation_type = self._infer_operation_type(command)
            
            # 안전성 검사
            is_safe, reason = self.is_operation_safe(cmd_str, operation_type)
            
            if not is_safe:
                logger.warning(f"Unsafe command blocked: {cmd_str[:100]}... Reason: {reason}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error checking command safety: {e}")
            return False  # 에러가 있으면 안전하지 않다고 가정
    
    def _infer_operation_type(self, command: Dict[str, Any]) -> OperationType:
        """명령에서 작업 유형 추론"""
        cmd_str = str(command).lower()
        
        if any(word in cmd_str for word in ['delete', 'del', 'rm', 'rmdir', 'remove']):
            return OperationType.DELETE
        elif any(word in cmd_str for word in ['write', 'save', 'create', 'mkdir', 'touch']):
            return OperationType.WRITE
        elif any(word in cmd_str for word in ['execute', 'run', 'start', 'exec']):
            return OperationType.EXECUTE
        elif any(word in cmd_str for word in ['wget', 'curl', 'download', 'fetch']):
            return OperationType.NETWORK
        elif any(word in cmd_str for word in ['read', 'cat', 'type', 'get', 'list']):
            return OperationType.READ
        else:
            return OperationType.SYSTEM
    
    def _log_safety_violation(self, operation: str, rule: SafetyRule):
        """안전 위반 로그"""
        violation = {
            "timestamp": datetime.now().isoformat(),
            "operation": operation,
            "rule": rule.name,
            "reason": rule.reason,
            "safety_level": self.safety_level.value
        }
        
        self.safety_violations.append(violation)
        logger.error(f"SAFETY VIOLATION: {rule.reason} - Operation: {operation[:100]}")
        
        # 위반 기록 저장
        violation_file = self.backup_dir / "safety_violations.json"
        try:
            with open(violation_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(violation) + '\n')
        except Exception as e:
            logger.error(f"Failed to log safety violation: {e}")
    
    def create_backup(self, file_path: Path) -> Optional[Path]:
        """파일 백업 생성"""
        if not file_path.exists():
            return None
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{file_path.name}.{timestamp}.backup"
        backup_path = self.backup_dir / backup_name
        
        try:
            if file_path.is_file():
                shutil.copy2(file_path, backup_path)
            elif file_path.is_dir():
                shutil.copytree(file_path, backup_path)
            
            logger.info(f"Created backup: {backup_path}")
            return backup_path
            
        except Exception as e:
            logger.error(f"Failed to create backup for {file_path}: {e}")
            return None
    
    def safe_file_operation(self, file_path: Path, operation: str, content: Optional[str] = None) -> bool:
        """안전한 파일 작업"""
        
        # 경로 안전성 검사
        if not self.is_path_safe(file_path):
            logger.error(f"Unsafe path: {file_path}")
            return False
        
        # 작업 안전성 검사
        operation_type = OperationType.WRITE if content else OperationType.READ
        is_safe, reason = self.is_operation_safe(operation, operation_type)
        
        if not is_safe:
            logger.error(f"Unsafe file operation: {reason}")
            return False
        
        # SIMULATION 모드
        if self.safety_level == SafetyLevel.SIMULATION:
            logger.info(f"SIMULATION: Would perform {operation} on {file_path}")
            return True
        
        # READ_ONLY 모드
        if self.safety_level == SafetyLevel.READ_ONLY and content is not None:
            logger.warning(f"READ_ONLY: Write operation blocked for {file_path}")
            return False
        
        # 백업 생성 (쓰기 작업의 경우)
        if content is not None and file_path.exists():
            backup_path = self.create_backup(file_path)
            if not backup_path and self.safety_level == SafetyLevel.SAFE_WRITE:
                logger.error(f"Failed to create backup for {file_path}, aborting operation")
                return False
        
        try:
            if content is not None:
                # 쓰기 작업
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                logger.info(f"Successfully wrote to {file_path}")
            else:
                # 읽기 작업
                with open(file_path, 'r', encoding='utf-8') as f:
                    return f.read()
            
            return True
            
        except Exception as e:
            logger.error(f"File operation failed: {e}")
            
            # 백업에서 복원 시도
            if content is not None and backup_path and backup_path.exists():
                try:
                    if file_path.is_file():
                        shutil.copy2(backup_path, file_path)
                    elif file_path.is_dir():
                        shutil.rmtree(file_path, ignore_errors=True)
                        shutil.copytree(backup_path, file_path)
                    logger.info(f"Restored {file_path} from backup")
                except Exception as restore_error:
                    logger.error(f"Failed to restore from backup: {restore_error}")
            
            return False
    
    def is_path_safe(self, path: Path) -> bool:
        """경로가 안전한지 확인"""
        try:
            path = path.resolve()
            
            # 시스템 중요 디렉토리 보호
            unsafe_paths = [
                Path("C:/Windows"),
                Path("C:/Program Files"),
                Path("C:/Program Files (x86)"),
                Path("/bin"),
                Path("/sbin"),
                Path("/usr/bin"),
                Path("/usr/sbin"),
                Path("/etc"),
                Path("/sys"),
                Path("/proc")
            ]
            
            for unsafe_path in unsafe_paths:
                try:
                    if str(path).startswith(str(unsafe_path.resolve())):
                        return False
                except:
                    continue
            
            # 프로젝트 루트 내부는 안전
            if str(path).startswith(str(self.project_root.resolve())):
                return True
            
            # 임시 디렉토리는 안전
            safe_temp_paths = [
                Path("C:/temp"),
                Path("C:/tmp"),
                Path("/tmp"),
                Path("/var/tmp")
            ]
            
            for safe_path in safe_temp_paths:
                try:
                    if str(path).startswith(str(safe_path.resolve())):
                        return True
                except:
                    continue
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking path safety: {e}")
            return False
    
    def get_safety_report(self) -> Dict[str, Any]:
        """안전 보고서 생성"""
        return {
            "safety_level": self.safety_level.value,
            "total_violations": len(self.safety_violations),
            "recent_violations": self.safety_violations[-10:] if self.safety_violations else [],
            "blocked_operations": len(self.blocked_operations),
            "safety_rules_count": len(self.safety_rules),
            "backup_directory": str(self.backup_dir),
            "project_root": str(self.project_root)
        }
    
    def emergency_stop(self) -> bool:
        """긴급 정지 - 모든 작업 중단"""
        logger.critical("EMERGENCY STOP ACTIVATED")
        
        # 안전 수준을 READ_ONLY로 변경
        self.safety_level = SafetyLevel.READ_ONLY
        
        # 긴급 정지 로그
        emergency_log = {
            "timestamp": datetime.now().isoformat(),
            "action": "emergency_stop",
            "reason": "Manual emergency stop activated",
            "violations_count": len(self.safety_violations)
        }
        
        try:
            emergency_file = self.backup_dir / "emergency_stop.json"
            with open(emergency_file, 'w', encoding='utf-8') as f:
                json.dump(emergency_log, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to log emergency stop: {e}")
        
        return True

# 전역 안전 관리자
_global_safety_manager: Optional[SafetyManager] = None

def get_safety_manager() -> SafetyManager:
    """전역 안전 관리자 반환"""
    global _global_safety_manager
    if _global_safety_manager is None:
        _global_safety_manager = SafetyManager()
    return _global_safety_manager

def set_safety_level(level: SafetyLevel):
    """안전 수준 설정"""
    safety_manager = get_safety_manager()
    safety_manager.safety_level = level
    logger.info(f"Safety level changed to: {level.value}")

def emergency_stop():
    """긴급 정지"""
    safety_manager = get_safety_manager()
    return safety_manager.emergency_stop()

if __name__ == "__main__":
    # 안전 관리자 테스트
    safety = SafetyManager(SafetyLevel.SAFE_WRITE)
    
    # 위험한 명령 테스트
    dangerous_commands = [
        {"command": "del /f /s /q *"},
        {"command": "rm -rf /"},
        {"command": "format c:"},
        {"command": "shutdown -s -t 0"}
    ]
    
    for cmd in dangerous_commands:
        is_safe = safety.is_command_safe(cmd)
        print(f"Command: {cmd['command'][:20]}... Safe: {is_safe}")
    
    # 안전 보고서
    report = safety.get_safety_report()
    print(f"\nSafety Report: {json.dumps(report, indent=2)}")