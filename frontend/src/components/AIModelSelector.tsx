// frontend/src/components/AIModelSelector.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Link, CheckCircle, AlertCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { LMStudioModel } from '../types';

interface AIModelSelectorProps {
  value: string;
  lmStudioUrl?: string;
  lmStudioConnectionId?: string;
  onChange: (model: string, lmStudioUrl?: string, connectionId?: string) => void;
}

export const AIModelSelector: React.FC<AIModelSelectorProps> = ({
  value,
  lmStudioUrl = '',
  lmStudioConnectionId,
  onChange
}) => {
  const [localUrl, setLocalUrl] = useState(lmStudioUrl || 'http://localhost:1234');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [connectionError, setConnectionError] = useState<string>('');
  const [models, setModels] = useState<LMStudioModel[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [retryTimeoutId, setRetryTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const connectWithRetry = useCallback(async (url: string, attempt: number = 1): Promise<boolean> => {
    try {
      const response = await apiClient.connectLMStudio(url);
      
      if (response.data.success) {
        setModels(response.data.models);
        setConnectionStatus('connected');
        setRetryCount(0);
        
        // If no model selected yet, select the first available model
        if (!value || value === 'none') {
          const firstModel = response.data.models[0];
          if (firstModel) {
            onChange(firstModel.id, response.data.url, response.data.connectionId);
          } else {
            onChange('none', response.data.url, response.data.connectionId);
          }
        } else {
          onChange(value, response.data.url, response.data.connectionId);
        }
        
        return true; // 연결 성공
      }
      return false;
    } catch (error: any) {
      console.error(`Connection attempt ${attempt} failed:`, error);
      
      // 재시도 로직
      if (attempt < 5) {
        let delay = 0;
        if (attempt === 1) {
          delay = 0; // 즉시 재시도
        } else if (attempt === 2) {
          delay = 0; // 즉시 재시도
        } else if (attempt === 3) {
          delay = 3000; // 3초 후
        } else if (attempt === 4) {
          delay = 5000; // 5초 후
        } else if (attempt === 5) {
          delay = 15000; // 15초 후
        }
        
        if (delay === 0) {
          // 즉시 재시도
          return await connectWithRetry(url, attempt + 1);
        } else {
          // 지연 재시도
          setRetryCount(attempt);
          const timeoutId = setTimeout(async () => {
            const success = await connectWithRetry(url, attempt + 1);
            if (!success && attempt === 4) {
              // 마지막 시도 실패
              setConnectionStatus('error');
              setConnectionError(
                'Cannot connect to LM Studio after 5 attempts. Please make sure LM Studio is running.'
              );
              setRetryCount(0);
            }
          }, delay);
          setRetryTimeoutId(timeoutId);
          return false;
        }
      } else {
        // 모든 재시도 실패
        setConnectionStatus('error');
        setConnectionError(
          'Cannot connect to LM Studio after 5 attempts. Please make sure LM Studio is running.'
        );
        setRetryCount(0);
        return false;
      }
    }
  }, [value, onChange]);

  const handleConnect = useCallback(async () => {
    // 이전 재시도 타이머 취소
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      setRetryTimeoutId(null);
    }
    
    setIsConnecting(true);
    setConnectionStatus('connecting');
    setConnectionError('');
    setRetryCount(0);

    await connectWithRetry(localUrl);
    
    setIsConnecting(false);
  }, [localUrl, connectWithRetry, retryTimeoutId]);

  useEffect(() => {
    // 컴포넌트 언마운트 시 타이머 정리
    return () => {
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [retryTimeoutId]);

  useEffect(() => {
    // If already connected, load models
    if (lmStudioConnectionId && lmStudioUrl) {
      setLocalUrl(lmStudioUrl);
      apiClient.getLMStudioModels(lmStudioConnectionId)
        .then(res => {
          setModels(res.data.models);
          setConnectionStatus('connected');
        })
        .catch(() => {
          // Connection expired
          setConnectionStatus('disconnected');
        });
    }
  }, [lmStudioConnectionId, lmStudioUrl]);

  const handleModelChange = (modelId: string) => {
    // 모델 선택 시 즉시 onChange 호출하여 자동 저장
    onChange(modelId, localUrl, lmStudioConnectionId);
  };

  return (
    <div className="space-y-3">
      {/* LM Studio Connection */}
      <div className="border rounded-lg p-3 bg-gray-50">
        <label className="block text-sm font-medium mb-2">Connect with LM Studio</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder="http://localhost:1234"
            className="flex-1 border rounded px-3 py-2 text-sm"
            disabled={isConnecting || connectionStatus === 'connected'}
          />
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className={`px-4 py-2 rounded flex items-center gap-2 text-sm ${
              connectionStatus === 'connected'
                ? 'bg-green-500 text-white hover:bg-green-600'
                : isConnecting
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {retryCount > 0 ? `Retry ${retryCount}/5...` : 'Connecting...'}
              </>
            ) : connectionStatus === 'connected' ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Reconnect
              </>
            ) : (
              <>
                <Link className="w-4 h-4" />
                Connect
              </>
            )}
          </button>
        </div>
        
        {connectionError && (
          <div className="mt-2 flex items-start gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{connectionError}</span>
          </div>
        )}
        
        {connectionStatus === 'connected' && models.length > 0 && (
          <div className="mt-2 text-green-600 text-sm">
            Found {models.length} model{models.length !== 1 ? 's' : ''} in LM Studio
          </div>
        )}
      </div>

      {/* Model Selection */}
      <div>
        <label className="block text-sm font-medium mb-1">Select Model</label>
        {connectionStatus === 'connected' ? (
          <select
            value={value || 'none'}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="none">No Model Selected</option>
            {models.map(model => (
              <option key={`lmstudio-${model.id}`} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-500">
            No server connection available
          </div>
        )}
      </div>

      {/* Model Info */}
      {value && value !== 'none' && connectionStatus === 'connected' && (
        <div className="text-xs text-gray-600 p-2 bg-gray-100 rounded">
          <span className="font-medium">LM Studio Model:</span> {value}
          <br />
          <span className="font-medium">Endpoint:</span> {localUrl}
        </div>
      )}
    </div>
  );
};