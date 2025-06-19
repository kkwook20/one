import os
import shutil
import json
import requests
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Set
import time
from datetime import datetime
import re
import ast
from collections import defaultdict

# Token counter (optional)
try:
    import tiktoken
    ENCODER = tiktoken.get_encoding("cl100k_base")
    HAS_TIKTOKEN = True
except ImportError:
    ENCODER = None
    HAS_TIKTOKEN = False


class AdvancedProjectDocumenter:
    """
    2-Phase Project Documentation Tool:
    Phase 1: Complete project structure and dependency analysis
    Phase 2: Context-aware documentation
    """
    
    def __init__(self, source_dir: str, backup_dir: str, api_url: str = "http://127.0.0.1:1234/v1/chat/completions"):
        self.source_dir = Path(source_dir)
        self.backup_dir = Path(backup_dir)
        self.api_url = api_url
        self.max_chars = 14000  # 16000 with buffer
        self.max_tokens = 4000  # Token limit for API responses
        self.file_extensions = ['.py', '.tsx', '.ts', '.jsx', '.js']
        
        # Project-wide context storage
        self.project_structure = {}
        self.file_dependencies = {}
        self.global_context = {}  # Global context
        self.mermaid_diagram = []  # Store mermaid diagram lines
        
        # Retry settings
        self.retry_count = 3
        self.retry_backoff = 2
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        if HAS_TIKTOKEN and ENCODER:
            return len(ENCODER.encode(text))
        else:
            # Approximation: 4 characters per token
            return len(text) // 4
    
    def init_mermaid_diagram(self):
        """Initialize Mermaid diagram file"""
        diagram_file = self.backup_dir / "PROJECT_DIAGRAM.md"
        with open(diagram_file, 'w', encoding='utf-8') as f:
            f.write(f"# {self.backup_dir.name} Project Dependency Diagram\n\n")
            f.write("Generated: " + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + "\n\n")
            f.write("```mermaid\ngraph TD\n")
            f.write("    %% Project structure and dependencies\n")
        self.mermaid_diagram = ["graph TD", "    %% Project structure and dependencies"]
        print("📊 Initialized PROJECT_DIAGRAM.md")
    
    def update_mermaid_diagram(self, content: str):
        """Update Mermaid diagram file by appending content"""
        diagram_file = self.backup_dir / "PROJECT_DIAGRAM.md"
        
        # Read current content
        with open(diagram_file, 'r', encoding='utf-8') as f:
            current_content = f.read()
        
        # If the closing ``` exists, remove it
        if current_content.endswith("```"):
            current_content = current_content[:-3].rstrip()
        
        # Append new content and close
        with open(diagram_file, 'w', encoding='utf-8') as f:
            f.write(current_content)
            f.write("\n" + content)
            f.write("\n```")
        
        # Also update in-memory diagram
        self.mermaid_diagram.append(content)
    
    def generate_mermaid_relationships(self):
        """Generate comprehensive Mermaid relationships from analysis"""
        print("  📊 Generating Mermaid diagram relationships...")
        
        mermaid_nodes = {}
        mermaid_edges = []
        
        # Create simplified node names
        for path in self.file_dependencies:
            node_id = path.replace('\\', '/').replace('/', '_').replace('.', '_')
            node_label = Path(path).name
            mermaid_nodes[path] = (node_id, node_label)
        
        # Generate import relationships
        for path, info in self.file_dependencies.items():
            from_id, from_label = mermaid_nodes[path]
            
            # Add imports
            for imp in info.get('imports', []):
                # Find matching files
                for other_path in self.file_dependencies:
                    if other_path != path:
                        other_stem = Path(other_path).stem
                        if other_stem in imp:
                            to_id, to_label = mermaid_nodes[other_path]
                            edge = f"    {from_id}[{from_label}] -->|imports| {to_id}[{to_label}]"
                            if edge not in mermaid_edges:
                                mermaid_edges.append(edge)
        
        # Update diagram
        content = "\n".join(mermaid_edges[:50])  # Limit to 50 relationships for readability
        if content:
            self.update_mermaid_diagram(content)
        
        print(f"  Added {len(mermaid_edges)} relationships to diagram")
    
    def backup_project(self):
        """Copy original project to backup folder"""
        print(f"📁 Backing up project: {self.source_dir} → {self.backup_dir}")
        
        if self.backup_dir.exists():
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            old_backup = self.backup_dir.parent / f"{self.backup_dir.name}_{timestamp}"
            counter = 0
            while old_backup.exists():
                counter += 1
                old_backup = self.backup_dir.parent / f"{self.backup_dir.name}_{timestamp}_{counter}"
            shutil.move(str(self.backup_dir), str(old_backup))
            print(f"  Moved existing backup to: {old_backup}")
        
        ignore_patterns = shutil.ignore_patterns(
            '__pycache__', '.git', 'node_modules', '*.pyc', 
            'dist', 'build', '.pytest_cache', '.mypy_cache'
        )
        shutil.copytree(self.source_dir, self.backup_dir, ignore=ignore_patterns)
        print("✅ Backup completed!")
    
    def deep_analyze_project(self):
        """Phase 1: Deep analysis of entire project structure and dependencies"""
        print("\n🔬 Starting deep project analysis...")
        
        excluded_dirs = {'__pycache__', '.git', 'node_modules', 'dist', 'build', '.pytest_cache', '.mypy_cache'}
        all_files = []
        
        # Initialize Mermaid diagram
        self.init_mermaid_diagram()
        
        # Collect all files
        for root, dirs, files in os.walk(self.backup_dir):
            dirs[:] = [d for d in dirs if d not in excluded_dirs]
            for file in files:
                if any(file.endswith(ext) for ext in self.file_extensions):
                    file_path = Path(root) / file
                    all_files.append(file_path)
        
        print(f"  Found {len(all_files)} files")
        
        # Analyze each file
        for file_path in all_files:
            self.analyze_single_file(file_path)
        
        # Build project structure
        self.analyze_project_structure()
        
        # Build global context
        self.build_global_context()
        
        # Generate comprehensive Mermaid diagram
        self.generate_mermaid_relationships()
        
        # Save analysis results
        analysis_file = self.backup_dir / "PROJECT_ANALYSIS.json"
        with open(analysis_file, 'w', encoding='utf-8') as f:
            json.dump({
                'structure': self.project_structure,
                'dependencies': self.file_dependencies,
                'global_context': self.global_context
            }, f, indent=2, ensure_ascii=False)
        
        print("✅ Deep analysis completed!")
        return analysis_file
    
    def analyze_project_structure(self):
        """Analyze overall project directory structure"""
        excluded_dirs = {'__pycache__', '.git', 'node_modules', 'dist', 'build', '.pytest_cache', '.mypy_cache'}
        
        for root, dirs, files in os.walk(self.backup_dir):
            dirs[:] = [d for d in dirs if d not in excluded_dirs]
            rel_path = Path(root).relative_to(self.backup_dir)
            self.project_structure[str(rel_path)] = {
                'dirs': dirs,
                'files': [f for f in files if any(f.endswith(ext) for ext in self.file_extensions)]
            }
    
    def analyze_single_file(self, file_path: Path):
        """Analyze structure and dependencies of a single file"""
        rel_path = str(file_path.relative_to(self.backup_dir))
        content = file_path.read_text(encoding='utf-8', errors='ignore')
        
        file_info = {
            'path': rel_path,
            'imports': [],
            'exports': [],
            'classes': [],
            'functions': [],
            'called_functions': [],
            'global_vars': []
        }
        
        if file_path.suffix == '.py':
            file_info.update(self.analyze_python_file(content))
        elif file_path.suffix in ['.tsx', '.ts', '.jsx', '.js']:
            file_info.update(self.analyze_typescript_file(content))
        
        self.file_dependencies[rel_path] = file_info
    
    def analyze_python_file(self, content: str) -> dict:
        """Deep analysis of Python file"""
        info = {
            'imports': [],
            'exports': [],
            'classes': [],
            'functions': [],
            'called_functions': [],
            'global_vars': []
        }
        
        try:
            tree = ast.parse(content)
            
            for node in ast.walk(tree):
                # Import analysis
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        info['imports'].append(alias.name)
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ''
                    for alias in node.names:
                        info['imports'].append(f"{module}.{alias.name}")
                
                # Class analysis
                elif isinstance(node, ast.ClassDef):
                    bases = [self.get_node_name(base) for base in node.bases]
                    methods = [n.name for n in node.body if isinstance(n, ast.FunctionDef)]
                    info['classes'].append({
                        'name': node.name,
                        'bases': bases,
                        'methods': methods
                    })
                
                # Function analysis
                elif isinstance(node, ast.FunctionDef):
                    info['functions'].append({
                        'name': node.name,
                        'args': [arg.arg for arg in node.args.args],
                        'decorators': [self.get_node_name(d) for d in node.decorator_list]
                    })
                
                # Function call analysis
                elif isinstance(node, ast.Call):
                    func_name = self.get_node_name(node.func)
                    if func_name:
                        info['called_functions'].append(func_name)
        
        except SyntaxError:
            # Handle syntax errors gracefully
            import_patterns = [
                r'from\s+(\S+)\s+import',
                r'import\s+(\S+)'
            ]
            for pattern in import_patterns:
                info['imports'].extend(re.findall(pattern, content))
        
        return info
    
    def analyze_typescript_file(self, content: str) -> dict:
        """TypeScript/JavaScript file analysis"""
        info = {
            'imports': [],
            'exports': [],
            'classes': [],
            'functions': [],
            'components': [],  # React components
            'called_functions': []
        }
        
        # Import analysis
        import_patterns = [
            r'import\s+(?:{[^}]+}|[\w\s,]+)\s+from\s+[\'"](.+?)[\'"]',
            r'require\s*\([\'"](.+?)[\'"]\)',
            r'import\s*\([\'"](.+?)[\'"]\)'
        ]
        for pattern in import_patterns:
            matches = re.findall(pattern, content)
            if matches:
                info['imports'].extend(matches)
        
        # Export analysis - Fixed to handle different result types
        # Pattern 1: named exports
        export_pattern1 = r'export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)'
        matches1 = re.findall(export_pattern1, content)
        if matches1:
            info['exports'].extend(matches1)
        
        # Pattern 2: export list
        export_pattern2 = r'export\s*{\s*([^}]+)\s*}'
        matches2 = re.findall(export_pattern2, content)
        for match in matches2:
            # Split the export list and clean each item
            exports = [item.strip() for item in match.split(',') if item.strip()]
            info['exports'].extend(exports)
        
        # Class analysis
        class_pattern = r'class\s+(\w+)(?:\s+extends\s+(\w+))?'
        for match in re.finditer(class_pattern, content):
            info['classes'].append({
                'name': match.group(1),
                'extends': match.group(2) or None
            })
        
        # Function/Component analysis
        function_patterns = [
            r'function\s+(\w+)',
            r'const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>',
            r'const\s+(\w+)\s*=\s*function'
        ]
        for pattern in function_patterns:
            functions = re.findall(pattern, content)
            for func in functions:
                # React components identified by capital first letter
                if func[0].isupper():
                    info['components'].append(func)
                else:
                    info['functions'].append(func)
        
        return info
    
    def get_node_name(self, node) -> str:
        """Extract name from AST node"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self.get_node_name(node.value)}.{node.attr}"
        elif hasattr(node, 'id'):
            return node.id
        return ""
    
    def build_global_context(self):
        """Build global project context"""
        print("  🧩 Building global project context...")
        
        # 1. Find entry points
        entry_points = []
        for path, info in self.file_dependencies.items():
            if 'main' in path.lower() or 'index' in path.lower() or 'app' in path.lower():
                entry_points.append(path)
        
        # 2. Identify core modules
        core_modules = []
        import_counts = defaultdict(int)
        for path, info in self.file_dependencies.items():
            # Count how many times this file is imported
            for other_path, other_info in self.file_dependencies.items():
                if path != other_path:
                    for imp in other_info['imports']:
                        if path.replace('\\', '/') in imp or Path(path).stem in imp:
                            import_counts[path] += 1
        
        # Top 10 most imported modules
        core_modules = sorted(import_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # 3. Detect architecture patterns
        patterns = []
        
        # MVC pattern detection
        has_models = any('model' in path.lower() for path in self.file_dependencies)
        has_views = any('view' in path.lower() or 'component' in path.lower() for path in self.file_dependencies)
        has_controllers = any('controller' in path.lower() or 'handler' in path.lower() for path in self.file_dependencies)
        if has_models and has_views and has_controllers:
            patterns.append("MVC/MVP")
        
        # API pattern detection
        has_routes = any('route' in path.lower() or 'api' in path.lower() for path in self.file_dependencies)
        if has_routes:
            patterns.append("REST API")
        
        self.global_context = {
            'entry_points': entry_points,
            'core_modules': [{'path': path, 'import_count': count} for path, count in core_modules],
            'architecture_patterns': patterns,
            'total_files': len(self.file_dependencies),
            'languages': self.detect_languages()
        }
    
    def detect_languages(self) -> dict:
        """Detect language distribution in the project"""
        lang_counts = defaultdict(int)
        for path in self.file_dependencies:
            ext = Path(path).suffix
            if ext == '.py':
                lang_counts['Python'] += 1
            elif ext in ['.ts', '.tsx']:
                lang_counts['TypeScript'] += 1
            elif ext in ['.js', '.jsx']:
                lang_counts['JavaScript'] += 1
        
        total = sum(lang_counts.values())
        if total > 0:
            return {lang: f"{(count/total)*100:.1f}%" for lang, count in lang_counts.items()}
        return {}
    
    def call_ai_api(self, prompt: str, system_message: str = "") -> str:
        """Call DeepSeek API locally with retry logic"""
        headers = {"Content-Type": "application/json"}
        
        messages = []
        if system_message:
            messages.append({"role": "system", "content": system_message})
        messages.append({"role": "user", "content": prompt})
        
        data = {
            "model": "deepseek-coder-33b-instruct",
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": self.max_tokens,
            "stream": False
        }
        
        for attempt in range(1, self.retry_count + 1):
            try:
                response = requests.post(self.api_url, headers=headers, json=data, timeout=90)
                response.raise_for_status()
                return response.json()['choices'][0]['message']['content']
            except Exception as e:
                wait_time = self.retry_backoff ** attempt
                print(f"  ⚠️ API call failed (attempt {attempt}/{self.retry_count}): {e}")
                if attempt < self.retry_count:
                    print(f"  Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"  ❌ All retries failed. Returning empty string.")
                    return ""
    
    def document_file_with_context(self, file_path: Path):
        """Phase 2: Document file with full project context"""
        rel_path = str(file_path.relative_to(self.backup_dir))
        print(f"\n📝 Documenting with context: {rel_path}")
        
        content = file_path.read_text(encoding='utf-8', errors='ignore')
        file_info = self.file_dependencies.get(rel_path, {})
        
        # Find related files
        related_files = self.find_related_files(rel_path)
        
        # Read current Mermaid diagram
        diagram_file = self.backup_dir / "PROJECT_DIAGRAM.md"
        current_diagram = ""
        if diagram_file.exists():
            with open(diagram_file, 'r', encoding='utf-8') as f:
                current_diagram = f.read()
        else:
            current_diagram = "No diagram generated yet"
        
        # Full project context information
        context_info = f"""
