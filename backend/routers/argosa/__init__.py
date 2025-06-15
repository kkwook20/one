# backend/routers/argosa/__init__.py

from fastapi import APIRouter

# Create main router with prefix and tags
router = APIRouter(prefix="/api/argosa", tags=["argosa"])

# Export for main.py
__all__ = ['router', 'initialize', 'shutdown']

# Import sub-routers
try:
    from .data_collection import router as collection_router
    router.include_router(collection_router, prefix="/data", tags=["Data Collection"])
    
    # Collection 서브모듈들 추가
    try:
        from .collection.llm_conversation_collector import router as llm_conv_router
        router.include_router(llm_conv_router, prefix="/data", tags=["LLM Conversations"])
    except ImportError:
        print("[Argosa] llm_conversation_collector module not found")
    
    try:
        from .collection.llm_query_service import router as llm_query_router
        router.include_router(llm_query_router, prefix="/data", tags=["LLM Query"])
    except ImportError:
        print("[Argosa] llm_query_service module not found")
    
    try:
        from .collection.web_crawler_agent import crawler_router
        router.include_router(crawler_router, prefix="/data", tags=["Web Crawler"])
    except ImportError:
        print("[Argosa] web_crawler_agent module not found")
        
except ImportError:
    print("[Argosa] data_collection module not found")

try:
    from .data_analysis import router as analysis_router
    router.include_router(analysis_router, prefix="/analysis", tags=["Data Analysis"])
except ImportError:
    print("[Argosa] data_analysis module not found")

try:
    from .prediction import router as prediction_router
    router.include_router(prediction_router, prefix="/predictions", tags=["Prediction"])
except ImportError:
    print("[Argosa] prediction module not found")

try:
    from .scheduling import router as scheduling_router
    router.include_router(scheduling_router, prefix="/schedules", tags=["Scheduling"])
except ImportError:
    print("[Argosa] scheduling module not found")

try:
    from .code_analysis import router as code_router
    router.include_router(code_router, prefix="/code", tags=["Code Analysis"])
except ImportError:
    print("[Argosa] code_analysis module not found")

try:
    from .user_input import router as user_router
    router.include_router(user_router, prefix="/user", tags=["User Input"])
except ImportError:
    print("[Argosa] user_input module not found")

try:
    from .db_center import router as db_router
    router.include_router(db_router, prefix="/db", tags=["DB Center"])
except ImportError:
    print("[Argosa] db_center module not found")

# Health check
@router.get("/health")
async def health_check():
    modules_status = {}
    
    # Check each module availability
    try:
        from . import data_collection
        modules_status["data_collection"] = "operational"
        
        # Check collection submodules
        try:
            from .collection import llm_conversation_collector
            modules_status["llm_conversation_collector"] = "operational"
        except ImportError:
            modules_status["llm_conversation_collector"] = "not_available"
            
        try:
            from .collection import llm_query_service
            modules_status["llm_query_service"] = "operational"
        except ImportError:
            modules_status["llm_query_service"] = "not_available"
            
        try:
            from .collection import web_crawler_agent
            modules_status["web_crawler_agent"] = "operational"
        except ImportError:
            modules_status["web_crawler_agent"] = "not_available"
            
    except ImportError:
        modules_status["data_collection"] = "not_available"
    
    try:
        from . import data_analysis
        modules_status["data_analysis"] = "operational"
    except ImportError:
        modules_status["data_analysis"] = "not_available"
    
    try:
        from . import prediction
        modules_status["prediction"] = "operational"
    except ImportError:
        modules_status["prediction"] = "not_available"
    
    try:
        from . import scheduling
        modules_status["scheduling"] = "operational"
    except ImportError:
        modules_status["scheduling"] = "not_available"
    
    try:
        from . import code_analysis
        modules_status["code_analysis"] = "operational"
    except ImportError:
        modules_status["code_analysis"] = "not_available"
    
    try:
        from . import user_input
        modules_status["user_input"] = "operational"
    except ImportError:
        modules_status["user_input"] = "not_available"
    
    try:
        from . import db_center
        modules_status["db_center"] = "operational"
    except ImportError:
        modules_status["db_center"] = "not_available"
    
    return {
        "status": "healthy",
        "modules": modules_status
    }

