# backend/routers/argosa/user_input.py

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import asyncio
import json

router = APIRouter()

# ===== Data Models =====
class DecisionOption(BaseModel):
    id: str
    label: str
    description: str
    impact: str
    recommended: Optional[bool] = False

class UserConfirmation(BaseModel):
    id: str
    type: str  # deployment, modification, decision, schedule
    title: str
    description: str
    details: Dict[str, Any]
    status: str = 'pending'  # pending, approved, rejected
    createdAt: str
    requester: str
    priority: str = 'medium'  # low, medium, high, critical
    options: Optional[List[DecisionOption]] = []

class UserMessage(BaseModel):
    id: str
    type: str  # user, system
    content: str
    timestamp: str
    metadata: Optional[Dict[str, Any]] = {}

class SystemStatus(BaseModel):
    system: str
    status: str  # idle, working, waiting, error
    lastAction: str
    progress: Optional[int] = None

# In-memory storage
confirmations: Dict[str, UserConfirmation] = {}
messages: List[UserMessage] = []
active_websockets: List[WebSocket] = []
system_statuses: Dict[str, SystemStatus] = {}

# ===== API Endpoints =====
@router.get("/confirmations")
async def get_confirmations():
    """Get all pending confirmations"""
    return list(confirmations.values())

@router.post("/confirmations/{confirmation_id}")
async def process_confirmation(confirmation_id: str, decision: Dict[str, Any]):
    """Process a user confirmation"""
    if confirmation_id not in confirmations:
        raise HTTPException(status_code=404, detail="Confirmation not found")
    
    confirmation = confirmations[confirmation_id]
    approved = decision.get("approved", False)
    selected_decision = decision.get("decision", None)
    
    # Update confirmation status
    confirmation.status = "approved" if approved else "rejected"
    
    # Process based on type
    if confirmation.type == "deployment" and approved:
        # Trigger deployment
        await trigger_deployment(confirmation)
    elif confirmation.type == "decision" and selected_decision:
        # Process decision
        await process_decision(confirmation, selected_decision)
    elif confirmation.type == "modification" and approved:
        # Apply modifications
        await apply_modifications(confirmation)
    elif confirmation.type == "schedule" and approved:
        # Update schedule
        await update_schedule(confirmation)
    
    # Send notification to all connected clients
    await broadcast_update({
        "type": "confirmation_processed",
        "confirmation": confirmation.dict(),
        "approved": approved
    })
    
    return confirmation

@router.post("/message")
async def send_message(message: Dict[str, str]):
    """Process a user message"""
    user_msg = UserMessage(
        id=f"msg_{uuid.uuid4().hex[:8]}",
        type="user",
        content=message["message"],
        timestamp=datetime.now().isoformat()
    )
    messages.append(user_msg)
    
    # AI-powered response generation
    reply_content = await generate_ai_response(user_msg.content)
    
    system_msg = UserMessage(
        id=f"msg_{uuid.uuid4().hex[:8]}",
        type="system",
        content=reply_content,
        timestamp=datetime.now().isoformat()
    )
    messages.append(system_msg)
    
    # Broadcast to all connected clients
    await broadcast_update({
        "type": "new_message",
        "message": system_msg.dict()
    })
    
    return {"reply": reply_content}

@router.get("/messages")
async def get_messages(limit: int = 50):
    """Get recent messages"""
    return messages[-limit:]

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await websocket.accept()
    active_websockets.append(websocket)
    
    try:
        # Send initial status
        await websocket.send_json({
            "type": "connection_established",
            "timestamp": datetime.now().isoformat()
        })
        
        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            # Echo back for now
            await websocket.send_text(f"Echo: {data}")
            
    except WebSocketDisconnect:
        active_websockets.remove(websocket)

@router.get("/system/status")
async def get_system_status():
    """Get status of all systems"""
    return list(system_statuses.values())

@router.post("/create-confirmation")
async def create_confirmation(confirmation: UserConfirmation):
    """Create a new confirmation request"""
    confirmation.id = f"conf_{uuid.uuid4().hex[:8]}"
    confirmation.createdAt = datetime.now().isoformat()
    
    confirmations[confirmation.id] = confirmation
    
    # Notify all connected clients
    await broadcast_update({
        "type": "new_confirmation",
        "confirmation": confirmation.dict()
    })
    
    return confirmation

# ===== Helper Functions =====
async def generate_ai_response(user_message: str) -> str:
    """Generate AI response to user message"""
    # Simple response generation (replace with actual AI)
    responses = {
        "status": "All systems are operational. Argosa is analyzing data, OneAI is processing animations.",
        "help": "I can help you with confirmations, system status, and task management.",
        "deploy": "Deployment requires confirmation. Please review the pending confirmations.",
        "error": "I'll investigate the error. Can you provide more details?"
    }
    
    # Check for keywords
    message_lower = user_message.lower()
    for keyword, response in responses.items():
        if keyword in message_lower:
            return response
    
    # Default response
    return f"I understand you said: '{user_message}'. How can I assist you with that?"

