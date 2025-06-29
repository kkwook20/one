# backend/routers/argosa/code/__init__.py

"""
Code Analysis Module - AI-powered code analysis and generation system

This module provides:
- Deep project analysis with AST parsing
- Code generation with AI collaboration
- Real-time collaboration between AI agents
- Code validation and quality checks
"""

from .models import (
    CodeEntity,
    ArchitecturePattern,
    CodeGenerationPlan,
    CodeFragment
)

from .project_analyzer import AdvancedProjectAnalyzer
from .code_generator import AdvancedCodeGenerationEngine
from .collaboration import RealtimeCodeCollaborationSystem
from .validators import (
    validate_syntax,
    validate_style,
    validate_complexity,
    validate_security,
    validate_performance
)

__all__ = [
    # Models
    'CodeEntity',
    'ArchitecturePattern',
    'CodeGenerationPlan',
    'CodeFragment',
    
    # Classes
    'AdvancedProjectAnalyzer',
    'AdvancedCodeGenerationEngine',
    'RealtimeCodeCollaborationSystem',
    
    # Validators
    'validate_syntax',
    'validate_style',
    'validate_complexity',
    'validate_security',
    'validate_performance'
]