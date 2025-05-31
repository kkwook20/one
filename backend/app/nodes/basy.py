# backend/app/nodes/base.py

import asyncio
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, Any, Optional, List
from pathlib import Path

from app.models.node import Node, NodeData
from app.storage.node_storage import node_storage
from app.core.variable_resolver import variable_resolver
from app.utils.logger import setup_logger


class BaseNode(ABC):
    """
    모든 노드의 기본 클래스
    공통 기능과 인터페이스를 제공
    """
    
    def __init__(self, node_id: str, node_data: Optional[Dict[str, Any]] = None):
        """
        기본 노드 초기화
        
        Args:
            node_id: 노드 ID
            node_data: 노드 초기 데이터
        """
        self.node_id = node_id
        self.data = node_data or {}
        self.code = ""
        self.logger = setup_logger(f"{self.__class__.__name__}_{node_id}")
        self._initialized = False
        
    async def initialize(self):
        """노드 초기화 - 서브클래스에서 확장 가능"""
        if self._initialized:
            return
            
        try:
            # 저장된 노드 데이터 로드
            saved_node = await node_storage.get_data(self.node_id, 'node')
            if saved_node:
                self.data.update(saved_node.get('data', {}))
                
            # 저장된 코드 로드
            saved_code = await node_storage.get_code(self.node_id)
            if saved_code:
                self.code = saved_code
                
            # 메타데이터 초기화
            metadata = await node_storage.get_metadata(self.node_id) or {}
            if 'created_at' not in metadata:
                metadata['created_at'] = datetime.now().isoformat()
                await node_storage.save_metadata(self.node_id, metadata)
                
            self._initialized = True
            self.logger.info(f"Node {self.node_id} initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize node: {e}")
            raise
            
    async def execute(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        노드 실행 - 템플릿 메서드 패턴
        
        Args:
            data: 실행 입력 데이터
            
        Returns:
            실행 결과
        """
        start_time = datetime.now()
        
        try:
            # 초기화 확인
            if not self._initialized:
                await self.initialize()
                
            # 실행 컨텍스트 준비
            context = await self.prepare_execution_context()
            context.update(data)
            
            # 실행 전 검증
            validation_result = await self.validate_input(context)
            if not validation_result.get('valid', True):
                return {
                    "status": "error",
                    "error": f"Input validation failed: {validation_result.get('error')}",
                    "timestamp": datetime.now().isoformat()
                }
                
            # 메인 실행 로직
            output = await self.process(context)
            
            # 출력 후처리
            output = await self.post_process_output(output)
            
            # 실행 통계 업데이트
            await self.update_execution_stats(start_time, success=True)
            
            return {
                "status": "success",
                "output": output,
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            self.logger.error(f"Node execution failed: {e}")
            
            # 실행 통계 업데이트
            await self.update_execution_stats(start_time, success=False, error=str(e))
            
            return {
                "status": "error",
                "error": str(e),
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "timestamp": datetime.now().isoformat()
            }
            
    @abstractmethod
    async def process(self, context: Dict[str, Any]) -> Any:
        """
        메인 처리 로직 - 서브클래스에서 구현
        
        Args:
            context: 실행 컨텍스트
            
        Returns:
            처리 결과
        """
        pass
        
    async def prepare_execution_context(self) -> Dict[str, Any]:
        """실행 컨텍스트 준비"""
        context = {
            "node_id": self.node_id,
            "node_data": self.data.copy(),
            "global_variables": {}
        }
        
        # 글로벌 변수 해석
        if self.data.get('use_global_variables', True):
            try:
                # 코드에서 사용된 글로벌 변수 추출
                variables = await variable_resolver.extract_variables(self.code)
                
                # 변수 값 해석
                for var in variables:
                    value = await variable_resolver.resolve(var)
                    if value is not None:
                        context['global_variables'][var] = value
                        
            except Exception as e:
                self.logger.warning(f"Failed to resolve global variables: {e}")
                
        return context
        
    async def post_process_output(self, output: Any) -> Any:
        """출력 후처리"""
        # 출력 데이터 저장
        if output is not None:
            await node_storage.save_data(self.node_id, 'output', output)
            
        return output
        
    async def validate_input(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """입력 검증 - 서브클래스에서 재정의 가능"""
        return {"valid": True}
        
    async def update_execution_stats(
        self, 
        start_time: datetime, 
        success: bool = True,
        error: Optional[str] = None
    ):
        """실행 통계 업데이트"""
        try:
            metadata = await node_storage.get_metadata(self.node_id) or {}
            
            # 실행 횟수 증가
            metadata['execution_count'] = metadata.get('execution_count', 0) + 1
            
            # 마지막 실행 시간
            metadata['last_execution'] = datetime.now().isoformat()
            
            # 실행 시간 통계
            execution_time = (datetime.now() - start_time).total_seconds()
            
            # 평균 실행 시간 계산
            if 'average_execution_time' in metadata:
                count = metadata['execution_count']
                avg_time = metadata['average_execution_time']
                metadata['average_execution_time'] = (
                    (avg_time * (count - 1) + execution_time) / count
                )
            else:
                metadata['average_execution_time'] = execution_time
                
            # 에러 통계
            if not success:
                metadata['error_count'] = metadata.get('error_count', 0) + 1
                metadata['last_error'] = error
                metadata['last_error_time'] = datetime.now().isoformat()
                
            # 메타데이터 저장
            await node_storage.save_metadata(self.node_id, metadata)
            
        except Exception as e:
            self.logger.error(f"Failed to update execution stats: {e}")
            
    async def save_code(self, code: str, message: Optional[str] = None):
        """코드 저장"""
        self.code = code
        author = f"{self.__class__.__name__}_{self.node_id}"
        
        await node_storage.save_code(
            self.node_id,
            code,
            message=message or "Code updated",
            author=author
        )
        
    async def save_data(self, key: str, data: Any):
        """데이터 저장"""
        await node_storage.save_data(self.node_id, key, data)
        
    async def get_data(self, key: str) -> Any:
        """데이터 조회"""
        return await node_storage.get_data(self.node_id, key)
        
    async def save_file(self, filename: str, content: bytes) -> str:
        """파일 저장"""
        return await node_storage.save_file(self.node_id, filename, content)
        
    async def cleanup(self):
        """리소스 정리 - 서브클래스에서 재정의 가능"""
        pass
        
    def __str__(self):
        return f"{self.__class__.__name__}(id={self.node_id})"
        
    def __repr__(self):
        return self.__str__()