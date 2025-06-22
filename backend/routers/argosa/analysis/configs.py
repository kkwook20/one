# backend/routers/argosa/analysis/configs.py
"""설정값과 상수 정의"""

from enum import Enum
from typing import Dict, List, Any

# 에이전트 타입 정의
class EnhancedAgentType(str, Enum):
    """통합 AI 에이전트 타입"""
    # 데이터 분석 에이전트
    ANALYST = "analyst"
    PREDICTOR = "predictor"
    OPTIMIZER = "optimizer"
    ANOMALY_DETECTOR = "anomaly_detector"
    
    # 코드 작업 에이전트
    ARCHITECT = "architect"
    CODE_ANALYZER = "code_analyzer"
    CODE_GENERATOR = "code_generator"
    CODE_REVIEWER = "code_reviewer"
    IMPLEMENTER = "implementer"
    TESTER = "test_designer"
    REFACTORER = "refactorer"
    INTEGRATOR = "integrator"
    
    # 의사결정 에이전트
    STRATEGIST = "strategist"
    RISK_ASSESSOR = "risk_assessor"
    PLANNER = "planner"
    REASONER = "reasoner"
    DECISION_MAKER = "decision_maker"
    
    # 검색 에이전트
    WEB_SEARCHER = "web_searcher"
    DOC_SEARCHER = "doc_searcher"
    
    # 협업 조정자
    COORDINATOR = "coordinator"