async def broadcast_update(update: Dict[str, Any]):
    """Broadcast update to all connected WebSocket clients"""
    disconnected = []
    
    for websocket in active_websockets:
        try:
            await websocket.send_json(update)
        except:
            disconnected.append(websocket)
    
    # Remove disconnected websockets
    for ws in disconnected:
        active_websockets.remove(ws)

async def trigger_deployment(confirmation: UserConfirmation):
    """Trigger deployment process"""
    # Update system status
    system_statuses["deployment"] = SystemStatus(
        system="Deployment",
        status="working",
        lastAction="Deploying " + confirmation.title,
        progress=0
    )
    
    # Simulate deployment progress
    for progress in range(0, 101, 20):
        system_statuses["deployment"].progress = progress
        await broadcast_update({
            "type": "deployment_progress",
            "progress": progress
        })
        await asyncio.sleep(1)
    
    system_statuses["deployment"].status = "idle"
    system_statuses["deployment"].lastAction = "Deployment completed"

async def process_decision(confirmation: UserConfirmation, decision_id: str):
    """Process a decision"""
    # Find the selected option
    selected_option = next((opt for opt in confirmation.options if opt.id == decision_id), None)
    
    if selected_option:
        # Log the decision
        decision_msg = UserMessage(
            id=f"msg_{uuid.uuid4().hex[:8]}",
            type="system",
            content=f"Decision made: {selected_option.label} - {selected_option.impact}",
            timestamp=datetime.now().isoformat(),
            metadata={"decision_id": decision_id, "confirmation_id": confirmation.id}
        )
        messages.append(decision_msg)

async def apply_modifications(confirmation: UserConfirmation):
    """Apply code modifications"""
    # Update system status
    system_statuses["code_modification"] = SystemStatus(
        system="Code Modification",
        status="working",
        lastAction="Applying modifications",
        progress=50
    )
    
    await asyncio.sleep(2)  # Simulate work
    
    system_statuses["code_modification"].status = "idle"
    system_statuses["code_modification"].lastAction = "Modifications applied"

async def update_schedule(confirmation: UserConfirmation):
    """Update schedule based on confirmation"""
    # Update system status
    system_statuses["scheduler"] = SystemStatus(
        system="Scheduler",
        status="working",
        lastAction="Updating schedule",
        progress=75
    )
    
    await asyncio.sleep(1)  # Simulate work
    
    system_statuses["scheduler"].status = "idle"
    system_statuses["scheduler"].lastAction = "Schedule updated"

# ===== Initialize/Shutdown =====
async def initialize():
    """Initialize user input module"""
    print("[User Input] Initializing user input system...")
    
    # Initialize system statuses
    system_statuses["data_collection"] = SystemStatus(
        system="Data Collection",
        status="idle",
        lastAction="Ready for input"
    )
    system_statuses["data_analysis"] = SystemStatus(
        system="Data Analysis",
        status="idle",
        lastAction="Awaiting data"
    )
    system_statuses["prediction"] = SystemStatus(
        system="Prediction Model",
        status="idle",
        lastAction="Model loaded"
    )
    system_statuses["code_analysis"] = SystemStatus(
        system="Code Analysis",
        status="idle",
        lastAction="Ready to analyze"
    )
    
    # Create sample confirmation
    sample_confirmation = UserConfirmation(
        id="sample_conf_1",
        type="decision",
        title="Select Database Strategy",
        description="Choose the optimal database configuration for storing analysis results",
        details={"context": "Current data volume: 10GB, Expected growth: 50GB/month"},
        createdAt=datetime.now().isoformat(),
        requester="DB Center",
        priority="high",
        options=[
            DecisionOption(
                id="opt_neo4j",
                label="Neo4j Graph Database",
                description="Best for relationship queries",
                impact="High query performance, moderate write speed",
                recommended=True
            ),
            DecisionOption(
                id="opt_vector",
                label="Vector Database",
                description="Optimized for similarity search",
                impact="Fast similarity queries, limited relationships"
            ),
            DecisionOption(
                id="opt_hybrid",
                label="Hybrid Solution",
                description="Combine both databases",
                impact="Maximum flexibility, higher complexity"
            )
        ]
    )
    
    confirmations[sample_confirmation.id] = sample_confirmation
    
    print("[User Input] User input system ready")

async def shutdown():
    """Shutdown user input module"""
    print("[User Input] Shutting down user input system...")
    
    # Close all websocket connections
    for ws in active_websockets:
        try:
            await ws.close()
        except:
            pass
    
    active_websockets.clear()
    confirmations.clear()
    messages.clear()
    system_statuses.clear()
    
    print("[User Input] User input system shut down")