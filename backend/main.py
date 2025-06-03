# Related files: frontend/src/App.tsx, docker-compose.yml, global-vars-documentation.txt
# Location: backend/main.py

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import json
import os
import hashlib
import subprocess
import sys
from datetime import datetime
from typing import Dict, List, Optional, Any, Set
from pydantic import BaseModel, Field, ConfigDict
import aiofiles
import httpx
from pathlib import Path
import docker
import shutil
import tempfile
import traceback
import yaml
import xml.etree.ElementTree as ET

# Models
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
    supervisedNodes: Optional[List[str]] = None  # For supervisor nodes
    updateHistory: Optional[List[Dict[str, Any]]] = None
    aiScore: Optional[float] = None

class Connection(BaseModel):
    from_node: str = Field(default=None, alias='from')
    to: str

    model_config = ConfigDict(
        populate_by_name=True
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

# Initialize
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    ensure_directories()
    start_vector_db()
    create_global_vars_documentation()
    yield
    # Shutdown
    stop_vector_db()

app = FastAPI(lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
sections_db: Dict[str, Section] = {}
node_processes: Dict[str, asyncio.Task] = {}
websocket_connections: Dict[str, WebSocket] = {}
docker_client = None

def ensure_directories():
    """Create necessary directories"""
    os.makedirs("node-storage", exist_ok=True)
    os.makedirs("versions", exist_ok=True)
    os.makedirs("global-vars", exist_ok=True)

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
inputs = get_global_var("animation.worker.rigging_node.output")
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

def start_vector_db():
    """Start Vector DB Docker container"""
    global docker_client
    try:
        docker_client = docker.from_env()
        # Check if container exists
        try:
            container = docker_client.containers.get("vector-db")
            if container.status != "running":
                container.start()
        except docker.errors.NotFound:
            # Create and start new container
            docker_client.containers.run(
                "qdrant/qdrant",
                name="vector-db",
                ports={'6333/tcp': 6333},
                detach=True,
                remove=False
            )
    except Exception as e:
        print(f"Failed to start Vector DB: {e}")

def stop_vector_db():
    """Stop Vector DB Docker container"""
    global docker_client
    if docker_client:
        try:
            container = docker_client.containers.get("vector-db")
            container.stop()
        except:
            pass

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

def get_connected_outputs(node: Node, section: Section, all_sections: List[Section]) -> Dict[str, Any]:
    """Get outputs from all connected nodes"""
    if not node.connectedFrom:
        return {}
    
    outputs = {}
    for conn_id in node.connectedFrom:
        for s in all_sections:
            for n in s.nodes:
                if n.id == conn_id:
                    outputs[n.label] = n.output
                    break
    return outputs

def get_node_execution_order(section: Section) -> List[Node]:
    """Get nodes in execution order (left to right, considering connections)"""
    # Sort by x position first
    sorted_nodes = sorted(section.nodes, key=lambda n: n.position.x)
    
    # Build dependency graph
    dependencies: Dict[str, Set[str]] = {}
    for node in section.nodes:
        dependencies[node.id] = set(node.connectedFrom) if node.connectedFrom else set()
    
    # Topological sort
    visited = set()
    result = []
    
    def visit(node_id: str):
        if node_id in visited:
            return
        visited.add(node_id)
        for dep_id in dependencies.get(node_id, set()):
            visit(dep_id)
        node = next((n for n in section.nodes if n.id == node_id), None)
        if node and not node.isDeactivated:
            result.append(node)
    
    for node in sorted_nodes:
        visit(node.id)
    
    return result

async def execute_python_code(node_id: str, code: str, inputs: Dict[str, Any] = None, section_id: str = None) -> Dict[str, Any]:
    """Execute Python code in isolated environment"""
    # Create temporary directory for execution
    with tempfile.TemporaryDirectory() as temp_dir:
        # Write code to file
        code_file = os.path.join(temp_dir, "node_code.py")
        
        # Inject global variable access and inputs
        injected_code = f"""
import json
import sys
import os

# Global variable access function
def get_global_var(var_path):
    # Implementation would call back to the API
    return {json.dumps(get_global_var(var_path))}

def get_connected_outputs():
    return {json.dumps(inputs or {})}

# Inputs
inputs = {json.dumps(inputs or {})}

# User code
{code}

# Output results
if 'output' in locals():
    print(json.dumps({{"success": True, "output": output}}))
else:
    print(json.dumps({{"success": False, "error": "No output variable defined"}}))
"""
        
        with open(code_file, "w") as f:
            f.write(injected_code)
        
        # Execute code
        try:
            result = subprocess.run(
                [sys.executable, code_file],
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutes timeout
                cwd=temp_dir
            )
            
            if result.returncode == 0:
                try:
                    return json.loads(result.stdout)
                except:
                    return {"success": True, "output": result.stdout}
            else:
                return {"success": False, "error": result.stderr}
                
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Code execution timeout"}
        except Exception as e:
            return {"success": False, "error": str(e)}

async def execute_with_lm_studio(code: str, model: str, task_description: str) -> Dict[str, Any]:
    """Execute code modification using LM Studio"""
    if model == "none" or not model:
        return {"code": code, "score": 0}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:1234/v1/completions",
                json={
                    "model": model,
                    "prompt": f"""Task: {task_description}

Current code:
```python
{code}
```

Please provide:
1. Modified code
2. Quality score (0-100)
3. Brief explanation

Format:
CODE:
[modified code here]
SCORE: [number]
EXPLANATION: [brief explanation]
""",
                    "max_tokens": 2000,
                    "temperature": 0.7
                },
                timeout=60.0
            )
            
            if response.status_code == 200:
                result = response.json()
                text = result["choices"][0]["text"].strip()
                
                # Parse response
                code_match = text.find("CODE:")
                score_match = text.find("SCORE:")
                
                if code_match != -1 and score_match != -1:
                    new_code = text[code_match+5:score_match].strip()
                    score_text = text[score_match+6:].split("\n")[0].strip()
                    try:
                        score = float(score_text)
                    except:
                        score = 50
                    
                    return {"code": new_code, "score": score}
                
                return {"code": code, "score": 0}
            else:
                return {"code": code, "score": 0}
    except:
        return {"code": code, "score": 0}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    websocket_connections[client_id] = websocket
    
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming messages if needed
    except WebSocketDisconnect:
        del websocket_connections[client_id]

async def send_progress(node_id: str, progress: float, message: str = ""):
    """Send progress update to connected clients"""
    data = {
        "type": "progress",
        "nodeId": node_id,
        "progress": progress,
        "message": message
    }
    
    for ws in websocket_connections.values():
        try:
            await ws.send_json(data)
        except:
            pass

async def send_update(update_type: str, data: Any):
    """Send general update to connected clients"""
    message = {
        "type": update_type,
        "data": data
    }
    
    for ws in websocket_connections.values():
        try:
            await ws.send_json(message)
        except:
            pass

# API Endpoints
@app.get("/sections")
async def get_sections():
    return list(sections_db.values())

@app.get("/sections/{section_id}")
async def get_section(section_id: str):
    if section_id not in sections_db:
        raise HTTPException(status_code=404, detail="Section not found")
    return sections_db[section_id]

@app.post("/sections")
async def create_section(section: Section):
    sections_db[section.id] = section
    return section

@app.put("/sections/{section_id}")
async def update_section(section_id: str, section: Section):
    sections_db[section_id] = section
    await send_update("section_updated", {"sectionId": section_id})
    return section

@app.post("/execute")
async def execute_node(request: ExecuteRequest):
    """Execute node code"""
    node_id = request.nodeId
    
    # Check if already running
    if node_id in node_processes and not node_processes[node_id].done():
        raise HTTPException(status_code=400, detail="Node already running")
    
    # Get section and node
    section = sections_db.get(request.sectionId)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    node = next((n for n in section.nodes if n.id == node_id), None)
    if not node or node.isDeactivated:
        raise HTTPException(status_code=400, detail="Node not found or deactivated")
    
    # Create execution task
    async def run_node():
        try:
            await send_progress(node_id, 0.1, "Starting execution...")
            
            # Get connected outputs
            all_sections = list(sections_db.values())
            connected_outputs = get_connected_outputs(node, section, all_sections)
            
            # Merge with provided inputs
            final_inputs = {**connected_outputs, **(request.inputs or {})}
            
            # Execute code
            result = await execute_python_code(node_id, request.code, final_inputs, request.sectionId)
            
            await send_progress(node_id, 0.9, "Execution complete")
            
            # Update node with output
            if result["success"]:
                node.output = result["output"]
                
                # Add to update history
                if not node.updateHistory:
                    node.updateHistory = []
                node.updateHistory.append({
                    "timestamp": datetime.now().isoformat(),
                    "type": "execution",
                    "output": result["output"]
                })
                
                # Keep only last 10 updates
                node.updateHistory = node.updateHistory[-10:]
                
                # Save results
                save_node_data(node_id, {
                    "code": request.code,
                    "inputs": final_inputs,
                    "output": result["output"],
                    "timestamp": datetime.now().isoformat()
                })
            
            await send_progress(node_id, 1.0, "Done")
            await send_update("node_output_updated", {"nodeId": node_id, "output": result.get("output")})
            
            return result
            
        except Exception as e:
            await send_progress(node_id, -1, f"Error: {str(e)}")
            raise
        finally:
            if node_id in node_processes:
                del node_processes[node_id]
    
    # Start execution
    task = asyncio.create_task(run_node())
    node_processes[node_id] = task
    
    return {"status": "started", "nodeId": node_id}

@app.post("/stop/{node_id}")
async def stop_node(node_id: str):
    """Stop node execution"""
    if node_id in node_processes:
        node_processes[node_id].cancel()
        del node_processes[node_id]
        await send_progress(node_id, -1, "Stopped by user")
        return {"status": "stopped"}
    return {"status": "not_running"}

@app.post("/execute-flow/{section_id}")
async def execute_flow(section_id: str):
    """Execute all nodes in a section in order"""
    section = sections_db.get(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Get execution order
    execution_order = get_node_execution_order(section)
    
    results = []
    for node in execution_order:
        if node.type in ['worker', 'supervisor', 'planner'] and node.code:
            # Execute node
            all_sections = list(sections_db.values())
            connected_outputs = get_connected_outputs(node, section, all_sections)
            
            result = await execute_python_code(node.id, node.code, connected_outputs, section_id)
            if result["success"]:
                node.output = result["output"]
            
            results.append({
                "nodeId": node.id,
                "label": node.label,
                "success": result["success"],
                "output": result.get("output"),
                "error": result.get("error")
            })
    
    return {"results": results, "executionOrder": [n.id for n in execution_order]}

@app.post("/supervisor/execute")
async def execute_supervisor(section_id: str, supervisor_id: str, target_node_id: str):
    """Execute supervisor node to modify other node's code"""
    # Get nodes
    section = sections_db.get(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    supervisor = next((n for n in section.nodes if n.id == supervisor_id), None)
    target = next((n for n in section.nodes if n.id == target_node_id), None)
    
    if not supervisor or not target:
        raise HTTPException(status_code=404, detail="Node not found")
    
    # Get task description from supervisor's tasks
    pending_tasks = [t for t in supervisor.tasks if t.status == "pending"] if supervisor.tasks else []
    task_desc = " ".join([t.text for t in pending_tasks])
    
    # Store original code for comparison
    original_code = target.code or ""
    
    # Execute modification
    result = await execute_with_lm_studio(
        original_code,
        supervisor.model or "none",
        task_desc
    )
    
    # Create modification entry
    modification_entry = {
        "id": f"mod-{datetime.now().timestamp()}",
        "timestamp": datetime.now().isoformat(),
        "targetNodeId": target_node_id,
        "targetNodeLabel": target.label,
        "originalCode": original_code,
        "modifiedCode": result["code"],
        "changes": _calculate_code_diff(original_code, result["code"]),
        "score": result["score"],
        "tasks": [{"id": t.id, "text": t.text} for t in pending_tasks],
        "status": "pending"  # pending/accepted/rejected
    }
    
    # Store modification history in supervisor
    if not hasattr(supervisor, "modificationHistory"):
        supervisor.modificationHistory = []
    supervisor.modificationHistory.append(modification_entry)
    
    # Update target node
    target.code = result["code"]
    target.aiScore = result["score"]
    
    # Update supervisor's supervised nodes list
    if not supervisor.supervisedNodes:
        supervisor.supervisedNodes = []
    if target_node_id not in supervisor.supervisedNodes:
        supervisor.supervisedNodes.append(target_node_id)
    
    # Add to update history
    if not target.updateHistory:
        target.updateHistory = []
    target.updateHistory.append({
        "timestamp": datetime.now().isoformat(),
        "type": "supervised",
        "by": supervisor_id,
        "score": result["score"],
        "modificationId": modification_entry["id"]
    })
    
    # Mark tasks as completed
    for task in pending_tasks:
        task.status = "partial"
    
    # Save version
    save_node_data(target_node_id, {
        "code": result["code"],
        "modifiedBy": supervisor_id,
        "aiScore": result["score"],
        "timestamp": datetime.now().isoformat()
    })
    
    await send_update("node_supervised", {
        "targetId": target_node_id,
        "supervisorId": supervisor_id,
        "score": result["score"],
        "modificationId": modification_entry["id"]
    })
    
    return {
        "success": True, 
        "modifiedCode": result["code"], 
        "score": result["score"],
        "modificationId": modification_entry["id"]
    }

def _calculate_code_diff(original: str, modified: str) -> Dict[str, Any]:
    """Calculate code differences"""
    original_lines = original.split('\n')
    modified_lines = modified.split('\n')
    
    added = len(modified_lines) - len(original_lines)
    # Simple diff summary - in production, use difflib
    return {
        "linesAdded": max(0, added),
        "linesRemoved": max(0, -added),
        "totalChanges": abs(added)
    }

@app.post("/node/{node_id}/deactivate")
async def toggle_node_deactivation(node_id: str, section_id: str):
    """Toggle node deactivation status"""
    section = sections_db.get(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    node = next((n for n in section.nodes if n.id == node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    node.isDeactivated = not node.isDeactivated
    await send_update("node_deactivated", {"nodeId": node_id, "deactivated": node.isDeactivated})
    
    return {"deactivated": node.isDeactivated}

@app.get("/global-var/{var_path:path}")
async def get_global_variable(var_path: str):
    """Get global variable value"""
    value = get_global_var(var_path)
    if value is None:
        raise HTTPException(status_code=404, detail="Variable not found")
    return {"path": var_path, "value": value}

@app.get("/models")
async def get_available_models():
    """Get available LM Studio models"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:1234/v1/models")
            if response.status_code == 200:
                return response.json()
    except:
        pass
    
    return {"data": [
        {"id": "llama-3.1-8b"},
        {"id": "mistral-7b"},
        {"id": "codellama-13b"}
    ]}

@app.get("/versions/{node_id}")
async def get_node_versions(node_id: str, limit: int = 5):
    """Get node version history"""
    versions = []
    node_dir = f"node-storage/{node_id}"
    
    if os.path.exists(node_dir):
        version_files = [f for f in os.listdir(node_dir) if f.startswith("version_")]
        for file in sorted(version_files, reverse=True)[:limit]:
            with open(f"{node_dir}/{file}", "r") as f:
                versions.append(json.load(f))
    
    return versions

@app.post("/restore-version")
async def restore_version(request: RestoreVersionRequest):
    """Restore node to a previous version"""
    version_file = f"node-storage/{request.nodeId}/version_{request.versionId.replace(':', '-')}.json"
    
    if not os.path.exists(version_file):
        raise HTTPException(status_code=404, detail="Version not found")
    
    with open(version_file, "r") as f:
        version_data = json.load(f)
    
    # Find and update node
    for section in sections_db.values():
        for node in section.nodes:
            if node.id == request.nodeId:
                # Restore code and output
                if "code" in version_data["data"]:
                    node.code = version_data["data"]["code"]
                if "output" in version_data["data"]:
                    node.output = version_data["data"]["output"]
                
                # Save as new version
                save_node_data(request.nodeId, {
                    "code": node.code,
                    "output": node.output,
                    "restoredFrom": request.versionId,
                    "timestamp": datetime.now().isoformat()
                })
                
                await send_update("version_restored", {
                    "nodeId": request.nodeId,
                    "versionId": request.versionId
                })
                
                return {"success": True}
    
    raise HTTPException(status_code=404, detail="Node not found")

@app.post("/export-output/{section_id}")
async def export_section_output(section_id: str):
    """Export section output in configured format"""
    section = sections_db.get(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Collect all node outputs
    outputs = {}
    for node in section.nodes:
        if node.output and not node.isDeactivated:
            outputs[node.label] = node.output
    
    # Format based on configuration
    format_type = section.outputConfig.format if section.outputConfig else "json"
    
    if format_type == "json":
        return outputs
    elif format_type == "yaml":
        import io
        stream = io.StringIO()
        yaml.dump(outputs, stream)
        return {"yaml": stream.getvalue()}
    elif format_type == "xml":
        root = ET.Element("output")
        for key, value in outputs.items():
            node_elem = ET.SubElement(root, "node", name=key)
            node_elem.text = json.dumps(value)
        return {"xml": ET.tostring(root, encoding="unicode")}
    
    return outputs

@app.post("/supervisor/accept-modification")
async def accept_modification(supervisor_id: str, modification_id: str):
    """Accept a supervisor's modification"""
    for section in sections_db.values():
        supervisor = next((n for n in section.nodes if n.id == supervisor_id), None)
        if supervisor and hasattr(supervisor, "modificationHistory"):
            mod = next((m for m in supervisor.modificationHistory if m["id"] == modification_id), None)
            if mod:
                mod["status"] = "accepted"
                await send_update("modification_accepted", {
                    "supervisorId": supervisor_id,
                    "modificationId": modification_id
                })
                return {"success": True}
    
    raise HTTPException(status_code=404, detail="Modification not found")

@app.post("/supervisor/reject-modification")
async def reject_modification(supervisor_id: str, modification_id: str, target_node_id: str):
    """Reject a supervisor's modification and restore original code"""
    for section in sections_db.values():
        supervisor = next((n for n in section.nodes if n.id == supervisor_id), None)
        target = next((n for n in section.nodes if n.id == target_node_id), None)
        
        if supervisor and target and hasattr(supervisor, "modificationHistory"):
            mod = next((m for m in supervisor.modificationHistory if m["id"] == modification_id), None)
            if mod:
                # Restore original code
                target.code = mod["originalCode"]
                mod["status"] = "rejected"
                
                # Update target's history
                if target.updateHistory:
                    target.updateHistory.append({
                        "timestamp": datetime.now().isoformat(),
                        "type": "reverted",
                        "by": "user",
                        "modificationId": modification_id
                    })
                
                await send_update("modification_rejected", {
                    "supervisorId": supervisor_id,
                    "modificationId": modification_id,
                    "targetNodeId": target_node_id
                })
                
                return {"success": True}
    
    raise HTTPException(status_code=404, detail="Modification not found")

@app.post("/planner/evaluate-section")
async def evaluate_section(section_id: str, planner_id: str):
    """Execute planner to evaluate entire section"""
    section = sections_db.get(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    planner = next((n for n in section.nodes if n.id == planner_id), None)
    if not planner:
        raise HTTPException(status_code=404, detail="Planner not found")
    
    # Collect section information
    section_info = {
        "nodes": [
            {
                "id": n.id,
                "type": n.type,
                "label": n.label,
                "hasCode": bool(n.code),
                "hasOutput": bool(n.output),
                "aiScore": getattr(n, "aiScore", None),
                "taskCount": len(n.tasks) if n.tasks else 0,
                "pendingTasks": len([t for t in n.tasks if t.status == "pending"]) if n.tasks else 0
            }
            for n in section.nodes
        ],
        "connections": len(connections)  # Simplified
    }
    
    # Generate evaluation using AI
    evaluation_prompt = f"""Evaluate this production pipeline section:
Section: {section.name}
Nodes: {json.dumps(section_info, indent=2)}

Provide evaluation for each node including:
1. Current status assessment
2. Improvements needed
3. Priority level (high/medium/low)
4. Specific recommendations
"""
    
    if planner.model and planner.model != "none":
        # Use AI for evaluation
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://localhost:1234/v1/completions",
                    json={
                        "model": planner.model,
                        "prompt": evaluation_prompt,
                        "max_tokens": 2000,
                        "temperature": 0.7
                    },
                    timeout=60.0
                )
                
                if response.status_code == 200:
                    ai_evaluation = response.json()["choices"][0]["text"].strip()
                else:
                    ai_evaluation = "AI evaluation failed"
        except:
            ai_evaluation = "AI service unavailable"
    else:
        ai_evaluation = "No AI model configured"
    
    # Create evaluation report
    evaluation_report = {
        "id": f"eval-{datetime.now().timestamp()}",
        "timestamp": datetime.now().isoformat(),
        "sectionId": section_id,
        "plannerId": planner_id,
        "nodeEvaluations": [],
        "overallAssessment": ai_evaluation,
        "status": "pending"  # pending/accepted/rejected
    }
    
    # Generate individual node evaluations
    for node_info in section_info["nodes"]:
        node_eval = {
            "nodeId": node_info["id"],
            "nodeLabel": node_info["label"],
            "status": "needs_improvement" if node_info["pendingTasks"] > 0 else "good",
            "priority": "high" if node_info["pendingTasks"] > 3 else "medium",
            "recommendations": [
                f"Complete {node_info['pendingTasks']} pending tasks" if node_info["pendingTasks"] > 0 else "No immediate action needed"
            ],
            "score": node_info["aiScore"] or 0
        }
        evaluation_report["nodeEvaluations"].append(node_eval)
    
    # Store in planner
    if not hasattr(planner, "evaluationHistory"):
        planner.evaluationHistory = []
    planner.evaluationHistory.append(evaluation_report)
    planner.output = evaluation_report
    
    await send_update("section_evaluated", {
        "sectionId": section_id,
        "plannerId": planner_id,
        "evaluationId": evaluation_report["id"]
    })
    
    return evaluation_report

@app.post("/planner/accept-evaluation")
async def accept_evaluation(planner_id: str, evaluation_id: str):
    """Accept planner's evaluation"""
    for section in sections_db.values():
        planner = next((n for n in section.nodes if n.id == planner_id), None)
        if planner and hasattr(planner, "evaluationHistory"):
            evaluation = next((e for e in planner.evaluationHistory if e["id"] == evaluation_id), None)
            if evaluation:
                evaluation["status"] = "accepted"
                
                # Apply recommendations to nodes
                for node_eval in evaluation["nodeEvaluations"]:
                    target_node = next((n for n in section.nodes if n.id == node_eval["nodeId"]), None)
                    if target_node and not hasattr(target_node, "plannerRecommendations"):
                        target_node.plannerRecommendations = []
                    if target_node:
                        target_node.plannerRecommendations.extend(node_eval["recommendations"])
                
                await send_update("evaluation_accepted", {
                    "plannerId": planner_id,
                    "evaluationId": evaluation_id
                })
                return {"success": True}
    
    raise HTTPException(status_code=404, detail="Evaluation not found")

@app.post("/planner/reject-evaluation")
async def reject_evaluation(planner_id: str, evaluation_id: str):
    """Reject planner's evaluation"""
    for section in sections_db.values():
        planner = next((n for n in section.nodes if n.id == planner_id), None)
        if planner and hasattr(planner, "evaluationHistory"):
            evaluation = next((e for e in planner.evaluationHistory if e["id"] == evaluation_id), None)
            if evaluation:
                evaluation["status"] = "rejected"
                
                await send_update("evaluation_rejected", {
                    "plannerId": planner_id,
                    "evaluationId": evaluation_id
                })
                return {"success": True}
    
    raise HTTPException(status_code=404, detail="Evaluation not found")