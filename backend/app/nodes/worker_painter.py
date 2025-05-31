# backend/app/nodes/worker_painter.py

import asyncio
import json
import base64
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
import httpx
from PIL import Image, ImageDraw, ImageFont
import io
import cairosvg

from app.models.node import Node, NodeData
from app.storage.node_storage import node_storage
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class WorkerPainterNode:
    """Worker Painter Node - 이미지 생성 특화"""
    
    def __init__(self):
        self.stable_diffusion_url = "http://localhost:7860"  # Automatic1111 WebUI
        self.supported_formats = ['svg', 'png', 'jpeg', 'webp']
        
    async def execute(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """이미지 생성 실행"""
        try:
            # 입력 데이터
            prompt = data.get('prompt', '')
            negative_prompt = data.get('negativePrompt', '')
            image_format = data.get('format', 'png')
            width = data.get('width', 512)
            height = data.get('height', 512)
            generation_type = data.get('generationType', 'ai')  # ai, svg, procedural
            
            generated_image_path = None
            
            if generation_type == 'ai':
                # AI 이미지 생성 (Stable Diffusion)
                image_data = await self.generate_ai_image(
                    prompt, 
                    negative_prompt,
                    width,
                    height
                )
                
            elif generation_type == 'svg':
                # SVG 생성
                svg_code = data.get('svgCode') or await self.generate_svg(
                    prompt,
                    width,
                    height
                )
                image_data = svg_code.encode('utf-8')
                image_format = 'svg'
                
            elif generation_type == 'procedural':
                # 프로시저럴 생성 (Python 코드)
                image_data = await self.generate_procedural_image(
                    data.get('proceduralCode', ''),
                    width,
                    height
                )
                
            else:
                raise ValueError(f"Unknown generation type: {generation_type}")
                
            # 이미지 저장
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"generated_{timestamp}.{image_format}"
            
            # 포맷 변환 (필요한 경우)
            if image_format != 'svg' and generation_type == 'svg':
                image_data = await self.convert_svg_to_raster(
                    image_data,
                    image_format,
                    width,
                    height
                )
                
            # 파일 저장
            file_path = await node_storage.save_file(
                node_id,
                filename,
                image_data
            )
            
            # 썸네일 생성
            thumbnail_path = None
            if image_format != 'svg':
                thumbnail_data = await self.create_thumbnail(image_data)
                thumbnail_path = await node_storage.save_file(
                    node_id,
                    f"thumb_{timestamp}.png",
                    thumbnail_data
                )
                
            # 결과 저장
            result = {
                "image_path": file_path,
                "thumbnail_path": thumbnail_path,
                "format": image_format,
                "width": width,
                "height": height,
                "generation_type": generation_type,
                "prompt": prompt,
                "file_size": len(image_data),
                "generated_at": datetime.now().isoformat()
            }
            
            await node_storage.save_data(node_id, 'output', result)
            
            return {
                "status": "success",
                "output": result,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Worker Painter node error: {str(e)}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            
    async def generate_ai_image(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int
    ) -> bytes:
        """AI 이미지 생성 (Stable Diffusion)"""
        try:
            async with httpx.AsyncClient() as client:
                # txt2img API 호출
                response = await client.post(
                    f"{self.stable_diffusion_url}/sdapi/v1/txt2img",
                    json={
                        "prompt": prompt,
                        "negative_prompt": negative_prompt,
                        "width": width,
                        "height": height,
                        "steps": 20,
                        "cfg_scale": 7,
                        "sampler_index": "Euler a"
                    },
                    timeout=120.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    # base64 디코딩
                    image_data = base64.b64decode(result['images'][0])
                    return image_data
                    
        except Exception as e:
            logger.error(f"AI image generation failed: {e}")
            
        # 폴백: 빈 이미지 생성
        return await self.create_placeholder_image(width, height, prompt)
        
    async def generate_svg(self, prompt: str, width: int, height: int) -> str:
        """SVG 코드 생성"""
        # 간단한 SVG 생성 (실제로는 LLM이나 더 복잡한 로직 사용)
        svg = f'''<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="{width}" height="{height}" fill="#f0f0f0"/>
  <text x="{width//2}" y="{height//2}" 
        font-family="Arial" font-size="24" 
        text-anchor="middle" dominant-baseline="middle">
    {prompt[:50]}...
  </text>
  <circle cx="{width//4}" cy="{height//4}" r="50" fill="#3498db" opacity="0.5"/>
  <circle cx="{width*3//4}" cy="{height//4}" r="50" fill="#e74c3c" opacity="0.5"/>
  <rect x="{width//4}" y="{height*3//4-25}" width="{width//2}" height="50" 
        fill="#2ecc71" opacity="0.5" rx="25"/>
</svg>'''
        return svg
        
    async def generate_procedural_image(
        self,
        code: str,
        width: int,
        height: int
    ) -> bytes:
        """프로시저럴 이미지 생성"""
        # 안전한 실행 환경 설정
        img = Image.new('RGB', (width, height), 'white')
        draw = ImageDraw.Draw(img)
        
        # 제한된 globals
        safe_globals = {
            'img': img,
            'draw': draw,
            'width': width,
            'height': height,
            'Image': Image,
            'ImageDraw': ImageDraw
        }
        
        try:
            # 사용자 코드 실행
            exec(code, safe_globals)
            
            # 이미지를 바이트로 변환
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            return buffer.getvalue()
            
        except Exception as e:
            logger.error(f"Procedural generation failed: {e}")
            # 폴백
            return await self.create_placeholder_image(width, height, "Error")
            
    async def convert_svg_to_raster(
        self,
        svg_data: bytes,
        format: str,
        width: int,
        height: int
    ) -> bytes:
        """SVG를 래스터 이미지로 변환"""
        try:
            # Cairo를 사용한 변환
            if format == 'png':
                png_data = cairosvg.svg2png(
                    bytestring=svg_data,
                    output_width=width,
                    output_height=height
                )
                return png_data
            else:
                # PNG로 먼저 변환 후 다른 포맷으로
                png_data = cairosvg.svg2png(
                    bytestring=svg_data,
                    output_width=width,
                    output_height=height
                )
                
                img = Image.open(io.BytesIO(png_data))
                buffer = io.BytesIO()
                img.save(buffer, format=format.upper())
                return buffer.getvalue()
                
        except Exception as e:
            logger.error(f"SVG conversion failed: {e}")
            return await self.create_placeholder_image(width, height, "SVG Error")
            
    async def create_thumbnail(self, image_data: bytes, size: tuple = (128, 128)) -> bytes:
        """썸네일 생성"""
        try:
            img = Image.open(io.BytesIO(image_data))
            img.thumbnail(size, Image.Resampling.LANCZOS)
            
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            return buffer.getvalue()
            
        except Exception as e:
            logger.error(f"Thumbnail creation failed: {e}")
            return image_data  # 원본 반환
            
    async def create_placeholder_image(
        self,
        width: int,
        height: int,
        text: str
    ) -> bytes:
        """플레이스홀더 이미지 생성"""
        img = Image.new('RGB', (width, height), '#cccccc')
        draw = ImageDraw.Draw(img)
        
        # 텍스트 추가
        text_bbox = draw.textbbox((0, 0), text)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
        
        position = ((width - text_width) // 2, (height - text_height) // 2)
        draw.text(position, text, fill='#666666')
        
        # 대각선 추가
        draw.line([(0, 0), (width, height)], fill='#999999', width=2)
        draw.line([(width, 0), (0, height)], fill='#999999', width=2)
        
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()

# 모듈 레벨 인스턴스
worker_painter_node = WorkerPainterNode()

async def execute(node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """외부에서 호출되는 실행 함수"""
    return await worker_painter_node.execute(node_id, data)