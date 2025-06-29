# backend/routers/argosa/db_center.py

from fastapi import APIRouter, HTTPException, BackgroundTasks, WebSocket
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
class DBCollection(BaseModel):
    id: str
    name: str
    type: str  # neo4j, vector, hybrid
    size: int  # in bytes
    documents: int
    lastUpdated: str
    status: str  # active, syncing, error

class StorageStats(BaseModel):
    totalSize: int
    usedSize: int
    collections: int
    queries: int
    avgResponseTime: float
    ragQueries: int = 0
    workflowSteps: int = 0

# LangGraph State for DB operations
class DBAgentState(BaseModel):
    operation: str  # query, sync, optimize, backup
    collection_id: Optional[str] = None
    query_text: Optional[str] = None
    query_type: str = "hybrid"
    results: List[Dict[str, Any]] = []
    status: str = "pending"
    error: Optional[str] = None
    metadata: Dict[str, Any] = {}
    step_count: int = 0
    max_retries: int = 3
    retry_count: int = 0

class QueryRequest(BaseModel):
    collection: str
    query: str
    type: str  # graph, vector, hybrid
    limit: Optional[int] = 10

class QueryResult(BaseModel):
    results: List[Dict[str, Any]]
    count: int
    executionTime: float
    queryType: str

# In-memory storage (replace with actual DB connections in production)
collections: Dict[str, DBCollection] = {}
storage_stats = StorageStats(
    totalSize=100 * 1024 * 1024 * 1024,  # 100GB
    usedSize=32 * 1024 * 1024 * 1024,   # 32GB
    collections=0,
    queries=0,
    avgResponseTime=0,
    ragQueries=0,
    workflowSteps=0
)

# WebSocket connections for real-time updates
active_connections: List[WebSocket] = []

# Mock Neo4j and Vector DB connections
class MockNeo4j:
    async def query(self, cypher: str) -> List[Dict]:
        await asyncio.sleep(0.1)  # Simulate query time
        return [
            {"node": "Task", "properties": {"name": "LangGraph Integration", "status": "active"}},
            {"node": "Project", "properties": {"name": "Argosa", "phase": "development"}}
        ]
    
    async def create_node(self, label: str, properties: Dict) -> str:
        return f"node_{uuid.uuid4().hex[:8]}"

class MockVectorDB:
    async def search(self, query: str, limit: int = 10) -> List[Dict]:
        await asyncio.sleep(0.05)  # Simulate search time
        return [
            {"id": "vec_1", "text": "Similar document 1", "score": 0.95},
            {"id": "vec_2", "text": "Similar document 2", "score": 0.87}
        ]
    
    async def insert(self, documents: List[Dict]) -> int:
        return len(documents)

# Initialize mock databases
neo4j_db = MockNeo4j()
vector_db = MockVectorDB()

# LangGraph workflow for database operations
async def analyze_query_node(state: DBAgentState) -> DBAgentState:
    """Analyze the query using RAG for better context"""
    state.step_count += 1
    
    try:
        # Search for similar queries in RAG
        rag_query = RAGQuery(
            query=f"database query: {state.query_text}",
            source_module="db_center",
            target_modules=["db_center", "data_analysis"],
            top_k=3
        )
        
        rag_result = await rag_service.search(rag_query)
        storage_stats.ragQueries += 1
        
        # Enhance query based on historical context
        if rag_result.documents:
            state.metadata["similar_queries"] = [doc.content[:100] for doc in rag_result.documents]
            state.metadata["query_optimization"] = "Enhanced with historical context"
        
        state.status = "analyzed"
        await broadcast_update({
            "type": "db_analysis",
            "query": state.query_text,
            "context_found": len(rag_result.documents)
        })
        
    except Exception as e:
        state.error = f"Analysis failed: {str(e)}"
        state.status = "error"
    
    return state

async def execute_query_node(state: DBAgentState) -> DBAgentState:
    """Execute the database query"""
    state.step_count += 1
    
    try:
        start_time = datetime.now()
        results = []
        
        if state.query_type == "graph":
            results = await neo4j_db.query(state.query_text)
        elif state.query_type == "vector":
            results = await vector_db.search(state.query_text, 10)
        elif state.query_type == "hybrid":
            graph_results = await neo4j_db.query(state.query_text)
            vector_results = await vector_db.search(state.query_text, 10)
            results = {"graph": graph_results, "vector": vector_results}
        
        execution_time = (datetime.now() - start_time).total_seconds() * 1000
        
        state.results = results if isinstance(results, list) else [results]
        state.metadata["execution_time"] = execution_time
        state.status = "executed"
        
        # Update statistics
        storage_stats.queries += 1
        storage_stats.avgResponseTime = (storage_stats.avgResponseTime + execution_time) / 2
        
        await broadcast_update({
            "type": "db_query_executed",
            "execution_time": execution_time,
            "results_count": len(state.results)
        })
        
    except Exception as e:
        state.error = f"Execution failed: {str(e)}"
        state.status = "error"
        state.retry_count += 1
    
    return state

