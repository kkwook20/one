# backend/app/services/ai_service.py

import asyncio
import json
from typing import Dict, Any, List, Optional, Union
from datetime import datetime
import httpx
from abc import ABC, abstractmethod

from app.config import settings
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class AIProvider(ABC):
    """AI 프로바이더 기본 클래스"""
    
    @abstractmethod
    async def complete(self, prompt: str, **kwargs) -> str:
        pass
    
    @abstractmethod
    async def embed(self, text: str) -> List[float]:
        pass
    
    @abstractmethod
    async def generate_code(self, description: str, language: str = "python") -> str:
        pass


class OpenAIProvider(AIProvider):
    """OpenAI API 프로바이더"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openai.com/v1"
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30.0
        )
    
    async def complete(self, prompt: str, model: str = "gpt-4", **kwargs) -> str:
        """텍스트 완성"""
        try:
            response = await self.client.post(
                f"{self.base_url}/chat/completions",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": kwargs.get("temperature", 0.7),
                    "max_tokens": kwargs.get("max_tokens", 1000),
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"OpenAI completion error: {e}")
            raise
    
    async def embed(self, text: str) -> List[float]:
        """텍스트 임베딩"""
        try:
            response = await self.client.post(
                f"{self.base_url}/embeddings",
                json={
                    "model": "text-embedding-ada-002",
                    "input": text
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]
        except Exception as e:
            logger.error(f"OpenAI embedding error: {e}")
            raise
    
    async def generate_code(self, description: str, language: str = "python") -> str:
        """코드 생성"""
        prompt = f"""Generate {language} code for the following task:
{description}

Requirements:
- Clean, efficient code
- Proper error handling
- Type hints (if applicable)
- Comments explaining complex logic

Code:
```{language}"""
        
        code = await self.complete(prompt, model="gpt-4")
        # Extract code from markdown
        if "```" in code:
            lines = code.split("\n")
            code_lines = []
            in_code = False
            for line in lines:
                if line.strip().startswith("```"):
                    in_code = not in_code
                    continue
                if in_code:
                    code_lines.append(line)
            return "\n".join(code_lines)
        return code


class AnthropicProvider(AIProvider):
    """Anthropic Claude API 프로바이더"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.anthropic.com/v1"
        self.client = httpx.AsyncClient(
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01"
            },
            timeout=30.0
        )
    
    async def complete(self, prompt: str, model: str = "claude-3-opus-20240229", **kwargs) -> str:
        """텍스트 완성"""
        try:
            response = await self.client.post(
                f"{self.base_url}/messages",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": kwargs.get("max_tokens", 1000),
                    "temperature": kwargs.get("temperature", 0.7),
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["content"][0]["text"]
        except Exception as e:
            logger.error(f"Anthropic completion error: {e}")
            raise
    
    async def embed(self, text: str) -> List[float]:
        """텍스트 임베딩 - Claude는 임베딩을 지원하지 않으므로 대체 구현"""
        # 실제로는 다른 임베딩 모델 사용
        raise NotImplementedError("Claude does not support embeddings")
    
    async def generate_code(self, description: str, language: str = "python") -> str:
        """코드 생성"""
        prompt = f"""Generate {language} code for this task: {description}

Return only the code without any explanation."""
        
        return await self.complete(prompt)


class LocalLLMProvider(AIProvider):
    """로컬 LLM 프로바이더 (Ollama)"""
    
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=60.0)
    
    async def complete(self, prompt: str, model: str = "llama2", **kwargs) -> str:
        """텍스트 완성"""
        try:
            response = await self.client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": kwargs.get("temperature", 0.7),
                        "num_predict": kwargs.get("max_tokens", 1000),
                    }
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["response"]
        except Exception as e:
            logger.error(f"Local LLM completion error: {e}")
            raise
    
    async def embed(self, text: str) -> List[float]:
        """텍스트 임베딩"""
        try:
            response = await self.client.post(
                f"{self.base_url}/api/embeddings",
                json={
                    "model": "nomic-embed-text",
                    "prompt": text
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["embedding"]
        except Exception as e:
            logger.error(f"Local LLM embedding error: {e}")
            raise
    
    async def generate_code(self, description: str, language: str = "python") -> str:
        """코드 생성"""
        prompt = f"Generate {language} code: {description}\n\nCode:"
        return await self.complete(prompt, model="codellama")


class AIService:
    """AI 서비스 통합 관리자"""
    
    def __init__(self):
        self.providers: Dict[str, AIProvider] = {}
        self.default_provider = None
        self._initialize_providers()
    
    def _initialize_providers(self):
        """프로바이더 초기화"""
        # OpenAI
        if settings.OPENAI_API_KEY:
            self.providers["openai"] = OpenAIProvider(settings.OPENAI_API_KEY)
            self.default_provider = "openai"
        
        # Anthropic
        if settings.ANTHROPIC_API_KEY:
            self.providers["anthropic"] = AnthropicProvider(settings.ANTHROPIC_API_KEY)
            if not self.default_provider:
                self.default_provider = "anthropic"
        
        # Local LLM
        if settings.OLLAMA_HOST:
            self.providers["local"] = LocalLLMProvider(settings.OLLAMA_HOST)
            if not self.default_provider:
                self.default_provider = "local"
    
    def get_provider(self, provider_name: Optional[str] = None) -> AIProvider:
        """프로바이더 가져오기"""
        if provider_name:
            if provider_name not in self.providers:
                raise ValueError(f"Unknown provider: {provider_name}")
            return self.providers[provider_name]
        
        if not self.default_provider:
            raise ValueError("No AI providers configured")
        
        return self.providers[self.default_provider]
    
    async def complete(
        self, 
        prompt: str, 
        provider: Optional[str] = None,
        **kwargs
    ) -> str:
        """텍스트 완성"""
        ai_provider = self.get_provider(provider)
        return await ai_provider.complete(prompt, **kwargs)
    
    async def generate_code(
        self,
        description: str,
        language: str = "python",
        provider: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """코드 생성"""
        # 컨텍스트 추가
        if context:
            description = f"""Context:
