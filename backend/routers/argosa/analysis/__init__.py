# backend/routers/argosa/analysis/__init__.py
"""Argosa Analysis Modules"""

from enum import Enum

# helpers.py에서 import
from .helpers import *

# prompts.py에서 import
from .prompts import AGENT_PROMPTS

# data_analysis.py에서 필요한 추가 정의들
class EnhancedAgentType(Enum):
    ANALYST = "analyst"
    STRATEGIST = "strategist"
    PLANNER = "planner"
    ARCHITECT = "architect"
    CODE_GENERATOR = "code_generator"
    CODE_REVIEWER = "code_reviewer"
    TESTER = "test_designer"
    DECISION_MAKER = "decision_maker"

AGENT_CONFIGS = {
    EnhancedAgentType.ANALYST: {
        "name": "Data Analyst",
        "capabilities": ["data_analysis", "pattern_recognition", "insight_generation"]
    },
    EnhancedAgentType.STRATEGIST: {
        "name": "Strategic Advisor", 
        "capabilities": ["strategic_planning", "decision_making", "risk_assessment"]
    },
    EnhancedAgentType.PLANNER: {
        "name": "Project Planner",
        "capabilities": ["task_decomposition", "timeline_estimation", "resource_allocation"]
    },
    EnhancedAgentType.ARCHITECT: {
        "name": "System Architect",
        "capabilities": ["system_design", "integration_planning", "architecture_patterns"]
    },
    EnhancedAgentType.CODE_GENERATOR: {
        "name": "Code Generator",
        "capabilities": ["code_generation", "implementation", "optimization"]
    },
    EnhancedAgentType.CODE_REVIEWER: {
        "name": "Code Reviewer",
        "capabilities": ["code_review", "quality_assessment", "best_practices"]
    },
    EnhancedAgentType.TESTER: {
        "name": "Test Engineer",
        "capabilities": ["test_generation", "test_execution", "coverage_analysis"]
    },
    EnhancedAgentType.DECISION_MAKER: {
        "name": "Decision Maker",
        "capabilities": ["decision_analysis", "option_evaluation", "recommendation"]
    }
}

WORKFLOW_PHASES = {
    "code": [
        {"id": "initialized", "progress": 0},
        {"id": "project_analyzed", "progress": 10},
        {"id": "requirements_understood", "progress": 20},
        {"id": "architecture_designed", "progress": 30},
        {"id": "tasks_decomposed", "progress": 40},
        {"id": "code_generation", "progress": 50},
        {"id": "code_integrated", "progress": 80},
        {"id": "tests_generated", "progress": 90},
        {"id": "completed", "progress": 100}
    ],
    "analysis": [
        {"id": "initialized", "progress": 0},
        {"id": "data_collected", "progress": 20},
        {"id": "data_analyzed", "progress": 40},
        {"id": "insights_generated", "progress": 60},
        {"id": "visualizations_created", "progress": 80},
        {"id": "completed", "progress": 100}
    ]
}

DEFAULT_AI_MODELS = {
    "default": "gpt-4",
    "specialized": {
        EnhancedAgentType.CODE_GENERATOR: "codellama-34b",
        EnhancedAgentType.ANALYST: "mixtral-8x7b",
        EnhancedAgentType.STRATEGIST: "gpt-4"
    }
}

WEB_SEARCH_PATTERNS = {
    "real_time": ["current", "today", "now", "latest", "recent"],
    "external": ["market", "competitor", "industry", "trends", "news"],
    "comparison": ["vs", "versus", "compare", "benchmark", "against"]
}

SYSTEM_CONFIG = {
    "agent_timeout_seconds": 300,
    "retry_count": 3,
    "cache_ttl_seconds": 3600,
    "metrics_update_interval": 5
}

ERROR_MESSAGES = {
    "workflow_not_found": "Workflow not found",
    "agent_not_available": "Agent not available",
    "invalid_request": "Invalid request format"
}