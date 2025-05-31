# backend/app/storage/node_storage.py

import os
import json
import shutil
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
import aiofiles
from app.models.node import VersionHistory
from app.config import settings

class NodeStorageManager:
    """노드별 파일 저장 관리"""
    
    def __init__(self):
        self.base_path = Path(settings.WORKSPACE_PATH) / "node-storage"
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.max_versions = 5  # 최대 히스토리 개수
        
    def get_node_path(self, node_id: str) -> Path:
        """노드 저장 경로 반환"""
        return self.base_path / node_id
        
    async def setup_node_directory(self, node_id: str):
        """노드 디렉토리 구조 생성"""
        node_path = self.get_node_path(node_id)
        
        # 디렉토리 구조 생성
        (node_path / "code").mkdir(parents=True, exist_ok=True)
        (node_path / "code" / "history").mkdir(parents=True, exist_ok=True)
        (node_path / "data").mkdir(parents=True, exist_ok=True)
        (node_path / "files").mkdir(parents=True, exist_ok=True)
        
        # 메타데이터 파일 초기화
        metadata_path = node_path / "metadata.json"
        if not metadata_path.exists():
            metadata = {
                "node_id": node_id,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "version": 1
            }
            async with aiofiles.open(metadata_path, 'w') as f:
                await f.write(json.dumps(metadata, indent=2))
                
    async def save_code(self, node_id: str, code: str, message: str = None, author: str = None) -> VersionHistory:
        """코드 저장 및 버전 관리"""
        node_path = self.get_node_path(node_id)
        await self.setup_node_directory(node_id)
        
        # 현재 코드 저장
        current_code_path = node_path / "code" / "current.py"
        async with aiofiles.open(current_code_path, 'w', encoding='utf-8') as f:
            await f.write(code)
            
        # 히스토리 버전 번호 계산
        history_path = node_path / "code" / "history"
        existing_versions = sorted([
            int(f.stem[1:]) for f in history_path.glob("v*.py")
        ])
        
        next_version = 1
        if existing_versions:
            next_version = existing_versions[-1] + 1
            
        # 히스토리 저장
        version_file = history_path / f"v{next_version}.py"
        async with aiofiles.open(version_file, 'w', encoding='utf-8') as f:
            await f.write(code)
            
        # 파일 해시 계산
        file_hash = hashlib.md5(code.encode()).hexdigest()
        
        # 버전 정보 생성
        version_info = VersionHistory(
            version=next_version,
            code=code,
            timestamp=datetime.now(),
            author=author,
            message=message,
            file_hash=file_hash
        )
        
        # 오래된 버전 삭제 (최대 5개 유지)
        if len(existing_versions) >= self.max_versions:
            oldest_version = existing_versions[0]
            old_file = history_path / f"v{oldest_version}.py"
            if old_file.exists():
                old_file.unlink()
                
        # 메타데이터 업데이트
        await self.update_metadata(node_id, {"updated_at": datetime.now().isoformat()})
        
        return version_info
        
    async def get_code(self, node_id: str, version: Optional[int] = None) -> Optional[str]:
        """코드 가져오기 (버전 지정 가능)"""
        node_path = self.get_node_path(node_id)
        
        if version is None:
            # 현재 코드
            code_path = node_path / "code" / "current.py"
        else:
            # 특정 버전
            code_path = node_path / "code" / "history" / f"v{version}.py"
            
        if code_path.exists():
            async with aiofiles.open(code_path, 'r', encoding='utf-8') as f:
                return await f.read()
        return None
        
    async def save_data(self, node_id: str, data_type: str, data: Any):
        """데이터 저장 (input, output, tasks 등)"""
        node_path = self.get_node_path(node_id)
        await self.setup_node_directory(node_id)
        
        data_file = node_path / "data" / f"{data_type}.json"
        async with aiofiles.open(data_file, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(data, indent=2, default=str))
            
    async def get_data(self, node_id: str, data_type: str) -> Optional[Any]:
        """데이터 가져오기"""
        data_file = self.get_node_path(node_id) / "data" / f"{data_type}.json"
        
        if data_file.exists():
            async with aiofiles.open(data_file, 'r', encoding='utf-8') as f:
                content = await f.read()
                return json.loads(content)
        return None
        
    async def save_file(self, node_id: str, filename: str, content: bytes) -> str:
        """파일 저장 (이미지, 문서 등)"""
        node_path = self.get_node_path(node_id)
        await self.setup_node_directory(node_id)
        
        file_path = node_path / "files" / filename
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
            
        return str(file_path.relative_to(self.base_path))
        
    async def get_file_path(self, node_id: str, filename: str) -> Optional[Path]:
        """파일 경로 가져오기"""
        file_path = self.get_node_path(node_id) / "files" / filename
        return file_path if file_path.exists() else None
        
    async def list_versions(self, node_id: str) -> List[Dict[str, Any]]:
        """버전 목록 가져오기"""
        history_path = self.get_node_path(node_id) / "code" / "history"
        versions = []
        
        for version_file in sorted(history_path.glob("v*.py")):
            version_num = int(version_file.stem[1:])
            stat = version_file.stat()
            
            # 버전 메타데이터 로드 시도
            meta_file = history_path / f"v{version_num}.meta.json"
            metadata = {}
            if meta_file.exists():
                async with aiofiles.open(meta_file, 'r') as f:
                    metadata = json.loads(await f.read())
                    
            versions.append({
                "version": version_num,
                "timestamp": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "size": stat.st_size,
                "message": metadata.get("message", ""),
                "author": metadata.get("author", "")
            })
            
        return versions[-self.max_versions:]  # 최대 5개만 반환
        
    async def update_metadata(self, node_id: str, updates: Dict[str, Any]):
        """메타데이터 업데이트"""
        metadata_path = self.get_node_path(node_id) / "metadata.json"
        
        metadata = {}
        if metadata_path.exists():
            async with aiofiles.open(metadata_path, 'r') as f:
                metadata = json.loads(await f.read())
                
        metadata.update(updates)
        
        async with aiofiles.open(metadata_path, 'w') as f:
            await f.write(json.dumps(metadata, indent=2, default=str))
            
    async def get_metadata(self, node_id: str) -> Optional[Dict[str, Any]]:
        """메타데이터 가져오기"""
        metadata_path = self.get_node_path(node_id) / "metadata.json"
        
        if metadata_path.exists():
            async with aiofiles.open(metadata_path, 'r') as f:
                return json.loads(await f.read())
        return None
        
    async def cleanup_node(self, node_id: str):
        """노드 데이터 정리 (삭제)"""
        node_path = self.get_node_path(node_id)
        if node_path.exists():
            shutil.rmtree(node_path)
            
    async def backup_node(self, node_id: str) -> str:
        """노드 데이터 백업"""
        node_path = self.get_node_path(node_id)
        backup_path = self.base_path / "backups" / datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path.mkdir(parents=True, exist_ok=True)
        
        if node_path.exists():
            backup_file = backup_path / f"{node_id}.tar.gz"
            shutil.make_archive(
                str(backup_file.with_suffix('')),
                'gztar',
                str(node_path)
            )
            return str(backup_file)
        return ""
        
    async def get_storage_stats(self, node_id: str) -> Dict[str, Any]:
        """노드 스토리지 통계"""
        node_path = self.get_node_path(node_id)
        
        if not node_path.exists():
            return {"exists": False}
            
        total_size = 0
        file_count = 0
        
        for item in node_path.rglob("*"):
            if item.is_file():
                total_size += item.stat().st_size
                file_count += 1
                
        return {
            "exists": True,
            "total_size": total_size,
            "file_count": file_count,
            "code_versions": len(list((node_path / "code" / "history").glob("v*.py"))),
            "data_files": len(list((node_path / "data").glob("*.json"))),
            "generated_files": len(list((node_path / "files").rglob("*")))
        }

# 싱글톤 인스턴스
node_storage = NodeStorageManager()