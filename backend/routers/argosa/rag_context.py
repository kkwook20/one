# backend/routers/argosa/rag_context.py

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from ...services.rag_service import rag_service, module_integration, RAGQuery

router = APIRouter()

# ===== Cross-Module Context APIs =====
@router.get("/context/{module}")
async def get_module_context(module: str, limit: int = 10):
    """특정 모듈의 최신 컨텍스트 가져오기"""
    context = await rag_service.get_module_context(module, limit)
    return {
        "module": module,
        "context": context,
        "document_count": sum(len(docs) for docs in context.values())
    }

@router.post("/search")
async def search_cross_module(query: RAGQuery):
    """크로스 모듈 검색"""
    result = await rag_service.search(query)
    return {
        "documents": [doc.dict() for doc in result.documents],
        "context": result.context,
        "relevance_scores": result.relevance_scores,
        "cross_references": result.cross_references
    }

@router.get("/relationships/{doc_id}")
async def get_document_relationships(doc_id: str):
    """문서의 관계 맵 가져오기"""
    related_docs = await rag_service.find_related_work(doc_id, cross_module=True)
    
    # Build relationship graph
    nodes = []
    edges = []
    
    # Add source document
    if doc_id in rag_service.documents:
        source_doc = rag_service.documents[doc_id]
        nodes.append({
            "id": doc_id,
            "label": f"{source_doc.module}:{source_doc.type}",
            "module": source_doc.module,
            "type": source_doc.type
        })
    
    # Add related documents
    for doc in related_docs:
        nodes.append({
            "id": doc.id,
            "label": f"{doc.module}:{doc.type}",
            "module": doc.module,
            "type": doc.type
        })
        
        edges.append({
            "source": doc_id,
            "target": doc.id,
            "type": "related"
        })
    
    return {
        "nodes": nodes,
        "edges": edges,
        "total_relationships": len(related_docs)
    }

@router.get("/insights/{module}")
async def get_module_insights(module: str, days: int = 7):
    """모듈별 인사이트 생성"""
    # Get recent documents
    module_docs = []
    for doc_id in rag_service.module_indices.get(module, []):
        if doc_id in rag_service.documents:
            module_docs.append(rag_service.documents[doc_id])
    
    # Generate insights
    insights = {
        "total_documents": len(module_docs),
        "document_types": {},
        "cross_module_references": {},
        "trending_topics": [],
        "recent_activity": []
    }
    
    # Count document types
    for doc in module_docs:
        doc_type = doc.type
        insights["document_types"][doc_type] = insights["document_types"].get(doc_type, 0) + 1
    
    # Count cross-module references
    for doc in module_docs:
        for ref_id in doc.references:
            if ref_id in rag_service.documents:
                ref_doc = rag_service.documents[ref_id]
                if ref_doc.module != module:
                    ref_module = ref_doc.module
                    insights["cross_module_references"][ref_module] = \
                        insights["cross_module_references"].get(ref_module, 0) + 1
    
    # Extract trending topics (simple keyword frequency)
    all_content = " ".join([doc.content for doc in module_docs[-50:]])  # Last 50 docs
    words = all_content.lower().split()
    word_freq = {}
    
    for word in words:
        if len(word) > 5:  # Focus on meaningful words
            word_freq[word] = word_freq.get(word, 0) + 1
    
    # Top trending topics
    sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
    insights["trending_topics"] = [word for word, freq in sorted_words[:10]]
    
    # Recent activity
    recent_docs = sorted(module_docs, key=lambda x: x.created_at, reverse=True)[:5]
    insights["recent_activity"] = [
        {
            "type": doc.type,
            "created_at": doc.created_at,
            "references": len(doc.references)
        }
        for doc in recent_docs
    ]
    
    return insights

