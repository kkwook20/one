# backend/routers/argosa/prediction.py

from fastapi import APIRouter, HTTPException, WebSocket
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import json
import asyncio
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

# RAG imports
from services.rag_service import rag_service, module_integration, Document, RAGQuery

router = APIRouter()

# ===== Data Models =====
class Comment(BaseModel):
    id: str
    text: str
    author: str
    timestamp: str
    isApplied: bool = False

class Prediction(BaseModel):
    id: str
    description: str
    probability: float
    impact: str  # low, medium, high
    timeframe: str

class PredictionCard(BaseModel):
    id: Optional[str] = None
    title: str
    content: str
    improvements: List[str] = []
    futureFeatures: List[str] = []
    status: str = 'idea'  # idea, planning, development, testing, deployed
    priority: str = 'medium'  # low, medium, high
    category: str  # concept, service, code, feature
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    author: str
    comments: List[Comment] = []
    predictions: List[Prediction] = []
    progress: int = 0
    relatedDocuments: List[str] = []  # RAG 관련 문서 ID들
    contextSources: Dict[str, int] = {}  # 컨텍스트 소스별 참조 횟수

# LangGraph State for prediction operations
class PredictionAgentState(BaseModel):
    operation: str  # create, analyze, predict, enhance
    card_id: Optional[str] = None
    card_data: Optional[Dict[str, Any]] = None
    rag_enhanced: bool = True
    predictions: List[Dict[str, Any]] = []
    improvements: List[str] = []
    related_work: List[Dict[str, Any]] = []
    status: str = "pending"
    error: Optional[str] = None
    metadata: Dict[str, Any] = {}
    step_count: int = 0

# In-memory storage (replace with database in production)
prediction_cards: Dict[str, PredictionCard] = {}
active_websockets: List[WebSocket] = []

# LangGraph workflow for prediction operations
async def analyze_context_node(state: PredictionAgentState) -> PredictionAgentState:
    """Analyze context using RAG for prediction enhancement"""
    state.step_count += 1
    
    try:
        if state.rag_enhanced and state.card_data:
            # Search for historical context
            historical_context = await module_integration.prediction_with_history(
                state.card_data.get("title", "")
            )
            
            # Search for related work
            rag_query = RAGQuery(
                query=f"{state.card_data.get('title', '')} {state.card_data.get('content', '')}",
                source_module="prediction",
                target_modules=["data_analysis", "code_analysis", "scheduling"],
                top_k=5
            )
            
            rag_result = await rag_service.search(rag_query)
            
            # Process results
            for doc in rag_result.documents:
                state.related_work.append({
                    "id": doc.id,
                    "module": doc.module,
                    "content": doc.content[:200],
                    "created_at": doc.created_at
                })
                
                # Generate context-aware improvements
                if doc.module == "data_analysis" and "performance" in doc.content:
                    state.improvements.append(
                        f"Based on analysis from {doc.created_at}, expected performance improvement"
                    )
                elif doc.module == "scheduling" and doc.type == "task":
                    task_data = json.loads(doc.content)
                    state.improvements.append(
                        f"Related task '{task_data.get('name', 'Unknown')}' may affect timeline"
                    )
            
            state.metadata["historical_insights"] = historical_context["historical_insights"]
            state.metadata["context_sources"] = len(rag_result.documents)
        
        state.status = "analyzed"
        await broadcast_prediction_update({
            "type": "prediction_analysis",
            "card_id": state.card_id,
            "context_found": len(state.related_work)
        })
        
    except Exception as e:
        state.error = f"Analysis failed: {str(e)}"
        state.status = "error"
    
    return state

async def generate_predictions_node(state: PredictionAgentState) -> PredictionAgentState:
    """Generate AI predictions based on context"""
    state.step_count += 1
    
    try:
        # Generate predictions based on related work
        for related_doc in state.related_work:
            if related_doc["module"] == "data_analysis":
                state.predictions.append({
                    "id": f"pred_{uuid.uuid4().hex[:8]}",
                    "description": f"Based on {related_doc['module']} insights, expected outcome improvement",
                    "probability": 0.85,
                    "impact": "high",
                    "timeframe": "2-3 weeks",
                    "source": related_doc["id"]
                })
            elif related_doc["module"] == "scheduling":
                state.predictions.append({
                    "id": f"pred_{uuid.uuid4().hex[:8]}",
                    "description": f"Timeline correlation with scheduled tasks identified",
                    "probability": 0.70,
                    "impact": "medium",
                    "timeframe": "Variable based on schedule",
                    "source": related_doc["id"]
                })
        
        # Default predictions if no context found
        if not state.predictions and state.card_data:
            card_content = state.card_data.get("content", "")
            if "AI" in card_content or "LangGraph" in card_content:
                state.predictions.append({
                    "id": f"pred_{uuid.uuid4().hex[:8]}",
                    "description": "AI implementation will improve system efficiency by 30-40%",
                    "probability": 0.85,
                    "impact": "high",
                    "timeframe": "2-3 weeks",
                    "source": "ai_analysis"
                })
        
        state.status = "predicted"
        await broadcast_prediction_update({
            "type": "predictions_generated",
            "card_id": state.card_id,
            "predictions_count": len(state.predictions)
        })
        
    except Exception as e:
        state.error = f"Prediction generation failed: {str(e)}"
        state.status = "error"
    
    return state

