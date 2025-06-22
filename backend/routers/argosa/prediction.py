# backend/routers/argosa/prediction.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import json

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

# In-memory storage (replace with database in production)
prediction_cards: Dict[str, PredictionCard] = {}

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
    """Generate AI predictions for a card"""
    if card_id not in prediction_cards:
        raise HTTPException(status_code=404, detail="Card not found")
    
    card = prediction_cards[card_id]
    
    if use_rag:
        # Search for similar completed cards for better predictions
        rag_query = RAGQuery(
            query=f"completed predictions similar to {card.title}",
            source_module="prediction",
            target_modules=["prediction"],
            top_k=3
        )
        
        similar_cards = await rag_service.search(rag_query)
        
        # Generate predictions based on similar cards
        for doc in similar_cards.documents:
            if doc.type == "prediction_card" and "deployed" in doc.content:
                card_data = json.loads(doc.content)
                # Learn from completion time
                if card_data.get("status") == "deployed":
                    new_prediction = Prediction(
                        id=f"pred_{uuid.uuid4().hex[:8]}",
                        description=f"Based on similar project '{card_data.get('title', 'Unknown')}', expected completion time",
                        probability=0.80,
                        impact="high",
                        timeframe="Similar timeline expected"
                    )
                    card.predictions.append(new_prediction)
    else:
        # Simulate AI prediction generation without RAG
        new_prediction = Prediction(
            id=f"pred_{uuid.uuid4().hex[:8]}",
            description=f"Based on current progress, {card.title} will be completed ahead of schedule",
            probability=0.75,
            impact="medium",
            timeframe="1 week earlier than planned"
        )
        card.predictions.append(new_prediction)
    
    card.updatedAt = datetime.now().isoformat()
    
    return {"predictions": card.predictions, "rag_enhanced": use_rag}

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