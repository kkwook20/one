# backend/app/connectors/houdini_connector.py

import asyncio
import json
from pathlib import Path
from typing import Dict, Any, Optional
import tempfile

from app.config import settings
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class HoudiniConnector:
    """SideFX Houdini 연동 커넥터"""
    
    def __init__(self):
        self.houdini_path = settings.HOUDINI_PATH or self._find_houdini()
        self.hython = Path(self.houdini_path) / "bin" / "hython"
        
    def _find_houdini(self) -> str:
        """Houdini 설치 경로 자동 탐색"""
        common_paths = [
            "/opt/hfs19.5",
            "C:/Program Files/Side Effects Software/Houdini 19.5",
            "/Applications/Houdini/Houdini19.5"
        ]
        
        for path in common_paths:
            if Path(path).exists():
                return path
        
        raise ValueError("Houdini installation not found")
    
    async def execute_python(self, python_script: str) -> Dict[str, Any]:
        """Python 스크립트 실행"""
        wrapper = f"""
import hou
import json

try:
    # 사용자 스크립트
    {python_script}
    
    # 씬 정보 수집
    result = {{
        "status": "success",
        "scene_info": {{
            "nodes": [n.path() for n in hou.node("/obj").children()],
            "frame_range": [hou.playbar.frameRange()[0], hou.playbar.frameRange()[1]]
        }}
    }}
except Exception as e:
    result = {{
        "status": "error",
        "error": str(e)
    }}

print(json.dumps(result))
"""
        
        with tempfile.NamedTemporaryFile(suffix=".py", delete=False) as f:
            f.write(wrapper.encode())
            script_path = f.name
        
        try:
            result = await self._run_houdini_script(script_path)
            return result
        finally:
            Path(script_path).unlink()
    
    async def _run_houdini_script(self, script_path: str) -> Dict[str, Any]:
        """Houdini 스크립트 실행"""
        cmd = [str(self.hython), script_path]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "HOUDINI_NO_ENV_FILE": "1"}
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            return {
                "status": "error",
                "error": stderr.decode(),
                "stdout": stdout.decode()
            }
        
        try:
            output = stdout.decode().strip()
            lines = output.split('\n')
            for line in reversed(lines):
                if line.strip().startswith('{'):
                    return json.loads(line)
            
            return {
                "status": "success",
                "output": output
            }
        except:
            return {
                "status": "success",
                "output": stdout.decode()
            }
    
    async def create_geometry_node(
        self,
        name: str,
        parent: str = "/obj"
    ) -> Dict[str, Any]:
        """지오메트리 노드 생성"""
        script = f"""
# 지오메트리 노드 생성
geo = hou.node("{parent}").createNode("geo", "{name}")

# 기본 박스 생성
box = geo.createNode("box")
box.parm("size").set(2)

# 노드 레이아웃
geo.layoutChildren()

print(json.dumps({{
    "node": geo.path(),
    "children": [n.path() for n in geo.children()]
}}))
"""
        
        return await self.execute_python(script)
    
    async def create_vex_node(
        self,
        parent_path: str,
        vex_code: str,
        name: str = "vex_node"
    ) -> Dict[str, Any]:
        """VEX 노드 생성"""
        script = f'''
# VEX 노드 생성
parent = hou.node("{parent_path}")
vex_node = parent.createNode("attribwrangle", "{name}")

# VEX 코드 설정
vex_node.parm("snippet").set("""{vex_code}""")

print(json.dumps({{
    "node": vex_node.path(),
    "parameters": {{p.name(): p.eval() for p in vex_node.parms()}}
}}))
'''
        
        return await self.execute_python(script)
    
    async def simulate(
        self,
        node_path: str,
        start_frame: int = 1,
        end_frame: int = 100
    ) -> Dict[str, Any]:
        """시뮬레이션 실행"""
        script = f"""
# 시뮬레이션 노드 가져오기
sim_node = hou.node("{node_path}")

# 프레임 범위 설정
hou.playbar.setFrameRange({start_frame}, {end_frame})
hou.setFrame({start_frame})

# 시뮬레이션 실행
for frame in range({start_frame}, {end_frame} + 1):
    hou.setFrame(frame)
    # 쿡 강제 실행
    sim_node.cook(force=True)
    
    if frame % 10 == 0:
        print(f"Frame {{frame}} completed")

print(json.dumps({{
    "status": "success",
    "simulated_frames": {end_frame - start_frame + 1}
}}))
"""
        
        return await self.execute_python(script)
    
    async def export_geometry(
        self,
        node_path: str,
        output_path: str,
        format: str = "bgeo"
    ) -> Dict[str, Any]:
        """지오메트리 내보내기"""
        script = f"""
# 노드 가져오기
node = hou.node("{node_path}")

# 파일 내보내기
if "{format}" == "bgeo":
    node.geometry().saveToFile("{output_path}")
elif "{format}" == "obj":
    hou.node("/out").createNode("geometry").parm("soppath").set("{node_path}")
    hou.node("/out/geometry1").parm("sopoutput").set("{output_path}")
    hou.node("/out/geometry1").render()
else:
    raise ValueError(f"Unsupported format: {format}")

print(json.dumps({{
    "status": "success",
    "output": "{output_path}",
    "format": "{format}",
    "point_count": len(node.geometry().points()),
    "prim_count": len(node.geometry().prims())
}}))
"""
        
        return await self.execute_python(script)