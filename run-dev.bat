@echo off
echo Starting Workflow Engine in development mode...

REM Create necessary directories
echo Creating directories...
if not exist "data\projects" mkdir data\projects
if not exist "data\references" mkdir data\references
if not exist "data\samples" mkdir data\samples
if not exist "data\cache" mkdir data\cache
if not exist "data\lora_datasets" mkdir data\lora_datasets
if not exist "data\models" mkdir data\models
if not exist "config\nodes" mkdir config\nodes
if not exist "config\workflows" mkdir config\workflows
if not exist "logs" mkdir logs

REM Create .gitkeep files
type nul > data\projects\.gitkeep 2>nul
type nul > data\references\.gitkeep 2>nul
type nul > data\samples\.gitkeep 2>nul
type nul > data\cache\.gitkeep 2>nul
type nul > data\lora_datasets\.gitkeep 2>nul
type nul > data\models\.gitkeep 2>nul
type nul > config\nodes\.gitkeep 2>nul
type nul > config\workflows\.gitkeep 2>nul
type nul > logs\.gitkeep 2>nul

REM Check if we're in the project root
if not exist "backend\requirements.txt" (
    echo Error: Please run this script from the project root directory
    pause
    exit /b 1
)

REM Check Python virtual environment
if not exist "backend\venv" (
    echo Creating Python virtual environment...
    cd backend
    python -m venv venv
    if errorlevel 1 (
        echo Error creating virtual environment
        pause
        exit /b 1
    )
    call venv\Scripts\activate
    python -m pip install --upgrade pip
    pip install -r requirements.txt
    cd ..
)

REM Check frontend dependencies
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

REM Start backend in new window
echo Starting backend server...
cd backend
start "Backend Server - Workflow Engine" cmd /k "venv\Scripts\activate && echo Backend server starting on http://localhost:8000 && python main.py"
cd ..

REM Wait for backend to start
echo Waiting for backend to start...
timeout /t 5 /nobreak > nul

REM Start frontend in new window
echo Starting frontend development server...
cd frontend
start "Frontend Server - Workflow Engine" cmd /k "echo Frontend server starting on http://localhost:5173 && npm run dev"
cd ..
start http://localhost:5173/
echo.
echo ====================================
echo   Workflow Engine is starting!
echo ====================================
echo.
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo.
echo   Two new windows should open:
echo   - Backend Server
echo   - Frontend Server
echo.
echo   If the servers don't start automatically,
echo   please run them manually in separate terminals:
echo.
echo   Backend:
echo     cd backend
echo     venv\Scripts\activate
echo     python main.py
echo.
echo   Frontend:
echo     cd frontend
echo     npm run dev
echo.
echo ====================================
echo.



pause