=== PROJECT CONTEXT ===
Project Name: {self.backup_dir.name}
Total Files: {self.global_context.get('total_files', 0)}
Primary Languages: {', '.join(self.global_context.get('languages', {}).keys())}
Architecture Patterns: {', '.join(self.global_context.get('architecture_patterns', []))}

=== CURRENT FILE INFO ===
File: {rel_path}
Type: {file_path.suffix}
Files that import this: {', '.join(related_files['imported_by'][:5])}
Modules imported by this file: {', '.join(file_info.get('imports', [])[:10])}
Classes defined: {', '.join([c['name'] for c in file_info.get('classes', [])])}
Functions defined: {', '.join([f.get('name', f) if isinstance(f, dict) else f for f in file_info.get('functions', [])][:10])}

=== RELATIONSHIP WITH CORE MODULES ===
"""
        # Add relationship with core modules
        for core_module in self.global_context.get('core_modules', [])[:5]:
            if core_module['path'] in file_info.get('imports', []):
                context_info += f"- Uses {core_module['path']} (core module, referenced {core_module['import_count']} times)\n"
        
        # Add current Mermaid diagram context
        context_info += f"\n=== CURRENT MERMAID DIAGRAM ===\n{current_diagram[:1000]}..."  # First 1000 chars
        
        # Enhanced system message in English
        system_message = f"""You are an expert code documentation AI.
