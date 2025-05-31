# backend/app/services/template_service.py

import json
import yaml
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

from app.models import Workflow, Node, Edge, NodeData, NodePosition
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class WorkflowTemplate:
    """워크플로우 템플릿"""
    
    def __init__(self, template_data: Dict[str, Any]):
        self.id = template_data.get('id', str(uuid.uuid4()))
        self.name = template_data['name']
        self.description = template_data.get('description', '')
        self.category = template_data.get('category', 'general')
        self.tags = template_data.get('tags', [])
        self.nodes = template_data.get('nodes', [])
        self.edges = template_data.get('edges', [])
        self.variables = template_data.get('variables', {})
        self.settings = template_data.get('settings', {})
        self.metadata = template_data.get('metadata', {})
    
    def instantiate(self, name: str, customizations: Dict[str, Any] = None) -> Workflow:
        """템플릿에서 워크플로우 인스턴스 생성"""
        # 새로운 ID 생성
        node_id_mapping = {}
        
        # 노드 복사 및 ID 재생성
        new_nodes = []
        for node_data in self.nodes:
            old_id = node_data['id']
            new_id = f"{node_data['type']}-{uuid.uuid4().hex[:8]}"
            node_id_mapping[old_id] = new_id
            
            new_node = Node(
                id=new_id,
                type=node_data['type'],
                position=NodePosition(**node_data['position']),
                data=NodeData(**node_data['data'])
            )
            
            # 커스터마이제이션 적용
            if customizations and 'nodes' in customizations:
                node_custom = customizations['nodes'].get(old_id, {})
                for key, value in node_custom.items():
                    setattr(new_node.data, key, value)
            
            new_nodes.append(new_node)
        
        # 엣지 복사 및 ID 업데이트
        new_edges = []
        for edge_data in self.edges:
            new_edge = Edge(
                id=str(uuid.uuid4()),
                source=node_id_mapping.get(edge_data['source'], edge_data['source']),
                target=node_id_mapping.get(edge_data['target'], edge_data['target']),
                sourceHandle=edge_data.get('sourceHandle'),
                targetHandle=edge_data.get('targetHandle')
            )
            new_edges.append(new_edge)
        
        # 변수 복사
        new_variables = self.variables.copy()
        if customizations and 'variables' in customizations:
            new_variables.update(customizations['variables'])
        
        # 워크플로우 생성
        workflow = Workflow(
            id=str(uuid.uuid4()),
            metadata={
                'name': name,
                'description': f"Created from template: {self.name}",
                'template_id': self.id,
                'created_at': datetime.now().isoformat()
            },
            nodes=new_nodes,
            edges=new_edges,
            variables=new_variables,
            settings=self.settings.copy()
        )
        
        return workflow

class TemplateService:
    """템플릿 서비스"""
    
    def __init__(self):
        self.templates_dir = Path("templates")
        self.templates_dir.mkdir(exist_ok=True)
        self.templates_cache: Dict[str, WorkflowTemplate] = {}
        self._load_templates()
    
    def _load_templates(self):
        """템플릿 파일 로드"""
        for template_file in self.templates_dir.glob("*.yaml"):
            try:
                with open(template_file, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)
                    template = WorkflowTemplate(data)
                    self.templates_cache[template.id] = template
                    logger.info(f"Loaded template: {template.name}")
            except Exception as e:
                logger.error(f"Failed to load template {template_file}: {e}")
    
    def get_template(self, template_id: str) -> Optional[WorkflowTemplate]:
        """템플릿 가져오기"""
        return self.templates_cache.get(template_id)
    
    def list_templates(self, category: Optional[str] = None) -> List[WorkflowTemplate]:
        """템플릿 목록"""
        templates = list(self.templates_cache.values())
        
        if category:
            templates = [t for t in templates if t.category == category]
        
        return templates
    
    def create_from_template(
        self, 
        template_id: str, 
        name: str,
        customizations: Dict[str, Any] = None
    ) -> Workflow:
        """템플릿에서 워크플로우 생성"""
        template = self.get_template(template_id)
        if not template:
            raise ValueError(f"Template not found: {template_id}")
        
        return template.instantiate(name, customizations)
    
    def save_as_template(
        self,
        workflow: Workflow,
        template_name: str,
        category: str = "custom",
        tags: List[str] = None
    ) -> WorkflowTemplate:
        """워크플로우를 템플릿으로 저장"""
        template_data = {
            'id': str(uuid.uuid4()),
            'name': template_name,
            'description': workflow.metadata.get('description', ''),
            'category': category,
            'tags': tags or [],
            'nodes': [node.dict() for node in workflow.nodes],
            'edges': [edge.dict() for edge in workflow.edges],
            'variables': workflow.variables,
            'settings': workflow.settings,
            'metadata': {
                'created_at': datetime.now().isoformat(),
                'source_workflow': workflow.id
            }
        }
        
        template = WorkflowTemplate(template_data)
        
        # 파일로 저장
        template_file = self.templates_dir / f"{template.id}.yaml"
        with open(template_file, 'w', encoding='utf-8') as f:
            yaml.dump(template_data, f, default_flow_style=False)
        
        # 캐시에 추가
        self.templates_cache[template.id] = template
        
        return template

# 싱글톤 인스턴스
template_service = TemplateService()