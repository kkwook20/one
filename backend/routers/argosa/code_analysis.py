# backend/routers/argosa/code_analysis.py - 완전 정리 및 통합 버전

from fastapi import APIRouter, HTTPException, BackgroundTasks, WebSocket, UploadFile
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Set, Tuple, AsyncGenerator
import ast
import os
import asyncio
from pathlib import Path
import networkx as nx
from datetime import datetime
import json
import aiofiles
import hashlib
from dataclasses import dataclass, asdict
import re
from collections import defaultdict
import traceback
import logging

# 기존 imports
from services.rag_service import rag_service, module_integration, Document, RAGQuery
from routers.argosa.data_analysis import enhanced_agent_system, EnhancedAgentType
from routers.argosa.data_collection import comprehensive_data_collector

router = APIRouter()
logger = logging.getLogger(__name__)

# ===== 고급 데이터 모델 =====

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
    decorators: List[str] = None
    type_hints: Dict[str, str] = None
    
    # 관계 정보
    calls: List[str] = None  # 이 엔티티가 호출하는 것들
    called_by: List[str] = None  # 이 엔티티를 호출하는 것들
    imports: List[str] = None
    imported_by: List[str] = None
    
    # 메트릭
    complexity: int = 0
    line_count: int = 0
    test_coverage: float = 0.0
    
    # 메타데이터
    last_modified: datetime = None
    author: str = None
    tags: List[str] = None

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

# ===== 프로젝트 분석 엔진 =====

