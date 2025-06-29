# backend/routers/argosa/code/project_analyzer.py

"""
Advanced project analysis engine for deep code analysis
"""

import ast
import os
import asyncio
from pathlib import Path
import networkx as nx
from datetime import datetime
import hashlib
from typing import List, Dict, Any, Optional
import aiofiles
from .models import CodeEntity


class AdvancedProjectAnalyzer:
    """프로젝트 전체를 깊이 분석하는 고급 엔진"""
    
    def __init__(self):
        self.project_graph = nx.DiGraph()
        self.entity_map: Dict[str, CodeEntity] = {}
        self.pattern_library: Dict[str, Any] = {}
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