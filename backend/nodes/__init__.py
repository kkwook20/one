# Node modules initialization

from . import worker
from . import supervisor
from . import planner
from . import watcher
from . import scheduler
from . import flow
from . import storage

__all__ = [
    'worker',
    'supervisor',
    'planner',
    'watcher',
    'scheduler',
    'flow',
    'storage'
]

# Node type mapping
NODE_TYPES = {
    'worker': worker,
    'supervisor': supervisor,
    'planner': planner,
    'watcher': watcher,
    'scheduler': scheduler,
    'flow': flow,
    'storage': storage
}

async def execute_node(node_type: str, node_id: str, data: dict):
    """Execute a node by its type"""
    if node_type not in NODE_TYPES:
        raise ValueError(f"Unknown node type: {node_type}")
    
    module = NODE_TYPES[node_type]
    return await module.execute(node_id, data)