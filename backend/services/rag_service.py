# backend/services/rag_service.py

from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import numpy as np
from pydantic import BaseModel
import asyncio
import json

# ===== Data Models =====
class Document(BaseModel):
    id: str
    module: str  # 어느 모듈에서 생성된 문서인지
    type: str    # analysis, prediction, code, schedule, etc.
    content: str
    metadata: Dict[str, Any]
    embedding: Optional[List[float]] = None
    created_at: str
    references: List[str] = []  # 다른 문서들과의 참조 관계

class RAGQuery(BaseModel):
    query: str
    source_module: str
    target_modules: Optional[List[str]] = None  # None이면 모든 모듈 검색
    top_k: int = 5
    include_context: bool = True

class RAGResult(BaseModel):
    documents: List[Document]
    context: str
    relevance_scores: List[float]
    cross_references: Dict[str, List[str]]  # 모듈 간 참조 관계

# ===== RAG Service Class =====
class RAGService:
    def __init__(self):
        self.documents: Dict[str, Document] = {}
        self.module_indices: Dict[str, List[str]] = {
            "data_collection": [],
            "data_analysis": [],
            "prediction": [],
            "scheduling": [],
            "code_analysis": [],
            "user_input": [],
            "db_center": []
        }
        self.embeddings_cache: Dict[str, np.ndarray] = {}
        
    async def add_document(self, doc: Document) -> str:
        """문서 추가 및 임베딩 생성"""
        # Generate embedding
        doc.embedding = await self._generate_embedding(doc.content)
        doc.id = f"doc_{uuid.uuid4().hex[:8]}"
        doc.created_at = datetime.now().isoformat()
        
        # Store document
        self.documents[doc.id] = doc
        
        # Update module index
        if doc.module in self.module_indices:
            self.module_indices[doc.module].append(doc.id)
        
        # Find and update cross-references
        await self._update_cross_references(doc)
        
        return doc.id
    
    async def search(self, query: RAGQuery) -> RAGResult:
        """RAG 검색 수행"""
        # Generate query embedding
        query_embedding = await self._generate_embedding(query.query)
        
        # Filter documents by target modules
        candidate_docs = []
        if query.target_modules:
            for module in query.target_modules:
                for doc_id in self.module_indices.get(module, []):
                    if doc_id in self.documents:
                        candidate_docs.append(self.documents[doc_id])
        else:
            candidate_docs = list(self.documents.values())
        
        # Calculate similarities
        similarities = []
        for doc in candidate_docs:
            if doc.embedding:
                similarity = self._cosine_similarity(query_embedding, doc.embedding)
                similarities.append((doc, similarity))
        
        # Sort by relevance
        similarities.sort(key=lambda x: x[1], reverse=True)
        top_results = similarities[:query.top_k]
        
        # Extract documents and scores
        documents = [doc for doc, _ in top_results]
        scores = [score for _, score in top_results]
        
        # Generate context if requested
        context = ""
        if query.include_context:
            context = await self._generate_context(documents, query.query)
        
        # Build cross-reference map
        cross_refs = self._build_cross_references(documents)
        
        return RAGResult(
            documents=documents,
            context=context,
            relevance_scores=scores,
            cross_references=cross_refs
        )
    
    async def get_module_context(self, module: str, limit: int = 10) -> Dict[str, Any]:
        """특정 모듈의 최신 컨텍스트 가져오기"""
        module_docs = []
        for doc_id in self.module_indices.get(module, [])[-limit:]:
            if doc_id in self.documents:
                module_docs.append(self.documents[doc_id])
        
        # Group by type
        context_by_type = {}
        for doc in module_docs:
            if doc.type not in context_by_type:
                context_by_type[doc.type] = []
            context_by_type[doc.type].append({
                "content": doc.content[:200] + "...",  # Summary
                "metadata": doc.metadata,
                "created_at": doc.created_at
            })
        
        return context_by_type
    
    async def find_related_work(self, doc_id: str, cross_module: bool = True) -> List[Document]:
        """관련 작업 찾기"""
        if doc_id not in self.documents:
            return []
        
        source_doc = self.documents[doc_id]
        related = []
        
        # Check direct references
        for ref_id in source_doc.references:
            if ref_id in self.documents:
                related.append(self.documents[ref_id])
        
        # Find similar documents
        if source_doc.embedding:
            candidates = []
            for other_id, other_doc in self.documents.items():
                if other_id != doc_id:
                    if not cross_module and other_doc.module != source_doc.module:
                        continue
                    if other_doc.embedding:
                        similarity = self._cosine_similarity(
                            source_doc.embedding, 
                            other_doc.embedding
                        )
                        if similarity > 0.7:  # Threshold
                            candidates.append((other_doc, similarity))
            
            # Sort and take top results
            candidates.sort(key=lambda x: x[1], reverse=True)
            related.extend([doc for doc, _ in candidates[:5]])
        
        return related
    
    async def _generate_embedding(self, text: str) -> List[float]:
        """텍스트 임베딩 생성 (실제로는 임베딩 모델 사용)"""
        # Simulate embedding generation
        await asyncio.sleep(0.1)
        
        # In production, use actual embedding model
        # For now, generate random embeddings
        embedding = np.random.rand(768).tolist()
        return embedding
    
    async def _generate_context(self, documents: List[Document], query: str) -> str:
        """문서들로부터 컨텍스트 생성"""
        context_parts = []
        
        # Group by module
        by_module = {}
        for doc in documents:
            if doc.module not in by_module:
                by_module[doc.module] = []
            by_module[doc.module].append(doc)
        
        # Generate context for each module
        for module, docs in by_module.items():
            module_context = f"\n[{module.upper()}]:\n"
            for doc in docs[:2]:  # Limit per module
                summary = doc.content[:200] + "..."
                module_context += f"- {doc.type}: {summary}\n"
            context_parts.append(module_context)
        
        return "\n".join(context_parts)
    
    async def _update_cross_references(self, new_doc: Document):
        """문서 간 참조 관계 업데이트"""
        # Find references based on content similarity
        threshold = 0.6
        
        for doc_id, doc in self.documents.items():
            if doc_id != new_doc.id and doc.embedding and new_doc.embedding:
                similarity = self._cosine_similarity(new_doc.embedding, doc.embedding)
                if similarity > threshold:
                    # Add cross-reference
                    if doc_id not in new_doc.references:
                        new_doc.references.append(doc_id)
                    if new_doc.id not in doc.references:
                        doc.references.append(new_doc.id)
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """코사인 유사도 계산"""
        vec1 = np.array(vec1)
        vec2 = np.array(vec2)
        
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))
    
    def _build_cross_references(self, documents: List[Document]) -> Dict[str, List[str]]:
        """문서들의 모듈 간 참조 관계 구축"""
        cross_refs = {}
        
        for doc in documents:
            if doc.module not in cross_refs:
                cross_refs[doc.module] = []
            
            # Check references to other modules
            for ref_id in doc.references:
                if ref_id in self.documents:
                    ref_doc = self.documents[ref_id]
                    if ref_doc.module != doc.module:
                        ref_info = f"{ref_doc.module}:{ref_doc.type}"
                        if ref_info not in cross_refs[doc.module]:
                            cross_refs[doc.module].append(ref_info)
        
        return cross_refs