# Initialize function
async def initialize():
    """Initialize Argosa system"""
    print("[Argosa] Initializing all modules...")
    
    # Initialize each module if available
    try:
        from .data_collection import initialize as init_collection
        await init_collection()
        print("[Argosa] data_collection initialized")
        
        # Initialize collection submodules
        try:
            from .collection.llm_query_service import llm_service
            await llm_service.initialize()
            print("[Argosa] llm_query_service initialized")
        except ImportError:
            print("[Argosa] llm_query_service module not available for initialization")
        except Exception as e:
            print(f"[Argosa] Error initializing llm_query_service: {e}")
            
    except ImportError:
        print("[Argosa] data_collection module not available for initialization")
    except Exception as e:
        print(f"[Argosa] Error initializing data_collection: {e}")
    
    try:
        from .data_analysis import initialize as init_analysis
        await init_analysis()
        print("[Argosa] data_analysis initialized")
    except ImportError:
        print("[Argosa] data_analysis module not available for initialization")
    except Exception as e:
        print(f"[Argosa] Error initializing data_analysis: {e}")
    
    try:
        from .prediction import initialize as init_prediction
        await init_prediction()
        print("[Argosa] prediction initialized")
    except ImportError:
        print("[Argosa] prediction module not available for initialization")
    except Exception as e:
        print(f"[Argosa] Error initializing prediction: {e}")
    
    try:
        from .scheduling import initialize as init_scheduling
        await init_scheduling()
        print("[Argosa] scheduling initialized")
    except ImportError:
        print("[Argosa] scheduling module not available for initialization")
    except Exception as e:
        print(f"[Argosa] Error initializing scheduling: {e}")
    
    try:
        from .code_analysis import initialize as init_code
        await init_code()
        print("[Argosa] code_analysis initialized")
    except ImportError:
        print("[Argosa] code_analysis module not available for initialization")
    except Exception as e:
        print(f"[Argosa] Error initializing code_analysis: {e}")
    
    try:
        from .user_input import initialize as init_user
        await init_user()
        print("[Argosa] user_input initialized")
    except ImportError:
        print("[Argosa] user_input module not available for initialization")
    except Exception as e:
        print(f"[Argosa] Error initializing user_input: {e}")
    
    try:
        from .db_center import initialize as init_db
        await init_db()
        print("[Argosa] db_center initialized")
    except ImportError:
        print("[Argosa] db_center module not available for initialization")
    except Exception as e:
        print(f"[Argosa] Error initializing db_center: {e}")
    
    print("[Argosa] Module initialization completed")

# Shutdown function
async def shutdown():
    """Shutdown Argosa system"""
    print("[Argosa] Shutting down all modules...")
    
    # Shutdown each module if available
    try:
        from .data_collection import shutdown as shutdown_collection
        await shutdown_collection()
        print("[Argosa] data_collection shut down")
        
        # Shutdown collection submodules
        try:
            from .collection.llm_query_service import llm_service
            await llm_service.shutdown()
            print("[Argosa] llm_query_service shut down")
        except ImportError:
            pass
        except Exception as e:
            print(f"[Argosa] Error shutting down llm_query_service: {e}")
            
    except ImportError:
        pass
    except Exception as e:
        print(f"[Argosa] Error shutting down data_collection: {e}")
    
    try:
        from .data_analysis import shutdown as shutdown_analysis
        await shutdown_analysis()
        print("[Argosa] data_analysis shut down")
    except ImportError:
        pass
    except Exception as e:
        print(f"[Argosa] Error shutting down data_analysis: {e}")
    
    try:
        from .prediction import shutdown as shutdown_prediction
        await shutdown_prediction()
        print("[Argosa] prediction shut down")
    except ImportError:
        pass
    except Exception as e:
        print(f"[Argosa] Error shutting down prediction: {e}")
    
    try:
        from .scheduling import shutdown as shutdown_scheduling
        await shutdown_scheduling()
        print("[Argosa] scheduling shut down")
    except ImportError:
        pass
    except Exception as e:
        print(f"[Argosa] Error shutting down scheduling: {e}")
    
    try:
        from .code_analysis import shutdown as shutdown_code
        await shutdown_code()
        print("[Argosa] code_analysis shut down")
    except ImportError:
        pass
    except Exception as e:
        print(f"[Argosa] Error shutting down code_analysis: {e}")
    
    try:
        from .user_input import shutdown as shutdown_user
        await shutdown_user()
        print("[Argosa] user_input shut down")
    except ImportError:
        pass
    except Exception as e:
        print(f"[Argosa] Error shutting down user_input: {e}")
    
    try:
        from .db_center import shutdown as shutdown_db
        await shutdown_db()
        print("[Argosa] db_center shut down")
    except ImportError:
        pass
    except Exception as e:
        print(f"[Argosa] Error shutting down db_center: {e}")
    
    print("[Argosa] All modules shut down")