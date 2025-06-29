# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 CRITICAL ENVIRONMENT INFORMATION 🚨

**YOU ARE RUNNING IN WSL (Windows Subsystem for Linux) ENVIRONMENT!**

### 🔄 AUTO-CHECK ENVIRONMENT ON STARTUP

**IMPORTANT**: When you start working on this project, ALWAYS run the environment check first:
```bash
./check_env.sh
```
This will show you the current environment status and server connectivity.

### 📍 Environment Details:

- **Current Directory**: `/mnt/f/ONE_AI` (This is Windows F: drive mounted in WSL)
- **Environment**: Ubuntu on WSL2 (NOT native Windows, NOT native Linux)
- **Python Path**: `/usr/bin/python3` (symlinked to `python`)
- **Important Paths**:
  - Windows Path: `F:\ONE_AI`
  - WSL Path: `/mnt/f/ONE_AI`
  - Backend Server: Runs in **Windows** (NOT WSL) via `One.bat`
  - Frontend: Runs in **Windows** (NOT WSL)

### ⚠️ CRITICAL RULES FOR WSL ENVIRONMENT:

1. **DO NOT start servers in WSL** - They are already running in Windows!
2. **DO NOT use Windows paths** (like `F:\` or `C:\`) - Use `/mnt/f/` or `/mnt/c/`
3. **File operations use Linux commands** (ls, cat, grep, etc.)
4. **Network requests to localhost:8000** work because WSL shares network with Windows
5. **Use `python` or `python3`** for Python commands (both work now)
6. **ALWAYS run `./check_env.sh` when starting a new session**
7. **ALWAYS check backend logs** - Detailed logs are available at `./logs/backend_detailed.log`

### 🌐 WSL Network Configuration:

**IMPORTANT**: WSL2 uses a dynamic IP address for the Windows host. When accessing services running on Windows from WSL:

- **Backend API (port 8000)**: Use the Windows host IP instead of localhost
- **Frontend (port 3000)**: Use the Windows host IP instead of localhost
- **To get the Windows host IP**: 
  ```bash
  # Method 1: From /etc/resolv.conf
  cat /etc/resolv.conf | grep nameserver | awk '{print $2}'
  
  # Method 2: From IP route
  ip route | grep default | awk '{print $3}'
  ```

- **Example API calls from WSL**:
  ```bash
  # Replace 172.31.64.1 with your actual Windows host IP
  curl http://172.31.64.1:8000/api/argosa/data/system/state
  curl http://172.31.64.1:3000  # Frontend
  ```

- **The environment check script (`./check_env.sh`) automatically detects and uses the correct IP**

## Current Focus: Argosa Data Analysis Module

**Priority**: Working on `/backend/routers/argosa/data_analysis.py` - the AI agent and data analysis system.

### Module Overview

The data_analysis.py module is the core of Argosa's AI-powered analysis system, featuring:
- **AI Agent System**: Multiple specialized agents for different analysis tasks
- **Workflow Management**: State-based workflow execution with LangGraph
- **Real-time Analytics**: Live data processing and visualization
- **Distributed AI**: Agent coordination and communication
- **RAG Integration**: Context-aware analysis using vector database

### Key Components in data_analysis.py

1. **Agent Types** (from analysis/configs.py):
   - Data Analyst Agent
   - Web Research Agent
   - Code Generator Agent
   - Report Writer Agent
   - Trend Predictor Agent
   - System Monitor Agent

2. **Main Classes & Functions**:
   - `DataAnalysisRouter` - Main router class with WebSocket support
   - `AgentState` - State management for agent workflows
   - `WorkflowState` - Workflow execution state
   - Agent execution methods (analyze, research, generate, etc.)
   - Real-time dashboard updates via WebSocket

3. **Dependencies**:
   - LangGraph for workflow orchestration
   - Plotly for visualizations
   - Pandas/NumPy for data processing
   - httpx for external API calls
   - RAG service for context retrieval

### Development Commands

**⚠️ IMPORTANT: DO NOT start the Python server in WSL for testing!**
The application is already running in a Windows environment. Starting another server instance in WSL will cause conflicts and errors.

```bash
# These commands are for reference only - DO NOT RUN in WSL:
# cd backend
# python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --no-access-log

# To start the application properly, use One.bat in Windows Command Prompt/PowerShell
```

### 📋 Backend Logging and Debugging

**CRITICAL**: ALWAYS check backend logs when debugging issues!

#### Log File Location:
```bash
# Detailed backend logs (recommended for debugging)
tail -f ./logs/backend_detailed.log

# View recent logs
tail -100 ./logs/backend_detailed.log

# Search for specific errors
grep -i "error\|exception\|failed" ./logs/backend_detailed.log | tail -20

# Search for Firefox manager logs
grep -i "firefox" ./logs/backend_detailed.log | tail -20

# Search for extension connection logs
grep -i "extension\|native" ./logs/backend_detailed.log | tail -20
```

#### Log Content Includes:
- Firefox manager initialization and status
- Native messaging communication
- Extension connection events
- API endpoint calls with detailed parameters
- Error stack traces with file and line numbers
- State management updates

**When debugging Firefox extension issues, ALWAYS check the logs first!**

### Current Architecture

```
data_analysis.py
├── Imports from analysis/ submodules
│   ├── configs.py (AGENT_CONFIGS, WORKFLOW_PHASES)
│   ├── prompts.py (AGENT_PROMPTS)
│   ├── helpers.py (utility functions)
│   └── distributed_ai.py (agent coordination)
├── DataAnalysisRouter class
│   ├── WebSocket endpoints (/ws/agent/{agent_id})
│   ├── REST endpoints for agent management
│   └── Workflow execution methods
└── Integration with RAG service
```

### Key API Endpoints

- `POST /api/argosa/data-analysis/agents` - Create new agent
- `GET /api/argosa/data-analysis/agents` - List all agents
- `POST /api/argosa/data-analysis/agents/{agent_id}/execute` - Execute agent task
- `POST /api/argosa/data-analysis/workflows` - Create workflow
- `GET /api/argosa/data-analysis/dashboard` - Get dashboard data
- `WS /api/argosa/data-analysis/ws/agent/{agent_id}` - WebSocket connection

### Working with the Module

1. **Adding New Agent Types**:
   - Define in `analysis/configs.py` under `EnhancedAgentType`
   - Add prompts in `analysis/prompts.py`
   - Implement execution logic in data_analysis.py

2. **Modifying Workflows**:
   - Update `WORKFLOW_PHASES` in configs.py
   - Adjust state transitions in workflow methods
   - Update validation in helpers.py

3. **Testing Agents**:
   ```python
   # Test agent execution
   curl -X POST http://localhost:8000/api/argosa/data-analysis/agents \
     -H "Content-Type: application/json" \
     -d '{"name": "Test Agent", "type": "data_analyst"}'
   ```

### Important Patterns

1. **State Management**: All agents use StateGraph from LangGraph
2. **Error Handling**: Comprehensive try-catch with specific error messages
3. **Async Operations**: All I/O operations are async
4. **WebSocket Updates**: Real-time updates for connected clients
5. **RAG Integration**: Context retrieval for informed analysis

### Current Issues to Focus On

1. Large file size (26k+ tokens) - consider splitting into smaller modules
2. WebSocket connection management and cleanup
3. Agent performance optimization
4. Workflow state persistence
5. Better error recovery mechanisms

### File Locations

- Main module: `/backend/routers/argosa/data_analysis.py`
- Configs: `/backend/routers/argosa/analysis/configs.py`
- Prompts: `/backend/routers/argosa/analysis/prompts.py`
- Helpers: `/backend/routers/argosa/analysis/helpers.py`
- Settings: `/backend/routers/argosa/analysis/settings/analysis_settings.json`

### Testing

**🚀 AUTOMATED TEST SYSTEM WITH FULL E2E BROWSER AUTOMATION**

The test system now automatically:
- ✅ Starts backend server in background (One.bat)
- ✅ Starts frontend React app (npm start)
- ✅ Runs browser automation tests with Selenium
- ✅ Tests user scenarios (project creation, AI features, etc.)

```python
# Primary testing interface for Claude Code - Simple one-line commands
from test import run_test, test_now, check_status, test_everything

# Full automated test (servers + browser E2E)
test_everything()  # Starts servers automatically and runs all tests

# Run test with output (normal mode)
run_test()

# Run test silently in background (no windows)
test_now()

# Check server and system status
check_status()

# Start servers only (backend + frontend)
from test import start_servers
start_servers()  # Starts both servers in background

# Browser E2E tests
from test import test_browser_only, test_browser_visible
test_browser_only()     # Headless browser tests
test_browser_visible()  # Shows browser window during test

# Test specific components
from test import test_llm_only, test_crawler_only, test_youtube_only
test_llm_only()     # Test LLM conversation collection
test_crawler_only() # Test web crawler
test_youtube_only() # Test YouTube analysis
```

**🤖 NEW: Automatic Fix Commands**:
```python
# Test with automatic error fixing (recommended for Claude Code)
from test import test_with_auto_fix
test_with_auto_fix()  # Automatically retries with fixes when tests fail

# Get detailed error report with fix recommendations
from test import get_error_report
print(get_error_report())

# View fix statistics and success rates
from test import get_fix_statistics
stats = get_fix_statistics()
print(f"Success rate: {stats['success_rate']}%")

# Analyze error patterns
from test import analyze_error_patterns
patterns = analyze_error_patterns()

# Self-check the test system
from test import verify_test_system
verify_test_system()  # Checks test system health
```

**Advanced Testing Commands**:
```python
# Primary testing interface for error analysis
from test.claude_code_tester import test_and_fix, verify_my_fix

# After modifying code, run comprehensive test
result = await test_and_fix(["backend/routers/argosa/data_analysis.py"])
print(result)

# After fixing issues, verify the solution
result = await verify_my_fix(["fixed_file.py"])
print(result)

# Environment health check
from test.claude_helper import environment_health
await environment_health()

# Emergency test
from test.claude_code_tester import emergency_test
await emergency_test()

# Full system verification
from test.claude_code_tester import comprehensive_check
await comprehensive_check()
```

**Test System Features**:
- ✅ Automatic Windows environment setup (One.bat management)
- ✅ Real API testing with actual HTTP calls
- ✅ WSL ↔ Windows bridge for authentic testing
- ✅ Intelligent error analysis with specific fix suggestions
- ✅ Data collection workflow testing (LLM, search, YouTube, etc.)
- ✅ Local AI integration testing (Qwen2.5 VL 72B)
- ✅ Firefox extension functionality testing
- ✅ Headless browser testing (no GUI)
- ✅ Background test execution with error collection
- ✅ Test tool error tracking and analysis
- 🆕 **Automatic Fix System**: Learns from failures and applies fixes automatically
- 🆕 **Self-Learning**: Successful fixes are saved and reused
- 🆕 **Detailed Logging**: Every error includes environment info and fix attempts

**Error Collection System**:
The test system automatically collects and analyzes errors:
- Test execution errors are logged to `/test/logs/`
- Error patterns are analyzed in `/test/results/`
- Test tool errors are tracked separately
- Manual fix suggestions are provided for complex issues

**Background Testing**:
For continuous integration or unattended testing:
```python
# Run tests completely in background (hidden processes)
from test import test_now
test_now()  # No terminal output, no windows

# Check test results later
from test import get_latest_results
results = get_latest_results()
print(results)
```

## Data Collection Workflow Testing

**🎯 CURRENT PRIORITY: Data Collection → AI Analysis Pipeline**

The system includes comprehensive data collection capabilities:

### Data Collection Modules

1. **LLM Conversation Collection** (`/backend/routers/argosa/collection/llm_conversation_collector.py`)
   - Collects conversations from ChatGPT, Claude, Gemini, etc.
   - Firefox extension integration for automatic capture
   - Structured JSON storage with metadata

2. **Web Search Integration** (`/backend/routers/argosa/collection/web_crawler_agent.py`)
   - Google Search API integration
   - Naver Search support
   - Real-time web content extraction
   - Search result caching and management

3. **LLM Query Service** (`/backend/routers/argosa/collection/llm_query_service.py`)
   - Direct LLM API integration
   - Multiple provider support (OpenAI, Anthropic, etc.)
   - Query batching and response management

4. **YouTube Analysis** (YouTube folder in data/)
   - Video download and transcription
   - Audio-to-text conversion
   - Content analysis and summarization

### Testing Data Collection Workflow

```python
# Test complete data collection pipeline
from test.data_collection_tester import test_full_workflow

# Test individual collection modules
result = await test_full_workflow([
    "llm_conversations",  # Firefox extension + conversation capture
    "web_search",        # Google/Naver search integration  
    "llm_queries",       # Direct LLM API calls
    "youtube_analysis"   # Video download + transcription
])
print(result)

# Test Local AI integration (Qwen2.5 VL 72B)
from test.local_ai_tester import test_qwen_integration
result = await test_qwen_integration()
print(result)
```

### Required API Keys & Configuration

The following API keys may be required for full functionality:
- **Google Search API**: For web search functionality
- **YouTube Data API**: For video metadata and download
- **OpenAI API Key**: For LLM queries (optional)
- **Anthropic API Key**: For Claude integration (optional)
- **Naver Search API**: For Korean search results (optional)

### File Structure for Data Storage

```
/backend/routers/argosa/data/
├── llm-conversations/
│   ├── chatgpt/
│   ├── claude/
│   ├── gemini/
│   └── [other_llms]/
├── web_crawler/
│   ├── cache/
│   └── downloads/
├── youtube/
│   ├── downloads/
│   ├── transcripts/
│   └── temp/
└── translation_cache/
```

### Local AI Integration

**Target**: Qwen2.5 VL 72B Instruct on WPC2
- Model path verification
- VRAM usage optimization  
- Context window management for large documents
- File size optimization for AI processing

### Testing Checklist

- [ ] Firefox extension loads and captures conversations
- [ ] Web search returns valid results and saves to JSON
- [ ] LLM queries execute and responses are stored
- [ ] YouTube videos download and transcribe successfully
- [ ] Files are properly chunked for AI processing
- [ ] Local AI (Qwen2.5 VL 72B) processes collected data
- [ ] JSON files are structured correctly for workflow
- [ ] File sizes are optimized for local AI context limits

## Notes

- The module uses Korean comments (데이터 분석 = data analysis)
- Heavy integration with RAG service for context-aware analysis
- Designed for real-time, distributed AI agent coordination
- Focus on modularity - uses separated config/prompt/helper files