# ===== Module Integration Functions =====
class ModuleIntegration:
    def __init__(self, rag_service: RAGService):
        self.rag = rag_service
    
    async def data_analysis_with_context(self, query: str) -> Dict[str, Any]:
        """데이터 분석 시 다른 모듈 컨텍스트 참조"""
        # Search for relevant context from other modules
        rag_query = RAGQuery(
            query=query,
            source_module="data_analysis",
            target_modules=["data_collection", "prediction", "code_analysis"],
            top_k=5
        )
        
        rag_result = await self.rag.search(rag_query)
        
        # Build enhanced query with context
        enhanced_query = f"""
        Query: {query}
        
        Relevant Context from Other Modules:
        {rag_result.context}
        
        Cross-Module References:
        {json.dumps(rag_result.cross_references, indent=2)}
        """
        
        return {
            "enhanced_query": enhanced_query,
            "referenced_documents": [doc.id for doc in rag_result.documents],
            "context_sources": list(rag_result.cross_references.keys())
        }
    
    async def prediction_with_history(self, card_id: str) -> Dict[str, Any]:
        """예측 카드 생성 시 과거 분석 참조"""
        # Get related analysis and code results
        rag_query = RAGQuery(
            query=f"predictions and analysis for card {card_id}",
            source_module="prediction",
            target_modules=["data_analysis", "code_analysis"],
            top_k=3
        )
        
        rag_result = await self.rag.search(rag_query)
        
        # Extract insights
        insights = []
        for doc in rag_result.documents:
            if doc.type == "analysis":
                insights.append({
                    "type": "analysis",
                    "content": doc.content,
                    "date": doc.created_at
                })
            elif doc.type == "code_review":
                insights.append({
                    "type": "code",
                    "content": doc.content,
                    "date": doc.created_at
                })
        
        return {
            "historical_insights": insights,
            "related_work": [doc.metadata.get("title", "Untitled") for doc in rag_result.documents]
        }
    
    async def code_analysis_with_requirements(self, file_path: str) -> Dict[str, Any]:
        """코드 분석 시 관련 요구사항 및 스케줄 참조"""
        # Search for related requirements and schedules
        rag_query = RAGQuery(
            query=f"requirements and schedules for {file_path}",
            source_module="code_analysis",
            target_modules=["user_input", "scheduling", "prediction"],
            top_k=5
        )
        
        rag_result = await self.rag.search(rag_query)
        
        # Extract relevant information
        requirements = []
        deadlines = []
        
        for doc in rag_result.documents:
            if doc.module == "user_input" and doc.type == "requirement":
                requirements.append(doc.content)
            elif doc.module == "scheduling" and doc.type == "task":
                deadlines.append({
                    "task": doc.metadata.get("task_name"),
                    "deadline": doc.metadata.get("end_date")
                })
        
        return {
            "requirements": requirements,
            "deadlines": deadlines,
            "context": rag_result.context
        }
    
    async def user_decision_with_full_context(self, decision_id: str) -> Dict[str, Any]:
        """사용자 결정 시 전체 시스템 컨텍스트 제공"""
        # Get comprehensive context
        rag_query = RAGQuery(
            query=f"all relevant information for decision {decision_id}",
            source_module="user_input",
            target_modules=None,  # Search all modules
            top_k=10,
            include_context=True
        )
        
        rag_result = await self.rag.search(rag_query)
        
        # Organize by module
        context_by_module = {}
        for doc in rag_result.documents:
            if doc.module not in context_by_module:
                context_by_module[doc.module] = []
            context_by_module[doc.module].append({
                "type": doc.type,
                "summary": doc.content[:100] + "...",
                "relevance": rag_result.relevance_scores[rag_result.documents.index(doc)]
            })
        
        return {
            "full_context": rag_result.context,
            "module_contexts": context_by_module,
            "total_references": len(rag_result.documents),
            "cross_module_connections": rag_result.cross_references
        }

# ===== Global RAG Service Instance =====
rag_service = RAGService()
module_integration = ModuleIntegration(rag_service)

# ===== API Integration Functions =====
async def store_analysis_result(module: str, result: Dict[str, Any]):
    """분석 결과를 RAG 시스템에 저장"""
    doc = Document(
        id="",  # Will be generated
        module=module,
        type=result.get("type", "general"),
        content=json.dumps(result),
        metadata={
            "timestamp": datetime.now().isoformat(),
            "status": result.get("status", "completed")
        }
    )
    
    doc_id = await rag_service.add_document(doc)
    return doc_id

async def get_cross_module_context(source_module: str, query: str) -> Dict[str, Any]:
    """크로스 모듈 컨텍스트 검색"""
    return await module_integration.data_analysis_with_context(query)

async def initialize():
    """Initialize RAG service"""
    print("[RAG Service] Initializing RAG system...")
    # Load existing documents from database if needed
    print("[RAG Service] RAG system ready")

async def shutdown():
    """Shutdown RAG service"""
    print("[RAG Service] Shutting down RAG system...")
    rag_service.documents.clear()
    rag_service.embeddings_cache.clear()
    print("[RAG Service] RAG system shut down")