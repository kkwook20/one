#!/usr/bin/env python3
"""
VS Code Safe Interface
VS Code와의 안전한 인터페이스 - Explorer 조작 없이 파일 기반 통신
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import time
import os

logger = logging.getLogger(__name__)

class VSCodeSafeInterface:
    """VS Code와의 안전한 인터페이스"""
    
    def __init__(self, project_root: str = "F:/ONE_AI"):
        self.project_root = Path(project_root)
        self.communication_dir = self.project_root / ".vscode_communication"
        self.input_file = self.communication_dir / "claude_input.json"
        self.output_file = self.communication_dir / "claude_output.json"
        self.status_file = self.communication_dir / "status.json"
        
        # 통신 디렉토리 생성
        self.communication_dir.mkdir(exist_ok=True)
        
        # 대화 기록
        self.conversation_history = []
        
        logger.info("VS Code Safe Interface initialized")
    
    async def send_message_to_claude(self, message: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Claude Code에게 안전하게 메시지 전송"""
        try:
            # 입력 메시지 준비
            input_data = {
                "timestamp": datetime.now().isoformat(),
                "message": message,
                "context": context or {},
                "type": "question",
                "id": str(int(time.time() * 1000))
            }
            
            # 입력 파일에 저장
            with open(self.input_file, 'w', encoding='utf-8') as f:
                json.dump(input_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Message sent to Claude: {message[:100]}...")
            
            # 사용자에게 안내
            print(f"\n{'='*60}")
            print("📝 CLAUDE CODE에게 질문을 보냈습니다")
            print(f"{'='*60}")
            print(f"질문: {message}")
            print(f"파일: {self.input_file}")
            print("\n🔵 VS Code에서 다음 파일을 열어서 질문을 확인하고 답변해주세요:")
            print(f"   {self.input_file}")
            print("\n💬 답변은 다음 파일에 저장해주세요:")
            print(f"   {self.output_file}")
            print(f"\n{'='*60}")
            
            # 응답 대기 (파일 기반)
            response = await self._wait_for_response()
            
            # 대화 기록 저장
            conversation = {
                "timestamp": datetime.now().isoformat(),
                "input": input_data,
                "output": response
            }
            self.conversation_history.append(conversation)
            
            return response
            
        except Exception as e:
            logger.error(f"Failed to send message to Claude: {e}")
            return {"error": str(e), "success": False}
    
    async def _wait_for_response(self, timeout: int = 300) -> Dict[str, Any]:
        """Claude의 응답 대기"""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                if self.output_file.exists():
                    with open(self.output_file, 'r', encoding='utf-8') as f:
                        response_data = json.load(f)
                    
                    # 응답 파일 삭제 (처리 완료)
                    self.output_file.unlink()
                    
                    logger.info("Response received from Claude")
                    return response_data
                
                # 상태 업데이트
                await self._update_status("waiting_for_response")
                await asyncio.sleep(2)
                
            except Exception as e:
                logger.error(f"Error waiting for response: {e}")
                await asyncio.sleep(5)
        
        # 타임아웃
        logger.warning("Response timeout")
        return {
            "error": "Response timeout",
            "success": False,
            "timeout": timeout
        }
    
    async def _update_status(self, status: str):
        """상태 업데이트"""
        try:
            status_data = {
                "timestamp": datetime.now().isoformat(),
                "status": status,
                "input_file": str(self.input_file),
                "output_file": str(self.output_file)
            }
            
            with open(self.status_file, 'w', encoding='utf-8') as f:
                json.dump(status_data, f, indent=2, ensure_ascii=False)
                
        except Exception as e:
            logger.error(f"Failed to update status: {e}")
    
    async def ask_claude_about_task(self, task_description: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Claude에게 작업에 대해 질문"""
        message = f"""
🤖 CLAUDE CODE 자동 질문 시스템

작업: {task_description}

다음 사항에 대해 답변해주세요:

1. 이 작업을 수행하기 위해 어떤 단계들이 필요한가요?
2. 어떤 파일들을 수정해야 하나요?
3. 주의해야 할 점이 있나요?
4. 테스트는 어떻게 해야 하나요?

답변은 다음 형식의 JSON으로 해주세요:
{{
  "steps": ["단계1", "단계2", ...],
  "files_to_modify": ["파일1", "파일2", ...],
  "warnings": ["주의사항1", "주의사항2", ...],
  "testing": "테스트 방법",
  "additional_info": "추가 정보"
}}
"""
        
        return await self.send_message_to_claude(message, context)
    
    async def ask_claude_for_code(self, code_request: str, file_path: str = None) -> Dict[str, Any]:
        """Claude에게 코드 작성 요청"""
        context = {}
        if file_path:
            context["target_file"] = file_path
            
            # 기존 파일 내용 포함 (있다면)
            target_path = self.project_root / file_path
            if target_path.exists():
                try:
                    with open(target_path, 'r', encoding='utf-8') as f:
                        context["existing_content"] = f.read()
                except Exception as e:
                    context["existing_content_error"] = str(e)
        
        message = f"""
🔧 CLAUDE CODE 코드 작성 요청

요청: {code_request}

{'파일: ' + file_path if file_path else ''}

다음 형식으로 답변해주세요:
{{
  "code": "작성된 코드",
  "explanation": "코드 설명",
  "filename": "저장할 파일명",
  "backup_needed": true/false,
  "dependencies": ["필요한 라이브러리들"]
}}
"""
        
        return await self.send_message_to_claude(message, context)
    
    async def ask_claude_for_analysis(self, analysis_request: str, data: Any = None) -> Dict[str, Any]:
        """Claude에게 분석 요청"""
        context = {"data": data} if data else {}
        
        message = f"""
📊 CLAUDE CODE 분석 요청

분석 요청: {analysis_request}

답변은 다음 형식으로 해주세요:
{{
  "analysis_result": "분석 결과",
  "recommendations": ["권장사항1", "권장사항2", ...],
  "risks": ["위험요소1", "위험요소2", ...],
  "next_steps": ["다음 단계1", "다음 단계2", ...]
}}
"""
        
        return await self.send_message_to_claude(message, context)
    
    def create_response_template(self, question_type: str = "general") -> str:
        """응답 템플릿 생성"""
        templates = {
            "general": {
                "success": True,
                "response": "여기에 답변을 작성해주세요",
                "additional_info": "추가 정보 (선택사항)"
            },
            "task": {
                "success": True,
                "steps": ["단계1", "단계2"],
                "files_to_modify": ["파일1", "파일2"],
                "warnings": ["주의사항"],
                "testing": "테스트 방법"
            },
            "code": {
                "success": True,
                "code": "// 여기에 코드 작성",
                "explanation": "코드 설명",
                "filename": "파일명.py",
                "backup_needed": True,
                "dependencies": []
            },
            "analysis": {
                "success": True,
                "analysis_result": "분석 결과",
                "recommendations": ["권장사항"],
                "risks": ["위험요소"],
                "next_steps": ["다음 단계"]
            }
        }
        
        return json.dumps(templates.get(question_type, templates["general"]), indent=2, ensure_ascii=False)
    
    async def save_conversation_history(self):
        """대화 기록 저장"""
        try:
            history_file = self.communication_dir / f"conversation_history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            
            with open(history_file, 'w', encoding='utf-8') as f:
                json.dump(self.conversation_history, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Conversation history saved: {history_file}")
            
        except Exception as e:
            logger.error(f"Failed to save conversation history: {e}")
    
    def get_communication_status(self) -> Dict[str, Any]:
        """통신 상태 조회"""
        return {
            "communication_dir": str(self.communication_dir),
            "input_file": str(self.input_file),
            "output_file": str(self.output_file),
            "input_exists": self.input_file.exists(),
            "output_exists": self.output_file.exists(),
            "conversation_count": len(self.conversation_history),
            "last_communication": self.conversation_history[-1]["timestamp"] if self.conversation_history else None
        }

# 헬퍼 함수들
async def ask_claude_safely(message: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
    """Claude에게 안전하게 질문"""
    interface = VSCodeSafeInterface()
    return await interface.send_message_to_claude(message, context)

async def get_claude_task_guidance(task: str) -> Dict[str, Any]:
    """Claude에게 작업 가이드 요청"""
    interface = VSCodeSafeInterface()
    return await interface.ask_claude_about_task(task)

async def get_claude_code_help(request: str, file_path: str = None) -> Dict[str, Any]:
    """Claude에게 코드 도움 요청"""
    interface = VSCodeSafeInterface()
    return await interface.ask_claude_for_code(request, file_path)

if __name__ == "__main__":
    async def test_interface():
        interface = VSCodeSafeInterface()
        
        # 테스트 질문
        print("Testing VS Code Safe Interface...")
        
        response = await interface.ask_claude_about_task(
            "VS Code Explorer 패널을 안전하게 제어하는 방법",
            {"priority": "high", "safety": "critical"}
        )
        
        print(f"Response: {response}")
        
        # 상태 확인
        status = interface.get_communication_status()
        print(f"Status: {status}")
    
    asyncio.run(test_interface())