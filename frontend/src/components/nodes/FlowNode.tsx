// FlowNode.tsx 상단에 ExecutionPopup 컴포넌트 추가

const ExecutionPopup: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  flowNodeId: string;
  executionList: any[];
}> = ({ isOpen, onClose, flowNodeId, executionList }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [currentNode, setCurrentNode] = useState<string>('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isOpen) {
      // WebSocket으로 실행 상태 구독
      // 실시간 로그 업데이트
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl bg-gray-900 rounded-lg shadow-2xl">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Workflow Execution</h2>
        </div>
        
        <div className="p-4">
          {/* 진행률 바 */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* 현재 실행 중인 노드 */}
          {currentNode && (
            <div className="mb-4 p-3 bg-gray-800 rounded">
              <div className="text-sm text-gray-400">Executing:</div>
              <div className="text-white font-medium">{currentNode}</div>
            </div>
          )}

          {/* 실행 로그 */}
          <div className="h-64 bg-gray-800 rounded p-3 overflow-y-auto">
            <div className="space-y-1">
              {logs.map((log, idx) => (
                <div key={idx} className="text-xs text-gray-400 font-mono">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// FlowNode 컴포넌트에 팝업 상태 추가
const [showExecutionPopup, setShowExecutionPopup] = useState(false);

// handleExecute 함수 수정
const handleExecute = useCallback(() => {
  if (isRunning) {
    stopExecution(id);
    setIsRunning(false);
  } else {
    setIsRunning(true);
    setShowExecutionPopup(true); // 팝업 열기
    const nodeIds = executionList.map(item => item.nodeId);
    executeFlow(id, nodeIds);
  }
}, [isRunning, id, executionList, executeFlow, stopExecution]);

// return 문 마지막에 팝업 추가
return (
  <>
    <BaseNode ...>
      {/* 기존 내용 */}
    </BaseNode>
    
    <ExecutionPopup
      isOpen={showExecutionPopup}
      onClose={() => setShowExecutionPopup(false)}
      flowNodeId={id}
      executionList={executionList}
    />
  </>
);