You have complete understanding of the entire project structure and dependencies.

Analyze the given code and:
1. Add a comprehensive file header explaining this file's role in the overall project
2. Clearly document relationships with other modules
3. Add clear docstrings to all classes and functions
4. Add inline comments for complex logic
5. Consider how other files use this code when writing documentation
6. Write all comments and documentation in English

IMPORTANT: After documenting the code, you MUST also provide Mermaid diagram updates showing this file's relationships with other files. 
Format the Mermaid updates as:

MERMAID_UPDATE_START
    node_{rel_path.replace('/', '_').replace('.', '_')}[{file_path.name}] -->|relationship| nodeB[otherfile.py]
    nodeC[somefile.py] -->|uses| node_{rel_path.replace('/', '_').replace('.', '_')}[{file_path.name}]
MERMAID_UPDATE_END

Emphasize the following:
- This file's role in the overall architecture
- How it interacts with other modules
- Its relationship to main entry points

DO NOT modify the original code structure or logic, only add comments and documentation."""
        
        # Split file if needed
        chunks = self.split_file_content(content, context_info)
        
        if len(chunks) == 1:
            # Small files processed at once
            node_id = rel_path.replace('/', '_').replace('\\', '_').replace('.', '_')
            prompt = f"""{context_info}

Full code:
```{file_path.suffix[1:]}
{content}
```

