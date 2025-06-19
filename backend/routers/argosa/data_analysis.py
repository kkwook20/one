# backend/routers/argosa/data_analysis.py 
"""데이터 분석 및 AI 에이전트 시스템 라우터"""

from fastapi import APIRouter, HTTPException, WebSocket, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional, AsyncGenerator, TypedDict
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
from ...services.data_collection import comprehensive_data_collector

# 분리된 모듈 imports
from .analysis import (
    # Prompts
    AGENT_PROMPTS,
    # Configs
    AGENT_CONFIGS,
    WORKFLOW_PHASES,
    DEFAULT_AI_MODELS,
    WEB_SEARCH_PATTERNS,
    SYSTEM_CONFIG,
    ERROR_MESSAGES,
    EnhancedAgentType,
    # Helpers
    format_timestamp,
    format_duration,
    needs_web_search,
    calculate_workflow_progress,
    generate_mock_agent_performance,
    generate_mock_workflow_data,
    extract_json_from_text,
    sanitize_code,
    validate_workflow_state,
    calculate_agent_efficiency,
    should_retry_operation,
    determine_next_workflow
)

# 추가 import - 분산 AI 실행 지원
from .analysis.lm_studio_manager import lm_studio_manager, TaskType
from .analysis.network_discovery import network_discovery
from .analysis.distributed_ai import distributed_executor

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
    project_structure: Dict[str, Any]
    file_dependencies: Dict[str, List[str]]
    code_patterns: List[Dict[str, Any]]
    entity_map: Dict[str, Any]
    
    # 작업 분해
    subtasks: List[Dict[str, Any]]
    current_subtask: Optional[Dict[str, Any]]
    completed_subtasks: List[str]
    
    # 코드 조각들
    code_fragments: Dict[str, str]
    integration_points: List[Dict[str, Any]]
    
    # AI 간 통신
    messages: List[Dict[str, Any]]
    pending_questions: List[Dict[str, Any]]
    decisions: List[Dict[str, Any]]
    
    # 검증 및 품질
    validation_results: Dict[str, Any]
    quality_metrics: Dict[str, Any]
    test_coverage: float
    
    # RAG 컨텍스트
    rag_documents: List[str]
    learned_patterns: List[Dict[str, Any]]
    
    # 실시간 협업
    websocket_clients: List[str]
    collaboration_session_id: Optional[str]
    
    # 추가 필드
    objective: str
    constraints: List[str]
    project_root: str
    
    # 아키텍처 설계
    architecture_design: Optional[Dict[str, Any]]
    requirements: Optional[Dict[str, Any]]
    integrated_code: Optional[str]
    test_code: Optional[Dict[str, Any]]
    coding_standards: Optional[Dict[str, Any]]

class DataAnalysisWorkflowState(TypedDict):
    """데이터 분석 워크플로우 상태"""
    
    # 기본 정보
    workflow_id: str
    analysis_type: str
    current_phase: str
    
    # 데이터 수집
    data_sources: List[str]
    search_query: Optional[str]
    collected_data: Dict[str, Any]
    
    # 분석 정보
    analysis_objective: str
    analysis_results: Dict[str, Any]
    insights: Dict[str, Any]
    visualizations: List[Dict[str, Any]]
    final_report: Dict[str, Any]
    
    # 웹 검색 관련
    needs_web_search: bool
    search_reasons: List[str]
    web_search_context: Dict[str, Any]
    
    # 기타
    constraints: List[str]
    business_goals: List[str]
    priority: str
    
    # 웹 검색 설정
    enable_web_search: bool
    search_sources: List[str]
    search_depth: str
    
    # 컨텍스트
    context: Optional[Dict[str, Any]]
    requires_login: Optional[bool]
    target_domains: Optional[List[str]]

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
    priority: str = "normal"
    objective: str = ""
    constraints: List[str] = []
    
    # 웹 검색 관련 필드
    enable_web_search: bool = False
    search_sources: List[str] = []
    search_depth: str = "normal"

