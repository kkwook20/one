# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 CRITICAL ENVIRONMENT INFORMATION 🚨

**YOU ARE RUNNING IN WSL (Windows Subsystem for Linux) ENVIRONMENT!**

### 📍 Environment Details:

- **Current Directory**: `/mnt/f/ONE_AI` (Windows F: drive mounted in WSL)
- **Environment**: Ubuntu on WSL2
- **Python Path**: `/usr/bin/python3` (symlinked to `python`)
- **Backend Server**: Runs in **Windows** via `One.bat` on port 8000
- **Frontend**: Runs in **Windows** on port 3000
- **Node.js**: Required for frontend development

### ⚠️ CRITICAL WSL RULES:

1. **DO NOT start servers in WSL** - They run in Windows via One.bat
2. **Use WSL paths** (`/mnt/f/`) not Windows paths (`F:\`)
3. **Check logs at**: `/mnt/f/ONE_AI/backend/logs/backend_detailed.log`
4. **WSL2 network**: Use Windows host IP for API calls (get via `cat /etc/resolv.conf | grep nameserver`)

## Project Overview: ONE AI System

**ONE AI** is an AI-powered 3D animation production pipeline system that automates and manages the entire animation workflow through visual node-based programming.

### Current Focus Mode

⚠️ **IMPORTANT**: The codebase is currently in **ONE AI Focus Mode**:
- ✅ **ONE AI System**: Active development
- ❌ **Argosa System**: Disabled (data analysis & collection features)
- ❌ **NeuroNet System**: Disabled (neural network operations)

To re-enable disabled systems, uncomment the relevant imports and router inclusions in `/backend/main.py`.

## ONE AI Architecture

### Core Concept

ONE AI uses a **visual node-based workflow** where users can:
1. Drag and drop nodes to create production pipelines
2. Connect nodes to define data flow
3. Execute workflows with AI assistance
4. Monitor progress in real-time

### Node Types

1. **Input Node** - Entry point for project data
2. **Worker Node** - Executes AI-powered tasks with custom Python code
3. **Supervisor Node** - Monitors and manages worker nodes
4. **Planner Node** - Coordinates workflow execution
5. **Output Node** - Collects and saves final results

### Production Groups

The system organizes animation production into three main groups:

1. **Pre-production**
   - Script writing
   - Character design
   - Storyboarding
   - Setting/environment planning

2. **Post-production**
   - 3D Modeling
   - Rigging
   - Texturing
   - Animation
   - VFX (Visual Effects)
   - Lighting & Rendering
   - Sound Design
   - Compositing

3. **Director**
   - Overall direction
   - Review and approval

## Tech Stack

### Backend
- **FastAPI** (0.104.1) - Async web framework
- **Uvicorn** (0.24.0) - ASGI server
- **WebSockets** - Real-time communication
- **Pydantic** - Data validation
- **aiofiles** - Async file operations

### Frontend
- **React** (18.2.0) with TypeScript
- **React Flow** - Node-based visual editor
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components (Radix UI based)
- **Monaco Editor** - Code editor for worker nodes
- **Framer Motion** - Animations
- **Axios** - HTTP client

### AI Integration
- **LM Studio** - Local AI model hosting
- Custom prompt engineering for each production stage
- Streaming responses via WebSocket

## Development Commands

### Starting the Application
```bash
# Primary method (Windows Command Prompt/PowerShell):
One.bat  # Starts both backend and frontend

# Backend reference (DO NOT RUN in WSL):
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (if needed separately):
cd frontend
npm start
```

### Installing Dependencies
```bash
# After cloning or when dependencies are missing:
install_all_dependencies.bat  # Run in Windows

# Or manually:
# Backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install --legacy-peer-deps
```

### Debugging
```bash
# View real-time logs:
tail -f /mnt/f/ONE_AI/backend/logs/backend_detailed.log

# Search for errors:
grep -i "error\|exception\|failed" /mnt/f/ONE_AI/backend/logs/backend_detailed.log | tail -20

# ONE AI specific logs:
grep -i "oneai\|lmstudio\|execute" /mnt/f/ONE_AI/backend/logs/backend_detailed.log | tail -20
```

## Key API Endpoints

### ONE AI Core
- `GET /api/oneai/sections` - Get all workflow sections
- `PUT /api/oneai/sections/{section_id}` - Update section (nodes, connections)
- `POST /api/oneai/save` - Manual save workflow
- `POST /api/oneai/sections/{section_id}/clear` - Clear section

### Execution
- `POST /api/oneai/execute` - Execute single node
- `POST /api/oneai/execute-flow` - Execute entire workflow
- `GET /api/oneai/nodes` - Get all available node types

### LM Studio Integration
- `POST /api/oneai/lmstudio/connect` - Connect to LM Studio
- `GET /api/oneai/lmstudio/status` - Check connection status
- `GET /api/oneai/lmstudio/models` - List available models

### Project Management
- `GET /api/oneai/projects` - List all projects
- `POST /api/oneai/projects` - Create new project
- `GET /api/oneai/projects/{project_id}/files` - Browse project files
- `POST /api/oneai/upload` - Upload files to project

### WebSocket
- `WS /api/oneai/ws/{client_id}` - Real-time updates for execution

## Data Storage

### Workflow Data
- Location: `/backend/data/oneai_sections_data.json`
- Auto-saved every 10 minutes
- Contains all nodes, connections, and metadata

### Project Structure
```
/projects/{project_name}/
├── preproduction/
│   ├── script/
│   ├── character/
│   ├── setting/
│   └── plot/
├── postproduction/
│   ├── modeling/
│   ├── rigging/
│   ├── texture/
│   ├── animation/
│   ├── vfx/
│   ├── lighting/
│   ├── sound/
│   └── compositing/
├── direction/
│   ├── reviews/
│   └── approvals/
├── outputs/
├── temp/
└── references/
```

## Worker Node Code Environment

Worker nodes execute Python code with access to:

### Available Functions
```python
# AI model interaction
result = call_ai_model(prompt, format="text|json|list")

# File operations
save_to_project(content, filename, subfolder="outputs")
content = read_from_project(filename, subfolder="outputs")
list_project_files(subfolder="outputs")

# Progress tracking
update_progress(percentage, message)

# Logging
log_info(message)
log_error(message)
log_warning(message)

# Access to connected node outputs
connected_data = inputs.get('node_id')
```

### Execution Context
- Each node runs in isolation
- Access to project directory
- Connected to LM Studio for AI calls
- Real-time output streaming
- Error handling and logging

## Frontend Structure

### Main Components
- `/frontend/src/components/TheOnePipeline.tsx` - Main visual editor
- `/frontend/src/components/flow/CustomNode.tsx` - Node component
- `/frontend/src/components/flow/CustomEdge.tsx` - Connection component
- `/frontend/src/components/ui/` - Reusable UI components

### State Management
- React Context for global state
- Local state for node configurations
- WebSocket for real-time updates

## Important Patterns

1. **Async Everything**: All I/O operations use async/await
2. **WebSocket Updates**: Real-time progress and status
3. **Auto-save**: Every 10 minutes + manual save option
4. **Error Recovery**: Graceful handling with user feedback
5. **Modular Nodes**: Each node type has specific responsibilities

## Current Development Focus

1. **Enhanced AI Integration**
   - Better prompt templates for each production stage
   - Support for multiple AI models
   - Improved response parsing

2. **Workflow Features**
   - Version control system (currently placeholder)
   - Collaboration features
   - Template library

3. **Performance**
   - Optimize large workflow execution
   - Better caching strategies
   - Parallel node execution

## Troubleshooting

### Common Issues

1. **LM Studio Connection Failed**
   - Ensure LM Studio is running on `http://localhost:1234`
   - Check if a model is loaded in LM Studio
   - Verify no firewall blocking

2. **WebSocket Disconnections**
   - Check backend logs for errors
   - Ensure stable network connection
   - Frontend auto-reconnects after 3 seconds

3. **Node Execution Errors**
   - Check worker node code syntax
   - Verify AI model is responding
   - Review execution logs panel

### Emergency Recovery

If the system becomes unresponsive:
1. Check logs: `tail -f /mnt/f/ONE_AI/backend/logs/backend_detailed.log`
2. Restart via Windows: Close terminals and run `One.bat` again
3. Clear browser cache and reload
4. Check `data/oneai_sections_data.json` for corruption

## Notes

- The system is designed for Windows but developed in WSL
- Frontend uses extensive animations (Framer Motion)
- All node communications are type-safe with TypeScript
- Project aims to democratize 3D animation production with AI