Please:
1. Add comprehensive comments and documentation to this code, considering the entire project context.
2. Provide Mermaid diagram updates showing this file's relationships.

Remember to format Mermaid updates as:
MERMAID_UPDATE_START
    node_{node_id}[{file_path.name}] -->|imports| nodeX[imported_module.ext]
    nodeY[other_file.ext] -->|uses| node_{node_id}[{file_path.name}]
MERMAID_UPDATE_END"""
            
            documented_content = self.call_ai_api(prompt, system_message)
        else:
            # Large files processed in chunks
            documented_parts = []
            node_id = rel_path.replace('/', '_').replace('\\', '_').replace('.', '_')
            
            for i, (chunk_content, start, end) in enumerate(chunks):
                if i == 0:
                    # First chunk - ask for Mermaid updates
                    chunk_prompt = f"""{context_info}

Code section ({i+1}/{len(chunks)}, lines {start+1}-{end}):
```{file_path.suffix[1:]}
{chunk_content}
```

Please:
1. Add comments to this section, considering the overall context.
2. Since this is the first section, also provide Mermaid diagram updates for this file's relationships.

Remember to format Mermaid updates as:
MERMAID_UPDATE_START
    node_{node_id}[{file_path.name}] -->|imports| nodeX[imported_module.ext]
