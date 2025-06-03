// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/modals/*.tsx
// Location: frontend/src/components/CodeEditor.tsx

import React, { useState, useEffect } from 'react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readOnly?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ 
  value, 
  onChange, 
  language = 'python', 
  readOnly = false 
}) => {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    setLines(value.split('\n'));
  }, [value]);

  return (
    <div className="flex h-full bg-gray-900 text-gray-100 font-mono text-sm">
      <div className="w-12 bg-gray-800 p-2 text-gray-500 select-none">
        {lines.map((_, i) => (
          <div key={i} className="text-right">{i + 1}</div>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-gray-900 p-2 outline-none resize-none"
        spellCheck={false}
        placeholder={`# Enter ${language} code here...`}
        readOnly={readOnly}
      />
    </div>
  );
};