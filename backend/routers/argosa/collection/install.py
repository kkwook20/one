# install.py - 한 번만 실행
import os
import sys
import winreg
import json
import platform

def get_python_path():
    """현재 Python 실행 파일 경로"""
    return sys.executable

def install():
    # Native Host 스크립트 경로 설정
    # native_messaging.py 또는 native_host.py 중 존재하는 파일 사용
    possible_names = ["native_messaging.py", "native_host.py"]
    native_host_path = None
    
    for name in possible_names:
        path = os.path.abspath(f"backend/routers/argosa/collection/{name}")
        if os.path.exists(path):
            native_host_path = path
            break
    
    if not native_host_path:
        # 파일이 없어도 기본 경로 설정
        native_host_path = os.path.abspath("backend/routers/argosa/collection/native_messaging.py")
        print(f"⚠️  Warning: Native host script not found. Expected at: {native_host_path}")
    
    # 1. manifest.json 생성
    manifest = {
        "name": "com.argosa.native",
        "description": "Argosa Native Host",
        "path": get_python_path(),  # Python 실행 파일
        "type": "stdio",
        "allowed_extensions": ["llm-collector@argosa.ai"],
        "args": [native_host_path]  # Native Host 스크립트 경로
    }
    
    # 2. 플랫폼별 저장 경로 설정
    if platform.system() == "Windows":
        manifest_dir = "C:\\ProgramData\\Argosa"
        manifest_path = os.path.join(manifest_dir, "manifest.json")
    elif platform.system() == "Linux":
        manifest_dir = os.path.expanduser("~/.mozilla/native-messaging-hosts")
        manifest_path = os.path.join(manifest_dir, "com.argosa.native.json")
    elif platform.system() == "Darwin":  # macOS
        manifest_dir = os.path.expanduser("~/Library/Application Support/Mozilla/NativeMessagingHosts")
        manifest_path = os.path.join(manifest_dir, "com.argosa.native.json")
    else:
        print("❌ Unsupported platform")
        return
    
    # 디렉토리 생성
    os.makedirs(manifest_dir, exist_ok=True)
    
    # manifest 파일 저장
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    
    # 3. 플랫폼별 등록
    if platform.system() == "Windows":
        # Windows: 레지스트리 등록
        try:
            key = winreg.CreateKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Mozilla\NativeMessagingHosts\com.argosa.native"
            )
            winreg.SetValue(key, "", winreg.REG_SZ, manifest_path)
            winreg.CloseKey(key)
            print("✅ Registry updated successfully")
        except Exception as e:
            print(f"❌ Registry update failed: {e}")
            return
    
    # Linux/macOS는 manifest 파일만 있으면 됨
    
    print("✅ Native Messaging installed successfully!")
    print(f"📁 Manifest: {manifest_path}")
    print(f"🐍 Python: {get_python_path()}")
    print(f"📄 Script: {native_host_path}")
    
    # 4. 로그 디렉토리 생성
    if platform.system() == "Windows":
        log_dir = "C:\\ProgramData\\Argosa"
    else:
        log_dir = os.path.expanduser("~/.argosa")
    
    os.makedirs(log_dir, exist_ok=True)
    print(f"📝 Log directory: {log_dir}")

def uninstall():
    """Native Messaging 제거"""
    print("🗑️  Uninstalling Native Messaging...")
    
    if platform.system() == "Windows":
        # 레지스트리 제거
        try:
            winreg.DeleteKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Mozilla\NativeMessagingHosts\com.argosa.native"
            )
            print("✅ Registry entry removed")
        except:
            print("⚠️  Registry entry not found")
        
        # manifest 파일 제거
        manifest_path = "C:\\ProgramData\\Argosa\\manifest.json"
        if os.path.exists(manifest_path):
            os.remove(manifest_path)
            print("✅ Manifest file removed")
    
    print("✅ Uninstall complete")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Install/Uninstall Native Messaging Host")
    parser.add_argument("--uninstall", action="store_true", help="Uninstall Native Messaging")
    args = parser.parse_args()
    
    if args.uninstall:
        uninstall()
    else:
        install()