# backend/routers/argosa/data_analysis.py - 통합 및 개선된 전체 버전

from fastapi import APIRouter, HTTPException, WebSocket, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional, AsyncGenerator, TypedDict
from enum import Enum
import asyncio
from datetime import datetime
import json
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import plotly.graph_objects as go
import plotly.express as px
from collections import defaultdict
import networkx as nx
from dataclasses import dataclass, asdict
import logging
import httpx
from langgraph.graph import StateGraph, END
from langgraph.checkpoint import MemorySaver

# 프로젝트 내부 imports
from ...services.rag_service import rag_service, module_integration, Document, RAGQuery
from .data_collection import comprehensive_data_collector

router = APIRouter()
logger = logging.getLogger(__name__)

# ===== 통합 State 정의 =====

class CodeWorkflowState(TypedDict):
    """코드 작업을 위한 통합 상태"""
    
    # 기본 정보
    workflow_id: str
    task_type: str  # analyze, generate, refactor, debug, optimize
    current_phase: str
    
    # 프로젝트 이해
    project_structure: Dict[str, Any]  # 전체 프로젝트 구조
    file_dependencies: Dict[str, List[str]]  # 파일 간 의존성
    code_patterns: List[Dict[str, Any]]  # 발견된 코드 패턴
    entity_map: Dict[str, Any]  # code_analysis의 엔티티 맵
    
    # 작업 분해
    subtasks: List[Dict[str, Any]]  # 세분화된 작업들
    current_subtask: Optional[Dict[str, Any]]
    completed_subtasks: List[str]
    
    # 코드 조각들
    code_fragments: Dict[str, str]  # 작은 단위로 생성된 코드
    integration_points: List[Dict[str, Any]]  # 통합 지점
    
    # AI 간 통신
    messages: List[Dict[str, Any]]  # AI 간 메시지
    pending_questions: List[Dict[str, Any]]
    decisions: List[Dict[str, Any]]
    
    # 검증 및 품질
    validation_results: Dict[str, Any]
    quality_metrics: Dict[str, Any]
    test_coverage: float
    
    # RAG 컨텍스트
    rag_documents: List[str]  # 사용된 RAG 문서 ID
    learned_patterns: List[Dict[str, Any]]  # 학습된 패턴
    
    # 실시간 협업
    websocket_clients: List[str]
    collaboration_session_id: Optional[str]

# ===== 향상된 AI 에이전트 타입 =====

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
    
    # 검색 및 정보 수집
    WEB_SEARCHER = "web_searcher"
    DOC_SEARCHER = "doc_searcher"
    
    # 협업 조정자
    COORDINATOR = "coordinator"

# ===== 데이터 모델 =====

@dataclass
class AnalysisResult:
    """분석 결과 데이터 클래스"""
    analysis_id: str
    timestamp: datetime
    agent_type: EnhancedAgentType
    result_type: str
    data: Dict[str, Any]
    confidence: float
    metadata: Dict[str, Any]

class AnalysisRequest(BaseModel):
    """분석 요청 모델"""
    request_id: str = Field(default_factory=lambda: f"req_{datetime.now().timestamp()}")
    analysis_type: str
    data_source: Optional[str] = None
    parameters: Dict[str, Any] = {}
    priority: str = "normal"  # low, normal, high, critical
    objective: str = ""
    constraints: List[str] = []
    
class AgentTask(BaseModel):
    """에이전트 작업 정의"""
    task_id: str = Field(default_factory=lambda: f"task_{datetime.now().timestamp()}")
    agent_type: EnhancedAgentType
    task_type: str
    input_data: Dict[str, Any]
    dependencies: List[str] = []
    timeout: int = 300  # seconds
    retry_count: int = 3

class WorkflowDefinition(BaseModel):
    """워크플로우 정의"""
    workflow_id: str = Field(default_factory=lambda: f"wf_{datetime.now().timestamp()}")
    name: str
    description: str
    tasks: List[AgentTask]
    execution_order: List[str]  # task_id 순서
    parallel_groups: List[List[str]] = []  # 병렬 실행 가능한 task_id 그룹
    conditions: Dict[str, Any] = {}

# ===== 고급 AI 에이전트 시스템 =====

