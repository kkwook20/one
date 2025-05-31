# backend/app/models/node.py

from pydantic import BaseModel, Field, validator, root_validator
from typing import Any, Dict, List, Optional, Union, Set
from enum import Enum
from datetime import datetime
import uuid
import re
from pathlib import Path

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

class ImageFormat(str, Enum):
    """이미지 포맷"""
    SVG = "svg"
    JPEG = "jpeg"
    JPG = "jpg"
    PNG = "png"
    WEBP = "webp"
    GIF = "gif"

class ModificationMode(str, Enum):
    """수정 모드"""
    AUTO = "auto"
    REVIEW = "review"
    RECOMMEND = "recommend"

class TaskItem(BaseModel):
    """작업 항목"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: int  # 수정 불가능한 넘버링
    text: str = ""  # 작업 내용
    status: TaskStatus = TaskStatus.NOT_MODIFIED
    order: int  # 드래그&드롭으로 변경 가능한 순서
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    @validator('number')
    def validate_number(cls, v):
        if v < 1:
            raise ValueError('Task number must be positive')
        if v > 1000:
            raise ValueError('Task number cannot exceed 1000')
        return v
    
    @validator('text')
    def validate_text(cls, v):
        if len(v) > 5000:
            raise ValueError('Task text cannot exceed 5000 characters')
        return v
    
    @validator('order')
    def validate_order(cls, v):
        if v < 0:
            raise ValueError('Order must be non-negative')
        return v

class NodePort(BaseModel):
    """노드 포트 (입력/출력)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: DataType
    required: bool = True
    multiple: bool = False
    description: Optional[str] = None
    
    @validator('name')
    def validate_name(cls, v):
        if not v:
            raise ValueError('Port name is required')
        if len(v) > 50:
            raise ValueError('Port name cannot exceed 50 characters')
        if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', v):
            raise ValueError('Port name must start with letter and contain only alphanumeric and underscore')
        return v
    
    @validator('description')
    def validate_description(cls, v):
        if v and len(v) > 500:
            raise ValueError('Port description cannot exceed 500 characters')
        return v

