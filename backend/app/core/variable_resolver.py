# backend/app/core/variable_resolver.py

import re
from typing import Dict, Any, List, Optional, Set, Tuple
from pathlib import Path
import json
from app.storage.node_storage import node_storage

class GlobalVariableResolver:
    """글로벌 변수 참조 체계
    
    네이밍 규칙: {섹션명}.{노드타입}.{노드ID}.{데이터타입}.{세부항목}
    
    예시:
    - preproduction.planning.node003.output.character_settings
    - section2.worker.node005.tasks.status_list  
    - section1.supervisor.node001.history.version_3
    """
    
    def __init__(self):
        self.variable_pattern = re.compile(
            r'([a-zA-Z0-9_]+)\.([a-zA-Z_]+)\.([a-zA-Z0-9_]+)\.([a-zA-Z_]+)(?:\.([a-zA-Z0-9_]+))?'
        )
        self.cache: Dict[str, Any] = {}
        self.variable_registry: Dict[str, Dict[str, Any]] = {}
        
    async def resolve(self, variable_path: str, nodes_data: Dict[str, Any]) -> Any:
        """변수 경로를 실제 값으로 변환
        
        Args:
            variable_path: 변수 경로 (예: preproduction.planning.node003.output.character_settings)
            nodes_data: 현재 워크플로우의 노드 데이터
            
        Returns:
            해당 변수의 실제 값
        """
        # 캐시 확인
        if variable_path in self.cache:
            return self.cache[variable_path]
            
        # 변수 경로 파싱
        match = self.variable_pattern.match(variable_path)
        if not match:
            raise ValueError(f"Invalid variable path: {variable_path}")
            
        section, node_type, node_id, data_type, item = match.groups()
        
        # 노드 데이터 찾기
        node_key = f"{section}.{node_type}.{node_id}"
        if node_key not in nodes_data:
            # 스토리지에서 로드 시도
            stored_data = await self._load_from_storage(node_id, data_type)
            if stored_data is None:
                raise KeyError(f"Node not found: {node_key}")
            value = stored_data
        else:
            node = nodes_data[node_key]
            value = await self._get_node_value(node, node_id, data_type)
            
        # 세부 항목 접근
        if item and isinstance(value, (dict, list)):
            if isinstance(value, dict) and item in value:
                value = value[item]
            elif isinstance(value, list) and item.isdigit():
                idx = int(item)
                if 0 <= idx < len(value):
                    value = value[idx]
            else:
                raise KeyError(f"Item not found: {item} in {variable_path}")
                
        # 캐시 저장
        self.cache[variable_path] = value
        return value
        
    async def _get_node_value(self, node: Dict[str, Any], node_id: str, data_type: str) -> Any:
        """노드에서 특정 데이터 타입의 값 가져오기"""
        if data_type == "output":
            return await node_storage.get_data(node_id, "output") or {}
        elif data_type == "files":
            return await node_storage.get_data(node_id, "files") or []
        elif data_type == "code":
            return await node_storage.get_code(node_id) or ""
        elif data_type == "status":
            return {
                "progress": node.get("data", {}).get("progress", 0),
                "is_running": node.get("data", {}).get("is_running", False),
                "is_deactivated": node.get("data", {}).get("is_deactivated", False)
            }
        elif data_type == "config":
            return node.get("data", {}).get("config", {})
        elif data_type == "tasks":
            tasks = node.get("data", {}).get("tasks", [])
            return {
                "items": tasks,
                "status_list": [task.get("status") for task in tasks],
                "count": len(tasks),
                "in_progress": sum(1 for task in tasks if task.get("status") == "○"),
                "not_modified": sum(1 for task in tasks if task.get("status") == "×"),
                "partially_modified": sum(1 for task in tasks if task.get("status") == "△")
            }
        elif data_type == "history":
            versions = await node_storage.list_versions(node_id)
            return {
                f"version_{v['version']}": await node_storage.get_code(node_id, v['version'])
                for v in versions
            }
        elif data_type == "metadata":
            return await node_storage.get_metadata(node_id) or {}
        else:
            raise ValueError(f"Unknown data type: {data_type}")
            
    async def _load_from_storage(self, node_id: str, data_type: str) -> Optional[Any]:
        """스토리지에서 데이터 로드"""
        try:
            if data_type == "output":
                return await node_storage.get_data(node_id, "output")
            elif data_type == "code":
                return await node_storage.get_code(node_id)
            elif data_type == "metadata":
                return await node_storage.get_metadata(node_id)
            else:
                return await node_storage.get_data(node_id, data_type)
        except:
            return None
            
    def register_variable(self, variable_path: str, metadata: Dict[str, Any]):
        """변수 등록 (자동완성용)"""
        self.variable_registry[variable_path] = {
            "path": variable_path,
            "description": metadata.get("description", ""),
            "type": metadata.get("type", "any"),
            "example": metadata.get("example", None),
            "last_updated": metadata.get("last_updated", None)
        }
        
    def get_available_variables(self, prefix: str = "") -> List[Dict[str, Any]]:
        """사용 가능한 변수 목록 반환 (자동완성용)"""
        variables = []
        for path, meta in self.variable_registry.items():
            if not prefix or path.startswith(prefix):
                variables.append({
                    "path": path,
                    "description": meta["description"],
                    "type": meta["type"]
                })
        return sorted(variables, key=lambda x: x["path"])
        
    def suggest_variables(self, partial_path: str) -> List[str]:
        """부분 경로에 대한 변수 제안"""
        suggestions = []
        parts = partial_path.split(".")
        
        # 레벨별 제안
        if len(parts) == 1:
            # 섹션 제안
            sections = set()
            for path in self.variable_registry:
                section = path.split(".")[0]
                if section.startswith(parts[0]):
                    sections.add(section)
            suggestions = sorted(sections)
            
        elif len(parts) == 2:
            # 노드 타입 제안
            node_types = set()
            for path in self.variable_registry:
                path_parts = path.split(".")
                if path_parts[0] == parts[0] and path_parts[1].startswith(parts[1]):
                    node_types.add(path_parts[1])
            suggestions = sorted(node_types)
            
        # ... 이하 레벨별 제안 로직
        
        return suggestions
        
    def validate_variable_path(self, variable_path: str) -> Tuple[bool, Optional[str]]:
        """변수 경로 유효성 검사"""
        match = self.variable_pattern.match(variable_path)
        if not match:
            return False, "Invalid variable path format"
            
        section, node_type, node_id, data_type, item = match.groups()
        
        # 데이터 타입 검증
        valid_data_types = ["output", "files", "code", "status", "config", "tasks", "history", "metadata"]
        if data_type not in valid_data_types:
            return False, f"Invalid data type: {data_type}"
            
        return True, None
        
    def extract_variables_from_code(self, code: str) -> Set[str]:
        """코드에서 사용된 글로벌 변수 추출"""
        variables = set()
        
        # 변수 패턴 찾기
        for match in self.variable_pattern.finditer(code):
            variables.add(match.group(0))
            
        # 딕셔너리 접근 패턴도 찾기 (예: globals['preproduction.planning.node003.output'])
        dict_pattern = re.compile(r"globals\[[\'\"]([a-zA-Z0-9_.]+)[\'\"]\]")
        for match in dict_pattern.finditer(code):
            if self.variable_pattern.match(match.group(1)):
                variables.add(match.group(1))
                
        return variables
        
    def clear_cache(self, variable_path: Optional[str] = None):
        """캐시 클리어"""
        if variable_path:
            self.cache.pop(variable_path, None)
        else:
            self.cache.clear()
            
    async def build_execution_context(self, code: str, nodes_data: Dict[str, Any]) -> Dict[str, Any]:
        """코드 실행을 위한 컨텍스트 구축"""
        context = {}
        
        # 코드에서 사용된 변수 추출
        variables = self.extract_variables_from_code(code)
        
        # 각 변수 해결
        for var_path in variables:
            try:
                value = await self.resolve(var_path, nodes_data)
                context[var_path] = value
            except Exception as e:
                # 에러 시 None으로 설정
                context[var_path] = None
                
        return context

# 싱글톤 인스턴스
variable_resolver = GlobalVariableResolver()