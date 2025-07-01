#!/usr/bin/env python3
"""
Emergency Recovery System
긴급 복구 시스템 - 파일 삭제나 손실 시 즉시 복구
"""

import os
import shutil
import subprocess
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import asyncio
import zipfile
import hashlib

logger = logging.getLogger(__name__)

class EmergencyRecovery:
    """긴급 복구 시스템"""
    
    def __init__(self, project_root: str = "F:/ONE_AI"):
        self.project_root = Path(project_root)
        self.backup_root = self.project_root / ".emergency_backups"
        self.git_available = self._check_git_availability()
        
        # 백업 디렉토리 생성
        self.backup_root.mkdir(parents=True, exist_ok=True)
        
        # 중요 파일/디렉토리 목록
        self.critical_paths = [
            "backend/",
            "frontend/",
            "CLAUDE.md",
            "One.bat",
            "requirements.txt",
            "claude_bridge/",
            ".git/"
        ]
        
        # 복구 로그
        self.recovery_log = []
        
        logger.info(f"Emergency Recovery System initialized for {project_root}")
    
    def _check_git_availability(self) -> bool:
        """Git 사용 가능 여부 확인"""
        try:
            result = subprocess.run(
                ["git", "--version"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except Exception:
            return False
    
    async def create_emergency_backup(self) -> bool:
        """긴급 백업 생성"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = f"emergency_backup_{timestamp}"
            backup_path = self.backup_root / backup_name
            
            logger.info(f"Creating emergency backup: {backup_path}")
            
            # 1. Git 기반 백업 (가장 안전)
            if self.git_available:
                await self._create_git_backup(backup_path)
            
            # 2. 파일 복사 백업
            await self._create_file_backup(backup_path)
            
            # 3. 압축 백업
            await self._create_zip_backup(backup_path)
            
            # 4. 메타데이터 저장
            await self._save_backup_metadata(backup_path)
            
            logger.info(f"Emergency backup completed: {backup_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create emergency backup: {e}")
            return False
    
    async def _create_git_backup(self, backup_path: Path):
        """Git 기반 백업 생성"""
        try:
            git_backup_path = backup_path / "git_backup"
            git_backup_path.mkdir(parents=True, exist_ok=True)
            
            # Git 상태 저장
            commands = [
                ["git", "status", "--porcelain"],
                ["git", "diff", "HEAD"],
                ["git", "log", "--oneline", "-10"],
                ["git", "branch", "-v"]
            ]
            
            for i, cmd in enumerate(commands):
                try:
                    result = subprocess.run(
                        cmd,
                        cwd=self.project_root,
                        capture_output=True,
                        text=True,
                        timeout=30
                    )
                    
                    output_file = git_backup_path / f"git_{i}_{cmd[1]}.txt"
                    with open(output_file, 'w', encoding='utf-8') as f:
                        f.write(f"Command: {' '.join(cmd)}\n")
                        f.write(f"Return code: {result.returncode}\n")
                        f.write(f"STDOUT:\n{result.stdout}\n")
                        f.write(f"STDERR:\n{result.stderr}\n")
                        
                except Exception as e:
                    logger.warning(f"Git command failed: {cmd} - {e}")
            
            logger.info("Git backup metadata saved")
            
        except Exception as e:
            logger.error(f"Failed to create git backup: {e}")
    
    async def _create_file_backup(self, backup_path: Path):
        """파일 복사 백업 생성"""
        try:
            file_backup_path = backup_path / "file_backup"
            file_backup_path.mkdir(parents=True, exist_ok=True)
            
            for critical_path in self.critical_paths:
                source_path = self.project_root / critical_path
                if not source_path.exists():
                    continue
                
                target_path = file_backup_path / critical_path
                
                if source_path.is_file():
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source_path, target_path)
                elif source_path.is_dir():
                    shutil.copytree(source_path, target_path, dirs_exist_ok=True)
                
                logger.debug(f"Backed up: {source_path} -> {target_path}")
            
            logger.info("File backup completed")
            
        except Exception as e:
            logger.error(f"Failed to create file backup: {e}")
    
    async def _create_zip_backup(self, backup_path: Path):
        """압축 백업 생성"""
        try:
            zip_path = backup_path / "compressed_backup.zip"
            
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for critical_path in self.critical_paths:
                    source_path = self.project_root / critical_path
                    if not source_path.exists():
                        continue
                    
                    if source_path.is_file():
                        zipf.write(source_path, critical_path)
                    elif source_path.is_dir():
                        for root, dirs, files in os.walk(source_path):
                            for file in files:
                                file_path = Path(root) / file
                                archive_path = file_path.relative_to(self.project_root)
                                zipf.write(file_path, archive_path)
            
            logger.info(f"Compressed backup created: {zip_path}")
            
        except Exception as e:
            logger.error(f"Failed to create zip backup: {e}")
    
    async def _save_backup_metadata(self, backup_path: Path):
        """백업 메타데이터 저장"""
        try:
            metadata = {
                "timestamp": datetime.now().isoformat(),
                "project_root": str(self.project_root),
                "backup_path": str(backup_path),
                "git_available": self.git_available,
                "critical_paths": self.critical_paths,
                "file_hashes": {}
            }
            
            # 중요 파일들의 해시 계산
            for critical_path in self.critical_paths:
                source_path = self.project_root / critical_path
                if source_path.is_file():
                    metadata["file_hashes"][critical_path] = self._calculate_file_hash(source_path)
            
            metadata_file = backup_path / "backup_metadata.json"
            with open(metadata_file, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)
            
            logger.info("Backup metadata saved")
            
        except Exception as e:
            logger.error(f"Failed to save backup metadata: {e}")
    
    def _calculate_file_hash(self, file_path: Path) -> str:
        """파일 해시 계산"""
        try:
            hasher = hashlib.md5()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception:
            return ""
    
    async def detect_file_loss(self) -> List[str]:
        """파일 손실 감지"""
        missing_files = []
        
        for critical_path in self.critical_paths:
            source_path = self.project_root / critical_path
            if not source_path.exists():
                missing_files.append(critical_path)
                logger.warning(f"Critical file/directory missing: {critical_path}")
        
        if missing_files:
            logger.critical(f"DETECTED FILE LOSS: {len(missing_files)} critical items missing")
            
            # 긴급 로그 저장
            emergency_log = {
                "timestamp": datetime.now().isoformat(),
                "event": "file_loss_detected",
                "missing_files": missing_files,
                "total_missing": len(missing_files)
            }
            
            try:
                log_file = self.backup_root / "emergency_log.json"
                with open(log_file, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(emergency_log) + '\n')
            except Exception as e:
                logger.error(f"Failed to save emergency log: {e}")
        
        return missing_files
    
    async def auto_recovery(self) -> bool:
        """자동 복구 실행"""
        try:
            logger.critical("AUTO RECOVERY STARTED")
            
            # 1. 파일 손실 감지
            missing_files = await self.detect_file_loss()
            if not missing_files:
                logger.info("No file loss detected, recovery not needed")
                return True
            
            # 2. Git 기반 복구 시도
            if self.git_available:
                success = await self._git_recovery()
                if success:
                    logger.info("Git recovery successful")
                    return True
            
            # 3. 백업에서 복구 시도
            success = await self._backup_recovery()
            if success:
                logger.info("Backup recovery successful")
                return True
            
            # 4. 수동 복구 가이드 생성
            await self._create_manual_recovery_guide()
            
            logger.critical("AUTO RECOVERY FAILED - Manual intervention required")
            return False
            
        except Exception as e:
            logger.critical(f"Auto recovery error: {e}")
            return False
    
    async def _git_recovery(self) -> bool:
        """Git 기반 복구"""
        try:
            logger.info("Attempting Git recovery...")
            
            # Git 상태 확인
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                logger.error("Git status check failed")
                return False
            
            # 모든 변경사항 취소 (위험하지만 복구를 위해 필요)
            recovery_commands = [
                ["git", "reset", "--hard", "HEAD"],
                ["git", "clean", "-fd"],
                ["git", "checkout", "--", "."]
            ]
            
            for cmd in recovery_commands:
                try:
                    result = subprocess.run(
                        cmd,
                        cwd=self.project_root,
                        capture_output=True,
                        text=True,
                        timeout=60
                    )
                    
                    if result.returncode == 0:
                        logger.info(f"Git command successful: {' '.join(cmd)}")
                    else:
                        logger.warning(f"Git command failed: {' '.join(cmd)} - {result.stderr}")
                        
                except Exception as e:
                    logger.error(f"Git command error: {' '.join(cmd)} - {e}")
            
            # 복구 확인
            missing_files = await self.detect_file_loss()
            return len(missing_files) == 0
            
        except Exception as e:
            logger.error(f"Git recovery failed: {e}")
            return False
    
    async def _backup_recovery(self) -> bool:
        """백업에서 복구"""
        try:
            logger.info("Attempting backup recovery...")
            
            # 최신 백업 찾기
            latest_backup = self._find_latest_backup()
            if not latest_backup:
                logger.error("No backup found for recovery")
                return False
            
            # 백업에서 파일 복원
            file_backup_path = latest_backup / "file_backup"
            if not file_backup_path.exists():
                logger.error("File backup not found")
                return False
            
            for critical_path in self.critical_paths:
                backup_file = file_backup_path / critical_path
                target_file = self.project_root / critical_path
                
                if backup_file.exists():
                    if backup_file.is_file():
                        target_file.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(backup_file, target_file)
                    elif backup_file.is_dir():
                        if target_file.exists():
                            shutil.rmtree(target_file)
                        shutil.copytree(backup_file, target_file)
                    
                    logger.info(f"Restored: {critical_path}")
            
            # 복구 확인
            missing_files = await self.detect_file_loss()
            return len(missing_files) == 0
            
        except Exception as e:
            logger.error(f"Backup recovery failed: {e}")
            return False
    
    def _find_latest_backup(self) -> Optional[Path]:
        """최신 백업 찾기"""
        try:
            backup_dirs = [
                d for d in self.backup_root.iterdir()
                if d.is_dir() and d.name.startswith("emergency_backup_")
            ]
            
            if not backup_dirs:
                return None
            
            # 이름으로 정렬 (타임스탬프 포함)
            backup_dirs.sort(key=lambda x: x.name, reverse=True)
            return backup_dirs[0]
            
        except Exception as e:
            logger.error(f"Failed to find latest backup: {e}")
            return None
    
    async def _create_manual_recovery_guide(self):
        """수동 복구 가이드 생성"""
        try:
            guide_content = f"""# EMERGENCY RECOVERY GUIDE
Generated: {datetime.now().isoformat()}

## CRITICAL: Files have been lost from the project!

### Quick Recovery Steps:

1. **Git Recovery (Recommended)**:
   ```bash
   cd {self.project_root}
   git reset --hard HEAD
   git clean -fd
   git checkout -- .
   ```

2. **Manual Backup Recovery**:
   - Check backup directory: {self.backup_root}
   - Find latest backup folder
   - Copy files from file_backup/ to project root

3. **Emergency Restore Script**:
   ```bash
   cd {self.project_root}
   ./EMERGENCY_RESTORE.bat
   ```

### Missing Files Detected:
{chr(10).join(f"- {f}" for f in await self.detect_file_loss())}

### Emergency Contacts:
- Check logs in: {self.backup_root}
- Git status: git status
- Backup location: {self.backup_root}

## IMPORTANT: 
DO NOT RUN autonomous_claude_system.py again!
It caused this file deletion.
Use safe_claude_bridge.py instead.
"""
            
            guide_file = self.project_root / "EMERGENCY_RECOVERY_GUIDE.md"
            with open(guide_file, 'w', encoding='utf-8') as f:
                f.write(guide_content)
            
            logger.critical(f"Manual recovery guide created: {guide_file}")
            
        except Exception as e:
            logger.error(f"Failed to create recovery guide: {e}")
    
    async def continuous_monitoring(self, interval: int = 60):
        """연속 모니터링"""
        logger.info(f"Starting continuous monitoring (interval: {interval}s)")
        
        while True:
            try:
                # 파일 손실 확인
                missing_files = await self.detect_file_loss()
                
                if missing_files:
                    logger.critical(f"FILE LOSS DETECTED: {len(missing_files)} files missing")
                    
                    # 자동 복구 시도
                    recovery_success = await self.auto_recovery()
                    
                    if not recovery_success:
                        logger.critical("AUTO RECOVERY FAILED - MANUAL INTERVENTION REQUIRED")
                        break
                
                await asyncio.sleep(interval)
                
            except KeyboardInterrupt:
                logger.info("Monitoring stopped by user")
                break
            except Exception as e:
                logger.error(f"Monitoring error: {e}")
                await asyncio.sleep(interval)

# 헬퍼 함수들
async def create_emergency_backup(project_root: str = "F:/ONE_AI") -> bool:
    """긴급 백업 생성"""
    recovery = EmergencyRecovery(project_root)
    return await recovery.create_emergency_backup()

async def check_file_integrity(project_root: str = "F:/ONE_AI") -> List[str]:
    """파일 무결성 확인"""
    recovery = EmergencyRecovery(project_root)
    return await recovery.detect_file_loss()

async def emergency_recover(project_root: str = "F:/ONE_AI") -> bool:
    """긴급 복구 실행"""
    recovery = EmergencyRecovery(project_root)
    return await recovery.auto_recovery()

if __name__ == "__main__":
    import asyncio
    
    async def main():
        recovery = EmergencyRecovery()
        
        # 백업 생성
        print("Creating emergency backup...")
        await recovery.create_emergency_backup()
        
        # 파일 무결성 확인
        print("Checking file integrity...")
        missing = await recovery.detect_file_loss()
        if missing:
            print(f"Missing files: {missing}")
            
            # 자동 복구 시도
            print("Starting auto recovery...")
            success = await recovery.auto_recovery()
            print(f"Recovery result: {success}")
        else:
            print("All files intact")
    
    asyncio.run(main())