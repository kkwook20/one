"""데이터 분석 및 AI 에이전트 시스템 라우터"""

from fastapi import APIRouter, HTTPException, WebSocket, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional, AsyncGenerator, TypedDict
import asyncio
from datetime import datetime
import json
import os
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
from langgraph.checkpoint.memory import MemorySaver

# 프로젝트 내부 imports
from services.rag_service import rag_service, module_integration, Document, RAGQuery

# 분리된 모듈 imports
try:
    from routers.argosa.analysis import (
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
        determine_next_workflow,
        diagnose_llm_failure,
        simulate_llm_response,
        simulate_integration,
        cleanup_old_workflows,
        send_realtime_metrics
    )
except ImportError:
    # Fallback for testing environments
    AGENT_PROMPTS = {}
    AGENT_CONFIGS = {}
    WORKFLOW_PHASES = []
    DEFAULT_AI_MODELS = {}
    WEB_SEARCH_PATTERNS = {}
    SYSTEM_CONFIG = {}
    ERROR_MESSAGES = {}
    EnhancedAgentType = None
    format_timestamp = lambda x: str(x)
    format_duration = lambda x: "0s"
    needs_web_search = lambda x: False
    calculate_workflow_progress = lambda x: 0
    generate_mock_agent_performance = lambda: {}
    generate_mock_workflow_data = lambda: {}
    extract_json_from_text = lambda x: {}
    sanitize_code = lambda x: x
    validate_workflow_state = lambda x: True
    calculate_agent_efficiency = lambda x: 1.0
    should_retry_operation = lambda x: False
    determine_next_workflow = lambda x: None
    diagnose_llm_failure = lambda x: "Unknown"
    simulate_llm_response = lambda x: "Mock response"
    simulate_integration = lambda: None
    cleanup_old_workflows = lambda: None
    send_realtime_metrics = lambda x: None

# 추가 import - 분산 AI 실행 지원
try:
    from routers.argosa.analysis.lm_studio_manager import lm_studio_manager, TaskType
    from routers.argosa.analysis.network_discovery import network_discovery
    from routers.argosa.analysis.distributed_ai import distributed_executor
    from routers.argosa.analysis.configs import get_distributed_settings
except ImportError:
    lm_studio_manager = None
    TaskType = None
    network_discovery = None
    distributed_executor = None
    get_distributed_settings = lambda: {}

router = APIRouter()
logger = logging.getLogger(__name__)

# ===== 시스템 문서 파서 =====

class SystemDocumentParser:
    """시스템 문서를 파싱하여 에이전트가 참조할 수 있도록 구조화"""
    
    def __init__(self):
        self.documents = {}
        self.parsed_sections = {}
        self.load_documents()
        
    def load_documents(self):
        """시스템 문서 로드"""
        try:
            # 마스터 문서 로드
            master_doc_path = os.path.join(os.path.dirname(__file__), "../../../ARGOSA_MASTER_DOCUMENTATION.md")
            if os.path.exists(master_doc_path):
                with open(master_doc_path, 'r', encoding='utf-8') as f:
                    self.documents['master'] = f.read()
                    
            # 기술 가이드 로드
            tech_guide_path = os.path.join(os.path.dirname(__file__), "../../../ARGOSA_TECHNICAL_GUIDE.md")
            if os.path.exists(tech_guide_path):
                with open(tech_guide_path, 'r', encoding='utf-8') as f:
                    self.documents['technical'] = f.read()
                    
            self._parse_documents()
        except Exception as e:
            logger.error(f"Failed to load system documents: {e}")
            
    def _parse_documents(self):
        """문서를 섹션별로 파싱"""
        for doc_type, content in self.documents.items():
            sections = {}
            current_section = None
            current_content = []
            
            for line in content.split('\n'):
                if line.startswith('## '):
                    if current_section:
                        sections[current_section] = '\n'.join(current_content)
                    current_section = line[3:].strip()
                    current_content = []
                elif line.startswith('### '):
                    subsection = line[4:].strip()
                    if current_section:
                        current_content.append(f"\n{line}")
                else:
                    current_content.append(line)
                    
            if current_section:
                sections[current_section] = '\n'.join(current_content)
                
            self.parsed_sections[doc_type] = sections
            
    def get_section(self, doc_type: str, section_name: str) -> str:
        """특정 섹션 내용 반환"""
        return self.parsed_sections.get(doc_type, {}).get(section_name, "")
        
    def get_agent_guidance(self, agent_type: str) -> str:
        """특정 에이전트를 위한 가이드 반환"""
        guidance = []
        
        # 에이전트 역할 설명
        if agent_type in ["data_analyst", "trend_predictor", "anomaly_detector"]:
            guidance.append(self.get_section('master', 'AI Agents (AI 에이전트)'))
            
        # 워크플로우 정보
        guidance.append(self.get_section('master', 'Workflow System (워크플로우 시스템)'))
        
        # 기술적 상세
        if agent_type == "coordinator":
            guidance.append(self.get_section('technical', '에이전트 간 통신 프로토콜'))
            
        return '\n\n'.join(guidance)
        
    def get_objective_processing_guide(self) -> str:
        """Objective 처리 가이드 반환"""
        return self.get_section('technical', 'Objective 처리 엔진')
        
    def get_workflow_context(self, workflow_type: str) -> str:
        """워크플로우 타입별 컨텍스트 반환"""
        context = []
        
        if workflow_type == "data_analysis":
            context.append(self.get_section('master', '워크플로우 타입'))
            context.append(self.get_section('technical', '실제 사용 시나리오'))
            
        return '\n\n'.join(context)

