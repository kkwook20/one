# backend/routers/argosa/data_analysis.py

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
import json
from enum import Enum

# RAG imports
from ...services.rag_service import rag_service, module_integration, Document, RAGQuery

# LangGraph imports (simulated structure)
# from langgraph import StateGraph, State
# from langchain.agents import Agent

router = APIRouter()

# ===== Data Models =====
class AgentType(str, Enum):
    PLANNER = "planner"
    REASONER = "reasoner"
    WEB_SEARCHER = "web_searcher"
    CODE_ANALYZER = "code_analyzer"
    DECISION_MAKER = "decision_maker"

class AnalysisRequest(BaseModel):
    query: str
    context: Optional[Dict[str, Any]] = {}
    agents: List[AgentType] = [AgentType.PLANNER, AgentType.REASONER]
    max_iterations: int = 5
    use_rag_context: bool = True  # RAG 컨텍스트 사용 여부

class AgentState(BaseModel):
    messages: List[Dict[str, str]] = []
    current_plan: Optional[Dict[str, Any]] = None
    web_results: List[Dict[str, Any]] = []
    decisions_pending: List[Dict[str, Any]] = []
    analysis_results: Dict[str, Any] = {}
    iteration: int = 0
    rag_context: Optional[str] = None  # RAG 컨텍스트 저장

class AnalysisResponse(BaseModel):
    id: str
    status: str
    result: Optional[Dict[str, Any]] = None
    agents_used: List[str] = []
    execution_time: float = 0.0
    iterations: int = 0
    rag_documents_used: List[str] = []  # 사용된 RAG 문서 ID

