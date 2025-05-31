// frontend/src/components/realtime/GlobalVariableMonitor.jsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Variable, RefreshCw, Search, Filter, Download, Upload,
  Edit2, Trash2, Plus, Copy, Eye, EyeOff, Database
} from 'lucide-react';
import { useWebSocket } from './WebSocketProvider';

const VariableRow = ({ variable, onEdit, onDelete, onCopy, isExpanded, onToggle }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(variable.value);

  const handleSave = () => {
    onEdit(variable.key, editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(variable.value);
    setIsEditing(false);
  };

  const formatValue = (value) => {
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const getValuePreview = (value) => {
    const formatted = formatValue(value);
    if (formatted.length > 50) {
      return formatted.substring(0, 50) + '...';
    }
    return formatted;
  };

  const getTypeColor = (type) => {
    const colors = {
      string: 'text-green-400',
      number: 'text-blue-400',
      boolean: 'text-yellow-400',
      object: 'text-purple-400',
      array: 'text-pink-400',
      null: 'text-gray-400',
    };
    return colors[type] || 'text-gray-400';
  };

  return (
    <>
      <tr className="hover:bg-gray-800/50 transition-colors">
        <td className="px-4 py-3 text-sm font-mono text-gray-300">
          {variable.key}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs font-medium ${getTypeColor(variable.type)}`}>
            {variable.type}
          </span>
        </td>
        <td className="px-4 py-3 text-sm">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded 
                         text-gray-200 text-sm focus:border-blue-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
              />
              <button
                onClick={handleSave}
                className="text-green-400 hover:text-green-300"
              >
                ✓
              </button>
              <button
                onClick={handleCancel}
                className="text-red-400 hover:text-red-300"
              >
                ✗
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-gray-300 font-mono text-xs">
                {isExpanded && variable.type === 'object' ? (
                  <pre className="whitespace-pre-wrap">{formatValue(variable.value)}</pre>
                ) : (
                  getValuePreview(variable.value)
                )}
              </span>
              {(variable.type === 'object' || variable.type === 'array') && (
                <button
                  onClick={() => onToggle(variable.key)}
                  className="ml-2 text-gray-500 hover:text-gray-300"
                >
                  {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {variable.source || 'manual'}
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {new Date(variable.updatedAt).toLocaleTimeString()}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 text-gray-400 hover:text-blue-400 transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onCopy(variable.key)}
              className="p-1 text-gray-400 hover:text-green-400 transition-colors"
              title="Copy"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(variable.key)}
              className="p-1 text-gray-400 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    </>
  );
};

const AddVariableModal = ({ isOpen, onClose, onAdd }) => {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState('string');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    let parsedValue = value;
    try {
      if (type === 'number') {
        parsedValue = Number(value);
      } else if (type === 'boolean') {
        parsedValue = value.toLowerCase() === 'true';
      } else if (type === 'object' || type === 'array') {
        parsedValue = JSON.parse(value);
      }
    } catch (error) {
      alert('Invalid value format for selected type');
      return;
    }

    onAdd(key, parsedValue, type);
    setKey('');
    setValue('');
    setType('string');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
        <h3 className="text-lg font-semibold text-gray-200 mb-4">Add Variable</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Key
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
                pattern="^[a-zA-Z_][a-zA-Z0-9_]*$"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded 
                         text-gray-200 focus:border-blue-500 focus:outline-none"
                placeholder="variable_name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded 
                         text-gray-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="object">Object (JSON)</option>
                <option value="array">Array (JSON)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Value
              </label>
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                rows={type === 'object' || type === 'array' ? 5 : 2}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded 
                         text-gray-200 focus:border-blue-500 focus:outline-none font-mono text-sm"
                placeholder={
                  type === 'object' ? '{"key": "value"}' :
                  type === 'array' ? '["item1", "item2"]' :
                  'Enter value...'
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              Add Variable
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const GlobalVariableMonitor = ({ 
  className = '',
  refreshInterval = 5000,
  onVariableChange,
}) => {
  const { on, off, send } = useWebSocket();
  const [variables, setVariables] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [expandedVars, setExpandedVars] = useState(new Set());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Load variables
  const loadVariables = useCallback(() => {
    send({ type: 'get_variables' });
  }, [send]);

  // Handle variable updates
  const handleVariableUpdate = useCallback((data) => {
    if (data.variables) {
      setVariables(data.variables);
      setLastUpdate(new Date());
    } else if (data.variable) {
      // Single variable update
      setVariables((prev) => {
        const existing = prev.find((v) => v.key === data.variable.key);
        if (existing) {
          return prev.map((v) => 
            v.key === data.variable.key ? data.variable : v
          );
        }
        return [...prev, data.variable];
      });
      setLastUpdate(new Date());
    }

    if (onVariableChange) {
      onVariableChange(data);
    }
  }, [onVariableChange]);

  // Variable operations
  const handleEdit = useCallback((key, value) => {
    send({
      type: 'set_variable',
      key,
      value,
    });
  }, [send]);

  const handleDelete = useCallback((key) => {
    if (confirm(`Delete variable "${key}"?`)) {
      send({
        type: 'delete_variable',
        key,
      });
    }
  }, [send]);

  const handleCopy = useCallback((key) => {
    const variable = variables.find((v) => v.key === key);
    if (variable) {
      navigator.clipboard.writeText(JSON.stringify(variable.value));
    }
  }, [variables]);

  const handleAdd = useCallback((key, value, type) => {
    send({
      type: 'set_variable',
      key,
      value,
      metadata: { type },
    });
  }, [send]);

  const handleExport = useCallback(() => {
    const data = JSON.stringify(variables, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `variables_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [variables]);

  const handleImport = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported)) {
            imported.forEach((v) => {
              send({
                type: 'set_variable',
                key: v.key,
                value: v.value,
              });
            });
          }
        } catch (error) {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
  }, [send]);

  // Toggle expanded state
  const toggleExpanded = useCallback((key) => {
    setExpandedVars((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Filter variables
  const filteredVariables = useMemo(() => {
    return variables.filter((v) => {
      const matchesSearch = v.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          JSON.stringify(v.value).toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || v.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [variables, searchTerm, filterType]);

  useEffect(() => {
    on('variables_update', handleVariableUpdate);
    on('variable_set', handleVariableUpdate);
    on('variable_deleted', (data) => {
      setVariables((prev) => prev.filter((v) => v.key !== data.key));
    });

    loadVariables();

    const interval = setInterval(loadVariables, refreshInterval);

    return () => {
      off('variables_update', handleVariableUpdate);
      off('variable_set', handleVariableUpdate);
      off('variable_deleted');
      clearInterval(interval);
    };
  }, [on, off, handleVariableUpdate, loadVariables, refreshInterval]);

  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-800 ${className}`}>
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <Database className="w-5 h-5" />
            Global Variables
            <span className="text-sm font-normal text-gray-500">
              ({filteredVariables.length})
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={loadVariables}
              className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="p-2 text-gray-400 hover:text-green-400 transition-colors"
              title="Add Variable"
            >
              <Plus className="w-4 h-4" />
            </button>
            <label className="p-2 text-gray-400 hover:text-blue-400 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
            <button
              onClick={handleExport}
              className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
              title="Export"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search variables..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded 
                       text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 
                     focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="string">String</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="object">Object</option>
            <option value="array">Array</option>
          </select>
        </div>

        {lastUpdate && (
          <div className="mt-2 text-xs text-gray-500">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Key
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Value
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Source
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Updated
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filteredVariables.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  <Variable className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No variables found</p>
                </td>
              </tr>
            ) : (
              filteredVariables.map((variable) => (
                <VariableRow
                  key={variable.key}
                  variable={variable}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onCopy={handleCopy}
                  isExpanded={expandedVars.has(variable.key)}
                  onToggle={toggleExpanded}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddVariableModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAdd}
      />
    </div>
  );
};