# backend/main.py - 모듈화된 3개 시스템 지원 버전

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio

# Local imports
from storage import ensure_directories

# Router imports
from routers import oneai, argosa, neuronet, projects

# Create FastAPI app
app = FastAPI(
    title="3D Animation Automation System",
    description="AI-powered system for 3D animation production",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(oneai.router, prefix="/api/oneai", tags=["One AI"])
app.include_router(argosa.router, prefix="/api/argosa", tags=["Argosa"])
app.include_router(neuronet.router, prefix="/api/neuronet", tags=["NeuroNet"])
app.include_router(projects.router, prefix="/projects", tags=["Projects"])

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "3D Animation Automation System API",
        "systems": {
            "oneai": "AI Production Pipeline",
            "argosa": "Information Analysis & Prediction",
            "neuronet": "AI Training Automation"
        },
        "version": "1.0.0"
    }

# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "systems": {
            "oneai": "operational",
            "argosa": "development",
            "neuronet": "development"
        }
    }

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize all systems on startup"""
    print("[Startup] Initializing 3D Animation Automation System...")
    
    # Ensure required directories exist
    ensure_directories()
    
    # Initialize One AI system
    await oneai.initialize()
    
    # Initialize Argosa system (placeholder)
    await argosa.initialize()
    
    # Initialize NeuroNet system (placeholder)
    await neuronet.initialize()
    
    print("[Startup] All systems initialized successfully")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup all systems on shutdown"""
    print("[Shutdown] Shutting down 3D Animation Automation System...")
    
    # Shutdown One AI system
    await oneai.shutdown()
    
    # Shutdown Argosa system
    await argosa.shutdown()
    
    # Shutdown NeuroNet system
    await neuronet.shutdown()
    
    print("[Shutdown] All systems shut down successfully")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)