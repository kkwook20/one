# backend/routers/argosa/analysis/network_discovery.py
"""네트워크 LM Studio 디스커버리"""

import asyncio
import socket
import platform
from typing import List, Dict, Any, Optional
import httpx
import ipaddress
import logging
from dataclasses import dataclass
import netifaces

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
        timeout: float = 1.5
    ) -> List[NetworkDevice]:
        """네트워크 스캔"""
        
        if self.scan_in_progress:
            logger.warning("Scan already in progress")
            return []
        
        self.scan_in_progress = True
        self.discovered_devices.clear()
        
        try:
            # 1. 로컬호스트 우선 체크
            await self._check_host("127.0.0.1", port, timeout)
            
            # 2. 서브넷 결정
            if subnet:
                subnets = [subnet]
            else:
                active_ip = self._get_active_ip()
                if active_ip:
                    subnets = [self._get_subnet_24(active_ip)]
                else:
                    subnets = ["192.168.0.0/24", "192.168.1.0/24"]
            
            for subnet in subnets:
                logger.info(f"Scanning subnet: {subnet}")
                
                # 3. 우선순위 IP 먼저 스캔
                priority_ips = self._get_priority_ips(subnet)
                tasks = [self._check_host(ip, port, timeout) for ip in priority_ips]
                await asyncio.gather(*tasks, return_exceptions=True)
                
                # 4. 나머지 IP 스캔
                network = ipaddress.ip_network(subnet, strict=False)
                active_ip = self._get_active_ip()
                remaining_ips = [str(ip) for ip in network.hosts() 
                               if str(ip) not in priority_ips and str(ip) != active_ip]
                
                # 10개씩 배치 처리
                for i in range(0, len(remaining_ips), 10):
                    batch = remaining_ips[i:i+10]
                    tasks = [self._check_host(ip, port, timeout) for ip in batch]
                    await asyncio.gather(*tasks, return_exceptions=True)
            
            # LM Studio 실행 중인 장치만 필터
            lm_studio_devices = [
                device for device in self.discovered_devices.values()
                if device.is_lm_studio
            ]
            
            logger.info(f"Found {len(lm_studio_devices)} LM Studio instances")
            return lm_studio_devices
            
        finally:
            self.scan_in_progress = False
    
    async def _check_host(self, host: str, port: int, timeout: float):
        """LM Studio API 체크"""
        
        device = NetworkDevice(ip=host, port=port)
        url = f"http://{host}:{port}/v1/models"
        
        try:
            start_time = asyncio.get_event_loop().time()
            
            async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
                response = await client.get(url)
                
                if response.status_code == 200:
                    device.is_lm_studio = True
                    device.response_time = asyncio.get_event_loop().time() - start_time
                    
                    # 호스트명 가져오기
                    try:
                        device.hostname = socket.gethostbyaddr(host)[0]
                    except:
                        device.hostname = host
                    
                    self.discovered_devices[host] = device
                    logger.info(f"✓ Found LM Studio at {host} ({device.hostname})")
                    
        except httpx.ConnectError:
            logger.debug(f"Connection refused: {host}:{port}")
        except httpx.TimeoutException:
            logger.debug(f"Timeout: {host}:{port}")
        except Exception as e:
            logger.debug(f"Error checking {host}:{port}: {type(e).__name__}")
    
    def _get_active_ip(self) -> Optional[str]:
        """실제 사용 중인 IP 주소 가져오기"""
        try:
            # 기본 게이트웨이가 있는 인터페이스 찾기
            gateways = netifaces.gateways()
            default_interface = gateways.get('default', {}).get(netifaces.AF_INET)
            
            if default_interface:
                interface_name = default_interface[1]
                addrs = netifaces.ifaddresses(interface_name)
                if netifaces.AF_INET in addrs:
                    return addrs[netifaces.AF_INET][0]['addr']
        except:
            pass
        
        # 대체 방법: 외부 연결 테스트
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return None
    
    def _get_subnet_24(self, ip: str) -> str:
        """IP에서 /24 서브넷 추출"""
        parts = ip.split('.')
        return f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
    
    def _get_priority_ips(self, subnet: str) -> List[str]:
        """자주 사용되는 IP 우선순위 목록"""
        network = ipaddress.ip_network(subnet, strict=False)
        base = str(network.network_address).rsplit('.', 1)[0]
        
        # 일반적인 데스크톱/서버 IP
        priority_suffixes = [1, 2, 100, 101, 102, 103, 104, 105, 110, 200]
        return [f"{base}.{suffix}" for suffix in priority_suffixes]
    
    async def monitor_devices(self, interval: int = 30):
        """장치 상태 모니터링"""
        
        while True:
            for device in list(self.discovered_devices.values()):
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