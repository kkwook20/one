#!/usr/bin/env python3
"""
Command Executor - 명령 실행기
안전한 명령 실행 with 강력한 보안 장치
"""

import asyncio
import subprocess
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import os
import json

from .safety_manager import SafetyManager

logger = logging.getLogger(__name__)

class CommandExecutor:
    """안전한 명령 실행기"""
    
    def __init__(self, safety_manager: SafetyManager):
        self.safety_manager = safety_manager
        self.execution_log = []
        self.blocked_commands = 0
        
        logger.info("Command Executor initialized")
    
    async def initialize(self):
        """초기화"""
        logger.info("Command Executor ready")
    
    def is_ready(self) -> bool:
        """준비 상태"""
        return True
    
    async def cleanup(self):
        """정리"""
        await self._save_execution_log()
    
    async def execute(self, command_data: Dict[str, Any]) -> Dict[str, Any]:
        """명령 실행"""
        try:
            # 안전성 검사
            command_str = str(command_data)
            is_safe, reason = self.safety_manager.is_operation_safe(command_str, "command_execution")
            
            if not is_safe:
                self.blocked_commands += 1
                result = {
                    "success": False,
                    "error": f"Command blocked: {reason}",
                    "command": command_data,
                    "blocked": True
                }
                await self._log_execution(command_data, result)
                return result
            
            # 시뮬레이션 모드
            if self.safety_manager.safety_level.value in ["READ_ONLY", "SIMULATION"]:
                result = {
                    "success": True,
                    "output": f"SIMULATED: {command_str}",
                    "simulated": True,
                    "command": command_data
                }
                await self._log_execution(command_data, result)
                return result
            
            # 실제 명령 실행
            result = await self._execute_command(command_data)
            await self._log_execution(command_data, result)
            
            return result
            
        except Exception as e:
            error_result = {
                "success": False,
                "error": str(e),
                "command": command_data
            }
            await self._log_execution(command_data, error_result)
            return error_result
    
    async def _execute_command(self, command_data: Dict[str, Any]) -> Dict[str, Any]:
        """실제 명령 실행"""
        try:
            cmd = command_data.get("command", "")
            cwd = command_data.get("cwd", os.getcwd())
            timeout = command_data.get("timeout", 30)
            
            # 명령 타입에 따른 처리
            if isinstance(cmd, str):
                # 단일 명령
                result = await self._run_shell_command(cmd, cwd, timeout)
            elif isinstance(cmd, list):
                # 명령 리스트
                result = await self._run_command_list(cmd, cwd, timeout)
            else:
                return {"success": False, "error": "Invalid command format"}
            
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _run_shell_command(self, cmd: str, cwd: str, timeout: int) -> Dict[str, Any]:
        """셸 명령 실행"""
        try:
            process = await asyncio.create_subprocess_shell(
                cmd,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                text=True
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
            
            return {
                "success": process.returncode == 0,
                "returncode": process.returncode,
                "stdout": stdout,
                "stderr": stderr,
                "command": cmd
            }
            
        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": "Command timeout",
                "command": cmd
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "command": cmd
            }
    
    async def _run_command_list(self, cmd_list: List[str], cwd: str, timeout: int) -> Dict[str, Any]:
        """명령 리스트 실행"""
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd_list,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                text=True
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
            
            return {
                "success": process.returncode == 0,
                "returncode": process.returncode,
                "stdout": stdout,
                "stderr": stderr,
                "command": cmd_list
            }
            
        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": "Command timeout",
                "command": cmd_list
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "command": cmd_list
            }
    
    async def _log_execution(self, command_data: Dict[str, Any], result: Dict[str, Any]):
        """실행 로그"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "command": command_data,
            "result": result,
            "safety_level": self.safety_manager.safety_level.value
        }
        
        self.execution_log.append(log_entry)
        
        # 로그가 너무 많아지면 정리
        if len(self.execution_log) > 1000:
            self.execution_log = self.execution_log[-500:]
    
    async def _save_execution_log(self):
        """실행 로그 저장"""
        try:
            log_file = Path("./claude_bridge/.logs/execution_log.json")
            log_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(log_file, 'w', encoding='utf-8') as f:
                json.dump(self.execution_log, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Execution log saved: {log_file}")
            
        except Exception as e:
            logger.error(f"Failed to save execution log: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """통계 조회"""
        return {
            "total_executions": len(self.execution_log),
            "blocked_commands": self.blocked_commands,
            "success_rate": len([log for log in self.execution_log if log["result"].get("success", False)]) / max(len(self.execution_log), 1) * 100,
            "safety_level": self.safety_manager.safety_level.value
        }

if __name__ == "__main__":
    async def test_executor():
        from .safety_manager import SafetyManager, SafetyLevel
        
        safety = SafetyManager(SafetyLevel.SIMULATION)
        executor = CommandExecutor(safety)
        await executor.initialize()
        
        # 안전한 명령 테스트
        result1 = await executor.execute({"command": "echo hello"})
        print(f"Echo test: {result1}")
        
        # 위험한 명령 테스트 (차단되어야 함)
        result2 = await executor.execute({"command": "rm -rf /"})
        print(f"Dangerous command: {result2}")
        
        # 통계 확인
        stats = executor.get_stats()
        print(f"Stats: {stats}")
    
    asyncio.run(test_executor())