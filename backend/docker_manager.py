# Related files: backend/main.py
# Location: backend/docker_manager.py

import docker
from typing import Optional

docker_client: Optional[docker.DockerClient] = None

def start_vector_db():
    """Start Vector DB Docker container"""
    global docker_client
    try:
        docker_client = docker.from_env()
        # Check if container exists
        try:
            container = docker_client.containers.get("vector-db")
            if container.status != "running":
                container.start()
        except docker.errors.NotFound:
            # Create and start new container
            docker_client.containers.run(
                "qdrant/qdrant",
                name="vector-db",
                ports={'6333/tcp': 6333},
                detach=True,
                remove=False
            )
    except Exception as e:
        print(f"Failed to start Vector DB: {e}")

def stop_vector_db():
    """Stop Vector DB Docker container"""
    global docker_client
    if docker_client:
        try:
            container = docker_client.containers.get("vector-db")
            container.stop()
        except:
            pass