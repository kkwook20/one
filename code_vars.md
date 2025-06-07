Worker 노드 코드에서 사용 가능한 변수들:
1. current_node - 현재 노드의 전체 정보
            python# 현재 노드의 모든 설정에 접근
            print(current_node)
            # {
            #   "id": "worker-123456",
            #   "type": "worker",
            #   "label": "Character Extractor",
            #   "purpose": "Extract character names and descriptions from script",
            #   "outputFormat": "Create a JSON object with character names as keys...",
            #   "tasks": [
            #     {"id": "task-1", "text": "Parse script text", "status": "pending"},
            #     {"id": "task-2", "text": "Extract character names", "status": "pending"}
            #   ],
            #   "model": "llama-3.2-3b",
            #   "lmStudioUrl": "http://localhost:1234/"
            # }

            # 특정 필드 접근
            purpose = current_node['purpose']
            tasks = current_node['tasks']
            output_format = current_node['outputFormat']


2. node_purpose - 노드의 목적 (바로 사용 가능)
            pythonprint(node_purpose)  # "Extract character names and descriptions from script"


3. output_format_description - 출력 형식 설명 (바로 사용 가능)
            pythonprint(output_format_description)  # "Create a JSON object with character names as keys..."

4. get_connected_outputs() - 연결된 노드의 출력
            # 이 노드로 연결된 모든 노드의 출력 가져오기
            inputs = get_connected_outputs()
            # {"Script Input": {"text": "script content..."}}


5. get_global_var() - 다른 노드의 데이터 접근
            python# 형식: {section}.{nodeType}.{nodeId}.output
            script_data = get_global_var("script.input.input-script.output")
            other_worker_data = get_global_var("script.worker.worker-123.output")



6. AI 모델 변수들
            pythonmodel_name  # "llama-3.2-3b" 
            lm_studio_url  # "http://localhost:1234/"