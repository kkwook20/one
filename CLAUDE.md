# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a 3D Animation Automation System consisting of three main subsystems:
1. **One AI** - AI-powered 3D animation production pipeline with visual node-based workflow
2. **Argosa** - Information analysis, prediction, and data collection system  
3. **NeuroNet** - AI training data automation (under development)

## Development Commands

### Starting the Application
```bash
# Windows (uses Windows Terminal with split panes)
One.bat

# Or manually:
# Backend (FastAPI on port 8000)
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --no-access-log

# Frontend (React on port 3000)
cd frontend
npm start
```

### Frontend Commands
```bash
cd frontend
npm start          # Start development server
npm run build      # Create production build
npm test           # Run tests
npm run lint       # Run ESLint
npm run lint:fix   # Fix linting issues
```

### Backend Commands
```bash
cd backend
# No specific test commands found - tests may be run with pytest if available
```

## Architecture Overview

### Backend Structure (FastAPI)
- **Entry Point**: `backend/main.py` - Initializes all three systems with proper startup/shutdown handling
- **API Routers**:
  - `/api/oneai/*` - One AI pipeline endpoints (backend/routers/oneai.py)
  - `/api/argosa/*` - Argosa analysis endpoints (backend/routers/argosa/)
  - `/api/neuronet/*` - NeuroNet endpoints (backend/routers/neuronet.py)
  - `/projects/*` - Project management endpoints

### Frontend Structure (React + TypeScript)
- **Entry Point**: `frontend/src/App.tsx` - Main tab navigation between systems
- **Component Structure**:
  - `components/TheOne/TheOnePipeline.tsx` - Visual node-based animation pipeline
  - `components/Argosa/ArgosaSystem.tsx` - Data analysis interface
  - `components/NeuroNet/NeuroNetSystem.tsx` - AI training interface
  - `components/ui/*` - Shared UI components (based on shadcn/ui)

### Key Technologies
- **Backend**: FastAPI, Pydantic, WebSockets, aiohttp, Qdrant vector DB
- **Frontend**: React 18, TypeScript, Tailwind CSS, React Flow (for node editor), Monaco Editor
- **State Management**: React hooks and context
- **Styling**: Tailwind CSS with custom component library

## One AI Pipeline System

The core system uses a visual node-based workflow where:
- **Worker Nodes** execute Python code with access to AI models and other nodes' outputs
- **Supervisor Nodes** manage and evaluate Worker nodes
- **Planner Nodes** provide high-level coordination
- **Input/Output Nodes** handle data flow

### Node Execution Context
Worker nodes have access to these variables:
- `inputs` - Data from connected nodes
- `output` - Must be set for pipeline to continue
- `current_node` - Node configuration
- `call_ai_model(prompt)` - Call configured AI model
- `get_global_var(path)` - Access any node's data

### Global Variable System
Format: `{section}.{nodeType}.{nodeId}.{dataType}.{detail}`
Example: `get_global_var("preproduction.worker.node-123.output")`

## Argosa System Architecture

Modular analysis system with:
- **Data Collection**: LLM conversations, web crawling, native browser integration
- **Data Analysis**: Distributed AI agents, analytics, workflows
- **Shared Services**: Cache manager, LLM tracker, command queue, metrics
- **Browser Extension**: Firefox extension for LLM conversation collection

## Development Guidelines

1. **API Patterns**: All endpoints return consistent response models (see backend/models.py)
2. **WebSocket Support**: Real-time updates via `/ws/{client_id}` endpoint
3. **Error Handling**: Comprehensive try-catch blocks with proper logging
4. **Type Safety**: Full TypeScript coverage in frontend, Pydantic models in backend
5. **Component Architecture**: Lazy-loaded, modular components with clear separation

## Important Files to Review

- `backend/models.py` - All Pydantic models and API contracts
- `backend/routers/argosa/__init__.py` - Argosa system initialization
- `frontend/src/api/client.ts` - Frontend API client
- `frontend/src/types/index.ts` - TypeScript type definitions
- `global-vars-doc.md` - Node variable system documentation

## CORS Configuration

Configured for:
- localhost:3000, localhost:8000
- Firefox/Chrome extensions (moz-extension://*, chrome-extension://*)
- Custom frontend URL via FRONTEND_URL env var

## Current Status

- **One AI**: Fully operational with visual pipeline editor
- **Argosa**: Operational with multiple data collection methods
- **NeuroNet**: Under development

The system is designed for AI-powered 3D animation production with emphasis on modularity and extensibility.