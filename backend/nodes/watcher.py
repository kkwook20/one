import asyncio
import json
import aiohttp
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import re
from bs4 import BeautifulSoup

class WatcherNode:
    """Watcher 노드 - 외부 데이터 수집 및 LoRA 학습 데이터 관리"""
    
    def __init__(self):
        self.config_dir = Path("config/nodes")
        self.data_dir = Path("data/watcher")
        self.cache_dir = Path("data/cache/watcher")
        self.lora_dir = Path("data/lora_datasets")
        
        # 디렉토리 생성
        for dir_path in [self.data_dir, self.cache_dir, self.lora_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
    
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Watcher 노드 실행"""
        try:
            # 설정 로드
            config = await self.load_config(node_id)
            
            # 검색 쿼리 처리
            search_queries = data.get('searchQueries', config.get('searchQueries', []))
            collected_data = []
            
            for query_info in search_queries:
                if isinstance(query_info, str):
                    query = query_info
                else:
                    query = query_info.get('query', '')
                
                if query:
                    results = await self.search_and_collect(query)
                    collected_data.extend(results)
            
            # 수집된 데이터 분석
            analysis = await self.analyze_collected_data(collected_data)
            
            # LoRA 학습 데이터 준비
            lora_datasets = await self.prepare_lora_datasets(collected_data, analysis)
            
            # 결과 저장
            result = {
                "collectedData": collected_data,
                "analysis": analysis,
                "loraTrainingData": lora_datasets,
                "totalDataSize": sum(d.get('size', 0) for d in collected_data),
                "timestamp": datetime.now().isoformat()
            }
            
            await self.save_results(node_id, result)
            
            return {
                "status": "success",
                "result": result,
                "dataCount": len(collected_data),
                "loraReadyCount": len([d for d in lora_datasets if d['status'] == 'ready'])
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    async def load_config(self, node_id: str) -> Dict[str, Any]:
        """노드 설정 로드"""
        config_path = self.config_dir / f"{node_id}.json"
        
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return {
            "searchQueries": [],
            "sources": {
                "web": True,
                "arxiv": True,
                "github": True,
                "huggingface": True
            },
            "dataFilters": {
                "minQuality": 0.7,
                "maxAge": 30,  # days
                "languages": ["en", "ko"]
            },
            "loraConfig": {
                "minDatasetSize": 1000,
                "targetImprovement": 10,  # percentage
                "maxTrainingTime": 240  # minutes
            }
        }
    
    async def search_and_collect(self, query: str) -> List[Dict[str, Any]]:
        """검색 및 데이터 수집"""
        collected = []
        
        # 웹 검색 (시뮬레이션)
        web_results = await self.search_web(query)
        collected.extend(web_results)
        
        # arXiv 검색
        arxiv_results = await self.search_arxiv(query)
        collected.extend(arxiv_results)
        
        # GitHub 검색
        github_results = await self.search_github(query)
        collected.extend(github_results)
        
        # 중복 제거
        unique_data = self.remove_duplicates(collected)
        
        return unique_data
    
    async def search_web(self, query: str) -> List[Dict[str, Any]]:
        """웹 검색 (시뮬레이션)"""
        # 실제 구현에서는 검색 API 사용
        results = []
        
        # 시뮬레이션 데이터
        for i in range(3):
            results.append({
                "id": hashlib.md5(f"{query}_{i}".encode()).hexdigest(),
                "source": "web",
                "query": query,
                "title": f"Result {i+1} for {query}",
                "url": f"https://example.com/{query.replace(' ', '-')}/{i}",
                "content": f"Sample content for {query}. This contains relevant information about the topic.",
                "size": 1024 * (i + 1),
                "timestamp": datetime.now().isoformat(),
                "quality": 0.8 - i * 0.1
            })
        
        return results
    
    async def search_arxiv(self, query: str) -> List[Dict[str, Any]]:
        """arXiv 논문 검색"""
        results = []
        
        try:
            # arXiv API URL
            base_url = "http://export.arxiv.org/api/query"
            params = {
                "search_query": f"all:{query}",
                "max_results": 5,
                "sortBy": "relevance"
            }
            
            # API 호출 (시뮬레이션)
            # 실제로는 aiohttp를 사용하여 호출
            for i in range(2):
                results.append({
                    "id": hashlib.md5(f"arxiv_{query}_{i}".encode()).hexdigest(),
                    "source": "arxiv",
                    "query": query,
                    "title": f"Paper: {query} - Method {i+1}",
                    "url": f"https://arxiv.org/abs/2024.0{i+1}.{1000+i}",
                    "authors": [f"Author {j+1}" for j in range(3)],
                    "abstract": f"This paper presents a novel approach to {query}...",
                    "size": 1024 * 500,  # ~500KB
                    "timestamp": datetime.now().isoformat(),
                    "quality": 0.9
                })
        except Exception as e:
            print(f"arXiv search error: {e}")
        
        return results
    
    async def search_github(self, query: str) -> List[Dict[str, Any]]:
        """GitHub 저장소 검색"""
        results = []
        
        try:
            # GitHub 검색 (시뮬레이션)
            for i in range(2):
                results.append({
                    "id": hashlib.md5(f"github_{query}_{i}".encode()).hexdigest(),
                    "source": "github",
                    "query": query,
                    "title": f"Repository: {query}-implementation-{i+1}",
                    "url": f"https://github.com/user/repo-{i+1}",
                    "description": f"Implementation of {query} using modern techniques",
                    "stars": 100 * (i + 1),
                    "language": "Python",
                    "size": 1024 * 100,  # ~100KB
                    "timestamp": datetime.now().isoformat(),
                    "quality": 0.85
                })
        except Exception as e:
            print(f"GitHub search error: {e}")
        
        return results
    
    def remove_duplicates(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """중복 제거"""
        seen = set()
        unique = []
        
        for item in data:
            # URL 또는 제목 기반 중복 체크
            key = item.get('url') or item.get('title')
            if key and key not in seen:
                seen.add(key)
                unique.append(item)
        
        return unique
    
    async def analyze_collected_data(self, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """수집된 데이터 분석"""
        if not data:
            return {
                "totalItems": 0,
                "totalSize": 0,
                "avgQuality": 0,
                "sources": {},
                "topics": []
            }
        
        # 소스별 분류
        sources = {}
        for item in data:
            source = item.get('source', 'unknown')
            if source not in sources:
                sources[source] = {"count": 0, "size": 0}
            sources[source]["count"] += 1
            sources[source]["size"] += item.get('size', 0)
        
        # 주제 추출 (간단한 키워드 분석)
        topics = self.extract_topics(data)
        
        # 품질 분석
        qualities = [item.get('quality', 0) for item in data]
        avg_quality = sum(qualities) / len(qualities) if qualities else 0
        
        return {
            "totalItems": len(data),
            "totalSize": sum(item.get('size', 0) for item in data),
            "avgQuality": round(avg_quality, 2),
            "sources": sources,
            "topics": topics[:10],  # 상위 10개 주제
            "dataTypes": self.classify_data_types(data)
        }
    
    def extract_topics(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """주제 추출"""
        word_count = {}
        
        for item in data:
            text = f"{item.get('title', '')} {item.get('content', '')} {item.get('description', '')}"
            # 간단한 토큰화
            words = re.findall(r'\b\w+\b', text.lower())
            
            for word in words:
                if len(word) > 3:  # 3글자 초과 단어만
                    word_count[word] = word_count.get(word, 0) + 1
        
        # 빈도순 정렬
        topics = [
            {"word": word, "count": count}
            for word, count in sorted(word_count.items(), key=lambda x: x[1], reverse=True)
        ]
        
        return topics
    
    def classify_data_types(self, data: List[Dict[str, Any]]) -> Dict[str, int]:
        """데이터 타입 분류"""
        types = {
            "text": 0,
            "code": 0,
            "paper": 0,
            "documentation": 0,
            "other": 0
        }
        
        for item in data:
            if item.get('source') == 'arxiv':
                types['paper'] += 1
            elif item.get('source') == 'github':
                types['code'] += 1
            elif 'documentation' in item.get('title', '').lower():
                types['documentation'] += 1
            else:
                types['text'] += 1
        
        return types
    
    async def prepare_lora_datasets(
        self, 
        collected_data: List[Dict[str, Any]], 
        analysis: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """LoRA 학습을 위한 데이터셋 준비"""
        datasets = []
        
        # 품질 기준 이상의 데이터만 선택
        high_quality_data = [
            item for item in collected_data 
            if item.get('quality', 0) >= 0.7
        ]
        
        if not high_quality_data:
            return datasets
        
        # 주제별로 그룹화
        topic_groups = self.group_by_topic(high_quality_data)
        
        # 각 주제별로 데이터셋 생성
        for topic, items in topic_groups.items():
            if len(items) >= 5:  # 최소 5개 이상의 데이터
                dataset = await self.create_lora_dataset(topic, items)
                datasets.append(dataset)
        
        return datasets
    
    def group_by_topic(self, data: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """주제별 그룹화"""
        groups = {}
        
        for item in data:
            # 쿼리를 주제로 사용 (실제로는 더 정교한 분류 필요)
            topic = item.get('query', 'unknown')
            if topic not in groups:
                groups[topic] = []
            groups[topic].append(item)
        
        return groups
    
    async def create_lora_dataset(self, topic: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """LoRA 데이터셋 생성"""
        dataset_id = hashlib.md5(f"lora_{topic}_{datetime.now()}".encode()).hexdigest()[:8]
        
        # 데이터셋 파일 생성
        dataset_path = self.lora_dir / f"dataset_{dataset_id}"
        dataset_path.mkdir(exist_ok=True)
        
        # 훈련 데이터 준비
        training_pairs = []
        for item in items:
            # 질문-답변 쌍 생성 (시뮬레이션)
            training_pairs.append({
                "instruction": f"Explain about {topic}",
                "input": item.get('title', ''),
                "output": item.get('content', item.get('abstract', ''))
            })
        
        # 데이터셋 저장
        with open(dataset_path / "train.json", 'w', encoding='utf-8') as f:
            json.dump(training_pairs, f, indent=2, ensure_ascii=False)
        
        # 데이터셋 정보
        dataset_info = {
            "id": dataset_id,
            "topic": topic,
            "datasetSize": len(training_pairs),
            "estimatedImprovement": min(15, len(training_pairs) * 0.5),  # 시뮬레이션
            "trainingTime": len(training_pairs) * 2,  # 분
            "status": "ready",
            "createdAt": datetime.now().isoformat(),
            "path": str(dataset_path)
        }
        
        # 메타데이터 저장
        with open(dataset_path / "metadata.json", 'w', encoding='utf-8') as f:
            json.dump(dataset_info, f, indent=2, ensure_ascii=False)
        
        return dataset_info
    
    async def save_results(self, node_id: str, results: Dict[str, Any]):
        """결과 저장"""
        # 메인 결과 파일
        result_file = self.data_dir / f"{node_id}_results.json"
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        # 수집 이력 저장
        history_file = self.data_dir / f"{node_id}_history.json"
        history = []
        
        if history_file.exists():
            with open(history_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
        
        history.append({
            "timestamp": results['timestamp'],
            "dataCount": len(results['collectedData']),
            "totalSize": results['totalDataSize'],
            "loraDatasets": len(results['loraTrainingData'])
        })
        
        # 최근 100개 기록만 유지
        history = history[-100:]
        
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2, ensure_ascii=False)


# 모듈 레벨 인스턴스
watcher_node = WatcherNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await watcher_node.execute(node_id, data)