# backend/execution.py
import asyncio
import json
import os
import subprocess
import sys
import tempfile
from typing import Dict, Any, Set, List
from models import Node, Section
from storage import get_global_var, sections_db
from websocket_handler import send_progress, send_update

# Global state for running processes
node_processes: Dict[str, asyncio.Task] = {}

async def execute_python_code(node_id: str, code: str, inputs: Dict[str, Any] = None, section_id: str = None) -> Dict[str, Any]:
    """Execute Python code in isolated environment with progress updates"""
    # 진행 상황 업데이트
    await send_progress(node_id, 0.3, "Preparing execution environment...")
    
    # Create temporary directory for execution
    with tempfile.TemporaryDirectory() as temp_dir:
        # Write code to file
        code_file = os.path.join(temp_dir, "node_code.py")
        
        # Handle empty code case
        if not code or code.strip() == '':
            await send_progress(node_id, 0.7, "No code to execute...")
            await send_progress(node_id, 1.0, "Execution complete")
            return {"success": True, "output": {"message": "No code to execute", "status": "empty"}}
        
        # Inject global variable access and inputs
        injected_code = f"""
import json
import sys
import os

# Global variable access function
def get_global_var(var_path):
    # This would be replaced with actual API call in production
    return None  # Placeholder

def get_connected_outputs():
    return {json.dumps(inputs or {})}

# Inputs
inputs = {json.dumps(inputs or {})}

# Initialize output
output = None

# User code
try:
{chr(10).join('    ' + line for line in code.split(chr(10)))}
except Exception as e:
    output = {{"error": str(e), "type": str(type(e).__name__)}}

# Output results
if output is not None:
    print(json.dumps({{"success": True, "output": output}}))
else:
    print(json.dumps({{"success": True, "output": {{"message": "Code executed but no output was set", "inputs": inputs}}}}))
"""
        
        with open(code_file, "w") as f:
            f.write(injected_code)
        
        await send_progress(node_id, 0.5, "Executing code...")
        
        # Execute code
        try:
            result = subprocess.run(
                [sys.executable, code_file],
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutes timeout
                cwd=temp_dir
            )
            
            await send_progress(node_id, 0.7, "Processing results...")
            
            if result.returncode == 0:
                try:
                    output_data = json.loads(result.stdout)
                    await send_progress(node_id, 1.0, "Execution complete")
                    return output_data
                except json.JSONDecodeError:
                    # If output is not JSON, return as string
                    await send_progress(node_id, 1.0, "Execution complete")
                    return {"success": True, "output": result.stdout.strip() or "No output"}
            else:
                error_msg = result.stderr or "Unknown error"
                await send_progress(node_id, -1, f"Execution failed: {error_msg}")
                return {"success": False, "error": error_msg}
                
        except subprocess.TimeoutExpired:
            await send_progress(node_id, -1, "Code execution timeout")
            return {"success": False, "error": "Code execution timeout (5 minutes limit)"}
        except Exception as e:
            await send_progress(node_id, -1, f"Execution error: {str(e)}")
            return {"success": False, "error": str(e)}

def get_connected_outputs(node: Node, section: Section, all_sections: List[Section]) -> Dict[str, Any]:
    """Get outputs from all connected nodes"""
    if not node.connectedFrom:
        return {}
    
    outputs = {}
    for conn_id in node.connectedFrom:
        # Input 노드인 경우 특별 처리
        for s in all_sections:
            for n in s.nodes:
                if n.id == conn_id:
                    if n.type == 'input':
                        # Preproduction Script의 경우 텍스트 입력 처리
                        if s.group == 'preproduction' and s.name == 'Script' and n.output:
                            outputs['script_input'] = n.output
                        else:
                            # 다른 Input 노드는 설정된 소스에서 데이터 가져오기
                            input_config = s.inputConfig
                            if input_config and input_config.sources:
                                for source_section_id in input_config.sources:
                                    source_section = next((sec for sec in all_sections if sec.id == source_section_id), None)
                                    if source_section:
                                        for source_node in source_section.nodes:
                                            if source_node.output:
                                                outputs[source_node.label] = source_node.output
                    else:
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

async def execute_flow(section_id: str) -> Dict[str, Any]:
    """Execute all nodes in a section in order with detailed progress"""
    section = sections_db.get(section_id)
    if not section:
        return {"error": "Section not found"}
    
    # Get execution order
    execution_order = get_node_execution_order(section)
    
    # 실행 시작 알림
    await send_update("flow_execution_started", {
        "sectionId": section_id,
        "nodeCount": len(execution_order)
    })
    
    results = []
    for idx, node in enumerate(execution_order):
        # 노드 시작 알림
        await send_progress(node.id, 0.1, f"Starting {node.label}...")
        
        if node.type in ['worker', 'supervisor', 'planner']:
            # Execute node - even if code is empty
            all_sections = list(sections_db.values())
            connected_outputs = get_connected_outputs(node, section, all_sections)
            
            # Execute even if no code
            code_to_execute = node.code if node.code else ""
            result = await execute_python_code(node.id, code_to_execute, connected_outputs, section_id)
            
            if result["success"]:
                node.output = result["output"]
                
                # Output 노드 자동 업데이트
                for n in section.nodes:
                    if n.type == 'output' and node.id in (n.connectedFrom or []):
                        if not n.output:
                            n.output = {}
                        n.output[node.label] = result["output"]
                        await send_update("output_node_updated", {
                            "sectionId": section.id,
                            "nodeId": n.id,
                            "output": n.output
                        })
            
            results.append({
                "nodeId": node.id,
                "label": node.label,
                "success": result["success"],
                "output": result.get("output"),
                "error": result.get("error")
            })
        elif node.type == 'input':
            # Input 노드는 이미 데이터가 있음
            await send_progress(node.id, 1.0, "Input ready")
            results.append({
                "nodeId": node.id,
                "label": node.label,
                "success": True,
                "output": node.output
            })
        elif node.type == 'output':
            # Output 노드 처리
            await send_progress(node.id, 0.5, "Collecting outputs...")
            await send_progress(node.id, 1.0, "Output collected")
            results.append({
                "nodeId": node.id,
                "label": node.label,
                "success": True,
                "output": node.output
            })
    
    # 실행 완료 알림
    await send_update("flow_execution_completed", {
        "sectionId": section_id,
        "results": results
    })
    
    return {"results": results, "executionOrder": [n.id for n in execution_order]}