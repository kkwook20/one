@echo off
REM Extension 환경변수 설정 스크립트

echo Setting up Extension environment variables...

REM WSL에서 Windows 호스트 IP 가져오기
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"WSL"') do (
    for /f "tokens=1" %%b in ("%%a") do set WSL_HOST_IP=%%b
)

REM 기본값 설정 (WSL IP를 찾지 못한 경우)
if "%WSL_HOST_IP%"=="" set WSL_HOST_IP=172.31.64.1

REM Extension용 Backend URL 환경변수 설정
set ARGOSA_BACKEND_URL=http://%WSL_HOST_IP%:8000/api/argosa/data

echo WSL Host IP: %WSL_HOST_IP%
echo Backend URL: %ARGOSA_BACKEND_URL%

REM 시스템 환경변수로 설정 (관리자 권한 필요)
setx ARGOSA_BACKEND_URL "%ARGOSA_BACKEND_URL%" /M

echo Extension environment variables set successfully!
echo Please restart Firefox to apply changes.

pause