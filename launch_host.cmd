# create_cmd_launcher.py
import os
import json

# 1. CMD 런처 생성
cmd_content = '''@echo off
SET PYTHONIOENCODING=utf-8
"F:\\ONE_AI\\venv\\Scripts\\python.exe" "%~dp0native_host.py"
'''

cmd_path = r"C:\ProgramData\Argosa\launch_host.cmd"
with open(cmd_path, 'w') as f:
    f.write(cmd_content)

print(f"✅ CMD launcher created: {cmd_path}")

# 2. Manifest 업데이트
manifest = {
    "name": "com.argosa.native",
    "path": cmd_path,
    "type": "stdio",
    "allowed_extensions": ["llm-collector@argosa.ai"]
}

manifest_path = r"C:\ProgramData\Argosa\manifest.json"
with open(manifest_path, 'w') as f:
    json.dump(manifest, f, indent=2)

print(f"✅ Manifest updated")

# 3. 확인
print("\n설정 완료!")
print("- 런처: C:\\ProgramData\\Argosa\\launch_host.cmd")
print("- 스크립트: C:\\ProgramData\\Argosa\\native_host.py")
print("\nFirefox 재시작 후 동작 확인:")
print("- C:\\ProgramData\\Argosa\\native_host.log")