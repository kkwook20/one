# backend/app/config.py

from pydantic_settings import BaseSettings
from pathlib import Path
from typing import Optional

class Settings(BaseSettings):
    """애플리케이션 설정"""
    
    # 기본 설정
    APP_NAME: str = "Workflow Engine"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # 경로 설정
    BASE_DIR: Path = Path(__file__).parent.parent
    WORKSPACE_PATH: str = str(BASE_DIR.parent / "workspace")
    WORKFLOWS_PATH: str = str(BASE_DIR.parent / "workspace" / "workflows")
    DATA_PATH: str = str(BASE_DIR.parent / "workspace" / "data")
    SCRIPTS_PATH: str = str(BASE_DIR.parent / "workspace" / "scripts")
    
    # 데이터베이스 (SQLite)
    DATABASE_URL: str = f"sqlite:///{BASE_DIR}/workflow.db"
    
    # 실행 제한
    MAX_EXECUTION_TIME: int = 300  # 5분
    MAX_MEMORY_MB: int = 512
    MAX_OUTPUT_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # WebSocket 설정
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_MESSAGE_QUEUE_SIZE: int = 1000
    
    # 보안 설정
    ALLOWED_IMPORTS: list = [
        "math", "random", "datetime", "json", "re",
        "pandas", "numpy", "requests", "beautifulsoup4"
    ]
    
    # 로깅
    LOG_LEVEL: str = "INFO"
    LOG_FILE: Optional[str] = "workflow.log"
    
    class Config:
        env_file = ".env"

settings = Settings()

# 디렉토리 생성
for path in [settings.WORKSPACE_PATH, settings.WORKFLOWS_PATH, 
             settings.DATA_PATH, settings.SCRIPTS_PATH]:
    Path(path).mkdir(parents=True, exist_ok=True)
