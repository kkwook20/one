# backend/app/services/performance.py

import time
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from collections import defaultdict
import statistics
import json

from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class PerformanceProfiler:
    """성능 프로파일러"""
    
    def __init__(self):
        self.profiles: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self.active_profiles: Dict[str, Dict[str, Any]] = {}
        
    def start_profile(self, profile_id: str, metadata: Optional[Dict[str, Any]] = None):
        """프로파일링 시작"""
        self.active_profiles[profile_id] = {
            'start_time': time.perf_counter(),
            'metadata': metadata or {},
            'checkpoints': []
        }
        
    def checkpoint(self, profile_id: str, name: str, data: Optional[Dict[str, Any]] = None):
        """체크포인트 기록"""
        if profile_id in self.active_profiles:
            profile = self.active_profiles[profile_id]
            profile['checkpoints'].append({
                'name': name,
                'time': time.perf_counter() - profile['start_time'],
                'data': data or {}
            })
            
    def end_profile(self, profile_id: str, category: str):
        """프로파일링 종료"""
        if profile_id not in self.active_profiles:
            return
            
        profile = self.active_profiles.pop(profile_id)
        end_time = time.perf_counter()
        duration = end_time - profile['start_time']
        
        profile_data = {
            'id': profile_id,
            'category': category,
            'duration': duration,
            'timestamp': datetime.now().isoformat(),
            'metadata': profile['metadata'],
            'checkpoints': profile['checkpoints']
        }
        
        self.profiles[category].append(profile_data)
        
        # 메모리 관리 - 최근 1000개만 유지
        if len(self.profiles[category]) > 1000:
            self.profiles[category] = self.profiles[category][-1000:]
            
    def get_statistics(self, category: str, time_window: Optional[int] = None) -> Dict[str, Any]:
        """성능 통계"""
        profiles = self.profiles.get(category, [])
        
        if time_window:
            cutoff = datetime.now() - timedelta(seconds=time_window)
            profiles = [
                p for p in profiles
                if datetime.fromisoformat(p['timestamp']) > cutoff
            ]
            
        if not profiles:
            return {
                'category': category,
                'count': 0,
                'avgDuration': 0,
                'minDuration': 0,
                'maxDuration': 0,
                'percentiles': {}
            }
            
        durations = [p['duration'] for p in profiles]
        
        return {
            'category': category,
            'count': len(profiles),
            'avgDuration': statistics.mean(durations),
            'minDuration': min(durations),
            'maxDuration': max(durations),
            'stdDev': statistics.stdev(durations) if len(durations) > 1 else 0,
            'percentiles': {
                'p50': statistics.median(durations),
                'p90': self._percentile(durations, 90),
                'p95': self._percentile(durations, 95),
                'p99': self._percentile(durations, 99)
            }
        }
        
    def _percentile(self, data: List[float], percentile: int) -> float:
        """백분위수 계산"""
        if not data:
            return 0
        data_sorted = sorted(data)
        index = (len(data_sorted) - 1) * percentile / 100
        lower = int(index)
        upper = lower + 1
        if upper >= len(data_sorted):
            return data_sorted[lower]
        return data_sorted[lower] + (index - lower) * (data_sorted[upper] - data_sorted[lower])

class BottleneckDetector:
    """병목 현상 감지기"""
    
    def __init__(self, profiler: PerformanceProfiler):
        self.profiler = profiler
        self.thresholds = {
            'node_execution': {
                'warning': 30,  # 30초
                'critical': 60  # 60초
            },
            'workflow_execution': {
                'warning': 300,  # 5분
                'critical': 600  # 10분
            }
        }
        
    def analyze_bottlenecks(self) -> Dict[str, Any]:
        """병목 현상 분석"""
        bottlenecks = {
            'nodes': [],
            'workflows': [],
            'summary': {
                'totalBottlenecks': 0,
                'criticalCount': 0,
                'warningCount': 0
            }
        }
        
        # 노드 병목 분석
        node_stats = self.profiler.get_statistics('node_execution', 3600)  # 최근 1시간
        if node_stats['count'] > 0:
            if node_stats['p95'] > self.thresholds['node_execution']['critical']:
                bottlenecks['nodes'].append({
                    'type': 'critical',
                    'message': f"Node execution P95 latency: {node_stats['p95']:.2f}s",
                    'stats': node_stats
                })
                bottlenecks['summary']['criticalCount'] += 1
            elif node_stats['p95'] > self.thresholds['node_execution']['warning']:
                bottlenecks['nodes'].append({
                    'type': 'warning',
                    'message': f"Node execution P95 latency: {node_stats['p95']:.2f}s",
                    'stats': node_stats
                })
                bottlenecks['summary']['warningCount'] += 1
                
        # 워크플로우 병목 분석
        workflow_stats = self.profiler.get_statistics('workflow_execution', 3600)
        if workflow_stats['count'] > 0:
            if workflow_stats['p95'] > self.thresholds['workflow_execution']['critical']:
                bottlenecks['workflows'].append({
                    'type': 'critical',
                    'message': f"Workflow execution P95 latency: {workflow_stats['p95']:.2f}s",
                    'stats': workflow_stats
                })
                bottlenecks['summary']['criticalCount'] += 1
            elif workflow_stats['p95'] > self.thresholds['workflow_execution']['warning']:
                bottlenecks['workflows'].append({
                    'type': 'warning',
                    'message': f"Workflow execution P95 latency: {workflow_stats['p95']:.2f}s",
                    'stats': workflow_stats
                })
                bottlenecks['summary']['warningCount'] += 1
                
        bottlenecks['summary']['totalBottlenecks'] = (
            bottlenecks['summary']['criticalCount'] + 
            bottlenecks['summary']['warningCount']
        )
        
        return bottlenecks
        
    def get_optimization_suggestions(self) -> List[Dict[str, Any]]:
        """최적화 제안"""
        suggestions = []
        bottlenecks = self.analyze_bottlenecks()
        
        # 노드 최적화 제안
        for bottleneck in bottlenecks['nodes']:
            if bottleneck['type'] == 'critical':
                suggestions.append({
                    'priority': 'high',
                    'category': 'node',
                    'title': 'Critical Node Performance Issue',
                    'description': 'Node execution times are exceeding critical thresholds',
                    'suggestions': [
                        'Consider parallelizing node execution',
                        'Optimize node code for better performance',
                        'Check for resource constraints (CPU/Memory)',
                        'Consider caching frequently accessed data'
                    ]
                })
                
        # 워크플로우 최적화 제안
        for bottleneck in bottlenecks['workflows']:
            if bottleneck['type'] == 'critical':
                suggestions.append({
                    'priority': 'high',
                    'category': 'workflow',
                    'title': 'Critical Workflow Performance Issue',
                    'description': 'Workflow execution times are exceeding critical thresholds',
                    'suggestions': [
                        'Identify and optimize slowest nodes',
                        'Consider breaking large workflows into smaller ones',
                        'Enable parallel execution where possible',
                        'Review workflow dependencies for optimization'
                    ]
                })
                
        return suggestions

# 전역 인스턴스
performance_profiler = PerformanceProfiler()
bottleneck_detector = BottleneckDetector(performance_profiler)