# ===== LangGraph Agent System with RAG =====
class ArgosaAgentSystem:
    def __init__(self):
        self.agents = {}
        self.state_graph = None
        self.active_sessions = {}
        self._setup_agents()
        
    def _setup_agents(self):
        """Initialize all agent types"""
        # Planner Agent - Plans and structures tasks
        self.agents[AgentType.PLANNER] = {
            "name": "Planner Agent",
            "model": "Qwen/Qwen2.5-72B-Instruct",
            "capabilities": ["task_decomposition", "priority_setting", "resource_allocation"],
            "prompt_template": """You are a strategic planner. Analyze the query and create a structured plan.
Query: {query}
Context: {context}
RAG Context: {rag_context}

Create a detailed plan with:
1. Main objectives
2. Sub-tasks with priorities
3. Required resources/agents
4. Expected outcomes
"""
        }
        
        # Reasoner Agent - Deep analysis and reasoning
        self.agents[AgentType.REASONER] = {
            "name": "Reasoner Agent",
            "model": "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
            "capabilities": ["logical_reasoning", "pattern_recognition", "hypothesis_generation"],
            "prompt_template": """You are an analytical reasoner. Examine the information and provide insights.
Current Plan: {plan}
Data: {data}
RAG Context: {rag_context}

Provide:
1. Key insights
2. Potential issues
3. Recommendations
"""
        }
        
        # Web Searcher Agent
        self.agents[AgentType.WEB_SEARCHER] = {
            "name": "Web Search Agent",
            "model": "TheBloke/Llama-2-7B-Chat-GGUF",
            "capabilities": ["web_search", "information_extraction", "source_validation"],
            "prompt_template": """Search for relevant information about: {query}
Focus on: {focus_areas}
Related context from system: {rag_context}
Return structured results with sources.
"""
        }
        
        # Code Analyzer Agent
        self.agents[AgentType.CODE_ANALYZER] = {
            "name": "Code Analysis Agent",
            "model": "WizardLM/WizardCoder-33B-V2",
            "capabilities": ["code_review", "bug_detection", "optimization_suggestions"],
            "prompt_template": """Analyze the code for: {purpose}
Code: {code}
Language: {language}
Historical issues from RAG: {rag_context}

Provide:
1. Issues found
2. Optimization suggestions
3. Best practices violations
"""
        }
        
        # Decision Maker Agent
        self.agents[AgentType.DECISION_MAKER] = {
            "name": "Decision Agent",
            "model": "defog/sqlcoder-7b-2",
            "capabilities": ["decision_analysis", "risk_assessment", "recommendation_generation"],
            "prompt_template": """Make a decision based on:
Options: {options}
Criteria: {criteria}
Context: {context}
Historical decisions from RAG: {rag_context}

Recommend the best option with reasoning.
"""
        }
    
    async def create_workflow(self, request: AnalysisRequest) -> str:
        """Create a LangGraph workflow for the analysis request"""
        session_id = f"session_{datetime.now().timestamp()}"
        
        # Initialize state
        initial_state = AgentState()
        initial_state.messages.append({
            "role": "user",
            "content": request.query,
            "timestamp": datetime.now().isoformat()
        })
        
        # Get RAG context if enabled
        if request.use_rag_context:
            rag_context = await self._get_rag_context(request.query)
            initial_state.rag_context = rag_context
        
        # Create workflow based on selected agents
        workflow = {
            "id": session_id,
            "agents": request.agents,
            "state": initial_state,
            "max_iterations": request.max_iterations,
            "created_at": datetime.now().isoformat(),
            "use_rag": request.use_rag_context
        }
        
        self.active_sessions[session_id] = workflow
        return session_id
    
    async def _get_rag_context(self, query: str) -> str:
        """Get relevant context from RAG system"""
        rag_query = RAGQuery(
            query=query,
            source_module="data_analysis",
            target_modules=None,  # Search all modules
            top_k=5,
            include_context=True
        )
        
        result = await rag_service.search(rag_query)
        return result.context
    
    async def execute_workflow(self, session_id: str) -> AnalysisResponse:
        """Execute the LangGraph workflow with RAG integration"""
        if session_id not in self.active_sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        workflow = self.active_sessions[session_id]
        state = workflow["state"]
        
        start_time = datetime.now()
        rag_docs_used = []
        
        # Execute agent pipeline
        for iteration in range(workflow["max_iterations"]):
            state.iteration = iteration
            
            # Execute each agent in sequence
            for agent_type in workflow["agents"]:
                agent = self.agents.get(agent_type)
                if not agent:
                    continue
                
                # Get agent-specific RAG context
                if workflow["use_rag"]:
                    agent_rag_context = await self._get_agent_specific_context(
                        agent_type, state
                    )
                    state.rag_context = agent_rag_context
                
                # Execute agent with RAG context
                result = await self._execute_agent(agent_type, state)
                
                # Update state based on agent results
                state.analysis_results[agent_type.value] = result
                state.messages.append({
                    "role": "assistant",
                    "agent": agent_type.value,
                    "content": json.dumps(result),
                    "timestamp": datetime.now().isoformat()
                })
                
                # Store result in RAG for future reference
                doc_id = await self._store_agent_result_in_rag(
                    agent_type, result, session_id
                )
                if doc_id:
                    rag_docs_used.append(doc_id)
                
                # Check if we should continue or stop
                if self._should_stop(state):
                    break
            
            if self._should_stop(state):
                break
        
        execution_time = (datetime.now() - start_time).total_seconds()
        
        # Store final analysis in RAG
        final_doc_id = await self._store_final_analysis_in_rag(
            session_id, state.analysis_results
        )
        if final_doc_id:
            rag_docs_used.append(final_doc_id)
        
        # Compile final response
        response = AnalysisResponse(
            id=session_id,
            status="completed",
            result=state.analysis_results,
            agents_used=[a.value for a in workflow["agents"]],
            execution_time=execution_time,
            iterations=state.iteration + 1,
            rag_documents_used=rag_docs_used
        )
        
        return response
    
    async def _get_agent_specific_context(
        self, agent_type: AgentType, state: AgentState
    ) -> str:
        """Get RAG context specific to agent type"""
        target_modules = []
        
        # Define which modules each agent should look at
        if agent_type == AgentType.PLANNER:
            target_modules = ["prediction", "scheduling", "user_input"]
        elif agent_type == AgentType.CODE_ANALYZER:
            target_modules = ["code_analysis", "prediction"]
        elif agent_type == AgentType.DECISION_MAKER:
            target_modules = ["user_input", "prediction", "data_analysis"]
        
        # Build query from current state
        query_parts = []
        if state.current_plan:
            query_parts.append(f"plan: {json.dumps(state.current_plan)}")
        if state.messages:
            query_parts.append(f"context: {state.messages[-1]['content']}")
        
        query = " ".join(query_parts) or "general analysis"
        
        rag_query = RAGQuery(
            query=query,
            source_module="data_analysis",
            target_modules=target_modules if target_modules else None,
            top_k=3,
            include_context=True
        )
        
        result = await rag_service.search(rag_query)
        return result.context
    
    async def _store_agent_result_in_rag(
        self, agent_type: AgentType, result: Dict[str, Any], session_id: str
    ) -> Optional[str]:
        """Store agent result in RAG system"""
        doc = Document(
            id="",
            module="data_analysis",
            type=f"agent_{agent_type.value}_result",
            content=json.dumps(result),
            metadata={
                "session_id": session_id,
                "agent_type": agent_type.value,
                "timestamp": datetime.now().isoformat()
            }
        )
        
        doc_id = await rag_service.add_document(doc)
        return doc_id
    
    async def _store_final_analysis_in_rag(
        self, session_id: str, results: Dict[str, Any]
    ) -> Optional[str]:
        """Store final analysis in RAG system"""
        doc = Document(
            id="",
            module="data_analysis",
            type="final_analysis",
            content=json.dumps(results),
            metadata={
                "session_id": session_id,
                "completed_at": datetime.now().isoformat(),
                "agents_used": list(results.keys())
            }
        )
        
        doc_id = await rag_service.add_document(doc)
        return doc_id
    
    async def _execute_agent(self, agent_type: AgentType, state: AgentState) -> Dict[str, Any]:
        """Execute a specific agent with RAG context"""
        agent = self.agents[agent_type]
        
        # Simulate agent processing
        await asyncio.sleep(0.5)  # Simulate processing time
        
        # Generate results based on agent type and RAG context
        if agent_type == AgentType.PLANNER:
            # Use RAG context to enhance planning
            has_similar_plans = "similar plan found" in (state.rag_context or "")
            
            return {
                "plan": {
                    "objectives": ["Analyze data", "Generate insights", "Make recommendations"],
                    "tasks": [
                        {"id": "t1", "name": "Data Collection", "priority": "high"},
                        {"id": "t2", "name": "Analysis", "priority": "medium"},
                        {"id": "t3", "name": "Reporting", "priority": "low"}
                    ],
                    "timeline": "2 weeks",
                    "based_on_historical": has_similar_plans
                }
            }
        elif agent_type == AgentType.REASONER:
            # Enhanced reasoning with historical context
            insights = ["Pattern detected in user behavior"]
            
            if state.rag_context and "optimization" in state.rag_context:
                insights.append("Historical data suggests optimization opportunities")
            
            return {
                "insights": insights,
                "recommendations": [
                    "Implement caching for improved performance",
                    "Add monitoring for critical paths"
                ],
                "confidence": 0.85 if state.rag_context else 0.70
            }
        elif agent_type == AgentType.WEB_SEARCHER:
            return {
                "results": [
                    {
                        "title": "Relevant Article",
                        "snippet": "Important information about the topic",
                        "url": "https://example.com/article",
                        "relevance": 0.95
                    }
                ],
                "enhanced_by_rag": bool(state.rag_context)
            }
        elif agent_type == AgentType.CODE_ANALYZER:
            issues = [
                {"line": 42, "severity": "warning", "message": "Unused variable"}
            ]
            
            # Add historical issues from RAG
            if state.rag_context and "similar issue" in state.rag_context:
                issues.append({
                    "line": 156, 
                    "severity": "error", 
                    "message": "Similar issue found in history"
                })
            
            return {
                "issues": issues,
                "suggestions": ["Add error handling", "Improve variable naming"],
                "historical_patterns": bool(state.rag_context)
            }
        elif agent_type == AgentType.DECISION_MAKER:
            confidence = 0.85
            if state.rag_context:
                confidence = 0.92  # Higher confidence with historical data
            
            return {
                "decision": "Option A",
                "reasoning": "Based on analysis and historical patterns",
                "confidence": confidence,
                "historical_support": bool(state.rag_context)
            }
        
        return {}
    
    def _should_stop(self, state: AgentState) -> bool:
        """Determine if the workflow should stop"""
        # Stop if we have enough information or reached a decision
        if AgentType.DECISION_MAKER in state.analysis_results:
            return True
        
        # Stop if we've collected sufficient data
        if len(state.messages) > 20:
            return True
        
        return False