async def store_prediction_node(state: PredictionAgentState) -> PredictionAgentState:
    """Store prediction results in RAG and update card"""
    state.step_count += 1
    
    try:
        if state.card_id and state.card_id in prediction_cards:
            card = prediction_cards[state.card_id]
            
            # Update card with new predictions and improvements
            for pred_data in state.predictions:
                prediction = Prediction(
                    id=pred_data["id"],
                    description=pred_data["description"],
                    probability=pred_data["probability"],
                    impact=pred_data["impact"],
                    timeframe=pred_data["timeframe"]
                )
                card.predictions.append(prediction)
            
            card.improvements.extend(state.improvements)
            card.relatedDocuments.extend([doc["id"] for doc in state.related_work])
            
            # Update context sources
            for doc in state.related_work:
                module = doc["module"]
                card.contextSources[module] = card.contextSources.get(module, 0) + 1
            
            card.updatedAt = datetime.now().isoformat()
            
            # Store in RAG for future reference
            await rag_service.add_document(Document(
                id="",
                module="prediction",
                type="prediction_analysis",
                content=json.dumps({
                    "card_id": state.card_id,
                    "predictions": state.predictions,
                    "improvements": state.improvements,
                    "context_sources": len(state.related_work)
                }),
                metadata={
                    "card_id": state.card_id,
                    "operation": state.operation,
                    "rag_enhanced": state.rag_enhanced
                }
            ))
        
        state.status = "completed"
        
    except Exception as e:
        state.error = f"Storage failed: {str(e)}"
        state.status = "error"
    
    return state

# Create LangGraph workflow
prediction_workflow = StateGraph(PredictionAgentState)
prediction_workflow.add_node("analyze_context", analyze_context_node)
prediction_workflow.add_node("generate_predictions", generate_predictions_node)
prediction_workflow.add_node("store_prediction", store_prediction_node)

prediction_workflow.set_entry_point("analyze_context")
prediction_workflow.add_edge("analyze_context", "generate_predictions")
prediction_workflow.add_edge("generate_predictions", "store_prediction")
prediction_workflow.add_edge("store_prediction", END)

# Compile workflow
prediction_agent = prediction_workflow.compile(checkpointer=MemorySaver())

async def broadcast_prediction_update(update: Dict[str, Any]):
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
async def get_prediction_cards():
    """Get all prediction cards"""
    return list(prediction_cards.values())

@router.post("/", response_model=PredictionCard)
async def create_prediction_card(card: PredictionCard, use_rag: bool = True):
    """Create a new prediction card with optional RAG enhancement"""
    # Generate ID and timestamps
    card.id = f"card_{uuid.uuid4().hex[:8]}"
    card.createdAt = datetime.now().isoformat()
    card.updatedAt = card.createdAt
    
    if use_rag:
        # Get historical context from RAG
        historical_context = await module_integration.prediction_with_history(card.title)
        
        # Search for related analysis and code reviews
        rag_query = RAGQuery(
            query=f"{card.title} {card.content}",
            source_module="prediction",
            target_modules=["data_analysis", "code_analysis", "scheduling"],
            top_k=5
        )
        
        rag_result = await rag_service.search(rag_query)
        
        # Generate AI predictions based on RAG context
        predictions = []
        
        # Track context sources
        for doc in rag_result.documents:
            card.relatedDocuments.append(doc.id)
            card.contextSources[doc.module] = card.contextSources.get(doc.module, 0) + 1
            
            if doc.module == "data_analysis" and "performance" in doc.content:
                predictions.append(Prediction(
                    id=f"pred_{uuid.uuid4().hex[:8]}",
                    description=f"Based on analysis from {doc.created_at}, expected performance improvement",
                    probability=0.85,
                    impact="high",
                    timeframe="2-3 weeks"
                ))
            elif doc.module == "scheduling" and doc.type == "task":
                task_data = json.loads(doc.content)
                predictions.append(Prediction(
                    id=f"pred_{uuid.uuid4().hex[:8]}",
                    description=f"Related task '{task_data.get('name', 'Unknown')}' may affect timeline",
                    probability=0.70,
                    impact="medium",
                    timeframe=task_data.get('endDate', 'Unknown')
                ))
        
        card.predictions.extend(predictions)
        
        # Add improvements from historical insights
        for insight in historical_context["historical_insights"]:
            if insight["type"] == "code":
                card.improvements.append(f"Code insight: {insight['content'][:100]}...")
            elif insight["type"] == "analysis":
                card.futureFeatures.append(f"Based on analysis: {insight['content'][:100]}...")
    else:
        # Default AI-powered predictions without RAG
        if "AI" in card.content or "LangGraph" in card.content:
            card.predictions.append(Prediction(
                id=f"pred_{uuid.uuid4().hex[:8]}",
                description="Implementation will improve system efficiency by 30-40%",
                probability=0.85,
                impact="high",
                timeframe="2-3 weeks"
            ))
    
    # Store card
    prediction_cards[card.id] = card
    
    # Store in RAG for future reference
    if use_rag:
        await rag_service.add_document(Document(
            id="",
            module="prediction",
            type="prediction_card",
            content=json.dumps(card.dict()),
            metadata={
                "card_id": card.id,
                "category": card.category,
                "priority": card.priority,
                "related_docs": card.relatedDocuments
            }
        ))
    
    return card

