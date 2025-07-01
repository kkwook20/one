@echo off
cd /d "%~dp0"

echo ========================================
echo ONE_AI Safe Mode (No Auto-Reload)
echo ========================================
echo.
echo This version runs without auto-reload for stability.
echo You need to manually restart when code changes.
echo.

:: Backend 스크립트 생성 (reload 없이)
echo cd /d "%cd%\backend" > "%TEMP%\start-backend-safe.cmd"
echo echo [BACKEND SERVER - FastAPI Safe Mode] >> "%TEMP%\start-backend-safe.cmd"
echo echo Port: 8000 (No auto-reload) >> "%TEMP%\start-backend-safe.cmd"
echo echo. >> "%TEMP%\start-backend-safe.cmd"
echo echo Cleaning up port 8000... >> "%TEMP%\start-backend-safe.cmd"
echo for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000') do taskkill /PID %%a /F 2^>nul >> "%TEMP%\start-backend-safe.cmd"
echo timeout /t 2 /nobreak ^> nul >> "%TEMP%\start-backend-safe.cmd"
echo python -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info >> "%TEMP%\start-backend-safe.cmd"

:: Frontend 스크립트 생성
echo cd /d "%cd%\frontend" > "%TEMP%\start-frontend-safe.cmd"
echo echo [FRONTEND SERVER - React] >> "%TEMP%\start-frontend-safe.cmd"
echo echo Port: 3000 >> "%TEMP%\start-frontend-safe.cmd"
echo echo. >> "%TEMP%\start-frontend-safe.cmd"
echo npm start >> "%TEMP%\start-frontend-safe.cmd"

:: Windows Terminal 실행
start "" wt -w 0 nt -d "%cd%" cmd /k "%TEMP%\start-backend-safe.cmd" `; split-pane -H -d "%cd%" cmd /k "%TEMP%\start-frontend-safe.cmd"

echo Windows Terminal is starting in SAFE MODE...
timeout /t 3 >nul

:: 임시 파일 삭제
del "%TEMP%\start-backend-safe.cmd" 2>nul
del "%TEMP%\start-frontend-safe.cmd" 2>nul