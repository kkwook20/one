# backend/app/models/node.py

from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Union
from enum import Enum
from datetime import datetime
import uuid

class NodeType(str, Enum):
    """노드 타입"""
    WORKER = "worker"
    WORKER_WRITER = "worker_writer" 
    WORKER_PAINTER = "worker_painter"
    SUPERVISOR = "supervisor"
    PLANNER = "planner"
    WATCHER = "watcher"
    SCHEDULER = "scheduler"
    FLOW = "flow"
    STORAGE = "storage"
    QA = "qa"
    
class DataType(str, Enum):
    """데이터 타입"""
    ANY = "any"
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"
    FILE = "file"
    IMAGE = "image"
    DATAFRAME = "dataframe"
    JSON = "json"
    MARKDOWN = "markdown"

class TaskStatus(str, Enum):
    """작업 항목 상태"""
    IN_PROGRESS = "○"  # Supervisor가 해당 항목 수행 중
    NOT_MODIFIED = "×"  # 사용자가 수정하지 않음
    PARTIALLY_MODIFIED = "△"  # 비교적 수정하지 않음

class TaskItem(BaseModel):
    """작업 항목"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: int  # 수정 불가능한 넘버링
    text: str = ""  # 작업 내용
    status: TaskStatus = TaskStatus.NOT_MODIFIED
    order: int  # 드래그&드롭으로 변경 가능한 순서
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class NodePort(BaseModel):
    """노드 포트 (입력/출력)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: DataType
    required: bool = True
    multiple: bool = False
    description: Optional[str] = None

class NodePosition(BaseModel):
    """노드 위치"""
    x: float
    y: float

class VersionHistory(BaseModel):
    """버전 히스토리"""
    version: int
    code: str
    timestamp: datetime = Field(default_factory=datetime.now)
    author: Optional[str] = None
    message: Optional[str] = None
    file_hash: Optional[str] = None
    parameters: Dict[str, Any] = {}
    model_version: Optional[str] = None

class NodeMetadata(BaseModel):
    """노드 메타데이터"""
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    execution_count: int = 0
    last_execution: Optional[datetime] = None
    average_execution_time: float = 0.0
    ai_model: Optional[str] = None  # 사용 중인 LLM 모델
    vector_db: Optional[str] = None  # Vector DB 정보
    vector_table: Optional[str] = None  # 참조 테이블

class NodeData(BaseModel):
    """노드 데이터"""
    label: str
    type: NodeType
    inputs: List[NodePort] = []
    outputs: List[NodePort] = []
    config: Dict[str, Any] = {}
    description: Optional[str] = None
    
    # 공통 기능
    tasks: List[TaskItem] = Field(default_factory=lambda: [
        TaskItem(number=i+1, text="", order=i) for i in range(5)
    ])  # 초기 5개 항목
    progress: float = 0.0  # 진행률
    is_running: bool = False
    is_deactivated: bool = False  # 비활성화 상태
    
    # 버전 관리
    current_code: str = ""
    version_history: List[VersionHistory] = []  # 최대 5개
    
    # 메타데이터
    metadata: NodeMetadata = Field(default_factory=NodeMetadata)
    
    # 노드별 특수 데이터
    # Worker Node
    input_source: Optional[str] = None  # 연결된 이전 노드
    post_success_hook: Optional[str] = None  # 성공 시 실행 코드
    post_failure_hook: Optional[str] = None  # 실패 시 실행 코드
    
    # Worker Writer Node
    generated_text: Optional[str] = None  # 생성된 텍스트
    text_sections: Dict[str, str] = {}  # 섹션별 텍스트
    
    # Worker Painter Node  
    image_format: Optional[str] = None  # SVG, JPEG, PNG
    generated_image_path: Optional[str] = None
    
    # Supervisor Node
    target_nodes: List[str] = []  # 관리 대상 노드들
    modification_history: List[Dict[str, Any]] = []
    modification_mode: str = "auto"  # auto, review, recommend
    
    # Planner Node
    goals: str = ""  # 전체 목표
    evaluations: Dict[str, Dict[str, Any]] = {}  # 노드별 평가
    
    # Watcher Node
    requests: List[Dict[str, Any]] = []  # Planner로부터 받은 요청
    collected_data: List[Dict[str, Any]] = []  # 수집한 데이터
    
    # Scheduler Node
    schedule_data: Dict[str, Any] = {}
    gantt_chart: Optional[Dict[str, Any]] = None
    
    # Flow Node
    execution_list: List[str] = []  # 실행할 노드 목록
    manager_nodes: List[str] = []  # 우선 실행할 매니저 노드
    
    # Storage Node
    folder_structure: Dict[str, Any] = {}
    data_flow_graph: Optional[Dict[str, Any]] = None

class Node(BaseModel):
    """노드"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "custom"  # React Flow 노드 타입
    position: NodePosition
    data: NodeData
    
    # 추가 속성
    section: Optional[str] = None  # 속한 섹션 (preproduction, postproduction, director)
    subsection: Optional[str] = None  # 세부 섹션 (script, storyboard 등)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }