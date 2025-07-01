@echo off
echo Starting Autonomous Claude System...
echo.
echo This system will:
echo - Control Windows environment
echo - Talk to Claude Code continuously
echo - Never give up on problems
echo - Save user questions to kanban board
echo.

cd /d F:\ONE_AI

:: Python 가상환경 활성화 (있다면)
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

:: 시스템 시작
python autonomous_claude_system.py

pause