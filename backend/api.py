# backend/api.py - 파일 관련 엔드포인트 추가

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import json
from pathlib import Path
from typing import List, Dict, Any
import mimetypes

# 파일 관련 모델
class FileContentRequest(BaseModel):
    file_path: str

class FileCreateRequest(BaseModel):
    file_path: str
    content: str

class FileUpdateRequest(BaseModel):
    file_path: str
    content: str

class FileDeleteRequest(BaseModel):
    file_path: str

# 파일 트리 구조를 만드는 헬퍼 함수
def build_file_tree(path: Path, base_path: Path = None) -> List[Dict[str, Any]]:
    """디렉토리를 재귀적으로 탐색하여 파일 트리 구조를 생성"""
    if base_path is None:
        base_path = path
    
    tree = []
    try:
        for item in sorted(path.iterdir()):
            # 숨김 파일과 특정 디렉토리 제외
            if item.name.startswith('.') or item.name in ['__pycache__', 'node_modules', '.git']:
                continue
            
            node = {
                'name': item.name,
                'path': str(item.relative_to(base_path)),
                'type': 'directory' if item.is_dir() else 'file'
            }
            
            if item.is_file():
                # 파일 크기와 수정 시간 추가
                stat = item.stat()
                node['size'] = stat.st_size
                node['modified'] = stat.st_mtime
            elif item.is_dir():
                # 재귀적으로 하위 디렉토리 탐색
                children = build_file_tree(item, base_path)
                if children:  # 빈 디렉토리는 children 추가 안함
                    node['children'] = children
            
            tree.append(node)
    except PermissionError:
        pass
    
    return tree

