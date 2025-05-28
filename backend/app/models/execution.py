# backend/app/models/execution.py

from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional
from enum import Enum
from datetime import datetime
import uuid

class ExecutionStatus(str, Enum):
    """실행 상태"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"

class NodeExecutionStatus(str, Enum):
    """노드 실행 상태"""
    WAITING = "waiting"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"

class ExecutionLog(BaseModel):
    """실행 로그"""
    timestamp: datetime = Field(default_factory=datetime.now)
    level: str  # info, warning, error, debug
    node_id: Optional[str] = None
    message: str
    data: Optional[Dict[str, Any]] = None

class NodeExecution(BaseModel):
    """노드 실행 정보"""
    node_id: str
    status: NodeExecutionStatus = NodeExecutionStatus.WAITING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    input_data: Dict[str, Any] = {}
    output_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    logs: List[ExecutionLog] = []

class WorkflowExecution(BaseModel):
    """워크플로우 실행"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    workflow_id: str
    status: ExecutionStatus = ExecutionStatus.PENDING
    mode: str = "manual"  # manual, auto, scheduled, test
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    triggered_by: Optional[str] = None  # user_id or system
    node_executions: Dict[str, NodeExecution] = {}
    logs: List[ExecutionLog] = []
    context: Dict[str, Any] = {}  # 실행 컨텍스트 (변수 등)
    error: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
