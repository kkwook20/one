# backend/routers/argosa/__init__.py
"""Argosa 데이터 수집 및 분석 시스템"""

from fastapi import APIRouter
import logging
import traceback

# Create main router with prefix and tags
router = APIRouter(prefix="/api/argosa", tags=["argosa"])

# 로깅 설정
logger = logging.getLogger(__name__)

# Export for main.py
__all__ = [
    'router', 
    'initialize', 
    'shutdown',
    # Core managers
    'native_command_manager',
    'session_manager',
    'state_manager',
    # Shared services (개선사항 추가)
    'cache_manager',
    'llm_tracker',
    'command_queue',
    'metrics'
]

# Import core managers
try:
    from .data_collection import (
        native_command_manager,
        session_manager,
        state_manager
    )
except ImportError as e:
    logger.warning(f"[Argosa] Failed to import core managers: {e}")
    native_command_manager = None
    session_manager = None
    state_manager = None

try:
    from .collection.llm_conversation_collector import router as llm_conv_router
    router.include_router(llm_conv_router, prefix="/data", tags=["LLM Conversations"])
    logger.info("[Argosa] llm_conversation_collector router loaded successfully")
except ImportError as e:
    logger.error(f"[Argosa] Failed to import llm_conversation_collector: {e}")


# Import shared services (개선사항)
try:
    from .shared import cache_manager, llm_tracker, command_queue, metrics
except ImportError as e:
    logger.warning(f"[Argosa] Shared services not available (using legacy mode): {e}")
    cache_manager = None
    llm_tracker = None
    command_queue = None
    metrics = None

# Import sub-routers
try:
    from .data_collection import router as collection_router, initialize as data_collection_init, shutdown as data_collection_shutdown
    router.include_router(collection_router, prefix="/data", tags=["Data Collection"])
    logger.info("[Argosa] data_collection router loaded successfully")
except ImportError as e:
    logger.error(f"[Argosa] Failed to import data_collection: {e}")
    traceback.print_exc()
    data_collection_init = None
    data_collection_shutdown = None
    
    # Collection 서브모듈들 추가
    try:
        from .collection.llm_conversation_collector import router as llm_conv_router
        router.include_router(llm_conv_router, prefix="/data", tags=["LLM Conversations"])
    except ImportError:
        logger.info("[Argosa] llm_conversation_collector module not found")
    
    try:
        from .collection.llm_query_service import router as llm_query_router
        router.include_router(llm_query_router, prefix="/data", tags=["LLM Query"])
    except ImportError:
        logger.info("[Argosa] llm_query_service module not found")
    
    try:
        from .collection.web_crawler_agent import crawler_router
        router.include_router(crawler_router, prefix="/data", tags=["Web Crawler"])
    except ImportError:
        logger.info("[Argosa] web_crawler_agent module not found")

# 기타 모듈들
try:
    from .data_analysis import router as analysis_router
    router.include_router(analysis_router, prefix="/analysis", tags=["Data Analysis"])
except ImportError as e:
    logger.error(f"[Argosa] Failed to import data_analysis: {e}")
    traceback.print_exc()

try:
    from .prediction import router as prediction_router
    router.include_router(prediction_router, prefix="/predictions", tags=["Prediction"])
except ImportError as e:
    logger.error(f"[Argosa] Failed to import prediction: {e}")
    traceback.print_exc()

try:
    from .scheduling import router as scheduling_router
    router.include_router(scheduling_router, prefix="/schedules", tags=["Scheduling"])
except ImportError:
    logger.info("[Argosa] scheduling module not found")

try:
    from .code_analysis import router as code_router
    router.include_router(code_router, prefix="/code", tags=["Code Analysis"])
except ImportError as e:
    logger.error(f"[Argosa] Failed to import code_analysis: {e}")
    traceback.print_exc()

try:
    from .user_input import router as user_router
    router.include_router(user_router, prefix="/user", tags=["User Input"])
