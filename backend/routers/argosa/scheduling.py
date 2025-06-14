# backend/routers/argosa/scheduling.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import uuid

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

# In-memory storage
schedules: Dict[str, Schedule] = {}

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
    """Add a task to a schedule"""
    if schedule_id not in schedules:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    task.id = f"task_{uuid.uuid4().hex[:8]}"
    schedules[schedule_id].tasks.append(task)
    
    # AI-powered scheduling optimization
    await optimize_schedule(schedule_id)
    
    return task

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