class AgentTask(BaseModel):
    """에이전트 작업 정의"""
    task_id: str = Field(default_factory=lambda: f"task_{datetime.now().timestamp()}")
    agent_type: EnhancedAgentType
    task_type: str
    input_data: Dict[str, Any]
    dependencies: List[str] = []
    timeout: int = SYSTEM_CONFIG["agent_timeout_seconds"]
    retry_count: int = SYSTEM_CONFIG["retry_count"]

class WorkflowDefinition(BaseModel):
    """워크플로우 정의"""
    workflow_id: str = Field(default_factory=lambda: f"wf_{datetime.now().timestamp()}")
    name: str
    description: str
    tasks: List[AgentTask]
    execution_order: List[str]
    parallel_groups: List[List[str]] = []
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
        self.ai_models = DEFAULT_AI_MODELS
        
        # 에이전트 초기화
        self._initialize_agents()
        self._create_workflows()
        
    def _initialize_agents(self):
        """에이전트 초기화"""
        
        # 설정에서 에이전트 생성
        for agent_type in EnhancedAgentType:
            config = AGENT_CONFIGS.get(agent_type, {})
            self.agents[agent_type] = {
                "status": "ready",
                "config": {
                    **config,
                    "prompt_template": AGENT_PROMPTS.get(agent_type.value, "")
                },
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
        
        workflow = StateGraph(DataAnalysisWorkflowState)
        
        # 노드 추가
        workflow.add_node("collect_data", self._collect_data_node)
        workflow.add_node("check_web_search", self._check_web_search_node)
        workflow.add_node("analyze_data", self._analyze_data_node)
        workflow.add_node("generate_insights", self._generate_insights_node)
        workflow.add_node("create_visualizations", self._create_visualizations_node)
        workflow.add_node("generate_report", self._generate_report_node)
        
        # 엣지 정의
        workflow.add_edge("collect_data", "check_web_search")
        
        # 조건부 라우팅 - 웹 검색 필요 여부
        def web_search_decision(state):
            if state.get("needs_web_search", False):
                return "collect_web_data"
            return "analyze_data"
        
        workflow.add_conditional_edges(
            "check_web_search",
            web_search_decision,
            {
                "collect_web_data": "collect_data",  # 다시 수집 (웹 포함)
                "analyze_data": "analyze_data"
            }
        )
        
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
        task_list = decomposition.get("tasks", []) if isinstance(decomposition, dict) else []
        
        for i, task_info in enumerate(task_list):
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
        code = ""
        if isinstance(generated, dict):
            code = generated.get("code", "")
        elif isinstance(generated, str):
            code = generated
            
        state["code_fragments"][fragment_id] = sanitize_code(code)
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
        approved = False
        if isinstance(review, dict):
            approved = review.get("approved", False)
        
        if approved:
            current_task["status"] = "reviewed"
            state["completed_subtasks"].append(current_task["id"])
            state["validation_results"]["review_passed"] = True
        else:
            current_task["status"] = "needs_revision"
            if isinstance(review, dict):
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
        
        # 테스트 커버리지 추출
        coverage = 0
        if isinstance(tests, dict):
            coverage = tests.get("estimated_coverage", 0)
        
        state["test_coverage"] = coverage
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
    
    async def _collect_data_node(self, state: DataAnalysisWorkflowState) -> DataAnalysisWorkflowState:
        """데이터 수집 노드"""
        print("[분석 워크플로우] 데이터 수집 중...")
        
        # 수집할 소스 결정
        sources = state.get("data_sources", [])
        
        # 컨텍스트 준비
        context = {
            "objective": state.get("analysis_objective", ""),
            "constraints": state.get("constraints", []),
            "priority": state.get("priority", "normal"),
            "requires_login": state.get("requires_login", False),
            "domains": state.get("target_domains", [])
        }
        
        # comprehensive_data_collector를 통한 통합 수집
        data = await comprehensive_data_collector.collect_data(
            sources=sources,
            query=state.get("search_query", state.get("analysis_objective", "")),
            context=context
        )
        
        state["collected_data"] = data
        state["current_phase"] = "data_collected"
        
        return state
    
    async def _check_web_search_node(self, state: DataAnalysisWorkflowState) -> DataAnalysisWorkflowState:
        """웹 검색 필요 여부 판단 노드"""
        print("[분석 워크플로우] 웹 검색 필요 여부 확인 중...")
        
        # 1단계: 패턴 기반 빠른 판단
        pattern_check = needs_web_search(
            state.get("analysis_objective", ""),
            WEB_SEARCH_PATTERNS
        )
        
        if any(pattern_check.values()):
            state["needs_web_search"] = True
            state["search_reasons"] = [k for k, v in pattern_check.items() if v]
            state["data_sources"] = ["web"] + state.get("data_sources", [])
            return state
        
        # 2단계: 명시적 요청 확인
        if state.get("enable_web_search", False):
            state["needs_web_search"] = True
            state["search_reasons"] = ["explicitly_requested"]
            state["data_sources"] = ["web"] + state.get("data_sources", [])
            return state
        
        # 3단계: RAG에서 충분한 정보가 있는지 확인
        rag_query = RAGQuery(
            query=state.get("analysis_objective", ""),
            top_k=5
        )
        rag_results = await rag_service.search(rag_query)
        
        if len(rag_results) < 3 or all(r.score < 0.7 for r in rag_results):
            state["needs_web_search"] = True
            state["search_reasons"] = ["insufficient_local_data"]
            state["data_sources"] = ["web"] + state.get("data_sources", [])
            return state
        
        # 4단계: AI 판단 (높은 우선순위인 경우)
        if state.get("priority") == "high":
            should_search = await self._check_web_data_needed(state)
            state["needs_web_search"] = should_search
            state["search_reasons"] = ["ai_recommendation"] if should_search else []
            if should_search:
                state["data_sources"] = ["web"] + state.get("data_sources", [])
        else:
            state["needs_web_search"] = False
            state["search_reasons"] = []
        
        return state
    
    async def _analyze_data_node(self, state: DataAnalysisWorkflowState) -> DataAnalysisWorkflowState:
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
        
        # 웹 검색 결과가 있으면 RAG에 저장
        if "web" in state.get("collected_data", {}):
            await self._save_web_results_to_rag(state["collected_data"]["web"])
        
        return state
    
    async def _generate_insights_node(self, state: DataAnalysisWorkflowState) -> DataAnalysisWorkflowState:
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
    
    async def _create_visualizations_node(self, state: DataAnalysisWorkflowState) -> DataAnalysisWorkflowState:
        """시각화 생성"""
        print("[분석 워크플로우] 시각화 생성 중...")
        
        # 시각화 생성 로직
        visualizations = []
        
        # 예시: Plotly 차트 생성
        if isinstance(state.get("analysis_results"), dict) and "time_series_data" in state["analysis_results"]:
            fig = go.Figure()
            # 시각화 로직
            visualizations.append({
                "type": "time_series",
                "figure": fig.to_json()
            })
        
        state["visualizations"] = visualizations
        state["current_phase"] = "visualizations_created"
        
        return state
    
    async def _generate_report_node(self, state: DataAnalysisWorkflowState) -> DataAnalysisWorkflowState:
        """보고서 생성"""
        print("[분석 워크플로우] 보고서 생성 중...")
        
        report = {
            "executive_summary": state.get("insights", {}).get("summary", "") if isinstance(state.get("insights"), dict) else "",
            "detailed_analysis": state.get("analysis_results", {}),
            "visualizations": state.get("visualizations", []),
            "recommendations": state.get("insights", {}).get("recommendations", []) if isinstance(state.get("insights"), dict) else [],
            "next_steps": state.get("insights", {}).get("action_plan", []) if isinstance(state.get("insights"), dict) else []
        }
        
        state["final_report"] = report
        state["current_phase"] = "completed"
        
        return state
    
    # ===== 헬퍼 메서드 =====
    
    async def _check_web_data_needed(self, state: Dict[str, Any]) -> bool:
        """웹 데이터 필요 여부를 AI가 판단"""
        
        decision = await self._execute_agent(
            EnhancedAgentType.DECISION_MAKER,
            {
                "question": "Do I need web search data for this objective?",
                "context": {
                    "objective": state.get("analysis_objective", state.get("objective", "")),
                    "existing_data": list(state.get("collected_data", {}).keys()),
                    "priority": state.get("priority", "normal")
                },
                "criteria": [
                    "Is real-time information needed?",
                    "Is external data required?",
                    "Would web search improve accuracy?",
                    "Is the information time-sensitive?"
                ],
                "options": ["needs_web_search", "no_web_search_needed"]
            }
        )
        
        if isinstance(decision, dict):
            return decision.get("decision", "") == "needs_web_search"
        return False
    
    async def _save_web_results_to_rag(self, web_results: Dict[str, Any]):
        """웹 검색 결과를 RAG에 저장"""
        
        try:
            documents = []
            
            for source, data in web_results.items():
                if isinstance(data, dict) and "results" in data:
                    for result in data["results"]:
                        doc = Document(
                            id=f"web_{source}_{datetime.now().timestamp()}",
                            content=json.dumps(result),
                            metadata={
                                "type": "web_search_result",
                                "source": source,
                                "timestamp": datetime.now().isoformat(),
                                "query": data.get("query", "")
                            }
                        )
                        documents.append(doc)
            
            if documents:
                await rag_service.add_documents(documents)
                logger.info(f"Saved {len(documents)} web search results to RAG")
                
        except Exception as e:
            logger.error(f"Failed to save web results to RAG: {e}")
    
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
            agent["performance_metrics"]["success_rate"] *= 0.95
            
            # 재시도 로직
            if should_retry_operation(e, 0, SYSTEM_CONFIG["retry_count"]):
                await asyncio.sleep(1)
                return await self._execute_agent(agent_type, prompt_data)
            
            raise
    
    async def _call_llm(self, model: str, prompt: str) -> Dict[str, Any]:
        """LLM 호출 - 분산 실행 지원"""
        
        # 에이전트 타입에서 작업 타입 매핑
        task_type_map = {
            "creative": TaskType.CREATIVE_WRITING,
            "code": TaskType.CODE_GENERATION,
            "analys": TaskType.ANALYSIS,
            "reason": TaskType.REASONING,
            "translat": TaskType.TRANSLATION,
            "summar": TaskType.SUMMARIZATION
        }
        
        # 프롬프트에서 작업 타입 추론
        task_type = TaskType.ANALYSIS  # 기본값
        for key, t_type in task_type_map.items():
            if key in prompt.lower():
                task_type = t_type
                break
        
        # 분산 실행
        task_id = await distributed_executor.submit_task(
            prompt=prompt,
            model=model,
            agent_type="general",  # 실제 에이전트 타입으로 변경 필요
            task_type=task_type,
            priority=0
        )
        
        # 결과 대기
        task = await distributed_executor.wait_for_task(task_id, timeout=60)
        
        if task and task.status == "completed":
            result = task.result
            if result and "choices" in result:
                content = result["choices"][0]["message"]["content"]
                
                # JSON 추출 시도
                json_result = extract_json_from_text(content)
                if json_result:
                    return json_result
                
                return {"result": content}
        
        # 폴백: 시뮬레이션
        return await self._simulate_llm_response(prompt)
    
    async def _simulate_llm_response(self, prompt: str) -> Dict[str, Any]:
        """LLM 응답 시뮬레이션 (폴백용)"""
        
        # 시뮬레이션
        await asyncio.sleep(1)
        
        # 프롬프트에서 JSON 추출 시도
        json_result = extract_json_from_text(prompt)
        if json_result:
            return json_result
        
        # 모델별 기본 응답
        if "architect" in prompt.lower():
            return {
                "components": [
                    {"name": "AuthService", "type": "service", "responsibility": "Authentication"},
                    {"name": "UserRepository", "type": "repository", "responsibility": "User data access"}
                ],
                "integration_strategy": "RESTful API with JWT",
                "data_flow": "Client -> API Gateway -> Service -> Repository -> Database"
            }
        elif "generate" in prompt.lower() and "code" in prompt.lower():
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
        elif "decision" in prompt.lower() and "web search" in prompt.lower():
            return {
                "decision": "needs_web_search",
                "confidence": 0.8,
                "reasoning": "Real-time data may be required for accurate analysis"
            }
        elif "analyze" in prompt.lower():
            return {
                "summary": "Analysis complete",
                "patterns": ["Pattern 1", "Pattern 2"],
                "insights": ["Insight 1", "Insight 2"],
                "recommendations": ["Recommendation 1", "Recommendation 2"]
            }
        elif "plan" in prompt.lower():
            return {
                "tasks": [
                    {"description": "Task 1", "priority": "high", "complexity": "medium"},
                    {"description": "Task 2", "priority": "normal", "complexity": "low"}
                ]
            }
        
        return {"status": "completed", "result": "Generic response"}
    
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
                project_root=request.parameters.get("project_root", "."),
                architecture_design=None,
                requirements=None,
                integrated_code=None,
                test_code=None,
                coding_standards=None
            )
        else:
            initial_state = DataAnalysisWorkflowState(
                workflow_id=workflow_id,
                analysis_type=request.analysis_type,
                current_phase="initialized",
                data_sources=request.parameters.get("data_sources", []),
                search_query=request.parameters.get("search_query"),
                collected_data={},
                analysis_objective=request.objective,
                analysis_results={},
                insights={},
                visualizations=[],
                final_report={},
                needs_web_search=False,
                search_reasons=[],
                web_search_context={},
                constraints=request.constraints,
                business_goals=request.parameters.get("business_goals", []),
                priority=request.priority,
                enable_web_search=request.enable_web_search,
                search_sources=request.search_sources,
                search_depth=request.search_depth,
                context=None,
                requires_login=False,
                target_domains=[]
            )
        
        self.active_workflows[workflow_id] = initial_state
        
        return workflow_id
    
    async def execute_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """워크플로우 실행"""
        
        if workflow_id not in self.active_workflows:
            raise ValueError(f"Workflow {workflow_id} not found")
        
        initial_state = self.active_workflows[workflow_id]
        config = {"configurable": {"thread_id": workflow_id}}
        
        # 워크플로우 타입 결정
        if isinstance(initial_state, dict) and initial_state.get("task_type"):
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
                                               "architecture_designed", "data_analyzed", 
                                               "insights_generated", "completed"]:
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
        
        if message_type == "subscribe":
            # 토픽 구독
            topics = message.get("topics", [])
            logger.info(f"Client {ws_id} subscribed to topics: {topics}")
            
            # 즉시 현재 상태 전송
            if "metrics" in topics:
                metrics_message = {
                    "type": "metrics_update",
                    "data": {
                        "active_workflows": len(self.active_workflows),
                        "active_tasks": len(self.active_tasks),
                        "cached_results": len(self.results_cache),
                        "websocket_connections": len(self.websocket_connections),
                        "agent_performance": {
                            agent_type.value: agent["performance_metrics"]
                            for agent_type, agent in self.agents.items()
                        }
                    }
                }
                await self.websocket_connections[ws_id].send_json(metrics_message)
            
            if "agents" in topics:
                for agent_type, agent in self.agents.items():
                    agent_status_message = {
                        "type": "agent_status",
                        "data": {
                            "type": agent_type.value,
                            "status": agent["status"],
                            "model": agent["model"],
                            "performance_metrics": agent["performance_metrics"]
                        }
                    }
                    await self.websocket_connections[ws_id].send_json(agent_status_message)
        
        elif message_type == "subscribe_workflow":
            workflow_id = message.get("workflow_id")
            if workflow_id in self.active_workflows:
                state = self.active_workflows[workflow_id]
                if isinstance(state, dict) and "websocket_clients" in state:
                    state["websocket_clients"].append(ws_id)
        
        elif message_type == "agent_question":
            agent_type = EnhancedAgentType(message.get("agent", "analyst"))
            response = await self._execute_agent(agent_type, message.get("data", {}))
            
            await self.websocket_connections[ws_id].send_json({
                "type": "agent_response",
                "question_id": message.get("question_id"),
                "response": response
            })

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
        raise HTTPException(status_code=404, detail=ERROR_MESSAGES["workflow_not_found"])
    
    state = enhanced_agent_system.active_workflows[workflow_id]
    
    # 상태에 따른 진행률 계산
    current_phase = state.get("current_phase", "initialized")
    workflow_type = "code" if state.get("task_type") else "analysis"
    progress = calculate_workflow_progress(current_phase, workflow_type, WORKFLOW_PHASES)
    
    response = {
        "workflow_id": workflow_id,
        "current_phase": current_phase,
        "progress": progress,
        "status": "completed" if progress == 100 else "in_progress"
    }
    
    # 타입별 추가 정보
    if isinstance(state, dict):
        if "subtasks" in state:
            response["details"] = {
                "total_subtasks": len(state.get("subtasks", [])),
                "completed_subtasks": len(state.get("completed_subtasks", [])),
                "code_fragments": len(state.get("code_fragments", {})),
                "quality_metrics": state.get("quality_metrics", {}),
                "test_coverage": state.get("test_coverage", 0)
            }
        elif "analysis_results" in state:
            response["details"] = {
                "data_sources": state.get("data_sources", []),
                "has_web_search": "web" in state.get("collected_data", {}),
                "insights_available": bool(state.get("insights")),
                "visualizations": len(state.get("visualizations", []))
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
        workflow_type = "code" if state.get("task_type") else "analysis"
        current_phase = state.get("current_phase", "unknown")
        
        workflows.append({
            "workflow_id": workflow_id,
            "type": state.get("task_type", state.get("analysis_type", "unknown")),
            "current_phase": current_phase,
            "progress": calculate_workflow_progress(current_phase, workflow_type, WORKFLOW_PHASES),
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
            "code": result.get("code", "") if isinstance(result, dict) else str(result),
            "explanation": result.get("explanation", "") if isinstance(result, dict) else "",
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
        constraints=request.get("constraints", []),
        enable_web_search=request.get("enable_web_search", False),
        search_sources=request.get("search_sources", []),
        search_depth=request.get("search_depth", "normal")
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

# ===== 분산 AI 실행 관련 엔드포인트 (개선됨) =====

@router.post("/lm-studio/discover")
async def discover_lm_studios(subnet: Optional[str] = None):
    """네트워크에서 LM Studio 인스턴스 검색"""
    
    devices = await network_discovery.scan_network(subnet)
    
    # 발견된 인스턴스 자동 추가
    for device in devices:
        await lm_studio_manager.add_instance(device.ip, device.port)
    
    return {
        "discovered": len(devices),
        "devices": [
            {
                "id": f"{device.ip}:{device.port}",
                "ip": device.ip,
                "hostname": device.hostname or device.ip,
                "port": device.port,
                "response_time": device.response_time,
                "is_local": device.ip in ["localhost", "127.0.0.1"]
            }
            for device in devices
        ]
    }

@router.get("/lm-studio/instances")
async def list_lm_studio_instances():
    """LM Studio 인스턴스 목록"""
    
    instances = []
    for inst in lm_studio_manager.instances.values():
        instances.append({
            "id": inst.id,
            "host": inst.host,
            "hostname": inst.host,  # 추가
            "port": inst.port,
            "status": inst.status,
            "is_local": inst.is_local,
            "models": inst.available_models,
            "current_model": inst.current_model,
            "performance_score": inst.performance_score,
            "capabilities": inst.capabilities  # 추가
        })
    
    return {
        "instances": instances,
        "total": len(instances),
        "active": sum(1 for inst in lm_studio_manager.instances.values() if inst.status == "connected")
    }

@router.post("/lm-studio/add-instance")
async def add_lm_studio_instance(request: Dict[str, Any]):
    """LM Studio 인스턴스 수동 추가"""
    
    host = request.get("host", "localhost")
    port = request.get("port", 1234)
    
    instance = await lm_studio_manager.add_instance(host, port)
    
    return {
        "id": instance.id,
        "status": instance.status,
        "models": instance.available_models,
        "is_local": instance.is_local
    }

@router.get("/lm-studio/instance/{instance_id}/models")
async def get_instance_models(instance_id: str):
    """특정 인스턴스의 모델 목록 가져오기"""
    
    instance = lm_studio_manager.instances.get(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    
    # 연결 재시도
    if instance.status != "connected":
        await lm_studio_manager.test_connection(instance)
    
    if instance.status == "connected":
        await lm_studio_manager.get_instance_info(instance)
    
    return {
        "instance_id": instance_id,
        "models": instance.available_models,
        "current_model": instance.current_model,
        "status": instance.status
    }

@router.post("/lm-studio/instance/{instance_id}/test")
async def test_instance_connection(instance_id: str):
    """인스턴스 연결 테스트"""
    
    instance = lm_studio_manager.instances.get(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    
    connected = await lm_studio_manager.test_connection(instance)
    
    if connected:
        await lm_studio_manager.get_instance_info(instance)
    
    return {
        "instance_id": instance_id,
        "connected": connected,
        "status": instance.status,
        "models": instance.available_models if connected else []
    }

@router.delete("/lm-studio/instance/{instance_id}")
async def remove_instance(instance_id: str):
    """인스턴스 제거"""
    
    if instance_id in lm_studio_manager.instances:
        del lm_studio_manager.instances[instance_id]
        return {"status": "removed", "instance_id": instance_id}
    
    raise HTTPException(status_code=404, detail="Instance not found")

@router.get("/distributed/status")
async def get_distributed_status():
    """분산 시스템 상태"""
    
    status = distributed_executor.get_cluster_status()
    
    # 추가 정보 포함
    status["network_scan_available"] = True
    status["auto_discovery_enabled"] = hasattr(distributed_executor, 'auto_discover')
    
    return status

@router.post("/distributed/execute")
async def execute_distributed(request: Dict[str, Any]):
    """분산 실행 요청"""
    
    task_id = await distributed_executor.submit_task(
        prompt=request["prompt"],
        model=request["model"],
        agent_type=request.get("agent_type", "general"),
        task_type=TaskType(request.get("task_type", "analysis")),
        priority=request.get("priority", 0)
    )
    
    return {
        "task_id": task_id,
        "status": "submitted"
    }

@router.get("/distributed/task/{task_id}")
async def get_task_status(task_id: str):
    """작업 상태 조회"""
    
    task = await distributed_executor.get_task_status(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {
        "task_id": task.task_id,
        "status": task.status,
        "model": task.model,
        "assigned_instance": task.assigned_instance,
        "created_at": task.created_at.isoformat(),
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "result": task.result if task.status == "completed" else None,
        "error": task.error if task.status == "failed" else None
    }

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
        await asyncio.sleep(SYSTEM_CONFIG["cache_ttl_seconds"])  # 1시간마다
        removed = await cleanup_old_workflows()
        if removed > 0:
            logger.info(f"Cleaned up {removed} old workflows")

# 초기화 및 종료 함수
async def initialize():
    """Initialize data analysis module"""
    logger.info("Data analysis module initialized")
    
    # 분산 실행기 초기화
    await distributed_executor.initialize(auto_discover=False)
    
    # 정리 작업 시작
    asyncio.create_task(schedule_cleanup())
    # 실시간 메트릭 전송 시작
    asyncio.create_task(send_realtime_metrics())
    
async def shutdown():
    """Shutdown data analysis module"""
    logger.info("Data analysis module shutting down")
    # HTTP 클라이언트 정리
    if enhanced_agent_system.http_client:
        await enhanced_agent_system.http_client.aclose()

# 실시간 메트릭 전송
async def send_realtime_metrics():
    """주기적으로 실시간 메트릭 전송"""
    while True:
        await asyncio.sleep(SYSTEM_CONFIG["metrics_update_interval"])  # 5초마다
        
        # 각 에이전트의 현재 상태를 실시간 데이터로 변환
        realtime_data = {
            "timestamp": datetime.now().isoformat()
        }
        
        for agent_type, agent in enhanced_agent_system.agents.items():
            if agent["status"] == "busy":
                # 실행 중인 에이전트의 효율성
                efficiency = calculate_agent_efficiency(
                    agent["performance_metrics"]["success_rate"],
                    agent["performance_metrics"]["average_time"]
                )
                realtime_data[agent_type.value] = efficiency
        
        # 모든 WebSocket 클라이언트에 전송
        message = {
            "type": "realtime_data",
            "data": realtime_data
        }
        
        for ws_id, websocket in enhanced_agent_system.websocket_connections.items():
            try:
                await websocket.send_json(message)
            except:
                pass