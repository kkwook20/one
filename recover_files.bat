@echo off
echo Checking for deleted files...
echo.

:: Git이 있다면 복구 시도
if exist .git (
    echo Git repository found. Checking status...
    git status
    echo.
    echo To restore deleted files, run:
    echo git checkout -- .
    echo.
) else (
    echo No Git repository found.
)

:: 백업 파일 찾기
echo.
echo Looking for backup files...
dir /s *.backup* *.bak

echo.
echo ========================================
echo If files were deleted:
echo 1. Check Windows Recycle Bin
echo 2. Use git checkout if you have Git
echo 3. Check for .backup files
echo 4. Use Windows File History if enabled
echo ========================================
pause