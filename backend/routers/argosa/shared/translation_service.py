# backend/routers/argosa/shared/translation_service.py
"""
번역 서비스 - 다국어 웹 크롤링 지원
"""

import os
import asyncio
import aiohttp
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import re

logger = logging.getLogger(__name__)

# 환경 변수
GOOGLE_TRANSLATE_API_KEY = os.getenv("GOOGLE_TRANSLATE_API_KEY", "")
DEEPL_API_KEY = os.getenv("DEEPL_API_KEY", "")
PAPAGO_CLIENT_ID = os.getenv("PAPAGO_CLIENT_ID", "")
PAPAGO_CLIENT_SECRET = os.getenv("PAPAGO_CLIENT_SECRET", "")

# 캐시 설정
TRANSLATION_CACHE_DIR = Path("./data/argosa/translation_cache")
TRANSLATION_CACHE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_TTL = 86400 * 30  # 30일

# 언어 코드 매핑
LANGUAGE_CODES = {
    "korean": "ko",
    "english": "en", 
    "chinese": "zh",
    "chinese-simplified": "zh-CN",
    "chinese-traditional": "zh-TW",
    "japanese": "ja",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "russian": "ru",
    "vietnamese": "vi",
    "thai": "th",
    "arabic": "ar",
    "hindi": "hi",
    "portuguese": "pt",
    "italian": "it"
}

# 언어별 인코딩
LANGUAGE_ENCODINGS = {
    "zh": "utf-8",
    "zh-CN": "utf-8",
    "zh-TW": "utf-8",
    "ja": "utf-8",
    "ko": "utf-8",
    "ar": "utf-8",
    "th": "utf-8",
    "ru": "utf-8",
    "vi": "utf-8"
}