async def store_results_node(state: DBAgentState) -> DBAgentState:
    """Store query results in RAG for future reference"""
    state.step_count += 1
    
    try:
        # Store successful queries in RAG
        if state.status == "executed" and state.results:
            await rag_service.add_document(Document(
                id="",
                module="db_center",
                type="query_result",
                content=json.dumps({
                    "query": state.query_text,
                    "query_type": state.query_type,
                    "results_count": len(state.results),
                    "execution_time": state.metadata.get("execution_time", 0)
                }),
                metadata={
                    "collection_id": state.collection_id,
                    "operation": state.operation,
                    "timestamp": datetime.now().isoformat()
                }
            ))
        
        state.status = "completed"
        
    except Exception as e:
        state.error = f"Storage failed: {str(e)}"
        state.status = "error"
    
    return state

def should_retry(state: DBAgentState) -> str:
    """Determine if operation should be retried"""
    if state.status == "error" and state.retry_count < state.max_retries:
        return "retry"
    return "end"

# Create LangGraph workflow
db_workflow = StateGraph(DBAgentState)
db_workflow.add_node("analyze_query", analyze_query_node)
db_workflow.add_node("execute_query", execute_query_node)
db_workflow.add_node("store_results", store_results_node)

db_workflow.set_entry_point("analyze_query")
db_workflow.add_edge("analyze_query", "execute_query")
db_workflow.add_conditional_edges(
    "execute_query",
    should_retry,
    {
        "retry": "analyze_query",
        "end": "store_results"
    }
)
db_workflow.add_edge("store_results", END)

# Compile workflow
db_agent = db_workflow.compile(checkpointer=MemorySaver())

async def broadcast_update(update: Dict[str, Any]):
    """Broadcast update to all connected WebSocket clients"""
    disconnected = []
    
    for connection in active_connections:
        try:
            await connection.send_json(update)
        except:
            disconnected.append(connection)
    
    # Remove disconnected clients
    for conn in disconnected:
        active_connections.remove(conn)

# ===== API Endpoints =====
@router.get("/collections")
async def get_collections():
    """Get all database collections"""
    return list(collections.values())

@router.post("/collections")
async def create_collection(collection: DBCollection):
    """Create a new database collection"""
    collection.id = f"col_{uuid.uuid4().hex[:8]}"
    collection.lastUpdated = datetime.now().isoformat()
    collection.status = "active"
    
    collections[collection.id] = collection
    storage_stats.collections = len(collections)
    
    return collection

@router.get("/collections/{collection_id}")
async def get_collection(collection_id: str):
    """Get details of a specific collection"""
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    return collections[collection_id]

@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str):
    """Delete a collection"""
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    collection = collections.pop(collection_id)
    storage_stats.collections = len(collections)
    storage_stats.usedSize -= collection.size
    
    return {"message": f"Collection {collection.name} deleted"}

@router.get("/stats")
async def get_storage_stats():
    """Get storage statistics"""
    return storage_stats

@router.post("/query")
async def query_database(request: QueryRequest):
    """Query the database using LangGraph workflow"""
    # Create initial state
    initial_state = DBAgentState(
        operation="query",
        collection_id=request.collection,
        query_text=request.query,
        query_type=request.type
    )
    
    # Execute workflow
    config = {"configurable": {"thread_id": f"query_{uuid.uuid4().hex[:8]}"}}
    final_state = await db_agent.ainvoke(initial_state, config)
    
    storage_stats.workflowSteps += final_state.step_count
    
    # Return results
    if final_state.status == "completed":
        return QueryResult(
            results=final_state.results,
            count=len(final_state.results),
            executionTime=final_state.metadata.get("execution_time", 0),
            queryType=final_state.query_type
        )
    else:
        raise HTTPException(
            status_code=500, 
            detail=f"Query failed: {final_state.error}"
        )

@router.post("/sync")
async def sync_databases(background_tasks: BackgroundTasks):
    """Synchronize all databases"""
    # Update all collection statuses
    for collection in collections.values():
        collection.status = "syncing"
    
    # Start sync in background
    background_tasks.add_task(perform_sync)
    
    return {"message": "Synchronization started", "collections": len(collections)}

