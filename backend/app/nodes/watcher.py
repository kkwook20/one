# backend/app/nodes/watcher.py

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import httpx
from bs4 import BeautifulSoup

from app.models.node import Node, NodeData
from app.storage.node_storage import node_storage
from app.core.variable_resolver import variable_resolver
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class WatcherNode:
    """Watcher 노드 - 정보 수집 및 학습 자료 생성"""
    
    def __init__(self):
        self.lm_studio_url = "http://localhost:1234/v1"
        self.search_engines = {
            "google": "https://www.googleapis.com/customsearch/v1",
            "bing": "https://api.bing.microsoft.com/v7.0/search",
            "local": "http://localhost:8080/search"  # 로컬 검색 엔진
        }
        self.max_search_results = 10
        self.data_sources = []
        
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Watcher 노드 실행 - 정보 수집"""
        try:
            # Planner로부터 받은 요청 사항
            requests_from_planner = data.get('watcherRequests', [])
            
            # 기존 요청 목록 로드
            existing_requests = await node_storage.get_data(node_id, 'requests') or []
            
            # 새 요청 추가
            for request in requests_from_planner:
                request['received_at'] = datetime.now().isoformat()
                request['status'] = 'pending'
                existing_requests.append(request)
                
            # 요청 저장
            await node_storage.save_data(node_id, 'requests', existing_requests)
            
            # 정보 수집 실행
            collected_data = []
            processed_requests = []
            
            for request in existing_requests:
                if request.get('status') != 'completed':
                    # 정보 수집
                    result = await self.collect_information(
                        request_type=request.get('type'),
                        target_node=request.get('target_node'),
                        purpose=request.get('purpose'),
                        priority=request.get('priority', 'medium')
                    )
                    
                    # 수집 결과 저장
                    collected_item = {
                        "request_id": request.get('id', f"req_{datetime.now().timestamp()}"),
                        "type": request.get('type'),
                        "target_node": request.get('target_node'),
                        "collected_data": result,
                        "collected_at": datetime.now().isoformat(),
                        "sources": result.get('sources', [])
                    }
                    
                    collected_data.append(collected_item)
                    
                    # 요청 상태 업데이트
                    request['status'] = 'completed'
                    request['completed_at'] = datetime.now().isoformat()
                    
                processed_requests.append(request)
                
            # 수집된 데이터 저장
            all_collected = await node_storage.get_data(node_id, 'collected_data') or []
            all_collected.extend(collected_data)
            await node_storage.save_data(node_id, 'collected_data', all_collected)
            
            # 요청 상태 업데이트
            await node_storage.save_data(node_id, 'requests', processed_requests)
            
            # 학습 자료 생성
            learning_materials = await self.generate_learning_materials(collected_data)
            
            # 현재 목표 분석
            goals_analysis = await self.analyze_section_goals(data)
            
            # 결과 정리
            result = {
                "processed_requests": len([r for r in processed_requests if r['status'] == 'completed']),
                "collected_items": len(collected_data),
                "learning_materials": learning_materials,
                "goals_analysis": goals_analysis,
                "data_sources": list(set(self.data_sources)),
                "timestamp": datetime.now().isoformat()
            }
            
            # 출력 저장
            await node_storage.save_data(node_id, 'output', result)
            
            return {
                "status": "success",
                "output": result,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Watcher node error: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            
    async def collect_information(
        self,
        request_type: str,
        target_node: str,
        purpose: str,
        priority: str
    ) -> Dict[str, Any]:
        """정보 수집 실행"""
        if request_type == 'collect_examples':
            return await self.collect_examples(target_node, purpose)
        elif request_type == 'find_references':
            return await self.find_references(target_node, purpose)
        elif request_type == 'analyze_limitations':
            return await self.analyze_limitations(target_node)
        elif request_type == 'research_topic':
            return await self.research_topic(purpose)
        else:
            return await self.general_search(purpose)
            
    async def collect_examples(self, target_node: str, purpose: str) -> Dict[str, Any]:
        """예제 수집"""
        try:
            # 웹 검색으로 예제 수집
            search_query = f"examples {purpose} python code tutorial"
            search_results = await self.web_search(search_query)
            
            # LLM을 통한 예제 생성
            llm_examples = await self.generate_with_llm(
                f"Generate practical examples for: {purpose}"
            )
            
            # 로컬 저장소에서 유사한 코드 검색
            similar_codes = await self.search_local_repository(target_node, purpose)
            
            return {
                "type": "examples",
                "web_examples": search_results,
                "llm_examples": llm_examples,
                "local_examples": similar_codes,
                "sources": self.data_sources
            }
            
        except Exception as e:
            logger.error(f"Failed to collect examples: {e}")
            return {"type": "examples", "error": str(e)}
            
    async def find_references(self, target_node: str, purpose: str) -> Dict[str, Any]:
        """참조 자료 찾기"""
        try:
            # 기술 문서 검색
            doc_query = f"documentation reference {purpose}"
            documentation = await self.web_search(doc_query)
            
            # GitHub 코드 검색
            github_results = await self.search_github(purpose)
            
            # Stack Overflow 검색
            so_results = await self.search_stackoverflow(purpose)
            
            # 관련 논문이나 아티클
            articles = await self.search_articles(purpose)
            
            return {
                "type": "references",
                "documentation": documentation,
                "github_examples": github_results,
                "stackoverflow": so_results,
                "articles": articles,
                "sources": self.data_sources
            }
            
        except Exception as e:
            logger.error(f"Failed to find references: {e}")
            return {"type": "references", "error": str(e)}
            
    async def analyze_limitations(self, target_node: str) -> Dict[str, Any]:
        """노드의 한계점 분석"""
        try:
            # 노드 정보 가져오기
            node_data = await node_storage.get_data(target_node, 'node')
            node_code = await node_storage.get_code(target_node)
            metadata = await node_storage.get_metadata(target_node)
            
            # 실행 이력 분석
            execution_errors = metadata.get('error_count', 0)
            avg_execution_time = metadata.get('average_execution_time', 0)
            
            # 코드 복잡도 분석
            complexity_analysis = await self.analyze_code_complexity(node_code)
            
            # 병목 지점 식별
            bottlenecks = await self.identify_bottlenecks(node_code, metadata)
            
            # AI를 통한 개선점 제안
            ai_suggestions = await self.generate_with_llm(
                f"Analyze this code and identify limitations:\n{node_code[:1000]}..."
            )
            
            return {
                "type": "limitations",
                "execution_stats": {
                    "error_rate": execution_errors / max(metadata.get('execution_count', 1), 1),
                    "avg_execution_time": avg_execution_time
                },
                "complexity": complexity_analysis,
                "bottlenecks": bottlenecks,
                "ai_suggestions": ai_suggestions,
                "improvement_areas": [
                    "Error handling",
                    "Performance optimization",
                    "Code maintainability"
                ]
            }
            
        except Exception as e:
            logger.error(f"Failed to analyze limitations: {e}")
            return {"type": "limitations", "error": str(e)}
            
    async def research_topic(self, topic: str) -> Dict[str, Any]:
        """주제 연구"""
        try:
            # 다양한 소스에서 정보 수집
            research_data = {
                "web_search": await self.web_search(topic),
                "academic_search": await self.search_articles(topic),
                "tutorials": await self.find_tutorials(topic),
                "best_practices": await self.find_best_practices(topic),
                "case_studies": await self.find_case_studies(topic)
            }
            
            # 정보 요약
            summary = await self.summarize_research(research_data)
            
            return {
                "type": "research",
                "topic": topic,
                "data": research_data,
                "summary": summary,
                "sources": self.data_sources
            }
            
        except Exception as e:
            logger.error(f"Failed to research topic: {e}")
            return {"type": "research", "error": str(e)}
            
    async def general_search(self, query: str) -> Dict[str, Any]:
        """일반 검색"""
        try:
            results = await self.web_search(query)
            
            return {
                "type": "general_search",
                "query": query,
                "results": results,
                "sources": self.data_sources
            }
            
        except Exception as e:
            logger.error(f"Failed to perform general search: {e}")
            return {"type": "general_search", "error": str(e)}
            
    async def web_search(self, query: str) -> List[Dict[str, Any]]:
        """웹 검색 실행"""
        results = []
        
        # 로컬 검색 엔진 사용 (실제로는 API 키가 필요)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.search_engines["local"],
                    params={"q": query, "num": self.max_search_results}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    for item in data.get('items', []):
                        results.append({
                            "title": item.get('title'),
                            "url": item.get('link'),
                            "snippet": item.get('snippet'),
                            "source": "web_search"
                        })
                        
            self.data_sources.append("web_search")
            
        except Exception as e:
            logger.error(f"Web search failed: {e}")
            
        return results
        
    async def search_github(self, query: str) -> List[Dict[str, Any]]:
        """GitHub 코드 검색"""
        # 실제 구현에서는 GitHub API 사용
        self.data_sources.append("github")
        return [
            {
                "repository": "example/repo",
                "file": "example.py",
                "stars": 100,
                "language": "Python",
                "snippet": "# Example code snippet"
            }
        ]
        
    async def search_stackoverflow(self, query: str) -> List[Dict[str, Any]]:
        """Stack Overflow 검색"""
        # 실제 구현에서는 Stack Exchange API 사용
        self.data_sources.append("stackoverflow")
        return [
            {
                "title": "How to solve this problem",
                "votes": 50,
                "accepted": True,
                "url": "https://stackoverflow.com/questions/example"
            }
        ]
        
    async def search_articles(self, query: str) -> List[Dict[str, Any]]:
        """학술 논문 및 아티클 검색"""
        # 실제 구현에서는 학술 검색 API 사용
        self.data_sources.append("academic")
        return [
            {
                "title": "Research on the topic",
                "authors": ["Author 1", "Author 2"],
                "year": 2024,
                "abstract": "Abstract of the paper"
            }
        ]
        
    async def find_tutorials(self, topic: str) -> List[Dict[str, Any]]:
        """튜토리얼 찾기"""
        search_query = f"{topic} tutorial step by step"
        return await self.web_search(search_query)
        
    async def find_best_practices(self, topic: str) -> List[Dict[str, Any]]:
        """베스트 프랙티스 찾기"""
        search_query = f"{topic} best practices guidelines"
        return await self.web_search(search_query)
        
    async def find_case_studies(self, topic: str) -> List[Dict[str, Any]]:
        """사례 연구 찾기"""
        search_query = f"{topic} case study real world example"
        return await self.web_search(search_query)
        
    async def search_local_repository(self, target_node: str, purpose: str) -> List[Dict[str, Any]]:
        """로컬 저장소에서 유사한 코드 검색"""
        similar_codes = []
        
        # 모든 노드의 코드를 검색 (실제로는 더 효율적인 검색 필요)
        # 여기서는 시뮬레이션
        
        return similar_codes
        
    async def generate_with_llm(self, prompt: str) -> Dict[str, Any]:
        """LLM을 통한 콘텐츠 생성"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.lm_studio_url}/completions",
                    json={
                        "prompt": prompt,
                        "max_tokens": 1000,
                        "temperature": 0.7
                    },
                    timeout=60.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    self.data_sources.append("llm_generation")
                    
                    return {
                        "generated_content": result.get('choices', [{}])[0].get('text', ''),
                        "model": result.get('model'),
                        "source": "llm"
                    }
                    
        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            
        return {"error": "LLM generation failed"}
        
    async def analyze_code_complexity(self, code: str) -> Dict[str, Any]:
        """코드 복잡도 분석"""
        # 간단한 복잡도 메트릭
        lines = code.split('\n')
        
        return {
            "lines_of_code": len(lines),
            "functions": len([l for l in lines if l.strip().startswith('def ')]),
            "classes": len([l for l in lines if l.strip().startswith('class ')]),
            "imports": len([l for l in lines if l.strip().startswith(('import ', 'from '))]),
            "complexity_score": min(100, len(lines) / 10)  # 간단한 점수
        }
        
    async def identify_bottlenecks(self, code: str, metadata: Dict[str, Any]) -> List[str]:
        """병목 지점 식별"""
        bottlenecks = []
        
        # 실행 시간이 오래 걸리는 경우
        if metadata.get('average_execution_time', 0) > 30:
            bottlenecks.append("Long execution time detected")
            
        # 파일 I/O가 많은 경우
        if 'open(' in code or 'read(' in code or 'write(' in code:
            bottlenecks.append("Heavy file I/O operations")
            
        # 중첩 루프
        if code.count('for ') > 3:
            bottlenecks.append("Multiple nested loops detected")
            
        # 대용량 데이터 처리
        if 'pandas' in code or 'numpy' in code:
            bottlenecks.append("Large data processing operations")
            
        return bottlenecks
        
    async def generate_learning_materials(self, collected_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """학습 자료 생성"""
        materials = {
            "tutorials": [],
            "examples": [],
            "best_practices": [],
            "references": []
        }
        
        for item in collected_data:
            data = item.get('collected_data', {})
            
            if data.get('type') == 'examples':
                materials['examples'].extend(data.get('web_examples', []))
                materials['examples'].append(data.get('llm_examples', {}))
                
            elif data.get('type') == 'references':
                materials['references'].extend(data.get('documentation', []))
                materials['best_practices'].extend(data.get('stackoverflow', []))
                
            elif data.get('type') == 'research':
                materials['tutorials'].extend(data.get('data', {}).get('tutorials', []))
                
        # 학습 자료 요약
        summary = {
            "total_materials": sum(len(v) for v in materials.values()),
            "categories": list(materials.keys()),
            "generated_at": datetime.now().isoformat()
        }
        
        # 파일로 저장
        await node_storage.save_file(
            self.node_id if hasattr(self, 'node_id') else 'watcher',
            f"learning_materials_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
            json.dumps(materials, indent=2, ensure_ascii=False).encode('utf-8')
        )
        
        return {
            "materials": materials,
            "summary": summary
        }
        
    async def analyze_section_goals(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """섹션 목표 분석"""
        # 전체 목표 가져오기
        goals = data.get('goals', '')
        section = data.get('section', '')
        
        # 노드별 한계점 분석
        node_limitations = {}
        improvement_areas = []
        
        # 각 노드의 상태 분석
        all_nodes = data.get('allNodes', [])
        
        for node in all_nodes:
            node_id = node['id']
            node_type = node.get('type', '')
            
            # 노드 평가 정보가 있다면 사용
            evaluation = data.get('evaluations', {}).get(node_id, {})
            
            if evaluation:
                score = evaluation.get('score', 100)
                if score < 70:
                    node_limitations[node_id] = {
                        "type": node_type,
                        "score": score,
                        "issues": evaluation.get('issues', []),
                        "recommendations": evaluation.get('recommendations', [])
                    }
                    
                    improvement_areas.extend(evaluation.get('recommendations', []))
                    
        return {
            "section_goals": goals,
            "current_section": section,
            "node_limitations": node_limitations,
            "improvement_areas": list(set(improvement_areas)),  # 중복 제거
            "exploration_suggestions": [
                "Consider implementing caching for frequently accessed data",
                "Explore parallel processing for independent tasks",
                "Research more efficient algorithms for data processing",
                "Investigate AI-assisted code optimization"
            ]
        }
        
    async def summarize_research(self, research_data: Dict[str, Any]) -> str:
        """연구 데이터 요약"""
        # LLM을 사용하여 요약 생성
        all_content = []
        
        for category, items in research_data.items():
            if isinstance(items, list) and items:
                all_content.append(f"{category}: {len(items)} items found")
                
        summary_prompt = f"Summarize the following research findings:\n{chr(10).join(all_content)}"
        
        llm_summary = await self.generate_with_llm(summary_prompt)
        
        return llm_summary.get('generated_content', 'Summary generation failed')

# 모듈 레벨 인스턴스
watcher_node = WatcherNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await watcher_node.execute(node_id, data)