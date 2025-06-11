# backend/routers/oneai.py - One AI 시스템 라우터

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Body
from typing import Dict, Optional, List
import asyncio
import json
import os
import time
import random
from datetime import datetime
import httpx
from pathlib import Path
from pydantic import BaseModel
import traceback

# Local imports
from models import Section, Node, ExecuteRequest, Position, SectionConfig, OutputConfig
from storage import save_node_data, sections_db
from execution import execute_python_code, get_connected_outputs
from constants import GROUPS

# Create router
router = APIRouter()

# WebSocket connections for One AI
active_connections: Dict[str, WebSocket] = {}
connection_tasks: Dict[str, asyncio.Task] = {}

# Data file for One AI sections
SECTIONS_DATA_FILE = "data/oneai_sections_data.json"

# State management
has_changes = False
has_changes_lock = asyncio.Lock()
is_saving = False
save_lock = asyncio.Lock()

# LM Studio connections
lm_studio_connections: Dict[str, Dict] = {}

# FileNode model for project file exploration
class FileNode(BaseModel):
    name: str
    path: str
    type: str  # 'file' or 'directory'
    size: Optional[int] = None
    modified: Optional[str] = None
    children: Optional[List['FileNode']] = None

FileNode.model_rebuild()

async def mark_changes():
    """Mark that changes have been made"""
    global has_changes
    async with has_changes_lock:
        has_changes = True

def mark_changes_sync():
    """Mark changes synchronously"""
    global has_changes
    has_changes = True

async def save_sections_to_file():
    """Save sections data to file"""
    global has_changes, is_saving
    
    async with save_lock:
        if is_saving:
            print("[OneAI] Already saving, skipping...")
            return False
        is_saving = True
    
    try:
        print("[OneAI] Starting save operation...")
        os.makedirs(os.path.dirname(SECTIONS_DATA_FILE), exist_ok=True)
        
        # Serialize data
        data = {}
        for section_id, section in sections_db.items():
            try:
                section_dict = section.model_dump(mode='json', exclude_none=True)
                data[section_id] = section_dict
            except Exception as e:
                print(f"[OneAI] Error serializing section {section_id}: {e}")
                continue
        
        # Convert to JSON
        try:
            json_str = json.dumps(data, indent=2, ensure_ascii=False)
            print(f"[OneAI] Serialized {len(data)} sections")
        except Exception as e:
            print(f"[OneAI] JSON serialization error: {e}")
            return False
        
        # Save to temporary file first
        temp_file = f"{SECTIONS_DATA_FILE}.tmp"
        
        try:
            with open(temp_file, 'w', encoding='utf-8') as f:
                f.write(json_str)
            
            # Atomic file replacement
            import platform
            if platform.system() == 'Windows':
                if os.path.exists(SECTIONS_DATA_FILE):
                    backup_file = f"{SECTIONS_DATA_FILE}.backup"
                    if os.path.exists(backup_file):
                        os.remove(backup_file)
                    os.rename(SECTIONS_DATA_FILE, backup_file)
                os.rename(temp_file, SECTIONS_DATA_FILE)
            else:
                os.replace(temp_file, SECTIONS_DATA_FILE)
            
            # Reset changes flag
            async with has_changes_lock:
                has_changes = False
            
            print(f"[OneAI] Successfully saved {len(data)} sections")
            return True
            
        except Exception as e:
            print(f"[OneAI] File operation error: {e}")
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except:
                    pass
            return False
            
    except Exception as e:
        print(f"[OneAI] Unexpected error: {e}")
        traceback.print_exc()
        return False
    finally:
        async with save_lock:
            is_saving = False
        print("[OneAI] Save operation finished")

