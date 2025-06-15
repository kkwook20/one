"""LM Studio 설정 및 관리 시스템"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum
import asyncio
import httpx
import logging

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
    
    def __post_init__(self):
        self.endpoint = f"http://{self.host}:{self.port}/v1"
        self.is_local = self.host in ["localhost", "127.0.0.1"]

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
        
    async def add_instance(self, host: str, port: int = 1234) -> LMStudioInstance:
        """LM Studio 인스턴스 추가"""
        instance = LMStudioInstance(
            id=f"{host}:{port}",
            host=host,
            port=port
        )
        
        # 연결 테스트 및 정보 수집
        if await self.test_connection(instance):
            await self.get_instance_info(instance)
            self.instances[instance.id] = instance
            logger.info(f"Added LM Studio instance: {instance.id}")
        
        return instance
    
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
        task_complexity: float = 0.5
    ) -> Optional[LMStudioInstance]:
        """작업에 가장 적합한 인스턴스 선택"""
        
        available_instances = [
            inst for inst in self.instances.values()
            if inst.status == "connected" and model_name in inst.available_models
        ]
        
        if not available_instances:
            return None
        
        # 점수 계산
        scored_instances = []
        for instance in available_instances:
            score = instance.performance_score
            
            # 복잡한 작업은 고성능 인스턴스 선호
            if task_complexity > 0.7:
                score *= 1.5
            
            # 로컬 인스턴스 가산점
            if instance.is_local:
                score *= 1.2
            
            # 현재 부하 고려 (구현 필요)
            # load = await self.get_instance_load(instance)
            # score *= (1 - load)
            
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
        
        # 모델 로드 확인
        if instance.current_model != settings.get("model"):
            await self.load_model_on_instance(
                instance,
                settings["model"],
                settings.get("load_config", {})
            )
        
        # 실행
        try:
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
                return response.json()
            else:
                raise Exception(f"API error: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Execution failed on {instance.id}: {e}")
            raise
    
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

# 전역 인스턴스
lm_studio_manager = LMStudioManager()