@router.get("/workflow-context/{session_id}")
async def get_workflow_context(session_id: str):
    """특정 워크플로우의 전체 컨텍스트"""
    # Search for all documents related to this session
    rag_query = RAGQuery(
        query=f"session {session_id}",
        source_module="data_analysis",
        target_modules=None,
        top_k=20
    )
    
    result = await rag_service.search(rag_query)
    
    # Organize by module and type
    context_map = {}
    for doc in result.documents:
        if doc.metadata.get("session_id") == session_id:
            if doc.module not in context_map:
                context_map[doc.module] = {}
            if doc.type not in context_map[doc.module]:
                context_map[doc.module][doc.type] = []
            
            context_map[doc.module][doc.type].append({
                "content": doc.content[:200] + "...",
                "created_at": doc.created_at,
                "doc_id": doc.id
            })
    
    return {
        "session_id": session_id,
        "context_map": context_map,
        "total_documents": len(result.documents),
        "modules_involved": list(context_map.keys())
    }

@router.post("/suggest-next-action")
async def suggest_next_action(current_state: Dict[str, Any]):
    """현재 상태 기반 다음 액션 제안"""
    module = current_state.get("module", "unknown")
    action_type = current_state.get("action_type", "")
    
    # Search for similar past actions
    rag_query = RAGQuery(
        query=f"{module} {action_type} next steps",
        source_module=module,
        target_modules=None,
        top_k=10
    )
    
    similar_actions = await rag_service.search(rag_query)
    
    # Analyze patterns
    next_actions = {}
    for doc in similar_actions.documents:
        if doc.type == "action_sequence" or "next" in doc.metadata:
            next_action = doc.metadata.get("next_action", "unknown")
            next_actions[next_action] = next_actions.get(next_action, 0) + 1
    
    # Sort by frequency
    sorted_actions = sorted(next_actions.items(), key=lambda x: x[1], reverse=True)
    
    suggestions = []
    for action, count in sorted_actions[:3]:
        suggestions.append({
            "action": action,
            "confidence": count / len(similar_actions.documents),
            "based_on": f"{count} similar cases"
        })
    
    # Add context-based suggestions
    if module == "data_analysis" and "complete" in action_type:
        suggestions.append({
            "action": "create_prediction_card",
            "confidence": 0.8,
            "based_on": "typical workflow pattern"
        })
    elif module == "code_analysis" and "issue" in action_type:
        suggestions.append({
            "action": "schedule_fix_task",
            "confidence": 0.7,
            "based_on": "issue resolution pattern"
        })
    
    return {
        "current_state": current_state,
        "suggestions": suggestions,
        "context_documents": len(similar_actions.documents)
    }

@router.get("/system-health")
async def get_system_health():
    """RAG 시스템 상태 및 통계"""
    total_docs = len(rag_service.documents)
    
    # Calculate module activity
    module_activity = {}
    for module, doc_ids in rag_service.module_indices.items():
        module_activity[module] = {
            "document_count": len(doc_ids),
            "percentage": (len(doc_ids) / total_docs * 100) if total_docs > 0 else 0
        }
    
    # Calculate cross-references
    total_references = sum(len(doc.references) for doc in rag_service.documents.values())
    
    # Find most connected documents
    most_connected = sorted(
        rag_service.documents.values(),
        key=lambda x: len(x.references),
        reverse=True
    )[:5]
    
    return {
        "total_documents": total_docs,
        "total_references": total_references,
        "avg_references_per_doc": total_references / total_docs if total_docs > 0 else 0,
        "module_activity": module_activity,
        "most_connected_documents": [
            {
                "id": doc.id,
                "module": doc.module,
                "type": doc.type,
                "reference_count": len(doc.references)
            }
            for doc in most_connected
        ],
        "cache_size": len(rag_service.embeddings_cache),
        "status": "healthy" if total_docs > 0 else "empty"
    }

# ===== Initialize RAG Context Router =====
async def initialize():
    """Initialize RAG context router"""
    print("[RAG Context] Initializing RAG context API...")
    print("[RAG Context] RAG context API ready")

async def shutdown():
    """Shutdown RAG context router"""
    print("[RAG Context] Shutting down RAG context API...")
    print("[RAG Context] RAG context API shut down")