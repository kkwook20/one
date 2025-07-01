#!/usr/bin/env python3
"""
Claude Bridge Configuration
브릿지 시스템 설정 관리
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional
from enum import Enum
from dataclasses import dataclass, asdict

class SafetyLevel(Enum):
    """안전 수준"""
    READ_ONLY = "read_only"          # 읽기만 가능
    SAFE_WRITE = "safe_write"        # 백업 후 쓰기
    SIMULATION = "simulation"        # 시뮬레이션만
    FULL_CONTROL = "full_control"    # 전체 제어 (위험!)

class LogLevel(Enum):
    """로그 레벨"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"

@dataclass
class BrowserConfig:
    """브라우저 설정"""
    default_browser: str = "chrome"
    headless: bool = False
    window_size: tuple = (1920, 1080)
    user_data_dir: Optional[str] = None
    chrome_path: Optional[str] = None
    firefox_path: Optional[str] = None
    timeout: int = 30

@dataclass
class VSCodeConfig:
    """VS Code 설정"""
    executable_path: Optional[str] = None
    workspace_path: Optional[str] = None
    extensions_path: Optional[str] = None
    claude_window_title: str = "Claude"
    response_timeout: int = 60
    screenshot_on_action: bool = True

@dataclass
class ExecutorConfig:
    """실행기 설정"""
    max_command_timeout: int = 300
    allowed_directories: list = None
    blocked_commands: list = None
    require_confirmation: bool = True
    backup_before_modify: bool = True

@dataclass
class MonitorConfig:
    """모니터링 설정"""
    check_interval: int = 30
    max_cpu_usage: float = 80.0
    max_memory_usage: float = 80.0
    disk_space_threshold: float = 10.0  # GB
    log_system_stats: bool = True

@dataclass
class KanbanConfig:
    """칸반 보드 설정"""
    save_interval: int = 60
    max_tasks: int = 1000
    auto_backup: bool = True
    progress_report_interval: int = 300  # 5시간 = 300분

