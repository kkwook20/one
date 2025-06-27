@echo off
cd /d "%~dp0"

:: Backend 스크립트 생성
echo cd /d "%cd%\backend" > "%TEMP%\start-backend.cmd"
echo echo [BACKEND SERVER - FastAPI] >> "%TEMP%\start-backend.cmd"
echo echo Port: 8000 >> "%TEMP%\start-backend.cmd"
echo echo. >> "%TEMP%\start-backend.cmd"
echo python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --no-access-log >> "%TEMP%\start-backend.cmd"

:: Frontend 스크립트 생성
echo cd /d "%cd%\frontend" > "%TEMP%\start-frontend.cmd"
echo echo [FRONTEND SERVER - React] >> "%TEMP%\start-frontend.cmd"
echo echo Port: 3000 >> "%TEMP%\start-frontend.cmd"
echo echo. >> "%TEMP%\start-frontend.cmd"
echo npm start >> "%TEMP%\start-frontend.cmd"

:: Windows Terminal 실행
start "" wt -w 0 nt -d "%cd%" cmd /k "%TEMP%\start-backend.cmd" `; split-pane -H -d "%cd%" cmd /k "%TEMP%\start-frontend.cmd"

echo Windows Terminal is starting...
timeout /t 3 >nul

:: 임시 파일 삭제
del "%TEMP%\start-backend.cmd" 2>nul
del "%TEMP%\start-frontend.cmd" 2>nul