# Initialize the agent system
agent_system = ArgosaAgentSystem()

# ===== API Endpoints =====
@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: AnalysisRequest, background_tasks: BackgroundTasks):
    """Start a new analysis with LangGraph agents and RAG"""
    try:
        # Create workflow
        session_id = await agent_system.create_workflow(request)
        
        # Execute workflow
        result = await agent_system.execute_workflow(session_id)
        
        # Log the analysis
        background_tasks.add_task(log_analysis, session_id, result)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get the status of an analysis session"""
    if session_id not in agent_system.active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = agent_system.active_sessions[session_id]
    return {
        "id": session_id,
        "status": "active",
        "agents": session["agents"],
        "iterations": session["state"].iteration,
        "messages": session["state"].messages[-5:],  # Last 5 messages
        "rag_context": session["state"].rag_context[:200] if session["state"].rag_context else None
    }

@router.get("/agents")
async def list_agents():
    """List all available agents and their capabilities"""
    agents_info = []
    for agent_type, agent in agent_system.agents.items():
        agents_info.append({
            "type": agent_type.value,
            "name": agent["name"],
            "model": agent["model"],
            "capabilities": agent["capabilities"]
        })
    return {"agents": agents_info}

@router.post("/agents/test/{agent_type}")
async def test_agent(agent_type: AgentType, query: str, use_rag: bool = True):
    """Test a specific agent with optional RAG context"""
    if agent_type not in agent_system.agents:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Create minimal state for testing
    state = AgentState()
    state.messages.append({"role": "user", "content": query})
    
    # Get RAG context if requested
    if use_rag:
        state.rag_context = await agent_system._get_rag_context(query)
    
    result = await agent_system._execute_agent(agent_type, state)
    
    return {
        "agent": agent_type.value,
        "query": query,
        "result": result,
        "rag_context_used": bool(state.rag_context)
    }

@router.get("/analysis-history")
async def get_analysis_history(limit: int = 10):
    """Get recent analysis history from RAG"""
    rag_query = RAGQuery(
        query="recent analysis sessions",
        source_module="data_analysis",
        target_modules=["data_analysis"],
        top_k=limit
    )
    
    result = await rag_service.search(rag_query)
    
    history = []
    for doc in result.documents:
        if doc.type == "final_analysis":
            history.append({
                "session_id": doc.metadata.get("session_id"),
                "completed_at": doc.metadata.get("completed_at"),
                "agents_used": doc.metadata.get("agents_used", []),
                "summary": doc.content[:200] + "..."
            })
    
    return {"history": history, "total": len(history)}

# ===== Helper Functions =====
async def log_analysis(session_id: str, result: AnalysisResponse):
    """Log analysis results for future reference"""
    log_entry = {
        "session_id": session_id,
        "timestamp": datetime.now().isoformat(),
        "result": result.dict(),
        "success": result.status == "completed"
    }
    
    # In production, save to database
    print(f"[Analysis Log] Session {session_id} completed in {result.execution_time}s")
    print(f"[Analysis Log] Used {len(result.rag_documents_used)} RAG documents")

# ===== Initialize/Shutdown =====
async def initialize():
    """Initialize data analysis module"""
    print("[Data Analysis] Initializing LangGraph agent system with RAG...")
    # Load models, initialize connections, etc.
    print("[Data Analysis] Agent system ready with RAG integration")

async def shutdown():
    """Shutdown data analysis module"""
    print("[Data Analysis] Shutting down agent system...")
    # Clean up resources
    agent_system.active_sessions.clear()
    print("[Data Analysis] Agent system shut down")