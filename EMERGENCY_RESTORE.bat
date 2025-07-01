@echo off
echo ====================================
echo EMERGENCY FILE RESTORATION
echo ====================================
echo.
echo Restoring all deleted files from Git...
echo.

cd /d F:\ONE_AI

:: 모든 삭제된 파일 복구
git checkout -- .

echo.
echo Files restored!
echo.
echo Checking status...
git status

echo.
echo ====================================
echo RESTORATION COMPLETE
echo ====================================
echo.
echo IMPORTANT: The autonomous_claude_system.py is DANGEROUS!
echo It deleted your files. DO NOT RUN IT AGAIN.
echo.
echo Use safe_autonomous_system.py instead.
echo ====================================
pause