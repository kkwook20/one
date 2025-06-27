# backend/routers/argosa/analysis/configs.py
"""통합 설정 관리 시스템"""

import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# 설정 파일 경로
SETTINGS_DIR = Path(__file__).parent / "settings"
SETTINGS_DIR.mkdir(exist_ok=True)
SETTINGS_FILE = SETTINGS_DIR / "analysis_settings.json"

# 기본 설정
DEFAULT_SETTINGS = {
    "ai_models": {
        "default": None,
        "specialized": {}
    },
    "lm_studio_config": {
        "endpoint": "http://localhost:1234/v1/chat/completions",
        "model": "local-model",
        "temperature": 0.7,
        "maxTokens": 2000
    },
    "network_instances": [],  # 네트워크 인스턴스 저장
    "distributed_settings": {
        "enabled": True,
        "auto_discover": False,
        "instance_selection": "performance",  # performance, round_robin, manual
        "max_retries": 3,
        "timeout": 60
    },
    "ui_preferences": {
        "dark_mode": False,
        "auto_refresh": True,
        "debug_mode": False,
        "metrics_update_interval": 5
    },
    "performance": {
        "response_time_threshold": 5000,
        "max_concurrent_requests": 10,
        "cache_duration": 60,
        "batch_processing": True,
        "response_streaming": True,
        "gpu_acceleration": False
    },
    "system": {
        "update_interval": 5,
        "max_chart_data_points": 100,
        "history_retention_days": 30,
        "cache_ttl_seconds": 3600,
        "agent_timeout_seconds": 300,
        "retry_count": 3
    }
}

class NetworkInstanceConfig:
    """네트워크 인스턴스 설정"""
    
    def __init__(self, data: Dict[str, Any]):
        self.id = data.get("id", "")
        self.host = data.get("host", "")
        self.hostname = data.get("hostname", self.host)  # 호스트명
        self.port = data.get("port", 1234)
        self.enabled = data.get("enabled", True)  # 분산 실행 참여 여부
        self.is_registered = data.get("is_registered", False)  # 등록 여부
        self.priority = data.get("priority", 1)  # 우선순위
        self.tags = data.get("tags", [])  # 태그 (예: "gpu", "high-memory")
        self.max_concurrent_tasks = data.get("max_concurrent_tasks", 5)
        self.last_connected = data.get("last_connected")
        self.performance_history = data.get("performance_history", [])
        self.notes = data.get("notes", "")
        self.is_local = data.get("is_local", False)  # localhost 여부
        
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "host": self.host,
            "hostname": self.hostname,
            "port": self.port,
            "enabled": self.enabled,
            "is_registered": self.is_registered,
            "priority": self.priority,
            "tags": self.tags,
            "max_concurrent_tasks": self.max_concurrent_tasks,
            "last_connected": self.last_connected,
            "performance_history": self.performance_history[-100:],  # 최근 100개만
            "notes": self.notes,
            "is_local": self.is_local
        }

def load_settings() -> Dict[str, Any]:
    """설정 로드"""
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                # 기본값과 병합
                for key, default_value in DEFAULT_SETTINGS.items():
                    if key not in settings:
                        settings[key] = default_value
                    elif isinstance(default_value, dict):
                        # 중첩된 딕셔너리 병합
                        for sub_key, sub_value in default_value.items():
                            if sub_key not in settings[key]:
                                settings[key][sub_key] = sub_value
                return settings
        except Exception as e:
            logger.error(f"Failed to load settings: {e}")
    
    return DEFAULT_SETTINGS.copy()

def save_settings(settings: Dict[str, Any]) -> bool:
    """설정 저장"""
    try:
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        return False

def get_network_instances() -> List[NetworkInstanceConfig]:
    """네트워크 인스턴스 목록 가져오기"""
    settings = load_settings()
    instances = []
    for inst_data in settings.get("network_instances", []):
        instances.append(NetworkInstanceConfig(inst_data))
    return instances

def save_network_instance(instance: NetworkInstanceConfig) -> bool:
    """네트워크 인스턴스 저장/업데이트"""
    settings = load_settings()
    instances = settings.get("network_instances", [])
    
    # 기존 인스턴스 찾기
    found = False
    for i, inst in enumerate(instances):
        if inst.get("id") == instance.id:
            instances[i] = instance.to_dict()
            found = True
            break
    
    if not found:
        instances.append(instance.to_dict())
    
    settings["network_instances"] = instances
    return save_settings(settings)

