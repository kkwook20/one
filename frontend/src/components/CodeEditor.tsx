// Related files:
// - frontend/src/App.tsx
// - frontend/src/components/modals/*.tsx
// Location: frontend/src/components/CodeEditor.tsx

import React from 'react';
import MonacoEditor from '@monaco-editor/react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  theme?: 'light' | 'dark';
  height?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ 
  value, 
  onChange, 
  language = 'python', 
  readOnly = false,
  theme = 'dark',  // 기본값을 dark로 변경
  height = '100%'
}) => {
  const handleEditorChange = (value: string | undefined) => {
    onChange(value || '');
  };

  const getMonacoTheme = () => {
    // 항상 dark 테마 사용
    return 'vs-dark';
  };

  const getLanguage = () => {
    // Map common language names to Monaco language IDs
    const languageMap: { [key: string]: string } = {
      'python': 'python',
      'javascript': 'javascript',
      'js': 'javascript',
      'typescript': 'typescript',
      'ts': 'typescript',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'sql': 'sql',
      'yaml': 'yaml',
      'xml': 'xml',
      'markdown': 'markdown',
      'md': 'markdown'
    };
    
    return languageMap[language.toLowerCase()] || 'plaintext';
  };

  return (
    <div className="h-full w-full overflow-hidden">
      <MonacoEditor
        height={height}
        language={getLanguage()}
        theme={getMonacoTheme()}
        value={value}
        onChange={handleEditorChange}
        options={{
          readOnly: readOnly,
          fontSize: 14,  // 한글 가독성을 위해 15px
          fontFamily: "'JetBrains Mono', 'Consolas', 'Malgun Gothic', monospace",
          fontLigatures: false,
          fontWeight: '400',
          lineHeight: 20,     // 한글을 위해 줄 높이 증가 (fontSize * 1.6)
          letterSpacing: -0.2,   // 약간의 자간 추가
          minimap: { 
            enabled: true,
            showSlider: 'mouseover',
            scale: 1,
          },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          lineNumbers: 'on',
          renderWhitespace: 'none',  // VS Code 기본값
          bracketPairColorization: { 
            enabled: true,
            independentColorPoolPerBracketType: true
          },
          suggest: {
            showKeywords: !readOnly,
            showSnippets: !readOnly,
            showClasses: !readOnly,
            showFunctions: !readOnly,
            showVariables: !readOnly,
          },
          quickSuggestions: readOnly ? false : {
            other: true,
            comments: false,
            strings: false
          },
          parameterHints: {
            enabled: !readOnly,
          },
          formatOnPaste: !readOnly,
          formatOnType: !readOnly,
          tabSize: 4,
          insertSpaces: true,
          trimAutoWhitespace: true,
          autoIndent: 'full',
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'mouseover',
          renderLineHighlight: 'all',
          cursorStyle: 'line',
          cursorBlinking: 'smooth',  // VS Code 스타일
          cursorSmoothCaretAnimation: 'on',
          cursorWidth: 2,
          smoothScrolling: true,
          mouseWheelZoom: true,
          contextmenu: true,
          accessibilitySupport: 'auto',
          autoClosingBrackets: 'languageDefined',
          autoClosingQuotes: 'languageDefined',
          autoSurround: 'languageDefined',
          copyWithSyntaxHighlighting: true,
          dragAndDrop: !readOnly,
          emptySelectionClipboard: false,
          find: {
            seedSearchStringFromSelection: 'selection' as const,
            autoFindInSelection: 'multiline',
          },
          fixedOverflowWidgets: true,
          gotoLocation: {
            multipleDefinitions: 'goto',
            multipleTypeDefinitions: 'goto',
            multipleDeclarations: 'goto',
            multipleImplementations: 'goto',
            multipleReferences: 'goto',
          },
          hideCursorInOverviewRuler: false,
          inlineSuggest: {
            enabled: !readOnly
          },
          links: true,
          matchBrackets: 'always',
          overviewRulerBorder: false,
          overviewRulerLanes: 3,
          renderControlCharacters: false,
          renderValidationDecorations: 'on',
          roundedSelection: true,  // VS Code 스타일 선택 영역
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            useShadows: false,  // VS Code는 그림자 없음
            verticalHasArrows: false,
            horizontalHasArrows: false,
            verticalScrollbarSize: 14,  // VS Code 크기
            horizontalScrollbarSize: 14,
            arrowSize: 30,
          },
          selectOnLineNumbers: true,
          showUnused: true,
          snippetSuggestions: readOnly ? 'none' : 'inline',
          suggestOnTriggerCharacters: !readOnly,
          suggestSelection: 'first',
          tabCompletion: readOnly ? 'off' : 'on',
          wordBasedSuggestions: readOnly ? 'off' : 'currentDocument' as const,
          wordSeparators: '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?',
          wordWrapBreakAfterCharacters: '\t})]?|/&,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ"〉》」』】〕）］｝｣',
          wordWrapBreakBeforeCharacters: '!%),.:;?]}`|&\'"\\/→•‣․‥…※‼⁇⁈⁉℃℉∅∆∑∞♀♂♩♪♫♬♭♮♯⟨⟩。〈《「『【〔（［｛｢',
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-[#1e1e1e]">
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mb-3"></div>
              <div className="text-gray-400 text-sm">Initializing editor...</div>
            </div>
          </div>
        }
      />
    </div>
  );
};