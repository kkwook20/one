# backend/app/nodes/planner.py

import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional
import statistics

from app.models.node import Node, NodeData
from app.storage.node_storage import node_storage
from app.core.variable_resolver import variable_resolver
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class PlannerNode:
    """Planner 노드 - 전체 워크플로우 계획 및 평가 (Accept/Cancel 기능 포함)"""
    
    def __init__(self):
        self.evaluation_criteria = {
            "timeEfficiency": {"weight": 0.25, "target": 80},
            "workload": {"weight": 0.25, "target": 70},
            "difficulty": {"weight": 0.25, "target": 60},
            "progress": {"weight": 0.25, "target": 90}
        }
        
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Planner 노드 실행 - 전체 워크플로우 평가"""
        try:
            # 평가 모드
            evaluation_mode = data.get('mode', 'evaluate')  # evaluate, accept, cancel
            
            if evaluation_mode == 'accept':
                # 평가 결과 승인
                return await self.accept_evaluation(node_id, data)
            elif evaluation_mode == 'cancel':
                # 평가 취소
                return await self.cancel_evaluation(node_id, data)
                
            # 일반 평가 모드
            # 전체 목표
            goals = data.get('goals', '')
            if goals:
                await node_storage.save_data(node_id, 'goals', goals)
                
            # 현재 워크플로우의 모든 노드
            all_nodes = data.get('allNodes', [])
            section = data.get('section', '')  # 현재 섹션
            subsection = data.get('subsection', '')  # 현재 서브섹션
            
            # 평가 대상 노드 필터링
            target_nodes = self.filter_target_nodes(all_nodes, section, subsection)
            
            # 각 노드 평가
            evaluations = {}
            for node in target_nodes:
                evaluation = await self.evaluate_node(node)
                evaluations[node['id']] = evaluation
                
            # 전체 진행률 계산
            overall_progress = self.calculate_overall_progress(evaluations)
            
            # 다음 단계 계획
            next_steps = await self.plan_next_steps(evaluations, goals)
            
            # 작업 우선순위 계산
            priorities = self.calculate_priorities(evaluations, target_nodes)
            
            # Watcher 노드에 요청 사항 생성
            watcher_requests = await self.generate_watcher_requests(evaluations)
            
            # Supervisor 노드에 수정 추천
            supervisor_recommendations = self.generate_supervisor_recommendations(evaluations)
            
            # 평가 결과 저장
            result = {
                "goals": goals,
                "evaluations": evaluations,
                "overallProgress": overall_progress,
                "nextSteps": next_steps,
                "priorities": priorities,
                "watcherRequests": watcher_requests,
                "supervisorRecommendations": supervisor_recommendations,
                "recommendations": await self.generate_recommendations(evaluations),
                "evaluated_at": datetime.now().isoformat(),
                "status": "pending_acceptance"  # Accept/Cancel 대기
            }
            
            await node_storage.save_data(node_id, 'current_evaluation', result)
            
            return {
                "status": "success",
                "evaluation": result,
                "requires_acceptance": True,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Planner node error: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            
    def filter_target_nodes(
        self, 
        all_nodes: List[Dict[str, Any]], 
        section: str,
        subsection: str
    ) -> List[Dict[str, Any]]:
        """평가 대상 노드 필터링"""
        target_nodes = []
        
        for node in all_nodes:
            # Worker 계열 노드만 평가
            if node.get('type', '').startswith('worker'):
                # 섹션/서브섹션 필터링
                if section and node.get('section') != section:
                    continue
                if subsection and node.get('subsection') != subsection:
                    continue
                    
                target_nodes.append(node)
                
        return target_nodes
        
    async def evaluate_node(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """개별 노드 평가"""
        node_id = node['id']
        
        # 노드 실행 이력 및 데이터 로드
        metadata = await node_storage.get_metadata(node_id) or {}
        tasks = await node_storage.get_data(node_id, 'tasks') or []
        output = await node_storage.get_data(node_id, 'output') or {}
        storage_stats = await node_storage.get_storage_stats(node_id)
        
        # 메트릭 계산
        metrics = {
            "timeEfficiency": self.calculate_time_efficiency(metadata),
            "workload": self.calculate_workload(tasks),
            "difficulty": self.calculate_difficulty(metadata, tasks),
            "progress": self.calculate_progress(tasks)
        }
        
        # 종합 점수 계산
        score = self.calculate_score(metrics)
        
        # 문제점 식별
        issues = self.identify_issues(metrics, metadata, tasks)
        
        # 개선 제안
        recommendations = self.generate_node_recommendations(metrics, issues)
        
        return {
            "nodeId": node_id,
            "nodeType": node.get('type', 'unknown'),
            "nodeLabel": node.get('data', {}).get('label', ''),
            "score": score,
            "metrics": metrics,
            "issues": issues,
            "recommendations": recommendations,
            "executionCount": metadata.get('execution_count', 0),
            "lastExecution": metadata.get('last_execution'),
            "storageSize": storage_stats.get('total_size', 0),
            "hasOutput": bool(output)
        }
        
    def calculate_time_efficiency(self, metadata: Dict[str, Any]) -> float:
        """시간 효율성 계산"""
        avg_time = metadata.get('average_execution_time', 0)
        
        if avg_time == 0:
            return 50.0  # 실행 이력 없음
            
        # 10초 이하면 100점, 60초 이상이면 0점
        if avg_time <= 10:
            return 100.0
        elif avg_time >= 60:
            return 0.0
        else:
            return 100 - ((avg_time - 10) / 50 * 100)
            
    def calculate_workload(self, tasks: List[Dict[str, Any]]) -> float:
        """작업량 계산"""
        if not tasks:
            return 50.0
            
        # 작업 상태별 카운트
        status_counts = {
            "○": sum(1 for t in tasks if t.get('status') == '○'),
            "×": sum(1 for t in tasks if t.get('status') == '×'),
            "△": sum(1 for t in tasks if t.get('status') == '△')
        }
        
        # 진행 중인 작업 비율
        total = len(tasks)
        if total == 0:
            return 100.0
            
        in_progress_ratio = status_counts["○"] / total
        not_modified_ratio = status_counts["×"] / total
        
        # 작업이 균형있게 진행되고 있는지 평가
        balance_score = 100 - (not_modified_ratio * 50)
        
        # 작업량이 적절한지 평가 (5-10개가 이상적)
        if total < 5:
            quantity_score = total * 20
        elif total > 10:
            quantity_score = max(0, 100 - (total - 10) * 10)
        else:
            quantity_score = 100
            
        return (balance_score + quantity_score) / 2
        
    def calculate_difficulty(
        self, 
        metadata: Dict[str, Any], 
        tasks: List[Dict[str, Any]]
    ) -> float:
        """난이도 평가"""
        # 에러 발생률
        error_rate = 0
        if metadata.get('execution_count', 0) > 0:
            error_count = metadata.get('error_count', 0)
            error_rate = error_count / metadata['execution_count']
            
        # 에러율이 낮을수록 난이도가 적절함
        error_score = (1 - error_rate) * 100
        
        # 부분 수정(△) 비율이 높으면 난이도가 높음
        partial_ratio = sum(1 for t in tasks if t.get('status') == '△') / len(tasks) if tasks else 0
        partial_score = (1 - partial_ratio) * 100
        
        return (error_score + partial_score) / 2
        
    def calculate_progress(self, tasks: List[Dict[str, Any]]) -> float:
        """진행률 계산"""
        if not tasks:
            return 0.0
            
        # 각 작업의 진행률 평균
        progress_values = []
        for task in tasks:
            if task.get('status') == '○':
                progress_values.append(50)  # 진행 중
            elif task.get('status') == '△':
                progress_values.append(75)  # 부분 완료
            else:  # ×
                progress_values.append(0)   # 미완료
                
        return sum(progress_values) / len(progress_values) if progress_values else 0
        
    def calculate_score(self, metrics: Dict[str, float]) -> float:
        """종합 점수 계산"""
        score = 0
        for metric, value in metrics.items():
            weight = self.evaluation_criteria[metric]["weight"]
            score += value * weight
            
        return round(score, 1)
        
    def identify_issues(
        self, 
        metrics: Dict[str, float],
        metadata: Dict[str, Any],
        tasks: List[Dict[str, Any]]
    ) -> List[str]:
        """문제점 식별"""
        issues = []
        
        # 메트릭별 이슈
        for metric, value in metrics.items():
            target = self.evaluation_criteria[metric]["target"]
            if value < target:
                issues.append(f"Low {metric}: {value:.1f} (target: {target})")
                
        # 실행 관련 이슈
        if metadata.get('last_error'):
            issues.append("Recent execution error detected")
            
        if metadata.get('execution_count', 0) == 0:
            issues.append("Node has never been executed")
            
        # 작업 관련 이슈
        not_modified_count = sum(1 for t in tasks if t.get('status') == '×')
        if not_modified_count > len(tasks) * 0.5:
            issues.append(f"High number of unmodified tasks: {not_modified_count}")
            
        return issues
        
    def generate_node_recommendations(
        self, 
        metrics: Dict[str, float], 
        issues: List[str]
    ) -> List[str]:
        """노드별 개선 제안"""
        recommendations = []
        
        if metrics['timeEfficiency'] < 50:
            recommendations.extend([
                "Optimize code for better performance",
                "Consider caching frequently used data",
                "Review and remove unnecessary computations"
            ])
            
        if metrics['workload'] < 50:
            recommendations.extend([
                "Rebalance task distribution",
                "Break down complex tasks into smaller ones",
                "Review task priorities and dependencies"
            ])
            
        if metrics['difficulty'] < 50:
            recommendations.extend([
                "Add more robust error handling",
                "Simplify complex logic",
                "Provide clearer task descriptions"
            ])
            
        if metrics['progress'] < 30:
            recommendations.extend([
                "Review and update task priorities",
                "Identify and remove blockers",
                "Consider automating repetitive tasks"
            ])
            
        return recommendations[:5]  # 최대 5개
        
    def calculate_overall_progress(self, evaluations: Dict[str, Dict[str, Any]]) -> float:
        """전체 진행률 계산"""
        if not evaluations:
            return 0.0
            
        progress_values = [
            eval['metrics']['progress'] 
            for eval in evaluations.values()
        ]
        
        return round(statistics.mean(progress_values), 1) if progress_values else 0.0
        
    async def plan_next_steps(
        self, 
        evaluations: Dict[str, Dict[str, Any]], 
        goals: str
    ) -> List[str]:
        """다음 단계 계획"""
        next_steps = []
        
        # 점수가 낮은 노드 우선 처리
        low_score_nodes = sorted(
            [(nid, eval) for nid, eval in evaluations.items() if eval['score'] < 60],
            key=lambda x: x[1]['score']
        )
        
        for node_id, eval in low_score_nodes[:3]:
            next_steps.append(
                f"Improve {eval['nodeLabel']} (Score: {eval['score']}) - Focus on {self.get_weakest_metric(eval['metrics'])}"
            )
            
        # 진행률이 낮은 작업
        low_progress_nodes = sorted(
            [(nid, eval) for nid, eval in evaluations.items() if eval['metrics']['progress'] < 50],
            key=lambda x: x[1]['metrics']['progress']
        )
        
        for node_id, eval in low_progress_nodes[:2]:
            if f"Improve {eval['nodeLabel']}" not in ' '.join(next_steps):
                next_steps.append(
                    f"Accelerate {eval['nodeLabel']} - {eval['metrics']['progress']:.0f}% complete"
                )
                
        # 목표 기반 단계
        if goals and len(next_steps) < 5:
            next_steps.append(f"Align workflow with goal: {goals[:100]}...")
            
        return next_steps[:5]
        
    def get_weakest_metric(self, metrics: Dict[str, float]) -> str:
        """가장 약한 메트릭 찾기"""
        return min(metrics.items(), key=lambda x: x[1])[0]
        
    def calculate_priorities(
        self, 
        evaluations: Dict[str, Dict[str, Any]],
        all_nodes: List[Dict[str, Any]]
    ) -> Dict[str, int]:
        """작업 우선순위 계산"""
        priorities = {}
        
        for node in all_nodes:
            node_id = node['id']
            priority = 50  # 기본 우선순위
            
            if node_id in evaluations:
                eval = evaluations[node_id]
                
                # 점수가 낮을수록 높은 우선순위
                score_priority = 100 - eval['score']
                
                # 진행률이 낮을수록 높은 우선순위
                progress_priority = 100 - eval['metrics']['progress']
                
                # 이슈가 많을수록 높은 우선순위
                issue_priority = len(eval.get('issues', [])) * 10
                
                priority = min(100, (score_priority + progress_priority + issue_priority) / 3)
                
            priorities[node_id] = round(priority)
            
        return priorities
        
    async def generate_watcher_requests(
        self, 
        evaluations: Dict[str, Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Watcher 노드에 대한 요청 생성"""
        requests = []
        
        for node_id, eval in evaluations.items():
            # 진행률이 낮은 노드를 위한 데이터 수집 요청
            if eval['metrics']['progress'] < 30:
                requests.append({
                    "type": "collect_examples",
                    "target_node": node_id,
                    "purpose": f"Find examples to help complete tasks for {eval['nodeLabel']}",
                    "priority": "high"
                })
                
            # 난이도가 높은 노드를 위한 참조 자료 요청
            if eval['metrics']['difficulty'] < 50:
                requests.append({
                    "type": "find_references",
                    "target_node": node_id,
                    "purpose": f"Find reference implementations for {eval['nodeLabel']}",
                    "priority": "medium"
                })
                
        return requests[:5]  # 최대 5개
        
    def generate_supervisor_recommendations(
        self,
        evaluations: Dict[str, Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Supervisor 노드에 대한 추천 사항"""
        recommendations = []
        
        # 점수가 낮은 노드들에 대한 수정 추천
        for node_id, eval in evaluations.items():
            if eval['score'] < 70:
                recommendations.append({
                    "target_node": node_id,
                    "action": "auto" if eval['score'] < 50 else "review",
                    "priority": "high" if eval['score'] < 50 else "medium",
                    "focus_areas": [
                        metric for metric, value in eval['metrics'].items()
                        if value < self.evaluation_criteria[metric]["target"]
                    ]
                })
                
        return sorted(recommendations, key=lambda x: x['priority'] == 'high', reverse=True)
        
    async def generate_recommendations(
        self, 
        evaluations: Dict[str, Dict[str, Any]]
    ) -> List[str]:
        """전체 워크플로우 개선 제안"""
        recommendations = []
        
        # 전체 점수 분석
        scores = [eval['score'] for eval in evaluations.values()]
        if scores:
            avg_score = statistics.mean(scores)
            
            if avg_score < 60:
                recommendations.append("Overall workflow performance is below target")
                recommendations.append("Consider restructuring the workflow for better efficiency")
                
            # 편차 분석
            if len(scores) > 1:
                score_variance = statistics.variance(scores)
                if score_variance > 400:  # 표준편차 20 이상
                    recommendations.append("High variance in node performance detected")
                    recommendations.append("Balance workload across nodes")
                    
        # 병목 현상 식별
        time_efficiencies = [
            eval['metrics']['timeEfficiency'] 
            for eval in evaluations.values()
        ]
        if time_efficiencies:
            min_efficiency = min(time_efficiencies)
            if min_efficiency < 30:
                recommendations.append("Critical bottleneck detected in workflow")
                recommendations.append("Prioritize optimization of slowest nodes")
                
        # 전체 진행률 기반 추천
        overall_progress = self.calculate_overall_progress(evaluations)
        if overall_progress < 50:
            recommendations.append("Low overall progress - consider task re-prioritization")
            
        return recommendations[:7]
        
    async def accept_evaluation(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """평가 결과 승인"""
        try:
            # 현재 평가 로드
            current_eval = await node_storage.get_data(node_id, 'current_evaluation')
            if not current_eval:
                return {
                    "status": "error",
                    "error": "No pending evaluation to accept"
                }
                
            # 승인된 평가로 저장
            current_eval['status'] = 'accepted'
            current_eval['accepted_at'] = datetime.now().isoformat()
            current_eval['accepted_by'] = data.get('userId', 'system')
            
            await node_storage.save_data(node_id, 'accepted_evaluation', current_eval)
            
            # Watcher와 Supervisor에 액션 전달
            if data.get('triggerActions', True):
                # 실제로는 메시지 큐나 이벤트를 통해 전달
                pass
                
            return {
                "status": "success",
                "message": "Evaluation accepted and actions triggered",
                "evaluation": current_eval,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e)
            }
            
    async def cancel_evaluation(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """평가 취소"""
        try:
            # 현재 평가 삭제
            current_eval = await node_storage.get_data(node_id, 'current_evaluation')
            if current_eval:
                # 취소 이력 저장
                cancel_record = {
                    "evaluation": current_eval,
                    "cancelled_at": datetime.now().isoformat(),
                    "cancelled_by": data.get('userId', 'system'),
                    "reason": data.get('reason', 'User cancelled')
                }
                
                # 취소 이력 추가
                cancel_history = await node_storage.get_data(node_id, 'cancel_history') or []
                cancel_history.append(cancel_record)
                await node_storage.save_data(node_id, 'cancel_history', cancel_history[-10:])  # 최근 10개
                
            return {
                "status": "success",
                "message": "Evaluation cancelled",
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "status": "error", 
                "error": str(e)
            }

# 모듈 레벨 인스턴스
planner_node = PlannerNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await planner_node.execute(node_id, data)