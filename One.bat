@echo off
echo Starting AI Pipeline System...
echo.
echo Starting Backend Server...
start "Backend Server" cmd /k "cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo.
echo Waiting for backend to initialize...
timeout /t 3 /nobreak > nul
echo.
echo Starting Frontend Server...
start "Frontend Server" cmd /k "cd frontend && npm start"
echo.
echo Both servers are starting...
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
echo.
pause