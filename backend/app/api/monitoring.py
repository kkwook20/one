# backend/app/api/monitoring.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import Dict, Any, Optional
import asyncio

from app.services.monitoring import monitoring_service
from app.services.performance import performance_profiler, bottleneck_detector
from app.services.error_tracking import error_tracker

router = APIRouter()

@router.get("/dashboard")
async def get_dashboard_data():
    """대시보드 데이터 조회"""
    return monitoring_service.get_dashboard_data()

@router.get("/metrics/system")
async def get_system_metrics(duration: int = 60):
    """시스템 메트릭 조회"""
    return {
        'cpu': monitoring_service.system_metrics.get_history('cpu', duration),
        'memory': monitoring_service.system_metrics.get_history('memory', duration),
        'disk': monitoring_service.system_metrics.get_history('disk', duration),
        'network': monitoring_service.system_metrics.get_history('network', duration)
    }

@router.get("/metrics/workflows")
async def get_workflow_metrics():
    """워크플로우 메트릭 조회"""
    return monitoring_service.workflow_metrics.get_workflow_stats()

@router.get("/metrics/nodes")
async def get_node_metrics():
    """노드 메트릭 조회"""
    return monitoring_service.workflow_metrics.get_node_stats()

@router.get("/performance/stats")
async def get_performance_stats(category: str, time_window: Optional[int] = None):
    """성능 통계 조회"""
    return performance_profiler.get_statistics(category, time_window)

@router.get("/performance/bottlenecks")
async def get_bottlenecks():
    """병목 현상 분석"""
    return {
        'bottlenecks': bottleneck_detector.analyze_bottlenecks(),
        'suggestions': bottleneck_detector.get_optimization_suggestions()
    }

@router.get("/errors/summary")
async def get_error_summary(time_window: Optional[int] = None):
    """에러 요약"""
    return error_tracker.get_error_summary(time_window)

@router.get("/errors/{error_id}")
async def get_error_details(error_id: str):
    """에러 상세 정보"""
    details = error_tracker.get_error_details(error_id)
    if not details:
        raise HTTPException(status_code=404, detail="Error not found")
    return details

@router.get("/errors/pattern/{pattern_id}")
async def get_error_pattern(pattern_id: str):
    """에러 패턴 정보"""
    pattern = error_tracker.get_pattern_details(pattern_id)
    if not pattern:
        raise HTTPException(status_code=404, detail="Pattern not found")
    return pattern

@router.websocket("/stream")
async def monitoring_stream(websocket: WebSocket):
    """실시간 모니터링 스트림"""
    await websocket.accept()
    
    # 메트릭 스트림 구독
    queue = await monitoring_service.subscribe('all')
    
    try:
        while True:
            # 큐에서 데이터 가져오기
            data = await queue.get()
            await websocket.send_json(data)
            
    except WebSocketDisconnect:
        await monitoring_service.unsubscribe(queue, 'all')
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await monitoring_service.unsubscribe(queue, 'all')

@router.post("/alerts/test")
async def test_alert(level: str = "warning"):
    """알림 테스트"""
    # 테스트 에러 생성
    try:
        raise Exception("Test error for monitoring")
    except Exception as e:
        error_id = error_tracker.track_error(
            e,
            {'test': True, 'source': 'monitoring_test'},
            level
        )
        
    return {
        'status': 'alert_triggered',
        'errorId': error_id
    }