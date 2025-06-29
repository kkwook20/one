# backend/routers/argosa/scheduling.py

from fastapi import APIRouter, HTTPException, WebSocket
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import uuid
import json
import asyncio
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

# RAG integration
from services.rag_service import rag_service, module_integration, Document, RAGQuery

router = APIRouter()

# ===== Data Models =====
class Task(BaseModel):
    id: str
    name: str
    startDate: str
    endDate: str
    progress: int = 0
    assignee: str
    dependencies: List[str] = []
    priority: str = 'medium'  # low, medium, high
    status: str = 'pending'  # pending, in-progress, completed, delayed
    description: Optional[str] = None
    subtasks: Optional[List['Task']] = []

class Schedule(BaseModel):
    id: str
    name: str
    type: str  # argosa, oneai, neuronet, service, user
    tasks: List[Task] = []
    color: str
    icon: str

# Forward reference resolution
Task.model_rebuild()

# LangGraph State for scheduling operations
class SchedulingAgentState(BaseModel):
    operation: str  # create_task, optimize, analyze_workload, resolve_conflicts
    schedule_id: Optional[str] = None
    task_data: Optional[Dict[str, Any]] = None
    assignee: Optional[str] = None
    conflicts: List[Dict[str, Any]] = []
    optimizations: List[Dict[str, Any]] = []
    workload_analysis: Dict[str, Any] = {}
    status: str = "pending"
    error: Optional[str] = None
    metadata: Dict[str, Any] = {}
    step_count: int = 0
    rag_insights: List[Dict[str, Any]] = []

# In-memory storage
schedules: Dict[str, Schedule] = {}
active_websockets: List[WebSocket] = []

# LangGraph workflow for scheduling operations
async def analyze_task_context_node(state: SchedulingAgentState) -> SchedulingAgentState:
    """Analyze task context using RAG for better scheduling"""
    state.step_count += 1
    
    try:
        if state.task_data:
            # Search for similar tasks in RAG
            rag_query = RAGQuery(
                query=f"scheduling task: {state.task_data.get('name', '')} {state.task_data.get('description', '')}",
                source_module="scheduling",
                target_modules=["scheduling", "prediction", "data_analysis"],
                top_k=5
            )
            
            rag_result = await rag_service.search(rag_query)
            
            # Process historical insights
            for doc in rag_result.documents:
                insight = {
                    "id": doc.id,
                    "module": doc.module,
                    "content": doc.content[:200],
                    "created_at": doc.created_at
                }
                
                # Extract timing insights from similar tasks
                if doc.module == "scheduling" and doc.type == "task":
                    try:
                        task_data = json.loads(doc.content)
                        if task_data.get("status") == "completed":
                            actual_duration = task_data.get("actual_duration", "unknown")
                            insight["timing_insight"] = f"Similar task completed in {actual_duration}"
                    except json.JSONDecodeError:
                        pass
                
                state.rag_insights.append(insight)
            
            # Analyze workload for assignee
            if state.assignee:
                assignee_tasks = []
                for schedule in schedules.values():
                    for task in schedule.tasks:
                        if task.assignee == state.assignee:
                            assignee_tasks.append(task)
                
                state.workload_analysis = {
                    "assignee": state.assignee,
                    "active_tasks": len([t for t in assignee_tasks if t.status == "in-progress"]),
                    "pending_tasks": len([t for t in assignee_tasks if t.status == "pending"]),
                    "overload_risk": len(assignee_tasks) > 5
                }
        
        state.status = "analyzed"
        await broadcast_scheduling_update({
            "type": "task_analysis",
            "insights_found": len(state.rag_insights),
            "workload_risk": state.workload_analysis.get("overload_risk", False)
        })
        
    except Exception as e:
        state.error = f"Analysis failed: {str(e)}"
        state.status = "error"
    
    return state

