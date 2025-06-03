# Related files: backend/main.py
# Location: backend/models.py

from pydantic import BaseModel
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

class Connection(BaseModel):
    from_node: str = None  # 'from' is reserved
    to: str

    class Config:
        fields = {'from_node': 'from'}

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