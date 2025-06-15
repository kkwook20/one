"""네트워크 LM Studio 디스커버리"""

import asyncio
import socket
import platform
from typing import List, Dict, Any, Optional
import httpx
import ipaddress
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class NetworkDevice:
    """네트워크 장치"""
    ip: str
    hostname: Optional[str] = None
    port: int = 1234
    is_lm_studio: bool = False
    os_type: Optional[str] = None
    response_time: float = 0.0

class NetworkDiscovery:
    """네트워크 디스커버리"""
    
    def __init__(self):
        self.discovered_devices: Dict[str, NetworkDevice] = {}
        self.scan_in_progress = False
        
    async def scan_network(
        self,
        subnet: Optional[str] = None,
        port: int = 1234,
        timeout: float = 1.0
    ) -> List[NetworkDevice]:
        """네트워크 스캔"""
        
        if self.scan_in_progress:
            logger.warning("Scan already in progress")
            return []
        
        self.scan_in_progress = True
        self.discovered_devices.clear()
        
        try:
            # 서브넷 자동 감지
            if not subnet:
                subnet = self._get_local_subnet()
            
            logger.info(f"Scanning subnet: {subnet}")
            
            # IP 범위 생성
            network = ipaddress.ip_network(subnet, strict=False)
            tasks = []
            
            # 각 IP에 대해 스캔 태스크 생성
            for ip in network.hosts():
                task = self._scan_host(str(ip), port, timeout)
                tasks.append(task)
            
            # 동시 실행 (최대 50개)
            chunk_size = 50
            for i in range(0, len(tasks), chunk_size):
                chunk = tasks[i:i + chunk_size]
                await asyncio.gather(*chunk, return_exceptions=True)
            
            # LM Studio 실행 중인 장치만 필터
            lm_studio_devices = [
                device for device in self.discovered_devices.values()
                if device.is_lm_studio
            ]
            
            logger.info(f"Found {len(lm_studio_devices)} LM Studio instances")
            return lm_studio_devices
            
        finally:
            self.scan_in_progress = False
    
    async def _scan_host(self, ip: str, port: int, timeout: float):
        """단일 호스트 스캔"""
        
        device = NetworkDevice(ip=ip, port=port)
        
        # 포트 오픈 체크
        if not await self._is_port_open(ip, port, timeout):
            return
        
        # LM Studio API 체크
        start_time = asyncio.get_event_loop().time()
        
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(f"http://{ip}:{port}/v1/models")
                
                if response.status_code == 200:
                    device.is_lm_studio = True
                    device.response_time = asyncio.get_event_loop().time() - start_time
                    
                    # 호스트명 가져오기
                    try:
                        device.hostname = socket.gethostbyaddr(ip)[0]
                    except:
                        device.hostname = ip
                    
                    self.discovered_devices[ip] = device
                    logger.info(f"Found LM Studio at {ip} ({device.hostname})")
                    
        except Exception as e:
            logger.debug(f"Failed to connect to {ip}:{port}: {e}")
    
    async def _is_port_open(self, host: str, port: int, timeout: float) -> bool:
        """포트 오픈 확인"""
        
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=timeout
            )
            writer.close()
            await writer.wait_closed()
            return True
        except:
            return False
    
    def _get_local_subnet(self) -> str:
        """로컬 서브넷 자동 감지"""
        
        try:
            # 로컬 IP 가져오기
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            
            # /24 서브넷 가정
            ip_parts = local_ip.split('.')
            subnet = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.0/24"
            
            return subnet
            
        except Exception as e:
            logger.error(f"Failed to get local subnet: {e}")
            return "192.168.1.0/24"  # 기본값
    
    async def monitor_devices(self, interval: int = 30):
        """장치 상태 모니터링"""
        
        while True:
            for device in list(self.discovered_devices.values()):
                # 연결 상태 체크
                if device.is_lm_studio:
                    try:
                        async with httpx.AsyncClient(timeout=2.0) as client:
                            response = await client.get(
                                f"http://{device.ip}:{device.port}/v1/models"
                            )
                            if response.status_code != 200:
                                device.is_lm_studio = False
                                logger.warning(f"Lost connection to {device.ip}")
                    except:
                        device.is_lm_studio = False
            
            await asyncio.sleep(interval)
    
    def get_active_devices(self) -> List[NetworkDevice]:
        """활성 장치 목록"""
        return [
            device for device in self.discovered_devices.values()
            if device.is_lm_studio
        ]

# 전역 인스턴스
network_discovery = NetworkDiscovery()