MERMAID_UPDATE_END"""
                else:
                    # Other chunks - just documentation
                    chunk_prompt = f"""{context_info}

Code section ({i+1}/{len(chunks)}, lines {start+1}-{end}):
```{file_path.suffix[1:]}
{chunk_content}
```

Please add comments to this section, considering the overall context."""
                
                documented_parts.append(self.call_ai_api(chunk_prompt, system_message))
                time.sleep(1)
            
            documented_content = '\n'.join(documented_parts)
        
        # Extract code and save
        code_match = re.search(r'```(?:\w+)?\n(.*?)```', documented_content, re.DOTALL)
        if code_match:
            documented_code = code_match.group(1)
        else:
            documented_code = documented_content
        
        # Extract Mermaid updates
        mermaid_match = re.search(r'MERMAID_UPDATE_START\n(.*?)MERMAID_UPDATE_END', documented_content, re.DOTALL)
        if mermaid_match:
            mermaid_updates = mermaid_match.group(1).strip()
            if mermaid_updates:
                self.update_mermaid_diagram(mermaid_updates)
                print(f"  📊 Updated Mermaid diagram with relationships")
        
        if not documented_code.strip():
            print(f"  ⚠️ Warning: Empty response. Keeping original: {file_path.name}")
            return
        
        file_path.write_text(documented_code, encoding='utf-8')
        print(f"✅ Context-aware documentation completed: {file_path.name}")
    
    def find_related_files(self, target_path: str) -> dict:
        """Find other files related to a specific file"""
        related = {
            'imported_by': [],
            'imports': [],
            'same_module': []
        }
        
        target_stem = Path(target_path).stem
        target_dir = str(Path(target_path).parent)
        
        for path, info in self.file_dependencies.items():
            if path == target_path:
                continue
            
            # Files that import this file
            for imp in info.get('imports', []):
                if target_stem in imp or target_path.replace('\\', '/') in imp:
                    related['imported_by'].append(path)
            
            # Files in the same directory
            if str(Path(path).parent) == target_dir:
                related['same_module'].append(path)
        
        return related
    
    def split_file_content(self, content: str, file_info: str) -> List[Tuple[str, int, int]]:
        """Split file content into appropriate chunks (token-based)"""
        lines = content.split('\n')
        chunks = []
        current_chunk = []
        current_size = 0
        start_line = 0
        
        if HAS_TIKTOKEN:
            max_size = 3500 - self.count_tokens(file_info) - 200  # Use fixed value with buffer
            size_func = self.count_tokens
        else:
            max_size = self.max_chars - len(file_info) - 1000
            size_func = len
        
        for i, line in enumerate(lines):
            line_size = size_func(line) + 1
            
            if current_size + line_size > max_size and current_chunk:
                # Save current chunk
                chunks.append(('\n'.join(current_chunk), start_line, i))
                current_chunk = [line]
                current_size = line_size  # Reset to just the new line size
                start_line = i
            else:
                current_chunk.append(line)
                current_size += line_size
        
        # Last chunk
        if current_chunk:
            chunks.append(('\n'.join(current_chunk), start_line, len(lines)))
        
        return chunks
    
    def create_enhanced_overview(self):
        """Generate enhanced project overview document"""
        print("\n📚 Creating enhanced project overview...")
        
        # Dependency graph for the overview
        dependency_graph = []
        for path, info in self.file_dependencies.items():
            for imp in info.get('imports', []):
                # Find internal module dependencies
                for other_path in self.file_dependencies:
                    if Path(other_path).stem in imp:
                        dependency_graph.append({
                            'from': path,
                            'to': other_path,
                            'type': 'import'
                        })
        
        # Read current Mermaid diagram
        diagram_file = self.backup_dir / "PROJECT_DIAGRAM.md"
        current_diagram = ""
        if diagram_file.exists():
            with open(diagram_file, 'r', encoding='utf-8') as f:
                current_diagram = f.read()
        else:
            current_diagram = "No diagram generated yet"
        
        prompt = f"""Project Analysis Results:

=== Basic Information ===
{json.dumps(self.global_context, indent=2, ensure_ascii=False)}

=== File Details (Top 20) ===
{json.dumps(dict(list(self.file_dependencies.items())[:20]), indent=2, ensure_ascii=False)}

=== Dependency Graph (Top 30) ===
{json.dumps(dependency_graph[:30], indent=2, ensure_ascii=False)}

=== Current Mermaid Diagram ===
{current_diagram}

Based on this information, please:

1. Create a comprehensive project documentation in Markdown including:
   - **Project Overview**: Main purpose, functionality, and technology stack
   - **Directory Structure**: Role of each major directory and key files
   - **Key Components**: Role of each core module and how they interact
   - **Data Flow**: Main data flows and API endpoints (if any)
   - **Getting Started**: How to run the project and main entry points

2. IMPORTANT: Provide an ENHANCED and COMPLETE Mermaid diagram that shows:
   - All major module relationships
   - Clear grouping by functionality (subgraphs)
   - Different edge types for different relationships (imports, extends, implements, uses)
   - Color coding for different module types

Format the enhanced Mermaid diagram as:
FINAL_MERMAID_START
graph TD
    subgraph "Core Modules"
        ...
    end
    subgraph "API Layer"
        ...
    end
    ... (complete diagram)
FINAL_MERMAID_END"""
        
        system_message = """You are a software architecture expert and technical documentation writer.