class NodePosition(BaseModel):
    """노드 위치"""
    x: float
    y: float
    
    @validator('x', 'y')
    def validate_coordinates(cls, v):
        if v < -10000 or v > 10000:
            raise ValueError('Coordinates must be between -10000 and 10000')
        return v

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
    
    @validator('version')
    def validate_version(cls, v):
        if v < 1:
            raise ValueError('Version must be positive')
        return v
    
    @validator('code')
    def validate_code(cls, v):
        if not v:
            raise ValueError('Code cannot be empty')
        if len(v) > 1000000:  # 1MB limit
            raise ValueError('Code size cannot exceed 1MB')
        return v
    
    @validator('author')
    def validate_author(cls, v):
        if v and len(v) > 100:
            raise ValueError('Author name cannot exceed 100 characters')
        return v
    
    @validator('message')
    def validate_message(cls, v):
        if v and len(v) > 1000:
            raise ValueError('Version message cannot exceed 1000 characters')
        return v
    
    @validator('file_hash')
    def validate_file_hash(cls, v):
        if v and not re.match(r'^[a-fA-F0-9]{64}$', v):
            raise ValueError('File hash must be a valid SHA256 hash')
        return v

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
    
    @validator('execution_count')
    def validate_execution_count(cls, v):
        if v < 0:
            raise ValueError('Execution count cannot be negative')
        return v
    
    @validator('average_execution_time')
    def validate_execution_time(cls, v):
        if v < 0:
            raise ValueError('Execution time cannot be negative')
        if v > 86400:  # 24 hours
            raise ValueError('Average execution time seems unrealistic (>24 hours)')
        return v
    
    @validator('ai_model')
    def validate_ai_model(cls, v):
        if v:
            allowed_models = [
                'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
                'claude-3-opus', 'claude-3-sonnet', 'claude-2',
                'gemini-pro', 'gemini-ultra',
                'llama-2', 'mistral', 'mixtral'
            ]
            if not any(model in v.lower() for model in allowed_models):
                raise ValueError(f'Unknown AI model: {v}')
        return v
    
    @root_validator
    def validate_timestamps(cls, values):
        created = values.get('created_at')
        updated = values.get('updated_at')
        last_exec = values.get('last_execution')
        
        if created and updated and updated < created:
            raise ValueError('Updated time cannot be before created time')
        
        if last_exec and created and last_exec < created:
            raise ValueError('Last execution cannot be before creation time')
            
        return values

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
    image_format: Optional[ImageFormat] = None  # SVG, JPEG, PNG
    generated_image_path: Optional[str] = None
    
    # Supervisor Node
    target_nodes: List[str] = []  # 관리 대상 노드들
    modification_history: List[Dict[str, Any]] = []
    modification_mode: ModificationMode = ModificationMode.AUTO
    
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
    
    @validator('label')
    def validate_label(cls, v):
        if not v or not v.strip():
            raise ValueError('Label cannot be empty')
        if len(v) > 100:
            raise ValueError('Label must be 1-100 characters')
        if not re.match(r'^[\w\s\-\.]+$', v):
            raise ValueError('Label contains invalid characters')
        return v.strip()
    
    @validator('tasks')
    def validate_tasks(cls, v):
        if len(v) > 50:
            raise ValueError('Maximum 50 tasks allowed')
        
        # 중복된 number 체크
        numbers = [task.number for task in v]
        if len(numbers) != len(set(numbers)):
            raise ValueError('Task numbers must be unique')
            
        # 중복된 order 체크
        orders = [task.order for task in v]
        if len(orders) != len(set(orders)):
            raise ValueError('Task orders must be unique')
            
        return v
    
    @validator('progress')
    def validate_progress(cls, v):
        if v < 0 or v > 100:
            raise ValueError('Progress must be between 0 and 100')
        return v
    
    @validator('inputs', 'outputs')
    def validate_ports(cls, v):
        if len(v) > 20:
            raise ValueError('Maximum 20 ports allowed')
            
        # 포트 이름 중복 체크
        names = [port.name for port in v]
        if len(names) != len(set(names)):
            raise ValueError('Port names must be unique')
            
        return v
    
    @validator('version_history')
    def validate_version_history(cls, v):
        if len(v) > 5:
            # 최신 5개만 유지
            v = sorted(v, key=lambda x: x.version, reverse=True)[:5]
            
        # 버전 번호 중복 체크
        versions = [vh.version for vh in v]
        if len(versions) != len(set(versions)):
            raise ValueError('Version numbers must be unique')
            
        return v
    
    @validator('current_code')
    def validate_current_code(cls, v):
        if len(v) > 1000000:  # 1MB limit
            raise ValueError('Code size cannot exceed 1MB')
            
        # 위험한 코드 패턴 체크 (선택적)
        dangerous_patterns = [
            r'__import__\s*\(\s*[\'"]os[\'"]\s*\)',
            r'exec\s*\(',
            r'eval\s*\(',
            r'compile\s*\(',
            r'open\s*\(.+[\'"]w[\'"]',  # 파일 쓰기
        ]
        
        for pattern in dangerous_patterns:
            if re.search(pattern, v):
                raise ValueError(f'Code contains potentially dangerous pattern: {pattern}')
                
        return v
    
    @validator('input_source')
    def validate_input_source(cls, v):
        if v and not re.match(r'^[a-zA-Z0-9\-_]+$', v):
            raise ValueError('Invalid node ID format for input source')
        return v
    
    @validator('post_success_hook', 'post_failure_hook')
    def validate_hooks(cls, v):
        if v and len(v) > 10000:
            raise ValueError('Hook code cannot exceed 10000 characters')
        return v
    
    @validator('generated_text')
    def validate_generated_text(cls, v):
        if v and len(v) > 100000:  # 100KB limit
            raise ValueError('Generated text cannot exceed 100KB')
        return v
    
    @validator('text_sections')
    def validate_text_sections(cls, v):
        if len(v) > 50:
            raise ValueError('Maximum 50 text sections allowed')
            
        for section_name, section_text in v.items():
            if len(section_name) > 50:
                raise ValueError(f'Section name "{section_name}" exceeds 50 characters')
            if len(section_text) > 50000:
                raise ValueError(f'Section "{section_name}" text exceeds 50KB')
                
        return v
    
    @validator('generated_image_path')
    def validate_image_path(cls, v):
        if v:
            # 경로 검증
            try:
                path = Path(v)
                if path.is_absolute():
                    raise ValueError('Image path must be relative')
                    
                # 위험한 경로 패턴 체크
                if '..' in path.parts:
                    raise ValueError('Path traversal not allowed')
                    
            except Exception:
                raise ValueError('Invalid image path')
                
        return v
    
    @validator('target_nodes', 'execution_list', 'manager_nodes')
    def validate_node_lists(cls, v):
        if len(v) > 100:
            raise ValueError('Maximum 100 nodes allowed in list')
            
        # 노드 ID 형식 검증
        for node_id in v:
            if not re.match(r'^[a-zA-Z0-9\-_]+$', node_id):
                raise ValueError(f'Invalid node ID format: {node_id}')
                
        # 중복 체크
        if len(v) != len(set(v)):
            raise ValueError('Duplicate node IDs not allowed')
            
        return v
    
    @validator('modification_history', 'requests', 'collected_data')
    def validate_history_lists(cls, v):
        if len(v) > 1000:
            raise ValueError('Maximum 1000 history items allowed')
        return v
    
    @validator('goals')
    def validate_goals(cls, v):
        if len(v) > 10000:
            raise ValueError('Goals text cannot exceed 10000 characters')
        return v
    
    @validator('evaluations')
    def validate_evaluations(cls, v):
        if len(v) > 100:
            raise ValueError('Maximum 100 evaluations allowed')
        return v
    
    @validator('schedule_data', 'gantt_chart', 'folder_structure', 'data_flow_graph')
    def validate_json_data(cls, v):
        if v:
            # JSON 데이터 크기 제한
            import json
            json_str = json.dumps(v)
            if len(json_str) > 1000000:  # 1MB limit
                raise ValueError('JSON data cannot exceed 1MB')
        return v
    
    @root_validator
    def validate_node_type_fields(cls, values):
        """노드 타입에 따른 필드 검증"""
        node_type = values.get('type')
        
        if node_type == NodeType.WORKER_PAINTER:
            if values.get('image_format') and not values.get('generated_image_path'):
                # 이미지 포맷이 설정되었지만 경로가 없는 경우는 OK (아직 생성 전)
                pass
                
        elif node_type == NodeType.SUPERVISOR:
            if not values.get('target_nodes'):
                raise ValueError('Supervisor node must have target nodes')
                
        elif node_type == NodeType.FLOW:
            if not values.get('execution_list'):
                # 실행 목록이 비어있어도 OK (아직 설정 전)
                pass
                
        return values

