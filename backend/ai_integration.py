# Related files: backend/main.py, backend/models.py
# Location: backend/ai_integration.py

import httpx
import json
from typing import Dict, Any
from datetime import datetime

async def execute_with_lm_studio(code: str, model: str, task_description: str) -> Dict[str, Any]:
    """Execute code modification using LM Studio"""
    if model == "none" or not model:
        return {"code": code, "score": 0}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:1234/v1/completions",
                json={
                    "model": model,
                    "prompt": f"""Task: {task_description}

Current code:
```python
{code}
```

Please provide:
1. Modified code
2. Quality score (0-100)
3. Brief explanation

Format:
CODE:
[modified code here]
SCORE: [number]
EXPLANATION: [brief explanation]
""",
                    "max_tokens": 2000,
                    "temperature": 0.7
                },
                timeout=60.0
            )
            
            if response.status_code == 200:
                result = response.json()
                text = result["choices"][0]["text"].strip()
                
                # Parse response
                code_match = text.find("CODE:")
                score_match = text.find("SCORE:")
                
                if code_match != -1 and score_match != -1:
                    new_code = text[code_match+5:score_match].strip()
                    score_text = text[score_match+6:].split("\n")[0].strip()
                    try:
                        score = float(score_text)
                    except:
                        score = 50
                    
                    return {"code": new_code, "score": score}
                
                return {"code": code, "score": 0}
            else:
                return {"code": code, "score": 0}
    except:
        return {"code": code, "score": 0}

async def get_available_models() -> Dict[str, Any]:
    """Get available LM Studio models"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:1234/v1/models")
            if response.status_code == 200:
                return response.json()
    except:
        pass
    
    return {"data": [
        {"id": "llama-3.1-8b"},
        {"id": "mistral-7b"},
        {"id": "codellama-13b"}
    ]}

async def evaluate_section_with_ai(section_info: Dict[str, Any], model: str) -> str:
    """Use AI to evaluate a section"""
    if model == "none" or not model:
        return "No AI model configured"
    
    evaluation_prompt = f"""Evaluate this production pipeline section:
Section Info: {json.dumps(section_info, indent=2)}

Provide evaluation for each node including:
1. Current status assessment
2. Improvements needed
3. Priority level (high/medium/low)
4. Specific recommendations
"""
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:1234/v1/completions",
                json={
                    "model": model,
                    "prompt": evaluation_prompt,
                    "max_tokens": 2000,
                    "temperature": 0.7
                },
                timeout=60.0
            )
            
            if response.status_code == 200:
                return response.json()["choices"][0]["text"].strip()
            else:
                return "AI evaluation failed"
    except:
        return "AI service unavailable"

def calculate_code_diff(original: str, modified: str) -> Dict[str, Any]:
    """Calculate code differences"""
    original_lines = original.split('\n')
    modified_lines = modified.split('\n')
    
    added = len(modified_lines) - len(original_lines)
    # Simple diff summary - in production, use difflib
    return {
        "linesAdded": max(0, added),
        "linesRemoved": max(0, -added),
        "totalChanges": abs(added)
    }