def load_sections_from_file():
    """Load sections data from file"""
    if os.path.exists(SECTIONS_DATA_FILE):
        try:
            with open(SECTIONS_DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            sections_db.clear()
            for section_id, section_data in data.items():
                # Process nodes to convert Position objects
                nodes = []
                for node_data in section_data.get('nodes', []):
                    if 'position' in node_data and isinstance(node_data['position'], dict):
                        pos_dict = node_data['position']
                        if 'x' in pos_dict and 'y' in pos_dict:
                            node_data['position'] = Position(
                                x=float(pos_dict['x']),
                                y=float(pos_dict['y'])
                            )
                        else:
                            # Set default position based on node type
                            if node_data['type'] == 'input':
                                node_data['position'] = Position(x=100, y=200)
                            elif node_data['type'] == 'output':
                                node_data['position'] = Position(x=700, y=200)
                            else:
                                node_data['position'] = Position(x=400, y=200)
                    
                    nodes.append(Node(**node_data))
                
                section_data['nodes'] = nodes
                
                # Convert inputConfig and outputConfig
                if 'inputConfig' in section_data and section_data['inputConfig']:
                    section_data['inputConfig'] = SectionConfig(**section_data['inputConfig'])
                
                if 'outputConfig' in section_data and section_data['outputConfig']:
                    section_data['outputConfig'] = OutputConfig(**section_data['outputConfig'])
                
                sections_db[section_id] = Section(**section_data)
            
            print(f"[OneAI] Loaded {len(sections_db)} sections")
            return True
        except Exception as e:
            print(f"[OneAI] Error loading sections: {e}")
            traceback.print_exc()
            return False
    return False

def create_default_sections():
    """Create default sections for One AI"""
    for group, sections in GROUPS.items():
        for idx, section_name in enumerate(sections):
            section_id = f"{group}-{section_name.lower().replace(' ', '-')}"
            if section_id not in sections_db:
                sections_db[section_id] = Section(
                    id=section_id,
                    name=section_name,
                    group=group,
                    nodes=[
                        Node(
                            id=f"input-{section_id}",
                            type="input",
                            label="Input",
                            position=Position(x=100, y=200),
                            isRunning=False
                        ),
                        Node(
                            id=f"output-{section_id}",
                            type="output", 
                            label="Output",
                            position=Position(x=700, y=200),
                            isRunning=False,
                            connectedFrom=[]
                        )
                    ]
                )
    mark_changes_sync()

async def initialize():
    """Initialize One AI system"""
    print("[OneAI] Initializing...")
    
    # Load saved data or create defaults
    if not load_sections_from_file():
        print("[OneAI] Creating default sections...")
        create_default_sections()
        await save_sections_to_file()
    
    # Start periodic save task
    asyncio.create_task(periodic_save())
    
    print("[OneAI] Initialized successfully")

async def shutdown():
    """Shutdown One AI system"""
    print("[OneAI] Shutting down...")
    
    # Save any pending changes
    await save_sections_to_file()
    
    # Close all WebSocket connections
    for client_id in list(active_connections.keys()):
        try:
            await active_connections[client_id].close()
        except:
            pass
    
    print("[OneAI] Shut down successfully")

async def periodic_save():
    """Periodically save changes every 10 minutes"""
    save_interval = 600  # 10 minutes
    retry_interval = 60  # 1 minute retry
    
    print("[OneAI] Starting periodic save task...")
    
    while True:
        try:
            await asyncio.sleep(save_interval)
            
            # Check if there are changes
            should_save = False
            async with has_changes_lock:
                should_save = has_changes
                print(f"[OneAI] Periodic check - has_changes: {has_changes}")
            
            if should_save:
                print("[OneAI] Starting auto-save...")
                start_time = time.time()
                
                try:
                    success = await save_sections_to_file()
                    elapsed = time.time() - start_time
                    
                    if success:
                        print(f"[OneAI] Auto-save completed in {elapsed:.2f} seconds")
                    else:
                        print(f"[OneAI] Auto-save failed after {elapsed:.2f} seconds")
                        await asyncio.sleep(retry_interval)
                        continue
                        
                except Exception as save_error:
                    print(f"[OneAI] Save error: {save_error}")
                    traceback.print_exc()
                    await asyncio.sleep(retry_interval)
                    continue
                    
            else:
                print("[OneAI] No changes to save")
                
        except asyncio.CancelledError:
            print("[OneAI] Auto-save task cancelled")
            async with has_changes_lock:
                if has_changes:
                    print("[OneAI] Final save before exit...")
                    await save_sections_to_file()
            break
            
        except Exception as e:
            print(f"[OneAI] Unexpected error in periodic save: {e}")
            traceback.print_exc()
            await asyncio.sleep(retry_interval)
    
    print("[OneAI] Periodic save task ended")

async def broadcast_message(message: dict):
    """Broadcast message to all connected clients"""
    disconnected = []
    for client_id, ws in active_connections.items():
        try:
            await ws.send_json(message)
        except Exception as e:
            print(f"[OneAI] Failed to send to {client_id}: {e}")
            disconnected.append(client_id)
    
    # Clean up disconnected clients
    for client_id in disconnected:
        if client_id in active_connections:
            del active_connections[client_id]
        if client_id in connection_tasks:
            connection_tasks[client_id].cancel()
            del connection_tasks[client_id]

# WebSocket endpoint
@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    active_connections[client_id] = websocket
    
    # Heartbeat task
    async def heartbeat():
        try:
            while client_id in active_connections:
                await websocket.send_json({"type": "ping"})
                await asyncio.sleep(30)
        except:
            pass
    
    heartbeat_task = asyncio.create_task(heartbeat())
    connection_tasks[client_id] = heartbeat_task
    
    try:
        while True:
            message = await websocket.receive_text()
            if message == "pong":
                continue
            
            # Handle other messages
            try:
                data = json.loads(message)
                if data.get("type") == "heartbeat":
                    await websocket.send_json({"type": "heartbeat_ack"})
            except:
                pass
                
    except WebSocketDisconnect:
        print(f"[OneAI] Client {client_id} disconnected")
    except Exception as e:
        print(f"[OneAI] Error with client {client_id}: {e}")
    finally:
        if client_id in active_connections:
            del active_connections[client_id]
        if client_id in connection_tasks:
            connection_tasks[client_id].cancel()
            del connection_tasks[client_id]

# Legacy WebSocket endpoint for compatibility
@router.websocket("/ws")
async def websocket_endpoint_legacy(websocket: WebSocket):
    client_id = f"client-{int(time.time())}-{random.randint(1000, 9999)}"
    await websocket_endpoint(websocket, client_id)

# API endpoints
@router.get("/sections")
async def get_sections():
    """Get all sections"""
    sections_list = []
    for section in sections_db.values():
        if hasattr(section, 'model_dump'):
            section_dict = section.model_dump()
        else:
            section_dict = section.dict()
        
        # Convert Position objects to dict
        for node in section_dict.get('nodes', []):
            if 'position' in node and hasattr(node.get('position'), 'x'):
                node['position'] = {
                    'x': node['position'].x,
                    'y': node['position'].y
                }
        
        sections_list.append(section_dict)
    
    return sections_list

@router.get("/sections/{section_id}")
async def get_section(section_id: str):
    """Get specific section"""
    if section_id not in sections_db:
        raise HTTPException(status_code=404, detail="Section not found")
    
    section = sections_db[section_id]
    if hasattr(section, 'model_dump'):
        section_dict = section.model_dump()
    else:
        section_dict = section.dict()
    
    # Convert Position objects to dict
    for node in section_dict.get('nodes', []):
        if 'position' in node and hasattr(node.get('position'), 'x'):
            node['position'] = {
                'x': node['position'].x,
                'y': node['position'].y
            }
    
    return section_dict

@router.put("/sections/{section_id}")
async def update_section(section_id: str, section_data: dict):
    """Update section"""
    try:
        if section_id not in sections_db:
            raise HTTPException(status_code=404, detail=f"Section {section_id} not found")
        
        existing_section = sections_db[section_id]
        
        # Process nodes to convert Position objects
        nodes = []
        for node_data in section_data.get('nodes', []):
            if 'position' in node_data and isinstance(node_data['position'], dict):
                pos_dict = node_data['position']
                if 'x' in pos_dict and 'y' in pos_dict:
                    position = Position(
                        x=float(pos_dict.get('x', 0)),
                        y=float(pos_dict.get('y', 0))
                    )
                    node_data['position'] = position
            
            try:
                node = Node(**node_data)
                nodes.append(node)
            except Exception as e:
                print(f"[OneAI] Error creating node: {e}")
                continue
        
        # Update section
        existing_section.nodes = nodes
        if 'name' in section_data:
            existing_section.name = section_data['name']
        if 'group' in section_data:
            existing_section.group = section_data['group']
        
        # Handle inputConfig
        if 'inputConfig' in section_data and section_data['inputConfig']:
            try:
                existing_section.inputConfig = SectionConfig(**section_data['inputConfig'])
            except Exception as e:
                print(f"[OneAI] Error creating inputConfig: {e}")
                existing_section.inputConfig = SectionConfig(
                    sources=section_data['inputConfig'].get('sources', []),
                    selectedItems=section_data['inputConfig'].get('selectedItems', []),
                    projectId=section_data['inputConfig'].get('projectId')
                )
        
        # Handle outputConfig
        if 'outputConfig' in section_data and section_data['outputConfig']:
            try:
                existing_section.outputConfig = OutputConfig(**section_data['outputConfig'])
            except Exception as e:
                print(f"[OneAI] Error creating outputConfig: {e}")
                existing_section.outputConfig = OutputConfig(
                    format=section_data['outputConfig'].get('format', 'json'),
                    autoSave=section_data['outputConfig'].get('autoSave', True)
                )
        
        sections_db[section_id] = existing_section
        await mark_changes()
        
        return {"status": "success", "message": "Section updated"}
        
    except Exception as e:
        print(f"[OneAI] Error updating section: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/projects/{project_id}/files")
async def get_project_files(project_id: str):
    """Get project file list"""
    try:
        project_base_path = "./projects"
        project_path = f"{project_base_path}/default"  # Temporary path
        
        if not os.path.exists(project_path):
            os.makedirs(project_path, exist_ok=True)
            return {"files": []}
        
        def scan_directory(path: Path, base_path: Path) -> List[FileNode]:
            items = []
            try:
                for item in sorted(path.iterdir()):
                    if item.name.startswith('.') or item.name in ['__pycache__', 'node_modules', 'venv']:
                        continue
                    
                    try:
                        relative_path = item.relative_to(base_path)
                        file_node = FileNode(
                            name=item.name,
                            path=str(relative_path).replace('\\', '/'),
                            type='directory' if item.is_dir() else 'file'
                        )
                        
                        if item.is_file():
                            stat = item.stat()
                            file_node.size = stat.st_size
                            file_node.modified = datetime.fromtimestamp(stat.st_mtime).isoformat()
                        elif item.is_dir():
                            file_node.children = scan_directory(item, base_path)
                        
                        items.append(file_node)
                    except Exception as e:
                        print(f"Error processing {item}: {e}")
                        continue
                        
            except PermissionError as e:
                print(f"Permission denied: {path}")
            except Exception as e:
                print(f"Error scanning directory {path}: {e}")
            
            return items
        
        files = scan_directory(Path(project_path), Path(project_path))
        return {"files": files}
        
    except Exception as e:
        print(f"Error getting project files: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/projects/{project_id}/file-content")
async def get_file_content(project_id: str, file_path: str = Body(..., embed=True)):
    """Get file content"""
    try:
        project_base_path = "./projects"
        project_path = f"{project_base_path}/default"
        full_path = os.path.join(project_path, file_path)
        
        # Security check
        real_project_path = os.path.realpath(project_path)
        real_file_path = os.path.realpath(full_path)
        
        if not real_file_path.startswith(real_project_path):
            raise HTTPException(status_code=403, detail="Access denied: Path traversal attempt")
        
        if not os.path.exists(full_path):
            raise HTTPException(status_code=404, detail="File not found")
        
        if not os.path.isfile(full_path):
            raise HTTPException(status_code=400, detail="Path is not a file")
        
        # File size check (5MB limit)
        file_size = os.path.getsize(full_path)
        if file_size > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large (max 5MB)")
        
        # Read file content
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            # Handle binary files
            try:
                ext = os.path.splitext(full_path)[1].lower()
                if ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg']:
                    import base64
                    with open(full_path, 'rb') as f:
                        binary_content = f.read()
                    content = f"data:image/{ext[1:]};base64,{base64.b64encode(binary_content).decode()}"
                else:
                    raise HTTPException(status_code=415, detail="Cannot read binary file")
            except Exception as e:
                raise HTTPException(status_code=415, detail=f"Cannot read file: {str(e)}")
        
        return {"content": content}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error reading file content: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/execute")
async def execute_node_endpoint(request: ExecuteRequest):
    """Execute node"""
    section = sections_db.get(request.sectionId)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    node = next((n for n in section.nodes if n.id == request.nodeId), None)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    node.isRunning = True
    await mark_changes()
    
    asyncio.create_task(execute_node_task(request, node, section))
    
    return {"status": "started", "nodeId": request.nodeId}

async def execute_node_task(request: ExecuteRequest, node: Node, section: Section):
    """Execute node task"""
    try:
        print(f"[OneAI] Starting execution for node: {node.id}")
        
        # Notify start
        await broadcast_message({
            "type": "node_execution_start",
            "nodeId": node.id
        })
        
        # Initial progress
        await broadcast_message({
            "type": "progress",
            "nodeId": node.id,
            "progress": 0.1,
            "message": "Preparing execution environment"
        })
        await asyncio.sleep(0.1)
        
        await broadcast_message({
            "type": "progress",
            "nodeId": node.id,
            "progress": 0.2,
            "message": "Connecting to AI model"
        })
        await asyncio.sleep(0.1)
        
        # Prepare execution
        print(f"[OneAI] Preparing execution context for node: {node.id}")
        all_sections = list(sections_db.values())
        connected_outputs = get_connected_outputs(node, section, all_sections)
        
        # Find project info
        input_node = next((n for n in section.nodes if n.type == "input"), None)
        project_id = None
        if input_node and hasattr(input_node, 'projectId'):
            project_id = getattr(input_node, 'projectId', None)
        
        execution_context = {
            "inputs": connected_outputs,
            "model": node.model,
            "lmStudioUrl": node.lmStudioUrl,
            "projectId": project_id
        }
        
        # AI model info
        prompt_size = len(str(connected_outputs)) + len(node.code or "") + len(node.purpose or "") + len(node.outputFormat or "")
        await broadcast_message({
            "type": "progress",
            "nodeId": node.id,
            "progress": 0.3,
            "message": "Sending prompt to AI model",
            "prompt_size": f"{prompt_size} chars"
        })
        
        # Execute code
        print(f"[OneAI] Executing code for node: {node.id}")
        
        try:
            # Execute with timeout
            result = await asyncio.wait_for(
                execute_python_code(node.id, request.code or "", execution_context, section.id),
                timeout=180.0  # 3 minutes timeout
            )
            print(f"[OneAI] Execution completed with result: {result.get('success')}")
        except asyncio.TimeoutError:
            print(f"[OneAI] Execution timeout for node: {node.id}")
            result = {
                "success": False,
                "error": "Execution timeout after 180 seconds"
            }
        except Exception as e:
            print(f"[OneAI] Execution error: {str(e)}")
            result = {
                "success": False,
                "error": str(e)
            }
        
        print(f"[OneAI] Execution result: success={result.get('success')}, has_output={result.get('output') is not None}")
        
        # Process execution logs
        if "execution_logs" in result:
            for log in result["execution_logs"]:
                if log["type"] == "ai_request":
                    await broadcast_message({
                        "type": "ai_request",
                        "nodeId": node.id,
                        "message": log["message"]
                    })
                    await broadcast_message({
                        "type": "progress",
                        "nodeId": node.id,
                        "progress": 0.5,
                        "message": "AI is processing your request"
                    })
                elif log["type"] == "ai_response":
                    await broadcast_message({
                        "type": "ai_response",
                        "nodeId": node.id,
                        "message": log["message"]
                    })
                elif log["type"] == "ai_complete":
                    await broadcast_message({
                        "type": "ai_complete",
                        "nodeId": node.id,
                        "message": "AI processing completed"
                    })
                    await broadcast_message({
                        "type": "progress",
                        "nodeId": node.id,
                        "progress": 0.7,
                        "message": "Processing AI response"
                    })
                elif log["type"] == "error":
                    await broadcast_message({
                        "type": "ai_error",
                        "nodeId": node.id,
                        "error": log["message"]
                    })
        
        # Handle execution result
        if result["success"]:
            # Update node output
            node.output = result["output"]
            node.isRunning = False
            
            await mark_changes()
            
            # Progress 90%
            await broadcast_message({
                "type": "progress",
                "nodeId": node.id,
                "progress": 0.9,
                "message": "Finalizing output"
            })
            
            await asyncio.sleep(0.1)
            
            # Send output update
            print(f"[OneAI] Sending output update for node: {node.id}")
            print(f"[OneAI] Output preview: {str(result['output'])[:100]}...")
            
            await broadcast_message({
                "type": "node_output_updated",
                "nodeId": node.id,
                "output": result["output"]
            })
            
            # Complete progress
            await broadcast_message({
                "type": "progress",
                "nodeId": node.id,
                "progress": 1.0,
                "message": "Complete"
            })
            
            # Send various completion messages for compatibility
            await broadcast_message({
                "type": "ai_complete",
                "nodeId": node.id,
                "output": result["output"]
            })
            
            await broadcast_message({
                "type": "node_execution_complete",
                "nodeId": node.id
            })
            
            await broadcast_message({
                "type": "execution_complete",
                "nodeId": node.id
            })
            
            await broadcast_message({
                "type": "complete",
                "nodeId": node.id
            })
            
            await broadcast_message({
                "type": "done",
                "nodeId": node.id
            })
            
            await broadcast_message({
                "type": "output",
                "nodeId": node.id,
                "output": result["output"]
            })
            
            print(f"[OneAI] Successfully completed execution for node: {node.id}")
            
        else:
            # Error handling
            node.isRunning = False
            await mark_changes()
            
            print(f"[OneAI] Execution failed for node: {node.id}, error: {result.get('error')}")
            await broadcast_message({
                "type": "node_execution_error",
                "nodeId": node.id,
                "error": result.get("error", "Unknown error")
            })
            
    except Exception as e:
        print(f"[OneAI] Exception during execution for node {node.id}: {str(e)}")
        traceback.print_exc()
        
        node.isRunning = False
        await mark_changes()
        
        await broadcast_message({
            "type": "node_execution_error",
            "nodeId": node.id,
            "error": str(e)
        })

@router.post("/execute-flow")
async def execute_flow_endpoint(request: dict):
    """Execute flow"""
    section_id = request.get("sectionId")
    start_node_id = request.get("startNodeId")
    
    if not section_id:
        raise HTTPException(status_code=400, detail="Missing sectionId")
    
    section = sections_db.get(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    if not start_node_id:
        input_node = next((n for n in section.nodes if n.type == "input"), None)
        if not input_node:
            raise HTTPException(status_code=400, detail="No input node found in the section")
        start_node_id = input_node.id
    
    asyncio.create_task(execute_flow_task(section, start_node_id))
    
    return {"success": True, "message": "Flow execution started"}

async def execute_flow_task(section: Section, start_node_id: str):
    """Execute flow task"""
    try:
        visited = set()
        queue = [start_node_id]
        
        while queue:
            node_id = queue.pop(0)
            if node_id in visited:
                continue
                
            visited.add(node_id)
            node = next((n for n in section.nodes if n.id == node_id), None)
            
            if not node:
                continue
            
            # Execute node
            if node.type in ['worker', 'supervisor', 'planner']:
                request = ExecuteRequest(
                    nodeId=node.id,
                    sectionId=section.id,
                    code=node.code or ""
                )
                await execute_node_task(request, node, section)
                
                # Wait for completion
                while node.isRunning:
                    await asyncio.sleep(0.5)
            
            # Find next nodes
            for next_node in section.nodes:
                if next_node.connectedFrom and node_id in next_node.connectedFrom:
                    queue.append(next_node.id)
                    
    except Exception as e:
        print(f"[OneAI] Flow execution error: {e}")
        traceback.print_exc()

@router.post("/stop/{node_id}")
async def stop_node(node_id: str):
    """Stop node execution"""
    for section in sections_db.values():
        node = next((n for n in section.nodes if n.id == node_id), None)
        if node:
            node.isRunning = False
            await mark_changes()
            break
    
    await broadcast_message({
        "type": "node_execution_stopped",
        "nodeId": node_id
    })
    return {"success": True}

@router.post("/save")
async def save_workspace():
    """Manual save workspace"""
    try:
        result = await save_sections_to_file()
        if result:
            return {"success": True, "message": "Workspace saved successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to save workspace")
    except Exception as e:
        print(f"[OneAI] Manual save error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/versions/{node_id}")
async def get_versions(node_id: str):
    """Get version list (placeholder)"""
    return {"versions": [], "message": "Version control not yet implemented"}

@router.get("/models")
async def get_models():
    """Get AI model list"""
    return {"data": []}

@router.post("/lmstudio/connect")
async def connect_lmstudio(request: dict):
    """Connect to LM Studio"""
    url = request.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    # Normalize URL
    if not url.startswith(("http://", "https://")):
        url = f"http://{url}"
    
    if not url.endswith("/"):
        url = f"{url}/"
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            models_url = f"{url}v1/models"
            response = await client.get(models_url)
            
            if response.status_code == 200:
                data = response.json()
                models = []
                
                if "data" in data:
                    for model in data["data"]:
                        models.append({
                            "id": model.get("id", "unknown"),
                            "name": model.get("id", "Unknown Model"),
                            "type": "lmstudio"
                        })
                
                connection_id = f"conn_{int(time.time())}"
                lm_studio_connections[connection_id] = {
                    "url": url,
                    "models": models,
                    "connected_at": datetime.now().isoformat()
                }
                
                return {
                    "success": True,
                    "connectionId": connection_id,
                    "models": models,
                    "url": url
                }
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"LM Studio returned status {response.status_code}"
                )
                
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=408,
            detail="Connection timeout. Make sure LM Studio is running and accessible."
        )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to LM Studio. Make sure it's running on the specified address."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Connection failed: {str(e)}"
        )