- Node Type: {context.get('node_type', 'unknown')}
- Input Variables: {context.get('inputs', {})}
- Expected Output: {context.get('outputs', {})}

Task: {description}"""
        
        ai_provider = self.get_provider(provider)
        return await ai_provider.generate_code(description, language)
    
    async def optimize_code(
        self,
        code: str,
        language: str = "python",
        optimization_goals: List[str] = None,
        provider: Optional[str] = None
    ) -> str:
        """코드 최적화"""
        goals = optimization_goals or ["performance", "readability", "error handling"]
        
        prompt = f"""Optimize the following {language} code for: {', '.join(goals)}

Original code:
```{language}
{code}
```

Optimized code:"""
        return await self.complete(prompt, provider)
    
    async def review_code(
        self,
        code: str,
        language: str = "python",
        provider: Optional[str] = None
    ) -> Dict[str, Any]:
        """코드 리뷰"""
        prompt = f"""Review the following {language} code and provide feedback:
{code}

Provide a JSON response with:
- score: 0-100
- issues: list of issues found
- suggestions: list of improvement suggestions
- security_concerns: list of security issues"""
        
        response = await self.complete(prompt, provider)
        
        try:
            # JSON 파싱 시도
            return json.loads(response)
        except:
            # 파싱 실패 시 기본 구조
            return {
                "score": 0,
                "issues": ["Failed to parse AI response"],
                "suggestions": [],
                "security_concerns": []
            }
    
    async def generate_documentation(
        self,
        code: str,
        language: str = "python",
        provider: Optional[str] = None
    ) -> str:
        """문서 생성"""
        prompt = f"""Generate comprehensive documentation for this {language} code:

{code}

Include:
- Function/class descriptions
- Parameter explanations
- Return value descriptions
- Usage examples"""
        
        return await self.complete(prompt, provider)
    
    async def translate_code(
        self,
        code: str,
        from_language: str,
        to_language: str,
        provider: Optional[str] = None
    ) -> str:
        """코드 언어 변환"""
        prompt = f"""Translate this {from_language} code to {to_language}:

{code}

{to_language} code:"""
        return await self.complete(prompt, provider)
    
    async def explain_code(
        self,
        code: str,
        language: str = "python",
        level: str = "beginner",
        provider: Optional[str] = None
    ) -> str:
        """코드 설명"""
        prompt = f"""Explain this {language} code for a {level} programmer:

{code}

Explanation:"""
        return await self.complete(prompt, provider)
    
    async def suggest_improvements(
        self,
        workflow_data: Dict[str, Any],
        provider: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """워크플로우 개선 제안"""
        prompt = f"""Analyze this workflow and suggest improvements:

Nodes: {len(workflow_data.get('nodes', []))}
Edges: {len(workflow_data.get('edges', []))}
Node Types: {[n['type'] for n in workflow_data.get('nodes', [])]}

Suggest improvements for:
- Performance optimization
- Error handling
- Resource efficiency
- Maintainability

Return as JSON array of suggestions."""
        
        response = await self.complete(prompt, provider)
        
        try:
            return json.loads(response)
        except:
            return []
    
    async def generate_test_cases(
        self,
        code: str,
        language: str = "python",
        provider: Optional[str] = None
    ) -> str:
        """테스트 케이스 생성"""
        prompt = f"""Generate comprehensive test cases for this {language} code:

{code}

Include:
- Unit tests
- Edge cases
- Error conditions
- Performance tests (if applicable)"""
        
        return await self.complete(prompt, provider)


# 싱글톤 인스턴스
ai_service = AIService()