Your goal is to explain complex project structures clearly and comprehensibly.
Create a complete and well-organized Mermaid diagram that visualizes the entire project architecture."""
        
        overview = self.call_ai_api(prompt, system_message)
        
        # Extract and save final Mermaid diagram
        final_mermaid_match = re.search(r'FINAL_MERMAID_START\n(.*?)FINAL_MERMAID_END', overview, re.DOTALL)
        if final_mermaid_match:
            final_diagram = final_mermaid_match.group(1).strip()
            diagram_file = self.backup_dir / "PROJECT_DIAGRAM.md"
            with open(diagram_file, 'w', encoding='utf-8') as f:
                f.write(f"# {self.backup_dir.name} Complete Project Dependency Diagram\n\n")
                f.write("Generated: " + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + "\n\n")
                f.write("```mermaid\n")
                f.write(final_diagram)
                f.write("\n```")
            print("  📊 Finalized complete PROJECT_DIAGRAM.md")
        
        # Save overview document
        overview_file = self.backup_dir / "PROJECT_OVERVIEW_ENHANCED.md"
        with open(overview_file, 'w', encoding='utf-8') as f:
            f.write(f"# {self.backup_dir.name} Project Analysis\n\n")
            f.write("Generated: " + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + "\n")
            f.write("Analysis Tool: Advanced Project Documenter v2.0\n\n")
            # Remove the Mermaid extraction markers from overview
            clean_overview = re.sub(r'FINAL_MERMAID_START.*?FINAL_MERMAID_END', '', overview, flags=re.DOTALL)
            f.write(clean_overview)
        
        print(f"✅ Enhanced project overview created: {overview_file}")
    
    def create_comprehensive_review(self):
        """Generate comprehensive technical review and improvement suggestions"""
        print("\n🔍 Creating comprehensive technical review...")
        
        # Collect all analysis data
        all_files_data = []
        code_patterns = {
            'duplicate_imports': defaultdict(list),
            'similar_functions': [],
            'unused_files': [],
            'circular_dependencies': [],
            'large_files': [],
            'missing_docstrings': []
        }
        
        # Analyze patterns across all files
        for path, info in self.file_dependencies.items():
            file_path = self.backup_dir / path
            if file_path.exists():
                content = file_path.read_text(encoding='utf-8', errors='ignore')
                lines = content.split('\n')
                
                # Check for large files
                if len(lines) > 500:
                    code_patterns['large_files'].append({
                        'file': path,
                        'lines': len(lines)
                    })
                
                # Track imports for duplication
                for imp in info.get('imports', []):
                    code_patterns['duplicate_imports'][imp].append(path)
                
                # Check for missing docstrings
                if info.get('classes') or info.get('functions'):
                    if '"""' not in content[:200]:  # Simple check for file-level docstring
                        code_patterns['missing_docstrings'].append(path)
                
                all_files_data.append({
                    'path': path,
                    'size': len(content),
                    'lines': len(lines),
                    'imports': len(info.get('imports', [])),
                    'classes': len(info.get('classes', [])),
                    'functions': len(info.get('functions', []))
                })
        
        # Find circular dependencies
        for path1, info1 in self.file_dependencies.items():
            for imp in info1.get('imports', []):
                for path2, info2 in self.file_dependencies.items():
                    if path1 != path2 and Path(path2).stem in imp:
                        # Check if path2 also imports path1
                        for imp2 in info2.get('imports', []):
                            if Path(path1).stem in imp2:
                                circular = sorted([path1, path2])
                                if circular not in code_patterns['circular_dependencies']:
                                    code_patterns['circular_dependencies'].append(circular)
        
        # Read current diagram for architecture analysis
        diagram_file = self.backup_dir / "PROJECT_DIAGRAM.md"
        current_diagram = ""
        if diagram_file.exists():
            with open(diagram_file, 'r', encoding='utf-8') as f:
                current_diagram = f.read()
        else:
            current_diagram = "No diagram generated yet"
        
        # Prepare comprehensive prompt
        prompt = f"""Based on the complete analysis of this project, provide a comprehensive technical review.

=== PROJECT STATISTICS ===
Total Files: {len(all_files_data)}
Total Lines of Code: {sum(f['lines'] for f in all_files_data)}
Languages: {json.dumps(self.global_context.get('languages', {}), indent=2)}
Architecture Patterns: {', '.join(self.global_context.get('architecture_patterns', []))}

=== CODE PATTERNS DETECTED ===
Large Files (>500 lines): {json.dumps(code_patterns['large_files'][:10], indent=2)}
Circular Dependencies: {json.dumps(code_patterns['circular_dependencies'], indent=2)}
Most Imported Modules: {json.dumps([(k, len(v)) for k, v in sorted(code_patterns['duplicate_imports'].items(), key=lambda x: len(x[1]), reverse=True)][:20], indent=2)}
Files Missing Docstrings: {len(code_patterns['missing_docstrings'])}

=== FILE ANALYSIS (Top 30 files by size) ===
{json.dumps(sorted(all_files_data, key=lambda x: x['size'], reverse=True)[:30], indent=2)}

=== DEPENDENCY STRUCTURE ===
Entry Points: {json.dumps(self.global_context.get('entry_points', []), indent=2)}
Core Modules: {json.dumps(self.global_context.get('core_modules', [])[:10], indent=2)}

=== ARCHITECTURE DIAGRAM ===
{current_diagram[:2000]}

Please provide a COMPREHENSIVE technical review including:

# Technical Review: {self.backup_dir.name}

## 1. Architecture Analysis
- Overall architecture assessment
- Strengths of current design
- Weaknesses and anti-patterns
- Compliance with best practices (SOLID, DRY, etc.)

## 2. Structural Issues
- Module organization problems
- Circular dependencies analysis
- Coupling and cohesion issues
- Missing abstraction layers

## 3. Code Quality Issues
- Code duplication and redundancy
- Overly complex functions/classes
- Inconsistent coding patterns
- Technical debt indicators

## 4. Performance Concerns
- Potential bottlenecks
- Inefficient algorithms or data structures
- Resource management issues
- Scalability limitations

## 5. Security Vulnerabilities
- Common security pitfalls
- Input validation issues
- Authentication/authorization concerns
- Data exposure risks

## 6. Maintainability Problems
- Poor documentation areas
- Complex dependencies
- Hard-to-test components
- Version control issues

## 7. Specific Improvements

### 7.1 Immediate Actions (Quick Wins)
- List specific files to refactor
- Simple optimizations
- Documentation gaps to fill

### 7.2 Short-term Improvements (1-2 weeks)
- Module restructuring suggestions
- Code consolidation opportunities
- Testing additions

### 7.3 Long-term Refactoring (1-3 months)
- Architecture redesign proposals
- Technology stack updates
- Major refactoring projects

## 8. Code Examples

Provide SPECIFIC examples of problematic code and their improved versions:

### Example 1: [Issue Name]
**Current Code (file: path/to/file.py):**
```python
# problematic code
```

**Improved Version:**
```python
# better implementation
```

**Explanation:** Why this is better...

(Include at least 5 concrete examples)

## 9. Redundancy Analysis
- Duplicate code blocks
- Similar functions that could be merged
- Overlapping functionality between modules

## 10. Best Practices Recommendations
- Coding standards to adopt
- Design patterns to implement
- Tools and libraries to consider

## 11. Testing Strategy
- Current test coverage assessment
- Critical areas needing tests
- Testing framework recommendations

## 12. Migration Path
Step-by-step plan to implement improvements without disrupting development

Be SPECIFIC, DETAILED, and ACTIONABLE in all recommendations. Include file paths, function names, and line numbers where applicable."""
        
        system_message = """You are a senior software architect and code reviewer with 20+ years of experience.
You excel at identifying architectural flaws, code smells, and providing actionable improvement strategies.
Your reviews are thorough, constructive, and focus on practical solutions.
You always provide specific code examples and clear migration paths."""
        
        # Get comprehensive review
        review = self.call_ai_api(prompt, system_message)
        
        # Save review document
        review_file = self.backup_dir / "PROJECT_REVIEW.md"
        with open(review_file, 'w', encoding='utf-8') as f:
            f.write(f"# Comprehensive Technical Review\n\n")
            f.write(f"**Project:** {self.backup_dir.name}\n")
            f.write("**Generated:** " + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + "\n")
            f.write("**Reviewer:** Advanced Project Documenter v2.0\n\n")
            f.write("---\n\n")
            f.write(review)
            f.write("\n\n---\n\n")
            f.write("## Appendix: Analysis Metrics\n\n")
            f.write(f"- Total Files Analyzed: {len(all_files_data)}\n")
            f.write(f"- Total Lines of Code: {sum(f['lines'] for f in all_files_data):,}\n")
            f.write(f"- Circular Dependencies Found: {len(code_patterns['circular_dependencies'])}\n")
            f.write(f"- Large Files (>500 lines): {len(code_patterns['large_files'])}\n")
            f.write(f"- Files Missing Documentation: {len(code_patterns['missing_docstrings'])}\n")
        
        print(f"✅ Comprehensive technical review created: {review_file}")
    
    def run(self):
        """Execute entire process"""
        print(f"🚀 Advanced Project Documentation Started (2-Phase Analysis)")
        print(f"   Source: {self.source_dir}")
        print(f"   Target: {self.backup_dir}")
        print(f"   API: {self.api_url}")
        
        start_time = time.time()
        
        # 1. Backup
        self.backup_project()
        
        # 2. Phase 1: Deep project analysis
        print("\n=== Phase 1: Deep Project Analysis ===")
        self.deep_analyze_project()
        
        # 3. Phase 2: Context-aware documentation
        print("\n=== Phase 2: Context-Aware Documentation ===")
        file_count = 0
        excluded_dirs = {'__pycache__', '.git', 'node_modules', 'dist', 'build', '.pytest_cache', '.mypy_cache'}
        
        # Sort files by importance (core modules first)
        files_by_importance = []
        
        # Entry points first
        for entry in self.global_context.get('entry_points', []):
            file_path = self.backup_dir / entry
            if file_path.exists():
                files_by_importance.append(file_path)
        
        # Core modules
        for core in self.global_context.get('core_modules', []):
            file_path = self.backup_dir / core['path']
            if file_path.exists() and file_path not in files_by_importance:
                files_by_importance.append(file_path)
        
        # Remaining files
        for root, dirs, files in os.walk(self.backup_dir):
            dirs[:] = [d for d in dirs if d not in excluded_dirs]
            for file in files:
                if any(file.endswith(ext) for ext in self.file_extensions):
                    file_path = Path(root) / file
                    if file_path not in files_by_importance:
                        files_by_importance.append(file_path)
        
        # Document files
        for file_path in files_by_importance:
            self.document_file_with_context(file_path)
            file_count += 1
            
            if file_count % 5 == 0:
                print(f"\n⏸️  Taking a break... ({file_count} files processed)")
                time.sleep(3)
        
        # 4. Enhanced project overview
        self.create_enhanced_overview()
        
        # 5. Comprehensive technical review
        self.create_comprehensive_review()
        
        elapsed_time = time.time() - start_time
        print(f"\n✨ All tasks completed!")
        print(f"   Files processed: {file_count}")
        print(f"   Time elapsed: {elapsed_time:.1f}s")
        print(f"   Generated documents:")
        print(f"   - PROJECT_ANALYSIS.json (Full analysis results)")
        print(f"   - PROJECT_DIAGRAM.md (Complete dependency diagram)")
        print(f"   - PROJECT_OVERVIEW_ENHANCED.md (Enhanced overview)")
        print(f"   - PROJECT_REVIEW.md (Comprehensive technical review)")


# Run
if __name__ == "__main__":
    if HAS_TIKTOKEN:
        print("✅ tiktoken available - accurate token counting enabled")
    else:
        print("⚠️ tiktoken not installed - using approximation (pip install tiktoken recommended)")
    
    documenter = AdvancedProjectDocumenter(
        source_dir=r"F:\ONE_AI",
        backup_dir=r"F:\ONE_AI_Backup",
        api_url="http://127.0.0.1:1234/v1/chat/completions"
    )
    
    documenter.run()