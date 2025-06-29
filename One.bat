@echo off
@echo off
set PORT=8000

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT%') do (
    echo Killing PID %%a on port %PORT%
    taskkill /F /PID %%a
)
@echo off
set PORT=3000

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT%') do (
    echo Killing PID %%a on port %PORT%
    taskkill /F /PID %%a
)


cd /d "%~dp0"

:: Backend 스크립트 생성 (nodemon 사용)
echo cd /d "%cd%\backend" > "%TEMP%\start-backend.cmd"
echo echo [BACKEND SERVER - FastAPI with Nodemon] >> "%TEMP%\start-backend.cmd"
echo echo Port: 8000 >> "%TEMP%\start-backend.cmd"
echo echo Watching: Python files in routers/ and main.py >> "%TEMP%\start-backend.cmd"
echo echo. >> "%TEMP%\start-backend.cmd"
echo nodemon >> "%TEMP%\start-backend.cmd"

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