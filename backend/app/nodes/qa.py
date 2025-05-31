# backend/app/nodes/qa.py

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import httpx
import re

from app.models.node import Node, NodeData
from app.storage.node_storage import node_storage
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class QANode:
    """QA Node - 품질 검증 및 테스트"""
    
    def __init__(self):
        self.test_types = [
            "syntax",      # 문법 검사
            "logic",       # 로직 검증
            "performance", # 성능 테스트
            "output",      # 출력 검증
            "integration"  # 통합 테스트
        ]
        
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """QA 검증 실행"""
        try:
            # 검증 대상 노드들
            target_nodes = data.get('targetNodes', [])
            test_types = data.get('testTypes', self.test_types)
            test_criteria = data.get('criteria', {})
            
            if not target_nodes:
                return {
                    "status": "success",
                    "message": "No nodes to test",
                    "results": []
                }
                
            # 각 노드에 대한 QA 수행
            test_results = []
            
            for target_node_id in target_nodes:
                node_result = await self.test_node(
                    target_node_id,
                    test_types,
                    test_criteria
                )
                test_results.append(node_result)
                
            # 전체 QA 리포트 생성
            qa_report = self.generate_qa_report(test_results)
            
            # 결과 저장
            await node_storage.save_data(node_id, 'qa_results', test_results)
            await node_storage.save_data(node_id, 'qa_report', qa_report)
            
            # 리포트 파일 생성
            report_content = self.format_report_as_markdown(qa_report)
            report_path = await node_storage.save_file(
                node_id,
                f"qa_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md",
                report_content.encode('utf-8')
            )
            
            return {
                "status": "success",
                "results": test_results,
                "report": qa_report,
                "report_path": report_path,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"QA node error: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            
    async def test_node(
        self,
        node_id: str,
        test_types: List[str],
        criteria: Dict[str, Any]
    ) -> Dict[str, Any]:
        """단일 노드 테스트"""
        # 노드 정보 로드
        code = await node_storage.get_code(node_id) or ""
        metadata = await node_storage.get_metadata(node_id) or {}
        output = await node_storage.get_data(node_id, 'output') or {}
        tasks = await node_storage.get_data(node_id, 'tasks') or []
        
        test_results = {
            "node_id": node_id,
            "tests": {},
            "overall_pass": True,
            "score": 100.0,
            "issues": [],
            "suggestions": []
        }
        
        # 각 테스트 타입별 검증
        for test_type in test_types:
            if test_type == "syntax":
                result = await self.test_syntax(code)
            elif test_type == "logic":
                result = await self.test_logic(code, tasks)
            elif test_type == "performance":
                result = await self.test_performance(metadata, criteria)
            elif test_type == "output":
                result = await self.test_output(output, criteria)
            elif test_type == "integration":
                result = await self.test_integration(node_id, code, output)
            else:
                continue
                
            test_results["tests"][test_type] = result
            
            # 전체 결과 업데이트
            if not result["pass"]:
                test_results["overall_pass"] = False
                test_results["issues"].extend(result.get("issues", []))
                
            test_results["score"] *= (result.get("score", 100) / 100)
            test_results["suggestions"].extend(result.get("suggestions", []))
            
        # 최종 점수 계산
        test_results["score"] = round(test_results["score"] * 100, 1)
        
        return test_results
        
    async def test_syntax(self, code: str) -> Dict[str, Any]:
        """문법 검사"""
        result = {
            "pass": True,
            "score": 100,
            "issues": [],
            "suggestions": [],
            "details": {}
        }
        
        if not code:
            result["pass"] = False
            result["score"] = 0
            result["issues"].append("No code found")
            return result
            
        # Python 문법 검사
        try:
            compile(code, '<string>', 'exec')
            result["details"]["syntax_valid"] = True
        except SyntaxError as e:
            result["pass"] = False
            result["score"] = 0
            result["issues"].append(f"Syntax error: {str(e)}")
            result["details"]["syntax_valid"] = False
            result["details"]["error_line"] = e.lineno
            return result
            
        # 코드 스타일 검사
        style_issues = []
        
        # 들여쓰기 일관성
        indent_sizes = set()
        for line in code.split('\n'):
            if line.strip() and line[0] == ' ':
                indent = len(line) - len(line.lstrip())
                indent_sizes.add(indent)
                
        if len(indent_sizes) > 2:
            style_issues.append("Inconsistent indentation")
            result["score"] -= 10
            
        # 함수/변수 네이밍
        if re.search(r'\b[A-Z]+_[A-Z]+\b', code):
            style_issues.append("Consider using snake_case for variables")
            result["score"] -= 5
            
        # 매직 넘버
        magic_numbers = re.findall(r'\b\d{3,}\b', code)
        if magic_numbers:
            style_issues.append("Consider using named constants instead of magic numbers")
            result["score"] -= 5
            
        if style_issues:
            result["suggestions"].extend(style_issues)
            
        result["details"]["style_score"] = result["score"]
        
        return result
        
    async def test_logic(self, code: str, tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """로직 검증"""
        result = {
            "pass": True,
            "score": 100,
            "issues": [],
            "suggestions": [],
            "details": {}
        }
        
        # 필수 헬퍼 함수 체크
        required_functions = ['log', 'save_output']
        missing_functions = []
        
        for func in required_functions:
            if f'{func}(' not in code:
                missing_functions.append(func)
                
        if missing_functions:
            result["score"] -= 20
            result["issues"].append(f"Missing helper functions: {', '.join(missing_functions)}")
            
        # 에러 핸들링 체크
        has_try_except = 'try:' in code and 'except' in code
        if not has_try_except:
            result["score"] -= 15
            result["suggestions"].append("Add try-except blocks for error handling")
            
        # 작업 항목 처리 로직 체크
        if tasks and 'update_task' not in code:
            result["score"] -= 10
            result["suggestions"].append("Consider updating task status in your code")
            
        # 출력 데이터 저장 체크
        if 'output_data' not in code:
            result["score"] -= 10
            result["issues"].append("No output data assignment found")
            
        result["details"]["logic_checks"] = {
            "has_helpers": len(missing_functions) == 0,
            "has_error_handling": has_try_except,
            "processes_tasks": 'update_task' in code,
            "saves_output": 'output_data' in code
        }
        
        if result["score"] < 70:
            result["pass"] = False
            
        return result
        
    async def test_performance(
        self, 
        metadata: Dict[str, Any],
        criteria: Dict[str, Any]
    ) -> Dict[str, Any]:
        """성능 테스트"""
        result = {
            "pass": True,
            "score": 100,
            "issues": [],
            "suggestions": [],
            "details": {}
        }
        
        # 평균 실행 시간 체크
        avg_time = metadata.get('average_execution_time', 0)
        max_time = criteria.get('max_execution_time', 60)  # 기본 60초
        
        if avg_time > max_time:
            result["pass"] = False
            result["score"] -= 30
            result["issues"].append(f"Average execution time ({avg_time:.1f}s) exceeds limit ({max_time}s)")
            result["suggestions"].append("Optimize code for better performance")
            
        elif avg_time > max_time * 0.8:
            result["score"] -= 10
            result["suggestions"].append("Consider performance optimization")
            
        # 메모리 사용량 체크 (실제로는 모니터링 필요)
        # 여기서는 시뮬레이션
        estimated_memory = metadata.get('estimated_memory_mb', 100)
        max_memory = criteria.get('max_memory_mb', 512)
        
        if estimated_memory > max_memory:
            result["score"] -= 20
            result["issues"].append(f"High memory usage: {estimated_memory}MB")
            
        result["details"]["performance_metrics"] = {
            "avg_execution_time": avg_time,
            "execution_count": metadata.get('execution_count', 0),
            "error_rate": metadata.get('error_count', 0) / max(metadata.get('execution_count', 1), 1)
        }
        
        return result
        
    async def test_output(
        self,
        output: Dict[str, Any],
        criteria: Dict[str, Any]
    ) -> Dict[str, Any]:
        """출력 검증"""
        result = {
            "pass": True,
            "score": 100,
            "issues": [],
            "suggestions": [],
            "details": {}
        }
        
        # 출력 존재 여부
        if not output:
            result["pass"] = False
            result["score"] = 0
            result["issues"].append("No output data found")
            return result
            
        # 필수 필드 체크
        required_fields = criteria.get('required_output_fields', [])
        missing_fields = []
        
        for field in required_fields:
            if field not in output:
                missing_fields.append(field)
                
        if missing_fields:
            result["score"] -= 20 * len(missing_fields)
            result["issues"].append(f"Missing required output fields: {', '.join(missing_fields)}")
            
        # 데이터 타입 검증
        expected_types = criteria.get('output_types', {})
        type_mismatches = []
        
        for field, expected_type in expected_types.items():
            if field in output:
                actual_type = type(output[field]).__name__
                if actual_type != expected_type:
                    type_mismatches.append(f"{field}: expected {expected_type}, got {actual_type}")
                    
        if type_mismatches:
            result["score"] -= 10 * len(type_mismatches)
            result["issues"].extend(type_mismatches)
            
        # 데이터 품질 체크
        if output:
            # 빈 값 체크
            empty_values = [k for k, v in output.items() if v in [None, "", [], {}]]
            if empty_values:
                result["score"] -= 5
                result["suggestions"].append(f"Some output fields are empty: {', '.join(empty_values)}")
                
        result["details"]["output_analysis"] = {
            "field_count": len(output),
            "missing_fields": missing_fields,
            "type_mismatches": len(type_mismatches)
        }
        
        if result["score"] < 60:
            result["pass"] = False
            
        return result
        
    async def test_integration(
        self,
        node_id: str,
        code: str,
        output: Dict[str, Any]
    ) -> Dict[str, Any]:
        """통합 테스트"""
        result = {
            "pass": True,
            "score": 100,
            "issues": [],
            "suggestions": [],
            "details": {}
        }
        
        # 글로벌 변수 사용 체크
        used_variables = self.extract_global_variables(code)
        result["details"]["uses_global_variables"] = len(used_variables) > 0
        
        if used_variables:
            # 변수 유효성 체크 (실제로는 variable_resolver 사용)
            result["details"]["global_variables"] = list(used_variables)
            
        # 파일 입출력 체크
        uses_file_io = any(keyword in code for keyword in ['save_file', 'open(', 'Path('])
        result["details"]["uses_file_io"] = uses_file_io
        
        # 외부 API 호출 체크
        uses_external_api = any(keyword in code for keyword in ['requests.', 'httpx.', 'urllib'])
        result["details"]["uses_external_api"] = uses_external_api
        
        if uses_external_api:
            result["suggestions"].append("Ensure external API calls have proper error handling and timeouts")
            
        # 의존성 체크
        imports = re.findall(r'^import\s+(\w+)|^from\s+(\w+)', code, re.MULTILINE)
        external_imports = [imp for imp_tuple in imports for imp in imp_tuple if imp and imp not in ['json', 'datetime', 'pathlib']]
        
        if external_imports:
            result["details"]["external_dependencies"] = external_imports
            result["suggestions"].append(f"External dependencies detected: {', '.join(external_imports)}")
            
        return result
        
    def extract_global_variables(self, code: str) -> set:
        """코드에서 글로벌 변수 추출"""
        # 간단한 패턴 매칭 (실제로는 variable_resolver 사용)
        pattern = r'([a-zA-Z0-9_]+\.[a-zA-Z_]+\.[a-zA-Z0-9_]+\.[a-zA-Z_]+)'
        matches = re.findall(pattern, code)
        return set(matches)
        
    def generate_qa_report(self, test_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """QA 리포트 생성"""
        total_nodes = len(test_results)
        passed_nodes = sum(1 for r in test_results if r['overall_pass'])
        
        # 전체 점수 계산
        total_score = sum(r['score'] for r in test_results) / total_nodes if total_nodes > 0 else 0
        
        # 테스트 타입별 통계
        test_type_stats = {}
        for result in test_results:
            for test_type, test_result in result['tests'].items():
                if test_type not in test_type_stats:
                    test_type_stats[test_type] = {
                        'total': 0,
                        'passed': 0,
                        'avg_score': 0
                    }
                    
                test_type_stats[test_type]['total'] += 1
                if test_result['pass']:
                    test_type_stats[test_type]['passed'] += 1
                test_type_stats[test_type]['avg_score'] += test_result['score']
                
        # 평균 점수 계산
        for stats in test_type_stats.values():
            if stats['total'] > 0:
                stats['avg_score'] /= stats['total']
                
        # 주요 이슈 집계
        all_issues = []
        for result in test_results:
            all_issues.extend([
                {"node_id": result['node_id'], "issue": issue}
                for issue in result['issues']
            ])
            
        return {
            "summary": {
                "total_nodes_tested": total_nodes,
                "passed_nodes": passed_nodes,
                "failed_nodes": total_nodes - passed_nodes,
                "pass_rate": (passed_nodes / total_nodes * 100) if total_nodes > 0 else 0,
                "average_score": round(total_score, 1)
            },
            "test_type_statistics": test_type_stats,
            "critical_issues": all_issues[:10],  # 상위 10개
            "generated_at": datetime.now().isoformat()
        }
        
    def format_report_as_markdown(self, report: Dict[str, Any]) -> str:
        """리포트를 마크다운으로 포맷"""
        md = f"""# QA Report

Generated at: {report['generated_at']}

## Summary

- **Total Nodes Tested**: {report['summary']['total_nodes_tested']}
- **Passed**: {report['summary']['passed_nodes']}
- **Failed**: {report['summary']['failed_nodes']}
- **Pass Rate**: {report['summary']['pass_rate']:.1f}%
- **Average Score**: {report['summary']['average_score']:.1f}/100

## Test Type Statistics

| Test Type | Total | Passed | Average Score |
|-----------|-------|--------|---------------|
"""
        
        for test_type, stats in report['test_type_statistics'].items():
            md += f"| {test_type.capitalize()} | {stats['total']} | {stats['passed']} | {stats['avg_score']:.1f} |\n"
            
        md += "\n## Critical Issues\n\n"
        
        for issue in report['critical_issues']:
            md += f"- **{issue['node_id']}**: {issue['issue']}\n"
            
        return md

# 모듈 레벨 인스턴스
qa_node = QANode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await qa_node.execute(node_id, data)