class TranslationService:
    """통합 번역 서비스"""
    
    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
        self._cache: Dict[str, Tuple[str, datetime]] = {}
        self._providers = self._init_providers()
        
    def _init_providers(self) -> Dict[str, bool]:
        """사용 가능한 번역 제공자 확인"""
        providers = {
            "google": bool(GOOGLE_TRANSLATE_API_KEY),
            "deepl": bool(DEEPL_API_KEY),
            "papago": bool(PAPAGO_CLIENT_ID and PAPAGO_CLIENT_SECRET),
            "local": True  # 로컬 LLM 번역
        }
        
        logger.info(f"Available translation providers: {[k for k, v in providers.items() if v]}")
        return providers
    
    async def initialize(self):
        """서비스 초기화"""
        if not self._session:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30)
            )
        
        # 캐시 로드
        self._load_cache()
        
        logger.info("Translation service initialized")
    
    async def cleanup(self):
        """서비스 정리"""
        if self._session:
            await self._session.close()
            self._session = None
            
        # 캐시 저장
        self._save_cache()
    
    def detect_language(self, text: str) -> str:
        """언어 감지 (간단한 휴리스틱)"""
        # 한글
        if re.search(r'[\u3131-\u3163\uac00-\ud7a3]', text):
            return "ko"
        # 중국어
        elif re.search(r'[\u4e00-\u9fff]', text):
            # 번체/간체 구분은 더 복잡함 - 기본적으로 간체로
            return "zh-CN"
        # 일본어
        elif re.search(r'[\u3040-\u309f\u30a0-\u30ff]', text):
            return "ja"
        # 아랍어
        elif re.search(r'[\u0600-\u06ff]', text):
            return "ar"
        # 태국어
        elif re.search(r'[\u0e00-\u0e7f]', text):
            return "th"
        # 러시아어
        elif re.search(r'[\u0400-\u04ff]', text):
            return "ru"
        # 기본값 영어
        else:
            return "en"
    
    async def translate(self, text: str, target_lang: str = "ko", 
                       source_lang: str = None) -> Dict[str, Any]:
        """텍스트 번역"""
        
        # 언어 코드 정규화
        target_lang = LANGUAGE_CODES.get(target_lang, target_lang)
        
        # 소스 언어 자동 감지
        if not source_lang:
            source_lang = self.detect_language(text)
        else:
            source_lang = LANGUAGE_CODES.get(source_lang, source_lang)
        
        # 같은 언어면 번역하지 않음
        if source_lang == target_lang:
            return {
                "translated_text": text,
                "source_language": source_lang,
                "target_language": target_lang,
                "provider": "none",
                "cached": False
            }
        
        # 캐시 확인
        cache_key = self._get_cache_key(text, source_lang, target_lang)
        cached = await self._get_cached_translation(cache_key)
        if cached:
            return cached
        
        # 번역 시도 (우선순위대로)
        result = None
        
        if self._providers["papago"] and source_lang in ["ko", "en", "zh-CN", "ja"] and target_lang in ["ko", "en", "zh-CN", "ja"]:
            result = await self._translate_papago(text, source_lang, target_lang)
            
        if not result and self._providers["google"]:
            result = await self._translate_google(text, source_lang, target_lang)
            
        if not result and self._providers["deepl"]:
            result = await self._translate_deepl(text, source_lang, target_lang)
            
        if not result and self._providers["local"]:
            result = await self._translate_local_llm(text, source_lang, target_lang)
        
        # 기본 폴백
        if not result:
            result = {
                "translated_text": text,
                "source_language": source_lang,
                "target_language": target_lang,
                "provider": "fallback",
                "error": "No translation provider available"
            }
        
        # 캐시 저장
        await self._save_to_cache(cache_key, result)
        
        return result
    
    async def translate_batch(self, texts: List[str], target_lang: str = "ko",
                            source_lang: str = None) -> List[Dict[str, Any]]:
        """배치 번역"""
        tasks = []
        
        for text in texts:
            task = asyncio.create_task(
                self.translate(text, target_lang, source_lang)
            )
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 예외 처리
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                processed_results.append({
                    "translated_text": texts[i],
                    "error": str(result),
                    "provider": "error"
                })
            else:
                processed_results.append(result)
        
        return processed_results
    
    async def _translate_google(self, text: str, source_lang: str, 
                              target_lang: str) -> Optional[Dict[str, Any]]:
        """Google Translate API"""
        if not self._session:
            await self.initialize()
            
        try:
            url = "https://translation.googleapis.com/language/translate/v2"
            
            params = {
                "key": GOOGLE_TRANSLATE_API_KEY,
                "q": text,
                "source": source_lang,
                "target": target_lang,
                "format": "text"
            }
            
            async with self._session.post(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    translation = data["data"]["translations"][0]["translatedText"]
                    
                    return {
                        "translated_text": translation,
                        "source_language": source_lang,
                        "target_language": target_lang,
                        "provider": "google",
                        "cached": False
                    }
                else:
                    logger.error(f"Google Translate error: {response.status}")
                    return None
                    
        except Exception as e:
            logger.error(f"Google Translate exception: {e}")
            return None
    
    async def _translate_papago(self, text: str, source_lang: str,
                              target_lang: str) -> Optional[Dict[str, Any]]:
        """Naver Papago API (한중일영 특화)"""
        if not self._session:
            await self.initialize()
            
        # Papago 언어 코드 매핑
        papago_lang_map = {
            "zh-CN": "zh-CN",
            "zh-TW": "zh-TW",
            "zh": "zh-CN"
        }
        
        source = papago_lang_map.get(source_lang, source_lang)
        target = papago_lang_map.get(target_lang, target_lang)
        
        try:
            url = "https://openapi.naver.com/v1/papago/n2mt"
            
            headers = {
                "X-Naver-Client-Id": PAPAGO_CLIENT_ID,
                "X-Naver-Client-Secret": PAPAGO_CLIENT_SECRET,
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
            }
            
            data = {
                "source": source,
                "target": target,
                "text": text
            }
            
            async with self._session.post(url, headers=headers, data=data) as response:
                if response.status == 200:
                    result = await response.json()
                    translation = result["message"]["result"]["translatedText"]
                    
                    return {
                        "translated_text": translation,
                        "source_language": source_lang,
                        "target_language": target_lang,
                        "provider": "papago",
                        "cached": False
                    }
                else:
                    logger.error(f"Papago error: {response.status}")
                    return None
                    
        except Exception as e:
            logger.error(f"Papago exception: {e}")
            return None
    
    async def _translate_deepl(self, text: str, source_lang: str,
                             target_lang: str) -> Optional[Dict[str, Any]]:
        """DeepL API"""
        if not self._session:
            await self.initialize()
            
        # DeepL 언어 코드 조정
        deepl_target = target_lang.upper() if target_lang in ["en", "de", "fr", "es", "it", "pt", "ru"] else target_lang
        
        try:
            url = "https://api-free.deepl.com/v2/translate"
            
            data = {
                "auth_key": DEEPL_API_KEY,
                "text": text,
                "source_lang": source_lang.upper(),
                "target_lang": deepl_target
            }
            
            async with self._session.post(url, data=data) as response:
                if response.status == 200:
                    result = await response.json()
                    translation = result["translations"][0]["text"]
                    
                    return {
                        "translated_text": translation,
                        "source_language": source_lang,
                        "target_language": target_lang,
                        "provider": "deepl",
                        "cached": False
                    }
                else:
                    logger.error(f"DeepL error: {response.status}")
                    return None
                    
        except Exception as e:
            logger.error(f"DeepL exception: {e}")
            return None
    
    async def _translate_local_llm(self, text: str, source_lang: str,
                                 target_lang: str) -> Optional[Dict[str, Any]]:
        """로컬 LLM을 사용한 번역"""
        if not self._session:
            await self.initialize()
            
        # 언어 이름 매핑
        lang_names = {
            "ko": "Korean",
            "en": "English",
            "zh": "Chinese",
            "zh-CN": "Simplified Chinese",
            "zh-TW": "Traditional Chinese",
            "ja": "Japanese",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "ru": "Russian",
            "vi": "Vietnamese",
            "th": "Thai",
            "ar": "Arabic"
        }
        
        source_name = lang_names.get(source_lang, source_lang)
        target_name = lang_names.get(target_lang, target_lang)
        
        prompt = f"""Translate the following text from {source_name} to {target_name}.
Only provide the translated text without any explanation or additional comments.

Original text:
{text}

Translation:"""
        
        try:
            url = "http://localhost:1234/v1/chat/completions"
            
            payload = {
                "model": "default",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a professional translator. Provide accurate translations while preserving the original meaning and tone."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.3,
                "max_tokens": len(text) * 3  # 번역은 보통 원문보다 길어질 수 있음
            }
            
            async with self._session.post(url, json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    translation = result["choices"][0]["message"]["content"].strip()
                    
                    return {
                        "translated_text": translation,
                        "source_language": source_lang,
                        "target_language": target_lang,
                        "provider": "local_llm",
                        "cached": False
                    }
                else:
                    logger.error(f"Local LLM error: {response.status}")
                    return None
                    
        except Exception as e:
            logger.error(f"Local LLM exception: {e}")
            return None
    
    def _get_cache_key(self, text: str, source_lang: str, target_lang: str) -> str:
        """캐시 키 생성"""
        content = f"{text}:{source_lang}:{target_lang}"
        return hashlib.sha256(content.encode()).hexdigest()
    
    async def _get_cached_translation(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """캐시에서 번역 조회"""
        # 메모리 캐시 확인
        if cache_key in self._cache:
            data, timestamp = self._cache[cache_key]
            if (datetime.now() - timestamp).total_seconds() < CACHE_TTL:
                result = json.loads(data)
                result["cached"] = True
                return result
        
        # 파일 캐시 확인
        cache_file = TRANSLATION_CACHE_DIR / f"{cache_key}.json"
        if cache_file.exists():
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                # 타임스탬프 확인
                timestamp = datetime.fromisoformat(data["timestamp"])
                if (datetime.now() - timestamp).total_seconds() < CACHE_TTL:
                    del data["timestamp"]
                    data["cached"] = True
                    
                    # 메모리 캐시에도 저장
                    self._cache[cache_key] = (json.dumps(data), datetime.now())
                    
                    return data
                    
            except Exception as e:
                logger.error(f"Cache read error: {e}")
        
        return None
    
    async def _save_to_cache(self, cache_key: str, result: Dict[str, Any]):
        """캐시에 번역 저장"""
        # 메모리 캐시
        self._cache[cache_key] = (json.dumps(result), datetime.now())
        
        # 파일 캐시
        cache_file = TRANSLATION_CACHE_DIR / f"{cache_key}.json"
        cache_data = {**result, "timestamp": datetime.now().isoformat()}
        
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Cache write error: {e}")
    
    def _load_cache(self):
        """캐시 로드"""
        try:
            # 최근 캐시 파일들만 메모리에 로드
            cache_files = sorted(
                TRANSLATION_CACHE_DIR.glob("*.json"),
                key=lambda x: x.stat().st_mtime,
                reverse=True
            )[:1000]  # 최근 1000개만
            
            for cache_file in cache_files:
                try:
                    with open(cache_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        timestamp = datetime.fromisoformat(data["timestamp"])
                        
                        if (datetime.now() - timestamp).total_seconds() < CACHE_TTL:
                            cache_key = cache_file.stem
                            del data["timestamp"]
                            self._cache[cache_key] = (json.dumps(data), timestamp)
                            
                except Exception:
                    pass
                    
            logger.info(f"Loaded {len(self._cache)} translations from cache")
            
        except Exception as e:
            logger.error(f"Cache load error: {e}")
    
    def _save_cache(self):
        """캐시 저장"""
        # 메모리 캐시는 이미 파일로 저장되어 있음
        logger.info(f"Translation cache saved ({len(self._cache)} entries)")
        
    def get_supported_languages(self) -> List[str]:
        """지원 언어 목록"""
        return list(LANGUAGE_CODES.keys())
    
    def get_language_encoding(self, lang_code: str) -> str:
        """언어별 권장 인코딩"""
        return LANGUAGE_ENCODINGS.get(lang_code, "utf-8")

# 싱글톤 인스턴스
translation_service = TranslationService()

# Export functions
async def translate(text: str, target_lang: str = "ko", 
                   source_lang: str = None) -> Dict[str, Any]:
    """번역 함수"""
    return await translation_service.translate(text, target_lang, source_lang)

async def translate_batch(texts: List[str], target_lang: str = "ko",
                        source_lang: str = None) -> List[Dict[str, Any]]:
    """배치 번역 함수"""
    return await translation_service.translate_batch(texts, target_lang, source_lang)

def detect_language(text: str) -> str:
    """언어 감지 함수"""
    return translation_service.detect_language(text)