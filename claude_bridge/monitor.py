#!/usr/bin/env python3
"""
System Monitor - 시스템 모니터링
리소스 사용량, 프로세스 상태, 서버 상태 모니터링
"""

import asyncio
import psutil
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import json
import subprocess
import sys

logger = logging.getLogger(__name__)

class SystemMonitor:
    """시스템 모니터"""
    
    def __init__(self):
        self.monitoring_data = []
        self.alerts = []
        self.thresholds = {
            "cpu_usage": 80.0,
            "memory_usage": 80.0,
            "disk_usage": 90.0,
            "network_latency": 1000  # ms
        }
        
        logger.info("System Monitor initialized")
    
    async def initialize(self):
        """초기화"""
        # 시스템 정보 수집
        await self._collect_system_info()
        logger.info("System Monitor ready")
    
    def is_ready(self) -> bool:
        """준비 상태"""
        return True
    
    async def cleanup(self):
        """정리"""
        await self._save_monitoring_data()
    
    async def get_system_status(self) -> Dict[str, Any]:
        """시스템 상태 조회"""
        try:
            # CPU 정보
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_count = psutil.cpu_count()
            cpu_freq = psutil.cpu_freq()
            
            # 메모리 정보
            memory = psutil.virtual_memory()
            swap = psutil.swap_memory()
            
            # 디스크 정보
            disk = psutil.disk_usage('/')
            
            # 네트워크 정보
            network = psutil.net_io_counters()
            
            # 프로세스 정보
            processes = len(psutil.pids())
            
            status = {
                "timestamp": datetime.now().isoformat(),
                "cpu": {
                    "usage_percent": cpu_percent,
                    "count": cpu_count,
                    "frequency": cpu_freq.current if cpu_freq else None
                },
                "memory": {
                    "total": memory.total,
                    "available": memory.available,
                    "used": memory.used,
                    "percent": memory.percent
                },
                "swap": {
                    "total": swap.total,
                    "used": swap.used,
                    "percent": swap.percent
                },
                "disk": {
                    "total": disk.total,
                    "used": disk.used,
                    "free": disk.free,
                    "percent": (disk.used / disk.total) * 100
                },
                "network": {
                    "bytes_sent": network.bytes_sent,
                    "bytes_recv": network.bytes_recv,
                    "packets_sent": network.packets_sent,
                    "packets_recv": network.packets_recv
                },
                "processes": {
                    "total": processes
                }
            }
            
            # 임계값 확인
            await self._check_thresholds(status)
            
            return status
            
        except Exception as e:
            logger.error(f"Failed to get system status: {e}")
            return {"error": str(e), "timestamp": datetime.now().isoformat()}
    
    async def _collect_system_info(self):
        """시스템 정보 수집"""
        try:
            info = {
                "platform": sys.platform,
                "python_version": sys.version,
                "cpu_count": psutil.cpu_count(),
                "memory_total": psutil.virtual_memory().total,
                "disk_total": psutil.disk_usage('/').total,
                "hostname": psutil.os.uname().nodename if hasattr(psutil.os, 'uname') else "unknown"
            }
            
            logger.info(f"System info collected: {info['platform']} with {info['cpu_count']} CPUs")
            
        except Exception as e:
            logger.error(f"Failed to collect system info: {e}")
    
    async def _check_thresholds(self, status: Dict[str, Any]):
        """임계값 확인 및 알림"""
        try:
            alerts_triggered = []
            
            # CPU 사용률 확인
            if status["cpu"]["usage_percent"] > self.thresholds["cpu_usage"]:
                alerts_triggered.append({
                    "type": "cpu_high",
                    "value": status["cpu"]["usage_percent"],
                    "threshold": self.thresholds["cpu_usage"],
                    "message": f"High CPU usage: {status['cpu']['usage_percent']:.1f}%"
                })
            
            # 메모리 사용률 확인
            if status["memory"]["percent"] > self.thresholds["memory_usage"]:
                alerts_triggered.append({
                    "type": "memory_high",
                    "value": status["memory"]["percent"],
                    "threshold": self.thresholds["memory_usage"],
                    "message": f"High memory usage: {status['memory']['percent']:.1f}%"
                })
            
            # 디스크 사용률 확인
            if status["disk"]["percent"] > self.thresholds["disk_usage"]:
                alerts_triggered.append({
                    "type": "disk_high",
                    "value": status["disk"]["percent"],
                    "threshold": self.thresholds["disk_usage"],
                    "message": f"High disk usage: {status['disk']['percent']:.1f}%"
                })
            
            # 알림 저장
            for alert in alerts_triggered:
                alert["timestamp"] = datetime.now().isoformat()
                self.alerts.append(alert)
                logger.warning(f"Alert: {alert['message']}")
            
        except Exception as e:
            logger.error(f"Failed to check thresholds: {e}")
    
    async def check_process_status(self, process_names: List[str]) -> Dict[str, Any]:
        """프로세스 상태 확인"""
        try:
            process_status = {}
            
            for proc in psutil.process_iter(['pid', 'name', 'status', 'cpu_percent', 'memory_percent']):
                try:
                    proc_info = proc.info
                    proc_name = proc_info['name']
                    
                    if proc_name in process_names:
                        process_status[proc_name] = {
                            "pid": proc_info['pid'],
                            "status": proc_info['status'],
                            "cpu_percent": proc_info['cpu_percent'],
                            "memory_percent": proc_info['memory_percent'],
                            "running": proc_info['status'] == psutil.STATUS_RUNNING
                        }
                        
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            return {
                "timestamp": datetime.now().isoformat(),
                "processes": process_status,
                "total_checked": len(process_names),
                "found": len(process_status)
            }
            
        except Exception as e:
            logger.error(f"Failed to check process status: {e}")
            return {"error": str(e)}
    
    async def check_server_status(self, servers: List[Dict[str, Any]]) -> Dict[str, Any]:
        """서버 상태 확인"""
        try:
            server_status = {}
            
            for server in servers:
                name = server.get("name", "unknown")
                host = server.get("host", "localhost")
                port = server.get("port", 80)
                
                try:
                    # 간단한 포트 체크
                    import socket
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(5)
                    result = sock.connect_ex((host, port))
                    sock.close()
                    
                    server_status[name] = {
                        "host": host,
                        "port": port,
                        "status": "online" if result == 0 else "offline",
                        "response_time": None  # 추후 구현
                    }
                    
                except Exception as e:
                    server_status[name] = {
                        "host": host,
                        "port": port,
                        "status": "error",
                        "error": str(e)
                    }
            
            return {
                "timestamp": datetime.now().isoformat(),
                "servers": server_status,
                "total_checked": len(servers)
            }
            
        except Exception as e:
            logger.error(f"Failed to check server status: {e}")
            return {"error": str(e)}
    
    async def get_network_info(self) -> Dict[str, Any]:
        """네트워크 정보 조회"""
        try:
            # 네트워크 인터페이스
            interfaces = psutil.net_if_addrs()
            
            # 네트워크 통계
            stats = psutil.net_io_counters(pernic=True)
            
            network_info = {
                "timestamp": datetime.now().isoformat(),
                "interfaces": {},
                "total_stats": psutil.net_io_counters()._asdict()
            }
            
            for interface, addresses in interfaces.items():
                network_info["interfaces"][interface] = {
                    "addresses": [addr._asdict() for addr in addresses],
                    "stats": stats.get(interface, {})._asdict() if stats.get(interface) else {}
                }
            
            return network_info
            
        except Exception as e:
            logger.error(f"Failed to get network info: {e}")
            return {"error": str(e)}
    
    async def get_detailed_report(self) -> Dict[str, Any]:
        """상세 보고서 생성"""
        try:
            report = {
                "timestamp": datetime.now().isoformat(),
                "system_status": await self.get_system_status(),
                "network_info": await self.get_network_info(),
                "recent_alerts": self.alerts[-10:] if self.alerts else [],
                "monitoring_summary": {
                    "total_monitoring_points": len(self.monitoring_data),
                    "total_alerts": len(self.alerts),
                    "thresholds": self.thresholds
                }
            }
            
            return report
            
        except Exception as e:
            logger.error(f"Failed to generate detailed report: {e}")
            return {"error": str(e)}
    
    async def _save_monitoring_data(self):
        """모니터링 데이터 저장"""
        try:
            log_file = Path("./claude_bridge/.logs/monitoring_log.json")
            log_file.parent.mkdir(parents=True, exist_ok=True)
            
            data = {
                "monitoring_data": self.monitoring_data[-1000:],  # 최근 1000개
                "alerts": self.alerts,
                "thresholds": self.thresholds,
                "saved_at": datetime.now().isoformat()
            }
            
            with open(log_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Monitoring data saved: {log_file}")
            
        except Exception as e:
            logger.error(f"Failed to save monitoring data: {e}")
    
    async def continuous_monitoring(self, interval: int = 60):
        """연속 모니터링"""
        logger.info(f"Starting continuous monitoring (interval: {interval}s)")
        
        while True:
            try:
                # 시스템 상태 수집
                status = await self.get_system_status()
                self.monitoring_data.append(status)
                
                # 데이터가 너무 많아지면 정리
                if len(self.monitoring_data) > 10000:
                    self.monitoring_data = self.monitoring_data[-5000:]
                
                await asyncio.sleep(interval)
                
            except KeyboardInterrupt:
                logger.info("Monitoring stopped by user")
                break
            except Exception as e:
                logger.error(f"Monitoring error: {e}")
                await asyncio.sleep(interval)
    
    def get_stats(self) -> Dict[str, Any]:
        """모니터링 통계"""
        return {
            "monitoring_points": len(self.monitoring_data),
            "total_alerts": len(self.alerts),
            "thresholds": self.thresholds,
            "recent_alerts": len([a for a in self.alerts if (datetime.now() - datetime.fromisoformat(a["timestamp"])).seconds < 3600])
        }

if __name__ == "__main__":
    async def test_monitor():
        monitor = SystemMonitor()
        await monitor.initialize()
        
        # 시스템 상태 확인
        status = await monitor.get_system_status()
        print(f"System status: {json.dumps(status, indent=2)}")
        
        # 프로세스 상태 확인
        processes = await monitor.check_process_status(["python", "code", "chrome"])
        print(f"Process status: {json.dumps(processes, indent=2)}")
        
        # 상세 보고서
        report = await monitor.get_detailed_report()
        print(f"Detailed report generated with {len(report)} sections")
        
        await monitor.cleanup()
    
    asyncio.run(test_monitor())