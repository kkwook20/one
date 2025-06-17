import sys
import json
import struct

# 테스트 메시지
test_message = {
    "type": "init",
    "data": {"version": "2.0"}
}

# Native Messaging 형식으로 인코딩
message_json = json.dumps(test_message)
message_bytes = message_json.encode('utf-8')
message_length = struct.pack('I', len(message_bytes))

# 전송
sys.stdout.buffer.write(message_length + message_bytes)
sys.stdout.buffer.flush()

# 응답 대기
length_bytes = sys.stdin.buffer.read(4)
if length_bytes:
    length = struct.unpack('I', length_bytes)[0]
    response = sys.stdin.buffer.read(length)
    print(f"Response: {json.loads(response)}")