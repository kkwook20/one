from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import json
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from pathlib import Path
import logging
import traceback

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Workflow Engine API")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket 연결 관리
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.node_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        # Remove from node connections
        self.node_connections = {
            k: v for k, v in self.node_connections.items() if v != websocket
        }
        logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

    async def send_to_node(self, node_id: str, message: dict):
        if node_id in self.node_connections:
            await self.node_connections[node_id].send_json(message)

manager = ConnectionManager()

# 노드 실행 관리
class NodeExecutor:
    def __init__(self):
        self.running_nodes: Dict[str, asyncio.Task] = {}
        self.node_results: Dict[str, Any] = {}

    async def execute_worker_node(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Worker 노드 실행"""
        try:
            # 설정 파일 로드
            config_path = Path(f"config/nodes/{node_id}.json")
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
            else:
                config = {
                    "tasks": data.get('tasks', []),
                    "code": data.get('code', ''),
                    "inputs": {},
                    "outputs": {}
                }

            # 로그 스트리밍
            await manager.broadcast({
                "type": "log",
                "nodeId": node_id,
                "content": f"Starting worker node {node_id}..."
            })

            # Python 코드 실행
            code = config.get('code', '')
            if code:
                # 실행 환경 설정
                exec_globals = {
                    'input_data': data.get('inputData', {}),
                    'node_id': node_id,
                    'output_data': {},
                    'print': lambda *args: asyncio.create_task(
                        manager.broadcast({
                            "type": "log",
                            "nodeId": node_id,
                            "content": ' '.join(map(str, args))
                        })
                    )
                }
                
                # 코드 실행
                exec(code, exec_globals)
                
                # 결과 저장
                output_data = exec_globals.get('output_data', {})
                
                # 결과 파일로 저장
                output_path = Path(f"data/projects/{node_id}")
                output_path.mkdir(parents=True, exist_ok=True)
                
                with open(output_path / "output.json", 'w', encoding='utf-8') as f:
                    json.dump(output_data, f, indent=2, ensure_ascii=False)
                
                return {
                    "status": "success",
                    "output": output_data,
                    "timestamp": datetime.now().isoformat()
                }
            else:
                return {
                    "status": "no_code",
                    "message": "No code to execute"
                }
                
        except Exception as e:
            logger.error(f"Error executing worker node {node_id}: {str(e)}")
            logger.error(traceback.format_exc())
            return {
                "status": "error",
                "error": str(e),
                "traceback": traceback.format_exc()
            }

    async def execute_supervisor_node(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Supervisor 노드 실행 - 다른 노드들의 코드를 수정"""
        try:
            target_nodes = data.get('targetNodes', [])
            modifications = []
            
            for target_id in target_nodes:
                # 대상 노드의 설정 로드
                config_path = Path(f"config/nodes/{target_id}.json")
                if config_path.exists():
                    with open(config_path, 'r', encoding='utf-8') as f:
                        target_config = json.load(f)
                    
                    # AI를 통한 코드 개선 (여기서는 시뮬레이션)
                    improved_code = target_config.get('code', '') + "\n# Improved by supervisor"
                    
                    target_config['code'] = improved_code
                    target_config['lastModified'] = datetime.now().isoformat()
                    target_config['modifiedBy'] = node_id
                    
                    # 수정된 설정 저장
                    with open(config_path, 'w', encoding='utf-8') as f:
                        json.dump(target_config, f, indent=2, ensure_ascii=False)
                    
                    modifications.append({
                        "nodeId": target_id,
                        "timestamp": datetime.now().isoformat(),
                        "changes": "Code optimization applied"
                    })
            
            return {
                "status": "success",
                "modifications": modifications
            }
            
        except Exception as e:
            logger.error(f"Error executing supervisor node {node_id}: {str(e)}")
            return {
                "status": "error",
                "error": str(e)
            }

    async def execute_planner_node(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Planner 노드 실행 - 전체 워크플로우 계획 및 평가"""
        try:
            # 현재 탭의 모든 노드 분석
            all_nodes = data.get('allNodes', [])
            evaluations = {}
            
            for node in all_nodes:
                # 노드 평가 (시뮬레이션)
                evaluation = {
                    "nodeId": node['id'],
                    "score": 75,  # 실제로는 AI가 평가
                    "metrics": {
                        "timeEfficiency": 80,
                        "workload": 70,
                        "difficulty": 65,
                        "progress": 85
                    },
                    "recommendations": [
                        "Consider optimizing the data loading process",
                        "Add error handling for edge cases"
                    ]
                }
                evaluations[node['id']] = evaluation
            
            # 전체 계획 업데이트
            plan = {
                "goals": data.get('goals', []),
                "evaluations": evaluations,
                "overallProgress": 75,
                "nextSteps": [
                    "Complete data preprocessing",
                    "Start model training phase"
                ]
            }
            
            return {
                "status": "success",
                "plan": plan
            }
            
        except Exception as e:
            logger.error(f"Error executing planner node {node_id}: {str(e)}")
            return {
                "status": "error",
                "error": str(e)
            }

    async def execute_flow_node(self, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Flow 노드 실행 - 노드 실행 순서 관리"""
        try:
            execution_list = data.get('executionList', [])
            results = []
            
            for item in execution_list:
                target_node_id = item['nodeId']
                node_type = item.get('type', 'worker')
                
                # 실행 시작 알림
                await manager.broadcast({
                    "type": "execution_start",
                    "nodeId": target_node_id,
                    "flowId": node_id
                })
                
                # 노드 타입에 따른 실행
                if node_type == 'worker':
                    result = await self.execute_worker_node(target_node_id, {})
                elif node_type == 'supervisor':
                    result = await self.execute_supervisor_node(target_node_id, data)
                else:
                    result = {"status": "skipped", "reason": "Unknown node type"}
                
                results.append({
                    "nodeId": target_node_id,
                    "result": result,
                    "timestamp": datetime.now().isoformat()
                })
                
                # 실행 완료 알림
                await manager.broadcast({
                    "type": "execution_complete",
                    "nodeId": target_node_id,
                    "flowId": node_id,
                    "result": result
                })
                
                # 잠시 대기 (실제 실행 시뮬레이션)
                await asyncio.sleep(1)
            
            return {
                "status": "success",
                "results": results
            }
            
        except Exception as e:
            logger.error(f"Error executing flow node {node_id}: {str(e)}")
            return {
                "status": "error",
                "error": str(e)
            }

    async def execute_node(self, node_type: str, node_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """노드 타입에 따른 실행 분기"""
        executors = {
            'worker': self.execute_worker_node,
            'supervisor': self.execute_supervisor_node,
            'planner': self.execute_planner_node,
            'flow': self.execute_flow_node,
        }
        
        executor = executors.get(node_type)
        if executor:
            return await executor(node_id, data)
        else:
            return {"status": "error", "error": f"Unknown node type: {node_type}"}

executor = NodeExecutor()

# WebSocket 엔드포인트
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await handle_websocket_message(websocket, data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        manager.disconnect(websocket)

async def handle_websocket_message(websocket: WebSocket, data: Dict[str, Any]):
    """WebSocket 메시지 처리"""
    action = data.get('action')
    
    if action == 'execute':
        node_type = data.get('nodeType')
        node_id = data.get('nodeId')
        
        # 비동기 실행
        task = asyncio.create_task(
            executor.execute_node(node_type, node_id, data)
        )
        executor.running_nodes[node_id] = task
        
        result = await task
        
        await manager.send_personal_message({
            "type": "execution_result",
            "nodeId": node_id,
            "result": result
        }, websocket)
        
    elif action == 'stop':
        node_id = data.get('nodeId')
        if node_id in executor.running_nodes:
            executor.running_nodes[node_id].cancel()
            del executor.running_nodes[node_id]
            
    elif action == 'get_status':
        await manager.send_personal_message({
            "type": "status",
            "runningNodes": list(executor.running_nodes.keys())
        }, websocket)

# REST API 엔드포인트
@app.get("/")
async def root():
    return {"message": "Workflow Engine API", "version": "1.0.0"}

@app.post("/api/nodes/{node_id}/config")
async def update_node_config(node_id: str, config: Dict[str, Any]):
    """노드 설정 업데이트"""
    try:
        config_path = Path(f"config/nodes/{node_id}.json")
        config_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        
        return {"status": "success", "nodeId": node_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/nodes/{node_id}/config")
async def get_node_config(node_id: str):
    """노드 설정 조회"""
    try:
        config_path = Path(f"config/nodes/{node_id}.json")
        if not config_path.exists():
            return {"config": {}}
        
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        return {"config": config}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/storage/stats")
async def get_storage_stats():
    """스토리지 통계 조회"""
    try:
        data_path = Path("data")
        total_size = sum(f.stat().st_size for f in data_path.rglob("*") if f.is_file())
        file_count = sum(1 for f in data_path.rglob("*") if f.is_file())
        
        return {
            "totalSize": total_size,
            "fileCount": file_count,
            "categories": {
                "projects": {"size": 0, "count": 0},
                "references": {"size": 0, "count": 0},
                "samples": {"size": 0, "count": 0},
                "cache": {"size": 0, "count": 0}
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 초기화
@app.on_event("startup")
async def startup_event():
    """서버 시작 시 초기화"""
    # 필요한 디렉토리 생성
    dirs = ["config/nodes", "config/workflows", "data/projects", 
            "data/references", "data/samples", "data/cache"]
    for dir_path in dirs:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
    
    logger.info("Workflow Engine API started")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)