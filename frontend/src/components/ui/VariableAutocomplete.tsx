import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import api from '../../utils/api';

interface Variable {
  name: string;
  value: any;
  type: string;
  description?: string;
}

interface VariableAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectVariable: (variable: Variable) => void;
}

export const VariableAutocomplete: React.FC<VariableAutocompleteProps> = ({
  value,
  onChange,
  onSelectVariable
}) => {
  const [suggestions, setSuggestions] = useState<Variable[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const debouncedValue = useDebounce(value, 300);

  useEffect(() => {
    const fetchVariables = async () => {
      // $ 기호 감지
      const match = debouncedValue.match(/\$(\w*)$/);
      if (match) {
        const query = match[1];
        try {
          const response = await api.variables.search(query);
          setSuggestions(response.data);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Failed to fetch variables:', error);
        }
      } else {
        setShowSuggestions(false);
      }
    };

    fetchVariables();
  }, [debouncedValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          selectVariable(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  const selectVariable = (variable: Variable) => {
    const newValue = value.replace(/\$\w*$/, `$${variable.name}`);
    onChange(newValue);
    onSelectVariable(variable);
    setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full p-3 bg-gray-800 text-gray-300 text-sm font-mono resize-none outline-none"
        placeholder="Type $ to reference variables..."
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
          {suggestions.map((variable, idx) => (
            <div
              key={variable.name}
              onClick={() => selectVariable(variable)}
              className={`px-3 py-2 cursor-pointer transition-colors ${
                idx === selectedIndex 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono">${variable.name}</span>
                <span className="text-xs opacity-70">{variable.type}</span>
              </div>
              {variable.description && (
                <div className="text-xs opacity-70 mt-1">{variable.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};