# 전역 문서 파서 인스턴스
system_doc_parser = SystemDocumentParser()

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
    
    # Objective 분석 결과
    objective_analysis: Optional[Dict[str, Any]]
    required_agents: Optional[List[str]]
    execution_plan: Optional[List[Dict[str, Any]]]

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
        
        # 초기화 플래그
        self.initialized = False
        
        # 에이전트 초기화
        self._initialize_agents()
        self._create_workflows()
        
        # 초기화 태스크는 startup event에서 처리됨
        
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
        except Exception as e:
            logger.warning(f"Code analysis API failed: {e}, using fallback analysis")
            # 폴백: 실제 프로젝트 구조 기반 간단한 분석
            project_root = state.get("project_root", ".")
            project_analysis = await self._simple_project_analysis(project_root)
        
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
        
        # 코드 통합 수행
        try:
            integration_request = {
                "fragments": state["code_fragments"],
                "architecture": state["architecture_design"],
                "integration_points": state.get("integration_points", [])
            }
            
            # 코드 조각들을 의미있는 순서로 통합
            integration_order = ["imports", "constants", "classes", "functions", "main"]
            integrated_parts = []
            
            # 각 카테고리별로 코드 조각 정렬
            categorized_fragments = self._categorize_code_fragments(state["code_fragments"])
            
            for category in integration_order:
                if category in categorized_fragments:
                    integrated_parts.extend(categorized_fragments[category])
            
            # 통합된 코드 생성
            integrated_code = {
                "status": "success",
                "integration_type": integration_request.get("integration_type", "sequential"),
                "message": "Code fragments integrated successfully",
                "artifacts": {
                    "files_created": list(state["code_fragments"].keys()),
                    "files_modified": [],
                    "integrated_code": "\n\n".join(integrated_parts)
                },
                "summary": f"Integrated {len(state['code_fragments'])} code fragments"
            }
            
        except Exception as e:
            logger.error(f"Integration error: {e}")
            # 폴백: 간단한 통합
            integrated_code = {
                "status": "partial",
                "integration_type": "simple",
                "message": "Used fallback integration",
                "artifacts": {
                    "integrated_code": "\n\n".join(state.get("code_fragments", {}).values())
                }
            }
        
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
        
        sources = state.get("data_sources", [])
        data = {}
        
        # 기존 모듈 활용
        if "web" in sources:
            # Firefox Manager 확인
            from ..shared.firefox_manager import firefox_manager
            
            # Firefox가 실행 중인지 확인하고 필요시 시작
            firefox_ready = await firefox_manager.check_and_start()
            
            if firefox_ready:
                from routers.argosa.collection.web_crawler_agent import web_crawler_system
                data["web"] = await web_crawler_system.crawl_website({
                    "url": state.get("search_query", ""),
                    "max_depth": 2
                })
            else:
                logger.warning("Firefox not available for web crawling")
                data["web"] = {"error": "Firefox not available"}
        
        if "llm" in sources:
            from routers.argosa.collection.llm_query_service import llm_service
            data["llm"] = await llm_service.query_llm({
                "query": state.get("search_query", ""),
                "platform": "all"
            })
        
        # 다른 소스들도 필요시 추가
        
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
        
        # execution_plan에서 현재 단계의 에이전트 찾기
        execution_plan = state.get("execution_plan", [])
        required_agents = state.get("required_agents", [])
        
        # 분석 단계에 해당하는 에이전트 선택
        analysis_agent = EnhancedAgentType.ANALYST  # 기본값
        for phase in execution_plan:
            if "analy" in phase.get("phase", "").lower():
                agent_name = phase.get("agent", "analyst")
                try:
                    analysis_agent = EnhancedAgentType[agent_name.upper()]
                except KeyError:
                    logger.warning(f"Unknown agent type: {agent_name}, using ANALYST")
        
        # 선택된 에이전트로 분석 수행
        analysis = await self._execute_agent(
            analysis_agent,
            {
                "data": state["collected_data"],
                "objective": state.get("analysis_objective", ""),
                "context": state.get("context", {}),
                "objective_analysis": state.get("objective_analysis", {}),
                "workflow_context": f"This is part of execution plan: {execution_plan}"
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
    
    def _categorize_code_fragments(self, fragments: Dict[str, str]) -> Dict[str, List[str]]:
        """코드 조각을 카테고리별로 분류"""
        categorized = {
            "imports": [],
            "constants": [],
            "classes": [],
            "functions": [],
            "main": []
        }
        
        for key, code in fragments.items():
            lines = code.strip().split('\n')
            
            # Import 문
            if any(line.strip().startswith(('import ', 'from ')) for line in lines):
                categorized["imports"].append(code)
            # 클래스 정의
            elif any(line.strip().startswith('class ') for line in lines):
                categorized["classes"].append(code)
            # 함수 정의
            elif any(line.strip().startswith(('def ', 'async def ')) for line in lines):
                categorized["functions"].append(code)
            # 상수 (대문자 변수)
            elif any(re.match(r'^[A-Z_]+\s*=', line.strip()) for line in lines):
                categorized["constants"].append(code)
            # 나머지 (main 코드)
            else:
                categorized["main"].append(code)
                
        return categorized
    
    async def _simple_project_analysis(self, project_root: str) -> Dict[str, Any]:
        """간단한 프로젝트 분석 (폴백용)"""
        import os
        from pathlib import Path
        
        analysis = {
            "statistics": {
                "files": {
                    "python_files": 0,
                    "javascript_files": 0,
                    "total_files": 0
                },
                "lines_of_code": 0
            },
            "architecture": {
                "patterns": [],
                "structure": "unknown"
            },
            "quality_metrics": {
                "average_complexity": 0,
                "documentation_coverage": 0
            }
        }
        
        try:
            root_path = Path(project_root)
            if root_path.exists():
                # 파일 카운트
                for ext, key in [(".py", "python_files"), (".js", "javascript_files"), (".ts", "javascript_files")]:
                    files = list(root_path.rglob(f"*{ext}"))
                    analysis["statistics"]["files"][key] += len(files)
                    analysis["statistics"]["total_files"] += len(files)
                
                # 패턴 감지
                if (root_path / "models").exists() or (root_path / "model").exists():
                    analysis["architecture"]["patterns"].append("MVC")
                if (root_path / "routers").exists() or (root_path / "routes").exists():
                    analysis["architecture"]["patterns"].append("Router")
                if (root_path / "services").exists() or (root_path / "service").exists():
                    analysis["architecture"]["patterns"].append("Service Layer")
                
                # 구조 타입
                if (root_path / "src").exists():
                    analysis["architecture"]["structure"] = "src-based"
                elif (root_path / "app").exists():
                    analysis["architecture"]["structure"] = "app-based"
                else:
                    analysis["architecture"]["structure"] = "flat"
                    
        except Exception as e:
            logger.error(f"Simple project analysis failed: {e}")
            
        return analysis
    
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
            # 시스템 문서에서 관련 가이드 추가
            system_guidance = system_doc_parser.get_agent_guidance(agent_type.value)
            if system_guidance:
                prompt_data["system_guidance"] = system_guidance
                
            # Objective 처리 가이드 추가 (coordinator와 planner에게만)
            if agent_type.value in ["coordinator", "planner"]:
                prompt_data["objective_guide"] = system_doc_parser.get_objective_processing_guide()
            
            # 프롬프트 생성
            prompt_template = agent["config"]["prompt_template"]
            
            # 시스템 가이드가 있으면 프롬프트에 추가
            if "system_guidance" in prompt_data:
                enhanced_prompt = f"""
SYSTEM KNOWLEDGE:
{prompt_data.get('system_guidance', '')}

TASK CONTEXT:
{prompt_template}
"""
                prompt = enhanced_prompt.format(**prompt_data)
            else:
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
                logger.info(f"Retrying agent {agent_type} execution...")
                await asyncio.sleep(1)
                return await self._execute_agent(agent_type, prompt_data)
            
            # 진단 정보가 포함된 예외인 경우 그대로 전달
            if "Diagnosis:" in str(e):
                raise
            
            # 그렇지 않은 경우 새로운 예외로 래핑
            raise Exception(f"Agent {agent_type} execution failed after retries: {str(e)}")
    
    async def _call_llm(self, model: str, prompt: str) -> Dict[str, Any]:
        """LLM 호출 - 실제 LM Studio 호출"""
        
        logger.info(f"Calling LLM with model: {model}")
        logger.debug(f"Prompt length: {len(prompt)} chars")
        
        error_details = {
            "distributed_execution_error": None,
            "direct_call_error": None,
            "connection_status": {},
            "model_availability": {}
        }
        
        try:
            # 1. 분산 실행 설정 확인
            from .analysis.configs import get_distributed_settings
            dist_settings = get_distributed_settings()
            
            if dist_settings.get("enabled", True) and self.initialized:
                # 분산 실행 사용
                logger.info("Using distributed execution")
                
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
                    priority=5  # 중간 우선순위
                )
                
                logger.info(f"Submitted distributed task: {task_id}")
                
                # 결과 대기 (타임아웃은 설정에서 가져옴)
                timeout = dist_settings.get("timeout", 60)
                task = await distributed_executor.wait_for_task(task_id, timeout=timeout)
                
                if task and task.status == "completed":
                    result = task.result
                    if result and "choices" in result:
                        content = result["choices"][0]["message"]["content"]
                        
                        logger.info(f"Distributed task completed successfully")
                        logger.debug(f"Response length: {len(content)} chars")
                        
                        # JSON 추출 시도
                        json_result = extract_json_from_text(content)
                        if json_result:
                            return json_result
                        
                        return {"result": content, "source": "distributed"}
                    else:
                        logger.error(f"Invalid response format from distributed task")
                        raise Exception("Invalid response format")
                else:
                    error_msg = f"Distributed task failed: {task.error if task else 'Timeout'}"
                    logger.error(error_msg)
                    error_details["distributed_execution_error"] = error_msg
                    raise Exception(error_msg)
                    
            else:
                # 직접 localhost 호출 (분산 실행 비활성화 또는 초기화 안됨)
                logger.info("Using direct localhost LM Studio call")
                
                # localhost 인스턴스 확인
                localhost_instance_id = "localhost:1234"
                
                # lm_studio_manager가 초기화되지 않았다면 간단히 추가
                if localhost_instance_id not in lm_studio_manager.instances:
                    await lm_studio_manager.add_instance("localhost", 1234)
                
                localhost = lm_studio_manager.instances.get(localhost_instance_id)
                error_details["connection_status"]["localhost"] = localhost.status if localhost else "not_found"
                
                # 모델이 지정되지 않았다면 기본 모델 사용
                if not model or model == "default":
                    if localhost and localhost.available_models:
                        model = localhost.available_models[0]
                    else:
                        # 모델 목록 다시 확인
                        await lm_studio_manager.test_connection(localhost)
                        await lm_studio_manager.get_instance_info(localhost)
                        if localhost.available_models:
                            model = localhost.available_models[0]
                        else:
                            error_details["model_availability"]["localhost"] = "no_models_available"
                            raise Exception("No models available in localhost LM Studio")
                
                error_details["model_availability"]["selected_model"] = model
                
                # 직접 호출
                result = await lm_studio_manager.call_llm(
                    prompt=prompt,
                    model=model,
                    instance_id=localhost_instance_id,
                    temperature=0.7,
                    max_tokens=2000
                )
                
                if result and "choices" in result:
                    content = result["choices"][0]["message"]["content"]
                    
                    logger.info(f"Direct LLM call completed successfully")
                    logger.debug(f"Response length: {len(content)} chars")
                    
                    # JSON 추출 시도
                    json_result = extract_json_from_text(content)
                    if json_result:
                        return json_result
                    
                    return {"result": content, "source": "direct"}
                else:
                    raise Exception("Invalid response format from LM Studio")
        
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            error_details["direct_call_error"] = str(e)
            
            # 문제점 분석 및 진단
            diagnosis = await diagnose_llm_failure(error_details, lm_studio_manager, distributed_executor, self.initialized)
            
            # 문제점 분석 결과를 예외로 발생
            raise Exception(f"LLM call failed. Diagnosis: {json.dumps(diagnosis, indent=2)}")
    
    
    
    async def _initialize_llm_backend(self):
        """LLM 백엔드 초기화"""
        try:
            logger.info("Initializing LLM backend...")
            
            # Distributed Executor가 이미 초기화되었는지 확인
            if not hasattr(distributed_executor, 'initialized') or not distributed_executor.initialized:
                await distributed_executor.initialize(auto_discover=False)
            
            # localhost 확인
            if "localhost:1234" not in lm_studio_manager.instances:
                await lm_studio_manager.add_instance("localhost", 1234)
            
            self.initialized = True
            logger.info("LLM backend initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize LLM backend: {e}")
            self.initialized = False
    
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
    
    async def _analyze_objective(self, objective: str, analysis_type: str) -> Dict[str, Any]:
        """Objective를 분석하여 필요한 에이전트와 작업 순서 결정"""
        
        # ONE AI 개선 워크플로우인 경우 구조화된 objective 파싱
        if analysis_type == "oneai_improvement":
            return self._analyze_structured_objective(objective)
        
        # 시스템 문서에서 objective 처리 가이드 가져오기
        objective_guide = system_doc_parser.get_objective_processing_guide()
        workflow_context = system_doc_parser.get_workflow_context(analysis_type)
        
        analysis_prompt = {
            "objective": objective,
            "analysis_type": analysis_type,
            "system_knowledge": f"""
{objective_guide}

WORKFLOW CONTEXT:
{workflow_context}

INSTRUCTIONS:
1. Analyze the user's objective
2. Break it down into subtasks
3. Identify required agents for each subtask
4. Determine the optimal execution order
5. Consider dependencies between tasks

OUTPUT FORMAT:
{{
    "intent": "primary intent of the objective",
    "entities": {{extracted entities}},
    "required_agents": [list of agent types needed],
    "execution_plan": [
        {{
            "phase": "phase name",
            "agent": "agent type",
            "description": "what this phase does",
            "dependencies": [previous phases]
        }}
    ],
    "estimated_complexity": "low|medium|high"
}}
"""
        }
        
        try:
            # Coordinator 에이전트를 사용하여 objective 분석
            result = await self._execute_agent(
                EnhancedAgentType.COORDINATOR,
                analysis_prompt
            )
            
            # 결과 파싱
            if isinstance(result, dict):
                return result
            else:
                # 텍스트 결과를 파싱 시도
                parsed = extract_json_from_text(str(result))
                return parsed if parsed else {"error": "Failed to parse objective analysis"}
                
        except Exception as e:
            logger.error(f"Objective analysis failed: {e}")
            # 폴백: 기본 분석
            return {
                "intent": "analyze",
                "required_agents": self._get_default_agents(analysis_type),
                "execution_plan": self._get_default_plan(analysis_type)
            }
    
    def _analyze_structured_objective(self, objective: str) -> Dict[str, Any]:
        """구조화된 ONE AI 개선 objective 분석"""
        
        # 구조화된 objective 파싱
        lines = objective.strip().split('\n')
        parsed = {}
        current_key = None
        current_values = []
        
        for line in lines:
            if ':' in line and not line.startswith('-'):
                if current_key and current_values:
                    parsed[current_key] = current_values if len(current_values) > 1 else current_values[0]
                current_key = line.split(':', 1)[0].strip()
                value = line.split(':', 1)[1].strip()
                current_values = [value] if value else []
            elif line.startswith('-'):
                current_values.append(line[1:].strip())
        
        if current_key and current_values:
            parsed[current_key] = current_values if len(current_values) > 1 else current_values[0]
        
        # 작업 타입에 따른 에이전트 매핑
        task_agent_mapping = {
            "node": ["code_analyzer", "code_generator", "code_integrator", "test_designer"],
            "ui_component": ["code_analyzer", "ui_designer", "code_generator", "code_reviewer"],
            "api": ["code_analyzer", "api_designer", "code_generator", "doc_writer"],
            "optimize_rendering": ["performance_analyzer", "code_optimizer", "test_designer"],
            "reduce_memory": ["memory_analyzer", "code_optimizer", "test_designer"],
            "speed_up": ["performance_analyzer", "code_optimizer", "benchmark_designer"],
            "new_panel": ["ui_designer", "code_generator", "code_integrator"],
            "improve_ux": ["ux_analyst", "ui_designer", "code_generator"],
            "add_visualization": ["data_analyst", "visualization_designer", "code_generator"]
        }
        
        improvement_type = parsed.get("IMPROVEMENT_TYPE", "")
        task = parsed.get("TASK", "")
        details = parsed.get("DETAILS", {})
        expected_outcome = parsed.get("EXPECTED_OUTCOME", "")
        success_criteria = parsed.get("SUCCESS_CRITERIA", [])
        info_gathering = parsed.get("INFO_GATHERING", [])
        
        # 필요한 에이전트 결정
        required_agents = task_agent_mapping.get(task, ["analyst", "code_generator", "reviewer"])
        
        # 정보 수집 전략에 따라 추가 에이전트
        if "technical_docs" in info_gathering or "best_practices" in info_gathering:
            required_agents.insert(0, "web_searcher")
        if "internal_analysis" in info_gathering:
            required_agents.insert(0, "code_analyzer")
        if "llm_consultation" in info_gathering:
            required_agents.append("llm_aggregator")
        
        # 실행 계획 생성
        execution_plan = []
        phase_num = 1
        
        # 1. 정보 수집 단계
        if any(strategy in info_gathering for strategy in ["technical_docs", "code_examples", "best_practices"]):
            execution_plan.append({
                "phase": f"phase_{phase_num}_gather_info",
                "agent": "web_searcher",
                "description": "Gather technical information and examples",
                "dependencies": []
            })
            phase_num += 1
        
        # 2. 현재 시스템 분석 단계
        if improvement_type in ["add_feature", "improve_performance", "enhance_ui"]:
            execution_plan.append({
                "phase": f"phase_{phase_num}_analyze_current",
                "agent": "code_analyzer",
                "description": "Analyze current ONE AI implementation",
                "dependencies": [f"phase_{phase_num-1}_gather_info"] if phase_num > 1 else []
            })
            phase_num += 1
        
        # 3. 설계 단계
        if task in ["node", "ui_component", "api", "new_panel", "add_visualization"]:
            agent = "architect" if task in ["node", "api"] else "ui_designer"
            execution_plan.append({
                "phase": f"phase_{phase_num}_design",
                "agent": agent,
                "description": f"Design {task} architecture",
                "dependencies": [p["phase"] for p in execution_plan]
            })
            phase_num += 1
        
        # 4. 구현 단계
        execution_plan.append({
            "phase": f"phase_{phase_num}_implement",
            "agent": "code_generator",
            "description": f"Generate code for {task}",
            "dependencies": [p["phase"] for p in execution_plan]
        })
        phase_num += 1
        
        # 5. 검토 및 통합 단계
        execution_plan.append({
            "phase": f"phase_{phase_num}_review",
            "agent": "code_reviewer",
            "description": "Review generated code",
            "dependencies": [f"phase_{phase_num-1}_implement"]
        })
        phase_num += 1
        
        # 6. 테스트 단계
        if "test_designer" in required_agents:
            execution_plan.append({
                "phase": f"phase_{phase_num}_test",
                "agent": "test_designer",
                "description": "Create tests for implementation",
                "dependencies": [f"phase_{phase_num-1}_review"]
            })
            phase_num += 1
        
        # 7. 문서화 단계
        execution_plan.append({
            "phase": f"phase_{phase_num}_document",
            "agent": "doc_writer",
            "description": "Generate documentation",
            "dependencies": [p["phase"] for p in execution_plan[-2:]]
        })
        
        return {
            "intent": f"{improvement_type}_{task}",
            "entities": {
                "improvement_type": improvement_type,
                "task": task,
                "details": details,
                "expected_outcome": expected_outcome,
                "success_criteria": success_criteria,
                "info_gathering": info_gathering
            },
            "required_agents": list(set(required_agents)),  # 중복 제거
            "execution_plan": execution_plan,
            "estimated_complexity": "high" if len(execution_plan) > 5 else "medium"
        }
    
    def _get_default_agents(self, analysis_type: str) -> List[str]:
        """기본 에이전트 목록 반환"""
        if analysis_type == "code":
            return ["code_analyzer", "code_generator", "code_reviewer"]
        elif analysis_type == "data_analysis":
            return ["data_analyst", "trend_predictor", "report_writer"]
        else:
            return ["analyst", "strategist", "report_writer"]
            
    def _get_default_plan(self, analysis_type: str) -> List[Dict[str, Any]]:
        """기본 실행 계획 반환"""
        if analysis_type == "code":
            return [
                {"phase": "analyze", "agent": "code_analyzer", "dependencies": []},
                {"phase": "generate", "agent": "code_generator", "dependencies": ["analyze"]},
                {"phase": "review", "agent": "code_reviewer", "dependencies": ["generate"]}
            ]
        else:
            return [
                {"phase": "analyze", "agent": "data_analyst", "dependencies": []},
                {"phase": "predict", "agent": "trend_predictor", "dependencies": ["analyze"]},
                {"phase": "report", "agent": "report_writer", "dependencies": ["predict"]}
            ]
    
    # ===== 공개 메서드 =====
    
    async def create_workflow(self, request: AnalysisRequest) -> str:
        """워크플로우 생성"""
        
        workflow_id = f"wf_{datetime.now().timestamp()}"
        
        # Objective 분석을 위해 Coordinator 에이전트 사용
        objective_analysis = await self._analyze_objective(request.objective, request.analysis_type)
        logger.info(f"Objective analysis result: {objective_analysis}")
        
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
                target_domains=[],
                # Objective 분석 결과 저장
                objective_analysis=objective_analysis,
                required_agents=objective_analysis.get("required_agents", []),
                execution_plan=objective_analysis.get("execution_plan", [])
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

@router.get("/health")
async def health_check():
    """데이터 분석 모듈 상태 확인"""
    return {
        "status": "healthy",
        "module": "data_analysis",
        "initialized": enhanced_agent_system.initialized,
        "active_workflows": len(enhanced_agent_system.active_workflows),
        "agents": len(enhanced_agent_system.agents)
    }

@router.get("/test")
async def test_endpoint():
    """테스트 엔드포인트"""
    return {"message": "Data analysis module is working", "timestamp": datetime.now().isoformat()}

@router.post("/test-create")
async def test_create_endpoint(data: Dict[str, Any]):
    """테스트 생성 엔드포인트"""
    return {
        "message": "POST endpoint is working",
        "received_data": data,
        "timestamp": datetime.now().isoformat()
    }

@router.post("/project/analyze")
async def analyze_project_for_workflow():
    """프로젝트를 분석하여 사용 가능한 데이터 소스와 제약사항 추출"""
    
    try:
        # 프로젝트 구조 분석
        project_info = {
            "data_sources": [],
            "suggested_constraints": [],
            "detected_patterns": [],
            "recommended_objectives": []
        }
        
        # 1. 파일 시스템에서 데이터 소스 탐색
        import os
        import glob
        
        # 데이터 파일 찾기
        data_extensions = ['*.csv', '*.json', '*.xlsx', '*.parquet', '*.db', '*.sqlite']
        data_dirs = ['data', 'datasets', 'database', 'db']
        
        # 프로젝트 루트에서 데이터 파일 검색
        found_files = []
        for ext in data_extensions:
            found_files.extend(glob.glob(f"**/{ext}", recursive=True))
        
        # 데이터 디렉토리 검색
        for dir_name in data_dirs:
            if os.path.exists(dir_name):
                project_info["data_sources"].append(f"{dir_name}/ directory")
                for ext in data_extensions:
                    found_files.extend(glob.glob(f"{dir_name}/**/{ext}", recursive=True))
        
        # 중복 제거 및 경로 정리
        unique_files = list(set(found_files))
        project_info["data_sources"].extend(unique_files[:10])  # 상위 10개만
        
        # 2. 데이터베이스 연결 정보 검색
        config_files = glob.glob("**/*config*.{json,yaml,yml,ini}", recursive=True)
        if config_files:
            project_info["data_sources"].append("Configuration files detected")
        
        # 3. API 엔드포인트 검색
        if os.path.exists("backend/routers"):
            project_info["data_sources"].append("Backend API endpoints")
        
        # 4. 프로젝트 타입에 따른 제약사항 제안
        if any("test" in f for f in found_files):
            project_info["suggested_constraints"].append("Include unit tests")
            
        if any("docker" in f.lower() for f in found_files):
            project_info["suggested_constraints"].append("Docker compatible")
            
        # 5. 공통 제약사항 추가
        project_info["suggested_constraints"].extend([
            "Complete within 1 hour",
            "Production ready code",
            "Include error handling",
            "Add comprehensive logging"
        ])
        
        # 6. 프로젝트 패턴 감지
        if os.path.exists("backend") and os.path.exists("frontend"):
            project_info["detected_patterns"].append("Full-stack application")
            project_info["recommended_objectives"].extend([
                "Analyze API performance",
                "Optimize database queries",
                "Improve frontend loading time"
            ])
            
        if any("ml" in f or "model" in f for f in found_files):
            project_info["detected_patterns"].append("Machine Learning project")
            project_info["recommended_objectives"].extend([
                "Analyze model performance",
                "Optimize training pipeline",
                "Generate performance reports"
            ])
        
        # 7. Argosa 특정 데이터 소스
        argosa_data_path = "backend/data/argosa"
        if os.path.exists(argosa_data_path):
            argosa_files = os.listdir(argosa_data_path)
            for file in argosa_files:
                if file.endswith('.json'):
                    project_info["data_sources"].append(f"argosa/{file}")
        
        # 데이터 소스가 없으면 기본값 추가
        if not project_info["data_sources"]:
            project_info["data_sources"] = [
                "No data files found",
                "Manual data input required"
            ]
            
        return {
            "status": "success",
            "project_info": project_info,
            "message": "Project analyzed successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to analyze project: {e}")
        return {
            "status": "error",
            "project_info": {
                "data_sources": ["Error scanning project"],
                "suggested_constraints": ["Complete within 1 hour"],
                "detected_patterns": [],
                "recommended_objectives": ["Analyze available data"]
            },
            "message": str(e)
        }

@router.post("/workflow/create")
async def create_workflow(request: Dict[str, Any]):
    """워크플로우 생성"""
    
    logger.info(f"Creating workflow with request: {request}")
    
    try:
        # Convert dict to AnalysisRequest
        analysis_request = AnalysisRequest(**request)
        
        # Check if system is initialized
        if not enhanced_agent_system.initialized:
            logger.warning("System not initialized, initializing now...")
            await enhanced_agent_system._initialize_llm_backend()
            enhanced_agent_system.initialized = True
        
        workflow_id = await enhanced_agent_system.create_workflow(analysis_request)
        
        return {
            "workflow_id": workflow_id,
            "status": "created",
            "message": "Workflow created successfully"
        }
    except Exception as e:
        logger.error(f"Failed to create workflow: {e}")
        import traceback
        traceback.print_exc()
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

@router.delete("/workflow/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """워크플로우 삭제"""
    
    if workflow_id in enhanced_agent_system.active_workflows:
        del enhanced_agent_system.active_workflows[workflow_id]
        logger.info(f"Deleted workflow: {workflow_id}")
        return {"status": "success", "message": f"Workflow {workflow_id} deleted"}
    else:
        raise HTTPException(status_code=404, detail="Workflow not found")

@router.delete("/workflows/all")
async def delete_all_workflows():
    """모든 워크플로우 삭제"""
    
    count = len(enhanced_agent_system.active_workflows)
    enhanced_agent_system.active_workflows.clear()
    logger.info(f"Deleted all {count} workflows")
    
    return {"status": "success", "message": f"Deleted {count} workflows"}

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
async def discover_lm_studios(data: Dict[str, Any]):
    """네트워크에서 LM Studio 인스턴스 검색"""
    
    subnet = data.get("subnet")  # 기존: subnet: Optional[str] = None
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
    localhost_added = False
    
    for inst in lm_studio_manager.instances.values():
        # localhost 중복 방지
        if inst.is_local or inst.host in ["localhost", "127.0.0.1"]:
            if not localhost_added:
                # localhost는 정규화해서 한 번만 추가
                instances.append({
                    "id": "localhost:1234",  # 항상 이 ID 사용
                    "host": "localhost",
                    "hostname": "localhost",
                    "port": 1234,
                    "status": inst.status,
                    "is_local": True,
                    "models": inst.available_models,
                    "current_model": inst.current_model,
                    "performance_score": inst.performance_score,
                    "capabilities": inst.capabilities,
                    "enabled": inst.enabled,
                    "is_registered": inst.is_registered,  # 이제 안전하게 접근 가능
                    "priority": inst.priority,
                    "tags": inst.tags,
                    "max_concurrent_tasks": inst.max_concurrent_tasks,
                    "notes": inst.notes
                })
                localhost_added = True
                logger.info(f"Added localhost instance: id=localhost:1234, registered={inst.is_registered}")
        else:
            # 일반 네트워크 인스턴스
            instances.append({
                "id": inst.id,
                "host": inst.host,
                "hostname": inst.hostname or inst.host,
                "port": inst.port,
                "status": inst.status,
                "is_local": inst.is_local,
                "models": inst.available_models,
                "current_model": inst.current_model,
                "performance_score": inst.performance_score,
                "capabilities": inst.capabilities,
                "enabled": inst.enabled,
                "is_registered": inst.is_registered,  # 이제 안전하게 접근 가능
                "priority": inst.priority,
                "tags": inst.tags,
                "max_concurrent_tasks": inst.max_concurrent_tasks,
                "notes": inst.notes
            })
    
    return {
        "instances": instances,
        "total": len(instances),
        "active": sum(1 for inst in lm_studio_manager.instances.values() if inst.status == "connected"),
        "registered": sum(1 for inst in instances if inst["is_registered"])
    }

@router.post("/lm-studio/add-instance")
async def add_lm_studio_instance(request: Dict[str, Any]):
    """LM Studio 인스턴스 수동 추가"""
    
    host = request.get("host", "localhost")
    port = request.get("port", 1234)
    
    # localhost의 경우 정규화
    if host in ["localhost", "127.0.0.1"] and port == 1234:
        # 이미 localhost가 있는지 확인
        for inst in lm_studio_manager.instances.values():
            if inst.is_local:
                logger.info(f"Localhost already exists: {inst.id}")
                return {
                    "id": "localhost:1234",
                    "status": inst.status,
                    "models": inst.available_models,
                    "is_local": True,
                    "is_registered": inst.is_registered  # 이제 안전하게 접근 가능
                }
    
    instance = await lm_studio_manager.add_instance(host, port)
    
    return {
        "id": instance.id if not instance.is_local else "localhost:1234",
        "status": instance.status,
        "models": instance.available_models,
        "is_local": instance.is_local,
        "is_registered": instance.is_registered  # 이제 안전하게 접근 가능
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
    
    logger.info(f"Testing connection for instance: {instance_id}")
    
    instance = lm_studio_manager.instances.get(instance_id)
    
    # localhost 처리
    if not instance:
        localhost_ids = ["localhost:1234", "127.0.0.1:1234", "localhost", "127.0.0.1"]
        
        if any(instance_id.startswith(lid) for lid in localhost_ids):
            # localhost 인스턴스 찾기
            for _, inst in lm_studio_manager.instances.items():
                if inst.is_local:
                    instance = inst
                    instance_id = inst.id
                    logger.info(f"Found localhost instance: {inst.id}")
                    break
    
    if not instance:
        logger.error(f"Instance not found: {instance_id}")
        logger.info(f"Available instances: {list(lm_studio_manager.instances.keys())}")
        raise HTTPException(status_code=404, detail=f"Instance not found: {instance_id}")
    
    connected = await lm_studio_manager.test_connection(instance)
    
    if connected:
        await lm_studio_manager.get_instance_info(instance)
    
    return {
        "instance_id": instance.id if not instance.is_local else "localhost:1234",
        "connected": connected,
        "status": instance.status,
        "models": instance.available_models if connected else []
    }

@router.put("/lm-studio/instance/{instance_id}/settings")
async def update_instance_settings(instance_id: str, settings: Dict[str, Any]):
    """인스턴스 설정 업데이트"""
    
    # localhost ID 정규화
    if instance_id in ["localhost", "127.0.0.1", "localhost:1234", "127.0.0.1:1234"]:
        instance_id = "localhost:1234"
    
    success = lm_studio_manager.update_instance_settings(instance_id, settings)
    
    if success:
        return {
            "status": "success",
            "instance_id": instance_id,
            "message": "Settings updated successfully"
        }
    else:
        raise HTTPException(status_code=404, detail=f"Instance not found: {instance_id}")
    
@router.delete("/lm-studio/instance/{instance_id}")
async def remove_instance(instance_id: str):
    """인스턴스 제거"""
    
    if instance_id in lm_studio_manager.instances:
        del lm_studio_manager.instances[instance_id]
        return {"status": "removed", "instance_id": instance_id}
    
    raise HTTPException(status_code=404, detail="Instance not found")

@router.get("/lm-studio/diagnose")
async def diagnose_lm_studio_connection():
    """LM Studio 연결 진단"""
    
    diagnosis = {
        "timestamp": datetime.now().isoformat(),
        "issues": [],
        "recommendations": [],
        "system_state": {},
        "health_check_results": {}
    }
    
    # 1. 시스템 상태 확인
    diagnosis["system_state"]["initialized"] = enhanced_agent_system.initialized
    
    # 2. LM Studio 인스턴스 상태
    instances_status = {}
    for instance_id, instance in lm_studio_manager.instances.items():
        # 연결 테스트
        connected = await lm_studio_manager.test_connection(instance)
        
        instances_status[instance_id] = {
            "status": instance.status,
            "is_local": instance.is_local,
            "models_count": len(instance.available_models),
            "models": instance.available_models[:3] if instance.available_models else [],  # 처음 3개만
            "connection_test": connected,
            "performance_score": instance.performance_score
        }
        
        if not connected:
            diagnosis["issues"].append(f"Instance {instance_id} is not reachable")
            if instance.is_local:
                diagnosis["recommendations"].append(f"Ensure LM Studio is running on {instance.host}:{instance.port}")
            else:
                diagnosis["recommendations"].append(f"Check network connectivity to {instance.host}:{instance.port}")
    
    diagnosis["system_state"]["lm_studio_instances"] = instances_status
    
    # 3. 분산 실행 상태
    dist_status = distributed_executor.get_cluster_status()
    diagnosis["system_state"]["distributed_execution"] = dist_status
    
    # 4. 헬스 체크 - localhost에서 간단한 테스트
    localhost_id = "localhost:1234"
    if localhost_id in lm_studio_manager.instances:
        try:
            test_result = await lm_studio_manager.call_llm(
                prompt="Say 'test successful' in 3 words",
                model=lm_studio_manager.instances[localhost_id].available_models[0] if lm_studio_manager.instances[localhost_id].available_models else "default",
                instance_id=localhost_id,
                temperature=0.1,
                max_tokens=10
            )
            diagnosis["health_check_results"]["localhost_test"] = "success"
            diagnosis["health_check_results"]["test_response"] = test_result.get("choices", [{}])[0].get("message", {}).get("content", "")[:50]
        except Exception as e:
            diagnosis["health_check_results"]["localhost_test"] = "failed"
            diagnosis["health_check_results"]["error"] = str(e)
            diagnosis["issues"].append(f"Health check failed: {str(e)}")
    
    # 5. 종합 판단
    if not instances_status:
        diagnosis["issues"].append("No LM Studio instances configured")
        diagnosis["recommendations"].append("Add at least one LM Studio instance using /lm-studio/add-instance")
    
    connected_count = sum(1 for inst in instances_status.values() if inst["connection_test"])
    if connected_count == 0:
        diagnosis["issues"].append("No LM Studio instances are connected")
        diagnosis["recommendations"].append("Start LM Studio and ensure it's configured to accept API requests")
    
    models_count = sum(inst["models_count"] for inst in instances_status.values())
    if models_count == 0:
        diagnosis["issues"].append("No models loaded in any LM Studio instance")
        diagnosis["recommendations"].append("Load at least one model in LM Studio")
    
    # 6. 전체 상태 판단
    if not diagnosis["issues"]:
        diagnosis["overall_status"] = "healthy"
        diagnosis["message"] = f"System is healthy with {connected_count} connected instances and {models_count} available models"
    else:
        diagnosis["overall_status"] = "unhealthy"
        diagnosis["message"] = f"System has {len(diagnosis['issues'])} issues that need attention"
    
    return diagnosis

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
# ===== 설정 관리 엔드포인트 =====
# 기존 라우터 파일의 끝부분에 이 코드를 추가하세요

@router.get("/api/argosa/analysis/settings")
async def get_settings():
    """현재 설정 조회"""
    try:
        from .analysis.configs import get_all_settings
        settings = get_all_settings()
        
        # LM Studio 인스턴스 정보 추가
        instances = []
        for inst in lm_studio_manager.instances.values():
            instances.append({
                "id": inst.id,
                "host": inst.host,
                "port": inst.port,
                "status": inst.status,
                "is_local": inst.is_local,
                "models": inst.available_models,
                "current_model": inst.current_model
            })
        
        settings["lm_studio_instances"] = instances
        
        return {
            "status": "success",
            "settings": settings
        }
    except Exception as e:
        logger.error(f"Failed to get settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/api/argosa/analysis/settings")
async def update_settings(settings: Dict[str, Any]):
    """설정 업데이트"""
    try:
        from .analysis.configs import update_all_settings
        
        # 설정 저장
        update_all_settings(settings)
        
        # AI 모델 설정이 변경되었으면 시스템에 적용
        if "ai_models" in settings:
            await enhanced_agent_system.configure_models(settings["ai_models"])
        
        return {
            "status": "success",
            "message": "Settings updated successfully"
        }
    except Exception as e:
        logger.error(f"Failed to update settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/argosa/analysis/settings/save-profile")
async def save_settings_profile(request: Dict[str, Any]):
    """설정 프로필 저장"""
    try:
        from .analysis.configs import get_all_settings, SETTINGS_FILE
        
        profile_name = request.get("name", "default")
        description = request.get("description", "")
        
        # 현재 설정 가져오기
        current_settings = get_all_settings()
        
        # 프로필 디렉토리 생성
        profiles_dir = SETTINGS_FILE.parent / "profiles"
        profiles_dir.mkdir(parents=True, exist_ok=True)
        
        # 프로필 파일 저장
        profile_file = profiles_dir / f"{profile_name}.json"
        profile_data = {
            "name": profile_name,
            "description": description,
            "created_at": datetime.now().isoformat(),
            "settings": current_settings
        }
        
        with open(profile_file, 'w', encoding='utf-8') as f:
            json.dump(profile_data, f, indent=2, ensure_ascii=False)
        
        return {
            "status": "success",
            "message": f"Profile '{profile_name}' saved successfully",
            "profile": profile_data
        }
    except Exception as e:
        logger.error(f"Failed to save profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/argosa/analysis/settings/profiles")
async def list_settings_profiles():
    """저장된 프로필 목록"""
    try:
        from .analysis.configs import SETTINGS_FILE
        
        profiles_dir = SETTINGS_FILE.parent / "profiles"
        profiles = []
        
        if profiles_dir.exists():
            for profile_file in profiles_dir.glob("*.json"):
                try:
                    with open(profile_file, 'r', encoding='utf-8') as f:
                        profile_data = json.load(f)
                        profiles.append({
                            "name": profile_data.get("name", profile_file.stem),
                            "description": profile_data.get("description", ""),
                            "created_at": profile_data.get("created_at", ""),
                            "filename": profile_file.name
                        })
                except Exception as e:
                    logger.error(f"Failed to read profile {profile_file}: {e}")
        
        return {
            "status": "success",
            "profiles": profiles
        }
    except Exception as e:
        logger.error(f"Failed to list profiles: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/argosa/analysis/settings/load-profile")
async def load_settings_profile(request: Dict[str, Any]):
    """프로필 로드"""
    try:
        from .analysis.configs import SETTINGS_FILE, update_all_settings
        
        profile_name = request.get("name", "default")
        
        # 프로필 파일 읽기
        profiles_dir = SETTINGS_FILE.parent / "profiles"
        profile_file = profiles_dir / f"{profile_name}.json"
        
        if not profile_file.exists():
            raise HTTPException(status_code=404, detail=f"Profile '{profile_name}' not found")
        
        with open(profile_file, 'r', encoding='utf-8') as f:
            profile_data = json.load(f)
        
        # 설정 적용
        settings = profile_data.get("settings", {})
        update_all_settings(settings)
        
        # AI 모델 설정 적용
        if "ai_models" in settings:
            await enhanced_agent_system.configure_models(settings["ai_models"])
        
        return {
            "status": "success",
            "message": f"Profile '{profile_name}' loaded successfully",
            "settings": settings
        }
    except Exception as e:
        logger.error(f"Failed to load profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/lm-studio/sync-model")
async def sync_model_to_instances(request: Dict[str, Any]):
    """선택된 모델을 모든 인스턴스에 동기화"""
    try:
        model = request.get("model")
        
        if not model:
            raise HTTPException(status_code=400, detail="Model not specified")
        
        # localhost 인스턴스 확인
        source_instance = None
        for inst in lm_studio_manager.instances.values():
            if inst.is_local and model in inst.available_models:
                source_instance = inst
                break
        
        if not source_instance:
            raise HTTPException(status_code=404, detail="Model not found in localhost")
        
        # 연결된 모든 인스턴스에 모델 동기화 요청
        results = {
            "success": [],
            "failed": []
        }
        
        for instance in lm_studio_manager.instances.values():
            if instance.status == "connected" and not instance.is_local:
                try:
                    # 실제 구현에서는 모델 파일 전송 로직 필요
                    # 여기서는 시뮬레이션
                    logger.info(f"Syncing {model} to {instance.id}")
                    results["success"].append(instance.id)
                except Exception as e:
                    logger.error(f"Failed to sync to {instance.id}: {e}")
                    results["failed"].append({
                        "instance_id": instance.id,
                        "error": str(e)
                    })
        
        return {
            "status": "completed",
            "model": model,
            "results": results
        }
    except Exception as e:
        logger.error(f"Model sync failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
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
@router.post("/lm-studio/instance/{instance_id}/register")
async def register_instance(instance_id: str, request: Dict[str, Any]):
    """인스턴스 등록/해제"""
    
    register = request.get("register", True)
    
    logger.info(f"Register instance request: {instance_id} -> {register}")
    
    # localhost ID 정규화
    if instance_id in ["localhost", "127.0.0.1", "localhost:1234", "127.0.0.1:1234"]:
        instance_id = "localhost:1234"
    
    # LM Studio Manager의 메서드 호출
    success = lm_studio_manager.set_instance_registered(instance_id, register)
    
    if success:
        return {
            "status": "success",
            "instance_id": instance_id,
            "registered": register
        }
    else:
        logger.error(f"Failed to register instance: {instance_id}")
        raise HTTPException(status_code=404, detail=f"Instance not found: {instance_id}")

# ===== 헬퍼 함수 =====

# 주기적인 정리 작업 스케줄링 (FastAPI startup event에서 실행)
async def schedule_cleanup():
    while True:
        await asyncio.sleep(SYSTEM_CONFIG["cache_ttl_seconds"])  # 1시간마다
        removed = await cleanup_old_workflows(enhanced_agent_system.active_workflows)
        if removed > 0:
            logger.info(f"Cleaned up {removed} old workflows")

# startup_event is now handled in initialize() function

# 초기화 및 종료 함수
async def initialize():
    """Initialize data analysis module"""
    logger.info("Data analysis module initializing...")
    
    try:
        # LLM backend 초기화
        await enhanced_agent_system._initialize_llm_backend()
        
        # 정리 작업 시작
        asyncio.create_task(schedule_cleanup())
        
        # 실시간 메트릭 전송 시작
        asyncio.create_task(send_realtime_metrics(enhanced_agent_system, SYSTEM_CONFIG))
        
        logger.info("Data analysis module initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize data analysis module: {e}")
        raise
    
async def shutdown():
    """Shutdown data analysis module"""
    logger.info("Data analysis module shutting down")
    # HTTP 클라이언트 정리
    if enhanced_agent_system.http_client:
        await enhanced_agent_system.http_client.aclose()