class Node(BaseModel):
    """노드"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "custom"  # React Flow 노드 타입
    position: NodePosition
    data: NodeData
    
    # 추가 속성
    section: Optional[str] = None  # 속한 섹션 (preproduction, postproduction, director)
    subsection: Optional[str] = None  # 세부 섹션 (script, storyboard 등)
    
    @validator('id')
    def validate_id(cls, v):
        if not v:
            raise ValueError('Node ID is required')
        if not re.match(r'^[a-zA-Z0-9\-_]+$', v):
            raise ValueError('Invalid node ID format')
        return v
    
    @validator('type')
    def validate_type(cls, v):
        allowed_types = ['custom', 'default', 'input', 'output']
        if v not in allowed_types:
            raise ValueError(f'Node type must be one of {allowed_types}')
        return v
    
    @validator('section')
    def validate_section(cls, v):
        if v:
            allowed_sections = ['preproduction', 'postproduction', 'director']
            if v not in allowed_sections:
                raise ValueError(f'Section must be one of {allowed_sections}')
        return v
    
    @validator('subsection')
    def validate_subsection(cls, v, values):
        if v:
            section = values.get('section')
            if not section:
                raise ValueError('Subsection requires section to be set')
                
            subsection_map = {
                'preproduction': ['script', 'storyboard', 'concept', 'planning'],
                'postproduction': ['editing', 'vfx', 'sound', 'color'],
                'director': ['review', 'approval', 'feedback']
            }
            
            allowed_subsections = subsection_map.get(section, [])
            if v not in allowed_subsections:
                raise ValueError(f'Invalid subsection "{v}" for section "{section}"')
                
        return v
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        validate_assignment = True  # 할당 시에도 검증
        
    def dict(self, **kwargs):
        """커스텀 직렬화"""
        data = super().dict(**kwargs)
        
        # 민감한 정보 제거 (필요 시)
        if kwargs.get('exclude_sensitive'):
            if 'data' in data and 'current_code' in data['data']:
                data['data']['current_code'] = '<REDACTED>'
                
        return data
        
    def get_input_ports(self) -> List[NodePort]:
        """입력 포트 목록 반환"""
        return self.data.inputs
        
    def get_output_ports(self) -> List[NodePort]:
        """출력 포트 목록 반환"""
        return self.data.outputs
        
    def get_required_inputs(self) -> List[NodePort]:
        """필수 입력 포트 목록 반환"""
        return [port for port in self.data.inputs if port.required]
        
    def is_executable(self) -> bool:
        """노드가 실행 가능한 상태인지 확인"""
        return (
            not self.data.is_deactivated and
            bool(self.data.current_code) and
            self.data.progress < 100
        )
        
    def get_latest_version(self) -> Optional[VersionHistory]:
        """최신 버전 반환"""
        if self.data.version_history:
            return max(self.data.version_history, key=lambda v: v.version)
        return None
        
    def add_task(self, text: str) -> TaskItem:
        """작업 항목 추가"""
        if len(self.data.tasks) >= 50:
            raise ValueError('Maximum tasks limit reached')
            
        max_number = max((t.number for t in self.data.tasks), default=0)
        max_order = max((t.order for t in self.data.tasks), default=-1)
        
        new_task = TaskItem(
            number=max_number + 1,
            text=text,
            order=max_order + 1
        )
        
        self.data.tasks.append(new_task)
        return new_task