async def detect_conflicts_node(state: SchedulingAgentState) -> SchedulingAgentState:
    """Detect scheduling conflicts and dependencies"""
    state.step_count += 1
    
    try:
        if state.schedule_id and state.schedule_id in schedules:
            schedule = schedules[state.schedule_id]
            
            # Check for assignee conflicts
            if state.assignee:
                assignee_tasks = [task for task in schedule.tasks if task.assignee == state.assignee]
                
                # Sort by start date
                sorted_tasks = sorted(assignee_tasks, key=lambda t: t.startDate)
                
                for i in range(len(sorted_tasks) - 1):
                    current_task = sorted_tasks[i]
                    next_task = sorted_tasks[i + 1]
                    
                    # Check for overlap
                    if current_task.endDate > next_task.startDate:
                        conflict = {
                            "type": "time_overlap",
                            "task1": {"id": current_task.id, "name": current_task.name},
                            "task2": {"id": next_task.id, "name": next_task.name},
                            "severity": "high" if current_task.priority == "high" or next_task.priority == "high" else "medium",
                            "suggestion": "Adjust timeline or reassign task"
                        }
                        state.conflicts.append(conflict)
            
            # Check dependencies
            if state.task_data:
                task_deps = state.task_data.get("dependencies", [])
                for dep_id in task_deps:
                    dep_task = find_task_in_schedule(schedule, dep_id)
                    if dep_task and dep_task.status != "completed":
                        conflict = {
                            "type": "dependency_not_ready",
                            "dependent_task": state.task_data.get("name", "Unknown"),
                            "blocking_task": {"id": dep_task.id, "name": dep_task.name, "status": dep_task.status},
                            "severity": "high",
                            "suggestion": f"Wait for {dep_task.name} completion or remove dependency"
                        }
                        state.conflicts.append(conflict)
        
        state.status = "conflicts_detected"
        await broadcast_scheduling_update({
            "type": "conflicts_detected",
            "conflicts_count": len(state.conflicts),
            "high_severity": len([c for c in state.conflicts if c.get("severity") == "high"])
        })
        
    except Exception as e:
        state.error = f"Conflict detection failed: {str(e)}"
        state.status = "error"
    
    return state

async def optimize_schedule_node(state: SchedulingAgentState) -> SchedulingAgentState:
    """Optimize schedule based on conflicts and insights"""
    state.step_count += 1
    
    try:
        # Generate optimizations based on conflicts
        for conflict in state.conflicts:
            if conflict["type"] == "time_overlap":
                optimization = {
                    "type": "timeline_adjustment",
                    "description": f"Adjust timeline for {conflict['task2']['name']} to avoid overlap",
                    "impact": "Resolves time conflict",
                    "priority": conflict["severity"]
                }
                state.optimizations.append(optimization)
            
            elif conflict["type"] == "dependency_not_ready":
                optimization = {
                    "type": "dependency_management",
                    "description": f"Delay {conflict['dependent_task']} until {conflict['blocking_task']['name']} completes",
                    "impact": "Ensures proper task sequence",
                    "priority": "high"
                }
                state.optimizations.append(optimization)
        
        # Use RAG insights for additional optimizations
        for insight in state.rag_insights:
            if insight.get("timing_insight"):
                optimization = {
                    "type": "duration_adjustment",
                    "description": f"Adjust task duration based on historical data: {insight['timing_insight']}",
                    "impact": "More accurate time estimates",
                    "priority": "medium"
                }
                state.optimizations.append(optimization)
        
        # Workload balancing
        if state.workload_analysis.get("overload_risk"):
            optimization = {
                "type": "workload_balancing",
                "description": f"Consider redistributing tasks for {state.assignee} (overload risk detected)",
                "impact": "Prevents assignee burnout and delays",
                "priority": "high"
            }
            state.optimizations.append(optimization)
        
        state.status = "optimized"
        await broadcast_scheduling_update({
            "type": "schedule_optimized",
            "optimizations_count": len(state.optimizations),
            "conflicts_resolved": len(state.conflicts)
        })
        
    except Exception as e:
        state.error = f"Optimization failed: {str(e)}"
        state.status = "error"
    
    return state

async def store_scheduling_data_node(state: SchedulingAgentState) -> SchedulingAgentState:
    """Store scheduling insights and results in RAG"""
    state.step_count += 1
    
    try:
        # Store task and scheduling insights
        if state.task_data:
            await rag_service.add_document(Document(
                id="",
                module="scheduling",
                type="task_analysis",
                content=json.dumps({
                    "task": state.task_data,
                    "conflicts": state.conflicts,
                    "optimizations": state.optimizations,
                    "workload_analysis": state.workload_analysis,
                    "rag_insights_count": len(state.rag_insights)
                }),
                metadata={
                    "schedule_id": state.schedule_id,
                    "assignee": state.assignee,
                    "operation": state.operation,
                    "timestamp": datetime.now().isoformat()
                }
            ))
        
        state.status = "completed"
        
    except Exception as e:
        state.error = f"Storage failed: {str(e)}"
        state.status = "error"
    
    return state

# Create LangGraph workflow
scheduling_workflow = StateGraph(SchedulingAgentState)
scheduling_workflow.add_node("analyze_context", analyze_task_context_node)
scheduling_workflow.add_node("detect_conflicts", detect_conflicts_node)
scheduling_workflow.add_node("optimize_schedule", optimize_schedule_node)
scheduling_workflow.add_node("store_data", store_scheduling_data_node)

scheduling_workflow.set_entry_point("analyze_context")
scheduling_workflow.add_edge("analyze_context", "detect_conflicts")
scheduling_workflow.add_edge("detect_conflicts", "optimize_schedule")
scheduling_workflow.add_edge("optimize_schedule", "store_data")
scheduling_workflow.add_edge("store_data", END)

