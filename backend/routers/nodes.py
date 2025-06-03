# Related files: backend/main.py, backend/models.py, backend/storage.py, backend/execution.py
# Location: backend/routers/nodes.py

from fastapi import APIRouter, HTTPException
import asyncio
import os
import json
from datetime import datetime
from models import ExecuteRequest, RestoreVersionRequest
from storage import sections_db, save_node_data, get_node_versions
from execution import execute_python_code, get_connected_outputs, node_processes
from websocket_handler import send_progress, send_update

router = APIRouter(tags=["nodes"])

@router.post("/execute")
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

@router.post("/stop/{node_id}")
async def stop_node(node_id: str):
    """Stop node execution"""
    if node_id in node_processes:
        node_processes[node_id].cancel()
        del node_processes[node_id]
        await send_progress(node_id, -1, "Stopped by user")
        return {"status": "stopped"}
    return {"status": "not_running"}

@router.post("/node/{node_id}/deactivate")
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

@router.get("/versions/{node_id}")
async def get_versions(node_id: str, limit: int = 5):
    """Get node version history"""
    return get_node_versions(node_id, limit)

@router.post("/restore-version")
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