except ImportError:
    logger.info("[Argosa] user_input module not found")

try:
    from .db_center import router as db_router
    router.include_router(db_router, prefix="/db", tags=["DB Center"])
except ImportError:
    logger.info("[Argosa] db_center module not found")

# Health check
@router.get("/health")
async def health_check():
    modules_status = {}
    shared_services_status = {}
    
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
    
    # Check shared services (개선사항)
    if cache_manager:
        shared_services_status["cache_manager"] = "operational"
        shared_services_status["cache_type"] = "redis" if cache_manager.redis else "local"
    else:
        shared_services_status["cache_manager"] = "not_available"
    
    if llm_tracker:
        shared_services_status["llm_tracker"] = "operational"
        try:
            stats = await llm_tracker.get_stats()
            shared_services_status["llm_tracked_count"] = stats.get("total_tracked", 0)
        except:
            pass
    else:
        shared_services_status["llm_tracker"] = "not_available"
    
    if command_queue:
        shared_services_status["command_queue"] = "operational"
        try:
            stats = await command_queue.get_stats()
            shared_services_status["queue_size"] = stats.get("queue_size", 0)
        except:
            pass
    else:
        shared_services_status["command_queue"] = "not_available"
    
    if metrics:
        shared_services_status["metrics"] = "operational"
    else:
        shared_services_status["metrics"] = "not_available"
    
    # Check other modules
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
        "modules": modules_status,
        "shared_services": shared_services_status,
        "mode": "improved" if cache_manager else "legacy"
    }

# Initialize function
async def initialize():
    """Initialize Argosa system"""
    logger.info("[Argosa] Initializing all modules...")
    
    # Initialize shared services first (개선사항)
    if cache_manager:
        try:
            await cache_manager.initialize()
            logger.info("[Argosa] cache_manager initialized")
        except Exception as e:
            logger.error(f"[Argosa] Error initializing cache_manager: {e}")
    
    if command_queue:
        try:
            await command_queue.initialize()
            
            # Register command handlers if available
            try:
                from .data_collection_improved import register_command_handlers
                await register_command_handlers()
                logger.info("[Argosa] Command handlers registered")
            except ImportError:
                logger.info("[Argosa] Improved command handlers not available")
                
            logger.info("[Argosa] command_queue initialized")
        except Exception as e:
            logger.error(f"[Argosa] Error initializing command_queue: {e}")
    
    if metrics:
        try:
            await metrics.initialize()
            logger.info("[Argosa] metrics collector initialized")
        except Exception as e:
            logger.error(f"[Argosa] Error initializing metrics: {e}")
    
    # Initialize data_collection
    try:
        if data_collection_init:
            await data_collection_init()
            logger.info("[Argosa] data_collection initialized")
        else:
            logger.error("[Argosa] data_collection initialize function not available")
        
        # Initialize collection submodules
        try:
            from .collection.llm_query_service import llm_service
            if hasattr(llm_service, 'initialize'):
                await llm_service.initialize()
                logger.info("[Argosa] llm_query_service initialized")
        except ImportError:
            logger.info("[Argosa] llm_query_service module not available for initialization")
        except Exception as e:
            logger.error(f"[Argosa] Error initializing llm_query_service: {e}")
            
        try:
            from .collection.web_crawler_agent import web_crawler_system
            if hasattr(web_crawler_system, 'initialize'):
                await web_crawler_system.initialize()
                logger.info("[Argosa] web_crawler_system initialized")
        except ImportError:
            logger.info("[Argosa] web_crawler_agent module not available for initialization")
        except Exception as e:
            logger.error(f"[Argosa] Error initializing web_crawler_system: {e}")
            
    except ImportError:
        logger.warning("[Argosa] data_collection module not available for initialization")
    except Exception as e:
        logger.error(f"[Argosa] Error initializing data_collection: {e}")
    
    # Initialize other modules
    await _initialize_other_modules()
    
    logger.info("[Argosa] Module initialization completed")