@router.post("/import/{collection_id}")
async def import_data(collection_id: str, data: Dict[str, Any]):
    """Import data into a collection"""
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    collection = collections[collection_id]
    
    # Process based on collection type
    if collection.type == "neo4j":
        # Import as graph nodes
        nodes_created = 0
        for item in data.get("nodes", []):
            await neo4j_db.create_node(item.get("label", "Node"), item.get("properties", {}))
            nodes_created += 1
        
        collection.documents += nodes_created
    
    elif collection.type == "vector":
        # Import as vector documents
        documents = data.get("documents", [])
        inserted = await vector_db.insert(documents)
        collection.documents += inserted
    
    elif collection.type == "hybrid":
        # Import both types
        nodes_created = len(data.get("nodes", []))
        docs_inserted = len(data.get("documents", []))
        collection.documents += nodes_created + docs_inserted
    
    collection.lastUpdated = datetime.now().isoformat()
    collection.size += len(str(data).encode())  # Rough size estimate
    
    return {
        "collection": collection.name,
        "imported": collection.documents,
        "status": "success"
    }

@router.post("/export/{collection_id}")
async def export_data(collection_id: str):
    """Export data from a collection"""
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    collection = collections[collection_id]
    
    # Mock export data
    export_data = {
        "collection": collection.name,
        "type": collection.type,
        "exported_at": datetime.now().isoformat(),
        "documents": collection.documents,
        "data": []  # Would contain actual data in production
    }
    
    if collection.type == "neo4j":
        export_data["data"] = await neo4j_db.query("MATCH (n) RETURN n")
    elif collection.type == "vector":
        export_data["data"] = await vector_db.search("*", limit=1000)
    
    return export_data

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time database operations"""
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        # Send initial status
        await websocket.send_json({
            "type": "db_status",
            "stats": storage_stats.dict(),
            "collections": len(collections)
        })
        
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "query":
                # Execute query through workflow
                initial_state = DBAgentState(
                    operation="query",
                    collection_id=data.get("collection", "default"),
                    query_text=data.get("query", ""),
                    query_type=data.get("query_type", "hybrid")
                )
                
                config = {"configurable": {"thread_id": f"ws_query_{uuid.uuid4().hex[:8]}"}}
                final_state = await db_agent.ainvoke(initial_state, config)
                
                await websocket.send_json({
                    "type": "query_result",
                    "status": final_state.status,
                    "results": final_state.results,
                    "execution_time": final_state.metadata.get("execution_time", 0),
                    "error": final_state.error
                })
            
            elif data.get("type") == "get_stats":
                await websocket.send_json({
                    "type": "stats_update",
                    "stats": storage_stats.dict()
                })
    
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)

@router.post("/optimize/{collection_id}")
async def optimize_collection(collection_id: str):
    """Optimize a collection for better performance"""
    if collection_id not in collections:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    collection = collections[collection_id]
    
    # Simulate optimization
    await asyncio.sleep(2)
    
    # Update collection stats
    collection.size = int(collection.size * 0.85)  # 15% size reduction
    collection.lastUpdated = datetime.now().isoformat()
    
    return {
        "collection": collection.name,
        "optimization": "completed",
        "size_reduction": "15%",
        "performance_improvement": "estimated 25% faster queries"
    }

# ===== Helper Functions =====
async def perform_sync():
    """Perform database synchronization"""
    await asyncio.sleep(5)  # Simulate sync time
    
    # Update all collections back to active
    for collection in collections.values():
        collection.status = "active"
        collection.lastUpdated = datetime.now().isoformat()

# ===== Initialize/Shutdown =====
async def initialize():
    """Initialize DB Center module"""
    print("[DB Center] Initializing database management system...")
    
    # Create sample collections
    sample_collections = [
        DBCollection(
            id="col_analysis",
            name="analysis_results",
            type="vector",
            size=int(1.2 * 1024 * 1024 * 1024),  # int()로 변환
            documents=15420,
            lastUpdated=datetime.now().isoformat(),
            status="active"
        ),
        DBCollection(
            id="col_relationships",
            name="project_relationships",
            type="neo4j",
            size=800 * 1024 * 1024,  # 이미 int
            documents=8930,
            lastUpdated=datetime.now().isoformat(),
            status="active"
        ),
        DBCollection(
            id="col_feedback",
            name="user_feedback",
            type="hybrid",
            size=450 * 1024 * 1024,  # 이미 int
            documents=3256,
            lastUpdated=datetime.now().isoformat(),
            status="active"
        )
    ]
    
    for col in sample_collections:
        collections[col.id] = col
    
    storage_stats.collections = len(collections)
    
    print("[DB Center] Database management system ready")

async def shutdown():
    """Shutdown DB Center module"""
    print("[DB Center] Shutting down database management system...")
    
    # Close database connections (in production)
    # await neo4j_db.close()
    # await vector_db.close()
    
    collections.clear()
    
    print("[DB Center] Database management system shut down")