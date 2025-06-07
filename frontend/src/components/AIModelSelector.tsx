// frontend/src/components/AIModelSelector.tsx
import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    // If already connected, load models
    if (lmStudioConnectionId) {
      apiClient.getLMStudioModels(lmStudioConnectionId)
        .then(res => {
          setModels(res.data.models);
          setConnectionStatus('connected');
        })
        .catch(() => {
          setConnectionStatus('disconnected');
        });
    }
  }, [lmStudioConnectionId]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectionStatus('connecting');
    setConnectionError('');

    try {
      const response = await apiClient.connectLMStudio(localUrl);
      
      if (response.data.success) {
        setModels(response.data.models);
        setConnectionStatus('connected');
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
      }
    } catch (error: any) {
      setConnectionStatus('error');
      setConnectionError(
        error.response?.data?.detail || 
        'Failed to connect. Make sure LM Studio is running.'
      );
      console.error('LM Studio connection error:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleModelChange = (modelId: string) => {
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
            disabled={isConnecting}
          />
          <button
            onClick={handleConnect}
            disabled={isConnecting || connectionStatus === 'connected'}
            className={`px-4 py-2 rounded flex items-center gap-2 text-sm ${
              connectionStatus === 'connected'
                ? 'bg-green-500 text-white cursor-not-allowed'
                : isConnecting
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : connectionStatus === 'connected' ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Connected
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
      {connectionStatus === 'connected' && (
        <div>
          <label className="block text-sm font-medium mb-1">Select Model</label>
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
        </div>
      )}

      {/* Model Info */}
      {value && value !== 'none' && connectionStatus === 'connected' && (
        <div className="text-xs text-gray-600 p-2 bg-gray-100 rounded">
          <span className="font-medium">LM Studio Model:</span> {value}
          <br />
          <span className="font-medium">Endpoint:</span> {localUrl}
        </div>
      )}

      {/* Not Connected Info */}
      {connectionStatus === 'disconnected' && !isConnecting && (
        <div className="text-sm text-gray-500 italic">
          Connect to LM Studio to select AI models
        </div>
      )}
    </div>
  );
};