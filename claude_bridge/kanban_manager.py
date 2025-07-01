#!/usr/bin/env python3
"""
Kanban Manager - 작업 관리 시스템
CLAUDE.md 목표를 작은 작업들로 분할하고 관리
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

from .safety_manager import SafetyManager

logger = logging.getLogger(__name__)

class KanbanTask:
    """칸반 작업"""
    
    def __init__(self, task_data: Dict[str, Any]):
        self.id = task_data.get("id", str(uuid.uuid4()))
        self.title = task_data.get("title", "Untitled Task")
        self.description = task_data.get("description", "")
        self.status = task_data.get("status", "pending")  # pending, in_progress, completed, failed, blocked
        self.priority = task_data.get("priority", 3)  # 1=high, 2=medium, 3=low
        self.type = task_data.get("type", "general")  # general, analysis, implementation, testing, documentation
        self.created_at = task_data.get("created_at", datetime.now().isoformat())
        self.updated_at = task_data.get("updated_at", datetime.now().isoformat())
        self.assigned_to = task_data.get("assigned_to", "claude_system")
        self.estimated_hours = task_data.get("estimated_hours", 1.0)
        self.actual_hours = task_data.get("actual_hours", 0.0)
        self.dependencies = task_data.get("dependencies", [])
        self.tags = task_data.get("tags", [])
        self.claude_conversations = task_data.get("claude_conversations", [])
        self.files_involved = task_data.get("files_involved", [])
        self.safety_level = task_data.get("safety_level", "SAFE_WRITE")
        self.block_reason = task_data.get("block_reason", "")
        self.completion_notes = task_data.get("completion_notes", "")
    
    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리로 변환"""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "priority": self.priority,
            "type": self.type,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "assigned_to": self.assigned_to,
            "estimated_hours": self.estimated_hours,
            "actual_hours": self.actual_hours,
            "dependencies": self.dependencies,
            "tags": self.tags,
            "claude_conversations": self.claude_conversations,
            "files_involved": self.files_involved,
            "safety_level": self.safety_level,
            "block_reason": self.block_reason,
            "completion_notes": self.completion_notes
        }
    
    def update_status(self, new_status: str, notes: str = ""):
        """상태 업데이트"""
        self.status = new_status
        self.updated_at = datetime.now().isoformat()
        if notes:
            self.completion_notes = notes