class AdvancedProjectAnalyzer:
    """프로젝트 전체를 깊이 분석하는 고급 엔진"""
    
    def __init__(self):
        self.project_graph = nx.DiGraph()
        self.entity_map: Dict[str, CodeEntity] = {}
        self.pattern_library: Dict[str, ArchitecturePattern] = {}
        self.file_cache: Dict[str, Dict[str, Any]] = {}
        self.analysis_cache: Dict[str, Any] = {}
        
    async def deep_analyze_project(self, root_path: str = ".") -> Dict[str, Any]:
        """프로젝트 전체 심층 분석"""
        
        analysis_result = {
            "timestamp": datetime.now().isoformat(),
            "root_path": root_path,
            "statistics": {},
            "architecture": {},
            "quality_metrics": {},
            "patterns_detected": [],
            "improvement_opportunities": [],
            "dependency_analysis": {},
            "complexity_analysis": {},
            "test_coverage_analysis": {}
        }
        
        # 1. 파일 시스템 스캔
        print("[프로젝트 분석] 파일 시스템 스캔 시작...")
        await self._scan_file_system(root_path, analysis_result)
        
        # 2. 코드 엔티티 추출
        print("[프로젝트 분석] 코드 엔티티 추출 중...")
        await self._extract_code_entities(analysis_result)
        
        # 3. 의존성 그래프 구축
        print("[프로젝트 분석] 의존성 그래프 구축 중...")
        await self._build_dependency_graph(analysis_result)
        
        # 4. 아키텍처 패턴 분석
        print("[프로젝트 분석] 아키텍처 패턴 분석 중...")
        await self._analyze_architecture_patterns(analysis_result)
        
        # 5. 코드 품질 분석
        print("[프로젝트 분석] 코드 품질 분석 중...")
        await self._analyze_code_quality(analysis_result)
        
        # 6. 개선 기회 식별
        print("[프로젝트 분석] 개선 기회 식별 중...")
        await self._identify_improvement_opportunities(analysis_result)
        
        # 캐시에 저장
        self.analysis_cache["latest"] = analysis_result
        
        return analysis_result
    
    async def _scan_file_system(self, root_path: str, result: Dict[str, Any]):
        """파일 시스템 상세 스캔"""
        
        file_stats = {
            "total_files": 0,
            "python_files": 0,
            "test_files": 0,
            "config_files": 0,
            "total_lines": 0,
            "code_lines": 0,
            "comment_lines": 0,
            "blank_lines": 0
        }
        
        for root, dirs, files in os.walk(root_path):
            # .git, __pycache__ 등 제외
            dirs[:] = [d for d in dirs if not d.startswith('.') and d != '__pycache__']
            
            for file in files:
                file_path = os.path.join(root, file)
                file_stats["total_files"] += 1
                
                if file.endswith('.py'):
                    file_stats["python_files"] += 1
                    if 'test_' in file or '_test.py' in file:
                        file_stats["test_files"] += 1
                    
                    # 파일 내용 분석
                    try:
                        async with aiofiles.open(file_path, 'r', encoding='utf-8') as f:
                            content = await f.read()
                            lines = content.splitlines()
                            
                            file_stats["total_lines"] += len(lines)
                            
                            # 라인 유형 분석
                            for line in lines:
                                stripped = line.strip()
                                if not stripped:
                                    file_stats["blank_lines"] += 1
                                elif stripped.startswith('#'):
                                    file_stats["comment_lines"] += 1
                                else:
                                    file_stats["code_lines"] += 1
                            
                            # 파일 캐시에 저장
                            self.file_cache[file_path] = {
                                "content": content,
                                "lines": lines,
                                "hash": hashlib.md5(content.encode()).hexdigest(),
                                "last_modified": os.path.getmtime(file_path)
                            }
                    except Exception as e:
                        print(f"[프로젝트 분석] 파일 읽기 오류 {file_path}: {e}")
        
        result["statistics"]["files"] = file_stats
    
    async def _extract_code_entities(self, result: Dict[str, Any]):
        """모든 코드 엔티티 추출"""
        
        entity_stats = {
            "total_entities": 0,
            "functions": 0,
            "classes": 0,
            "methods": 0,
            "async_functions": 0
        }
        
        for file_path, file_data in self.file_cache.items():
            if not file_path.endswith('.py'):
                continue
            
            try:
                tree = ast.parse(file_data["content"])
                
                # AST를 순회하며 엔티티 추출
                for node in ast.walk(tree):
                    entity = None
                    
                    if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                        entity = await self._create_function_entity(node, file_path)
                        if isinstance(node, ast.AsyncFunctionDef):
                            entity_stats["async_functions"] += 1
                        else:
                            entity_stats["functions"] += 1
                    
                    elif isinstance(node, ast.ClassDef):
                        entity = await self._create_class_entity(node, file_path)
                        entity_stats["classes"] += 1
                        
                        # 클래스 내 메서드도 추출
                        for item in node.body:
                            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                                method_entity = await self._create_function_entity(item, file_path)
                                method_entity.parent_id = entity.id
                                self.entity_map[method_entity.id] = method_entity
                                entity_stats["methods"] += 1
                    
                    if entity:
                        self.entity_map[entity.id] = entity
                        self.project_graph.add_node(entity.id, entity=entity)
                        entity_stats["total_entities"] += 1
                
            except Exception as e:
                print(f"[프로젝트 분석] {file_path} 파싱 오류: {e}")
        
        result["statistics"]["entities"] = entity_stats
    
    async def _create_function_entity(self, node: ast.FunctionDef, file_path: str) -> CodeEntity:
        """함수 엔티티 생성"""
        
        entity = CodeEntity(
            id=f"{file_path}::{node.name}:{node.lineno}",
            entity_type="async_function" if isinstance(node, ast.AsyncFunctionDef) else "function",
            name=node.name,
            file_path=file_path,
            line_start=node.lineno,
            line_end=node.end_lineno or node.lineno,
            signature=self._get_function_signature(node),
            docstring=ast.get_docstring(node),
            decorators=[self._get_decorator_name(d) for d in node.decorator_list],
            complexity=self._calculate_complexity(node),
            line_count=node.end_lineno - node.lineno + 1 if node.end_lineno else 1
        )
        
        # 함수가 호출하는 것들 추출
        entity.calls = await self._extract_function_calls(node)
        
        # 타입 힌트 추출
        entity.type_hints = self._extract_type_hints(node)
        
        return entity
    
    async def _create_class_entity(self, node: ast.ClassDef, file_path: str) -> CodeEntity:
        """클래스 엔티티 생성"""
        
        entity = CodeEntity(
            id=f"{file_path}::{node.name}:{node.lineno}",
            entity_type="class",
            name=node.name,
            file_path=file_path,
            line_start=node.lineno,
            line_end=node.end_lineno or node.lineno,
            docstring=ast.get_docstring(node),
            decorators=[self._get_decorator_name(d) for d in node.decorator_list],
            line_count=node.end_lineno - node.lineno + 1 if node.end_lineno else 1
        )
        
        # 베이스 클래스들
        entity.tags = [self._get_base_name(base) for base in node.bases]
        
        return entity
    
    def _calculate_complexity(self, node: ast.AST) -> int:
        """순환 복잡도 계산"""
        complexity = 1
        
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.ExceptHandler)):
                complexity += 1
            elif isinstance(child, ast.BoolOp):
                complexity += len(child.values) - 1
        
        return complexity
    
    async def _extract_function_calls(self, node: ast.FunctionDef) -> List[str]:
        """함수 내에서 호출하는 다른 함수들 추출"""
        calls = []
        
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                if isinstance(child.func, ast.Name):
                    calls.append(child.func.id)
                elif isinstance(child.func, ast.Attribute):
                    calls.append(f"{self._get_call_name(child.func)}")
        
        return list(set(calls))
    
    def _extract_type_hints(self, node: ast.FunctionDef) -> Dict[str, str]:
        """함수의 타입 힌트 추출"""
        type_hints = {}
        
        # 인자 타입
        for arg in node.args.args:
            if arg.annotation:
                type_hints[arg.arg] = ast.unparse(arg.annotation)
        
        # 반환 타입
        if node.returns:
            type_hints["return"] = ast.unparse(node.returns)
        
        return type_hints
    
    def _get_function_signature(self, node: ast.FunctionDef) -> str:
        """함수 시그니처 생성"""
        args = []
        for arg in node.args.args:
            arg_str = arg.arg
            if arg.annotation:
                arg_str += f": {ast.unparse(arg.annotation)}"
            args.append(arg_str)
        
        signature = f"{node.name}({', '.join(args)})"
        if node.returns:
            signature += f" -> {ast.unparse(node.returns)}"
        
        return signature
    
    def _get_decorator_name(self, decorator: ast.AST) -> str:
        """데코레이터 이름 추출"""
        if isinstance(decorator, ast.Name):
            return decorator.id
        elif isinstance(decorator, ast.Attribute):
            return ast.unparse(decorator)
        elif isinstance(decorator, ast.Call):
            return ast.unparse(decorator.func)
        return str(decorator)
    
    def _get_base_name(self, base: ast.AST) -> str:
        """베이스 클래스 이름 추출"""
        if isinstance(base, ast.Name):
            return base.id
        elif isinstance(base, ast.Attribute):
            return ast.unparse(base)
        return str(base)
    
    def _get_call_name(self, node: ast.AST) -> str:
        """함수 호출 이름 추출"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self._get_call_name(node.value)}.{node.attr}"
        return str(node)
    
    async def _build_dependency_graph(self, result: Dict[str, Any]):
        """의존성 그래프 구축"""
        
        # 엔티티 간 관계 분석
        for entity_id, entity in self.entity_map.items():
            if entity.calls:
                for called_name in entity.calls:
                    # 호출되는 엔티티 찾기
                    called_entity = self._find_entity_by_name(called_name)
                    if called_entity:
                        self.project_graph.add_edge(entity_id, called_entity.id)
                        
                        # 양방향 관계 설정
                        if not called_entity.called_by:
                            called_entity.called_by = []
                        called_entity.called_by.append(entity_id)
        
        # 그래프 분석
        result["dependency_analysis"] = {
            "total_nodes": self.project_graph.number_of_nodes(),
            "total_edges": self.project_graph.number_of_edges(),
            "strongly_connected_components": list(nx.strongly_connected_components(self.project_graph)),
            "cycles": list(nx.simple_cycles(self.project_graph))[:10],  # 최대 10개만
            "most_dependent": self._get_most_dependent_entities(),
            "most_depended_upon": self._get_most_depended_upon_entities()
        }
    
    def _find_entity_by_name(self, name: str) -> Optional[CodeEntity]:
        """이름으로 엔티티 찾기"""
        for entity in self.entity_map.values():
            if entity.name == name:
                return entity
        return None
    
    def _get_most_dependent_entities(self, limit: int = 10) -> List[Dict[str, Any]]:
        """가장 많은 의존성을 가진 엔티티들"""
        dependencies = []
        for node in self.project_graph.nodes():
            out_degree = self.project_graph.out_degree(node)
            if out_degree > 0:
                entity = self.entity_map.get(node)
                if entity:
                    dependencies.append({
                        "entity": entity.name,
                        "file": entity.file_path,
                        "dependencies": out_degree
                    })
        
        return sorted(dependencies, key=lambda x: x["dependencies"], reverse=True)[:limit]
    
    def _get_most_depended_upon_entities(self, limit: int = 10) -> List[Dict[str, Any]]:
        """가장 많이 의존되는 엔티티들"""
        depended_upon = []
        for node in self.project_graph.nodes():
            in_degree = self.project_graph.in_degree(node)
            if in_degree > 0:
                entity = self.entity_map.get(node)
                if entity:
                    depended_upon.append({
                        "entity": entity.name,
                        "file": entity.file_path,
                        "depended_by": in_degree
                    })
        
        return sorted(depended_upon, key=lambda x: x["depended_by"], reverse=True)[:limit]
    
    async def _analyze_architecture_patterns(self, result: Dict[str, Any]):
        """아키텍처 패턴 분석"""
        
        patterns_found = []
        
        # MVC 패턴 검사
        if self._check_mvc_pattern():
            patterns_found.append("MVC")
        
        # Repository 패턴 검사
        if self._check_repository_pattern():
            patterns_found.append("Repository")
        
        # Factory 패턴 검사
        if self._check_factory_pattern():
            patterns_found.append("Factory")
        
        # Singleton 패턴 검사
        if self._check_singleton_pattern():
            patterns_found.append("Singleton")
        
        # Layered Architecture 검사
        if self._check_layered_architecture():
            patterns_found.append("Layered Architecture")
        
        result["patterns_detected"] = patterns_found
        result["architecture"]["patterns"] = patterns_found
        result["architecture"]["recommendations"] = self._get_architecture_recommendations(patterns_found)
    
    def _check_mvc_pattern(self) -> bool:
        """MVC 패턴 검사"""
        has_models = any("model" in e.file_path.lower() for e in self.entity_map.values())
        has_views = any("view" in e.file_path.lower() for e in self.entity_map.values())
        has_controllers = any("controller" in e.file_path.lower() or "router" in e.file_path.lower() 
                            for e in self.entity_map.values())
        return has_models and has_views and has_controllers
    
    def _check_repository_pattern(self) -> bool:
        """Repository 패턴 검사"""
        return any("repository" in e.name.lower() or "repo" in e.name.lower() 
                  for e in self.entity_map.values() if e.entity_type == "class")
    
    def _check_factory_pattern(self) -> bool:
        """Factory 패턴 검사"""
        return any("factory" in e.name.lower() 
                  for e in self.entity_map.values() if e.entity_type == "class")
    
    def _check_singleton_pattern(self) -> bool:
        """Singleton 패턴 검사"""
        for entity in self.entity_map.values():
            if entity.entity_type == "class":
                # __new__ 메서드와 _instance 속성 확인
                methods = [e for e in self.entity_map.values() 
                          if e.parent_id == entity.id and e.name == "__new__"]
                if methods:
                    return True
        return False
    
    def _check_layered_architecture(self) -> bool:
        """계층형 아키텍처 검사"""
        layers = ["presentation", "business", "data", "domain", "service", "repository"]
        found_layers = set()
        
        for entity in self.entity_map.values():
            path_lower = entity.file_path.lower()
            for layer in layers:
                if layer in path_lower:
                    found_layers.add(layer)
        
        return len(found_layers) >= 3
    
    def _get_architecture_recommendations(self, patterns: List[str]) -> List[str]:
        """아키텍처 개선 추천"""
        recommendations = []
        
        if "MVC" not in patterns:
            recommendations.append("Consider implementing MVC pattern for better separation of concerns")
        
        if "Repository" not in patterns:
            recommendations.append("Consider using Repository pattern for data access abstraction")
        
        if len(patterns) < 2:
            recommendations.append("Consider adopting more design patterns for better code organization")
        
        return recommendations
    
    async def _analyze_code_quality(self, result: Dict[str, Any]):
        """코드 품질 분석"""
        
        quality_metrics = {
            "average_complexity": 0,
            "high_complexity_functions": [],
            "documentation_coverage": 0,
            "test_coverage_estimate": 0,
            "code_duplication": [],
            "code_smells": []
        }
        
        # 복잡도 분석
        complexities = []
        for entity in self.entity_map.values():
            if entity.entity_type in ["function", "async_function", "method"]:
                complexities.append(entity.complexity)
                if entity.complexity > 10:
                    quality_metrics["high_complexity_functions"].append({
                        "name": entity.name,
                        "file": entity.file_path,
                        "complexity": entity.complexity
                    })
        
        if complexities:
            quality_metrics["average_complexity"] = sum(complexities) / len(complexities)
        
        # 문서화 범위
        documented = sum(1 for e in self.entity_map.values() if e.docstring)
        total = len(self.entity_map)
        quality_metrics["documentation_coverage"] = (documented / total * 100) if total > 0 else 0
        
        # 테스트 커버리지 추정
        test_files = result["statistics"]["files"]["test_files"]
        python_files = result["statistics"]["files"]["python_files"]
        quality_metrics["test_coverage_estimate"] = (test_files / python_files * 100) if python_files > 0 else 0
        
        # 코드 스멜 검사
        quality_metrics["code_smells"] = await self._detect_code_smells()
        
        result["quality_metrics"] = quality_metrics
    
    async def _detect_code_smells(self) -> List[Dict[str, Any]]:
        """코드 스멜 감지"""
        code_smells = []
        
        for entity in self.entity_map.values():
            # 긴 함수
            if entity.line_count > 50:
                code_smells.append({
                    "type": "long_function",
                    "entity": entity.name,
                    "file": entity.file_path,
                    "lines": entity.line_count
                })
            
            # 너무 많은 파라미터
            if entity.signature and entity.signature.count(',') > 5:
                code_smells.append({
                    "type": "too_many_parameters",
                    "entity": entity.name,
                    "file": entity.file_path,
                    "parameter_count": entity.signature.count(',') + 1
                })
        
        return code_smells
    
    async def _identify_improvement_opportunities(self, result: Dict[str, Any]):
        """개선 기회 식별"""
        
        opportunities = []
        
        # 높은 복잡도 함수들
        if result["quality_metrics"]["high_complexity_functions"]:
            opportunities.append({
                "type": "refactoring",
                "priority": "high",
                "description": "Refactor high complexity functions",
                "targets": result["quality_metrics"]["high_complexity_functions"]
            })
        
        # 낮은 문서화 범위
        if result["quality_metrics"]["documentation_coverage"] < 80:
            opportunities.append({
                "type": "documentation",
                "priority": "medium",
                "description": "Improve documentation coverage",
                "current_coverage": result["quality_metrics"]["documentation_coverage"]
            })
        
        # 순환 의존성
        if result["dependency_analysis"]["cycles"]:
            opportunities.append({
                "type": "architecture",
                "priority": "high",
                "description": "Remove circular dependencies",
                "cycles": result["dependency_analysis"]["cycles"]
            })
        
        result["improvement_opportunities"] = opportunities

# ===== 코드 생성 엔진 =====

class AdvancedCodeGenerationEngine:
    """고급 코드 생성 엔진"""
    
    def __init__(self):
        self.project_analyzer = AdvancedProjectAnalyzer()
        self.generation_plans: Dict[str, CodeGenerationPlan] = {}
        self.code_fragments: Dict[str, List[CodeFragment]] = defaultdict(list)
        self.ai_sessions: Dict[str, Dict[str, Any]] = {}
        
    async def create_generation_plan(self, request: Dict[str, Any]) -> CodeGenerationPlan:
        """코드 생성 계획 수립"""
        
        print("[코드 생성] 생성 계획 수립 중...")
        
        # 1. 프로젝트 분석
        project_analysis = await self.project_analyzer.deep_analyze_project()
        
        # 2. Data Analysis의 Architect 에이전트와 협업
        architecture_request = {
            "objective": request["objective"],
            "project_analysis": {
                "total_files": project_analysis["statistics"]["files"]["python_files"],
                "total_entities": project_analysis["statistics"]["entities"]["total_entities"],
                "patterns": project_analysis["patterns_detected"],
                "current_architecture": project_analysis["architecture"]
            },
            "constraints": request.get("constraints", []),
            "scale": request.get("scale", "medium")
        }
        
        # Architect AI에게 전체 구조 설계 요청
        architecture_design = await self._consult_architect_ai(architecture_request)
        
        # 3. 생성 계획 수립
        plan = CodeGenerationPlan(
            objective=request["objective"],
            scope=request.get("scope", "module"),
            architecture_decisions=architecture_design
        )
        
        # 4. 단계별 계획 생성
        phases = await self._create_implementation_phases(
            architecture_design,
            project_analysis,
            request
        )
        plan.phases = phases
        
        # 5. 파일 구조 계획
        file_structure = await self._plan_file_structure(
            architecture_design,
            project_analysis
        )
        plan.file_structure = file_structure
        
        # 6. 품질 목표 설정
        plan.quality_targets = {
            "test_coverage": request.get("test_coverage", 90),
            "max_complexity": request.get("max_complexity", 10),
            "documentation_coverage": 100,
            "performance_targets": request.get("performance_targets", {
                "response_time": 100,  # ms
                "memory_usage": 512  # MB
            })
        }
        
        # 7. 위험 분석
        risks = await self._analyze_risks(plan, project_analysis)
        plan.risks = risks
        
        # 계획 저장
        self.generation_plans[plan.plan_id] = plan
        
        return plan
    
    async def _consult_architect_ai(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Architect AI와 상담하여 구조 설계"""
        
        # enhanced_agent_system의 _execute_agent 호출
        response = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.ARCHITECT,
            {
                "requirements": request["objective"],
                "current_system": request["project_analysis"],
                "constraints": request.get("constraints", [])
            }
        )
        
        return response
    
    async def _create_implementation_phases(
        self,
        architecture: Dict[str, Any],
        project_analysis: Dict[str, Any],
        request: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """구현 단계 생성"""
        
        phases = []
        
        # 아키텍처 컴포넌트별로 단계 생성
        for component in architecture.get("components", []):
            phase = {
                "phase_id": f"phase_{len(phases) + 1}",
                "name": component["name"],
                "description": component["description"],
                "dependencies": component.get("dependencies", []),
                "tasks": []
            }
            
            # 각 단계의 세부 작업
            for task in component.get("tasks", []):
                detailed_task = {
                    "task_id": f"task_{len(phase['tasks']) + 1}",
                    "type": task["type"],  # create, modify, refactor, test
                    "target": task["target"],  # 파일 또는 함수
                    "description": task["description"],
                    "estimated_lines": task.get("estimated_lines", 100),
                    "complexity": task.get("complexity", "medium")
                }
                phase["tasks"].append(detailed_task)
            
            phases.append(phase)
        
        return phases
    
    async def _plan_file_structure(
        self,
        architecture: Dict[str, Any],
        project_analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """파일 구조 계획"""
        
        file_structure = {
            "new_files": [],
            "modified_files": [],
            "directory_structure": {}
        }
        
        # 아키텍처에서 필요한 파일들 추출
        for component in architecture.get("components", []):
            for file_info in component.get("files", []):
                if file_info["action"] == "create":
                    file_structure["new_files"].append({
                        "path": file_info["path"],
                        "purpose": file_info["purpose"],
                        "template": file_info.get("template", "")
                    })
                elif file_info["action"] == "modify":
                    file_structure["modified_files"].append({
                        "path": file_info["path"],
                        "changes": file_info["changes"]
                    })
        
        return file_structure
    
    async def _analyze_risks(
        self,
        plan: CodeGenerationPlan,
        project_analysis: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """위험 분석"""
        
        risks = []
        
        # 복잡도 위험
        if project_analysis["quality_metrics"]["average_complexity"] > 7:
            risks.append({
                "type": "complexity",
                "severity": "medium",
                "description": "High existing code complexity may affect integration",
                "mitigation": "Refactor complex functions before integration"
            })
        
        # 의존성 위험
        if project_analysis["dependency_analysis"]["cycles"]:
            risks.append({
                "type": "dependency",
                "severity": "high",
                "description": "Circular dependencies detected",
                "mitigation": "Resolve circular dependencies before adding new code"
            })
        
        # 테스트 커버리지 위험
        if project_analysis["quality_metrics"]["test_coverage_estimate"] < 50:
            risks.append({
                "type": "testing",
                "severity": "medium",
                "description": "Low test coverage may lead to regression issues",
                "mitigation": "Add comprehensive tests for new and existing code"
            })
        
        return risks
    
    async def execute_generation_plan(self, plan_id: str) -> Dict[str, Any]:
        """생성 계획 실행"""
        
        if plan_id not in self.generation_plans:
            raise ValueError(f"Plan {plan_id} not found")
        
        plan = self.generation_plans[plan_id]
        execution_result = {
            "plan_id": plan_id,
            "status": "executing",
            "progress": {},
            "generated_code": {},
            "test_code": {},
            "documentation": {},
            "quality_report": {}
        }
        
        # 단계별 실행
        for phase in plan.phases:
            print(f"[코드 생성] {phase['name']} 단계 실행 중...")
            
            phase_result = await self._execute_phase(phase, plan)
            execution_result["progress"][phase["phase_id"]] = phase_result
            
            # 생성된 코드 수집
            for fragment in phase_result.get("fragments", []):
                if fragment.validation_status == "passed":
                    file_path = fragment.context.get("file_path", "unknown")
                    if file_path not in execution_result["generated_code"]:
                        execution_result["generated_code"][file_path] = []
                    execution_result["generated_code"][file_path].append(fragment.content)
        
        # 통합 및 최종 검증
        final_code = await self._integrate_and_validate(execution_result, plan)
        execution_result["final_code"] = final_code
        
        # 테스트 코드 생성
        test_code = await self._generate_test_code(final_code, plan)
        execution_result["test_code"] = test_code
        
        # 문서화 생성
        documentation = await self._generate_documentation(final_code, plan)
        execution_result["documentation"] = documentation
        
        # 품질 보고서 생성
        quality_report = await self._generate_quality_report(final_code, plan)
        execution_result["quality_report"] = quality_report
        
        execution_result["status"] = "completed"
        
        return execution_result
    
    async def _execute_phase(self, phase: Dict[str, Any], plan: CodeGenerationPlan) -> Dict[str, Any]:
        """개별 단계 실행"""
        
        phase_result = {
            "phase_id": phase["phase_id"],
            "status": "executing",
            "fragments": [],
            "issues": []
        }
        
        for task in phase["tasks"]:
            # 1. 작업별 컨텍스트 준비
            task_context = await self._prepare_task_context(task, plan)
            
            # 2. AI와 협업하여 코드 생성
            max_iterations = 3
            for iteration in range(max_iterations):
                # 2.1 구조 설계 (Architect AI)
                structure = await self._design_code_structure(task, task_context)
                
                # 2.2 상세 구현 (Implementer AI)
                implementation = await self._implement_code_details(structure, task_context)
                
                # 2.3 코드 리뷰 (Reviewer AI)
                review_result = await self._review_generated_code(implementation)
                
                if review_result["approved"]:
                    # 코드 조각 생성
                    fragment = CodeFragment(
                        fragment_type=task["type"],
                        content=implementation["code"],
                        context=task_context,
                        validation_status="passed",
                        validation_results=review_result,
                        created_by="implementer_ai",
                        iteration=iteration
                    )
                    phase_result["fragments"].append(fragment)
                    self.code_fragments[plan.plan_id].append(fragment)
                    break
                else:
                    # 리뷰 피드백 반영
                    task_context["review_feedback"] = review_result["feedback"]
                    
                    if iteration == max_iterations - 1:
                        phase_result["issues"].append({
                            "task_id": task["task_id"],
                            "issue": "Max iterations reached without approval",
                            "last_feedback": review_result["feedback"]
                        })
        
        phase_result["status"] = "completed"
        return phase_result
    
    async def _design_code_structure(self, task: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Architect AI와 협업하여 코드 구조 설계"""
        
        structure_design = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.ARCHITECT,
            {
                "requirements": f"Design structure for: {json.dumps(task, indent=2)}",
                "current_system": context,
                "constraints": ["Follow project patterns", "Ensure maintainability"]
            }
        )
        
        return structure_design
    
    async def _implement_code_details(self, structure: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Implementer AI와 협업하여 상세 코드 구현"""
        
        implementation = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.IMPLEMENTER,
            {
                "design": structure,
                "requirements": "Implement the detailed code based on the structure",
                "existing_code": context.get("related_code", {}),
                "integration_points": context.get("dependencies", {})
            }
        )
        
        return implementation
    
    async def _review_generated_code(self, implementation: Dict[str, Any]) -> Dict[str, Any]:
        """Reviewer AI와 협업하여 코드 리뷰"""
        
        review = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.CODE_REVIEWER,
            {
                "code": implementation.get('code', ''),
                "context": "Generated implementation code",
                "coding_standards": {},
                "requirements": {}
            }
        )
        
        return review
    
    async def _prepare_task_context(self, task: Dict[str, Any], plan: CodeGenerationPlan) -> Dict[str, Any]:
        """작업 컨텍스트 준비"""
        
        context = {
            "task": task,
            "plan_objective": plan.objective,
            "architecture_decisions": plan.architecture_decisions,
            "quality_targets": plan.quality_targets,
            "related_code": {},
            "dependencies": {},
            "coding_conventions": {}
        }
        
        # 관련 코드 찾기
        if task.get("target"):
            target_file = task["target"]
            if target_file in self.project_analyzer.file_cache:
                context["related_code"][target_file] = self.project_analyzer.file_cache[target_file]["content"]
            
            # 의존성 있는 파일들도 포함
            for entity_id, entity in self.project_analyzer.entity_map.items():
                if entity.file_path == target_file:
                    # 이 엔티티가 호출하는 것들
                    for called in entity.calls or []:
                        called_entity = self.project_analyzer._find_entity_by_name(called)
                        if called_entity:
                            context["dependencies"][called] = {
                                "file": called_entity.file_path,
                                "signature": called_entity.signature
                            }
        
        # 코딩 컨벤션 추출
        context["coding_conventions"] = await self._extract_coding_conventions()
        
        return context
    
    async def _extract_coding_conventions(self) -> Dict[str, Any]:
        """프로젝트의 코딩 컨벤션 추출"""
        
        conventions = {
            "naming": {
                "functions": "snake_case",
                "classes": "PascalCase",
                "constants": "UPPER_SNAKE_CASE"
            },
            "formatting": {
                "max_line_length": 120,
                "indent_size": 4,
                "use_spaces": True
            },
            "imports": {
                "order": ["standard", "third_party", "local"],
                "style": "absolute"
            },
            "docstrings": {
                "style": "google",
                "required_for": ["functions", "classes", "modules"]
            }
        }
        
        return conventions
    
    async def _integrate_and_validate(self, execution_result: Dict[str, Any], plan: CodeGenerationPlan) -> Dict[str, Any]:
        """생성된 코드 통합 및 검증"""
        
        integrated_code = {}
        
        for file_path, fragments in execution_result["generated_code"].items():
            # 조각들을 하나의 파일로 통합
            integrated_content = await self._integrate_fragments(fragments, file_path)
            
            # 통합된 코드 검증
            validation = await self._validate_integrated_code(integrated_content, file_path, plan)
            
            if validation["passed"]:
                integrated_code[file_path] = {
                    "content": integrated_content,
                    "validation": validation
                }
            else:
                # 문제가 있으면 수정 시도
                fixed_content = await self._fix_integration_issues(
                    integrated_content,
                    validation["issues"],
                    file_path
                )
                integrated_code[file_path] = {
                    "content": fixed_content,
                    "validation": validation,
                    "fixed": True
                }
        
        return integrated_code
    
    async def _integrate_fragments(self, fragments: List[str], file_path: str) -> str:
        """코드 조각들을 통합"""
        
        # 기존 파일이 있으면 로드
        existing_content = ""
        if file_path in self.project_analyzer.file_cache:
            existing_content = self.project_analyzer.file_cache[file_path]["content"]
        
        # 조각들을 지능적으로 통합
        integrated = existing_content
        
        for fragment in fragments:
            # AST를 사용해 적절한 위치에 삽입
            integrated = await self._smart_insert_code(integrated, fragment)
        
        return integrated
    
    async def _smart_insert_code(self, existing: str, new_code: str) -> str:
        """기존 코드에 새 코드를 지능적으로 삽입"""
        
        try:
            existing_tree = ast.parse(existing) if existing else None
            new_tree = ast.parse(new_code)
            
            # 새 코드의 유형 파악
            for node in new_tree.body:
                if isinstance(node, ast.FunctionDef):
                    # 함수는 적절한 위치에 삽입
                    if existing_tree:
                        # 클래스 내부인지 확인
                        class_found = False
                        for existing_node in existing_tree.body:
                            if isinstance(existing_node, ast.ClassDef):
                                # 메서드로 추가
                                existing_node.body.append(node)
                                class_found = True
                                break
                        
                        if not class_found:
                            # 모듈 레벨에 추가
                            existing_tree.body.append(node)
                    else:
                        return new_code
                
                elif isinstance(node, ast.ClassDef):
                    # 클래스는 모듈 레벨에 추가
                    if existing_tree:
                        existing_tree.body.append(node)
                    else:
                        return new_code
            
            # AST를 다시 코드로 변환
            return ast.unparse(existing_tree) if existing_tree else new_code
            
        except:
            # 파싱 실패시 단순 결합
            return f"{existing}\n\n{new_code}" if existing else new_code
    
    async def _validate_integrated_code(
        self,
        code: str,
        file_path: str,
        plan: CodeGenerationPlan
    ) -> Dict[str, Any]:
        """통합된 코드 검증"""
        
        validation_result = {
            "passed": True,
            "issues": [],
            "metrics": {}
        }
        
        # 1. 문법 검증
        syntax_check = await _validate_syntax(code)
        if not syntax_check["valid"]:
            validation_result["passed"] = False
            validation_result["issues"].append({
                "type": "syntax",
                "details": syntax_check
            })
        
        # 2. 스타일 검증
        style_check = await _validate_style(code, {})
        if not style_check["valid"]:
            validation_result["issues"].extend(style_check["issues"])
        
        # 3. 복잡도 검증
        complexity_check = await _validate_complexity(code)
        validation_result["metrics"]["complexity"] = complexity_check
        if not complexity_check["valid"]:
            validation_result["issues"].append({
                "type": "complexity",
                "details": complexity_check
            })
        
        # 4. 보안 검증
        security_check = await _validate_security(code)
        if not security_check["valid"]:
            validation_result["passed"] = False
            validation_result["issues"].extend(security_check["issues"])
        
        # 5. 성능 검증
        performance_check = await _validate_performance(code)
        if not performance_check["valid"]:
            validation_result["issues"].extend(performance_check["issues"])
        
        return validation_result
    
    async def _fix_integration_issues(
        self,
        code: str,
        issues: List[Dict[str, Any]],
        file_path: str
    ) -> str:
        """통합 문제 수정"""
        
        fixed_code = code
        
        for issue in issues:
            if issue["type"] == "syntax":
                # AI를 사용해 문법 오류 수정
                fix_result = await enhanced_agent_system._execute_agent(
                    EnhancedAgentType.IMPLEMENTER,
                    {
                        "design": {
                            "task": "fix_syntax_error",
                            "error": issue['details']['error'],
                            "line": issue['details'].get('line', 'unknown')
                        },
                        "requirements": "Fix the syntax error in the code",
                        "existing_code": {"code": code},
                        "integration_points": {}
                    }
                )
                if fix_result.get("code"):
                    fixed_code = fix_result["code"]
        
        return fixed_code
    
    async def _generate_test_code(self, final_code: Dict[str, Any], plan: CodeGenerationPlan) -> Dict[str, Any]:
        """테스트 코드 생성"""
        
        test_code = {}
        
        for file_path, code_info in final_code.items():
            # 테스트가 필요한 엔티티 추출
            entities_to_test = await self._extract_testable_entities(code_info["content"])
            
            # 각 엔티티에 대한 테스트 생성
            test_content = await self._generate_tests_for_entities(entities_to_test, code_info["content"])
            
            test_file_path = self._get_test_file_path(file_path)
            test_code[test_file_path] = test_content
        
        return test_code
    
    async def _extract_testable_entities(self, code: str) -> List[Dict[str, Any]]:
        """테스트 가능한 엔티티 추출"""
        
        testable_entities = []
        
        try:
            tree = ast.parse(code)
            
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if not node.name.startswith('_'):  # private 함수 제외
                        testable_entities.append({
                            "type": "function",
                            "name": node.name,
                            "async": isinstance(node, ast.AsyncFunctionDef),
                            "signature": self.project_analyzer._get_function_signature(node),
                            "docstring": ast.get_docstring(node)
                        })
                
                elif isinstance(node, ast.ClassDef):
                    testable_entities.append({
                        "type": "class",
                        "name": node.name,
                        "methods": [
                            method.name for method in node.body
                            if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef))
                            and not method.name.startswith('_')
                        ]
                    })
        except:
            pass
        
        return testable_entities
    
    async def _generate_tests_for_entities(self, entities: List[Dict[str, Any]], code: str) -> str:
        """엔티티들에 대한 테스트 생성"""
        
        test_result = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.TESTER,
            {
                "code": code,
                "requirements": {"entities": entities},
                "test_strategy": {
                    "coverage_target": 100,
                    "test_types": ["unit", "integration", "edge_cases"]
                }
            }
        )
        
        return test_result.get("code", "")
    
    def _get_test_file_path(self, file_path: str) -> str:
        """테스트 파일 경로 생성"""
        
        dir_path = os.path.dirname(file_path)
        file_name = os.path.basename(file_path)
        
        # tests 디렉토리 사용
        test_dir = os.path.join(dir_path, "tests")
        test_file = f"test_{file_name}"
        
        return os.path.join(test_dir, test_file)
    
    async def _generate_documentation(self, final_code: Dict[str, Any], plan: CodeGenerationPlan) -> Dict[str, Any]:
        """문서화 생성"""
        
        documentation = {
            "api_docs": {},
            "user_guide": "",
            "developer_guide": "",
            "architecture_docs": ""
        }
        
        # API 문서 생성
        for file_path, code_info in final_code.items():
            api_doc = await self._generate_api_documentation(code_info["content"], file_path)
            documentation["api_docs"][file_path] = api_doc
        
        # 사용자 가이드 생성
        documentation["user_guide"] = await self._generate_user_guide(plan, final_code)
        
        # 개발자 가이드 생성
        documentation["developer_guide"] = await self._generate_developer_guide(plan, final_code)
        
        # 아키텍처 문서 생성
        documentation["architecture_docs"] = await self._generate_architecture_docs(plan)
        
        return documentation
    
    async def _generate_api_documentation(self, code: str, file_path: str) -> str:
        """API 문서 생성"""
        
        doc_result = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.IMPLEMENTER,
            {
                "design": {"type": "documentation", "target": "api"},
                "requirements": f"Generate API documentation for {file_path}",
                "existing_code": {"code": code},
                "integration_points": {}
            }
        )
        
        return doc_result.get("documentation", doc_result.get("code", ""))
    
    async def _generate_user_guide(self, plan: CodeGenerationPlan, final_code: Dict[str, Any]) -> str:
        """사용자 가이드 생성"""
        
        guide_result = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.STRATEGIST,
            {
                "situation": {
                    "objective": plan.objective,
                    "components": list(final_code.keys())
                },
                "options": [],
                "constraints": [],
                "goals": ["Create comprehensive user guide"]
            }
        )
        
        return guide_result.get("guide", guide_result.get("recommendations", ""))
    
    async def _generate_developer_guide(self, plan: CodeGenerationPlan, final_code: Dict[str, Any]) -> str:
        """개발자 가이드 생성"""
        
        guide_result = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.ARCHITECT,
            {
                "requirements": "Create developer guide",
                "current_system": {
                    "architecture": plan.architecture_decisions,
                    "components": list(final_code.keys())
                },
                "constraints": []
            }
        )
        
        return guide_result.get("guide", json.dumps(guide_result, indent=2))
    
    async def _generate_architecture_docs(self, plan: CodeGenerationPlan) -> str:
        """아키텍처 문서 생성"""
        
        arch_result = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.ARCHITECT,
            {
                "requirements": "Generate architecture documentation",
                "current_system": {
                    "decisions": plan.architecture_decisions,
                    "file_structure": plan.file_structure
                },
                "constraints": []
            }
        )
        
        return arch_result.get("documentation", json.dumps(arch_result, indent=2))
    
    async def _generate_quality_report(self, final_code: Dict[str, Any], plan: CodeGenerationPlan) -> Dict[str, Any]:
        """품질 보고서 생성"""
        
        quality_report = {
            "summary": {},
            "metrics": {},
            "issues": [],
            "recommendations": []
        }
        
        # 각 파일에 대한 메트릭 수집
        for file_path, code_info in final_code.items():
            file_metrics = await self._analyze_file_quality(code_info["content"])
            quality_report["metrics"][file_path] = file_metrics
        
        # 전체 요약
        quality_report["summary"] = {
            "total_files": len(final_code),
            "total_lines": sum(m["lines"] for m in quality_report["metrics"].values()),
            "average_complexity": sum(m["complexity"] for m in quality_report["metrics"].values()) / len(final_code),
            "quality_score": await self._calculate_quality_score(quality_report["metrics"])
        }
        
        # 품질 목표 대비 평가
        quality_report["target_compliance"] = await self._evaluate_against_targets(
            quality_report["metrics"],
            plan.quality_targets
        )
        
        # 추천사항 생성
        quality_report["recommendations"] = await self._generate_quality_recommendations(
            quality_report,
            plan
        )
        
        return quality_report
    
    async def _analyze_file_quality(self, code: str) -> Dict[str, Any]:
        """파일 품질 분석"""
        
        metrics = {
            "lines": len(code.splitlines()),
            "complexity": 0,
            "maintainability_index": 0,
            "test_coverage": 0,
            "documentation_coverage": 0
        }
        
        # 복잡도 계산
        complexity_result = await _validate_complexity(code)
        metrics["complexity"] = complexity_result.get("max_complexity", 0)
        
        # 유지보수성 지수 계산 (간단한 버전)
        metrics["maintainability_index"] = max(0, 100 - metrics["complexity"] * 5)
        
        return metrics
    
    async def _calculate_quality_score(self, metrics: Dict[str, Dict[str, Any]]) -> float:
        """전체 품질 점수 계산"""
        
        scores = []
        
        for file_metrics in metrics.values():
            # 복잡도 점수 (낮을수록 좋음)
            complexity_score = max(0, 100 - file_metrics["complexity"] * 10)
            
            # 유지보수성 점수
            maintainability_score = file_metrics["maintainability_index"]
            
            # 평균 점수
            file_score = (complexity_score + maintainability_score) / 2
            scores.append(file_score)
        
        return sum(scores) / len(scores) if scores else 0
        """전체 품질 점수 계산"""
        
        scores = []
        
        for file_metrics in metrics.values():
            # 복잡도 점수 (낮을수록 좋음)
            complexity_score = max(0, 100 - file_metrics["complexity"] * 10)
            
            # 유지보수성 점수
            maintainability_score = file_metrics["maintainability_index"]
            
            # 평균 점수
            file_score = (complexity_score + maintainability_score) / 2
            scores.append(file_score)
        
        return sum(scores) / len(scores) if scores else 0
        """전체 품질 점수 계산"""
        
        scores = []
        
        for file_metrics in metrics.values():
            # 복잡도 점수 (낮을수록 좋음)
            complexity_score = max(0, 100 - file_metrics["complexity"] * 10)
            
            # 유지보수성 점수
            maintainability_score = file_metrics["maintainability_index"]
            
            # 평균 점수
            file_score = (complexity_score + maintainability_score) / 2
            scores.append(file_score)
        
        return sum(scores) / len(scores) if scores else 0
    
    async def _evaluate_against_targets(
        self,
        metrics: Dict[str, Dict[str, Any]],
        targets: Dict[str, Any]
    ) -> Dict[str, Any]:
        """품질 목표 대비 평가"""
        
        compliance = {
            "complexity": True,
            "documentation": True,
            "overall": True
        }
        
        # 복잡도 확인
        max_complexity = max(m["complexity"] for m in metrics.values())
        if max_complexity > targets["max_complexity"]:
            compliance["complexity"] = False
            compliance["overall"] = False
        
        # 문서화 확인
        avg_doc_coverage = sum(m["documentation_coverage"] for m in metrics.values()) / len(metrics)
        if avg_doc_coverage < targets["documentation_coverage"]:
            compliance["documentation"] = False
            compliance["overall"] = False
        
        return compliance
    
    async def _generate_quality_recommendations(
        self,
        quality_report: Dict[str, Any],
        plan: CodeGenerationPlan
    ) -> List[str]:
        """품질 개선 추천사항 생성"""
        
        recommendations = []
        
        # 복잡도 관련
        if quality_report["summary"]["average_complexity"] > 7:
            recommendations.append("Consider refactoring complex functions to improve maintainability")
        
        # 문서화 관련
        if not quality_report["target_compliance"]["documentation"]:
            recommendations.append("Improve documentation coverage to meet quality targets")
        
        # 테스트 관련
        recommendations.append("Add comprehensive unit tests to ensure code reliability")
        
        return recommendations

