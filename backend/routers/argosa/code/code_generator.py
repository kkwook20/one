# backend/routers/argosa/code/code_generator.py

"""
Advanced code generation engine with AI collaboration
"""

import os
import ast
import json
from datetime import datetime
from typing import List, Dict, Any
from collections import defaultdict

from .models import CodeGenerationPlan, CodeFragment
from .project_analyzer import AdvancedProjectAnalyzer

# Import from parent module - will be provided by main code_analysis.py
from ..data_analysis import enhanced_agent_system, EnhancedAgentType


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
            from .validators import (
                validate_syntax, validate_style, validate_complexity,
                validate_security, validate_performance
            )
            
            validation = await self._validate_integrated_code(
                integrated_content, file_path, plan,
                validate_syntax, validate_style, validate_complexity,
                validate_security, validate_performance
            )
            
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
        plan: CodeGenerationPlan,
        validate_syntax,
        validate_style,
        validate_complexity,
        validate_security,
        validate_performance
    ) -> Dict[str, Any]:
        """통합된 코드 검증"""
        
        validation_result = {
            "passed": True,
            "issues": [],
            "metrics": {}
        }
        
        # 1. 문법 검증
        syntax_check = await validate_syntax(code)
        if not syntax_check["valid"]:
            validation_result["passed"] = False
            validation_result["issues"].append({
                "type": "syntax",
                "details": syntax_check
            })
        
        # 2. 스타일 검증
        style_check = await validate_style(code, {})
        if not style_check["valid"]:
            validation_result["issues"].extend(style_check["issues"])
        
        # 3. 복잡도 검증
        complexity_check = await validate_complexity(code)
        validation_result["metrics"]["complexity"] = complexity_check
        if not complexity_check["valid"]:
            validation_result["issues"].append({
                "type": "complexity",
                "details": complexity_check
            })
        
        # 4. 보안 검증
        security_check = await validate_security(code)
        if not security_check["valid"]:
            validation_result["passed"] = False
            validation_result["issues"].extend(security_check["issues"])
        
        # 5. 성능 검증
        performance_check = await validate_performance(code)
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
        
        from .validators import validate_complexity
        
        metrics = {
            "lines": len(code.splitlines()),
            "complexity": 0,
            "maintainability_index": 0,
            "test_coverage": 0,
            "documentation_coverage": 0
        }
        
        # 복잡도 계산
        complexity_result = await validate_complexity(code)
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