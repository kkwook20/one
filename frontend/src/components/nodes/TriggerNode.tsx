import React, { useState, memo, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import { Zap, Webhook, Calendar } from 'lucide-react';
import { BaseNode } from './BaseNode';
import useWorkflowStore from '../../stores/workflowStore';

const TriggerNode = memo(({ data, id, selected }: NodeProps) => {
  const [showEditor, setShowEditor] = useState(false);
  const { updateNodeData } = useWorkflowStore();

  const taskItems = data.events?.map((event: any) => ({
    id: event.id,
    text: event.name,
    status: event.active ? 'active' : 'skip' as any
  })) || [];

  const handleEdit = useCallback(() => {
    setShowEditor(true);
  }, []);

  const getWebhookUrl = () => {
    return data.webhookId ? 
      `${window.location.origin}/webhook/${data.webhookId}` : 
      'Not configured';
  };

  return (
    <>
      <BaseNode
        id={id}
        data={data}
        selected={selected}
        nodeType="trigger"
        nodeColor="#f97316"
        taskItems={taskItems}
        onEdit={handleEdit}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-semibold">Trigger Node</span>
            <Zap className="w-4 h-4 text-orange-400" />
          </div>
          
          <div className="text-xs text-gray-400">
            {data.events?.length || 0} 이벤트 활성화
          </div>
          
          {data.webhookId && (
            <div className="mt-2 p-1.5 bg-gray-700 rounded text-xs text-gray-300 truncate">
              <Webhook className="w-3 h-3 inline mr-1" />
              {getWebhookUrl()}
            </div>
          )}
        </div>
      </BaseNode>

      {/* Trigger 에디터 모달 */}
      {showEditor && (
        <TriggerEditor
          nodeId={id}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  );
});

// Trigger 에디터
const TriggerEditor: React.FC<{ nodeId: string; onClose: () => void }> = ({ 
  nodeId, 
  onClose 
}) => {
  const { nodes, updateNodeData } = useWorkflowStore();
  const node = nodes.find(n => n.id === nodeId);
  
  const [webhookId] = useState(node?.data?.webhookId || `webhook-${Date.now()}`);
  const [events, setEvents] = useState(node?.data?.events || []);
  const [newEventName, setNewEventName] = useState('');
  const [newEventType, setNewEventType] = useState('webhook');

  const handleAddEvent = () => {
    if (newEventName) {
      const newEvent = {
        id: Date.now().toString(),
        name: newEventName,
        type: newEventType,
        active: true,
        conditions: []
      };
      setEvents([...events, newEvent]);
      setNewEventName('');
    }
  };

  const handleSave = () => {
    updateNodeData(nodeId, { webhookId, events });
    onClose();
  };

  const toggleEvent = (eventId: string) => {
    setEvents(events.map((e: any) => 
      e.id === eventId ? { ...e, active: !e.active } : e
    ));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl bg-gray-900 rounded-lg shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Trigger Configuration</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">×</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Webhook URL */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Webhook URL
            </label>
            <div className="flex items-center gap-2 p-3 bg-gray-800 rounded">
              <Webhook className="w-4 h-4 text-orange-400" />
              <code className="text-sm text-gray-300 flex-1">
                {window.location.origin}/webhook/{webhookId}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/webhook/${webhookId}`)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                복사
              </button>
            </div>
          </div>

          {/* 이벤트 추가 */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">트리거 이벤트</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="이벤트 이름"
                className="flex-1 px-3 py-2 bg-gray-800 text-gray-300 rounded outline-none"
              />
              <select
                value={newEventType}
                onChange={(e) => setNewEventType(e.target.value)}
                className="px-3 py-2 bg-gray-800 text-gray-300 rounded outline-none"
              >
                <option value="webhook">Webhook</option>
                <option value="schedule">Schedule</option>
                <option value="watch">File Watch</option>
              </select>
              <button
                onClick={handleAddEvent}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
              >
                추가
              </button>
            </div>
          </div>

          {/* 이벤트 목록 */}
          {events.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">등록된 이벤트</h3>
              <div className="space-y-2">
                {events.map((event: any) => (
                  <div key={event.id} className="bg-gray-800 rounded p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleEvent(event.id)}
                          className={`w-4 h-4 rounded ${
                            event.active ? 'bg-green-500' : 'bg-gray-600'
                          }`}
                        />
                        <span className="text-sm text-white">{event.name}</span>
                        <span className="text-xs text-gray-400 px-2 py-1 bg-gray-700 rounded">
                          {event.type}
                        </span>
                      </div>
                      <button
                        onClick={() => setEvents(events.filter((e: any) => e.id !== event.id))}
                        className="text-red-400 hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
};

TriggerNode.displayName = 'TriggerNode';

export default TriggerNode;