def remove_network_instance(instance_id: str) -> bool:
    """네트워크 인스턴스 제거"""
    settings = load_settings()
    instances = settings.get("network_instances", [])
    
    settings["network_instances"] = [
        inst for inst in instances if inst.get("id") != instance_id
    ]
    
    return save_settings(settings)

def get_enabled_instances() -> List[NetworkInstanceConfig]:
    """활성화된 인스턴스만 가져오기"""
    return [inst for inst in get_network_instances() if inst.enabled]

def get_registered_instances() -> List[NetworkInstanceConfig]:
    """등록된 인스턴스만 가져오기"""
    return [inst for inst in get_network_instances() if inst.is_registered]

def update_instance_performance(instance_id: str, metrics: Dict[str, Any]) -> bool:
    """인스턴스 성능 기록 업데이트"""
    settings = load_settings()
    instances = settings.get("network_instances", [])
    
    for inst in instances:
        if inst.get("id") == instance_id:
            history = inst.get("performance_history", [])
            history.append({
                "timestamp": datetime.now().isoformat(),
                "response_time": metrics.get("response_time"),
                "success": metrics.get("success", True),
                "model": metrics.get("model"),
                "task_type": metrics.get("task_type")
            })
            inst["performance_history"] = history[-100:]  # 최근 100개만
            break
    
    settings["network_instances"] = instances
    return save_settings(settings)

def get_ai_models() -> Dict[str, Any]:
    """AI 모델 설정 가져오기"""
    settings = load_settings()
    return settings.get("ai_models", DEFAULT_SETTINGS["ai_models"])

def update_ai_models(models: Dict[str, Any]) -> bool:
    """AI 모델 설정 업데이트"""
    settings = load_settings()
    settings["ai_models"] = models
    return save_settings(settings)

def get_distributed_settings() -> Dict[str, Any]:
    """분산 실행 설정 가져오기"""
    settings = load_settings()
    return settings.get("distributed_settings", DEFAULT_SETTINGS["distributed_settings"])

def update_distributed_settings(dist_settings: Dict[str, Any]) -> bool:
    """분산 실행 설정 업데이트"""
    settings = load_settings()
    settings["distributed_settings"] = dist_settings
    return save_settings(settings)

def get_all_settings() -> Dict[str, Any]:
    """모든 설정 가져오기"""
    return load_settings()

def update_all_settings(new_settings: Dict[str, Any]) -> bool:
    """모든 설정 업데이트"""
    # 기본 설정과 병합
    settings = DEFAULT_SETTINGS.copy()
    for key, value in new_settings.items():
        if key in settings:
            if isinstance(value, dict) and isinstance(settings[key], dict):
                settings[key].update(value)
            else:
                settings[key] = value
    
    return save_settings(settings)

# 에이전트 타입 정의
from enum import Enum

class EnhancedAgentType(Enum):
    """향상된 에이전트 타입"""
    ANALYST = "analyst"
    PREDICTOR = "predictor"
    OPTIMIZER = "optimizer"
    ANOMALY_DETECTOR = "anomaly_detector"
    ARCHITECT = "architect"
    CODE_ANALYZER = "code_analyzer"
    CODE_GENERATOR = "code_generator"
    CODE_REVIEWER = "code_reviewer"
    IMPLEMENTER = "implementer"
    TEST_DESIGNER = "test_designer"
    REFACTORER = "refactorer"
    INTEGRATOR = "integrator"
    STRATEGIST = "strategist"
    RISK_ASSESSOR = "risk_assessor"
    PLANNER = "planner"
    REASONER = "reasoner"
    DECISION_MAKER = "decision_maker"
    WEB_SEARCHER = "web_searcher"
    DOC_SEARCHER = "doc_searcher"
    COORDINATOR = "coordinator"
    TESTER = "tester"