# Compile workflow
scheduling_agent = scheduling_workflow.compile(checkpointer=MemorySaver())

async def broadcast_scheduling_update(update: Dict[str, Any]):
    """Broadcast update to all connected WebSocket clients"""
    disconnected = []
    
    for connection in active_websockets:
        try:
            await connection.send_json(update)
        except:
            disconnected.append(connection)
    
    # Remove disconnected clients
    for conn in disconnected:
        active_websockets.remove(conn)

# ===== API Endpoints =====
@router.get("/")
async def get_schedules():
    """Get all schedules"""
    return list(schedules.values())

@router.post("/")
async def create_schedule(schedule: Schedule):
    """Create a new schedule"""
    schedule.id = f"schedule_{uuid.uuid4().hex[:8]}"
    schedules[schedule.id] = schedule
    return schedule

@router.get("/{schedule_id}")
async def get_schedule(schedule_id: str):
    """Get a specific schedule"""
    if schedule_id not in schedules:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedules[schedule_id]

@router.post("/{schedule_id}/tasks")
async def add_task(schedule_id: str, task: Task):
    """Add a task to a schedule using LangGraph workflow"""
    if schedule_id not in schedules:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    task.id = f"task_{uuid.uuid4().hex[:8]}"
    
    # Create initial state for workflow
    initial_state = SchedulingAgentState(
        operation="create_task",
        schedule_id=schedule_id,
        task_data=task.dict(),
        assignee=task.assignee
    )
    
    # Execute workflow
    config = {"configurable": {"thread_id": f"add_task_{schedule_id}_{uuid.uuid4().hex[:8]}"}}
    final_state = await scheduling_agent.ainvoke(initial_state, config)
    
    if final_state.status == "completed":
        # Add task to schedule
        schedules[schedule_id].tasks.append(task)
        
        return {
            "task": task,
            "conflicts": final_state.conflicts,
            "optimizations": final_state.optimizations,
            "workload_analysis": final_state.workload_analysis,
            "rag_insights": len(final_state.rag_insights),
            "workflow_steps": final_state.step_count
        }
    else:
        # Still add the task but return warnings
        schedules[schedule_id].tasks.append(task)
        return {
            "task": task,
            "warning": f"Workflow issues: {final_state.error}",
            "conflicts": final_state.conflicts,
            "optimizations": final_state.optimizations
        }

@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, updates: Dict[str, Any]):
    """Update a task"""
    # Find task across all schedules
    for schedule in schedules.values():
        task = find_task_in_schedule(schedule, task_id)
        if task:
            for key, value in updates.items():
                setattr(task, key, value)
            
            # Check for delays and conflicts
            check_task_delays(task)
            
            return task
    
    raise HTTPException(status_code=404, detail="Task not found")

