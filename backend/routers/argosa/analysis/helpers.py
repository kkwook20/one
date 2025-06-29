# backend/routers/argosa/analysis/helpers.py
"""독립적인 헬퍼 함수들"""

import re
import json
import asyncio
from datetime import datetime, timedelta
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

# LLM 진단 관련 헬퍼
async def diagnose_llm_failure(error_details: Dict[str, Any], lm_studio_manager: Any, distributed_executor: Any, initialized: bool) -> Dict[str, Any]:
    """LLM 호출 실패 시 문제점 분석"""
    
    diagnosis = {
        "timestamp": datetime.now().isoformat(),
        "issues": [],
        "recommendations": [],
        "system_state": {}
    }
    
    # 1. 연결 상태 확인
    all_instances = {}
    for instance_id, instance in lm_studio_manager.instances.items():
        all_instances[instance_id] = {
            "status": instance.status,
            "models": len(instance.available_models),
            "is_local": instance.is_local
        }
    diagnosis["system_state"]["lm_studio_instances"] = all_instances
    
    # 2. 분산 실행 상태 확인
    dist_status = distributed_executor.get_cluster_status()
    diagnosis["system_state"]["distributed_execution"] = {
        "enabled": dist_status.get("enabled", False),
        "active_instances": dist_status.get("active_instances", 0),
        "pending_tasks": dist_status.get("pending_tasks", 0)
    }
    
    # 3. 문제 분석
    if not all_instances:
        diagnosis["issues"].append("No LM Studio instances configured")
        diagnosis["recommendations"].append("Add at least one LM Studio instance (localhost:1234)")
    
    localhost_status = all_instances.get("localhost:1234", {})
    if localhost_status.get("status") != "connected":
        diagnosis["issues"].append("Localhost LM Studio is not connected")
        diagnosis["recommendations"].append("Ensure LM Studio is running on localhost:1234")
        diagnosis["recommendations"].append("Check firewall settings and port availability")
    
    if localhost_status.get("models", 0) == 0:
        diagnosis["issues"].append("No models loaded in localhost LM Studio")
        diagnosis["recommendations"].append("Load at least one model in LM Studio")
    
    if error_details.get("distributed_execution_error"):
        diagnosis["issues"].append(f"Distributed execution failed: {error_details['distributed_execution_error']}")
        diagnosis["recommendations"].append("Check network connectivity between instances")
        diagnosis["recommendations"].append("Verify all remote LM Studio instances are accessible")
    
    if error_details.get("direct_call_error"):
        diagnosis["issues"].append(f"Direct call failed: {error_details['direct_call_error']}")
        
        if "timeout" in str(error_details['direct_call_error']).lower():
            diagnosis["recommendations"].append("Increase timeout settings")
            diagnosis["recommendations"].append("Check if model is too large for available resources")
        elif "connection" in str(error_details['direct_call_error']).lower():
            diagnosis["recommendations"].append("Verify LM Studio API is enabled")
            diagnosis["recommendations"].append("Check if LM Studio is listening on the correct port")
    
    # 4. 초기화 상태 확인
    if not initialized:
        diagnosis["issues"].append("Enhanced Agent System not fully initialized")
        diagnosis["recommendations"].append("Wait for initialization to complete")
        diagnosis["recommendations"].append("Check startup logs for initialization errors")
    
    return diagnosis

async def simulate_llm_response(prompt: str) -> Dict[str, Any]:
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

async def simulate_integration(integration_type: str) -> Dict[str, Any]:
    """통합 작업 시뮬레이션"""
    
    await asyncio.sleep(2)
    
    return {
        "status": "success",
        "integration_type": integration_type,
        "message": f"{integration_type} integration simulated",
        "artifacts": {
            "files_created": ["service.py", "test_service.py"],
            "files_modified": ["__init__.py", "requirements.txt"]
        },
        "summary": "Integration completed successfully"
    }

# 워크플로우 정리 관련
async def cleanup_old_workflows(active_workflows: Dict[str, Any], retention_days: int = 1) -> int:
    """오래된 워크플로우 정리"""
    
    current_time = datetime.now()
    workflows_to_remove = []
    
    for workflow_id, state in active_workflows.items():
        # 워크플로우 ID에서 타임스탬프 추출
        try:
            timestamp = float(workflow_id.split("_")[1])
            created_time = datetime.fromtimestamp(timestamp)
            
            # 지정된 기간 이상 된 워크플로우 제거
            if (current_time - created_time).days >= retention_days:
                workflows_to_remove.append(workflow_id)
        except:
            continue
    
    for workflow_id in workflows_to_remove:
        del active_workflows[workflow_id]
        logger.info(f"Cleaned up old workflow: {workflow_id}")
    
    return len(workflows_to_remove)

# 실시간 메트릭 생성
def generate_realtime_metrics(agents: Dict[str, Any]) -> Dict[str, Any]:
    """실시간 메트릭 데이터 생성"""
    
    realtime_data = {
        "timestamp": datetime.now().isoformat()
    }
    
    for agent_type, agent in agents.items():
        if agent["status"] == "busy":
            # 실행 중인 에이전트의 효율성
            efficiency = calculate_agent_efficiency(
                agent["performance_metrics"]["success_rate"],
                agent["performance_metrics"]["average_time"]
            )
            realtime_data[str(agent_type)] = efficiency
    
    return realtime_data

async def send_realtime_metrics(enhanced_agent_system: Any, system_config: Dict[str, Any]):
    """주기적으로 실시간 메트릭 전송"""
    while True:
        await asyncio.sleep(system_config["metrics_update_interval"])  # 5초마다
        
        # 실시간 데이터 생성
        realtime_data = generate_realtime_metrics(enhanced_agent_system.agents)
        
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