async def _initialize_other_modules():
    """Initialize other modules"""
    modules_to_init = [
        ("data_analysis", "data_analysis"),
        ("prediction", "prediction"),
        ("scheduling", "scheduling"),
        ("code_analysis", "code_analysis"),
        ("user_input", "user_input"),
        ("db_center", "db_center")
    ]
    
    for module_name, display_name in modules_to_init:
        try:
            module = __import__(f".{module_name}", globals(), locals(), ["initialize"], 1)
            if hasattr(module, 'initialize'):
                await module.initialize()
                logger.info(f"[Argosa] {display_name} initialized")
        except ImportError:
            logger.info(f"[Argosa] {display_name} module not available for initialization")
        except Exception as e:
            logger.error(f"[Argosa] Error initializing {display_name}: {e}")

# Shutdown function
async def shutdown():
    """Shutdown Argosa system"""
    logger.info("[Argosa] Shutting down all modules...")
    
    # Shutdown data_collection first
    try:
        from .data_collection import shutdown as shutdown_collection
        await shutdown_collection()
        logger.info("[Argosa] data_collection shut down")
        
        # Shutdown collection submodules
        try:
            from .collection.llm_query_service import llm_service
            if hasattr(llm_service, 'shutdown'):
                await llm_service.shutdown()
                logger.info("[Argosa] llm_query_service shut down")
        except ImportError:
            pass
        except Exception as e:
            logger.error(f"[Argosa] Error shutting down llm_query_service: {e}")
            
        try:
            from .collection.web_crawler_agent import web_crawler_system
            if hasattr(web_crawler_system, 'cleanup'):
                await web_crawler_system.cleanup()
                logger.info("[Argosa] web_crawler_system shut down")
        except ImportError:
            pass
        except Exception as e:
            logger.error(f"[Argosa] Error shutting down web_crawler_system: {e}")
            
    except ImportError:
        pass
    except Exception as e:
        logger.error(f"[Argosa] Error shutting down data_collection: {e}")
    
    # Shutdown other modules
    await _shutdown_other_modules()
    
    # Shutdown shared services last (개선사항)
    if command_queue:
        try:
            await command_queue.shutdown()
            logger.info("[Argosa] command_queue shut down")
        except Exception as e:
            logger.error(f"[Argosa] Error shutting down command_queue: {e}")
    
    if metrics:
        try:
            await metrics.shutdown()
            logger.info("[Argosa] metrics collector shut down")
        except Exception as e:
            logger.error(f"[Argosa] Error shutting down metrics: {e}")
    
    if cache_manager:
        try:
            await cache_manager.cleanup()
            logger.info("[Argosa] cache_manager shut down")
        except Exception as e:
            logger.error(f"[Argosa] Error shutting down cache_manager: {e}")
    
    logger.info("[Argosa] All modules shut down")

async def _shutdown_other_modules():
    """Shutdown other modules"""
    modules_to_shutdown = [
        ("data_analysis", "data_analysis"),
        ("prediction", "prediction"),
        ("scheduling", "scheduling"),
        ("code_analysis", "code_analysis"),
        ("user_input", "user_input"),
        ("db_center", "db_center")
    ]
    
    for module_name, display_name in modules_to_shutdown:
        try:
            module = __import__(f".{module_name}", globals(), locals(), ["shutdown"], 1)
            if hasattr(module, 'shutdown'):
                await module.shutdown()
                logger.info(f"[Argosa] {display_name} shut down")
        except ImportError:
            pass
        except Exception as e:
            logger.error(f"[Argosa] Error shutting down {display_name}: {e}")

# Utility function to check if running in improved mode
def is_improved_mode() -> bool:
    """Check if running with improved services"""
    return bool(cache_manager and command_queue and llm_tracker and metrics)