@router.get("/gantt-data")
async def get_gantt_data(start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Get data formatted for Gantt chart visualization"""
    gantt_data = []
    
    for schedule in schedules.values():
        for task in schedule.tasks:
            gantt_item = {
                "id": task.id,
                "name": task.name,
                "schedule": schedule.name,
                "start": task.startDate,
                "end": task.endDate,
                "progress": task.progress,
                "dependencies": task.dependencies,
                "color": schedule.color,
                "priority": task.priority,
                "status": task.status
            }
            gantt_data.append(gantt_item)
    
    # Filter by date range if provided
    if start_date and end_date:
        gantt_data = [
            item for item in gantt_data
            if item["start"] >= start_date and item["end"] <= end_date
        ]
    
    return gantt_data

@router.post("/optimize/{schedule_id}")
async def optimize_schedule(schedule_id: str):
    """AI-powered schedule optimization"""
    if schedule_id not in schedules:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    schedule = schedules[schedule_id]
    
    # Simple optimization: Check for conflicts and adjust dates
    tasks_by_assignee = {}
    for task in schedule.tasks:
        if task.assignee not in tasks_by_assignee:
            tasks_by_assignee[task.assignee] = []
        tasks_by_assignee[task.assignee].append(task)
    
    # Detect and resolve conflicts
    conflicts = []
    for assignee, tasks in tasks_by_assignee.items():
        sorted_tasks = sorted(tasks, key=lambda t: t.startDate)
        for i in range(len(sorted_tasks) - 1):
            if sorted_tasks[i].endDate > sorted_tasks[i + 1].startDate:
                conflicts.append({
                    "assignee": assignee,
                    "task1": sorted_tasks[i].name,
                    "task2": sorted_tasks[i + 1].name,
                    "suggestion": "Adjust timeline to avoid overlap"
                })
    
    return {
        "schedule_id": schedule_id,
        "conflicts": conflicts,
        "optimized": len(conflicts) == 0
    }

@router.get("/workload/{assignee}")
async def get_workload(assignee: str):
    """Get workload analysis for an assignee"""
    assignee_tasks = []
    
    for schedule in schedules.values():
        for task in schedule.tasks:
            if task.assignee == assignee:
                assignee_tasks.append({
                    "task": task.name,
                    "schedule": schedule.name,
                    "start": task.startDate,
                    "end": task.endDate,
                    "status": task.status,
                    "priority": task.priority
                })
    
    # Calculate workload metrics
    active_tasks = len([t for t in assignee_tasks if t["status"] == "in-progress"])
    pending_tasks = len([t for t in assignee_tasks if t["status"] == "pending"])
    high_priority = len([t for t in assignee_tasks if t["priority"] == "high"])
    
    return {
        "assignee": assignee,
        "total_tasks": len(assignee_tasks),
        "active_tasks": active_tasks,
        "pending_tasks": pending_tasks,
        "high_priority_tasks": high_priority,
        "tasks": assignee_tasks
    }

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time scheduling updates"""
    await websocket.accept()
    active_websockets.append(websocket)
    
    try:
        # Send initial status
        await websocket.send_json({
            "type": "scheduling_status",
            "total_schedules": len(schedules),
            "total_tasks": sum(len(s.tasks) for s in schedules.values()),
            "active_tasks": sum(len([t for t in s.tasks if t.status == "in-progress"]) for s in schedules.values())
        })
        
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "analyze_workload":
                assignee = data.get("assignee", "")
                if assignee:
                    # Execute workload analysis through workflow
                    initial_state = SchedulingAgentState(
                        operation="analyze_workload",
                        assignee=assignee
                    )
                    
                    config = {"configurable": {"thread_id": f"ws_workload_{uuid.uuid4().hex[:8]}"}}
                    final_state = await scheduling_agent.ainvoke(initial_state, config)
                    
                    await websocket.send_json({
                        "type": "workload_analysis",
                        "assignee": assignee,
                        "analysis": final_state.workload_analysis,
                        "insights": final_state.rag_insights,
                        "status": final_state.status
                    })
            
            elif data.get("type") == "optimize_schedule":
                schedule_id = data.get("schedule_id", "")
                if schedule_id:
                    optimization_result = await optimize_schedule(schedule_id)
                    await websocket.send_json({
                        "type": "optimization_result",
                        "schedule_id": schedule_id,
                        "result": optimization_result
                    })
    
    except Exception as e:
        print(f"Scheduling WebSocket error: {e}")
    finally:
        if websocket in active_websockets:
            active_websockets.remove(websocket)

# ===== Helper Functions =====
def find_task_in_schedule(schedule: Schedule, task_id: str) -> Optional[Task]:
    """Recursively find a task in a schedule"""
    for task in schedule.tasks:
        if task.id == task_id:
            return task
        if task.subtasks:
            for subtask in task.subtasks:
                if subtask.id == task_id:
                    return subtask
    return None

def check_task_delays(task: Task):
    """Check if a task is delayed and update status"""
    if task.status == "in-progress":
        end_date = datetime.fromisoformat(task.endDate.replace('Z', '+00:00'))
        if datetime.now(end_date.tzinfo) > end_date and task.progress < 100:
            task.status = "delayed"

# ===== Initialize/Shutdown =====
async def initialize():
    """Initialize scheduling module"""
    print("[Scheduling] Initializing scheduling system...")
    
    # Create sample schedules
    argosa_schedule = Schedule(
        id="argosa_main",
        name="Argosa System",
        type="argosa",
        color="bg-blue-500",
        icon="Brain",
        tasks=[
            Task(
                id="task_001",
                name="LangGraph Integration Phase 1",
                startDate=datetime.now().isoformat(),
                endDate=(datetime.now() + timedelta(days=14)).isoformat(),
                progress=30,
                assignee="AI Team",
                priority="high",
                status="in-progress",
                description="Implement core agent architecture"
            ),
            Task(
                id="task_002",
                name="Data Pipeline Optimization",
                startDate=(datetime.now() + timedelta(days=7)).isoformat(),
                endDate=(datetime.now() + timedelta(days=21)).isoformat(),
                progress=0,
                assignee="Data Team",
                dependencies=["task_001"],
                priority="medium",
                status="pending"
            )
        ]
    )
    
    schedules[argosa_schedule.id] = argosa_schedule
    
    print("[Scheduling] Scheduling system ready")

async def shutdown():
    """Shutdown scheduling module"""
    print("[Scheduling] Shutting down scheduling system...")
    schedules.clear()
    print("[Scheduling] Scheduling system shut down")