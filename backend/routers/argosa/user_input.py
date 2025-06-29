# backend/routers/argosa/user_input.py

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import asyncio
import json
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

# RAG integration
from services.rag_service import rag_service, module_integration, Document, RAGQuery

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

# LangGraph State for user input processing
class UserInputAgentState(BaseModel):
    operation: str  # process_message, create_confirmation, handle_decision
    message_content: Optional[str] = None
    confirmation_data: Optional[Dict[str, Any]] = None
    decision_id: Optional[str] = None
    ai_response: Optional[str] = None
    context_insights: List[Dict[str, Any]] = []
    suggested_actions: List[Dict[str, Any]] = []
    system_analysis: Dict[str, Any] = {}
    status: str = "pending"
    error: Optional[str] = None
    metadata: Dict[str, Any] = {}
    step_count: int = 0

# In-memory storage
confirmations: Dict[str, UserConfirmation] = {}
messages: List[UserMessage] = []
active_websockets: List[WebSocket] = []
system_statuses: Dict[str, SystemStatus] = {}

# LangGraph workflow for user input processing
async def analyze_user_context_node(state: UserInputAgentState) -> UserInputAgentState:
    """Analyze user input context using RAG"""
    state.step_count += 1
    
    try:
        if state.message_content:
            # Search for relevant context in RAG
            rag_query = RAGQuery(
                query=f"user request: {state.message_content}",
                source_module="user_input",
                target_modules=["user_input", "data_analysis", "scheduling", "prediction"],
                top_k=5
            )
            
            rag_result = await rag_service.search(rag_query)
            
            # Process context insights
            for doc in rag_result.documents:
                insight = {
                    "id": doc.id,
                    "module": doc.module,
                    "content": doc.content[:200],
                    "relevance": "high" if doc.module == "user_input" else "medium",
                    "created_at": doc.created_at
                }
                state.context_insights.append(insight)
                
                # Extract specific insights based on module
                if doc.module == "scheduling" and "task" in doc.content:
                    state.suggested_actions.append({
                        "type": "scheduling",
                        "action": "Check task status or create new task",
                        "priority": "medium"
                    })
                elif doc.module == "prediction" and "prediction" in doc.content:
                    state.suggested_actions.append({
                        "type": "prediction",
                        "action": "Generate predictions based on current data",
                        "priority": "high"
                    })
                elif doc.module == "data_analysis" and "analysis" in doc.content:
                    state.suggested_actions.append({
                        "type": "analysis",
                        "action": "Run data analysis workflow",
                        "priority": "high"
                    })
            
            # Analyze current system status
            active_systems = len([s for s in system_statuses.values() if s.status == "working"])
            idle_systems = len([s for s in system_statuses.values() if s.status == "idle"])
            error_systems = len([s for s in system_statuses.values() if s.status == "error"])
            
            state.system_analysis = {
                "active_systems": active_systems,
                "idle_systems": idle_systems,
                "error_systems": error_systems,
                "total_systems": len(system_statuses),
                "system_health": "good" if error_systems == 0 else "issues_detected"
            }
        
        state.status = "analyzed"
        await broadcast_user_input_update({
            "type": "context_analyzed",
            "insights_found": len(state.context_insights),
            "suggested_actions": len(state.suggested_actions),
            "system_health": state.system_analysis.get("system_health", "unknown")
        })
        
    except Exception as e:
        state.error = f"Context analysis failed: {str(e)}"
        state.status = "error"
    
    return state

async def generate_ai_response_node(state: UserInputAgentState) -> UserInputAgentState:
    """Generate intelligent AI response based on context"""
    state.step_count += 1
    
    try:
        if state.message_content:
            message_lower = state.message_content.lower()
            
            # Context-aware response generation
            if "status" in message_lower:
                if state.system_analysis:
                    health = state.system_analysis.get("system_health", "unknown")
                    active = state.system_analysis.get("active_systems", 0)
                    total = state.system_analysis.get("total_systems", 0)
                    
                    state.ai_response = f"System Status: {health.title()} - {active}/{total} systems active. "
                    
                    if state.context_insights:
                        state.ai_response += f"Found {len(state.context_insights)} relevant historical interactions. "
                    
                    if state.suggested_actions:
                        state.ai_response += f"I suggest: {state.suggested_actions[0]['action']}"
                else:
                    state.ai_response = "All systems are operational. Argosa is analyzing data, OneAI is processing animations."
            
            elif "help" in message_lower:
                actions = [action["action"] for action in state.suggested_actions[:3]]
                if actions:
                    state.ai_response = f"Based on your history, I can help with: {', '.join(actions)}"
                else:
                    state.ai_response = "I can help you with confirmations, system status, and task management."
            
            elif "deploy" in message_lower:
                pending_confirmations = len([c for c in confirmations.values() if c.status == "pending"])
                if pending_confirmations > 0:
                    state.ai_response = f"Deployment requires confirmation. You have {pending_confirmations} pending confirmations to review."
                else:
                    state.ai_response = "No pending confirmations. Ready for deployment."
            
            elif "error" in message_lower:
                error_systems = state.system_analysis.get("error_systems", 0)
                if error_systems > 0:
                    state.ai_response = f"I detected {error_systems} systems with errors. Investigating and will provide details."
                else:
                    state.ai_response = "No system errors detected. Please provide more details about the issue."
            
            else:
                # Use context insights for general response
                if state.context_insights:
                    relevant_insight = state.context_insights[0]
                    state.ai_response = f"Based on similar request from {relevant_insight['created_at'][:10]}, I understand you're asking about {state.message_content}. How can I assist you with that?"
                else:
                    state.ai_response = f"I understand you said: '{state.message_content}'. How can I assist you with that?"
        
        state.status = "responded"
        await broadcast_user_input_update({
            "type": "ai_response_generated",
            "response_length": len(state.ai_response or ""),
            "context_used": len(state.context_insights) > 0
        })
        
    except Exception as e:
        state.error = f"Response generation failed: {str(e)}"
        state.status = "error"
    
    return state

