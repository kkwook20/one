# backend/models.py - 정리된 버전
from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, List, Optional, Any
from datetime import datetime

class Position(BaseModel):
    """노드 위치"""
    x: float
    y: float

class TaskItem(BaseModel):
    """작업 항목"""
    id: str
    text: str
    status: str  # 'pending' | 'none' | 'partial'
    taskStatus: Optional[str] = None  # 'locked' | 'editable' | 'low_priority'
    aiScore: Optional[float] = None  # AI 평가 점수

class UpdateHistory(BaseModel):
    """업데이트 기록"""
    timestamp: str
    type: str  # 'execution' | 'supervised'
    by: Optional[str] = None
    score: Optional[float] = None
    output: Optional[Any] = None

class Node(BaseModel):
    """노드 모델"""
    id: str
    type: str  # 'worker' | 'supervisor' | 'planner' | 'input' | 'output'
    label: str
    position: Position
    isRunning: bool = False
    isDeactivated: bool = False
    supervised: bool = False 
    
    # 노드별 데이터
    tasks: Optional[List[TaskItem]] = None
    connectedTo: Optional[List[str]] = None
    connectedFrom: Optional[List[str]] = None
    code: Optional[str] = None
    output: Optional[Any] = None
    error: Optional[str] = None
    model: Optional[str] = None
    vectorDB: Optional[Dict[str, str]] = None
    
    # Worker 노드 전용 필드
    purpose: Optional[str] = None  # 노드의 목적
    outputFormat: Optional[str] = None  # output 형식 설명 (AI에게 요청할 텍스트)
    
    # Base/Exp Code 분리 관련 필드 (추가됨)
    expCode: Optional[str] = None  # Experimental Code
    baseCodeTemplate: Optional[str] = 'default'  # Base Code 템플릿 ID
    
    # AI Model Configuration
    lmStudioUrl: Optional[str] = None
    lmStudioConnectionId: Optional[str] = None
    
    # Project Configuration (추가됨)
    projectId: Optional[str] = None  # Input 노드에서 선택한 프로젝트 ID
    
    # Supervisor/Planner 전용
    supervisedNodes: Optional[List[str]] = None
    updateHistory: Optional[List[UpdateHistory]] = None
    aiScore: Optional[float] = None
    modificationHistory: Optional[List[Dict[str, Any]]] = None
    evaluationHistory: Optional[List[Dict[str, Any]]] = None
    plannerRecommendations: Optional[List[str]] = None
    
    # Execution tracking (추가됨)
    executionHistory: Optional[List[Dict[str, Any]]] = None
    currentExecutionStartTime: Optional[str] = None

class Connection(BaseModel):
    """연결 정보"""
    from_node: str = Field(default=None, alias='from')
    to: str

    model_config = ConfigDict(
        populate_by_name=True
    )

class SectionConfig(BaseModel):
    """섹션 입력 설정"""
    sources: List[str] = []
    selectedItems: List[str] = []
    projectId: Optional[str] = None  # 추가됨

class OutputConfig(BaseModel):
    """섹션 출력 설정"""
    format: str = "json"
    autoSave: bool = True

class Section(BaseModel):
    """섹션 모델"""
    id: str
    name: str
    group: str  # 'preproduction' | 'postproduction' | 'director'
    nodes: List[Node]
    inputConfig: Optional[SectionConfig] = None
    outputConfig: Optional[OutputConfig] = None

class Version(BaseModel):
    """버전 정보"""
    id: str
    timestamp: str
    data: Dict[str, Any]
    metadata: Dict[str, Any]

class ExecuteRequest(BaseModel):
    """노드 실행 요청"""
    nodeId: str
    sectionId: str
    code: str
    inputs: Optional[Dict[str, Any]] = None

class RestoreVersionRequest(BaseModel):
    """버전 복원 요청"""
    nodeId: str
    versionId: str

# API Response Models
class BaseResponse(BaseModel):
    """기본 응답"""
    status: str
    message: Optional[str] = None

class ExecuteResponse(BaseResponse):
    """실행 응답"""
    nodeId: str
    output: Optional[Any] = None
    error: Optional[str] = None

class ModelInfo(BaseModel):
    """AI 모델 정보"""
    id: str
    name: Optional[str] = None
    type: Optional[str] = None

class ModelsResponse(BaseModel):
    """모델 목록 응답"""
    data: List[ModelInfo]