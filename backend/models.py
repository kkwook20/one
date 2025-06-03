# ==============================================================================
# File: backend/models.py
# Related files: backend/main.py
# Location: backend/models.py
# Last Modified: 2025-06-03
# Description: Pydantic V2 호환성 수정
# ==============================================================================

from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, List, Optional, Any
from datetime import datetime

class Position(BaseModel):
    x: float
    y: float

class TaskItem(BaseModel):
    id: str
    text: str
    status: str  # 'pending' | 'none' | 'partial'

class Node(BaseModel):
    id: str
    type: str  # 'worker' | 'supervisor' | 'planner' | 'input' | 'output'
    label: str
    position: Position
    isRunning: bool = False
    isDeactivated: bool = False
    tasks: Optional[List[TaskItem]] = None
    connectedTo: Optional[List[str]] = None
    connectedFrom: Optional[List[str]] = None
    code: Optional[str] = None
    output: Optional[Any] = None
    model: Optional[str] = None
    vectorDB: Optional[Dict[str, str]] = None
    supervisedNodes: Optional[List[str]] = None
    updateHistory: Optional[List[Dict[str, Any]]] = None
    aiScore: Optional[float] = None

# ✅ Pydantic V2 방식으로 수정
class Connection(BaseModel):
    from_node: str = Field(default=None, alias='from')  # V2 방식
    to: str

    model_config = ConfigDict(
        populate_by_name=True  # alias와 원래 이름 모두 허용
    )

class SectionConfig(BaseModel):
    sources: List[str] = []
    selectedItems: List[str] = []

class OutputConfig(BaseModel):
    format: str = "json"
    autoSave: bool = True

class Section(BaseModel):
    id: str
    name: str
    group: str  # 'preproduction' | 'postproduction' | 'director'
    nodes: List[Node]
    inputConfig: Optional[SectionConfig] = None
    outputConfig: Optional[OutputConfig] = None

class Version(BaseModel):
    id: str
    timestamp: str
    node: Node
    metadata: Dict[str, Any]

class ExecuteRequest(BaseModel):
    nodeId: str
    sectionId: str
    code: str
    inputs: Optional[Dict[str, Any]] = None

class RestoreVersionRequest(BaseModel):
    nodeId: str
    versionId: str