async def store_interaction_node(state: UserInputAgentState) -> UserInputAgentState:
    """Store user interaction in RAG for future reference"""
    state.step_count += 1
    
    try:
        # Store successful interactions in RAG
        if state.message_content and state.ai_response:
            await rag_service.add_document(Document(
                id="",
                module="user_input",
                type="interaction",
                content=json.dumps({
                    "user_message": state.message_content,
                    "ai_response": state.ai_response,
                    "context_insights_count": len(state.context_insights),
                    "suggested_actions": state.suggested_actions,
                    "system_analysis": state.system_analysis
                }),
                metadata={
                    "operation": state.operation,
                    "timestamp": datetime.now().isoformat(),
                    "response_quality": "high" if state.context_insights else "standard"
                }
            ))
        
        state.status = "completed"
        
    except Exception as e:
        state.error = f"Storage failed: {str(e)}"
        state.status = "error"
    
    return state

# Create LangGraph workflow
user_input_workflow = StateGraph(UserInputAgentState)
user_input_workflow.add_node("analyze_context", analyze_user_context_node)
user_input_workflow.add_node("generate_response", generate_ai_response_node)
user_input_workflow.add_node("store_interaction", store_interaction_node)

user_input_workflow.set_entry_point("analyze_context")
user_input_workflow.add_edge("analyze_context", "generate_response")
user_input_workflow.add_edge("generate_response", "store_interaction")
user_input_workflow.add_edge("store_interaction", END)

# Compile workflow
user_input_agent = user_input_workflow.compile(checkpointer=MemorySaver())

async def broadcast_user_input_update(update: Dict[str, Any]):
    """Broadcast update to all connected WebSocket clients"""
    disconnected = []
    
    for websocket in active_websockets:
        try:
            await websocket.send_json(update)
        except:
            disconnected.append(websocket)
    
    # Remove disconnected clients
    for ws in disconnected:
        active_websockets.remove(ws)

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
    """Process a user message using LangGraph workflow"""
    user_msg = UserMessage(
        id=f"msg_{uuid.uuid4().hex[:8]}",
        type="user",
        content=message["message"],
        timestamp=datetime.now().isoformat()
    )
    messages.append(user_msg)
    
    # Create initial state for workflow
    initial_state = UserInputAgentState(
        operation="process_message",
        message_content=message["message"]
    )
    
    # Execute workflow
    config = {"configurable": {"thread_id": f"msg_{uuid.uuid4().hex[:8]}"}}
    final_state = await user_input_agent.ainvoke(initial_state, config)
    
    if final_state.status == "completed" and final_state.ai_response:
        system_msg = UserMessage(
            id=f"msg_{uuid.uuid4().hex[:8]}",
            type="system",
            content=final_state.ai_response,
            timestamp=datetime.now().isoformat(),
            metadata={
                "context_insights": len(final_state.context_insights),
                "suggested_actions": final_state.suggested_actions,
                "system_analysis": final_state.system_analysis,
                "workflow_steps": final_state.step_count
            }
        )
        messages.append(system_msg)
        
        # Broadcast to all connected clients
        await broadcast_update({
            "type": "new_message",
            "message": system_msg.dict()
        })
        
        return {
            "reply": final_state.ai_response,
            "context_insights": final_state.context_insights,
            "suggested_actions": final_state.suggested_actions,
            "system_analysis": final_state.system_analysis,
            "workflow_enhanced": True
        }
    else:
        # Fallback response
        fallback_response = f"I received your message: '{message['message']}'. Let me help you with that."
        system_msg = UserMessage(
            id=f"msg_{uuid.uuid4().hex[:8]}",
            type="system",
            content=fallback_response,
            timestamp=datetime.now().isoformat()
        )
        messages.append(system_msg)
        
        return {
            "reply": fallback_response,
            "error": final_state.error,
            "workflow_enhanced": False
        }

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