# 에이전트 설정
AGENT_CONFIGS = {
    EnhancedAgentType.ANALYST: {
        "name": "Data Analysis Expert",
        "capabilities": ["pattern_recognition", "statistical_analysis", "data_visualization"],
        "max_context": 4096,
        "temperature": 0.7
    },
    EnhancedAgentType.CODE_GENERATOR: {
        "name": "Code Generation Specialist", 
        "capabilities": ["code_generation", "api_integration", "algorithm_design"],
        "max_context": 8192,
        "temperature": 0.3
    },
    EnhancedAgentType.ARCHITECT: {
        "name": "Software Architect",
        "capabilities": ["system_design", "architecture_patterns", "technology_selection"],
        "max_context": 4096,
        "temperature": 0.5
    },
    EnhancedAgentType.CODE_REVIEWER: {
        "name": "Code Review Specialist",
        "capabilities": ["code_review", "best_practices", "security_analysis"],
        "max_context": 8192,
        "temperature": 0.3
    },
    EnhancedAgentType.STRATEGIST: {
        "name": "Strategic Planning Expert",
        "capabilities": ["strategic_analysis", "roadmap_creation", "risk_assessment"],
        "max_context": 4096,
        "temperature": 0.6
    },
    EnhancedAgentType.PLANNER: {
        "name": "Task Planning Specialist",
        "capabilities": ["task_breakdown", "dependency_analysis", "timeline_estimation"],
        "max_context": 4096,
        "temperature": 0.5
    },
    EnhancedAgentType.TESTER: {
        "name": "Test Design Specialist",
        "capabilities": ["test_generation", "coverage_analysis", "test_strategy"],
        "max_context": 8192,
        "temperature": 0.4
    },
    EnhancedAgentType.DECISION_MAKER: {
        "name": "Decision Making Expert",
        "capabilities": ["decision_analysis", "option_evaluation", "recommendation"],
        "max_context": 4096,
        "temperature": 0.4
    }
}

# 워크플로우 단계 정의
WORKFLOW_PHASES = {
    "code": [
        {"id": "initialized", "name": "Initialized", "progress": 0},
        {"id": "project_analyzed", "name": "Project Analyzed", "progress": 10},
        {"id": "requirements_understood", "name": "Requirements Understood", "progress": 20},
        {"id": "architecture_designed", "name": "Architecture Designed", "progress": 30},
        {"id": "tasks_decomposed", "name": "Tasks Decomposed", "progress": 40},
        {"id": "code_generation", "name": "Code Generation", "progress": 50},
        {"id": "code_integrated", "name": "Code Integrated", "progress": 80},
        {"id": "tests_generated", "name": "Tests Generated", "progress": 90},
        {"id": "completed", "name": "Completed", "progress": 100}
    ],
    "analysis": [
        {"id": "initialized", "name": "Initialized", "progress": 0},
        {"id": "data_collected", "name": "Data Collected", "progress": 25},
        {"id": "data_analyzed", "name": "Data Analyzed", "progress": 50},
        {"id": "insights_generated", "name": "Insights Generated", "progress": 75},
        {"id": "visualizations_created", "name": "Visualizations Created", "progress": 90},
        {"id": "completed", "name": "Completed", "progress": 100}
    ]
}

# 기본 AI 모델 설정
DEFAULT_AI_MODELS = {
    "default": None,  # 시작 시 설정됨
    "specialized": {
        EnhancedAgentType.CODE_GENERATOR: None,
        EnhancedAgentType.ANALYST: None,
        EnhancedAgentType.ARCHITECT: None
    }
}

# 웹 검색 패턴
WEB_SEARCH_PATTERNS = {
    "realtime": ["current", "latest", "today", "now", "실시간", "최신"],
    "statistics": ["statistics", "data", "numbers", "통계", "데이터"],
    "comparison": ["vs", "versus", "compare", "비교", "대비"],
    "external": ["market", "industry", "competitor", "시장", "업계", "경쟁사"]
}

# 시스템 설정
SYSTEM_CONFIG = {
    "cache_ttl_seconds": 3600,
    "agent_timeout_seconds": 300,
    "retry_count": 3,
    "metrics_update_interval": 5,
    "max_workflow_history": 100
}

# 에러 메시지
ERROR_MESSAGES = {
    "workflow_not_found": "Workflow not found",
    "agent_not_available": "Agent not available",
    "invalid_request": "Invalid request format",
    "timeout": "Operation timed out",
    "llm_connection_failed": "Failed to connect to LLM"
}