class EnhancedAgentSystem:
    """통합 멀티 에이전트 시스템"""
    
    def __init__(self):
        self.agents: Dict[EnhancedAgentType, Any] = {}
        self.active_tasks: Dict[str, asyncio.Task] = {}
        self.results_cache: Dict[str, AnalysisResult] = {}
        self.workflows: Dict[str, WorkflowDefinition] = {}
        self.execution_history: List[Dict[str, Any]] = []
        
        # 워크플로우
        self.code_workflow = None
        self.analysis_workflow = None
        self.active_workflows = {}
        
        # WebSocket 연결 관리
        self.websocket_connections: Dict[str, WebSocket] = {}
        
        # HTTP 클라이언트 (code_analysis API 호출용)
        self.http_client = httpx.AsyncClient()
        
        # AI 모델 설정
        self.ai_models = {
            "default": None,
            "specialized": {
                EnhancedAgentType.ARCHITECT: "qwen2.5-72b-instruct",
                EnhancedAgentType.CODE_GENERATOR: "deepseek-coder-33b-instruct",
                EnhancedAgentType.CODE_REVIEWER: "deepseek-r1-distill-qwen-32b",
                EnhancedAgentType.IMPLEMENTER: "wizardcoder-33b-v2",
                EnhancedAgentType.ANALYST: "llama-3.1-70b-instruct",
                EnhancedAgentType.STRATEGIST: "gpt-4o",
            }
        }
        
        # 에이전트 초기화
        self._initialize_agents()
        self._create_workflows()
        
    def _initialize_agents(self):
        """에이전트 초기화"""
        
        # 각 에이전트별 설정
        agent_configs = {
            EnhancedAgentType.ARCHITECT: {
                "name": "Software Architect",
                "capabilities": ["system_design", "pattern_selection", "scalability_planning"],
                "prompt_template": """You are a software architect. Design the architecture for:

Requirements: {requirements}
Current System: {current_system}
Constraints: {constraints}

Provide:
1. Component breakdown
2. Integration strategy  
3. Data flow design
4. Scalability considerations
5. Technology recommendations

Response in structured JSON format."""
            },
            
            EnhancedAgentType.CODE_ANALYZER: {
                "name": "Code Analysis Specialist",
                "capabilities": ["ast_analysis", "complexity_analysis", "dependency_mapping"],
                "prompt_template": """You are a code analysis specialist. Analyze:

Project Context: {project_context}
Target Code: {code}
Analysis Type: {analysis_type}

Provide detailed analysis including:
1. Code structure and patterns
2. Dependencies and relationships
3. Potential issues and code smells
4. Performance considerations
5. Security vulnerabilities
6. Improvement opportunities

Response in structured JSON format."""
            },
            
            EnhancedAgentType.CODE_GENERATOR: {
                "name": "Code Generation Specialist",
                "capabilities": ["code_synthesis", "pattern_application", "api_design"],
                "prompt_template": """You are a code generation specialist. Generate code based on:

Specification: {specification}
Context: {context}
Patterns to follow: {patterns}
Constraints: {constraints}

Generate production-ready code with:
1. Proper error handling
2. Type hints
3. Comprehensive documentation
4. Unit tests
5. Following project conventions

Return code with explanations."""
            },
            
            EnhancedAgentType.IMPLEMENTER: {
                "name": "Implementation Specialist",
                "capabilities": ["detailed_implementation", "optimization", "integration"],
                "prompt_template": """You are an implementation specialist. Implement:

Design: {design}
Requirements: {requirements}
Existing Code: {existing_code}
Integration Points: {integration_points}

Provide:
1. Complete implementation
2. Integration code
3. Configuration changes
4. Migration scripts if needed
5. Deployment considerations"""
            },
            
            EnhancedAgentType.CODE_REVIEWER: {
                "name": "Code Review Specialist",
                "capabilities": ["quality_check", "security_review", "performance_analysis"],
                "prompt_template": """You are a code review specialist. Review:

Code: {code}
Context: {context}
Standards: {coding_standards}
Requirements: {requirements}

Check for:
1. Code quality issues
2. Security vulnerabilities
3. Performance problems
4. Best practice violations
5. Test coverage
6. Documentation completeness

Provide actionable feedback with severity levels."""
            },
            
            EnhancedAgentType.TESTER: {
                "name": "Test Design Specialist",
                "capabilities": ["test_planning", "test_generation", "coverage_analysis"],
                "prompt_template": """You are a test design specialist. Create tests for:

Code: {code}
Requirements: {requirements}
Test Strategy: {test_strategy}

Generate:
1. Unit tests
2. Integration tests
3. Edge case tests
4. Performance tests
5. Test data generators

Aim for comprehensive coverage."""
            },
            
            EnhancedAgentType.ANALYST: {
                "name": "Data Analysis Expert",
                "capabilities": ["statistical_analysis", "pattern_recognition", "insight_generation"],
                "prompt_template": """You are a data analysis expert. Analyze:

Data: {data}
Objective: {objective}
Context: {context}

Provide:
1. Statistical summary
2. Pattern analysis
3. Correlations
4. Anomalies
5. Actionable insights
6. Visualization recommendations"""
            },
            
            EnhancedAgentType.STRATEGIST: {
                "name": "Strategic Planning Expert",
                "capabilities": ["decision_analysis", "scenario_planning", "risk_assessment"],
                "prompt_template": """You are a strategic planning expert. Analyze:

Situation: {situation}
Options: {options}
Constraints: {constraints}
Goals: {goals}

Provide:
1. Strategic recommendations
2. Risk analysis
3. Implementation roadmap
4. Success metrics
5. Contingency plans"""
            },
            
            EnhancedAgentType.PLANNER: {
                "name": "Task Planning Specialist",
                "capabilities": ["task_decomposition", "dependency_analysis", "resource_planning"],
                "prompt_template": """You are a task planning specialist. Plan:

Objective: {objective}
Context: {context}
Resources: {resources}
Constraints: {constraints}

Create:
1. Task breakdown
2. Dependencies
3. Timeline
4. Resource allocation
5. Risk mitigation"""
            }
        }
        
        # 에이전트 초기화
        for agent_type, config in agent_configs.items():
            self.agents[agent_type] = {
                "status": "ready",
                "config": config,
                "model": self.ai_models["specialized"].get(agent_type, self.ai_models["default"]),
                "performance_metrics": {
                    "success_rate": 1.0,
                    "average_time": 0.0,
                    "total_tasks": 0
                }
            }
    
    def _create_workflows(self):
        """워크플로우 생성"""
        self._create_code_workflow()
        self._create_analysis_workflow()
    
    def _create_code_workflow(self):
        """코드 작업 워크플로우 생성"""
        
        workflow = StateGraph(CodeWorkflowState)
        
        # 노드 추가
        workflow.add_node("analyze_project", self._analyze_project_node)
        workflow.add_node("understand_requirements", self._understand_requirements_node)
        workflow.add_node("design_architecture", self._design_architecture_node)
        workflow.add_node("decompose_tasks", self._decompose_tasks_node)
        workflow.add_node("generate_code", self._generate_code_node)
        workflow.add_node("review_code", self._review_code_node)
        workflow.add_node("integrate_code", self._integrate_code_node)
        workflow.add_node("generate_tests", self._generate_tests_node)
        workflow.add_node("validate_solution", self._validate_solution_node)
        
        # 엣지 정의
        workflow.add_edge("analyze_project", "understand_requirements")
        workflow.add_edge("understand_requirements", "design_architecture")
        workflow.add_edge("design_architecture", "decompose_tasks")
        workflow.add_edge("decompose_tasks", "generate_code")
        workflow.add_edge("generate_code", "review_code")
        
        # 조건부 라우팅
        def review_decision(state):
            if state["validation_results"].get("review_passed", False):
                return "integrate_code"
            else:
                return "generate_code"
        
        workflow.add_conditional_edges(
            "review_code",
            review_decision,
            {
                "generate_code": "generate_code",
                "integrate_code": "integrate_code"
            }
        )
        
        workflow.add_edge("integrate_code", "generate_tests")
        workflow.add_edge("generate_tests", "validate_solution")
        
        def validation_decision(state):
            if state["validation_results"].get("all_passed", False):
                return "end"
            else:
                return "design_architecture"
        
        workflow.add_conditional_edges(
            "validate_solution",
            validation_decision,
            {
                "design_architecture": "design_architecture",
                "end": END
            }
        )
        
        workflow.set_entry_point("analyze_project")
        
        # 체크포인터 추가
        memory = MemorySaver()
        self.code_workflow = workflow.compile(checkpointer=memory)
    
    def _create_analysis_workflow(self):
        """데이터 분석 워크플로우 생성"""
        
        workflow = StateGraph(dict)
        
        # 노드 추가
        workflow.add_node("collect_data", self._collect_data_node)
        workflow.add_node("analyze_data", self._analyze_data_node)
        workflow.add_node("generate_insights", self._generate_insights_node)
        workflow.add_node("create_visualizations", self._create_visualizations_node)
        workflow.add_node("generate_report", self._generate_report_node)
        
        # 엣지 정의
        workflow.add_edge("collect_data", "analyze_data")
        workflow.add_edge("analyze_data", "generate_insights")
        workflow.add_edge("generate_insights", "create_visualizations")
        workflow.add_edge("create_visualizations", "generate_report")
        workflow.add_edge("generate_report", END)
        
        workflow.set_entry_point("collect_data")
        
        memory = MemorySaver()
        self.analysis_workflow = workflow.compile(checkpointer=memory)
    
    # ===== 코드 워크플로우 노드 구현 =====
    
    async def _analyze_project_node(self, state: CodeWorkflowState) -> CodeWorkflowState:
        """프로젝트 분석"""
        print("[워크플로우] 프로젝트 분석 중...")
        
        # code_analysis API 호출
        try:
            response = await self.http_client.post(
                "http://localhost:8000/api/argosa/code/analyze-project",
                json={"root_path": state.get("project_root", ".")}
            )
            project_analysis = response.json()["analysis"]
        except:
            # 폴백: 기본 분석
            project_analysis = {
                "statistics": {"files": {"python_files": 10}},
                "architecture": {"patterns": ["MVC"]},
                "quality_metrics": {"average_complexity": 5}
            }
        
        state["project_structure"] = project_analysis
        state["code_patterns"] = project_analysis.get("patterns_detected", [])
        state["current_phase"] = "project_analyzed"
        
        # WebSocket으로 진행상황 브로드캐스트
        await self._broadcast_progress(state["workflow_id"], {
            "phase": "project_analyzed",
            "progress": 10,
            "details": project_analysis.get("statistics", {})
        })
        
        return state
    
    async def _understand_requirements_node(self, state: CodeWorkflowState) -> CodeWorkflowState:
        """요구사항 이해"""
        print("[워크플로우] 요구사항 분석 중...")
        
        # ANALYST 에이전트로 요구사항 분석
        analysis = await self._execute_agent(
            EnhancedAgentType.ANALYST,
            {
                "data": state.get("objective", ""),
                "objective": "Extract and analyze software requirements",
                "context": state["project_structure"]
            }
        )
        
        state["requirements"] = analysis
        state["current_phase"] = "requirements_understood"
        
        await self._broadcast_progress(state["workflow_id"], {
            "phase": "requirements_understood",
            "progress": 20
        })
        
        return state
    
    async def _design_architecture_node(self, state: CodeWorkflowState) -> CodeWorkflowState:
        """아키텍처 설계"""
        print("[워크플로우] 아키텍처 설계 중...")
        
        # ARCHITECT 에이전트로 설계
        architecture = await self._execute_agent(
            EnhancedAgentType.ARCHITECT,
            {
                "requirements": state.get("requirements", {}),
                "current_system": state["project_structure"],
                "constraints": state.get("constraints", [])
            }
        )
        
        state["architecture_design"] = architecture
        state["current_phase"] = "architecture_designed"
        
        await self._broadcast_progress(state["workflow_id"], {
            "phase": "architecture_designed",
            "progress": 30,
            "architecture": architecture
        })
        
        return state
    
    async def _decompose_tasks_node(self, state: CodeWorkflowState) -> CodeWorkflowState:
        """작업 분해"""
        print("[워크플로우] 작업 분해 중...")
        
        # PLANNER 에이전트로 작업 분해
        decomposition = await self._execute_agent(
            EnhancedAgentType.PLANNER,
            {
                "objective": state.get("objective", ""),
                "context": state["architecture_design"],
                "resources": {"available_time": "unlimited"},
                "constraints": state.get("constraints", [])
            }
        )
        
        # 서브태스크 생성
        subtasks = []
        for i, task_info in enumerate(decomposition.get("tasks", [])):
            subtasks.append({
                "id": f"subtask_{i}",
                "description": task_info.get("description", ""),
                "type": task_info.get("type", "implementation"),
                "dependencies": task_info.get("dependencies", []),
                "priority": task_info.get("priority", "normal"),
                "estimated_complexity": task_info.get("complexity", "medium"),
                "status": "pending"
            })
        
        state["subtasks"] = subtasks
        state["current_phase"] = "tasks_decomposed"
        
        await self._broadcast_progress(state["workflow_id"], {
            "phase": "tasks_decomposed",
            "progress": 40,
            "total_tasks": len(subtasks)
        })
        
        return state
    
    async def _generate_code_node(self, state: CodeWorkflowState) -> CodeWorkflowState:
        """코드 생성"""
        print("[워크플로우] 코드 생성 중...")
        
        # 처리할 서브태스크 선택
        pending_tasks = [t for t in state["subtasks"] if t["status"] == "pending"]
        if not pending_tasks:
            state["current_phase"] = "code_generation_complete"
            return state
        
        current_task = pending_tasks[0]
        state["current_subtask"] = current_task
        
        # CODE_GENERATOR로 코드 생성
        generated = await self._execute_agent(
            EnhancedAgentType.CODE_GENERATOR,
            {
                "specification": current_task["description"],
                "context": state["architecture_design"],
                "patterns": state["code_patterns"],
                "constraints": ["Follow existing code style", "Include tests"]
            }
        )
        
        # 코드 조각 저장
        fragment_id = current_task["id"]
        state["code_fragments"][fragment_id] = generated.get("code", "")
        current_task["generated_code"] = generated
        current_task["status"] = "generated"
        
        # 진행상황 업데이트
        completed = len([t for t in state["subtasks"] if t["status"] != "pending"])
        progress = 40 + (30 * completed / len(state["subtasks"]))
        
        await self._broadcast_progress(state["workflow_id"], {
            "phase": "code_generation",
            "progress": progress,
            "current_task": current_task["description"],
            "completed_tasks": completed,
            "total_tasks": len(state["subtasks"])
        })
        
        return state
    
    async def _review_code_node(self, state: CodeWorkflowState) -> CodeWorkflowState:
        """코드 리뷰"""
        print("[워크플로우] 코드 리뷰 중...")
        
        current_task = state.get("current_subtask")
        if not current_task:
            return state
        
        # CODE_REVIEWER로 리뷰
        review = await self._execute_agent(
            EnhancedAgentType.CODE_REVIEWER,
            {
                "code": state["code_fragments"][current_task["id"]],
                "context": current_task.get("description", ""),
                "coding_standards": state.get("coding_standards", {}),
                "requirements": state.get("requirements", {})
            }
        )
        
        current_task["review"] = review
        
        # 리뷰 결과 처리
        if review.get("approved", False):
            current_task["status"] = "reviewed"
            state["completed_subtasks"].append(current_task["id"])
            state["validation_results"]["review_passed"] = True
        else:
            current_task["status"] = "needs_revision"
            current_task["revision_notes"] = review.get("issues", [])
            state["validation_results"]["review_passed"] = False
        
        return state
    
    async def _integrate_code_node(self, state: CodeWorkflowState) -> CodeWorkflowState:
        """코드 통합"""
        print("[워크플로우] 코드 통합 중...")
        
        # code_analysis API의 통합 기능 활용
        try:
            integration_request = {
                "fragments": state["code_fragments"],
                "architecture": state["architecture_design"],
                "integration_points": state.get("integration_points", [])
            }
            
            # 실제로는 API 호출
            integrated_code = await self._simulate_integration(integration_request)
            
        except:
            # 폴백: 간단한 통합
            integrated_code = "\n\n".join(state["code_fragments"].values())
        
        state["integrated_code"] = integrated_code
        state["current_phase"] = "code_integrated"
        
        await self._broadcast_progress(state["workflow_id"], {
            "phase": "code_integrated",
            "progress": 80
        })
        
        return state
    
    async def _generate_tests_node(self, state: CodeWorkflowState) -> CodeWorkflowState:
        """테스트 생성"""
        print("[워크플로우] 테스트 생성 중...")
        
        # TESTER 에이전트로 테스트 생성
        tests = await self._execute_agent(
            EnhancedAgentType.TESTER,
            {
                "code": state.get("integrated_code", ""),
                "requirements": state.get("requirements", {}),
                "test_strategy": {"coverage_target": 90, "test_types": ["unit", "integration"]}
            }
        )
        
        state["test_code"] = tests
        state["test_coverage"] = tests.get("estimated_coverage", 0)
        state["current_phase"] = "tests_generated"
        
        await self._broadcast_progress(state["workflow_id"], {
            "phase": "tests_generated",
            "progress": 90,
            "test_coverage": state["test_coverage"]
        })
        
        return state
    
    async def _validate_solution_node(self, state: CodeWorkflowState) -> CodeWorkflowState:
        """솔루션 검증"""
        print("[워크플로우] 솔루션 검증 중...")
        
        # 종합 검증
        validation_criteria = {
            "requirements_met": True,
            "tests_pass": state["test_coverage"] >= 80,
            "code_quality": state.get("quality_metrics", {}).get("score", 0) >= 75,
            "no_critical_issues": True
        }
        
        all_passed = all(validation_criteria.values())
        state["validation_results"]["all_passed"] = all_passed
        state["validation_results"]["criteria"] = validation_criteria
        
        if all_passed:
            state["current_phase"] = "completed"
        else:
            state["current_phase"] = "needs_improvement"
        
        await self._broadcast_progress(state["workflow_id"], {
            "phase": "validation_complete",
            "progress": 100,
            "success": all_passed,
            "validation_results": validation_criteria
        })
        
        return state
    
    # ===== 데이터 분석 워크플로우 노드 =====
    
    async def _collect_data_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """데이터 수집"""
        print("[분석 워크플로우] 데이터 수집 중...")
        
        # data_collection 모듈 활용
        data = await comprehensive_data_collector.collect_data(
            state.get("data_sources", [])
        )
        
        state["collected_data"] = data
        state["current_phase"] = "data_collected"
        
        return state
    
    async def _analyze_data_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """데이터 분석"""
        print("[분석 워크플로우] 데이터 분석 중...")
        
        # ANALYST 에이전트로 분석
        analysis = await self._execute_agent(
            EnhancedAgentType.ANALYST,
            {
                "data": state["collected_data"],
                "objective": state.get("analysis_objective", ""),
                "context": state.get("context", {})
            }
        )
        
        state["analysis_results"] = analysis
        state["current_phase"] = "data_analyzed"
        
        return state
    
    async def _generate_insights_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """인사이트 생성"""
        print("[분석 워크플로우] 인사이트 생성 중...")
        
        # STRATEGIST 에이전트로 인사이트 도출
        insights = await self._execute_agent(
            EnhancedAgentType.STRATEGIST,
            {
                "situation": state["analysis_results"],
                "options": [],
                "constraints": state.get("constraints", []),
                "goals": state.get("business_goals", [])
            }
        )
        
        state["insights"] = insights
        state["current_phase"] = "insights_generated"
        
        return state
    
    async def _create_visualizations_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """시각화 생성"""
        print("[분석 워크플로우] 시각화 생성 중...")
        
        # 시각화 생성 로직
        visualizations = []
        
        # 예시: Plotly 차트 생성
        if "time_series_data" in state.get("analysis_results", {}):
            fig = go.Figure()
            # 시각화 로직
            visualizations.append({
                "type": "time_series",
                "figure": fig.to_json()
            })
        
        state["visualizations"] = visualizations
        state["current_phase"] = "visualizations_created"
        
        return state
    
    async def _generate_report_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """보고서 생성"""
        print("[분석 워크플로우] 보고서 생성 중...")
        
        report = {
            "executive_summary": state.get("insights", {}).get("summary", ""),
            "detailed_analysis": state.get("analysis_results", {}),
            "visualizations": state.get("visualizations", []),
            "recommendations": state.get("insights", {}).get("recommendations", []),
            "next_steps": state.get("insights", {}).get("action_plan", [])
        }
        
        state["final_report"] = report
        state["current_phase"] = "completed"
        
        return state
    
    # ===== 헬퍼 메서드 =====
    
    async def _execute_agent(self, agent_type: EnhancedAgentType, prompt_data: Dict[str, Any]) -> Dict[str, Any]:
        """에이전트 실행"""
        
        agent = self.agents.get(agent_type)
        if not agent:
            raise ValueError(f"Agent {agent_type} not found")
        
        # 성능 메트릭 시작
        start_time = datetime.now()
        
        try:
            # 프롬프트 생성
            prompt_template = agent["config"]["prompt_template"]
            prompt = prompt_template.format(**prompt_data)
            
            # AI 모델 호출 (실제 구현에서는 LM Studio API 호출)
            result = await self._call_llm(agent["model"], prompt)
            
            # 성능 메트릭 업데이트
            elapsed_time = (datetime.now() - start_time).total_seconds()
            agent["performance_metrics"]["total_tasks"] += 1
            agent["performance_metrics"]["average_time"] = (
                (agent["performance_metrics"]["average_time"] * (agent["performance_metrics"]["total_tasks"] - 1) + elapsed_time) /
                agent["performance_metrics"]["total_tasks"]
            )
            
            # 결과 캐싱
            result_obj = AnalysisResult(
                analysis_id=f"analysis_{datetime.now().timestamp()}",
                timestamp=datetime.now(),
                agent_type=agent_type,
                result_type="success",
                data=result,
                confidence=0.95,
                metadata={"elapsed_time": elapsed_time}
            )
            
            self.results_cache[result_obj.analysis_id] = result_obj
            
            return result
            
        except Exception as e:
            logger.error(f"Agent {agent_type} execution failed: {e}")
            agent["performance_metrics"]["success_rate"] *= 0.95  # 성공률 감소
            raise
    
    async def _call_llm(self, model: str, prompt: str) -> Dict[str, Any]:
        """LLM 호출 (실제 구현 필요)"""
        
        # 시뮬레이션
        await asyncio.sleep(1)
        
        # 모델별 응답 시뮬레이션
        if "architect" in prompt.lower():
            return {
                "components": [
                    {"name": "AuthService", "type": "service", "responsibility": "Authentication"},
                    {"name": "UserRepository", "type": "repository", "responsibility": "User data access"}
                ],
                "integration_strategy": "RESTful API with JWT",
                "data_flow": "Client -> API Gateway -> Service -> Repository -> Database"
            }
        elif "generate" in prompt.lower():
            return {
                "code": """class AuthService:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository
    
    async def authenticate(self, credentials: dict) -> dict:
        user = await self.user_repository.find_by_username(credentials['username'])
        if user and verify_password(credentials['password'], user.password_hash):
            return generate_jwt_token(user)
        raise AuthenticationError('Invalid credentials')""",
                "explanation": "Authentication service with dependency injection"
            }
        elif "review" in prompt.lower():
            return {
                "approved": True,
                "score": 85,
                "issues": [],
                "suggestions": ["Consider adding rate limiting", "Add logging for failed attempts"]
            }
        elif "test" in prompt.lower():
            return {
                "code": """import pytest
from unittest.mock import AsyncMock

class TestAuthService:
    @pytest.mark.asyncio
    async def test_authenticate_success(self):
        # Test implementation
        pass""",
                "estimated_coverage": 85
            }
        
        return {"status": "completed"}
    
    async def _broadcast_progress(self, workflow_id: str, progress_data: Dict[str, Any]):
        """WebSocket으로 진행상황 브로드캐스트"""
        
        message = {
            "type": "progress_update",
            "workflow_id": workflow_id,
            "timestamp": datetime.now().isoformat(),
            **progress_data
        }
        
        # 연결된 모든 클라이언트에게 전송
        for ws_id, websocket in self.websocket_connections.items():
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send progress to {ws_id}: {e}")
    
    async def _simulate_integration(self, request: Dict[str, Any]) -> str:
        """코드 통합 시뮬레이션"""
        
        # 실제로는 code_analysis API 호출
        fragments = request.get("fragments", {})
        
        # 간단한 통합 로직
        integrated = []
        integrated.append("# Auto-generated integrated code")
        integrated.append("import asyncio")
        integrated.append("from typing import Dict, Any, List")
        integrated.append("")
        
        for fragment_id, code in fragments.items():
            integrated.append(f"# {fragment_id}")
            integrated.append(code)
            integrated.append("")
        
        return "\n".join(integrated)
    
    async def _save_to_rag(self, workflow_id: str, state: Dict[str, Any]):
        """RAG 시스템에 결과 저장"""
        
        try:
            document = Document(
                id=f"workflow_{workflow_id}_{state.get('current_phase', 'unknown')}",
                content=json.dumps({
                    "workflow_id": workflow_id,
                    "phase": state.get("current_phase"),
                    "timestamp": datetime.now().isoformat(),
                    "data": state
                }),
                metadata={
                    "type": "workflow_state",
                    "workflow_id": workflow_id,
                    "phase": state.get("current_phase")
                }
            )
            
            await rag_service.add_documents([document])
            
        except Exception as e:
            logger.error(f"Failed to save to RAG: {e}")
    
    # ===== 공개 메서드 =====
    
    async def create_workflow(self, request: AnalysisRequest) -> str:
        """워크플로우 생성"""
        
        workflow_id = f"wf_{datetime.now().timestamp()}"
        
        if request.analysis_type == "code":
            initial_state = CodeWorkflowState(
                workflow_id=workflow_id,
                task_type=request.parameters.get("task_type", "generate"),
                current_phase="initialized",
                project_structure={},
                file_dependencies={},
                code_patterns=[],
                entity_map={},
                subtasks=[],
                current_subtask=None,
                completed_subtasks=[],
                code_fragments={},
                integration_points=[],
                messages=[],
                pending_questions=[],
                decisions=[],
                validation_results={},
                quality_metrics={},
                test_coverage=0.0,
                rag_documents=[],
                learned_patterns=[],
                websocket_clients=[],
                collaboration_session_id=None,
                objective=request.objective,
                constraints=request.constraints,
                project_root=request.parameters.get("project_root", ".")
            )
        else:
            initial_state = {
                "workflow_id": workflow_id,
                "analysis_type": request.analysis_type,
                "current_phase": "initialized",
                "data_sources": request.parameters.get("data_sources", []),
                "analysis_objective": request.objective,
                "constraints": request.constraints,
                "business_goals": request.parameters.get("business_goals", [])
            }
        
        self.active_workflows[workflow_id] = initial_state
        
        return workflow_id
    
    async def execute_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """워크플로우 실행"""
        
        if workflow_id not in self.active_workflows:
            raise ValueError(f"Workflow {workflow_id} not found")
        
        initial_state = self.active_workflows[workflow_id]
        config = {"configurable": {"thread_id": workflow_id}}
        
        # 워크플로우 타입 결정
        if initial_state.get("task_type") or initial_state.get("analysis_type") == "code":
            workflow = self.code_workflow
        else:
            workflow = self.analysis_workflow
        
        # 실행
        final_state = None
        async for state in workflow.astream(initial_state, config):
            logger.info(f"Workflow {workflow_id} - Phase: {state.get('current_phase')}")
            final_state = state
            
            # 상태 업데이트
            self.active_workflows[workflow_id] = state
            
            # RAG에 저장
            if state.get("current_phase") in ["project_analyzed", "requirements_understood", 
                                               "architecture_designed", "completed"]:
                await self._save_to_rag(workflow_id, state)
        
        return final_state
    
    async def configure_models(self, config: Dict[str, Any]):
        """AI 모델 설정"""
        
        if "default" in config:
            self.ai_models["default"] = config["default"]
        
        if "specialized" in config:
            self.ai_models["specialized"].update(config["specialized"])
        
        # 에이전트 모델 업데이트
        for agent_type, agent in self.agents.items():
            if agent_type in self.ai_models["specialized"]:
                agent["model"] = self.ai_models["specialized"][agent_type]
            elif self.ai_models["default"]:
                agent["model"] = self.ai_models["default"]
    
    async def add_websocket_connection(self, ws_id: str, websocket: WebSocket):
        """WebSocket 연결 추가"""
        self.websocket_connections[ws_id] = websocket
        logger.info(f"WebSocket connection added: {ws_id}")
    
    async def remove_websocket_connection(self, ws_id: str):
        """WebSocket 연결 제거"""
        if ws_id in self.websocket_connections:
            del self.websocket_connections[ws_id]
            logger.info(f"WebSocket connection removed: {ws_id}")
    
    async def handle_websocket_message(self, ws_id: str, message: Dict[str, Any]):
        """WebSocket 메시지 처리"""
        
        message_type = message.get("type")
        
        if message_type == "subscribe_workflow":
            workflow_id = message.get("workflow_id")
            if workflow_id in self.active_workflows:
                state = self.active_workflows[workflow_id]
                if "websocket_clients" in state:
                    state["websocket_clients"].append(ws_id)
        
        elif message_type == "agent_question":
            # 에이전트에게 즉시 질문
            agent_type = EnhancedAgentType(message.get("agent", "analyst"))
            response = await self._execute_agent(agent_type, message.get("data", {}))
            
            await self.websocket_connections[ws_id].send_json({
                "type": "agent_response",
                "question_id": message.get("question_id"),
                "response": response
            })
        
        elif message_type == "pause_workflow":
            # 워크플로우 일시정지 (구현 필요)
            pass
        
        elif message_type == "resume_workflow":
            # 워크플로우 재개 (구현 필요)
            pass

