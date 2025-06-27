# backend/routers/argosa/analysis/lm_studio_manager.py
"""LM Studio 설정 및 관리 시스템"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum
import asyncio
import httpx
import logging
from datetime import datetime

from .configs import (
    NetworkInstanceConfig, 
    get_network_instances, 
    save_network_instance,
    remove_network_instance,
    update_instance_performance
)

logger = logging.getLogger(__name__)

class TaskType(Enum):
    """작업 타입별 최적 설정"""
    CREATIVE_WRITING = "creative_writing"
    CODE_GENERATION = "code_generation"
    ANALYSIS = "analysis"
    REASONING = "reasoning"
    TRANSLATION = "translation"
    SUMMARIZATION = "summarization"

@dataclass
class SamplingConfig:
    """샘플링 설정"""
    temperature: float = 0.7
    top_k: int = 40
    top_p: float = 0.95
    min_p: float = 0.05
    repeat_penalty: float = 1.1
    repeat_penalty_range: int = 256
    typical_p: float = 1.0
    tfs_z: float = 1.0
    mirostat_mode: int = 0
    mirostat_tau: float = 5.0
    mirostat_eta: float = 0.1

@dataclass
class ModelLoadConfig:
    """모델 로드 설정"""
    context_length: int = 4096
    gpu_layers: int = -1  # -1 for auto
    cpu_threads: int = 8
    eval_batch_size: int = 512
    use_mmap: bool = True
    use_mlock: bool = False
    offload_kqv: bool = True
    f16_kv: bool = True
    low_vram: bool = False
    main_gpu: int = 0
    tensor_split: Optional[List[float]] = None
    rope_freq_base: float = 10000
    rope_freq_scale: float = 1.0

@dataclass
class LMStudioInstance:
    """LM Studio 인스턴스"""
    id: str
    host: str
    port: int = 1234
    endpoint: str = field(init=False)
    is_local: bool = field(init=False)
    status: str = "unknown"
    available_models: List[str] = field(default_factory=list)
    current_model: Optional[str] = None
    capabilities: Dict[str, Any] = field(default_factory=dict)
    performance_score: float = 0.0
    enabled: bool = True  # 분산 실행 참여 여부
    is_registered: bool = False  # 등록 여부 (분산 실행에 등록된 인스턴스)
    priority: int = 1  # 우선순위
    tags: List[str] = field(default_factory=list)  # 태그
    max_concurrent_tasks: int = 5
    current_load: int = 0  # 현재 실행 중인 작업 수
    notes: str = ""  # 사용자 메모
    hostname: Optional[str] = None  # 호스트명
    
    def __post_init__(self):
        self.endpoint = f"http://{self.host}:{self.port}/v1"
        self.is_local = self.host in ["localhost", "127.0.0.1"]
        # localhost의 경우 ID 정규화
        if self.is_local:
            self.id = "localhost:1234"
            self.hostname = "localhost"

class LMStudioManager:
    """LM Studio 관리자"""
    
    # 작업별 최적 설정 프리셋
    TASK_PRESETS = {
        TaskType.CREATIVE_WRITING: SamplingConfig(
            temperature=1.2,
            top_k=50,
            top_p=0.95,
            repeat_penalty=1.15
        ),
        TaskType.CODE_GENERATION: SamplingConfig(
            temperature=0.3,
            top_k=20,
            top_p=0.9,
            repeat_penalty=1.0
        ),
        TaskType.ANALYSIS: SamplingConfig(
            temperature=0.5,
            top_k=30,
            top_p=0.9,
            repeat_penalty=1.05
        ),
        TaskType.REASONING: SamplingConfig(
            temperature=0.2,
            top_k=10,
            top_p=0.85,
            repeat_penalty=1.0
        ),
        TaskType.TRANSLATION: SamplingConfig(
            temperature=0.3,
            top_k=5,
            top_p=0.9,
            repeat_penalty=1.0
        ),
        TaskType.SUMMARIZATION: SamplingConfig(
            temperature=0.4,
            top_k=20,
            top_p=0.9,
            repeat_penalty=1.1
        )
    }
    
    # 모델별 최적 로드 설정
    MODEL_LOAD_PRESETS = {
        "small": ModelLoadConfig(  # 7B 이하
            context_length=2048,
            gpu_layers=24,
            eval_batch_size=256
        ),
        "medium": ModelLoadConfig(  # 13B-30B
            context_length=4096,
            gpu_layers=40,
            eval_batch_size=512
        ),
        "large": ModelLoadConfig(  # 70B+
            context_length=8192,
            gpu_layers=80,
            eval_batch_size=1024,
            low_vram=True
        )
    }
    
    def __init__(self):
        self.instances: Dict[str, LMStudioInstance] = {}
        self.http_client = httpx.AsyncClient(timeout=30.0)
        self.optimal_settings_cache = {}
        self._load_saved_instances()
        
    def _load_saved_instances(self):
        """저장된 인스턴스 로드"""
        saved_instances = get_network_instances()
        for inst_config in saved_instances:
            instance = LMStudioInstance(
                id=inst_config.id,
                host=inst_config.host,
                port=inst_config.port,
                enabled=inst_config.enabled,
                is_registered=getattr(inst_config, 'is_registered', False),  # 안전하게 로드
                priority=inst_config.priority,
                tags=inst_config.tags,
                max_concurrent_tasks=inst_config.max_concurrent_tasks,
                notes=getattr(inst_config, 'notes', ""),
                hostname=getattr(inst_config, 'hostname', inst_config.host)
            )
            self.instances[instance.id] = instance
            logger.info(f"Loaded saved instance: {instance.id} (registered: {instance.is_registered})")
    
    async def add_instance(self, host: str, port: int = 1234) -> LMStudioInstance:
        """LM Studio 인스턴스 추가"""
        instance_id = f"{host}:{port}"
        
        # localhost 정규화
        if host in ["localhost", "127.0.0.1"] and port == 1234:
            instance_id = "localhost:1234"
        
        # 이미 존재하는 경우
        if instance_id in self.instances:
            instance = self.instances[instance_id]
        else:
            instance = LMStudioInstance(
                id=instance_id,
                host=host,
                port=port,
                hostname=host
            )
        
        # 연결 테스트 및 정보 수집
        if await self.test_connection(instance):
            await self.get_instance_info(instance)
            self.instances[instance.id] = instance
            
            # 설정에 저장
            self._save_instance_config(instance)
            
            logger.info(f"Added and saved LM Studio instance: {instance.id}")
        
        return instance
    
    def _save_instance_config(self, instance: LMStudioInstance):
        """인스턴스 설정 저장"""
        # localhost의 경우 항상 정규화된 ID 사용
        if instance.is_local:
            instance.id = "localhost:1234"
            instance.host = "localhost"
        
        config = NetworkInstanceConfig({
            "id": instance.id,
            "host": instance.host,
            "hostname": instance.hostname or instance.host,
            "port": instance.port,
            "enabled": instance.enabled,
            "is_registered": instance.is_registered,
            "priority": instance.priority,
            "tags": instance.tags,
            "max_concurrent_tasks": instance.max_concurrent_tasks,
            "notes": instance.notes,
            "is_local": instance.is_local,
            "last_connected": datetime.now().isoformat()
        })
        save_network_instance(config)
        logger.info(f"Saved instance config: {instance.id} (registered: {instance.is_registered})")

    async def test_connection(self, instance: LMStudioInstance) -> bool:
        """연결 테스트"""
        try:
            response = await self.http_client.get(f"{instance.endpoint}/models")
            if response.status_code == 200:
                instance.status = "connected"
                return True
        except Exception as e:
            logger.error(f"Failed to connect to {instance.id}: {e}")
        
        instance.status = "disconnected"
        return False
    
    async def get_instance_info(self, instance: LMStudioInstance):
        """인스턴스 정보 수집"""
        try:
            # 모델 목록
            models_response = await self.http_client.get(f"{instance.endpoint}/models")
            if models_response.status_code == 200:
                data = models_response.json()
                instance.available_models = [m["id"] for m in data.get("data", [])]
            
            # 시스템 정보 (LM Studio가 지원한다면)
            try:
                info_response = await self.http_client.get(f"{instance.endpoint}/system/info")
                if info_response.status_code == 200:
                    instance.capabilities = info_response.json()
                    # GPU 정보, 메모리 등으로 성능 점수 계산
                    instance.performance_score = self._calculate_performance_score(
                        instance.capabilities
                    )
            except:
                # 기본 성능 점수
                instance.performance_score = 1.0 if instance.is_local else 0.8
                
        except Exception as e:
            logger.error(f"Failed to get info for {instance.id}: {e}")
    
    def _calculate_performance_score(self, capabilities: Dict[str, Any]) -> float:
        """성능 점수 계산"""
        score = 1.0
        
        # GPU 가중치
        if "gpu" in capabilities:
            gpu_memory = capabilities["gpu"].get("memory_gb", 0)
            score += min(gpu_memory / 24, 2.0)  # 24GB 기준
        
        # CPU 가중치
        if "cpu" in capabilities:
            cpu_cores = capabilities["cpu"].get("cores", 4)
            score += min(cpu_cores / 16, 0.5)  # 16코어 기준
        
        # 메모리 가중치
        if "memory" in capabilities:
            ram_gb = capabilities["memory"].get("total_gb", 16)
            score += min(ram_gb / 64, 0.5)  # 64GB 기준
        
        return score
    
    def set_instance_enabled(self, instance_id: str, enabled: bool) -> bool:
        """인스턴스 활성화/비활성화"""
        if instance_id in self.instances:
            self.instances[instance_id].enabled = enabled
            self._save_instance_config(self.instances[instance_id])
            logger.info(f"Instance {instance_id} enabled: {enabled}")
            return True
        return False
    
    def set_instance_registered(self, instance_id: str, registered: bool) -> bool:
        """인스턴스 등록 상태 변경"""
        logger.info(f"Setting instance {instance_id} registered: {registered}")
        
        # localhost 처리 - 다양한 형태의 ID 처리
        instance = None
        
        # 직접 ID로 찾기
        if instance_id in self.instances:
            instance = self.instances[instance_id]
        else:
            # localhost의 다양한 형태 확인
            localhost_ids = ["localhost:1234", "127.0.0.1:1234", "localhost", "127.0.0.1"]
            
            # ID가 localhost 형태인 경우
            if any(instance_id.startswith(lid) for lid in localhost_ids):
                # is_local이 True인 인스턴스 찾기
                for inst_id, inst in self.instances.items():
                    if inst.is_local:
                        instance = inst
                        instance_id = inst.id  # 정규화된 ID 사용
                        logger.info(f"Found localhost instance with normalized ID: {inst.id}")
                        break
            
            # 그래도 못 찾았으면 host로 찾기
            if not instance:
                for inst_id, inst in self.instances.items():
                    if (inst.host in ["localhost", "127.0.0.1"] and 
                        inst.port == 1234):
                        instance = inst
                        instance_id = inst.id
                        logger.info(f"Found instance by host/port: {inst.id}")
                        break
        
        if instance:
            instance.is_registered = registered
            instance.enabled = registered  # 등록하면 활성화도 함께
            self._save_instance_config(instance)
            logger.info(f"Instance {instance.id} registered: {registered}")
            return True
        
        logger.error(f"Instance not found: {instance_id}")
        logger.info(f"Available instances: {list(self.instances.keys())}")
        return False

    def update_instance_priority(self, instance_id: str, priority: int) -> bool:
        """인스턴스 우선순위 업데이트"""
        if instance_id in self.instances:
            self.instances[instance_id].priority = priority
            self._save_instance_config(self.instances[instance_id])
            return True
        return False
    
    def update_instance_tags(self, instance_id: str, tags: List[str]) -> bool:
        """인스턴스 태그 업데이트"""
        if instance_id in self.instances:
            self.instances[instance_id].tags = tags
            self._save_instance_config(self.instances[instance_id])
            return True
        return False
    
    def update_instance_settings(self, instance_id: str, settings: Dict[str, Any]) -> bool:
        """인스턴스 설정 업데이트"""
        if instance_id in self.instances:
            instance = self.instances[instance_id]
            
            # 업데이트 가능한 필드들
            if 'enabled' in settings:
                instance.enabled = settings['enabled']
            if 'priority' in settings:
                instance.priority = settings['priority']
            if 'tags' in settings:
                instance.tags = settings['tags']
            if 'max_concurrent_tasks' in settings:
                instance.max_concurrent_tasks = settings['max_concurrent_tasks']
            if 'notes' in settings:
                instance.notes = settings['notes']
            
            self._save_instance_config(instance)
            return True
        return False
    
    def get_enabled_instances(self) -> List[LMStudioInstance]:
        """활성화된 인스턴스만 반환"""
        return [
            inst for inst in self.instances.values()
            if inst.enabled and inst.status == "connected"
        ]
    
    def get_registered_instances(self) -> List[LMStudioInstance]:
        """등록된 인스턴스만 반환"""
        return [
            inst for inst in self.instances.values()
            if inst.is_registered
        ]
    
    def get_instances_by_tag(self, tag: str) -> List[LMStudioInstance]:
        """특정 태그를 가진 인스턴스 반환"""
        return [
            inst for inst in self.instances.values()
            if tag in inst.tags and inst.enabled and inst.status == "connected"
        ]
    
    async def get_optimal_settings(
        self,
        task_type: TaskType,
        model_name: str,
        agent_type: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """작업에 최적화된 설정 반환"""
        
        # AI가 컨텍스트 기반으로 설정 조정
        adjusted_settings = await self._ai_adjust_settings(
            task_type, model_name, agent_type, context
        )
        
        # 캐시 키
        cache_key = f"{task_type}_{model_name}_{agent_type}"
        
        if cache_key in self.optimal_settings_cache:
            cached = self.optimal_settings_cache[cache_key]
            # 캐시된 설정과 AI 조정값 병합
            return {**cached, **adjusted_settings}
        
        # 기본 프리셋
        sampling = self.TASK_PRESETS.get(task_type, SamplingConfig())
        
        # 모델 크기 추정
        model_size = self._estimate_model_size(model_name)
        load_config = self.MODEL_LOAD_PRESETS.get(model_size, ModelLoadConfig())
        
        # 에이전트별 추가 조정
        if agent_type == "code_generator":
            sampling.temperature = max(0.1, sampling.temperature - 0.2)
            sampling.repeat_penalty = 1.0  # 코드는 반복 허용
        elif agent_type == "creative_writer":
            sampling.temperature = min(1.5, sampling.temperature + 0.3)
            sampling.top_p = 0.98
        elif agent_type == "analyst":
            sampling.temperature = 0.3  # 분석은 일관성 중요
            sampling.top_k = 10
        
        settings = {
            "sampling": sampling.__dict__,
            "load_config": load_config.__dict__,
            **adjusted_settings
        }
        
        # 캐시 저장
        self.optimal_settings_cache[cache_key] = settings
        
        return settings
    
    async def _ai_adjust_settings(
        self,
        task_type: TaskType,
        model_name: str,
        agent_type: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """AI가 컨텍스트 기반으로 설정 미세 조정"""
        
        # 여기서는 규칙 기반으로 시뮬레이션
        adjustments = {}
        
        # 긴급도에 따른 조정
        if context.get("priority") == "critical":
            adjustments["max_tokens"] = 4000  # 더 긴 응답 허용
            adjustments["timeout"] = 120  # 타임아웃 연장
        
        # 정확도 요구사항
        if context.get("require_accuracy"):
            adjustments["sampling"] = {
                "temperature": 0.1,
                "top_k": 5,
                "repeat_penalty": 1.0
            }
        
        # 창의성 요구사항
        if context.get("require_creativity"):
            adjustments["sampling"] = {
                "temperature": 1.3,
                "top_k": 100,
                "top_p": 0.98
            }
        
        # 속도 우선
        if context.get("speed_priority"):
            adjustments["max_tokens"] = min(1000, context.get("max_tokens", 2000))
            adjustments["load_config"] = {
                "context_length": 2048  # 컨텍스트 제한
            }
        
        return adjustments
    
    def _estimate_model_size(self, model_name: str) -> str:
        """모델 이름에서 크기 추정"""
        model_lower = model_name.lower()
        
        if any(x in model_lower for x in ["70b", "65b", "72b"]):
            return "large"
        elif any(x in model_lower for x in ["30b", "33b", "34b", "13b", "20b"]):
            return "medium"
        else:
            return "small"
    
    async def select_best_instance(
        self,
        model_name: str,
        task_complexity: float = 0.5,
        required_tags: List[str] = None
    ) -> Optional[LMStudioInstance]:
        """작업에 가장 적합한 인스턴스 선택"""
        
        # 활성화된 인스턴스만 고려
        available_instances = [
            inst for inst in self.get_enabled_instances()
            if model_name in inst.available_models
        ]
        
        # 태그 필터링
        if required_tags:
            available_instances = [
                inst for inst in available_instances
                if any(tag in inst.tags for tag in required_tags)
            ]
        
        if not available_instances:
            return None
        
        # 점수 계산
        scored_instances = []
        for instance in available_instances:
            score = instance.performance_score * instance.priority
            
            # 현재 부하 고려
            load_factor = 1 - (instance.current_load / instance.max_concurrent_tasks)
            score *= load_factor
            
            # 복잡한 작업은 고성능 인스턴스 선호
            if task_complexity > 0.7:
                score *= 1.5
            
            # 로컬 인스턴스 가산점
            if instance.is_local:
                score *= 1.2
            
            scored_instances.append((score, instance))
        
        # 최고 점수 인스턴스 반환
        scored_instances.sort(key=lambda x: x[0], reverse=True)
        return scored_instances[0][1]
    
    async def execute_on_instance(
        self,
        instance: LMStudioInstance,
        prompt: str,
        settings: Dict[str, Any]
    ) -> Dict[str, Any]:
        """특정 인스턴스에서 실행"""
        
        # 부하 증가
        instance.current_load += 1
        
        # 모델 로드 확인
        if instance.current_model != settings.get("model"):
            await self.load_model_on_instance(
                instance,
                settings["model"],
                settings.get("load_config", {})
            )
        
        # 실행
        try:
            start_time = datetime.now()
            
            response = await self.http_client.post(
                f"{instance.endpoint}/chat/completions",
                json={
                    "model": settings["model"],
                    "messages": [{"role": "user", "content": prompt}],
                    **settings.get("sampling", {}),
                    "max_tokens": settings.get("max_tokens", 2000),
                    "stream": False
                }
            )
            
            if response.status_code == 200:
                # 성능 기록
                elapsed = (datetime.now() - start_time).total_seconds()
                update_instance_performance(instance.id, {
                    "response_time": elapsed,
                    "success": True,
                    "model": settings["model"],
                    "task_type": settings.get("task_type", "unknown")
                })
                
                return response.json()
            else:
                raise Exception(f"API error: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Execution failed on {instance.id}: {e}")
            
            # 실패 기록
            update_instance_performance(instance.id, {
                "response_time": None,
                "success": False,
                "error": str(e)
            })
            
            raise
        finally:
            # 부하 감소
            instance.current_load = max(0, instance.current_load - 1)
    
    async def load_model_on_instance(
        self,
        instance: LMStudioInstance,
        model_name: str,
        load_config: Dict[str, Any]
    ):
        """인스턴스에 모델 로드"""
        
        try:
            # LM Studio API가 모델 로드를 지원한다면
            response = await self.http_client.post(
                f"{instance.endpoint}/models/load",
                json={
                    "model": model_name,
                    **load_config
                }
            )
            
            if response.status_code == 200:
                instance.current_model = model_name
                logger.info(f"Loaded {model_name} on {instance.id}")
            
        except Exception as e:
            logger.error(f"Failed to load model on {instance.id}: {e}")
            # 실제로는 LM Studio가 자동으로 모델을 로드하므로
            # 이 부분은 선택적
            instance.current_model = model_name
    
    async def call_llm(
        self,
        prompt: str,
        model: Optional[str] = None,
        instance_id: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> Dict[str, Any]:
        """직접 LLM 호출 (단순화된 버전)"""
        
        # 인스턴스 선택
        if instance_id and instance_id in self.instances:
            instance = self.instances[instance_id]
        else:
            # 가장 좋은 인스턴스 선택
            instance = await self.select_best_instance(model or "default")
        
        if not instance or instance.status != "connected":
            raise Exception("No connected LM Studio instance available")
        
        # 모델 선택
        if not model:
            model = instance.current_model or instance.available_models[0]
        
        # 설정
        settings = {
            "model": model,
            "sampling": {
                "temperature": temperature
            },
            "max_tokens": max_tokens
        }
        
        # 실행
        return await self.execute_on_instance(instance, prompt, settings)

# 전역 인스턴스
lm_studio_manager = LMStudioManager()