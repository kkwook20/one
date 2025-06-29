# backend/routers/argosa/code/validators.py

"""
Code validation functions for syntax, style, complexity, security, and performance
"""

import ast
import re
from typing import Dict, Any, List


async def validate_syntax(code: str) -> Dict[str, Any]:
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


async def validate_style(code: str, context: Dict[str, Any]) -> Dict[str, Any]:
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


async def validate_complexity(code: str) -> Dict[str, Any]:
    """복잡도 검증"""
    
    try:
        tree = ast.parse(code)
        complexities = []
        
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                complexity = _calculate_complexity(node)
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


async def validate_security(code: str) -> Dict[str, Any]:
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


async def validate_performance(code: str) -> Dict[str, Any]:
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


# Helper functions

def _calculate_complexity(node: ast.AST) -> int:
    """순환 복잡도 계산"""
    complexity = 1
    
    for child in ast.walk(node):
        if isinstance(child, (ast.If, ast.While, ast.For, ast.ExceptHandler)):
            complexity += 1
        elif isinstance(child, ast.BoolOp):
            complexity += len(child.values) - 1
    
    return complexity


async def validate_all(code: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
    """모든 검증 수행"""
    
    if context is None:
        context = {}
    
    validation_result = {
        "syntax": await validate_syntax(code),
        "style": await validate_style(code, context),
        "complexity": await validate_complexity(code),
        "security": await validate_security(code),
        "performance": await validate_performance(code)
    }
    
    # 전체 유효성 여부
    validation_result["overall_valid"] = all(
        v.get("valid", False) for v in validation_result.values()
    )
    
    # 전체 이슈 수집
    all_issues = []
    for validation_type, result in validation_result.items():
        if validation_type != "overall_valid" and "issues" in result:
            for issue in result["issues"]:
                issue["type"] = validation_type
                all_issues.append(issue)
    
    validation_result["all_issues"] = all_issues
    
    return validation_result