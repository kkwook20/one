import os
import json
import shutil
import hashlib
import mimetypes
import aiofiles
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional, BinaryIO
import asyncio
import zipfile
import tarfile

class FileManager:
    """파일 시스템 관리 유틸리티"""
    
    def __init__(self, base_path: str = "data"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        
        # 파일 타입별 확장자 정의
        self.file_types = {
            "images": {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".exr", ".svg"},
            "videos": {".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv"},
            "3d": {".obj", ".fbx", ".blend", ".ma", ".mb", ".max", ".c4d", ".3ds", ".dae"},
            "documents": {".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".odt"},
            "code": {".py", ".js", ".ts", ".cpp", ".h", ".json", ".yaml", ".xml"},
            "audio": {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"},
            "archives": {".zip", ".tar", ".gz", ".rar", ".7z"}
        }
    
    async def create_directory(self, path: str) -> Path:
        """디렉토리 생성"""
        dir_path = self.base_path / path
        dir_path.mkdir(parents=True, exist_ok=True)
        return dir_path
    
    async def save_file(self, file_path: str, content: bytes) -> Dict[str, Any]:
        """파일 저장"""
        full_path = self.base_path / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        async with aiofiles.open(full_path, 'wb') as f:
            await f.write(content)
        
        return await self.get_file_info(file_path)
    
    async def read_file(self, file_path: str) -> bytes:
        """파일 읽기"""
        full_path = self.base_path / file_path
        
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        async with aiofiles.open(full_path, 'rb') as f:
            return await f.read()
    
    async def delete_file(self, file_path: str) -> bool:
        """파일 삭제"""
        full_path = self.base_path / file_path
        
        if full_path.exists():
            if full_path.is_file():
                full_path.unlink()
            else:
                shutil.rmtree(full_path)
            return True
        
        return False
    
    async def move_file(self, source: str, destination: str) -> Dict[str, Any]:
        """파일 이동"""
        source_path = self.base_path / source
        dest_path = self.base_path / destination
        
        if not source_path.exists():
            raise FileNotFoundError(f"Source file not found: {source}")
        
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source_path), str(dest_path))
        
        return await self.get_file_info(destination)
    
    async def copy_file(self, source: str, destination: str) -> Dict[str, Any]:
        """파일 복사"""
        source_path = self.base_path / source
        dest_path = self.base_path / destination
        
        if not source_path.exists():
            raise FileNotFoundError(f"Source file not found: {source}")
        
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        
        if source_path.is_file():
            shutil.copy2(str(source_path), str(dest_path))
        else:
            shutil.copytree(str(source_path), str(dest_path))
        
        return await self.get_file_info(destination)
    
    async def get_file_info(self, file_path: str) -> Dict[str, Any]:
        """파일 정보 조회"""
        full_path = self.base_path / file_path
        
        if not full_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        stat = full_path.stat()
        
        info = {
            "path": file_path,
            "name": full_path.name,
            "size": stat.st_size,
            "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "isFile": full_path.is_file(),
            "isDirectory": full_path.is_dir(),
        }
        
        if full_path.is_file():
            info["extension"] = full_path.suffix.lower()
            info["mimeType"] = mimetypes.guess_type(str(full_path))[0]
            info["fileType"] = self.get_file_type(full_path.suffix.lower())
            
            # 작은 파일은 해시 계산
            if stat.st_size < 10 * 1024 * 1024:  # 10MB 이하
                info["hash"] = await self.calculate_file_hash(file_path)
        
        return info
    
    def get_file_type(self, extension: str) -> str:
        """파일 타입 확인"""
        for file_type, extensions in self.file_types.items():
            if extension in extensions:
                return file_type
        return "other"
    
    async def list_files(
        self, 
        directory: str = "", 
        recursive: bool = False,
        file_type: Optional[str] = None,
        pattern: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """파일 목록 조회"""
        dir_path = self.base_path / directory
        
        if not dir_path.exists():
            return []
        
        files = []
        
        if recursive:
            items = dir_path.rglob(pattern or "*")
        else:
            items = dir_path.glob(pattern or "*")
        
        for item in items:
            try:
                relative_path = item.relative_to(self.base_path)
                
                # 파일 타입 필터링
                if file_type and item.is_file():
                    if self.get_file_type(item.suffix.lower()) != file_type:
                        continue
                
                info = await self.get_file_info(str(relative_path))
                files.append(info)
            except:
                pass
        
        return files
    
    async def calculate_file_hash(self, file_path: str, algorithm: str = "md5") -> str:
        """파일 해시 계산"""
        full_path = self.base_path / file_path
        
        if algorithm == "md5":
            hash_func = hashlib.md5()
        elif algorithm == "sha256":
            hash_func = hashlib.sha256()
        else:
            raise ValueError(f"Unsupported hash algorithm: {algorithm}")
        
        async with aiofiles.open(full_path, 'rb') as f:
            while chunk := await f.read(8192):
                hash_func.update(chunk)
        
        return hash_func.hexdigest()
    
    async def compress_files(
        self, 
        files: List[str], 
        output_path: str,
        compression_type: str = "zip"
    ) -> Dict[str, Any]:
        """파일 압축"""
        output_full_path = self.base_path / output_path
        output_full_path.parent.mkdir(parents=True, exist_ok=True)
        
        if compression_type == "zip":
            with zipfile.ZipFile(output_full_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for file_path in files:
                    full_path = self.base_path / file_path
                    if full_path.exists():
                        if full_path.is_file():
                            zf.write(full_path, file_path)
                        else:
                            for item in full_path.rglob("*"):
                                if item.is_file():
                                    arc_path = item.relative_to(self.base_path)
                                    zf.write(item, str(arc_path))
        
        elif compression_type == "tar.gz":
            with tarfile.open(output_full_path, "w:gz") as tar:
                for file_path in files:
                    full_path = self.base_path / file_path
                    if full_path.exists():
                        tar.add(full_path, arcname=file_path)
        
        else:
            raise ValueError(f"Unsupported compression type: {compression_type}")
        
        return await self.get_file_info(output_path)
    
    async def extract_archive(self, archive_path: str, output_dir: str) -> List[str]:
        """압축 해제"""
        archive_full_path = self.base_path / archive_path
        output_full_path = self.base_path / output_dir
        
        if not archive_full_path.exists():
            raise FileNotFoundError(f"Archive not found: {archive_path}")
        
        output_full_path.mkdir(parents=True, exist_ok=True)
        extracted_files = []
        
        if archive_path.endswith('.zip'):
            with zipfile.ZipFile(archive_full_path, 'r') as zf:
                for name in zf.namelist():
                    zf.extract(name, output_full_path)
                    extracted_files.append(str(output_full_path / name))
        
        elif archive_path.endswith(('.tar.gz', '.tgz')):
            with tarfile.open(archive_full_path, 'r:gz') as tar:
                tar.extractall(output_full_path)
                extracted_files = [m.name for m in tar.getmembers() if m.isfile()]
        
        return extracted_files
    
    async def get_directory_size(self, directory: str = "") -> int:
        """디렉토리 크기 계산"""
        dir_path = self.base_path / directory
        
        if not dir_path.exists():
            return 0
        
        total_size = 0
        
        for item in dir_path.rglob("*"):
            if item.is_file():
                try:
                    total_size += item.stat().st_size
                except:
                    pass
        
        return total_size
    
    async def find_duplicates(self, directory: str = "") -> List[Dict[str, Any]]:
        """중복 파일 찾기"""
        dir_path = self.base_path / directory
        file_hashes = {}
        duplicates = []
        
        for item in dir_path.rglob("*"):
            if item.is_file():
                try:
                    # 크기가 같은 파일만 해시 계산
                    size = item.stat().st_size
                    if size > 0:  # 빈 파일 제외
                        relative_path = item.relative_to(self.base_path)
                        file_hash = await self.calculate_file_hash(str(relative_path))
                        
                        if file_hash in file_hashes:
                            duplicates.append({
                                "original": str(file_hashes[file_hash]),
                                "duplicate": str(relative_path),
                                "size": size,
                                "hash": file_hash
                            })
                        else:
                            file_hashes[file_hash] = relative_path
                except:
                    pass
        
        return duplicates
    
    async def clean_empty_directories(self, directory: str = "") -> int:
        """빈 디렉토리 정리"""
        dir_path = self.base_path / directory
        cleaned_count = 0
        
        # 하위 디렉토리부터 확인
        for item in sorted(dir_path.rglob("*"), reverse=True):
            if item.is_dir():
                try:
                    # 빈 디렉토리인지 확인
                    if not any(item.iterdir()):
                        item.rmdir()
                        cleaned_count += 1
                except:
                    pass
        
        return cleaned_count
    
    async def backup_files(
        self, 
        source_dir: str, 
        backup_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """파일 백업"""
        if not backup_name:
            backup_name = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        backup_dir = f"backups/{backup_name}"
        
        # 파일 복사
        source_path = self.base_path / source_dir
        if source_path.exists():
            await self.copy_file(source_dir, backup_dir)
        
        # 백업 정보 저장
        backup_info = {
            "name": backup_name,
            "source": source_dir,
            "timestamp": datetime.now().isoformat(),
            "size": await self.get_directory_size(backup_dir),
            "fileCount": len(list((self.base_path / backup_dir).rglob("*")))
        }
        
        # 백업 메타데이터 저장
        metadata_path = self.base_path / "backups" / f"{backup_name}.json"
        with open(metadata_path, 'w') as f:
            json.dump(backup_info, f, indent=2)
        
        return backup_info


# 싱글톤 인스턴스
file_manager = FileManager()

# 편의 함수들
async def save_json(file_path: str, data: Any) -> Dict[str, Any]:
    """JSON 파일 저장"""
    content = json.dumps(data, indent=2, ensure_ascii=False).encode('utf-8')
    return await file_manager.save_file(file_path, content)

async def load_json(file_path: str) -> Any:
    """JSON 파일 로드"""
    content = await file_manager.read_file(file_path)
    return json.loads(content.decode('utf-8'))

async def save_text(file_path: str, text: str) -> Dict[str, Any]:
    """텍스트 파일 저장"""
    return await file_manager.save_file(file_path, text.encode('utf-8'))

async def load_text(file_path: str) -> str:
    """텍스트 파일 로드"""
    content = await file_manager.read_file(file_path)
    return content.decode('utf-8')