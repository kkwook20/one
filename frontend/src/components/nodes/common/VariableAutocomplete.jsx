// frontend/src/components/nodes/common/VariableAutocomplete.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Variable, Hash, Type, List, Calendar, FileText } from 'lucide-react';

const VariableAutocomplete = ({ 
  value, 
  onChange, 
  placeholder = "Type {{ to see variables",
  globalVariables = {},
  className = ""
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Default global variables if none provided
  const defaultVariables = {
    'workflow.id': { type: 'string', value: 'wf-123', description: 'Current workflow ID' },
    'workflow.name': { type: 'string', value: 'Data Pipeline', description: 'Workflow name' },
    'execution.timestamp': { type: 'date', value: new Date().toISOString(), description: 'Execution start time' },
    'execution.user': { type: 'string', value: 'admin', description: 'User who triggered execution' },
    'node.id': { type: 'string', value: 'node-456', description: 'Current node ID' },
    'node.type': { type: 'string', value: 'worker', description: 'Current node type' },
    'env.debug': { type: 'boolean', value: true, description: 'Debug mode flag' },
    'env.maxRetries': { type: 'number', value: 3, description: 'Maximum retry attempts' },
    ...globalVariables
  };

  const getTypeIcon = (type) => {
    const icons = {
      string: <Type className="w-3 h-3" />,
      number: <Hash className="w-3 h-3" />,
      boolean: <Variable className="w-3 h-3" />,
      array: <List className="w-3 h-3" />,
      object: <FileText className="w-3 h-3" />,
      date: <Calendar className="w-3 h-3" />
    };
    return icons[type] || <Variable className="w-3 h-3" />;
  };

  const getTypeColor = (type) => {
    const colors = {
      string: 'text-green-400',
      number: 'text-blue-400',
      boolean: 'text-purple-400',
      array: 'text-yellow-400',
      object: 'text-orange-400',
      date: 'text-pink-400'
    };
    return colors[type] || 'text-gray-400';
  };

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart;
    onChange(newValue);
    setCursorPosition(newCursorPos);

    // Check if user typed {{
    const textBeforeCursor = newValue.substring(0, newCursorPos);
    const lastBraces = textBeforeCursor.lastIndexOf('{{');
    
    if (lastBraces !== -1 && textBeforeCursor.substring(lastBraces).indexOf('}}') === -1) {
      // We're inside {{ }}
      const searchText = textBeforeCursor.substring(lastBraces + 2).trim();
      setSearchTerm(searchText);
      setShowSuggestions(true);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions) return;

    const filteredVars = getFilteredVariables();
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredVars.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (filteredVars[selectedIndex]) {
          insertVariable(filteredVars[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  const getFilteredVariables = () => {
    return Object.entries(defaultVariables)
      .filter(([key]) => key.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(([key, data]) => ({ key, ...data }));
  };

  const insertVariable = (variable) => {
    const textBeforeCursor = value.substring(0, cursorPosition);
    const textAfterCursor = value.substring(cursorPosition);
    const lastBraces = textBeforeCursor.lastIndexOf('{{');
    
    if (lastBraces !== -1) {
      const newValue = 
        value.substring(0, lastBraces) + 
        `{{ ${variable.key} }}` + 
        textAfterCursor;
      
      onChange(newValue);
      setShowSuggestions(false);
      
      // Set cursor after the inserted variable
      setTimeout(() => {
        const newPos = lastBraces + `{{ ${variable.key} }}`.length;
        inputRef.current.setSelectionRange(newPos, newPos);
        inputRef.current.focus();
      }, 0);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (showSuggestions && suggestionsRef.current) {
      const selectedElement = suggestionsRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, showSuggestions]);

  const filteredVariables = getFilteredVariables();

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full bg-gray-700 text-gray-100 rounded px-3 py-2 pr-10 outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      />
      
      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500">
        <Variable className="w-4 h-4" />
      </div>

      {showSuggestions && filteredVariables.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          <div className="p-2 border-b border-gray-700">
            <p className="text-xs text-gray-400">Available Variables</p>
          </div>
          <div ref={suggestionsRef} className="py-1">
            {filteredVariables.map((variable, index) => (
              <button
                key={variable.key}
                onClick={() => insertVariable(variable)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full px-3 py-2 text-left flex items-start gap-3 transition-colors ${
                  index === selectedIndex ? 'bg-gray-700' : 'hover:bg-gray-700/50'
                }`}
              >
                <div className={`mt-0.5 ${getTypeColor(variable.type)}`}>
                  {getTypeIcon(variable.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">
                      {variable.key}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeColor(variable.type)} bg-gray-700`}>
                      {variable.type}
                    </span>
                  </div>
                  {variable.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{variable.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
                    {JSON.stringify(variable.value)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VariableAutocomplete;