# ===== 전역 인스턴스 =====

enhanced_agent_system = EnhancedAgentSystem()

# ===== API 엔드포인트 =====

@router.post("/workflow/create")
async def create_workflow(request: AnalysisRequest):
    """워크플로우 생성"""
    
    try:
        workflow_id = await enhanced_agent_system.create_workflow(request)
        
        return {
            "workflow_id": workflow_id,
            "status": "created",
            "message": "Workflow created successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/workflow/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, background_tasks: BackgroundTasks):
    """워크플로우 실행"""
    
    try:
        # 백그라운드에서 실행
        background_tasks.add_task(
            enhanced_agent_system.execute_workflow,
            workflow_id
        )
        
        return {
            "workflow_id": workflow_id,
            "status": "executing",
            "message": "Workflow execution started"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workflow/{workflow_id}/status")
async def get_workflow_status(workflow_id: str):
    """워크플로우 상태 조회"""
    
    if workflow_id not in enhanced_agent_system.active_workflows:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    state = enhanced_agent_system.active_workflows[workflow_id]
    
    # 상태에 따른 진행률 계산
    progress_map = {
        "initialized": 0,
        "project_analyzed": 10,
        "requirements_understood": 20,
        "architecture_designed": 30,
        "tasks_decomposed": 40,
        "code_generation": 50,
        "code_integrated": 80,
        "tests_generated": 90,
        "completed": 100
    }
    
    current_phase = state.get("current_phase", "initialized")
    progress = progress_map.get(current_phase, 50)
    
    response = {
        "workflow_id": workflow_id,
        "current_phase": current_phase,
        "progress": progress,
        "status": "completed" if progress == 100 else "in_progress"
    }
    
    # 타입별 추가 정보
    if isinstance(state, dict) and "subtasks" in state:
        response["details"] = {
            "total_subtasks": len(state.get("subtasks", [])),
            "completed_subtasks": len(state.get("completed_subtasks", [])),
            "code_fragments": len(state.get("code_fragments", {})),
            "quality_metrics": state.get("quality_metrics", {}),
            "test_coverage": state.get("test_coverage", 0)
        }
    
    return response

@router.post("/agent/ask")
async def ask_agent(request: Dict[str, Any]):
    """에이전트에게 즉시 질문"""
    
    try:
        agent_type = EnhancedAgentType(request.get("agent_type", "analyst"))
        
        # 프롬프트 데이터 준비
        prompt_data = request.get("prompt_data", {})
        
        # 에이전트 실행
        response = await enhanced_agent_system._execute_agent(agent_type, prompt_data)
        
        return {
            "question": request.get("question", ""),
            "agent": agent_type.value,
            "response": response,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/models/configure")
async def configure_models(config: Dict[str, Any]):
    """AI 모델 설정"""
    
    try:
        await enhanced_agent_system.configure_models(config)
        
        return {
            "status": "configured",
            "models": enhanced_agent_system.ai_models
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket 연결"""
    
    await websocket.accept()
    ws_id = f"{client_id}_{datetime.now().timestamp()}"
    
    await enhanced_agent_system.add_websocket_connection(ws_id, websocket)
    
    try:
        while True:
            # 메시지 수신
            data = await websocket.receive_json()
            
            # 메시지 처리
            await enhanced_agent_system.handle_websocket_message(ws_id, data)
            
    except Exception as e:
        logger.error(f"WebSocket error for {ws_id}: {e}")
    finally:
        await enhanced_agent_system.remove_websocket_connection(ws_id)
        await websocket.close()

@router.get("/agents")
async def list_agents():
    """사용 가능한 에이전트 목록"""
    
    agents_info = []
    
    for agent_type, agent in enhanced_agent_system.agents.items():
        agents_info.append({
            "type": agent_type.value,
            "name": agent["config"]["name"],
            "capabilities": agent["config"]["capabilities"],
            "model": agent["model"],
            "status": agent["status"],
            "performance": agent["performance_metrics"]
        })
    
    return {
        "agents": agents_info,
        "total": len(agents_info)
    }

@router.get("/workflows")
async def list_workflows():
    """활성 워크플로우 목록"""
    
    workflows = []
    
    for workflow_id, state in enhanced_agent_system.active_workflows.items():
        workflows.append({
            "workflow_id": workflow_id,
            "type": state.get("task_type", state.get("analysis_type", "unknown")),
            "current_phase": state.get("current_phase", "unknown"),
            "created_at": workflow_id.split("_")[1] if "_" in workflow_id else None
        })
    
    return {
        "workflows": workflows,
        "total": len(workflows)
    }

@router.get("/metrics")
async def get_system_metrics():
    """시스템 메트릭"""
    
    metrics = {
        "active_workflows": len(enhanced_agent_system.active_workflows),
        "active_tasks": len(enhanced_agent_system.active_tasks),
        "cached_results": len(enhanced_agent_system.results_cache),
        "websocket_connections": len(enhanced_agent_system.websocket_connections),
        "agent_performance": {}
    }
    
    # 에이전트별 성능 메트릭
    for agent_type, agent in enhanced_agent_system.agents.items():
        metrics["agent_performance"][agent_type.value] = agent["performance_metrics"]
    
    return metrics

# ===== 코드 워크플로우 전용 엔드포인트 =====

@router.post("/code-workflow/create")
async def create_code_workflow(request: Dict[str, Any]):
    """코드 작업 워크플로우 생성"""
    
    analysis_request = AnalysisRequest(
        analysis_type="code",
        objective=request.get("objective", ""),
        parameters={
            "task_type": request.get("task_type", "generate"),
            "project_root": request.get("project_root", "."),
            **request.get("parameters", {})
        },
        constraints=request.get("constraints", []),
        priority=request.get("priority", "normal")
    )
    
    workflow_id = await enhanced_agent_system.create_workflow(analysis_request)
    
    return {
        "workflow_id": workflow_id,
        "status": "created",
        "type": "code_workflow"
    }

@router.post("/code-workflow/quick-generate")
async def quick_code_generation(request: Dict[str, Any]):
    """빠른 코드 생성 (워크플로우 없이)"""
    
    try:
        # 직접 CODE_GENERATOR 호출
        result = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.CODE_GENERATOR,
            {
                "specification": request.get("specification", ""),
                "context": request.get("context", {}),
                "patterns": request.get("patterns", []),
                "constraints": request.get("constraints", [])
            }
        )
        
        return {
            "code": result.get("code", ""),
            "explanation": result.get("explanation", ""),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/code-workflow/review")
async def review_code(request: Dict[str, Any]):
    """코드 리뷰 요청"""
    
    try:
        result = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.CODE_REVIEWER,
            {
                "code": request.get("code", ""),
                "context": request.get("context", ""),
                "coding_standards": request.get("standards", {}),
                "requirements": request.get("requirements", {})
            }
        )
        
        return {
            "review": result,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== 데이터 분석 전용 엔드포인트 =====

@router.post("/analysis-workflow/create")
async def create_analysis_workflow(request: Dict[str, Any]):
    """데이터 분석 워크플로우 생성"""
    
    analysis_request = AnalysisRequest(
        analysis_type="data_analysis",
        objective=request.get("objective", ""),
        parameters={
            "data_sources": request.get("data_sources", []),
            "business_goals": request.get("business_goals", []),
            **request.get("parameters", {})
        },
        constraints=request.get("constraints", [])
    )
    
    workflow_id = await enhanced_agent_system.create_workflow(analysis_request)
    
    return {
        "workflow_id": workflow_id,
        "status": "created",
        "type": "analysis_workflow"
    }

@router.post("/analysis/quick-insight")
async def quick_insight(request: Dict[str, Any]):
    """빠른 인사이트 생성"""
    
    try:
        # ANALYST로 즉시 분석
        analysis = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.ANALYST,
            {
                "data": request.get("data", {}),
                "objective": request.get("objective", ""),
                "context": request.get("context", {})
            }
        )
        
        # STRATEGIST로 인사이트 도출
        insights = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.STRATEGIST,
            {
                "situation": analysis,
                "options": [],
                "constraints": request.get("constraints", []),
                "goals": request.get("goals", [])
            }
        )
        
        return {
            "analysis": analysis,
            "insights": insights,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== 헬퍼 함수 =====

async def cleanup_old_workflows():
    """오래된 워크플로우 정리"""
    
    current_time = datetime.now()
    workflows_to_remove = []
    
    for workflow_id, state in enhanced_agent_system.active_workflows.items():
        # 워크플로우 ID에서 타임스탬프 추출
        try:
            timestamp = float(workflow_id.split("_")[1])
            created_time = datetime.fromtimestamp(timestamp)
            
            # 24시간 이상 된 워크플로우 제거
            if (current_time - created_time).days >= 1:
                workflows_to_remove.append(workflow_id)
        except:
            continue
    
    for workflow_id in workflows_to_remove:
        del enhanced_agent_system.active_workflows[workflow_id]
        logger.info(f"Cleaned up old workflow: {workflow_id}")
    
    return len(workflows_to_remove)

# 주기적인 정리 작업 스케줄링 (FastAPI startup event에서 실행)
async def schedule_cleanup():
    while True:
        await asyncio.sleep(3600)  # 1시간마다
        removed = await cleanup_old_workflows()
        if removed > 0:
            logger.info(f"Cleaned up {removed} old workflows")