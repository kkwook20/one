# Backend Configuration
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
DEBUG=False

# Frontend Configuration
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000

# Database (optional)
DATABASE_URL=sqlite:///./workflow.db

# Redis (optional)
REDIS_URL=redis://localhost:6379/0

# File Storage
MAX_UPLOAD_SIZE=104857600  # 100MB
STORAGE_PATH=./data
MAX_STORAGE_SIZE=10995116277760  # 10TB

# Security
SECRET_KEY=your-secret-key-here
API_KEY=your-api-key-here

# AI Models
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
HF_TOKEN=your-huggingface-token

# Local LLM (optional)
OLLAMA_HOST=http://localhost:11434
LOCAL_MODEL_PATH=./data/models

# External Applications
MAYA_PATH=/usr/autodesk/maya2024/bin
HOUDINI_PATH=/opt/hfs19.5
UNREAL_ENGINE_PATH=/opt/UnrealEngine

# Logging
LOG_LEVEL=INFO
LOG_FILE=./logs/workflow.log

# Performance
MAX_WORKERS=5
TASK_TIMEOUT=300
MAX_MEMORY_PER_TASK=1073741824  # 1GB

# Development
HOT_RELOAD=True
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Limits
MAX_EXECUTION_TIME=300
MAX_MEMORY_MB=1024