class BridgeConfig:
    """메인 브릿지 설정"""
    
    def __init__(self, config_path: Optional[str] = None):
        # 기본 설정
        self.safety_level = SafetyLevel.SAFE_WRITE
        self.log_level = LogLevel.INFO
        self.project_root = Path("F:/ONE_AI")
        self.data_dir = self.project_root / ".claude_bridge"
        self.logs_dir = self.data_dir / "logs"
        self.backups_dir = self.data_dir / "backups"
        
        # 서브 설정들
        self.browser = BrowserConfig()
        self.vscode = VSCodeConfig()
        self.executor = ExecutorConfig()
        self.monitor = MonitorConfig()
        self.kanban = KanbanConfig()
        
        # 네트워크 설정
        self.server_host = "127.0.0.1"
        self.server_port = 8888
        self.websocket_timeout = 60
        
        # 설정 파일에서 로드
        if config_path:
            self.load_from_file(config_path)
        else:
            # 기본 설정 파일 경로
            default_config = self.data_dir / "config.json"
            if default_config.exists():
                self.load_from_file(str(default_config))
        
        # 디렉토리 생성
        self._create_directories()
        
        # 안전 설정 검증
        self._validate_safety_settings()
    
    def _create_directories(self):
        """필요한 디렉토리 생성"""
        for directory in [self.data_dir, self.logs_dir, self.backups_dir]:
            directory.mkdir(parents=True, exist_ok=True)
    
    def _validate_safety_settings(self):
        """안전 설정 검증"""
        # FULL_CONTROL 모드 경고
        if self.safety_level == SafetyLevel.FULL_CONTROL:
            print("⚠️ WARNING: FULL_CONTROL mode is enabled!")
            print("⚠️ This allows dangerous operations that could delete files!")
            print("⚠️ Use with extreme caution!")
        
        # 실행기 안전 설정 확인
        if self.executor.allowed_directories is None:
            self.executor.allowed_directories = [str(self.project_root)]
        
        if self.executor.blocked_commands is None:
            self.executor.blocked_commands = [
                "rm -rf",
                "del /f /s /q",
                "format",
                "fdisk",
                "dd if=",
                "shutdown",
                "reboot"
            ]
    
    def load_from_file(self, config_path: str):
        """파일에서 설정 로드"""
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            
            # 메인 설정
            if 'safety_level' in config_data:
                self.safety_level = SafetyLevel(config_data['safety_level'])
            
            if 'log_level' in config_data:
                self.log_level = LogLevel(config_data['log_level'])
            
            if 'project_root' in config_data:
                self.project_root = Path(config_data['project_root'])
            
            # 서브 설정 업데이트
            if 'browser' in config_data:
                self._update_dataclass(self.browser, config_data['browser'])
            
            if 'vscode' in config_data:
                self._update_dataclass(self.vscode, config_data['vscode'])
            
            if 'executor' in config_data:
                self._update_dataclass(self.executor, config_data['executor'])
            
            if 'monitor' in config_data:
                self._update_dataclass(self.monitor, config_data['monitor'])
            
            if 'kanban' in config_data:
                self._update_dataclass(self.kanban, config_data['kanban'])
            
            print(f"Configuration loaded from {config_path}")
            
        except Exception as e:
            print(f"Failed to load config from {config_path}: {e}")
            print("Using default configuration")
    
    def _update_dataclass(self, obj, data: Dict[str, Any]):
        """데이터클래스 업데이트"""
        for key, value in data.items():
            if hasattr(obj, key):
                setattr(obj, key, value)
    
    def save_to_file(self, config_path: Optional[str] = None):
        """설정을 파일에 저장"""
        if config_path is None:
            config_path = self.data_dir / "config.json"
        
        config_data = {
            'safety_level': self.safety_level.value,
            'log_level': self.log_level.value,
            'project_root': str(self.project_root),
            'server_host': self.server_host,
            'server_port': self.server_port,
            'websocket_timeout': self.websocket_timeout,
            'browser': asdict(self.browser),
            'vscode': asdict(self.vscode),
            'executor': asdict(self.executor),
            'monitor': asdict(self.monitor),
            'kanban': asdict(self.kanban)
        }
        
        try:
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=2, ensure_ascii=False)
            print(f"Configuration saved to {config_path}")
        except Exception as e:
            print(f"Failed to save config to {config_path}: {e}")
    
    def get_safe_paths(self) -> list:
        """안전한 경로 목록 반환"""
        safe_paths = [
            str(self.project_root),
            str(self.data_dir),
            "C:/temp",
            "C:/tmp",
            "/tmp",
            "/var/tmp"
        ]
        
        if self.executor.allowed_directories:
            safe_paths.extend(self.executor.allowed_directories)
        
        return list(set(safe_paths))
    
    def is_path_safe(self, path: str) -> bool:
        """경로가 안전한지 확인"""
        path = Path(path).resolve()
        safe_paths = [Path(p).resolve() for p in self.get_safe_paths()]
        
        return any(
            str(path).startswith(str(safe_path))
            for safe_path in safe_paths
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """설정을 딕셔너리로 변환"""
        return {
            'safety_level': self.safety_level.value,
            'log_level': self.log_level.value,
            'project_root': str(self.project_root),
            'server_host': self.server_host,
            'server_port': self.server_port,
            'browser': asdict(self.browser),
            'vscode': asdict(self.vscode),
            'executor': asdict(self.executor),
            'monitor': asdict(self.monitor),
            'kanban': asdict(self.kanban)
        }

# 전역 설정 인스턴스
_global_config: Optional[BridgeConfig] = None

def get_config() -> BridgeConfig:
    """전역 설정 인스턴스 반환"""
    global _global_config
    if _global_config is None:
        _global_config = BridgeConfig()
    return _global_config

def set_config(config: BridgeConfig):
    """전역 설정 인스턴스 설정"""
    global _global_config
    _global_config = config

# 환경 변수 오버라이드
def apply_env_overrides(config: BridgeConfig):
    """환경 변수로 설정 오버라이드"""
    # 안전 수준
    if safety_level := os.getenv('CLAUDE_BRIDGE_SAFETY_LEVEL'):
        try:
            config.safety_level = SafetyLevel(safety_level)
        except ValueError:
            print(f"Invalid safety level: {safety_level}")
    
    # 로그 레벨
    if log_level := os.getenv('CLAUDE_BRIDGE_LOG_LEVEL'):
        try:
            config.log_level = LogLevel(log_level)
        except ValueError:
            print(f"Invalid log level: {log_level}")
    
    # 서버 설정
    if host := os.getenv('CLAUDE_BRIDGE_HOST'):
        config.server_host = host
    
    if port := os.getenv('CLAUDE_BRIDGE_PORT'):
        try:
            config.server_port = int(port)
        except ValueError:
            print(f"Invalid port: {port}")
    
    # 프로젝트 루트
    if project_root := os.getenv('CLAUDE_BRIDGE_PROJECT_ROOT'):
        config.project_root = Path(project_root)

if __name__ == "__main__":
    # 설정 테스트
    config = BridgeConfig()
    print(f"Safety Level: {config.safety_level.value}")
    print(f"Project Root: {config.project_root}")
    print(f"Safe Paths: {config.get_safe_paths()}")
    
    # 설정 저장 테스트
    config.save_to_file()
    print("Configuration test completed")