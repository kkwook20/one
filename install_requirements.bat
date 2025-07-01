@echo off
echo Installing required packages for Autonomous Claude System...
echo.

:: Python 패키지 설치
echo Installing Python packages...
pip install pyautogui
pip install keyboard
pip install mouse
pip install pywin32
pip install psutil
pip install pillow
pip install pytesseract
pip install opencv-python
pip install selenium
pip install webdriver-manager
pip install pyperclip

echo.
echo Installing additional packages for claude_bridge...
pip install fastapi
pip install uvicorn
pip install websockets
pip install httpx
pip install pyyaml
pip install aiofiles
pip install python-multipart

echo.
echo ========================================
echo Installation complete!
echo.
echo Note: For OCR functionality, you also need to install Tesseract:
echo 1. Download from: https://github.com/UB-Mannheim/tesseract/wiki
echo 2. Install to: C:\Program Files\Tesseract-OCR\
echo.
echo For Chrome automation, Chrome browser should be installed.
echo ========================================
echo.
pause