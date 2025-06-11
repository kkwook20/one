from fastapi import APIRouter, HTTPException
from typing import List
import os
import json
from datetime import datetime
import uuid

router = APIRouter()

# 프로젝트 저장 경로 (설정 파일이나 환경 변수로 관리하는 것이 좋음)
PROJECTS_BASE_PATH = os.getenv("PROJECTS_PATH", "./projects")
PROJECTS_CONFIG_FILE = os.path.join(PROJECTS_BASE_PATH, ".projects.json")

@router.get("/")
async def get_projects():
    """모든 프로젝트 목록 반환"""
    if not os.path.exists(PROJECTS_CONFIG_FILE):
        return []
    
    with open(PROJECTS_CONFIG_FILE, 'r') as f:
        projects = json.load(f)
    return projects

@router.post("/")
async def create_project(project_data: dict):
    """새 프로젝트 생성"""
    project_id = str(uuid.uuid4())
    project_name = project_data["name"]
    project_path = project_data["path"]
    
    # 프로젝트 폴더 생성
    full_path = os.path.join(project_path, project_name)
    
    # 프로젝트 구조 생성
    subdirs = [
        "preproduction/script",
        "preproduction/character",
        "preproduction/setting",
        "preproduction/plot",
        "postproduction/animation",
        "postproduction/lighting",
        "postproduction/effects",
        "postproduction/sound",
        "outputs",
        "temp",
        "references"
    ]
    
    for subdir in subdirs:
        os.makedirs(os.path.join(full_path, subdir), exist_ok=True)
    
    # 프로젝트 정보 저장
    project_info = {
        "id": project_id,
        "name": project_name,
        "path": project_path,
        "created": datetime.now().isoformat(),
        "modified": datetime.now().isoformat(),
        "settings": project_data.get("settings", {})
    }
    
    # 프로젝트 설정 파일 생성
    project_config_path = os.path.join(full_path, "project.json")
    with open(project_config_path, 'w') as f:
        json.dump(project_info, f, indent=2)
    
    # 전체 프로젝트 목록 업데이트
    projects = []
    if os.path.exists(PROJECTS_CONFIG_FILE):
        with open(PROJECTS_CONFIG_FILE, 'r') as f:
            projects = json.load(f)
    
    projects.append(project_info)
    
    os.makedirs(PROJECTS_BASE_PATH, exist_ok=True)
    with open(PROJECTS_CONFIG_FILE, 'w') as f:
        json.dump(projects, f, indent=2)
    
    return project_info

@router.delete("/{project_id}")
async def delete_project(project_id: str):
    """프로젝트 삭제"""
    # 구현...

@router.put("/{project_id}")
async def update_project(project_id: str, update_data: dict):
    """프로젝트 정보 업데이트"""
    # 구현...

@router.get("/default-path")
async def get_default_project_path():
    """기본 프로젝트 경로 반환"""
    return {"path": PROJECTS_BASE_PATH}