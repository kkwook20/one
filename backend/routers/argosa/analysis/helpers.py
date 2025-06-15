"""독립적인 헬퍼 함수들"""

import re
import json
import asyncio
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
import random
import logging

logger = logging.getLogger(__name__)

# 시간 관련 헬퍼
def format_timestamp(timestamp: str) -> str:
    """타임스탬프를 읽기 쉬운 형식으로 변환"""
    try:
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except:
        return timestamp

def format_duration(seconds: float) -> str:
    """초를 읽기 쉬운 시간 형식으로 변환"""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        return f"{seconds/60:.1f}m"
    else:
        return f"{seconds/3600:.1f}h"

def calculate_elapsed_time(start_time: str) -> float:
    """시작 시간부터 경과된 시간 계산 (초)"""
    try:
        start = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        return (datetime.now() - start).total_seconds()
    except:
        return 0.0

# 웹 검색 관련
def needs_web_search(text: str, patterns: Dict[str, List[str]]) -> Dict[str, bool]:
    """텍스트 분석하여 웹 검색 필요 여부 판단"""
    text_lower = text.lower()
    
    results = {}
    for pattern_type, keywords in patterns.items():
        results[pattern_type] = any(kw in text_lower for kw in keywords)
    
    # 추가 패턴 검사
    results["statistics"] = "통계" in text or "statistics" in text_lower
    results["specific_company"] = bool(
        re.search(r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc|Corp|Ltd|Company)', text)
    )
    
    return results

# 워크플로우 관련
def calculate_workflow_progress(phase: str, workflow_type: str, phases_config: dict) -> int:
    """현재 단계에 따른 워크플로우 진행률 계산"""
    phases = phases_config.get(workflow_type, [])
    phase_info = next((p for p in phases if p["id"] == phase), None)
    return phase_info["progress"] if phase_info else 0

def get_next_phase(current_phase: str, workflow_type: str, phases_config: dict) -> Optional[str]:
    """다음 워크플로우 단계 반환"""
    phases = phases_config.get(workflow_type, [])
    current_idx = next((i for i, p in enumerate(phases) if p["id"] == current_phase), -1)
    
    if current_idx >= 0 and current_idx < len(phases) - 1:
        return phases[current_idx + 1]["id"]
    return None

def estimate_completion_time(progress: float, elapsed_seconds: float) -> Optional[datetime]:
    """현재 진행률과 경과 시간으로 완료 시간 예측"""
    if progress <= 0 or progress >= 100:
        return None
    
    rate = progress / elapsed_seconds  # 초당 진행률
    remaining = 100 - progress
    estimated_seconds = remaining / rate
    
    return datetime.now() + timedelta(seconds=estimated_seconds)

# 데이터 변환 헬퍼
def extract_json_from_text(text: str) -> Optional[Dict[str, Any]]:
    """텍스트에서 JSON 추출"""
    try:
        # JSON 블록 찾기
        json_match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        
        # 중괄호로 시작하는 부분 찾기
        brace_match = re.search(r'\{.*\}', text, re.DOTALL)
        if brace_match:
            return json.loads(brace_match.group(0))
            
    except json.JSONDecodeError:
        logger.warning("Failed to extract JSON from text")
    
    return None

def sanitize_code(code: str) -> str:
    """코드에서 위험한 패턴 제거"""
    # 위험한 import 제거
    dangerous_imports = [
        r'import\s+os',
        r'import\s+subprocess',
        r'import\s+sys',
        r'from\s+os\s+import',
        r'__import__',
        r'eval\s*\(',
        r'exec\s*\('
    ]
    
    sanitized = code
    for pattern in dangerous_imports:
        sanitized = re.sub(pattern, '# [REMOVED FOR SAFETY]', sanitized, flags=re.IGNORECASE)
    
    return sanitized

# Mock 데이터 생성 함수들
def generate_mock_agent_performance() -> Dict[str, Any]:
    """Mock 에이전트 성능 데이터 생성"""
    return {
        "success_rate": 0.85 + random.random() * 0.15,
        "average_time": 2 + random.random() * 8,
        "total_tasks": random.randint(100, 1000)
    }

def generate_mock_workflow_data(
    workflow_id: str, 
    workflow_type: str,
    phases_config: dict
) -> Dict[str, Any]:
    """Mock 워크플로우 데이터 생성"""
    phases = phases_config.get(workflow_type, [])
    current_phase = random.choice(phases)["id"] if phases else "initialized"
    
    return {
        "workflow_id": workflow_id,
        "type": workflow_type,
        "status": random.choice(["executing", "completed", "paused", "failed"]),
        "progress": calculate_workflow_progress(current_phase, workflow_type, phases_config),
        "current_phase": current_phase,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }

def generate_mock_analysis_result(agent_type: str) -> Dict[str, Any]:
    """Mock 분석 결과 생성"""
    base_results = {
        "analyst": {
            "summary": "Data shows significant patterns in user behavior",
            "insights": ["Pattern 1", "Pattern 2", "Pattern 3"],
            "recommendations": ["Action 1", "Action 2"],
            "confidence": 0.85
        },
        "code_generator": {
            "code": "def example_function():\n    return 'Generated code'",
            "explanation": "This function demonstrates the generated code",
            "tests": "def test_example():\n    assert example_function() == 'Generated code'"
        },
        "architect": {
            "components": ["Service A", "Service B", "Database"],
            "architecture": "Microservices with event-driven communication",
            "technologies": ["Python", "FastAPI", "PostgreSQL", "Redis"]
        }
    }
    
    return base_results.get(agent_type, {"result": "Mock result", "status": "success"})

# 검증 헬퍼
def validate_workflow_state(state: Dict[str, Any], required_fields: List[str]) -> Tuple[bool, List[str]]:
    """워크플로우 상태 검증"""
    missing_fields = []
    
    for field in required_fields:
        if field not in state or state[field] is None:
            missing_fields.append(field)
    
    return len(missing_fields) == 0, missing_fields

def validate_agent_response(response: Any, expected_format: str) -> bool:
    """에이전트 응답 형식 검증"""
    if expected_format == "json":
        return isinstance(response, dict)
    elif expected_format == "code":
        return isinstance(response, str) and len(response) > 0
    elif expected_format == "list":
        return isinstance(response, list)
    
    return True

# 성능 관련 헬퍼
def calculate_agent_efficiency(success_rate: float, avg_time: float) -> float:
    """에이전트 효율성 계산"""
    if avg_time <= 0:
        return 0.0
    
    # 성공률과 속도를 고려한 효율성 점수
    efficiency = (success_rate * 100) / (avg_time ** 0.5)
    return min(100.0, efficiency)

def should_retry_operation(error: Exception, retry_count: int, max_retries: int) -> bool:
    """재시도 여부 결정"""
    if retry_count >= max_retries:
        return False
    
    # 재시도 가능한 에러 타입
    retryable_errors = (
        asyncio.TimeoutError,
        ConnectionError,
        TimeoutError
    )
    
    return isinstance(error, retryable_errors)

# 데이터 집계 헬퍼
def aggregate_metrics(metrics_list: List[Dict[str, float]]) -> Dict[str, float]:
    """메트릭 리스트 집계"""
    if not metrics_list:
        return {}
    
    aggregated = {}
    keys = metrics_list[0].keys()
    
    for key in keys:
        values = [m.get(key, 0) for m in metrics_list]
        aggregated[f"{key}_avg"] = sum(values) / len(values)
        aggregated[f"{key}_min"] = min(values)
        aggregated[f"{key}_max"] = max(values)
    
    return aggregated

# 보안 관련 헬퍼
def mask_sensitive_data(data: Dict[str, Any], sensitive_keys: List[str] = None) -> Dict[str, Any]:
    """민감한 데이터 마스킹"""
    if sensitive_keys is None:
        sensitive_keys = ["password", "token", "api_key", "secret", "credential"]
    
    masked_data = data.copy()
    
    for key, value in masked_data.items():
        if any(sensitive in key.lower() for sensitive in sensitive_keys):
            if isinstance(value, str):
                masked_data[key] = "*" * 8
            else:
                masked_data[key] = "[MASKED]"
    
    return masked_data

# 워크플로우 연결 헬퍼
def determine_next_workflow(
    current_type: str,
    current_results: Dict[str, Any],
    business_rules: Dict[str, Any]
) -> Optional[str]:
    """현재 워크플로우 결과에 따라 다음 워크플로우 결정"""
    
    # 비즈니스 규칙에 따른 워크플로우 체인
    workflow_chains = {
        "analysis": {
            "needs_code_update": "code",
            "needs_optimization": "optimization",
            "complete": None
        },
        "code": {
            "needs_analysis": "analysis",
            "needs_deployment": "deployment",
            "complete": None
        }
    }
    
    chain_rules = workflow_chains.get(current_type, {})
    
    # 결과 분석하여 다음 단계 결정
    if current_results.get("errors"):
        return "error_handling"
    
    if current_results.get("requires_human_review"):
        return None
    
    # 기본 규칙 적용
    for condition, next_workflow in chain_rules.items():
        if current_results.get(condition):
            return next_workflow
    
    return None