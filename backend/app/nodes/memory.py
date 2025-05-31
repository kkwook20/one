# backend/app/nodes/memory.py

import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Union
import numpy as np
from collections import deque, defaultdict

from app.models.node import Node, NodeData
from app.storage.node_storage import node_storage
from app.core.variable_resolver import variable_resolver
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class MemoryNode:
    """Memory 노드 - 데이터 저장, 검색 및 컨텍스트 관리"""
    
    def __init__(self):
        self.memory_types = {
            "short_term": self.ShortTermMemory(capacity=100),
            "long_term": self.LongTermMemory(),
            "working": self.WorkingMemory(capacity=20),
            "episodic": self.EpisodicMemory()
        }
        self.search_strategies = {
            "exact": self.search_exact,
            "fuzzy": self.search_fuzzy,
            "semantic": self.search_semantic,
            "temporal": self.search_temporal
        }
        
    class ShortTermMemory:
        """단기 메모리 - 최근 데이터 저장"""
        def __init__(self, capacity: int):
            self.capacity = capacity
            self.memory = deque(maxlen=capacity)
            
        def store(self, data: Any, metadata: Dict[str, Any] = None):
            entry = {
                "data": data,
                "metadata": metadata or {},
                "timestamp": datetime.now().isoformat(),
                "access_count": 0
            }
            self.memory.append(entry)
            
        def retrieve(self, count: int = 10) -> List[Dict[str, Any]]:
            return list(self.memory)[-count:]
            
        def search(self, query: Any) -> List[Dict[str, Any]]:
            results = []
            for entry in self.memory:
                if self._matches(entry['data'], query):
                    entry['access_count'] += 1
                    results.append(entry)
            return results
            
        def _matches(self, data: Any, query: Any) -> bool:
            if isinstance(data, dict) and isinstance(query, dict):
                return all(data.get(k) == v for k, v in query.items())
            return data == query
            
    class LongTermMemory:
        """장기 메모리 - 영구 저장"""
        def __init__(self):
            self.memory = {}
            self.index = defaultdict(list)  # 인덱스
            
        def store(self, key: str, data: Any, tags: List[str] = None):
            entry = {
                "key": key,
                "data": data,
                "tags": tags or [],
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "access_count": 0,
                "importance": 1.0
            }
            self.memory[key] = entry
            
            # 태그 인덱싱
            for tag in tags or []:
                self.index[tag].append(key)
                
        def retrieve(self, key: str) -> Optional[Dict[str, Any]]:
            if key in self.memory:
                self.memory[key]['access_count'] += 1
                return self.memory[key]
            return None
            
        def search_by_tags(self, tags: List[str]) -> List[Dict[str, Any]]:
            keys = set()
            for tag in tags:
                keys.update(self.index.get(tag, []))
                
            results = []
            for key in keys:
                if key in self.memory:
                    results.append(self.memory[key])
                    
            return sorted(results, key=lambda x: x['importance'], reverse=True)
            
        def update_importance(self, key: str, delta: float):
            if key in self.memory:
                self.memory[key]['importance'] += delta
                self.memory[key]['updated_at'] = datetime.now().isoformat()
                
    class WorkingMemory:
        """작업 메모리 - 현재 작업 컨텍스트"""
        def __init__(self, capacity: int):
            self.capacity = capacity
            self.context = {}
            self.focus_stack = []
            
        def set_context(self, key: str, value: Any):
            self.context[key] = {
                "value": value,
                "set_at": datetime.now().isoformat(),
                "priority": len(self.focus_stack)
            }
            
            # 용량 초과 시 오래된 항목 제거
            if len(self.context) > self.capacity:
                oldest = min(self.context.items(), key=lambda x: x[1]['set_at'])
                del self.context[oldest[0]]
                
        def get_context(self, key: str = None) -> Union[Any, Dict[str, Any]]:
            if key:
                return self.context.get(key, {}).get('value')
            return {k: v['value'] for k, v in self.context.items()}
            
        def push_focus(self, focus_data: Dict[str, Any]):
            self.focus_stack.append({
                "data": focus_data,
                "pushed_at": datetime.now().isoformat()
            })
            
        def pop_focus(self) -> Optional[Dict[str, Any]]:
            return self.focus_stack.pop() if self.focus_stack else None
            
    class EpisodicMemory:
        """에피소드 메모리 - 이벤트 시퀀스 저장"""
        def __init__(self):
            self.episodes = []
            self.current_episode = None
            
        def start_episode(self, episode_id: str, metadata: Dict[str, Any] = None):
            self.current_episode = {
                "id": episode_id,
                "events": [],
                "metadata": metadata or {},
                "started_at": datetime.now().isoformat(),
                "ended_at": None
            }
            
        def add_event(self, event: Dict[str, Any]):
            if self.current_episode:
                event['timestamp'] = datetime.now().isoformat()
                self.current_episode['events'].append(event)
                
        def end_episode(self) -> Optional[Dict[str, Any]]:
            if self.current_episode:
                self.current_episode['ended_at'] = datetime.now().isoformat()
                self.episodes.append(self.current_episode)
                episode = self.current_episode
                self.current_episode = None
                return episode
            return None
            
        def find_similar_episodes(self, pattern: Dict[str, Any], limit: int = 5) -> List[Dict[str, Any]]:
            similarities = []
            
            for episode in self.episodes:
                similarity = self._calculate_similarity(episode, pattern)
                if similarity > 0:
                    similarities.append((similarity, episode))
                    
            similarities.sort(key=lambda x: x[0], reverse=True)
            return [ep for _, ep in similarities[:limit]]
            
        def _calculate_similarity(self, episode: Dict[str, Any], pattern: Dict[str, Any]) -> float:
            # 간단한 유사도 계산
            score = 0.0
            
            # 메타데이터 매칭
            for key, value in pattern.get('metadata', {}).items():
                if episode['metadata'].get(key) == value:
                    score += 1.0
                    
            # 이벤트 패턴 매칭
            pattern_events = pattern.get('events', [])
            episode_events = episode.get('events', [])
            
            if pattern_events and episode_events:
                matches = sum(1 for pe in pattern_events 
                             if any(self._event_matches(pe, ee) for ee in episode_events))
                score += matches / len(pattern_events)
                
            return score
            
        def _event_matches(self, pattern_event: Dict[str, Any], episode_event: Dict[str, Any]) -> bool:
            for key, value in pattern_event.items():
                if key != 'timestamp' and episode_event.get(key) != value:
                    return False
            return True
            
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Memory 노드 실행"""
        try:
            operation = data.get('operation', 'store')
            memory_type = data.get('memoryType', 'short_term')
            
            # 메모리 초기화 (필요시)
            await self.initialize_memory(node_id, memory_type)
            
            # 작업별 처리
            if operation == 'store':
                result = await self.store_memory(node_id, data, memory_type)
            elif operation == 'retrieve':
                result = await self.retrieve_memory(node_id, data, memory_type)
            elif operation == 'search':
                result = await self.search_memory(node_id, data, memory_type)
            elif operation == 'update':
                result = await self.update_memory(node_id, data, memory_type)
            elif operation == 'delete':
                result = await self.delete_memory(node_id, data, memory_type)
            elif operation == 'consolidate':
                result = await self.consolidate_memory(node_id, data)
            else:
                result = {
                    "status": "error",
                    "error": f"Unknown operation: {operation}"
                }
                
            # 메모리 상태 저장
            await self.save_memory_state(node_id)
            
            # 메모리 통계 업데이트
            await self.update_memory_stats(node_id, operation)
            
            return {
                **result,
                "memory_type": memory_type,
                "operation": operation,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Memory node error: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            
    async def initialize_memory(self, node_id: str, memory_type: str):
        """메모리 초기화"""
        # 저장된 메모리 상태 로드
        saved_state = await node_storage.get_data(node_id, f'memory_{memory_type}')
        
        if saved_state and memory_type in self.memory_types:
            # 상태 복원 로직
            if memory_type == 'long_term':
                memory = self.memory_types[memory_type]
                memory.memory = saved_state.get('memory', {})
                memory.index = defaultdict(list, saved_state.get('index', {}))
            elif memory_type == 'episodic':
                memory = self.memory_types[memory_type]
                memory.episodes = saved_state.get('episodes', [])
                
    async def store_memory(
        self, 
        node_id: str, 
        data: Dict[str, Any], 
        memory_type: str
    ) -> Dict[str, Any]:
        """메모리에 데이터 저장"""
        memory = self.memory_types.get(memory_type)
        if not memory:
            return {"status": "error", "error": f"Unknown memory type: {memory_type}"}
            
        store_data = data.get('data')
        metadata = data.get('metadata', {})
        
        if memory_type == 'short_term':
            memory.store(store_data, metadata)
            
        elif memory_type == 'long_term':
            key = data.get('key', f"mem_{datetime.now().timestamp()}")
            tags = data.get('tags', [])
            memory.store(key, store_data, tags)
            
        elif memory_type == 'working':
            for key, value in store_data.items():
                memory.set_context(key, value)
                
        elif memory_type == 'episodic':
            if data.get('start_episode'):
                episode_id = data.get('episode_id', f"ep_{datetime.now().timestamp()}")
                memory.start_episode(episode_id, metadata)
            elif data.get('end_episode'):
                episode = memory.end_episode()
                return {"status": "success", "episode": episode}
            else:
                memory.add_event(store_data)
                
        return {"status": "success", "message": f"Data stored in {memory_type} memory"}
        
    async def retrieve_memory(
        self, 
        node_id: str, 
        data: Dict[str, Any], 
        memory_type: str
    ) -> Dict[str, Any]:
        """메모리에서 데이터 검색"""
        memory = self.memory_types.get(memory_type)
        if not memory:
            return {"status": "error", "error": f"Unknown memory type: {memory_type}"}
            
        if memory_type == 'short_term':
            count = data.get('count', 10)
            results = memory.retrieve(count)
            
        elif memory_type == 'long_term':
            key = data.get('key')
            if key:
                result = memory.retrieve(key)
                results = [result] if result else []
            else:
                tags = data.get('tags', [])
                results = memory.search_by_tags(tags)
                
        elif memory_type == 'working':
            key = data.get('key')
            if key:
                results = {"key": key, "value": memory.get_context(key)}
            else:
                results = memory.get_context()
                
        elif memory_type == 'episodic':
            pattern = data.get('pattern', {})
            limit = data.get('limit', 5)
            results = memory.find_similar_episodes(pattern, limit)
            
        return {
            "status": "success",
            "results": results,
            "count": len(results) if isinstance(results, list) else 1
        }
        
    async def search_memory(
        self, 
        node_id: str, 
        data: Dict[str, Any], 
        memory_type: str
    ) -> Dict[str, Any]:
        """메모리 검색"""
        strategy = data.get('strategy', 'exact')
        query = data.get('query')
        
        if strategy not in self.search_strategies:
            return {"status": "error", "error": f"Unknown search strategy: {strategy}"}
            
        # 모든 메모리 타입에서 검색
        all_results = []
        
        if memory_type == 'all':
            search_types = list(self.memory_types.keys())
        else:
            search_types = [memory_type]
            
        for mem_type in search_types:
            results = await self.search_strategies[strategy](
                node_id, 
                query, 
                mem_type
            )
            
            for result in results:
                result['memory_type'] = mem_type
                
            all_results.extend(results)
            
        # 관련도 순으로 정렬
        all_results.sort(key=lambda x: x.get('relevance', 0), reverse=True)
        
        return {
            "status": "success",
            "results": all_results[:50],  # 최대 50개
            "total_found": len(all_results)
        }
        
    async def search_exact(
        self, 
        node_id: str, 
        query: Any, 
        memory_type: str
    ) -> List[Dict[str, Any]]:
        """정확한 매칭 검색"""
        memory = self.memory_types.get(memory_type)
        results = []
        
        if memory_type == 'short_term':
            results = memory.search(query)
            
        elif memory_type == 'long_term':
            # 모든 항목 검색
            for key, entry in memory.memory.items():
                if entry['data'] == query:
                    results.append({**entry, 'relevance': 1.0})
                    
        return results
        
    async def search_fuzzy(
        self, 
        node_id: str, 
        query: str, 
        memory_type: str
    ) -> List[Dict[str, Any]]:
        """퍼지 검색"""
        memory = self.memory_types.get(memory_type)
        results = []
        
        query_lower = str(query).lower()
        
        if memory_type == 'short_term':
            for entry in memory.memory:
                data_str = str(entry['data']).lower()
                if query_lower in data_str:
                    relevance = len(query_lower) / len(data_str)
                    results.append({**entry, 'relevance': relevance})
                    
        elif memory_type == 'long_term':
            for key, entry in memory.memory.items():
                data_str = str(entry['data']).lower()
                key_lower = key.lower()
                
                relevance = 0
                if query_lower in data_str:
                    relevance += 0.7
                if query_lower in key_lower:
                    relevance += 0.3
                    
                if relevance > 0:
                    results.append({**entry, 'relevance': relevance})
                    
        return results
        
    async def search_semantic(
        self, 
        node_id: str, 
        query: str, 
        memory_type: str
    ) -> List[Dict[str, Any]]:
        """의미적 검색 (간단한 구현)"""
        # 실제로는 임베딩 기반 검색이 필요
        # 여기서는 키워드 기반 간단한 구현
        
        keywords = str(query).lower().split()
        results = []
        
        memory = self.memory_types.get(memory_type)
        
        if memory_type in ['short_term', 'long_term']:
            items = []
            
            if memory_type == 'short_term':
                items = list(memory.memory)
            else:
                items = list(memory.memory.values())
                
            for entry in items:
                data_str = str(entry.get('data', '')).lower()
                
                # 키워드 매칭 점수
                matches = sum(1 for kw in keywords if kw in data_str)
                if matches > 0:
                    relevance = matches / len(keywords)
                    results.append({**entry, 'relevance': relevance})
                    
        return results
        
    async def search_temporal(
        self, 
        node_id: str, 
        query: Dict[str, Any], 
        memory_type: str
    ) -> List[Dict[str, Any]]:
        """시간 기반 검색"""
        start_time = query.get('start_time')
        end_time = query.get('end_time')
        
        if start_time:
            start_dt = datetime.fromisoformat(start_time)
        else:
            start_dt = datetime.min
            
        if end_time:
            end_dt = datetime.fromisoformat(end_time)
        else:
            end_dt = datetime.max
            
        memory = self.memory_types.get(memory_type)
        results = []
        
        if memory_type == 'short_term':
            for entry in memory.memory:
                timestamp = datetime.fromisoformat(entry['timestamp'])
                if start_dt <= timestamp <= end_dt:
                    results.append({**entry, 'relevance': 1.0})
                    
        elif memory_type == 'episodic':
            for episode in memory.episodes:
                started_at = datetime.fromisoformat(episode['started_at'])
                if start_dt <= started_at <= end_dt:
                    results.append({**episode, 'relevance': 1.0})
                    
        return results
        
    async def update_memory(
        self, 
        node_id: str, 
        data: Dict[str, Any], 
        memory_type: str
    ) -> Dict[str, Any]:
        """메모리 업데이트"""
        if memory_type == 'long_term':
            memory = self.memory_types[memory_type]
            key = data.get('key')
            
            if not key:
                return {"status": "error", "error": "Key required for update"}
                
            if data.get('importance_delta'):
                memory.update_importance(key, data['importance_delta'])
                
            if data.get('new_data'):
                if key in memory.memory:
                    memory.memory[key]['data'] = data['new_data']
                    memory.memory[key]['updated_at'] = datetime.now().isoformat()
                    
            return {"status": "success", "message": f"Updated {key}"}
            
        return {"status": "error", "error": f"Update not supported for {memory_type}"}
        
    async def delete_memory(
        self, 
        node_id: str, 
        data: Dict[str, Any], 
        memory_type: str
    ) -> Dict[str, Any]:
        """메모리 삭제"""
        if memory_type == 'long_term':
            memory = self.memory_types[memory_type]
            key = data.get('key')
            
            if key and key in memory.memory:
                # 인덱스에서도 제거
                entry = memory.memory[key]
                for tag in entry.get('tags', []):
                    if key in memory.index[tag]:
                        memory.index[tag].remove(key)
                        
                del memory.memory[key]
                return {"status": "success", "message": f"Deleted {key}"}
                
        elif memory_type == 'short_term':
            # 전체 클리어
            self.memory_types[memory_type].memory.clear()
            return {"status": "success", "message": "Cleared short-term memory"}
            
        return {"status": "error", "error": f"Delete not supported for {memory_type}"}
        
    async def consolidate_memory(
        self, 
        node_id: str, 
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """메모리 통합 - 단기에서 장기로 이동"""
        short_term = self.memory_types['short_term']
        long_term = self.memory_types['long_term']
        
        # 중요도 기준
        importance_threshold = data.get('importance_threshold', 0.7)
        
        # 단기 메모리에서 중요한 항목 선별
        consolidated = 0
        for entry in list(short_term.memory):
            # 접근 횟수 기반 중요도 계산
            importance = entry['access_count'] / 10.0  # 간단한 계산
            
            if importance >= importance_threshold:
                # 장기 메모리로 이동
                key = f"consolidated_{entry['timestamp']}"
                tags = ['consolidated', 'from_short_term']
                
                long_term.store(key, entry['data'], tags)
                consolidated += 1
                
        # 오래된 단기 메모리 정리
        cutoff_time = datetime.now() - timedelta(hours=1)
        original_len = len(short_term.memory)
        
        short_term.memory = deque(
            (e for e in short_term.memory 
             if datetime.fromisoformat(e['timestamp']) > cutoff_time),
            maxlen=short_term.capacity
        )
        
        cleaned = original_len - len(short_term.memory)
        
        return {
            "status": "success",
            "consolidated": consolidated,
            "cleaned": cleaned,
            "message": f"Consolidated {consolidated} items, cleaned {cleaned} old items"
        }
        
    async def save_memory_state(self, node_id: str):
        """메모리 상태 저장"""
        for memory_type, memory in self.memory_types.items():
            state = {}
            
            if memory_type == 'short_term':
                state = {
                    'memory': list(memory.memory),
                    'capacity': memory.capacity
                }
            elif memory_type == 'long_term':
                state = {
                    'memory': memory.memory,
                    'index': dict(memory.index)
                }
            elif memory_type == 'working':
                state = {
                    'context': memory.context,
                    'focus_stack': memory.focus_stack
                }
            elif memory_type == 'episodic':
                state = {
                    'episodes': memory.episodes,
                    'current_episode': memory.current_episode
                }
                
            await node_storage.save_data(node_id, f'memory_{memory_type}', state)
            
    async def update_memory_stats(self, node_id: str, operation: str):
        """메모리 통계 업데이트"""
        stats = await node_storage.get_data(node_id, 'memory_stats') or {
            'operations': defaultdict(int),
            'last_operation': None
        }
        
        stats['operations'][operation] = stats['operations'].get(operation, 0) + 1
        stats['last_operation'] = {
            'operation': operation,
            'timestamp': datetime.now().isoformat()
        }
        
        # 메모리 사용량 계산
        usage = {}
        for memory_type, memory in self.memory_types.items():
            if memory_type == 'short_term':
                usage[memory_type] = len(memory.memory)
            elif memory_type == 'long_term':
                usage[memory_type] = len(memory.memory)
            elif memory_type == 'episodic':
                usage[memory_type] = len(memory.episodes)
                
        stats['memory_usage'] = usage
        
        await node_storage.save_data(node_id, 'memory_stats', dict(stats))

# 모듈 레벨 인스턴스
memory_node = MemoryNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await memory_node.execute(node_id, data)