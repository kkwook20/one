# Related files: backend/main.py, backend/models.py, backend/ai_integration.py
# Location: backend/routers/supervisor.py

from fastapi import APIRouter, HTTPException
from datetime import datetime
from storage import sections_db, save_node_data
from ai_integration import execute_with_lm_studio, evaluate_section_with_ai, calculate_code_diff
from websocket_handler import send_update
from execution import execute_flow

router = APIRouter(tags=["supervisor"])

@router.post("/supervisor/execute")
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
        "changes": calculate_code_diff(original_code, result["code"]),
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

@router.post("/supervisor/accept-modification")
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

@router.post("/supervisor/reject-modification")
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

@router.post("/planner/evaluate-section")
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
        ]
    }
    
    # Generate evaluation using AI
    ai_evaluation = await evaluate_section_with_ai(section_info, planner.model)
    
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

@router.post("/planner/accept-evaluation")
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

@router.post("/planner/reject-evaluation")
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

@router.post("/execute-flow/{section_id}")
async def execute_flow_endpoint(section_id: str):
    """Execute all nodes in a section in order"""
    return await execute_flow(section_id)