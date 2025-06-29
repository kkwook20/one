# backend/routers/argosa/analysis/network_discovery.py
"""네트워크 LM Studio 디스커버리"""

import asyncio
import socket
import platform
import subprocess
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
        timeout: float = 0.5,
        full_scan: bool = True
    ) -> List[NetworkDevice]:
        """네트워크 스캔"""
        
        if self.scan_in_progress:
            logger.warning("Scan already in progress")
            return []
        
        self.scan_in_progress = True
        self.discovered_devices.clear()
        
        try:
            # 1. localhost는 별도로 처리하지 않음 (이미 LM Studio Manager에서 처리)
            
            # 2. 모든 네트워크 인터페이스에서 서브넷 수집
            all_subnets = set()
            
            if subnet:
                all_subnets.add(subnet)
            else:
                # 모든 인터페이스의 IP 주소 수집
                try:
                    interfaces = netifaces.interfaces()
                    for iface in interfaces:
                        try:
                            addrs = netifaces.ifaddresses(iface)
                            if netifaces.AF_INET in addrs:
                                for addr in addrs[netifaces.AF_INET]:
                                    ip = addr.get('addr')
                                    if ip and not ip.startswith('127.'):
                                        subnet_24 = self._get_subnet_24(ip)
                                        all_subnets.add(subnet_24)
                                        logger.info(f"Found interface {iface} with IP {ip}")
                        except Exception as e:
                            logger.debug(f"Error reading interface {iface}: {e}")
                except Exception as e:
                    logger.error(f"Error listing interfaces: {e}")
                
                # 폴백: 일반적인 서브넷 추가
                if not all_subnets:
                    all_subnets.update(["192.168.0.0/24", "192.168.1.0/24", "10.0.0.0/24"])
            
            # 3. 각 서브넷 스캔
            for subnet in all_subnets:
                logger.info(f"Scanning subnet: {subnet} (full_scan={full_scan})")
                await self._scan_subnet(subnet, port, timeout, full_scan)
            
            # LM Studio 실행 중인 장치만 필터 (localhost 제외)
            lm_studio_devices = [
                device for device in self.discovered_devices.values()
                if device.is_lm_studio and device.ip not in ["127.0.0.1", "localhost"]
            ]
            
            logger.info(f"Total scanned: {len(self.discovered_devices)}")
            logger.info(f"Found {len(lm_studio_devices)} LM Studio instances (excluding localhost)")
            
            return lm_studio_devices
            
        except Exception as e:
            logger.error(f"Network scan error: {e}")
            return []
        finally:
            self.scan_in_progress = False
    
    async def _scan_subnet(self, subnet: str, port: int, timeout: float, full_scan: bool = True):
        """서브넷 스캔"""
        try:
            network = ipaddress.ip_network(subnet, strict=False)
            
            if full_scan:
                # 전체 서브넷 스캔 (배치 처리)
                tasks = []
                batch_size = 20  # 동시에 20개씩 처리
                
                all_ips = [str(ip) for ip in network.hosts()]
                logger.info(f"Full scan of {len(all_ips)} IPs in {subnet}")
                
                for i in range(0, len(all_ips), batch_size):
                    batch = all_ips[i:i+batch_size]
                    batch_tasks = []
                    
                    for ip in batch:
                        # localhost IP는 스킵
                        if ip not in ["127.0.0.1", "::1"]:
                            batch_tasks.append(self._check_host(ip, port, timeout))
                    
                    if batch_tasks:
                        await asyncio.gather(*batch_tasks, return_exceptions=True)
                        await asyncio.sleep(0.1)  # 배치 간 짧은 대기
            else:
                # 우선순위 IP만 스캔 (빠른 스캔)
                priority_ips = self._get_priority_ips(subnet)
                tasks = []
                for ip in priority_ips:
                    # localhost IP는 스킵
                    if str(ip) not in ["127.0.0.1", "::1"]:
                        tasks.append(self._check_host(str(ip), port, timeout))
                
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)
                
        except Exception as e:
            logger.error(f"Subnet scan error for {subnet}: {e}")
    
    async def _check_host(self, host: str, port: int, timeout: float, hostname: Optional[str] = None):
        """LM Studio API 체크"""
        
        # localhost는 스킵
        if host in ["localhost", "127.0.0.1", "::1"]:
            return
        
        device = NetworkDevice(ip=host, port=port, hostname=hostname)
        url = f"http://{host}:{port}/v1/models"
        
        logger.debug(f"Checking {host}:{port}...")
        
        try:
            start_time = asyncio.get_event_loop().time()
            
            async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
                response = await client.get(url, follow_redirects=True)
                
                if response.status_code == 200:
                    device.is_lm_studio = True
                    device.response_time = asyncio.get_event_loop().time() - start_time
                    
                    # 호스트명 가져오기 (없는 경우)
                    if not device.hostname:
                        try:
                            device.hostname = socket.gethostbyaddr(host)[0]
                        except:
                            device.hostname = host
                    
                    self.discovered_devices[host] = device
                    logger.info(f"✓ Found LM Studio at {host} ({device.hostname}) - {device.response_time*1000:.0f}ms")
                else:
                    logger.debug(f"Non-200 response from {host}:{port} - Status: {response.status_code}")
                    
        except httpx.ConnectError as e:
            logger.debug(f"Connection refused: {host}:{port}")
        except httpx.TimeoutException:
            logger.debug(f"Timeout: {host}:{port}")
        except Exception as e:
            logger.warning(f"Error checking {host}:{port}: {type(e).__name__} - {str(e)}")
    
    def _get_active_ip(self) -> Optional[str]:
        """실제 사용 중인 IP 주소 가져오기"""
        try:
            # 모든 인터페이스 확인
            for iface in netifaces.interfaces():
                addrs = netifaces.ifaddresses(iface)
                if netifaces.AF_INET in addrs:
                    for addr in addrs[netifaces.AF_INET]:
                        ip = addr.get('addr')
                        if ip and not ip.startswith('127.') and not ip.startswith('169.254.'):
                            logger.info(f"Active IP found: {ip} on {iface}")
                            return ip
        except Exception as e:
            logger.error(f"Error getting active IP: {e}")
        
        # 대체 방법: 외부 연결 테스트
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            logger.info(f"Active IP via socket: {ip}")
            return ip
        except:
            return None
    
    def _get_subnet_24(self, ip: str) -> str:
        """IP에서 /24 서브넷 추출"""
        parts = ip.split('.')
        return f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
    
    def _get_priority_ips(self, subnet: str) -> List[str]:
        """자주 사용되는 IP 우선순위 목록"""
        try:
            network = ipaddress.ip_network(subnet, strict=False)
            base = str(network.network_address).rsplit('.', 1)[0]
            
            # 일반적인 데스크톱/서버 IP (localhost 제외)
            priority_suffixes = [1, 2, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 200, 254]
            return [f"{base}.{suffix}" for suffix in priority_suffixes]
        except:
            return []
    
    async def check_specific_host(self, host: str, port: int = 1234) -> Optional[NetworkDevice]:
        """특정 호스트 체크 (IP 또는 호스트명)"""
        # localhost는 None 반환
        if host in ["localhost", "127.0.0.1", "::1"]:
            return None
        
        # 호스트명인 경우 IP로 변환
        ip_address = host
        hostname = None
        
        # IP 주소가 아닌 경우 (호스트명인 경우)
        try:
            ipaddress.ip_address(host)
            # 유효한 IP 주소
        except ValueError:
            # 호스트명으로 간주하고 IP 조회
            try:
                ip_address = socket.gethostbyname(host)
                hostname = host
                logger.info(f"Resolved hostname '{host}' to IP: {ip_address}")
            except socket.gaierror as e:
                logger.error(f"Failed to resolve hostname '{host}': {e}")
                # Windows에서 NetBIOS 이름 시도
                if platform.system() == "Windows":
                    try:
                        # FQDN 시도
                        import socket
                        ip_address = socket.gethostbyname(f"{host}.local")
                        hostname = host
                        logger.info(f"Resolved via .local: '{host}' to IP: {ip_address}")
                    except:
                        logger.error(f"Also failed with .local suffix")
                        return None
                else:
                    return None
            
        await self._check_host(ip_address, port, 3.0, hostname)
        return self.discovered_devices.get(ip_address)
    
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
        """활성 장치 목록 (localhost 제외)"""
        return [
            device for device in self.discovered_devices.values()
            if device.is_lm_studio and device.ip not in ["127.0.0.1", "localhost"]
        ]
    
    async def scan_by_hostnames(self, hostnames: List[str], port: int = 1234) -> List[NetworkDevice]:
        """호스트명 리스트로 스캔"""
        found_devices = []
        
        tasks = []
        for hostname in hostnames:
            if hostname not in ["localhost", "127.0.0.1"]:
                tasks.append(self.check_specific_host(hostname, port))
        
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in results:
                if result and not isinstance(result, Exception):
                    found_devices.append(result)
                    
        logger.info(f"Found {len(found_devices)} LM Studio instances from {len(hostnames)} hostnames")
        return found_devices
    
    async def discover_network_hostnames(self) -> List[str]:
        """네트워크에서 호스트명 탐색 (Windows)"""
        hostnames = []
        
        if platform.system() == "Windows":
            try:
                # Windows net view 명령 사용
                import subprocess
                result = subprocess.run(["net", "view"], capture_output=True, text=True)
                if result.returncode == 0:
                    lines = result.stdout.split('\n')
                    for line in lines:
                        if line.startswith('\\\\'):
                            hostname = line.strip('\\').split()[0]
                            hostnames.append(hostname)
                            logger.debug(f"Found hostname: {hostname}")
            except Exception as e:
                logger.error(f"Failed to discover Windows hostnames: {e}")
        
        return hostnames

# 전역 인스턴스
network_discovery = NetworkDiscovery()