@router.get("/{card_id}")
async def get_prediction_card(card_id: str):
    """Get a specific prediction card"""
    if card_id not in prediction_cards:
        raise HTTPException(status_code=404, detail="Card not found")
    return prediction_cards[card_id]

@router.get("/{card_id}/related")
async def get_related_work(card_id: str):
    """Get related work from RAG system"""
    if card_id not in prediction_cards:
        raise HTTPException(status_code=404, detail="Card not found")
    
    card = prediction_cards[card_id]
    
    # Search for the card's document in RAG
    rag_query = RAGQuery(
        query=f"prediction card {card_id}",
        source_module="prediction",
        target_modules=["prediction"],
        top_k=1
    )
    
    rag_result = await rag_service.search(rag_query)
    
    if rag_result.documents:
        doc_id = rag_result.documents[0].id
        related_docs = await rag_service.find_related_work(doc_id, cross_module=True)
        
        return {
            "card_id": card_id,
            "related_work": [
                {
                    "id": doc.id,
                    "module": doc.module,
                    "type": doc.type,
                    "summary": doc.content[:200] + "...",
                    "created_at": doc.created_at
                }
                for doc in related_docs
            ],
            "total": len(related_docs)
        }
    
    return {"card_id": card_id, "related_work": [], "total": 0}

@router.patch("/{card_id}/status")
async def update_card_status(card_id: str, status: Dict[str, str]):
    """Update card status"""
    if card_id not in prediction_cards:
        raise HTTPException(status_code=404, detail="Card not found")
    
    card = prediction_cards[card_id]
    old_status = card.status
    card.status = status["status"]
    card.updatedAt = datetime.now().isoformat()
    
    # Update progress based on status
    progress_map = {
        'idea': 10,
        'planning': 25,
        'development': 50,
        'testing': 75,
        'deployed': 100
    }
    card.progress = progress_map.get(card.status, card.progress)
    
    # Store status change in RAG
    await rag_service.add_document(Document(
        id="",
        module="prediction",
        type="status_change",
        content=json.dumps({
            "card_id": card_id,
            "old_status": old_status,
            "new_status": card.status,
            "progress": card.progress
        }),
        metadata={
            "card_id": card_id,
            "timestamp": card.updatedAt
        }
    ))
    
    return card

@router.post("/{card_id}/comments")
async def add_comment(card_id: str, comment: Comment):
    """Add a comment to a card"""
    if card_id not in prediction_cards:
        raise HTTPException(status_code=404, detail="Card not found")
    
    card = prediction_cards[card_id]
    comment.id = f"comment_{uuid.uuid4().hex[:8]}"
    comment.timestamp = datetime.now().isoformat()
    card.comments.append(comment)
    card.updatedAt = datetime.now().isoformat()
    
    # AI analysis of comment for automatic improvements
    if "improve" in comment.text.lower() or "optimize" in comment.text.lower():
        card.improvements.append(f"Suggested improvement from {comment.author}: {comment.text}")
    
    # Store comment in RAG for tracking discussions
    await rag_service.add_document(Document(
        id="",
        module="prediction",
        type="comment",
        content=comment.text,
        metadata={
            "card_id": card_id,
            "comment_id": comment.id,
            "author": comment.author,
            "timestamp": comment.timestamp
        }
    ))
    
    return card

