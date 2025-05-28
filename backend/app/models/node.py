
# backend/app/models/node.py

from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Union
from enum import Enum
from datetime import datetime
import uuid

class NodeType(str, Enum):
    """노드 타입"""
    PYTHON = "python"
    FILE = "file"
    HTTP = "http"
    TRANSFORM = "transform"
    CUSTOM = "custom"
    INPUT = "input"
    OUTPUT = "output"

class DataType(str, Enum):
    """데이터 타입"""
    ANY = "any"
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"
    FILE = "file"
    DATAFRAME = "dataframe"

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

class NodeData(BaseModel):
    """노드 데이터"""
    label: str
    type: NodeType
    inputs: List[NodePort] = []
    outputs: List[NodePort] = []
    config: Dict[str, Any] = {}
    description: Optional[str] = None

class Node(BaseModel):
    """노드"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "custom"  # React Flow 노드 타입
    position: NodePosition
    data: NodeData
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
