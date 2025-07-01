#!/usr/bin/env python3
"""
Run Safe Autonomous System - 비대화식 실행
"""

import sys
import asyncio
from safe_autonomous_claude_system import run_safe_autonomous_system

async def main():
    """메인 실행 함수"""
    
    # 기본값으로 실행 (비대화식)
    safety_level = "SAFE_WRITE"  # 가장 안전한 기본값
    runtime_hours = 1  # 테스트용 1시간
    
    # 명령행 인수 처리
    if len(sys.argv) > 1:
        safety_level = sys.argv[1].upper()
    
    if len(sys.argv) > 2:
        try:
            runtime_hours = int(sys.argv[2])
        except ValueError:
            runtime_hours = 1
    
    print("🛡️ Safe Autonomous Claude System")
    print("=" * 50)
    print("안전한 자율 Claude 시스템")
    print("- 파일 삭제 방지")
    print("- 자동 백업")
    print("- 24시간 자율 실행")
    print("- Claude와 지속적 상담")
    print("=" * 50)
    
    print(f"\n설정:")
    print(f"안전 수준: {safety_level}")
    print(f"실행 시간: {runtime_hours}시간")
    print(f"Ctrl+C로 언제든 중단 가능")
    print("=" * 50 + "\n")
    
    # 실행
    try:
        success = await run_safe_autonomous_system(runtime_hours, safety_level)
        
        if success:
            print("\n✅ 시스템이 성공적으로 완료되었습니다.")
        else:
            print("\n❌ 시스템 실행 중 오류가 발생했습니다.")
        
    except KeyboardInterrupt:
        print("\n⏹️ 사용자에 의해 중단되었습니다.")
    except Exception as e:
        print(f"\n💥 시스템 오류: {e}")

if __name__ == "__main__":
    # 사용법 출력
    if len(sys.argv) > 1 and sys.argv[1] in ["-h", "--help", "help"]:
        print("""
Safe Autonomous Claude System - 사용법

python run_safe_autonomous.py [SAFETY_LEVEL] [HOURS]

안전 수준:
  READ_ONLY    - 읽기만 가능 (가장 안전)
  SIMULATION   - 시뮬레이션만
  SAFE_WRITE   - 백업 후 쓰기 (기본값, 권장)
  FULL_CONTROL - 전체 제어 (위험!)

예시:
  python run_safe_autonomous.py                    # 기본값 (SAFE_WRITE, 1시간)
  python run_safe_autonomous.py SIMULATION 2      # 시뮬레이션 모드, 2시간
  python run_safe_autonomous.py READ_ONLY 24      # 읽기 전용, 24시간
""")
        sys.exit(0)
    
    # 인코딩 설정
    try:
        if sys.platform.startswith('win'):
            import subprocess
            subprocess.run('chcp 65001', shell=True, capture_output=True)
        
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
            sys.stderr.reconfigure(encoding='utf-8')
    except Exception as e:
        print(f"Encoding setup warning: {e}")
    
    # 실행
    asyncio.run(main())