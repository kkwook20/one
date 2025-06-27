// frontend/src/utils/codeMerger.ts

// 충돌 정보 타입
export interface ConflictInfo {
  type: 'removed' | 'modified';
  originalCode: string;
  resolvedCode: string;
  reason: string;
  lineNumbers: { start: number; end: number };
}

// 병합 결과 타입
export interface MergeResult {
  mergedCode: string;
  conflicts: ConflictInfo[];
}

// 병합 옵션 타입
export interface MergeOptions {
  projectRoot: string;
  baseCodeContent: string;
  expCode: string;
  isLoadingTemplate?: boolean;
}

/**
 * Base Code와 Exp Code를 병합하고 충돌을 감지/해결하는 함수
 */
export function detectAndResolveConflicts(
  baseCode: string, 
  expCode: string, 
  projectRoot: string
): MergeResult {
  const conflicts: ConflictInfo[] = [];
  let resolvedExpCode = expCode;
  
  // 1. AI 모델 호출 중복 감지
  if (expCode.includes('call_ai_model') || expCode.includes('requests.post')) {
    conflicts.push({
      type: 'removed',
      originalCode: 'AI model call in exp code',
      resolvedCode: 'Using base code AI call',
      reason: 'AI model calls are handled by base code',
      lineNumbers: { start: 0, end: 0 }
    });
    // AI 호출 관련 코드 제거
    resolvedExpCode = resolvedExpCode.replace(/.*call_ai_model.*\n?/g, '');
    resolvedExpCode = resolvedExpCode.replace(/.*requests\.post.*lm[-_]studio.*\n?/g, '');
  }
  
  // 2. 중복 import 제거
  const baseImports = baseCode.match(/^import .*/gm) || [];
  const expImports = resolvedExpCode.match(/^import .*/gm) || [];
  expImports.forEach(expImport => {
    if (baseImports.some(baseImport => baseImport.trim() === expImport.trim())) {
      conflicts.push({
        type: 'removed',
        originalCode: expImport,
        resolvedCode: 'Already imported in base code',
        reason: 'Duplicate import statement',
        lineNumbers: { start: 0, end: 0 }
      });
      resolvedExpCode = resolvedExpCode.replace(expImport + '\n', '');
    }
  });
  
  // 3. 전역 변수 충돌 감지 - project_root 추가
  const globalVarPattern = /^(model_name|lm_studio_url|project_root|current_node|input_data|combined_input|base_prompt)\s*=/gm;
  const matches = resolvedExpCode.match(globalVarPattern);
  if (matches) {
    matches.forEach(match => {
      // project_root는 제거하고 주석 처리
      if (match.includes('project_root')) {
        conflicts.push({
          type: 'removed',
          originalCode: match,
          resolvedCode: '# Removed - project_root is provided by execution environment',
          reason: 'project_root must not be overridden',
          lineNumbers: { start: 0, end: 0 }
        });
        // project_root 할당문 완전히 제거
        const linePattern = new RegExp(`^.*${match}.*$`, 'gm');
        resolvedExpCode = resolvedExpCode.replace(linePattern, '');
      } else {
        conflicts.push({
          type: 'modified',
          originalCode: match,
          resolvedCode: `# ${match} # Commented out - already defined in base code`,
          reason: 'Variable already defined in base code',
          lineNumbers: { start: 0, end: 0 }
        });
        resolvedExpCode = resolvedExpCode.replace(match, `# ${match} # Commented out - already defined in base code`);
      }
    });
  }
  
  // 4. 함수 재정의 충돌 감지
  const baseFunctions = baseCode.match(/^def\s+(\w+)\s*\(/gm) || [];
  const expFunctions = resolvedExpCode.match(/^def\s+(\w+)\s*\(/gm) || [];
  
  expFunctions.forEach(expFunc => {
    const funcName = expFunc.match(/def\s+(\w+)/)?.[1];
    if (funcName && baseFunctions.some(baseFunc => baseFunc.includes(funcName))) {
      conflicts.push({
        type: 'modified',
        originalCode: expFunc,
        resolvedCode: `# ${expFunc} # Renamed to exp_${funcName} to avoid conflict`,
        reason: `Function '${funcName}' already defined in base code`,
        lineNumbers: { start: 0, end: 0 }
      });
      // 함수명을 exp_ prefix로 변경
      resolvedExpCode = resolvedExpCode.replace(
        new RegExp(`def\\s+${funcName}\\s*\\(`, 'g'),
        `def exp_${funcName}(`
      );
    }
  });
  
  // 5. 클래스 재정의 충돌 감지
  const baseClasses = baseCode.match(/^class\s+(\w+)/gm) || [];
  const expClasses = resolvedExpCode.match(/^class\s+(\w+)/gm) || [];
  
  expClasses.forEach(expClass => {
    const className = expClass.match(/class\s+(\w+)/)?.[1];
    if (className && baseClasses.some(baseClass => baseClass.includes(className))) {
      conflicts.push({
        type: 'modified',
        originalCode: expClass,
        resolvedCode: `# ${expClass} # Renamed to Exp${className} to avoid conflict`,
        reason: `Class '${className}' already defined in base code`,
        lineNumbers: { start: 0, end: 0 }
      });
      // 클래스명을 Exp prefix로 변경
      resolvedExpCode = resolvedExpCode.replace(
        new RegExp(`class\\s+${className}`, 'g'),
        `class Exp${className}`
      );
    }
  });
  
  // 6. 위험한 파일 작업 감지
  const dangerousFileOps = [
    /open\s*\(\s*["']\//,  // 절대 경로로 파일 열기
    /os\.remove/,          // 파일 삭제
    /shutil\.rmtree/,      // 디렉토리 삭제
    /os\.system/,          // 시스템 명령 실행
    /subprocess\./,        // 서브프로세스 실행
  ];
  
  dangerousFileOps.forEach(pattern => {
    const match = resolvedExpCode.match(pattern);
    if (match) {
      conflicts.push({
        type: 'modified',
        originalCode: match[0],
        resolvedCode: `# ${match[0]} # SECURITY: Dangerous operation commented out`,
        reason: 'Potentially dangerous file operation detected',
        lineNumbers: { start: 0, end: 0 }
      });
      resolvedExpCode = resolvedExpCode.replace(pattern, (m) => `# ${m} # SECURITY WARNING`);
    }
  });
  
  // Exp Code가 비어있지 않은 경우에만 처리
  if (resolvedExpCode.trim()) {
    // EXP_CODE_MERGE_POINT를 찾아서 Exp Code 삽입
    const mergePoint = '# EXP_CODE_MERGE_POINT - 이 부분에서 Exp Code가 병합됩니다';
    
    // Base Code에 병합 지점이 있는지 확인
    if (baseCode.includes(mergePoint)) {
      // 들여쓰기 없이 그대로 병합 (전역 스코프 유지)
      const mergedCode = baseCode.replace(mergePoint, `${mergePoint}
    
# ========================================================================
# EXPERIMENTAL CODE - 노드별 특수 처리 로직
# ========================================================================
# IMPORTANT: project_root is already provided by the execution environment
# DO NOT override project_root here!

${resolvedExpCode}

# ========================================================================
# END OF EXPERIMENTAL CODE
# ========================================================================`);
      
      return { mergedCode, conflicts };
    } else {
      // 병합 지점이 없으면 코드 끝에 추가
      const mergedCode = baseCode + `

# ========================================================================
# EXPERIMENTAL CODE (Added at end - no merge point found)
# ========================================================================

${resolvedExpCode}
`;
      
      conflicts.push({
        type: 'modified',
        originalCode: 'N/A',
        resolvedCode: 'Experimental code added at end of file',
        reason: 'EXP_CODE_MERGE_POINT not found in base code',
        lineNumbers: { start: 0, end: 0 }
      });
      
      return { mergedCode, conflicts };
    }
  } else {
    // Exp Code가 비어있으면 Base Code만 반환
    return { mergedCode: baseCode, conflicts };
  }
}

/**
 * Base Code를 생성하는 함수
 */
export function generateBaseCode(baseCodeContent: string): string {
  return baseCodeContent || '# Loading template...';
}

/**
 * Base Code와 Exp Code를 병합하는 메인 함수
 */
export function mergeCode(options: MergeOptions): MergeResult {
  const { baseCodeContent, expCode, projectRoot, isLoadingTemplate } = options;
  
  if (!baseCodeContent || isLoadingTemplate) {
    return { 
      mergedCode: '# Loading...', 
      conflicts: [] 
    };
  }
  
  const baseCode = generateBaseCode(baseCodeContent);
  const expCodeSafe = expCode || '';
  
  // 충돌 감지 및 해결
  const result = detectAndResolveConflicts(baseCode, expCodeSafe, projectRoot);
  
  
  return result;
}

/**
 * 추가적인 Exp Code 검증 함수
 */
export function validateExpCode(expCode: string): { 
  isValid: boolean; 
  errors: string[]; 
  warnings: string[] 
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. project_root 재정의 금지
  if (expCode.match(/^\s*project_root\s*=/m)) {
    errors.push('Cannot redefine project_root. This variable is provided by the execution environment.');
  }
  
  // 2. 무한 루프 가능성 체크
  if (expCode.match(/while\s+True:|while\s+1:/)) {
    warnings.push('Infinite loop detected. Make sure to include break conditions.');
  }
  
  // 3. 메모리 누수 가능성 체크
  if (expCode.match(/\b(global)\s+\w+/)) {
    warnings.push('Global variable usage detected. This may cause memory leaks.');
  }
  
  // 4. 필수 변수 사용 체크
  if (expCode.includes('input_data') && !expCode.includes('if') && !expCode.includes('try')) {
    warnings.push('Using input_data without error checking. Consider adding validation.');
  }
  
  // 5. 문법 기본 검증 (괄호 매칭)
  const openParens = (expCode.match(/\(/g) || []).length;
  const closeParens = (expCode.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push('Parentheses mismatch detected.');
  }
  
  const openBrackets = (expCode.match(/\[/g) || []).length;
  const closeBrackets = (expCode.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push('Brackets mismatch detected.');
  }
  
  const openBraces = (expCode.match(/\{/g) || []).length;
  const closeBraces = (expCode.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push('Braces mismatch detected.');
  }
  
  // 6. 들여쓰기 오류 체크 (Python)
  const lines = expCode.split('\n');
  let indentLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed === '') continue;
    
    // 들여쓰기 레벨 계산
    const currentIndent = line.match(/^(\s*)/)?.[1].length || 0;
    
    // 콜론으로 끝나면 다음 줄은 들여쓰기 증가 예상
    if (trimmed.endsWith(':')) {
      indentLevel = currentIndent + 4;
    } else if (currentIndent < indentLevel && ['return', 'break', 'continue', 'pass'].some(kw => trimmed.startsWith(kw))) {
      indentLevel = currentIndent;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Exp Code 자동 수정 제안 함수
 */
export function suggestExpCodeFixes(expCode: string): string {
  let suggestedCode = expCode;
  
  // 1. project_root 재정의 제거
  if (expCode.match(/^\s*project_root\s*=/m)) {
    suggestedCode = suggestedCode.replace(
      /^\s*project_root\s*=.*$/gm,
      '# project_root is already provided - do not redefine'
    );
  }
  
  // 2. input_data 사용시 안전성 체크 추가
  if (expCode.includes('input_data') && !expCode.includes('if') && !expCode.includes('try')) {
    suggestedCode = `# Safety check for input_data
if 'input_data' in locals() and input_data:
${expCode.split('\n').map(line => '    ' + line).join('\n')}
else:
    print("Warning: input_data is not available")`;
  }
  
  // 3. 전역 변수 사용 개선
  suggestedCode = suggestedCode.replace(
    /^(\s*)global\s+(\w+)/gm,
    '$1# global $2  # Consider using function parameters instead'
  );
  
  return suggestedCode;
}