class KanbanManager:
    """칸반 보드 관리자"""
    
    def __init__(self, safety_manager: SafetyManager):
        self.safety_manager = safety_manager
        self.project_root = Path("F:/ONE_AI")
        self.kanban_file = self.project_root / "kanban_board.json"
        self.backup_dir = self.project_root / ".claude_bridge" / "kanban_backups"
        
        # 작업 저장소
        self.tasks: Dict[str, KanbanTask] = {}
        self.user_questions: List[Dict[str, Any]] = []
        self.sprint_goals: List[Dict[str, Any]] = []
        
        # 통계
        self.stats = {
            "total_tasks": 0,
            "completed_tasks": 0,
            "blocked_tasks": 0,
            "claude_interactions": 0
        }
        
        # 백업 디렉토리 생성
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info("Kanban Manager initialized")
    
    async def initialize(self):
        """초기화"""
        try:
            # 기존 칸반 데이터 로드
            await self._load_existing_board()
            
            # CLAUDE.md 분석하여 초기 작업 생성
            await self._analyze_claude_md()
            
            logger.info("Kanban Manager initialization completed")
            
        except Exception as e:
            logger.error(f"Kanban Manager initialization failed: {e}")
    
    async def _load_existing_board(self):
        """기존 칸반 보드 로드"""
        try:
            if self.kanban_file.exists():
                with open(self.kanban_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # 작업 로드
                for task_data in data.get("tasks", []):
                    task = KanbanTask(task_data)
                    self.tasks[task.id] = task
                
                # 사용자 질문 로드
                self.user_questions = data.get("user_questions", [])
                
                # 스프린트 목표 로드
                self.sprint_goals = data.get("sprint_goals", [])
                
                # 통계 로드
                self.stats = data.get("stats", self.stats)
                
                logger.info(f"Loaded {len(self.tasks)} existing tasks")
            
        except Exception as e:
            logger.error(f"Failed to load existing board: {e}")
    
    async def _analyze_claude_md(self):
        """CLAUDE.md 분석하여 작업 생성"""
        try:
            claude_md_path = self.project_root / "CLAUDE.md"
            if not claude_md_path.exists():
                logger.warning("CLAUDE.md not found")
                return
            
            with open(claude_md_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 주요 섹션별 작업 생성
            sections = self._parse_claude_md_sections(content)
            
            for section_name, section_content in sections.items():
                await self._create_tasks_from_section(section_name, section_content)
            
            logger.info(f"Created tasks from CLAUDE.md analysis")
            
        except Exception as e:
            logger.error(f"Failed to analyze CLAUDE.md: {e}")
    
    def _parse_claude_md_sections(self, content: str) -> Dict[str, str]:
        """CLAUDE.md 섹션 파싱"""
        sections = {}
        current_section = "General"
        current_content = []
        
        lines = content.split('\n')
        
        for line in lines:
            if line.startswith('##'):
                # 새 섹션 시작
                if current_content:
                    sections[current_section] = '\n'.join(current_content)
                
                current_section = line.replace('##', '').strip()
                current_content = []
            else:
                current_content.append(line)
        
        # 마지막 섹션 추가
        if current_content:
            sections[current_section] = '\n'.join(current_content)
        
        return sections
    
    async def _create_tasks_from_section(self, section_name: str, section_content: str):
        """섹션 내용에서 작업 생성"""
        try:
            # 섹션별 작업 우선순위 결정
            priority_map = {
                "Argosa Data Analysis Module": 1,
                "Data Collection Workflow": 1,
                "Current Focus": 1,
                "Development Commands": 2,
                "Testing": 2,
                "File Locations": 3,
                "Notes": 3
            }
            
            priority = priority_map.get(section_name, 2)
            
            # 섹션 내용 기반 작업 생성
            if "data_analysis.py" in section_content.lower():
                await self.create_task({
                    "title": f"Work on {section_name}: data_analysis.py",
                    "description": f"Implement improvements for data_analysis.py based on {section_name} requirements",
                    "type": "implementation",
                    "priority": priority,
                    "tags": ["data_analysis", "backend", section_name.lower().replace(' ', '_')],
                    "files_involved": ["backend/routers/argosa/data_analysis.py"]
                })
            
            if "testing" in section_content.lower():
                await self.create_task({
                    "title": f"Testing: {section_name}",
                    "description": f"Create and run tests for {section_name} components",
                    "type": "testing",
                    "priority": priority,
                    "tags": ["testing", section_name.lower().replace(' ', '_')]
                })
            
            if "documentation" in section_content.lower():
                await self.create_task({
                    "title": f"Documentation: {section_name}",
                    "description": f"Update documentation for {section_name}",
                    "type": "documentation",
                    "priority": 3,
                    "tags": ["documentation", section_name.lower().replace(' ', '_')]
                })
            
        except Exception as e:
            logger.error(f"Failed to create tasks from section {section_name}: {e}")
    
    async def create_task(self, task_data: Dict[str, Any]) -> KanbanTask:
        """작업 생성"""
        try:
            # 안전성 검사
            task_desc = task_data.get("description", "")
            is_safe, reason = self.safety_manager.is_operation_safe(task_desc, "task_creation")
            
            if not is_safe:
                logger.warning(f"Task creation blocked: {reason}")
                task_data["status"] = "blocked"
                task_data["block_reason"] = reason
            
            # 작업 생성
            task = KanbanTask(task_data)
            self.tasks[task.id] = task
            
            # 통계 업데이트
            self.stats["total_tasks"] += 1
            if task.status == "blocked":
                self.stats["blocked_tasks"] += 1
            
            # 사용자 질문 필요한지 확인
            if self._needs_user_clarification(task):
                await self._add_user_question(task)
            
            # 보드 저장
            await self._save_board()
            
            logger.info(f"Created task: {task.title}")
            return task
            
        except Exception as e:
            logger.error(f"Failed to create task: {e}")
            raise
    
    def _needs_user_clarification(self, task: KanbanTask) -> bool:
        """사용자 명확화가 필요한지 확인"""
        # 질문 표시가 있거나 애매한 내용인 경우
        unclear_keywords = ["?", "unclear", "ambiguous", "uncertain", "maybe", "possibly"]
        
        text_to_check = f"{task.title} {task.description}".lower()
        
        return any(keyword in text_to_check for keyword in unclear_keywords)
    
    async def _add_user_question(self, task: KanbanTask):
        """사용자 질문 추가"""
        question = {
            "id": str(uuid.uuid4()),
            "task_id": task.id,
            "question": f"Task '{task.title}' needs clarification: {task.description}",
            "type": "task_clarification",
            "priority": task.priority,
            "created_at": datetime.now().isoformat(),
            "status": "pending"
        }
        
        self.user_questions.append(question)
        logger.info(f"Added user question for task: {task.title}")
    
    async def update_task_status(self, task_id: str, new_status: str, notes: str = "") -> bool:
        """작업 상태 업데이트"""
        try:
            if task_id not in self.tasks:
                logger.error(f"Task not found: {task_id}")
                return False
            
            task = self.tasks[task_id]
            old_status = task.status
            
            task.update_status(new_status, notes)
            
            # 통계 업데이트
            if old_status != "completed" and new_status == "completed":
                self.stats["completed_tasks"] += 1
            
            if old_status != "blocked" and new_status == "blocked":
                self.stats["blocked_tasks"] += 1
            elif old_status == "blocked" and new_status != "blocked":
                self.stats["blocked_tasks"] -= 1
            
            # 보드 저장
            await self._save_board()
            
            logger.info(f"Task {task_id} status updated: {old_status} -> {new_status}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update task status: {e}")
            return False
    
    async def get_board(self) -> Dict[str, Any]:
        """칸반 보드 조회"""
        try:
            return {
                "tasks": [task.to_dict() for task in self.tasks.values()],
                "user_questions": self.user_questions,
                "sprint_goals": self.sprint_goals,
                "stats": self.stats,
                "last_updated": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to get board: {e}")
            return {}
    
    async def get_summary(self) -> Dict[str, Any]:
        """요약 정보 조회"""
        try:
            status_counts = {}
            priority_counts = {1: 0, 2: 0, 3: 0}
            type_counts = {}
            
            for task in self.tasks.values():
                # 상태별 카운트
                status_counts[task.status] = status_counts.get(task.status, 0) + 1
                
                # 우선순위별 카운트
                priority_counts[task.priority] = priority_counts.get(task.priority, 0) + 1
                
                # 타입별 카운트
                type_counts[task.type] = type_counts.get(task.type, 0) + 1
            
            return {
                "total_tasks": len(self.tasks),
                "status_counts": status_counts,
                "priority_counts": priority_counts,
                "type_counts": type_counts,
                "user_questions_pending": len([q for q in self.user_questions if q.get("status") == "pending"]),
                "stats": self.stats
            }
            
        except Exception as e:
            logger.error(f"Failed to get summary: {e}")
            return {}
    
    async def _save_board(self):
        """칸반 보드 저장"""
        try:
            # 백업 생성
            await self._create_backup()
            
            # 메인 파일 저장
            board_data = await self.get_board()
            
            # 안전한 파일 쓰기
            success = self.safety_manager.safe_file_operation(
                self.kanban_file,
                "save_kanban_board",
                json.dumps(board_data, indent=2, ensure_ascii=False)
            )
            
            if success:
                logger.debug("Kanban board saved successfully")
            else:
                logger.error("Failed to save kanban board")
            
        except Exception as e:
            logger.error(f"Failed to save board: {e}")
    
    async def _create_backup(self):
        """백업 생성"""
        try:
            if self.kanban_file.exists():
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_file = self.backup_dir / f"kanban_backup_{timestamp}.json"
                
                import shutil
                shutil.copy2(self.kanban_file, backup_file)
                
                logger.debug(f"Kanban backup created: {backup_file}")
        
        except Exception as e:
            logger.error(f"Failed to create backup: {e}")
    
    async def add_claude_conversation(self, task_id: str, conversation: Dict[str, Any]):
        """Claude 대화 추가"""
        try:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                task.claude_conversations.append(conversation)
                task.updated_at = datetime.now().isoformat()
                
                self.stats["claude_interactions"] += 1
                
                await self._save_board()
                
                logger.info(f"Added Claude conversation to task: {task_id}")
            
        except Exception as e:
            logger.error(f"Failed to add Claude conversation: {e}")
    
    async def cleanup(self):
        """정리"""
        try:
            # 최종 저장
            await self._save_board()
            logger.info("Kanban Manager cleanup completed")
            
        except Exception as e:
            logger.error(f"Kanban Manager cleanup failed: {e}")

# 헬퍼 함수들
async def create_kanban_task(title: str, description: str, task_type: str = "general") -> Dict[str, Any]:
    """칸반 작업 생성 헬퍼"""
    from .safety_manager import get_safety_manager
    
    safety_manager = get_safety_manager()
    kanban = KanbanManager(safety_manager)
    await kanban.initialize()
    
    task_data = {
        "title": title,
        "description": description,
        "type": task_type
    }
    
    task = await kanban.create_task(task_data)
    return task.to_dict()

if __name__ == "__main__":
    import asyncio
    from .safety_manager import SafetyManager, SafetyLevel
    
    async def test_kanban():
        safety = SafetyManager(SafetyLevel.SAFE_WRITE)
        kanban = KanbanManager(safety)
        await kanban.initialize()
        
        # 테스트 작업 생성
        task = await kanban.create_task({
            "title": "Test Task",
            "description": "This is a test task for the kanban system",
            "type": "testing",
            "priority": 1
        })
        
        print(f"Created task: {task.title}")
        
        # 보드 조회
        board = await kanban.get_board()
        print(f"Board has {len(board['tasks'])} tasks")
        
        # 요약 조회
        summary = await kanban.get_summary()
        print(f"Summary: {summary}")
    
    asyncio.run(test_kanban())