# ===== 실시간 협업 시스템 =====

class RealtimeCodeCollaborationSystem:
    """실시간 AI 협업 시스템"""
    
    def __init__(self):
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
        self.websocket_connections: Dict[str, WebSocket] = {}
        self.message_queue: asyncio.Queue = asyncio.Queue()
    
    def __init__(self):
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
        self.websocket_connections: Dict[str, WebSocket] = {}
        self.message_queue: asyncio.Queue = asyncio.Queue()
        
    async def create_collaboration_session(self, request: Dict[str, Any]) -> str:
        """협업 세션 생성"""
        
        session_id = f"collab_{datetime.now().timestamp()}"
        
        session = {
            "session_id": session_id,
            "participants": {
                "data_analysis": {"status": "connected"},
                "code_architect": {"status": "connected"},
                "code_implementer": {"status": "connected"},
                "code_reviewer": {"status": "connected"}
            },
            "objective": request["objective"],
            "current_task": None,
            "message_history": [],
            "code_versions": [],
            "decisions": []
        }
        
        self.active_sessions[session_id] = session
        
        return session_id
    
    async def handle_collaboration_message(self, session_id: str, message: Dict[str, Any]):
        """협업 메시지 처리"""
        
        if session_id not in self.active_sessions:
            return
        
        session = self.active_sessions[session_id]
        message["timestamp"] = datetime.now().isoformat()
        session["message_history"].append(message)
        
        # 메시지 유형별 처리
        if message["type"] == "code_structure_request":
            # Architect AI에게 전달
            response = await self._forward_to_architect(message)
            await self._broadcast_to_session(session_id, response)
            
        elif message["type"] == "implementation_request":
            # Implementer AI에게 전달
            response = await self._forward_to_implementer(message)
            await self._broadcast_to_session(session_id, response)
            
        elif message["type"] == "review_request":
            # Reviewer AI에게 전달
            response = await self._forward_to_reviewer(message)
            await self._broadcast_to_session(session_id, response)
            
        elif message["type"] == "decision_needed":
            # Data Analysis에게 전달
            response = await self._forward_to_data_analysis(message)
            session["decisions"].append(response)
            await self._broadcast_to_session(session_id, response)
    
    async def _forward_to_architect(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Architect AI에게 메시지 전달"""
        
        response = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.ARCHITECT,
            {
                "requirements": message.get("requirements", ""),
                "current_system": message.get("context", {}),
                "constraints": message.get("constraints", [])
            }
        )
        
        return {
            "type": "architecture_response",
            "from": "architect",
            "content": response,
            "timestamp": datetime.now().isoformat()
        }
    
    async def _forward_to_implementer(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Implementer AI에게 메시지 전달"""
        
        response = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.IMPLEMENTER,
            {
                "design": message.get("design", {}),
                "requirements": message.get("requirements", ""),
                "existing_code": message.get("context", {}),
                "integration_points": message.get("integration_points", {})
            }
        )
        
        return {
            "type": "implementation_response",
            "from": "implementer",
            "content": response,
            "timestamp": datetime.now().isoformat()
        }
    
    async def _forward_to_reviewer(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Reviewer AI에게 메시지 전달"""
        
        response = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.CODE_REVIEWER,
            {
                "code": message.get("code", ""),
                "context": message.get("context", ""),
                "coding_standards": message.get("standards", {}),
                "requirements": message.get("requirements", {})
            }
        )
        
        return {
            "type": "review_response",
            "from": "reviewer",
            "content": response,
            "timestamp": datetime.now().isoformat()
        }
    
    async def _forward_to_data_analysis(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Data Analysis에게 메시지 전달"""
        
        response = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.ANALYST,
            {
                "data": message.get("data", {}),
                "objective": message.get("objective", ""),
                "context": message.get("context", {})
            }
        )
        
        return {
            "type": "analysis_response",
            "from": "data_analysis",
            "content": response,
            "timestamp": datetime.now().isoformat()
        }
    
    async def _broadcast_to_session(self, session_id: str, message: Dict[str, Any]):
        """세션 참가자들에게 메시지 브로드캐스트"""
        
        for ws_id, ws in self.websocket_connections.items():
            if ws_id.startswith(session_id):
                try:
                    await ws.send_json(message)
                except Exception as e:
                    print(f"[협업] 웹소켓 전송 오류: {e}")

