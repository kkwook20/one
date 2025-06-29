#!/bin/bash

echo "=== Backend State Change Monitor ==="
echo "Monitoring for state changes..."
echo ""

# 로그 파일 경로
LOG_FILE="backend/logs/backend_detailed.log"

# 로그 파일이 없으면 생성
mkdir -p backend/logs
touch "$LOG_FILE" 2>/dev/null || true

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# 실시간 모니터링
tail -f "$LOG_FILE" 2>/dev/null | while read line; do
    # State updated 로그
    if [[ $line == *"State updated:"* ]]; then
        echo -e "${RED}[STATE CHANGE]${NC} $line"
    # Broadcasting 로그
    elif [[ $line == *"BROADCASTING STATE:"* ]]; then
        echo -e "${YELLOW}[BROADCAST]${NC} $line"
    # Extension INIT 로그
    elif [[ $line == *"Extension INIT received"* ]]; then
        echo -e "${PURPLE}[INIT]${NC} $line"
    # Native Host 연결 로그
    elif [[ $line == *"Extension acknowledged initialization"* ]]; then
        echo -e "${GREEN}[INIT ACK]${NC} $line"
    # WebSocket 연결
    elif [[ $line == *"WebSocket client connected"* ]]; then
        echo -e "${BLUE}[WS CONNECT]${NC} $line"
    # 에러
    elif [[ $line == *"ERROR"* ]] || [[ $line == *"error"* ]]; then
        echo -e "${RED}[ERROR]${NC} $line"
    fi
done