# 프로젝트 파일 목록 가져오기
@app.get("/projects/{project_id}/files")
async def get_project_files(project_id: str):
    """프로젝트의 파일 트리 구조를 반환"""
    try:
        # 프로젝트 정보 가져오기
        project_file = f'./data/projects/{project_id}.json'
        if not os.path.exists(project_file):
            raise HTTPException(status_code=404, detail="Project not found")
        
        with open(project_file, 'r', encoding='utf-8') as f:
            project_data = json.load(f)
        
        # 프로젝트 경로 구성
        project_path = Path(project_data['path']) / project_data['name']
        
        if not project_path.exists():
            return {"files": []}
        
        # 파일 트리 구성
        files = build_file_tree(project_path)
        
        return {"files": files}
    
    except Exception as e:
        print(f"Error getting project files: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 파일 내용 가져오기
@app.post("/projects/{project_id}/file-content")
async def get_file_content(project_id: str, request: FileContentRequest):
    """특정 파일의 내용을 반환"""
    try:
        # 프로젝트 정보 가져오기
        project_file = f'./data/projects/{project_id}.json'
        if not os.path.exists(project_file):
            raise HTTPException(status_code=404, detail="Project not found")
        
        with open(project_file, 'r', encoding='utf-8') as f:
            project_data = json.load(f)
        
        # 파일 경로 구성
        project_path = Path(project_data['path']) / project_data['name']
        file_path = project_path / request.file_path
        
        # 보안: 경로 탐색 공격 방지
        try:
            file_path = file_path.resolve()
            project_path = project_path.resolve()
            if not str(file_path).startswith(str(project_path)):
                raise HTTPException(status_code=403, detail="Access denied")
        except:
            raise HTTPException(status_code=400, detail="Invalid file path")
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")
        
        # 파일 크기 제한 (10MB)
        if file_path.stat().st_size > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large")
        
        # 바이너리 파일 체크
        mime_type, _ = mimetypes.guess_type(str(file_path))
        is_text = mime_type is None or mime_type.startswith('text/') or mime_type in [
            'application/json', 'application/xml', 'application/javascript',
            'application/x-python-code', 'application/x-yaml'
        ]
        
        if not is_text:
            return {
                "content": "[Binary file - cannot display content]",
                "is_binary": True,
                "mime_type": mime_type
            }
        
        # 텍스트 파일 읽기
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            # UTF-8이 아닌 경우 다른 인코딩 시도
            try:
                with open(file_path, 'r', encoding='latin-1') as f:
                    content = f.read()
            except:
                return {
                    "content": "[Cannot decode file content]",
                    "is_binary": True
                }
        
        return {
            "content": content,
            "is_binary": False,
            "mime_type": mime_type
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error reading file content: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 파일 생성
@app.post("/projects/{project_id}/files")
async def create_file(project_id: str, request: FileCreateRequest):
    """새 파일 생성"""
    try:
        # 프로젝트 정보 가져오기
        project_file = f'./data/projects/{project_id}.json'
        if not os.path.exists(project_file):
            raise HTTPException(status_code=404, detail="Project not found")
        
        with open(project_file, 'r', encoding='utf-8') as f:
            project_data = json.load(f)
        
        # 파일 경로 구성
        project_path = Path(project_data['path']) / project_data['name']
        file_path = project_path / request.file_path
        
        # 보안 체크
        try:
            file_path = file_path.resolve()
            project_path = project_path.resolve()
            if not str(file_path).startswith(str(project_path)):
                raise HTTPException(status_code=403, detail="Access denied")
        except:
            raise HTTPException(status_code=400, detail="Invalid file path")
        
        if file_path.exists():
            raise HTTPException(status_code=409, detail="File already exists")
        
        # 디렉토리 생성
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 파일 쓰기
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(request.content)
        
        return {"message": "File created successfully", "path": str(file_path.relative_to(project_path))}
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 파일 업데이트
@app.put("/projects/{project_id}/files")
async def update_file(project_id: str, request: FileUpdateRequest):
    """파일 내용 업데이트"""
    try:
        # 프로젝트 정보 가져오기
        project_file = f'./data/projects/{project_id}.json'
        if not os.path.exists(project_file):
            raise HTTPException(status_code=404, detail="Project not found")
        
        with open(project_file, 'r', encoding='utf-8') as f:
            project_data = json.load(f)
        
        # 파일 경로 구성
        project_path = Path(project_data['path']) / project_data['name']
        file_path = project_path / request.file_path
        
        # 보안 체크
        try:
            file_path = file_path.resolve()
            project_path = project_path.resolve()
            if not str(file_path).startswith(str(project_path)):
                raise HTTPException(status_code=403, detail="Access denied")
        except:
            raise HTTPException(status_code=400, detail="Invalid file path")
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")
        
        # 백업 생성 (선택적)
        # backup_path = file_path.with_suffix(file_path.suffix + '.bak')
        # shutil.copy2(file_path, backup_path)
        
        # 파일 쓰기
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(request.content)
        
        return {"message": "File updated successfully", "path": str(file_path.relative_to(project_path))}
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 파일 삭제
@app.delete("/projects/{project_id}/files")
async def delete_file(project_id: str, request: FileDeleteRequest):
    """파일 삭제"""
    try:
        # 프로젝트 정보 가져오기
        project_file = f'./data/projects/{project_id}.json'
        if not os.path.exists(project_file):
            raise HTTPException(status_code=404, detail="Project not found")
        
        with open(project_file, 'r', encoding='utf-8') as f:
            project_data = json.load(f)
        
        # 파일 경로 구성
        project_path = Path(project_data['path']) / project_data['name']
        file_path = project_path / request.file_path
        
        # 보안 체크
        try:
            file_path = file_path.resolve()
            project_path = project_path.resolve()
            if not str(file_path).startswith(str(project_path)):
                raise HTTPException(status_code=403, detail="Access denied")
        except:
            raise HTTPException(status_code=400, detail="Invalid file path")
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        if file_path.is_dir():
            # 디렉토리 삭제 (빈 디렉토리만)
            try:
                file_path.rmdir()
            except OSError:
                raise HTTPException(status_code=400, detail="Directory is not empty")
        else:
            # 파일 삭제
            file_path.unlink()
        
        return {"message": "File deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))