# backend/app/nodes/worker_writer.py

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
import httpx
import markdown2

from app.models.node import Node, NodeData
from app.storage.node_storage import node_storage
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class WorkerWriterNode:
    """Worker Writer Node - 텍스트 생성 특화"""
    
    def __init__(self):
        self.lm_studio_url = "http://localhost:1234/v1"
        self.output_formats = ['text', 'markdown', 'json', 'html']
        
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """텍스트 생성 실행"""
        try:
            # 입력 데이터
            prompt = data.get('prompt', '')
            template = data.get('template', '')
            variables = data.get('variables', {})
            output_format = data.get('outputFormat', 'markdown')
            sections = data.get('sections', [])
            
            # 섹션별 생성 모드
            if sections:
                generated_sections = await self.generate_sections(
                    sections, 
                    prompt, 
                    variables
                )
                
                # 전체 텍스트 조합
                full_text = self.combine_sections(generated_sections)
                
                # 포맷 변환
                formatted_output = await self.format_output(
                    full_text, 
                    output_format
                )
                
                # 섹션별 저장
                await node_storage.save_data(
                    node_id, 
                    'text_sections', 
                    generated_sections
                )
                
            else:
                # 단일 텍스트 생성
                full_text = await self.generate_text(
                    prompt, 
                    template, 
                    variables
                )
                
                formatted_output = await self.format_output(
                    full_text, 
                    output_format
                )
                
            # 결과 저장
            result = {
                "generated_text": full_text,
                "formatted_output": formatted_output,
                "format": output_format,
                "sections": generated_sections if sections else None,
                "word_count": len(full_text.split()),
                "character_count": len(full_text)
            }
            
            await node_storage.save_data(node_id, 'output', result)
            
            # 파일로 저장
            filename = f"generated_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{output_format}"
            file_path = await node_storage.save_file(
                node_id, 
                filename,
                formatted_output.encode('utf-8')
            )
            
            return {
                "status": "success",
                "output": result,
                "file_path": file_path,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Worker Writer node error: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            
    async def generate_text(
        self, 
        prompt: str, 
        template: str, 
        variables: Dict[str, Any]
    ) -> str:
        """단일 텍스트 생성"""
        # 템플릿 변수 치환
        if template:
            for key, value in variables.items():
                template = template.replace(f"{{{key}}}", str(value))
            final_prompt = template
        else:
            final_prompt = prompt
            
        # LLM 호출
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.lm_studio_url}/completions",
                    json={
                        "prompt": final_prompt,
                        "max_tokens": 2000,
                        "temperature": 0.7,
                        "top_p": 0.9
                    },
                    timeout=60.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    generated = result.get('choices', [{}])[0].get('text', '').strip()
                    return generated
                else:
                    # 폴백: 템플릿 반환
                    return final_prompt
                    
        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            return final_prompt
            
    async def generate_sections(
        self, 
        sections: List[Dict[str, Any]], 
        base_prompt: str,
        variables: Dict[str, Any]
    ) -> Dict[str, str]:
        """섹션별 텍스트 생성"""
        generated_sections = {}
        
        for section in sections:
            section_name = section.get('name', 'unnamed')
            section_prompt = section.get('prompt', base_prompt)
            section_template = section.get('template', '')
            
            # 섹션별 변수 병합
            section_vars = {**variables, **section.get('variables', {})}
            
            # 텍스트 생성
            section_text = await self.generate_text(
                section_prompt,
                section_template,
                section_vars
            )
            
            generated_sections[section_name] = section_text
            
            # 잠시 대기 (API 호출 제한 방지)
            await asyncio.sleep(0.5)
            
        return generated_sections
        
    def combine_sections(self, sections: Dict[str, str]) -> str:
        """섹션들을 하나의 텍스트로 조합"""
        combined = []
        
        for section_name, content in sections.items():
            # 섹션 헤더 추가
            combined.append(f"## {section_name}\n")
            combined.append(content)
            combined.append("\n\n")
            
        return '\n'.join(combined)
        
    async def format_output(self, text: str, format: str) -> str:
        """출력 포맷 변환"""
        if format == 'text':
            return text
            
        elif format == 'markdown':
            return text  # 이미 마크다운
            
        elif format == 'html':
            # 마크다운을 HTML로 변환
            html = markdown2.markdown(
                text,
                extras=['fenced-code-blocks', 'tables', 'header-ids']
            )
            
            # HTML 템플릿
            return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Generated Content</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }}
        h1, h2, h3 {{ color: #333; }}
        code {{ background: #f4f4f4; padding: 2px 4px; }}
        pre {{ background: #f4f4f4; padding: 10px; overflow-x: auto; }}
    </style>
</head>
<body>
{html}
</body>
</html>"""
            
        elif format == 'json':
            # 텍스트를 JSON 구조로 변환
            sections = text.split('\n## ')
            json_data = {
                "content": text,
                "sections": []
            }
            
            for section in sections[1:]:  # 첫 번째는 빈 문자열
                lines = section.split('\n')
                if lines:
                    json_data["sections"].append({
                        "title": lines[0].strip(),
                        "content": '\n'.join(lines[1:]).strip()
                    })
                    
            return json.dumps(json_data, ensure_ascii=False, indent=2)
            
        else:
            return text

# 모듈 레벨 인스턴스
worker_writer_node = WorkerWriterNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await worker_writer_node.execute(node_id, data)