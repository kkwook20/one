// frontend/src/templates/baseCode/index.ts

// Python 파일들의 경로
import defaultTemplateUrl from './default.py?url';
import advancedTemplateUrl from './advanced.py?url';
import minimalTemplateUrl from './minimal.py?url';

export interface BaseCodeTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

// 템플릿 내용을 저장할 변수
let templatesLoaded = false;
const templateContents: Record<string, string> = {};

// 템플릿 파일 로드 함수
async function loadTemplates() {
  if (templatesLoaded) return;
  
  try {
    const [defaultContent, advancedContent, minimalContent] = await Promise.all([
      fetch(defaultTemplateUrl).then(r => r.text()),
      fetch(advancedTemplateUrl).then(r => r.text()),
      fetch(minimalTemplateUrl).then(r => r.text())
    ]);
    
    templateContents.default = defaultContent;
    templateContents.advanced = advancedContent;
    templateContents.minimal = minimalContent;
    
    templatesLoaded = true;
  } catch (error) {
    console.error('Failed to load templates:', error);
    // 폴백: 기본 템플릿 문자열 사용
    templateContents.default = getDefaultTemplateString();
    templateContents.advanced = getAdvancedTemplateString();
    templateContents.minimal = getMinimalTemplateString();
  }
}

// 템플릿 정보 (content는 동적으로 로드)
export const baseCodeTemplates: Record<string, Omit<BaseCodeTemplate, 'content'>> = {
  default: {
    id: 'default',
    name: 'default',
    description: 'Tasks 기반 AI 처리를 위한 표준 템플릿'
  },
  advanced: {
    id: 'advanced', 
    name: '고급 템플릿',
    description: '에러 처리, 재시도, 검증 로직이 포함된 템플릿'
  },
  minimal: {
    id: 'minimal',
    name: '최소 템플릿', 
    description: '필수 기능만 포함된 간단한 템플릿'
  }
};

// 템플릿에서 변수 치환 함수
export function processTemplate(template: string, variables: Record<string, string>): string {
  let processed = template;
  
  // ${VARIABLE_NAME} 형식의 변수들을 실제 값으로 치환
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    processed = processed.replace(regex, value);
  });
  
  return processed;
}

// 기본 템플릿 가져오기
export async function getDefaultTemplate(): Promise<string> {
  await loadTemplates();
  return templateContents.default || getDefaultTemplateString();
}

// 특정 템플릿 가져오기
export async function getTemplate(templateId: string): Promise<string | null> {
  await loadTemplates();
  return templateContents[templateId] || null;
}

// 폴백용 기본 템플릿 문자열
function getDefaultTemplateString(): string {
  return `# ========================================================================
# BASE CODE - 공통 실행 코드 (수정 불가)
# 이 코드는 모든 Worker 노드가 공통으로 사용하는 기본 실행 코드입니다.
# ========================================================================

import json
import time

# 기본 템플릿 내용...
output = {"message": "Default template"}`;
}

function getAdvancedTemplateString(): string {
  return `# ========================================================================
# ADVANCED BASE CODE - 고급 기능 포함 공통 실행 코드
# ========================================================================

import json
import time
import traceback

# 고급 템플릿 내용...
output = {"message": "Advanced template"}`;
}

function getMinimalTemplateString(): string {
  return `# ========================================================================
# MINIMAL BASE CODE - 최소 기능 템플릿
# ========================================================================

import json

# 최소 템플릿 내용...
output = {"message": "Minimal template"}`;
}