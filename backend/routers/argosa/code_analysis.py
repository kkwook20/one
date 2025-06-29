# backend/routers/argosa/code_analysis.py - 리팩토링된 버전

from fastapi import APIRouter, HTTPException, BackgroundTasks, WebSocket, UploadFile
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Set, Tuple, AsyncGenerator
import json
import logging

# 기존 imports
from services.rag_service import rag_service, module_integration, Document, RAGQuery
from routers.argosa.data_analysis import enhanced_agent_system, EnhancedAgentType

# 새로운 하위 모듈 imports
from routers.argosa.code import (
    # Models
    CodeEntity,
    ArchitecturePattern,
    CodeGenerationPlan,
    CodeFragment,
    
    # Main classes
    AdvancedProjectAnalyzer,
    AdvancedCodeGenerationEngine,
    RealtimeCodeCollaborationSystem,
    
    # Validators
    validate_syntax,
    validate_style,
    validate_complexity,
    validate_security,
    validate_performance
)

router = APIRouter()
logger = logging.getLogger(__name__)

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
    ws_id = await collaboration_system.add_websocket_connection(session_id, websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            await collaboration_system.handle_collaboration_message(session_id, data)
            
    except Exception as e:
        print(f"[협업] 웹소켓 오류: {e}")
    finally:
        await collaboration_system.remove_websocket_connection(ws_id)
        await websocket.close()

@router.post("/ai-models/configure")
async def configure_ai_models(config: Dict[str, Any]):
    """AI 모델 설정 (프론트엔드에서)"""
    
    try:
        # AI 모델 설정 업데이트
        code_generator.ai_models = config
        
        return {
            "status": "configured",
            "models": list(config.keys())
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
            "syntax": await validate_syntax(code),
            "style": await validate_style(code, context),
            "complexity": await validate_complexity(code),
            "security": await validate_security(code),
            "performance": await validate_performance(code)
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

@router.get("/collaboration-session/{session_id}/status")
async def get_collaboration_status(session_id: str):
    """협업 세션 상태 조회"""
    
    try:
        status = await collaboration_system.get_session_status(session_id)
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/collaboration-session/{session_id}/end")
async def end_collaboration_session(session_id: str):
    """협업 세션 종료"""
    
    try:
        await collaboration_system.end_collaboration_session(session_id)
        return {"status": "ended", "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== 추가 유틸리티 엔드포인트 =====

@router.post("/generate-snippet")
async def generate_snippet_endpoint(request: Dict[str, Any]):
    """코드 스니펫 생성 엔드포인트"""
    
    try:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/project-stats")
async def get_project_stats():
    """프로젝트 통계 조회"""
    
    try:
        # 캐시된 최신 분석 결과 반환
        if "latest" in advanced_analyzer.analysis_cache:
            analysis = advanced_analyzer.analysis_cache["latest"]
            return {
                "statistics": analysis.get("statistics", {}),
                "quality_metrics": analysis.get("quality_metrics", {}),
                "patterns_detected": analysis.get("patterns_detected", [])
            }
        else:
            return {
                "message": "No analysis data available. Run project analysis first."
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/refactor-suggestions")
async def get_refactor_suggestions(request: Dict[str, Any]):
    """리팩토링 제안 생성"""
    
    try:
        code = request["code"]
        file_path = request.get("file_path", "unknown")
        
        # 코드 분석 및 리팩토링 제안 생성
        result = await enhanced_agent_system._execute_agent(
            EnhancedAgentType.CODE_REVIEWER,
            {
                "code": code,
                "context": f"Analyze this code from {file_path} and suggest refactoring improvements",
                "coding_standards": {},
                "requirements": {
                    "focus": "refactoring",
                    "include": ["performance", "readability", "maintainability"]
                }
            }
        )
        
        return {
            "suggestions": result.get("suggestions", []),
            "refactored_code": result.get("code", ""),
            "improvements": result.get("improvements", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))