import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional
import statistics

class PlannerNode:
    """Planner 노드 - 전체 워크플로우 계획 및 평가"""
    
    def __init__(self):
        self.config_dir = Path("config/nodes")
        self.data_dir = Path("data/planner")
        self.data_dir.mkdir(parents=True, exist_ok=True)
    
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Planner 노드 실행"""
        try:
            # 설정 로드
            config = await self.load_config(node_id)
            
            # 현재 탭의 모든 노드 가져오기
            all_nodes = data.get('allNodes', [])
            
            # 전체 목표
            goals = data.get('goals', config.get('goals', ''))
            
            # 각 노드 평가
            evaluations = {}
            for node in all_nodes:
                if node['type'] in ['worker', 'supervisor', 'watcher']:
                    evaluation = await self.evaluate_node(node)
                    evaluations[node['id']] = evaluation
            
            # 전체 진행률 계산
            overall_progress = self.calculate_overall_progress(evaluations)
            
            # 다음 단계 계획
            next_steps = await self.plan_next_steps(evaluations, goals)
            
            # 작업 우선순위 조정
            priorities = self.calculate_priorities(evaluations, all_nodes)
            
            # 결과 저장
            result = {
                "goals": goals,
                "evaluations": evaluations,
                "overallProgress": overall_progress,
                "nextSteps": next_steps,
                "priorities": priorities,
                "recommendations": await self.generate_recommendations(evaluations)
            }
            
            await self.save_plan(node_id, result)
            
            return {
                "status": "success",
                "plan": result,
                "timestamp": datetime.now().isoformat()
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
            "goals": "",
            "evaluationCriteria": {
                "timeEfficiency": {"weight": 0.25, "target": 80},
                "workload": {"weight": 0.25, "target": 70},
                "difficulty": {"weight": 0.25, "target": 60},
                "progress": {"weight": 0.25, "target": 90}
            },
            "planningHorizon": 7  # days
        }
    
    async def evaluate_node(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """개별 노드 평가"""
        node_id = node['id']
        
        # 노드 실행 이력 로드
        history = await self.load_node_history(node_id)
        
        # 메트릭 계산
        metrics = {
            "timeEfficiency": self.calculate_time_efficiency(history),
            "workload": self.calculate_workload(node, history),
            "difficulty": self.calculate_difficulty(node, history),
            "progress": self.calculate_progress(node, history)
        }
        
        # 종합 점수 계산
        score = self.calculate_score(metrics)
        
        # 문제점 식별
        issues = self.identify_issues(metrics, history)
        
        # 개선 제안
        recommendations = self.generate_node_recommendations(metrics, issues)
        
        return {
            "nodeId": node_id,
            "nodeType": node['type'],
            "score": score,
            "metrics": metrics,
            "issues": issues,
            "recommendations": recommendations,
            "lastEvaluated": datetime.now().isoformat()
        }
    
    async def load_node_history(self, node_id: str) -> List[Dict[str, Any]]:
        """노드 실행 이력 로드"""
        history_path = Path(f"data/projects/{node_id}/execution_history.json")
        
        if history_path.exists():
            with open(history_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        # 시뮬레이션 데이터
        return [
            {
                "timestamp": (datetime.now() - timedelta(hours=i)).isoformat(),
                "executionTime": 10 + i * 2,
                "success": i % 5 != 0,
                "outputSize": 1000 + i * 100
            }
            for i in range(10)
        ]
    
    def calculate_time_efficiency(self, history: List[Dict[str, Any]]) -> float:
        """시간 효율성 계산"""
        if not history:
            return 50.0
        
        execution_times = [h['executionTime'] for h in history if 'executionTime' in h]
        if not execution_times:
            return 50.0
        
        avg_time = statistics.mean(execution_times)
        
        # 10초 이하면 100점, 60초 이상이면 0점
        if avg_time <= 10:
            return 100.0
        elif avg_time >= 60:
            return 0.0
        else:
            return 100 - ((avg_time - 10) / 50 * 100)
    
    def calculate_workload(self, node: Dict[str, Any], history: List[Dict[str, Any]]) -> float:
        """작업량 계산"""
        # 작업 수와 완료율 기반
        tasks = node.get('data', {}).get('tasks', [])
        if not tasks:
            return 100.0
        
        completed = sum(1 for task in tasks if task.get('status') != 'todo')
        completion_rate = (completed / len(tasks)) * 100
        
        # 작업량이 적절한지 평가 (5-10개가 이상적)
        task_count_score = 100
        if len(tasks) < 5:
            task_count_score = len(tasks) * 20
        elif len(tasks) > 10:
            task_count_score = max(0, 100 - (len(tasks) - 10) * 10)
        
        return (completion_rate + task_count_score) / 2
    
    def calculate_difficulty(self, node: Dict[str, Any], history: List[Dict[str, Any]]) -> float:
        """난이도 평가"""
        # 실패율과 코드 복잡도 기반
        if not history:
            return 50.0
        
        failure_rate = sum(1 for h in history if not h.get('success', True)) / len(history)
        
        # 실패율이 낮을수록 난이도가 적절함
        difficulty_score = (1 - failure_rate) * 100
        
        # 코드 길이도 고려 (시뮬레이션)
        code = node.get('data', {}).get('code', '')
        code_lines = len(code.splitlines()) if code else 0
        
        if code_lines < 20:
            code_score = 100
        elif code_lines > 200:
            code_score = 30
        else:
            code_score = 100 - ((code_lines - 20) / 180 * 70)
        
        return (difficulty_score + code_score) / 2
    
    def calculate_progress(self, node: Dict[str, Any], history: List[Dict[str, Any]]) -> float:
        """진행률 계산"""
        tasks = node.get('data', {}).get('tasks', [])
        if not tasks:
            return 0.0
        
        total_progress = sum(task.get('progress', 0) for task in tasks)
        return total_progress / len(tasks)
    
    def calculate_score(self, metrics: Dict[str, float]) -> float:
        """종합 점수 계산"""
        weights = {
            "timeEfficiency": 0.25,
            "workload": 0.25,
            "difficulty": 0.25,
            "progress": 0.25
        }
        
        score = sum(metrics.get(key, 0) * weight for key, weight in weights.items())
        return round(score, 1)
    
    def identify_issues(self, metrics: Dict[str, float], history: List[Dict[str, Any]]) -> List[str]:
        """문제점 식별"""
        issues = []
        
        if metrics['timeEfficiency'] < 50:
            issues.append("Low time efficiency - execution takes too long")
        
        if metrics['workload'] < 50:
            issues.append("Inappropriate workload - too many or too few tasks")
        
        if metrics['difficulty'] < 50:
            issues.append("High failure rate or overly complex code")
        
        if metrics['progress'] < 30:
            issues.append("Low progress - tasks not being completed")
        
        # 최근 실패 추세 확인
        recent_failures = sum(1 for h in history[-5:] if not h.get('success', True))
        if recent_failures >= 3:
            issues.append("Recent execution failures detected")
        
        return issues
    
    def generate_node_recommendations(self, metrics: Dict[str, float], issues: List[str]) -> List[str]:
        """노드별 개선 제안"""
        recommendations = []
        
        if metrics['timeEfficiency'] < 50:
            recommendations.append("Optimize code for better performance")
            recommendations.append("Consider caching frequently used data")
        
        if metrics['workload'] < 50:
            recommendations.append("Rebalance task distribution")
            recommendations.append("Break down complex tasks into smaller ones")
        
        if metrics['difficulty'] < 50:
            recommendations.append("Add more robust error handling")
            recommendations.append("Simplify complex logic")
        
        if metrics['progress'] < 30:
            recommendations.append("Review and update task priorities")
            recommendations.append("Identify and remove blockers")
        
        return recommendations
    
    def calculate_overall_progress(self, evaluations: Dict[str, Dict[str, Any]]) -> float:
        """전체 진행률 계산"""
        if not evaluations:
            return 0.0
        
        progress_values = [
            eval['metrics']['progress'] 
            for eval in evaluations.values() 
            if 'metrics' in eval
        ]
        
        if not progress_values:
            return 0.0
        
        return round(statistics.mean(progress_values), 1)
    
    async def plan_next_steps(self, evaluations: Dict[str, Dict[str, Any]], goals: str) -> List[str]:
        """다음 단계 계획"""
        next_steps = []
        
        # 점수가 낮은 노드 우선 처리
        low_score_nodes = [
            (node_id, eval) 
            for node_id, eval in evaluations.items() 
            if eval['score'] < 60
        ]
        
        for node_id, eval in sorted(low_score_nodes, key=lambda x: x[1]['score']):
            next_steps.append(f"Improve {eval['nodeType']} node ({node_id}): Score {eval['score']}")
        
        # 진행률이 낮은 작업 처리
        low_progress_nodes = [
            (node_id, eval) 
            for node_id, eval in evaluations.items() 
            if eval['metrics']['progress'] < 50
        ]
        
        for node_id, eval in sorted(low_progress_nodes, key=lambda x: x[1]['metrics']['progress']):
            next_steps.append(f"Accelerate progress on {node_id}: {eval['metrics']['progress']}% complete")
        
        # 목표 기반 단계 추가
        if goals:
            next_steps.append(f"Align all nodes with main goal: {goals[:50]}...")
        
        return next_steps[:5]  # 상위 5개만 반환
    
    def calculate_priorities(self, evaluations: Dict[str, Dict[str, Any]], all_nodes: List[Dict[str, Any]]) -> Dict[str, int]:
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
    
    async def generate_recommendations(self, evaluations: Dict[str, Dict[str, Any]]) -> List[str]:
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
        
        return recommendations
    
    async def save_plan(self, node_id: str, plan: Dict[str, Any]):
        """계획 저장"""
        plan_file = self.data_dir / f"{node_id}_plan.json"
        
        with open(plan_file, 'w', encoding='utf-8') as f:
            json.dump(plan, f, indent=2, ensure_ascii=False)
        
        # 이력 저장
        history_file = self.data_dir / f"{node_id}_history.json"
        history = []
        
        if history_file.exists():
            with open(history_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
        
        history.append({
            "timestamp": datetime.now().isoformat(),
            "overallProgress": plan['overallProgress'],
            "nodeCount": len(plan['evaluations'])
        })
        
        # 최근 30일 데이터만 유지
        cutoff_date = datetime.now() - timedelta(days=30)
        history = [
            h for h in history 
            if datetime.fromisoformat(h['timestamp']) > cutoff_date
        ]
        
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2, ensure_ascii=False)


# 모듈 레벨 인스턴스
planner_node = PlannerNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await planner_node.execute(node_id, data)