@router.get("/lmstudio/models/{connection_id}")
async def get_lmstudio_models(connection_id: str):
    """Get saved LM Studio models"""
    if connection_id not in lm_studio_connections:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    connection = lm_studio_connections[connection_id]
    return {
        "models": connection["models"],
        "url": connection["url"]
    }

@router.post("/node/{node_id}/deactivate")
async def toggle_node_deactivation(node_id: str, request: dict):
    """Toggle node deactivation"""
    section_id = request.get('sectionId')
    
    section = sections_db.get(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    node = next((n for n in section.nodes if n.id == node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    node.isDeactivated = not node.isDeactivated
    await mark_changes()
    
    return {"deactivated": node.isDeactivated}

@router.get("/system/status")
async def get_system_status():
    """Get system status"""
    async with has_changes_lock:
        changes = has_changes
    
    async with save_lock:
        saving = is_saving
    
    return {
        "status": "running",
        "has_changes": changes,
        "is_saving": saving,
        "sections_count": len(sections_db),
        "active_connections": len(active_connections),
        "timestamp": datetime.now().isoformat()
    }

@router.get("/system/force-save")
async def force_save():
    """Force save (for debugging)"""
    try:
        async with has_changes_lock:
            has_changes = True
        
        result = await save_sections_to_file()
        return {
            "success": result,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }