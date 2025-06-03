# Related files: backend/main.py, backend/models.py, backend/storage.py
# Location: backend/execution.py

import asyncio
import json
import os
import subprocess
import sys
import tempfile
from typing import Dict, Any, Set, List
from models import Node, Section
from storage import get_global_var, sections_db

# Global state for running processes
node_processes: Dict[str, asyncio.Task] = {}

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
    # This would be replaced with actual API call in production
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
                        # Input 노드는 설정된 소스에서 데이터 가져오기
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
    """Execute all nodes in a section in order"""
    section = sections_db.get(section_id)
    if not section:
        return {"error": "Section not found"}
    
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