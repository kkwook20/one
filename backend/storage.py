# backend/storage.py - 중복 제거 및 정리된 버전

import os
import json
import hashlib
from datetime import datetime
from typing import Dict, Any, Optional, List
from models import Section

# Global state storage - main.py와 공유
sections_db: Dict[str, Section] = {}

def ensure_directories():
    """Create necessary directories"""
    os.makedirs("node-storage", exist_ok=True)
    os.makedirs("versions", exist_ok=True)
    os.makedirs("global-vars", exist_ok=True)
    os.makedirs("data", exist_ok=True)

def save_node_data(node_id: str, data: Dict[str, Any]):
    """Save node data to file system"""
    node_dir = f"node-storage/{node_id}"
    os.makedirs(node_dir, exist_ok=True)
    
    # Save main data
    with open(f"{node_dir}/data.json", "w") as f:
        json.dump(data, f, indent=2)
    
    # Save version
    version_id = datetime.now().isoformat()
    version_data = {
        "id": version_id,
        "timestamp": version_id,
        "data": data,
        "metadata": {
            "inputHash": hashlib.md5(json.dumps(data.get("inputs", {})).encode()).hexdigest(),
            "outputHash": hashlib.md5(json.dumps(data.get("output", {})).encode()).hexdigest(),
            "parameters": data.get("parameters", {}),
            "modelVersion": data.get("model", "none"),
            "modifiedBy": data.get("modifiedBy", "system")
        }
    }
    
    with open(f"{node_dir}/version_{version_id.replace(':', '-')}.json", "w") as f:
        json.dump(version_data, f, indent=2)

def load_node_data(node_id: str) -> Optional[Dict[str, Any]]:
    """Load node data from file system"""
    try:
        with open(f"node-storage/{node_id}/data.json", "r") as f:
            return json.load(f)
    except:
        return None

def get_node_versions(node_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Get node version history"""
    versions = []
    node_dir = f"node-storage/{node_id}"
    
    if os.path.exists(node_dir):
        version_files = [f for f in os.listdir(node_dir) if f.startswith("version_")]
        for file in sorted(version_files, reverse=True)[:limit]:
            with open(f"{node_dir}/{file}", "r") as f:
                versions.append(json.load(f))
    
    return versions

def get_global_var(var_path: str) -> Any:
    """Get global variable value"""
    # Parse path: {section}.{nodeType}.{nodeId}.{dataType}.{detail}
    parts = var_path.split(".")
    if len(parts) < 4:
        return None
    
    section_name, node_type, node_id, data_type = parts[:4]
    detail = parts[4] if len(parts) > 4 else None
    
    # Find node
    for section in sections_db.values():
        if section.name.lower() == section_name.lower():
            for node in section.nodes:
                if node.id == node_id and node.type == node_type:
                    if data_type == "output":
                        return node.output if not detail else node.output.get(detail)
                    elif data_type == "code":
                        return node.code
                    elif data_type == "status":
                        return {"running": node.isRunning, "deactivated": node.isDeactivated}
                    elif data_type == "tasks":
                        return [t.dict() for t in node.tasks] if node.tasks else []
                    elif data_type == "files":
                        node_dir = f"node-storage/{node_id}"
                        return os.listdir(node_dir) if os.path.exists(node_dir) else []
                    elif data_type == "history":
                        return get_node_versions(node_id, limit=5)
                    elif data_type == "metadata":
                        data = load_node_data(node_id)
                        return data.get("metadata", {}) if data else {}
    return None

def get_section_outputs(section_name: str) -> Dict[str, Any]:
    """Get all outputs from a section"""
    outputs = {}
    for section in sections_db.values():
        if section.name.lower() == section_name.lower():
            for node in section.nodes:
                if node.output:
                    outputs[node.label] = node.output
            break
    return outputs