# ===== 전역 인스턴스 =====

advanced_analyzer = AdvancedProjectAnalyzer()
code_generator = AdvancedCodeGenerationEngine()
collaboration_system = RealtimeCodeCollaborationSystem()

# ===== API 엔드포인트 =====

@router.post("/analyze-project")
async def analyze_project(request: Dict[str, Any] = {"root_path": "."}):
    """프로젝트 전체 분석"""
    
    try:
        analysis = await advanced_analyzer.deep_analyze_project(request.get("root_path", "."))
        
        return {
            "status": "completed",
            "analysis": analysis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create-generation-plan")
async def create_generation_plan(request: Dict[str, Any]):
    """코드 생성 계획 수립"""
    
    try:
        plan = await code_generator.create_generation_plan(request)
        
        return {
            "plan_id": plan.plan_id,
            "plan": plan.dict()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/execute-generation/{plan_id}")
async def execute_generation(plan_id: str, background_tasks: BackgroundTasks):
    """코드 생성 실행"""
    
    try:
        # 백그라운드에서 실행
        background_tasks.add_task(
            code_generator.execute_generation_plan,
            plan_id
        )
        
        return {
            "plan_id": plan_id,
            "status": "executing",
            "message": "Code generation started"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.websocket("/ws/code-collaboration/{session_id}")
async def code_collaboration_websocket(websocket: WebSocket, session_id: str):
    """실시간 코드 협업 웹소켓"""
    
    await websocket.accept()
    ws_id = f"{session_id}_{datetime.now().timestamp()}"
    collaboration_system.websocket_connections[ws_id] = websocket
    
    try:
        while True:
            data = await websocket.receive_json()
            await collaboration_system.handle_collaboration_message(session_id, data)
            
    except Exception as e:
        print(f"[협업] 웹소켓 오류: {e}")
    finally:
        del collaboration_system.websocket_connections[ws_id]
        await websocket.close()

@router.post("/ai-models/configure")
async def configure_ai_models(config: Dict[str, Any]):
    """AI 모델 설정 (프론트엔드에서)"""
    
    try:
        code_generator.ai_models.update(config)
        
        return {
            "status": "configured",
            "models": list(code_generator.ai_models.keys())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/code-fragments/{plan_id}")
async def get_code_fragments(plan_id: str):
    """생성된 코드 조각들 조회"""
    
    try:
        fragments = code_generator.code_fragments.get(plan_id, [])
        
        return {
            "plan_id": plan_id,
            "fragments": [f.dict() for f in fragments],
            "total": len(fragments)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/validate-code")
async def validate_code(request: Dict[str, Any]):
    """코드 검증"""
    
    try:
        code = request["code"]
        context = request.get("context", {})
        
        # 다양한 검증 수행
        validation_result = {
            "syntax": await _validate_syntax(code),
            "style": await _validate_style(code, context),
            "complexity": await _validate_complexity(code),
            "security": await _validate_security(code),
            "performance": await _validate_performance(code)
        }
        
        return validation_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/generation-status/{plan_id}")
async def get_generation_status(plan_id: str):
    """코드 생성 상태 조회"""
    
    try:
        if plan_id not in code_generator.generation_plans:
            raise HTTPException(status_code=404, detail="Plan not found")
        
        plan = code_generator.generation_plans[plan_id]
        fragments = code_generator.code_fragments.get(plan_id, [])
        
        return {
            "plan_id": plan_id,
            "status": "in_progress" if len(fragments) < len(plan.phases) else "completed",
            "progress": {
                "total_phases": len(plan.phases),
                "completed_phases": len(set(f.context.get("phase_id") for f in fragments if f.context.get("phase_id"))),
                "total_fragments": len(fragments)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/collaboration-session")
async def create_collaboration_session(request: Dict[str, Any]):
    """협업 세션 생성"""
    
    try:
        session_id = await collaboration_system.create_collaboration_session(request)
        
        return {
            "session_id": session_id,
            "status": "created"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== 헬퍼 함수들 =====

async def _validate_syntax(code: str) -> Dict[str, Any]:
    """문법 검증"""
    try:
        ast.parse(code)
        return {"valid": True}
    except SyntaxError as e:
        return {
            "valid": False,
            "error": str(e),
            "line": e.lineno,
            "offset": e.offset
        }

async def _validate_style(code: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """스타일 검증"""
    
    # PEP8 및 프로젝트 스타일 가이드 검증
    issues = []
    lines = code.splitlines()
    
    for i, line in enumerate(lines):
        if len(line) > 120:  # 라인 길이
            issues.append({
                "line": i + 1,
                "issue": "Line too long",
                "severity": "warning"
            })
        
        # 탭 문자 검사
        if '\t' in line:
            issues.append({
                "line": i + 1,
                "issue": "Tab character found (use spaces)",
                "severity": "error"
            })
    
    return {
        "valid": len(issues) == 0,
        "issues": issues
    }

async def _validate_complexity(code: str) -> Dict[str, Any]:
    """복잡도 검증"""
    
    try:
        tree = ast.parse(code)
        complexities = []
        
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                complexity = advanced_analyzer._calculate_complexity(node)
                complexities.append({
                    "function": node.name,
                    "complexity": complexity,
                    "line": node.lineno
                })
        
        max_complexity = max((c["complexity"] for c in complexities), default=0)
        
        return {
            "valid": max_complexity <= 10,
            "max_complexity": max_complexity,
            "details": complexities
        }
    except:
        return {"valid": False, "error": "Failed to analyze complexity"}

async def _validate_security(code: str) -> Dict[str, Any]:
    """보안 검증"""
    
    security_issues = []
    
    # 간단한 보안 패턴 검사
    dangerous_patterns = [
        (r'eval\(', "Use of eval() is dangerous"),
        (r'exec\(', "Use of exec() is dangerous"),
        (r'__import__', "Dynamic imports can be dangerous"),
        (r'pickle\.loads', "Pickle can execute arbitrary code"),
        (r'subprocess.*shell=True', "Shell injection risk"),
        (r'os\.system', "Command injection risk"),
        (r'open\(.*["\']w', "File write without validation")
    ]
    
    for pattern, message in dangerous_patterns:
        if re.search(pattern, code):
            security_issues.append({
                "pattern": pattern,
                "message": message,
                "severity": "high"
            })
    
    return {
        "valid": len(security_issues) == 0,
        "issues": security_issues
    }

async def _validate_performance(code: str) -> Dict[str, Any]:
    """성능 검증"""
    
    performance_issues = []
    
    # 간단한 성능 패턴 검사
    performance_patterns = [
        (r'for.*in.*for.*in', "Nested loops detected"),
        (r'\.append\(.*\).*for', "Consider list comprehension"),
        (r'time\.sleep', "Blocking sleep detected"),
        (r'requests\.(get|post)', "Consider using async requests"),
        (r'^\s*global\s+', "Global variable usage")
    ]
    
    for pattern, message in performance_patterns:
        if re.search(pattern, code, re.MULTILINE):
            performance_issues.append({
                "pattern": pattern,
                "message": message,
                "severity": "medium"
            })
    
    return {
        "valid": len(performance_issues) == 0,
        "issues": performance_issues
    }

# 추가 유틸리티 함수들

async def generate_code_snippet(request: Dict[str, Any]) -> Dict[str, Any]:
    """간단한 코드 스니펫 생성"""
    
    result = await enhanced_agent_system._execute_agent(
        EnhancedAgentType.CODE_GENERATOR,
        {
            "specification": request.get('description', ''),
            "context": {
                "language": request.get('language', 'python'),
                "style": request.get('style', 'clean and readable')
            },
            "patterns": [],
            "constraints": ["Include error handling", "Add documentation"]
        }
    )
    
    return {
        "code": result.get("code", ""),
        "explanation": result.get("explanation", "")
    }

@router.post("/generate-snippet")
async def generate_snippet_endpoint(request: Dict[str, Any]):
    """코드 스니펫 생성 엔드포인트"""
    
    try:
        result = await generate_code_snippet(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))