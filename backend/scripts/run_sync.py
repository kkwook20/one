#!/usr/bin/env python3
# backend/scripts/run_sync.py

import json
import requests
import sys
import os
from datetime import datetime
import traceback
import logging

# Setup logging
def setup_logging():
    """Setup logging configuration"""
    log_dir = "./data/argosa/llm-conversations"
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = os.path.join(log_dir, "schedule.log")
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] %(levelname)s: %(message)s',
        handlers=[
            logging.FileHandler(log_file, mode='a'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    return logging.getLogger(__name__)

def run_scheduled_sync():
    """스케줄된 sync 실행"""
    logger = setup_logging()
    
    try:
        # 스케줄 설정 읽기
        schedule_path = "./data/argosa/llm-conversations/schedule.json"
        
        if not os.path.exists(schedule_path):
            logger.warning("No schedule configuration found")
            return
        
        with open(schedule_path, 'r') as f:
            schedule = json.load(f)
        
        if not schedule.get('enabled'):
            logger.info("Scheduled sync is disabled")
            return
        
        logger.info("Starting scheduled sync...")
        logger.info(f"Platforms to sync: {schedule.get('platforms', [])}")
        
        # Backend API로 sync 요청 - 새로운 엔드포인트 사용
        api_url = "http://localhost:8000/api/argosa/llm/sync/trigger-scheduled"
        
        try:
            # Backend 상태 체크 먼저
            health_check = requests.get("http://localhost:8000/api/argosa/status", timeout=10)
            if not health_check.ok:
                logger.error(f"Backend health check failed: {health_check.status_code}")
                sys.exit(1)
                
        except requests.exceptions.ConnectionError:
            logger.error("Cannot connect to backend - is it running?")
            logger.error("Please start the backend with: python main.py")
            sys.exit(1)
        except requests.exceptions.Timeout:
            logger.error("Backend health check timed out")
            sys.exit(1)
        
        try:
            response = requests.post(api_url, timeout=300)  # 5분 timeout
            
            if response.ok:
                result = response.json()
                if result.get('success'):
                    logger.info(f"Sync started successfully: {result.get('sync_id')}")
                    logger.info(f"Message: {result.get('message')}")
                else:
                    logger.error(f"Sync failed: {result.get('error')}")
                    
                    # 특정 실패 이유 처리
                    if result.get('reason') == 'session_expired':
                        logger.warning("Session expired - manual login required")
                        logger.warning(f"Invalid sessions: {result.get('invalidSessions', [])}")
                        
                        # 실패 상태 저장
                        failure_path = "./data/argosa/llm-conversations/schedule-failure.json"
                        with open(failure_path, 'w') as f:
                            json.dump({
                                "reason": "session_expired",
                                "timestamp": datetime.now().isoformat(),
                                "details": {
                                    "invalid_sessions": result.get('invalidSessions', []),
                                    "message": f"Invalid sessions for: {', '.join(result.get('invalidSessions', []))}"
                                }
                            }, f, indent=2)
                            
                    elif result.get('reason') == 'smart_scheduling':
                        logger.info("Data already up to date - skipping sync")
                        
                        # 스마트 스케줄링 이유 저장
                        failure_path = "./data/argosa/llm-conversations/schedule-failure.json"
                        with open(failure_path, 'w') as f:
                            json.dump({
                                "reason": "smart_scheduling",
                                "timestamp": datetime.now().isoformat(),
                                "details": {
                                    "message": "No platforms need syncing today (data already up to date)"
                                }
                            }, f, indent=2)
                    else:
                        logger.error(f"Unknown failure reason: {result}")
            else:
                logger.error(f"Failed to start sync: HTTP {response.status_code}")
                logger.error(f"Response: {response.text}")
                
        except requests.exceptions.Timeout:
            logger.error("Sync request timed out after 5 minutes")
            sys.exit(1)
        except requests.exceptions.ConnectionError:
            logger.error("Cannot connect to backend - is it running?")
            logger.error("Please ensure backend is running on http://localhost:8000")
            sys.exit(1)
        except Exception as e:
            logger.error(f"Unexpected error during sync request: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"Error in scheduled sync: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        
        # 에러 상태 저장
        try:
            failure_path = "./data/argosa/llm-conversations/schedule-failure.json"
            os.makedirs(os.path.dirname(failure_path), exist_ok=True)
            with open(failure_path, 'w') as f:
                json.dump({
                    "reason": "exception",
                    "timestamp": datetime.now().isoformat(),
                    "details": {
                        "error": str(e),
                        "message": "Unexpected error during scheduled sync"
                    }
                }, f, indent=2)
        except:
            pass
            
        sys.exit(1)

def check_requirements():
    """Check if all requirements are met"""
    logger = setup_logging()
    
    # Check if data directory exists
    data_dir = "./data/argosa/llm-conversations"
    if not os.path.exists(data_dir):
        logger.info(f"Creating data directory: {data_dir}")
        os.makedirs(data_dir, exist_ok=True)
    
    # Check if schedule.json exists
    schedule_path = os.path.join(data_dir, "schedule.json")
    if not os.path.exists(schedule_path):
        logger.warning("No schedule configuration found. Creating default...")
        default_schedule = {
            "enabled": False,
            "time": "09:00",
            "interval": "daily",
            "platforms": [],
            "settings": {},
            "updated_at": datetime.now().isoformat()
        }
        with open(schedule_path, 'w') as f:
            json.dump(default_schedule, f, indent=2)
    
    return True

if __name__ == "__main__":
    # Print startup info
    print(f"[{datetime.now()}] LLM Collector Scheduled Sync Script")
    print(f"[{datetime.now()}] Python: {sys.executable}")
    print(f"[{datetime.now()}] Working Directory: {os.getcwd()}")
    
    # Check requirements
    if not check_requirements():
        sys.exit(1)
    
    # Run the sync
    run_scheduled_sync()
    
    print(f"[{datetime.now()}] Scheduled sync script completed")