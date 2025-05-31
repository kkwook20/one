# backend/app/connectors/unreal_connector.py

import asyncio
import json
import requests
from typing import Dict, Any, Optional
import websocket
import threading

from app.config import settings
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class UnrealEngineConnector:
    """Unreal Engine 연동 커넥터"""
    
    def __init__(self):
        self.base_url = "http://localhost:30010"  # UE Web Remote Control
        self.ws_url = "ws://localhost:30020"     # WebSocket endpoint
        self.ws = None
        self.ws_thread = None
        
    def connect(self):
        """WebSocket 연결"""
        self.ws = websocket.WebSocketApp(
            self.ws_url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close
        )
        
        self.ws_thread = threading.Thread(target=self.ws.run_forever)
        self.ws_thread.daemon = True
        self.ws_thread.start()
    
    def _on_open(self, ws):
        logger.info("Connected to Unreal Engine")
    
    def _on_message(self, ws, message):
        logger.debug(f"UE message: {message}")
    
    def _on_error(self, ws, error):
        logger.error(f"UE WebSocket error: {error}")
    
    def _on_close(self, ws):
        logger.info("Disconnected from Unreal Engine")
    
    async def execute_python(self, python_code: str) -> Dict[str, Any]:
        """Python 스크립트 실행 (Unreal Python API)"""
        endpoint = f"{self.base_url}/remote/object/call"
        
        payload = {
            "objectPath": "/Script/PythonScriptPlugin.Default__PythonScriptLibrary",
            "functionName": "ExecutePythonCommand",
            "parameters": {
                "PythonCommand": python_code
            }
        }
        
        try:
            response = requests.post(endpoint, json=payload)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"UE Python execution error: {e}")
            return {"status": "error", "error": str(e)}
    
    async def create_actor(
        self,
        actor_class: str,
        location: tuple = (0, 0, 0),
        rotation: tuple = (0, 0, 0),
        scale: tuple = (1, 1, 1)
    ) -> Dict[str, Any]:
        """액터 생성"""
        python_code = f"""
import unreal

# 액터 생성
actor_class = unreal.EditorAssetLibrary.load_asset("{actor_class}")
if not actor_class:
    actor_class = unreal.Actor

# 스폰
actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
    actor_class,
    unreal.Vector({location[0]}, {location[1]}, {location[2]}),
    unreal.Rotator({rotation[0]}, {rotation[1]}, {rotation[2]})
)

# 스케일 설정
actor.set_actor_scale3d(unreal.Vector({scale[0]}, {scale[1]}, {scale[2]}))

# 결과 반환
result = {{
    "actor_name": actor.get_actor_label(),
    "location": [actor.get_actor_location().x, actor.get_actor_location().y, actor.get_actor_location().z]
}}
print(result)
"""
        
        return await self.execute_python(python_code)
    
    async def create_blueprint(
        self,
        blueprint_name: str,
        parent_class: str = "/Script/Engine.Actor",
        package_path: str = "/Game/Blueprints"
    ) -> Dict[str, Any]:
        """블루프린트 생성"""
        python_code = f"""
import unreal

# 블루프린트 팩토리
factory = unreal.BlueprintFactory()
factory.parent_class = unreal.load_class(None, "{parent_class}")

# 에셋 생성
asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
blueprint = asset_tools.create_asset(
    asset_name="{blueprint_name}",
    package_path="{package_path}",
    asset_class=unreal.Blueprint,
    factory=factory
)

print({{"blueprint_path": str(blueprint.get_path_name())}})
"""
        
        return await self.execute_python(python_code)
    
    async def create_material(
        self,
        material_name: str,
        base_color: tuple = (1, 1, 1),
        metallic: float = 0.0,
        roughness: float = 0.5
    ) -> Dict[str, Any]:
        """머티리얼 생성"""
        python_code = f"""
import unreal

# 머티리얼 생성
material_factory = unreal.MaterialFactoryNew()
asset_tools = unreal.AssetToolsHelpers.get_asset_tools()

material = asset_tools.create_asset(
    asset_name="{material_name}",
    package_path="/Game/Materials",
    asset_class=unreal.Material,
    factory=material_factory
)

# 머티리얼 에디터 열기
unreal.EditorAssetLibrary.open_editor_for_assets([material])

# 기본 파라미터 설정 (MaterialEditingLibrary 필요)
# material.set_vector_parameter_value("BaseColor", unreal.LinearColor({base_color[0]}, {base_color[1]}, {base_color[2]}, 1.0))
# material.set_scalar_parameter_value("Metallic", {metallic})
# material.set_scalar_parameter_value("Roughness", {roughness})

print({{"material_path": str(material.get_path_name())}})
"""
        
        return await self.execute_python(python_code)
    
    async def create_level_sequence(
        self,
        sequence_name: str,
        duration: float = 5.0,
        frame_rate: int = 30
    ) -> Dict[str, Any]:
        """레벨 시퀀스 생성"""
        python_code = f"""
import unreal

# 레벨 시퀀스 생성
sequence = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
    asset_name="{sequence_name}",
    package_path="/Game/Sequences",
    asset_class=unreal.LevelSequence,
    factory=unreal.LevelSequenceFactoryNew()
)

# 시퀀스 설정
sequence.set_display_rate(unreal.FrameRate({frame_rate}, 1))
sequence.set_playback_end_seconds({duration})

# 카메라 트랙 추가
camera_cut_track = sequence.add_master_track(unreal.MovieSceneCameraCutTrack)

print({{
    "sequence_path": str(sequence.get_path_name()),
    "duration": {duration},
    "frame_rate": {frame_rate}
}})
"""
        
        return await self.execute_python(python_code)
    
    async def build_lighting(self, quality: str = "Preview") -> Dict[str, Any]:
        """라이팅 빌드"""
        python_code = f"""
import unreal

# 라이팅 품질 설정
quality_map = {{
    "Preview": unreal.LightingBuildQuality.PREVIEW,
    "Medium": unreal.LightingBuildQuality.MEDIUM,
    "High": unreal.LightingBuildQuality.HIGH,
    "Production": unreal.LightingBuildQuality.PRODUCTION
}}

quality_enum = quality_map.get("{quality}", unreal.LightingBuildQuality.PREVIEW)

# 라이팅 빌드
unreal.EditorLevelLibrary.build_lighting(
    quality_enum,
    allow_async_build=True
)

print({{"status": "lighting_build_started", "quality": "{quality}"}})
"""
        
        return await self.execute_python(python_code)
    
    async def package_project(
        self,
        platform: str = "Windows",
        configuration: str = "Development",
        output_dir: str = "C:/PackagedGame"
    ) -> Dict[str, Any]:
        """프로젝트 패키징"""
        python_code = f"""
import unreal

# 패키징 설정
settings = unreal.ProjectPackagingSettings()
settings.build_configuration = unreal.BuildConfiguration.{configuration.upper()}
settings.staging_directory = unreal.DirectoryPath("{output_dir}")

# 플랫폼별 패키징 (실제로는 더 복잡한 설정 필요)
print({{
    "status": "packaging_configured",
    "platform": "{platform}",
    "configuration": "{configuration}",
    "output": "{output_dir}"
}})
"""
        
        return await self.execute_python(python_code)