@router.post("/{card_id}/predict")
async def generate_predictions(card_id: str, use_rag: bool = True):
    """Generate AI predictions for a card using LangGraph workflow"""
    if card_id not in prediction_cards:
        raise HTTPException(status_code=404, detail="Card not found")
    
    card = prediction_cards[card_id]
    
    # Create initial state for workflow
    initial_state = PredictionAgentState(
        operation="predict",
        card_id=card_id,
        card_data=card.dict(),
        rag_enhanced=use_rag
    )
    
    # Execute workflow
    config = {"configurable": {"thread_id": f"predict_{card_id}_{uuid.uuid4().hex[:8]}"}}
    final_state = await prediction_agent.ainvoke(initial_state, config)
    
    if final_state.status == "completed":
        updated_card = prediction_cards[card_id]
        return {
            "predictions": [pred.dict() for pred in updated_card.predictions],
            "improvements": updated_card.improvements,
            "related_work": final_state.related_work,
            "rag_enhanced": use_rag,
            "context_sources": updated_card.contextSources,
            "workflow_steps": final_state.step_count
        }
    else:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction generation failed: {final_state.error}"
        )

@router.get("/insights/summary")
async def get_prediction_insights():
    """Get overall prediction system insights from RAG"""
    # Get insights from RAG
    insights = await rag_service.get_module_insights("prediction", days=30)
    
    # Add card-specific metrics
    total_cards = len(prediction_cards)
    status_distribution = {}
    category_distribution = {}
    
    for card in prediction_cards.values():
        status_distribution[card.status] = status_distribution.get(card.status, 0) + 1
        category_distribution[card.category] = category_distribution.get(card.category, 0) + 1
    
    return {
        "total_cards": total_cards,
        "status_distribution": status_distribution,
        "category_distribution": category_distribution,
        "rag_insights": insights,
        "average_predictions_per_card": sum(len(c.predictions) for c in prediction_cards.values()) / total_cards if total_cards > 0 else 0,
        "cards_with_rag_context": sum(1 for c in prediction_cards.values() if c.relatedDocuments) / total_cards * 100 if total_cards > 0 else 0
    }

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time prediction updates"""
    await websocket.accept()
    active_websockets.append(websocket)
    
    try:
        # Send initial status
        await websocket.send_json({
            "type": "prediction_status",
            "total_cards": len(prediction_cards),
            "active_predictions": sum(1 for c in prediction_cards.values() if c.predictions)
        })
        
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "create_prediction":
                # Create prediction through workflow
                card_data = data.get("card_data", {})
                card_data["id"] = f"card_{uuid.uuid4().hex[:8]}"
                card_data["createdAt"] = datetime.now().isoformat()
                card_data["updatedAt"] = card_data["createdAt"]
                
                initial_state = PredictionAgentState(
                    operation="create",
                    card_id=card_data["id"],
                    card_data=card_data,
                    rag_enhanced=data.get("use_rag", True)
                )
                
                config = {"configurable": {"thread_id": f"ws_create_{uuid.uuid4().hex[:8]}"}}
                final_state = await prediction_agent.ainvoke(initial_state, config)
                
                await websocket.send_json({
                    "type": "prediction_created",
                    "status": final_state.status,
                    "card_id": final_state.card_id,
                    "predictions_count": len(final_state.predictions),
                    "error": final_state.error
                })
            
            elif data.get("type") == "get_insights":
                insights = await get_prediction_insights()
                await websocket.send_json({
                    "type": "insights_update",
                    "insights": insights
                })
    
    except Exception as e:
        print(f"Prediction WebSocket error: {e}")
    finally:
        if websocket in active_websockets:
            active_websockets.remove(websocket)

# ===== Initialize/Shutdown =====
async def initialize():
    """Initialize prediction module"""
    print("[Prediction] Initializing prediction system with RAG...")
    
    # Load sample data
    sample_card = PredictionCard(
        id="sample_1",
        title="AI Agent Coordination System",
        content="Implement a multi-agent system for better task coordination",
        category="feature",
        author="System",
        priority="high",
        status="planning",
        improvements=["Use message queues for agent communication"],
        futureFeatures=["Auto-scaling based on workload", "Agent health monitoring"],
        progress=25
    )
    sample_card.createdAt = datetime.now().isoformat()
    sample_card.updatedAt = sample_card.createdAt
    
    prediction_cards[sample_card.id] = sample_card
    
    print("[Prediction] Prediction system ready with RAG integration")

async def shutdown():
    """Shutdown prediction module"""
    print("[Prediction] Shutting down prediction system...")
    prediction_cards.clear()
    print("[Prediction] Prediction system shut down")