# 에이전트 UI 설정
AGENT_CONFIGS = {
    EnhancedAgentType.ANALYST: {
        "name": "Data Analysis Expert",
        "capabilities": ["statistical_analysis", "pattern_recognition", "insight_generation"],
        "description": "Analyzes data patterns and generates insights"
    },
    EnhancedAgentType.PREDICTOR: {
        "name": "Prediction Specialist",
        "capabilities": ["forecasting", "trend_analysis", "scenario_planning"],
        "description": "Forecasts trends and future outcomes"
    },
    EnhancedAgentType.OPTIMIZER: {
        "name": "Optimization Engine",
        "capabilities": ["resource_optimization", "process_improvement", "efficiency_analysis"],
        "description": "Optimizes processes and resources"
    },
    EnhancedAgentType.ANOMALY_DETECTOR: {
        "name": "Anomaly Detector",
        "capabilities": ["outlier_detection", "pattern_deviation", "alert_generation"],
        "description": "Identifies unusual patterns and outliers"
    },
    EnhancedAgentType.ARCHITECT: {
        "name": "Software Architect",
        "capabilities": ["system_design", "pattern_selection", "scalability_planning"],
        "description": "Designs system architecture and structure"
    },
    EnhancedAgentType.CODE_ANALYZER: {
        "name": "Code Analysis Specialist",
        "capabilities": ["ast_analysis", "complexity_analysis", "dependency_mapping"],
        "description": "Analyzes code quality and patterns"
    },
    EnhancedAgentType.CODE_GENERATOR: {
        "name": "Code Generation Specialist",
        "capabilities": ["code_synthesis", "pattern_application", "api_design"],
        "description": "Generates code based on specifications"
    },
    EnhancedAgentType.CODE_REVIEWER: {
        "name": "Code Review Specialist",
        "capabilities": ["quality_check", "security_review", "performance_analysis"],
        "description": "Reviews code for quality and best practices"
    },
    EnhancedAgentType.IMPLEMENTER: {
        "name": "Implementation Specialist",
        "capabilities": ["detailed_implementation", "optimization", "integration"],
        "description": "Implements detailed solutions"
    },
    EnhancedAgentType.TESTER: {
        "name": "Test Design Specialist",
        "capabilities": ["test_planning", "test_generation", "coverage_analysis"],
        "description": "Designs comprehensive test strategies"
    },
    EnhancedAgentType.REFACTORER: {
        "name": "Refactoring Expert",
        "capabilities": ["code_improvement", "debt_reduction", "modernization"],
        "description": "Improves code structure and quality"
    },
    EnhancedAgentType.INTEGRATOR: {
        "name": "Integration Specialist",
        "capabilities": ["api_integration", "system_bridging", "protocol_adaptation"],
        "description": "Integrates components and systems"
    },
    EnhancedAgentType.STRATEGIST: {
        "name": "Strategic Planning Expert",
        "capabilities": ["decision_analysis", "scenario_planning", "risk_assessment"],
        "description": "Develops strategic plans and recommendations"
    },
    EnhancedAgentType.RISK_ASSESSOR: {
        "name": "Risk Assessment Expert",
        "capabilities": ["risk_identification", "impact_analysis", "mitigation_planning"],
        "description": "Evaluates and mitigates risks"
    },
    EnhancedAgentType.PLANNER: {
        "name": "Task Planning Specialist",
        "capabilities": ["task_decomposition", "dependency_analysis", "resource_planning"],
        "description": "Plans and organizes tasks efficiently"
    },
    EnhancedAgentType.REASONER: {
        "name": "Reasoning Engine",
        "capabilities": ["logical_analysis", "inference", "problem_solving"],
        "description": "Provides logical reasoning and analysis"
    },
    EnhancedAgentType.DECISION_MAKER: {
        "name": "Decision Making Expert",
        "capabilities": ["decision_analysis", "criteria_evaluation", "option_comparison"],
        "description": "Makes informed decisions based on data"
    },
    EnhancedAgentType.WEB_SEARCHER: {
        "name": "Web Search Specialist",
        "capabilities": ["web_crawling", "information_extraction", "source_validation"],
        "description": "Searches and retrieves web information"
    },
    EnhancedAgentType.DOC_SEARCHER: {
        "name": "Document Search Expert",
        "capabilities": ["document_retrieval", "content_indexing", "relevance_ranking"],
        "description": "Searches internal documents and knowledge"
    },
    EnhancedAgentType.COORDINATOR: {
        "name": "Collaboration Coordinator",
        "capabilities": ["task_distribution", "communication_management", "conflict_resolution"],
        "description": "Coordinates multi-agent collaboration"
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
        {"id": "code_generation_complete", "name": "Code Generation Complete", "progress": 70},
        {"id": "code_integrated", "name": "Code Integrated", "progress": 80},
        {"id": "tests_generated", "name": "Tests Generated", "progress": 90},
        {"id": "validation_complete", "name": "Validation Complete", "progress": 95},
        {"id": "completed", "name": "Completed", "progress": 100},
        {"id": "needs_improvement", "name": "Needs Improvement", "progress": 60}
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

# AI 모델 기본 설정
DEFAULT_AI_MODELS = {
    "default": "llama-3.1-70b-instruct",
    "specialized": {
        EnhancedAgentType.ARCHITECT: "qwen2.5-72b-instruct",
        EnhancedAgentType.CODE_GENERATOR: "deepseek-coder-33b-instruct",
        EnhancedAgentType.CODE_REVIEWER: "deepseek-r1-distill-qwen-32b",
        EnhancedAgentType.IMPLEMENTER: "wizardcoder-33b-v2",
        EnhancedAgentType.ANALYST: "llama-3.1-70b-instruct",
        EnhancedAgentType.STRATEGIST: "gpt-4o",
    }
}

# 웹 검색 트리거 패턴
WEB_SEARCH_PATTERNS = {
    "time_sensitive": [
        "최신", "현재", "오늘", "이번주", "최근",
        "current", "latest", "today", "recent", "now"
    ],
    "external_data": [
        "시장 가격", "주가", "환율", "날씨", "뉴스",
        "market price", "stock", "exchange rate", "weather", "news"
    ],
    "comparison": [
        "비교", "대조", "경쟁사", "벤치마크",
        "compare", "versus", "competitor", "benchmark"
    ]
}

# 시스템 설정
SYSTEM_CONFIG = {
    "max_concurrent_workflows": 10,
    "workflow_timeout_hours": 24,
    "agent_timeout_seconds": 300,
    "retry_count": 3,
    "cache_ttl_seconds": 3600,
    "websocket_ping_interval": 30,
    "metrics_update_interval": 5
}

# 에러 메시지
ERROR_MESSAGES = {
    "workflow_not_found": "Workflow not found",
    "agent_not_available": "Agent is not available",
    "timeout": "Operation timed out",
    "invalid_request": "Invalid request format",
    "rate_limit": "Rate limit exceeded"
}