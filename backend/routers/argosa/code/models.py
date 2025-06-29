# backend/routers/argosa/code/models.py

"""
Data models for code analysis and generation
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


# ===== Dataclass Models =====

@dataclass
class CodeEntity:
    """코드의 모든 구성 요소를 표현"""
    id: str
    entity_type: str  # function, class, method, variable, import, constant
    name: str
    file_path: str
    line_start: int
    line_end: int
    parent_id: Optional[str] = None
    
    # 상세 정보
    signature: Optional[str] = None
    docstring: Optional[str] = None
    decorators: List[str] = field(default_factory=list)
    type_hints: Dict[str, str] = field(default_factory=dict)
    
    # 관계 정보
    calls: List[str] = field(default_factory=list)  # 이 엔티티가 호출하는 것들
    called_by: List[str] = field(default_factory=list)  # 이 엔티티를 호출하는 것들
    imports: List[str] = field(default_factory=list)
    imported_by: List[str] = field(default_factory=list)
    
    # 메트릭
    complexity: int = 0
    line_count: int = 0
    test_coverage: float = 0.0
    
    # 메타데이터
    last_modified: Optional[datetime] = None
    author: Optional[str] = None
    tags: List[str] = field(default_factory=list)


# ===== Pydantic Models =====

class ArchitecturePattern(BaseModel):
    """아키텍처 패턴 정의"""
    pattern_name: str
    pattern_type: str  # mvc, repository, factory, singleton, etc
    components: List[Dict[str, Any]]
    relationships: List[Dict[str, Any]]
    constraints: List[str]
    benefits: List[str]
    drawbacks: List[str]
    when_to_use: str
    implementation_guide: Dict[str, Any]


class CodeGenerationPlan(BaseModel):
    """코드 생성 계획"""
    plan_id: str = Field(default_factory=lambda: f"plan_{datetime.now().timestamp()}")
    objective: str
    scope: str  # file, module, system
    
    # 단계별 계획
    phases: List[Dict[str, Any]] = []
    
    # 아키텍처 결정사항
    architecture_decisions: Dict[str, Any] = {}
    
    # 코드 구조
    file_structure: Dict[str, Any] = {}
    module_dependencies: Dict[str, List[str]] = {}
    
    # 구현 상세
    implementation_details: Dict[str, Any] = {}
    
    # 품질 목표
    quality_targets: Dict[str, Any] = {
        "test_coverage": 90,
        "max_complexity": 10,
        "documentation_coverage": 100,
        "performance_targets": {}
    }
    
    # 위험 요소
    risks: List[Dict[str, Any]] = []
    mitigation_strategies: Dict[str, Any] = {}


class CodeFragment(BaseModel):
    """코드 조각"""
    fragment_id: str = Field(default_factory=lambda: f"frag_{datetime.now().timestamp()}")
    fragment_type: str  # function, class, module, test, config
    content: str
    language: str = "python"
    
    # 컨텍스트
    context: Dict[str, Any] = {}
    dependencies: List[str] = []
    integration_points: List[Dict[str, Any]] = []
    
    # 검증 상태
    validation_status: str = "pending"  # pending, passed, failed
    validation_results: Dict[str, Any] = {}
    
    # 메타데이터
    created_by: str  # 어떤 AI가 생성했는지
    created_at: datetime = Field(default_factory=datetime.now)
    iteration: int = 0
    parent_fragment_id: Optional[str] = None


# ===== Request/Response Models =====

class ProjectAnalysisRequest(BaseModel):
    """프로젝트 분석 요청"""
    root_path: str = "."
    include_patterns: List[str] = ["*.py"]
    exclude_patterns: List[str] = ["__pycache__", ".git", "*.pyc"]
    analysis_depth: str = "deep"  # shallow, normal, deep
    

class CodeGenerationRequest(BaseModel):
    """코드 생성 요청"""
    objective: str
    scope: str = "module"  # file, module, system
    constraints: List[str] = []
    scale: str = "medium"  # small, medium, large
    test_coverage: int = 90
    max_complexity: int = 10
    performance_targets: Dict[str, Any] = {}


class CodeValidationRequest(BaseModel):
    """코드 검증 요청"""
    code: str
    context: Dict[str, Any] = {}
    validation_types: List[str] = ["syntax", "style", "complexity", "security", "performance"]


class CollaborationSessionRequest(BaseModel):
    """협업 세션 요청"""
    objective: str
    participants: List[str] = ["architect", "implementer", "reviewer", "analyst"]
    initial_context: Dict[str, Any] = {}


# ===== Result Models =====

class AnalysisResult(BaseModel):
    """분석 결과"""
    timestamp: str
    root_path: str
    statistics: Dict[str, Any]
    architecture: Dict[str, Any]
    quality_metrics: Dict[str, Any]
    patterns_detected: List[str]
    improvement_opportunities: List[Dict[str, Any]]
    dependency_analysis: Dict[str, Any]
    complexity_analysis: Dict[str, Any]
    test_coverage_analysis: Dict[str, Any]


class GenerationResult(BaseModel):
    """생성 결과"""
    plan_id: str
    status: str
    progress: Dict[str, Any]
    generated_code: Dict[str, Any]
    test_code: Dict[str, Any]
    documentation: Dict[str, Any]
    quality_report: Dict[str, Any]


class ValidationResult(BaseModel):
    """검증 결과"""
    syntax: Dict[str, Any]
    style: Dict[str, Any]
    complexity: Dict[str, Any]
    security: Dict[str, Any]
    performance: Dict[str, Any]
    overall_score: float = 0.0
    recommendations: List[str] = []