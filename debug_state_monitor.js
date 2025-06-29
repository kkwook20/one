// State Monitor Debug Tool
// 브라우저 콘솔에 복사해서 실행하세요

(function() {
    let stateHistory = [];
    let stateChangeCount = 0;
    let startTime = Date.now();
    
    // Original console.log를 가로채기
    const originalLog = console.log;
    
    console.log = function(...args) {
        originalLog.apply(console, args);
        
        // STATE CHANGE DETECTED 로그 캡처
        const logStr = args.join(' ');
        if (logStr.includes('STATE CHANGE DETECTED')) {
            stateChangeCount++;
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            
            stateHistory.push({
                time: new Date().toISOString(),
                elapsed: elapsed,
                count: stateChangeCount,
                log: logStr
            });
            
            // 매 10번째 변경마다 요약 출력
            if (stateChangeCount % 10 === 0) {
                console.warn(`🔥 State changed ${stateChangeCount} times in ${elapsed.toFixed(1)}s`);
                console.warn(`Average: ${(stateChangeCount / elapsed).toFixed(2)} changes/sec`);
            }
        }
    };
    
    // 분석 함수들
    window.debugState = {
        // 상태 변경 히스토리 보기
        history: () => {
            console.table(stateHistory.slice(-20));
        },
        
        // 요약 통계
        summary: () => {
            const elapsed = (Date.now() - startTime) / 1000;
            console.warn('=== State Change Summary ===');
            console.warn(`Total changes: ${stateChangeCount}`);
            console.warn(`Time elapsed: ${elapsed.toFixed(1)}s`);
            console.warn(`Average rate: ${(stateChangeCount / elapsed).toFixed(2)} changes/sec`);
            
            // 최근 10개 변경 간격 분석
            if (stateHistory.length > 1) {
                const intervals = [];
                for (let i = 1; i < Math.min(10, stateHistory.length); i++) {
                    intervals.push(stateHistory[i].elapsed - stateHistory[i-1].elapsed);
                }
                const avgInterval = intervals.reduce((a,b) => a+b, 0) / intervals.length;
                console.warn(`Recent avg interval: ${avgInterval.toFixed(2)}s`);
            }
        },
        
        // 리셋
        reset: () => {
            stateHistory = [];
            stateChangeCount = 0;
            startTime = Date.now();
            console.warn('Debug state monitor reset');
        },
        
        // 패턴 분석
        pattern: () => {
            if (stateHistory.length < 2) {
                console.warn('Not enough data for pattern analysis');
                return;
            }
            
            // 간격 분석
            const intervals = [];
            for (let i = 1; i < stateHistory.length; i++) {
                intervals.push({
                    interval: (stateHistory[i].elapsed - stateHistory[i-1].elapsed).toFixed(2),
                    at: stateHistory[i].time
                });
            }
            
            console.warn('=== Interval Pattern ===');
            console.table(intervals.slice(-10));
            
            // 주기성 검사
            const roundedIntervals = intervals.map(i => Math.round(parseFloat(i.interval)));
            const counts = {};
            roundedIntervals.forEach(i => counts[i] = (counts[i] || 0) + 1);
            
            console.warn('=== Interval Frequency ===');
            Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .forEach(([interval, count]) => {
                    console.warn(`${interval}s interval: ${count} times`);
                });
        }
    };
    
    console.warn('🔍 State Monitor Debug Tool Loaded!');
    console.warn('Commands:');
    console.warn('  debugState.history()  - Show recent changes');
    console.warn('  debugState.summary()  - Show statistics');
    console.warn('  debugState.pattern()  - Analyze patterns');
    console.warn('  debugState.reset()    - Reset monitoring');
})();