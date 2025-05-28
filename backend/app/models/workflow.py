# backend/app/models/workflow.py

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

class Edge(BaseModel):
    """엣지 (노드 연결)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source: str  # 소스 노드 ID
    target: str  # 타겟 노드 ID
    sourceHandle: Optional[str] = None  # 소스 포트 ID
    targetHandle: Optional[str] = None  # 타겟 포트 ID
    type: str = "default"
    animated: bool = False
    style: Optional[Dict[str, Any]] = None

class WorkflowMetadata(BaseModel):
    """워크플로우 메타데이터"""
    name: str
    description: Optional[str] = None
    tags: List[str] = []
    version: str = "1.0.0"
    author: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class Workflow(BaseModel):
    """워크플로우"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    metadata: WorkflowMetadata
    nodes: List[Node] = []
    edges: List[Edge] = []
    variables: Dict[str, Any] = {}
    settings: Dict[str, Any] = {
        "executionMode": "manual",  # manual, auto, scheduled
        "maxExecutionTime": 300,
        "retryOnFailure": False,
        "retryCount": 3
    }
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
