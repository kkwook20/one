# Related files: backend/main.py, backend/models.py
# Location: backend/storage.py

import os
import json
import hashlib
from datetime import datetime
from typing import Dict, Any, Optional, List
from models import Section

# Global state storage
sections_db: Dict[str, Section] = {}

def ensure_directories():
    """Create necessary directories"""
    os.makedirs("node-storage", exist_ok=True)
    os.makedirs("versions", exist_ok=True)
    os.makedirs("global-vars", exist_ok=True)

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
                        return os.listdir(f"node-storage/{node_id}")
                    elif data_type == "history":
                        return get_node_versions(node_id, limit=5)
                    elif data_type == "metadata":
                        data = load_node_data(node_id)
                        return data.get("metadata", {}) if data else {}
    return None

def create_global_vars_documentation():
    """Create documentation for global variables system"""
    doc_content = """# Global Variables System Documentation

## Variable Naming Convention
Format: {section}.{nodeType}.{nodeId}.{dataType}.{detail}

## Available Data Types:
- output: Node execution result JSON
- files: Generated file paths
- code: Current Python source
- status: Execution status, progress
- config: Node configuration values
- tasks: Task item list (with status)
- history: Version history (max 5)
- metadata: Execution time, model used, token usage

## Usage Examples:

### In Python Code:
```python
# Get character settings from another section
character_data = get_global_var("preproduction.planning.node003.output.character_settings")

# Check task status of another node
task_status = get_global_var("section2.worker.node005.tasks.status_list")

# Access historical version
old_code = get_global_var("section1.supervisor.node001.history.version_3")

# Get connected node outputs
connected_outputs = get_connected_outputs()
```

### Special Functions:
- get_connected_outputs(): Get all connected node outputs
- get_section_outputs(section_name): Get all outputs from a section
- get_supervised_nodes(): For supervisor nodes, get supervised node list

## File Structure:
- node-storage/{nodeId}/data.json - Current node data
- node-storage/{nodeId}/version_*.json - Version history
- global-vars/index.json - Global variable index
"""
    
    with open("global-vars-documentation.txt", "w", encoding="utf-8") as f:
        f.write(doc_content)