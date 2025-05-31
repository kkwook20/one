# backend/app/api/variables.py
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.core.variable_resolver import global_variable_resolver
from app.storage.node_storage import node_storage
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/variables", tags=["variables"])

class VariableInfo(BaseModel):
    """변수 정보"""
    path: str
    value: Any
    type: str
    description: Optional[str] = None
    source_node_id: Optional[str] = None
    last_updated: Optional[str] = None

class VariableSearchResult(BaseModel):
    """변수 검색 결과"""
    path: str
    value: Any
    type: str
    score: float  # 매칭 점수
    preview: str  # 값 미리보기

class VariableRegistration(BaseModel):
    """변수 등록 요청"""
    node_id: str
    variable_type: str  # output, data, state 등
    data: Dict[str, Any]
    description: Optional[str] = None

@router.get("/", response_model=List[VariableInfo])
async def get_all_variables(
    section: Optional[str] = Query(None, description="섹션 필터"),
    node_type: Optional[str] = Query(None, description="노드 타입 필터"),
    limit: int = Query(100, description="최대 결과 수")
):
    """모든 글로벌 변수 목록 조회"""
    try:
        variables = []
        registry = global_variable_resolver.get_all_variables()
        
        for path, info in registry.items():
            # 필터 적용
            parts = path.split('.')
            if section and (len(parts) < 1 or parts[0] != section):
                continue
            if node_type and (len(parts) < 2 or parts[1] != node_type):
                continue
            
            variables.append(VariableInfo(
                path=path,
                value=info.get('value'),
                type=info.get('type', 'unknown'),
                description=info.get('description'),
                source_node_id=info.get('source_node_id'),
                last_updated=info.get('last_updated')
            ))
            
            if len(variables) >= limit:
                break
        
        return variables
        
    except Exception as e:
        logger.error(f"Failed to get variables: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search", response_model=List[VariableSearchResult])
async def search_variables(
    q: str = Query(..., description="검색 쿼리"),
    limit: int = Query(10, description="최대 결과 수")
):
    """변수 검색 (자동완성용)"""
    try:
        results = []
        registry = global_variable_resolver.get_all_variables()
        
        # 검색어를 소문자로 변환
        query_lower = q.lower()
        
        for path, info in registry.items():
            # 경로나 설명에서 매칭 확인
            path_lower = path.lower()
            description_lower = (info.get('description', '') or '').lower()
            
            # 매칭 점수 계산
            score = 0.0
            if query_lower in path_lower:
                # 경로에서 매칭
                if path_lower.startswith(query_lower):
                    score = 1.0  # 완벽한 prefix 매칭
                else:
                    score = 0.7  # 부분 매칭
            elif query_lower in description_lower:
                score = 0.5  # 설명에서 매칭
            
            if score > 0:
                # 값 미리보기 생성
                value = info.get('value')
                preview = str(value)
                if len(preview) > 50:
                    preview = preview[:47] + "..."
                
                results.append(VariableSearchResult(
                    path=path,
                    value=value,
                    type=info.get('type', 'unknown'),
                    score=score,
                    preview=preview
                ))
        
        # 점수 기준으로 정렬
        results.sort(key=lambda x: x.score, reverse=True)
        
        return results[:limit]
        
    except Exception as e:
        logger.error(f"Failed to search variables: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{variable_path:path}", response_model=VariableInfo)
async def get_variable(variable_path: str):
    """특정 변수 값 조회"""
    try:
        info = global_variable_resolver.get_variable_info(variable_path)
        if not info:
            raise HTTPException(status_code=404, detail=f"Variable not found: {variable_path}")
        
        return VariableInfo(
            path=variable_path,
            value=info.get('value'),
            type=info.get('type', 'unknown'),
            description=info.get('description'),
            source_node_id=info.get('source_node_id'),
            last_updated=info.get('last_updated')
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get variable {variable_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/register")
async def register_variables(request: VariableRegistration):
    """노드에서 변수 등록"""
    try:
        # 노드 정보 조회
        node_data = await node_storage.load_node_data(request.node_id)
        if not node_data:
            raise HTTPException(status_code=404, detail=f"Node not found: {request.node_id}")
        
        # 변수 등록
        for key, value in request.data.items():
            variable_path = f"{node_data.get('section', 'default')}.{node_data['type']}.{request.node_id}.{request.variable_type}.{key}"
            
            global_variable_resolver.register_variable(
                variable_path,
                value,
                source_node_id=request.node_id,
                description=request.description
            )
        
        return {"message": f"Registered {len(request.data)} variables for node {request.node_id}"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to register variables: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{variable_path:path}")
async def delete_variable(variable_path: str):
    """변수 삭제"""
    try:
        success = global_variable_resolver.unregister_variable(variable_path)
        if not success:
            raise HTTPException(status_code=404, detail=f"Variable not found: {variable_path}")
        
        return {"message": f"Deleted variable: {variable_path}"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete variable {variable_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/autocomplete/{prefix:path}")
async def autocomplete_variables(
    prefix: str,
    limit: int = Query(10, description="최대 결과 수")
):
    """변수 자동완성 제안"""
    try:
        suggestions = []
        registry = global_variable_resolver.get_all_variables()
        
        prefix_lower = prefix.lower()
        
        for path in registry.keys():
            if path.lower().startswith(prefix_lower):
                suggestions.append(path)
                if len(suggestions) >= limit:
                    break
        
        return {"suggestions": suggestions}
        
    except Exception as e:
        logger.error(f"Failed to autocomplete variables: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/refresh")
async def refresh_variables():
    """모든 노드에서 변수 재스캔"""
    try:
        # 모든 노드의 코드와 데이터를 스캔하여 변수 업데이트
        nodes = await node_storage.list_all_nodes()
        total_variables = 0
        
        for node_id in nodes:
            # 노드 코드 로드
            code = await node_storage.load_code(node_id)
            if code:
                # 코드에서 변수 추출
                variables = global_variable_resolver.extract_variables_from_code(code)
                total_variables += len(variables)
            
            # 노드 데이터 로드
            node_data = await node_storage.load_node_data(node_id)
            if node_data:
                # output 데이터 등록
                if 'output' in node_data:
                    for key, value in node_data['output'].items():
                        variable_path = f"{node_data.get('section', 'default')}.{node_data['type']}.{node_id}.output.{key}"
                        global_variable_resolver.register_variable(
                            variable_path,
                            value,
                            source_node_id=node_id
                        )
        
        return {
            "message": f"Refreshed variables from {len(nodes)} nodes",
            "total_variables": total_variables
        }
        
    except Exception as e:
        logger.error(f"Failed to refresh variables: {e}")
        raise HTTPException(status_code=500, detail=str(e))