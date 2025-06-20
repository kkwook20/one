# debug_firefox_monitor.py - Firefox 모니터링 디버그 버전

import psutil
import time

def check_firefox_processes():
    """Firefox 관련 프로세스 확인"""
    print("=== Checking for Firefox processes ===")
    firefox_found = False
    
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            name = proc.info['name']
            if name and 'firefox' in name.lower():
                print(f"Found: PID={proc.info['pid']}, Name={name}")
                print(f"  Cmdline: {' '.join(proc.info.get('cmdline', []))[:100]}...")
                firefox_found = True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    
    if not firefox_found:
        print("No Firefox processes found")
    
    return firefox_found

def monitor_firefox():
    """Firefox 프로세스 모니터링"""
    print("Starting Firefox monitor...")
    firefox_pids = set()
    
    while True:
        current_pids = set()
        
        # 현재 Firefox 프로세스 찾기
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                name = proc.info['name']
                if name and 'firefox' in name.lower():
                    current_pids.add(proc.info['pid'])
            except:
                pass
        
        # 변화 감지
        if current_pids != firefox_pids:
            if len(current_pids) == 0 and len(firefox_pids) > 0:
                print(f"[{time.strftime('%H:%M:%S')}] Firefox CLOSED! (was tracking PIDs: {firefox_pids})")
            elif len(current_pids) > 0 and len(firefox_pids) == 0:
                print(f"[{time.strftime('%H:%M:%S')}] Firefox STARTED! (PIDs: {current_pids})")
            else:
                print(f"[{time.strftime('%H:%M:%S')}] Firefox process change: {firefox_pids} -> {current_pids}")
            
            firefox_pids = current_pids
        
        time.sleep(1)

if __name__ == "__main__":
    print("Firefox Process Monitor Debug Tool")
    print("==================================")
    
    # 먼저 현재 Firefox 프로세스 확인
    check_firefox_processes()
    print("\nStarting continuous monitoring (Press Ctrl+C to stop)...")
    
    try:
        monitor_firefox()
    except KeyboardInterrupt:
        print("\nMonitoring stopped.")