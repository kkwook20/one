#!/usr/bin/env python3
"""Test script to debug rapid toggling issue"""

import asyncio
import aiohttp
import json
from datetime import datetime

async def test_websocket_connection():
    """Test WebSocket connection and monitor state changes"""
    
    print("Testing WebSocket connection to monitor state changes...")
    
    session = aiohttp.ClientSession()
    
    try:
        # Connect to WebSocket
        ws_url = "ws://localhost:8000/api/argosa/data/ws/state"
        
        async with session.ws_connect(ws_url) as ws:
            print(f"[{datetime.now().isoformat()}] Connected to WebSocket")
            
            # Monitor messages for 30 seconds
            start_time = datetime.now()
            message_count = 0
            state_changes = []
            
            while (datetime.now() - start_time).seconds < 30:
                try:
                    msg = await asyncio.wait_for(ws.receive(), timeout=1.0)
                    
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        data = json.loads(msg.data)
                        if data.get("type") == "state_update":
                            message_count += 1
                            state = data.get("data", {})
                            
                            state_info = {
                                "time": datetime.now().isoformat(),
                                "count": message_count,
                                "system": state.get("system_status"),
                                "firefox": state.get("firefox_status"),
                                "extension": state.get("extension_status")
                            }
                            
                            # Only log if state changed
                            if not state_changes or state_changes[-1]["system"] != state_info["system"] or \
                               state_changes[-1]["firefox"] != state_info["firefox"] or \
                               state_changes[-1]["extension"] != state_info["extension"]:
                                state_changes.append(state_info)
                                print(f"[{state_info['time']}] State Change #{state_info['count']}: "
                                      f"system={state_info['system']}, "
                                      f"firefox={state_info['firefox']}, "
                                      f"extension={state_info['extension']}")
                    
                    elif msg.type == aiohttp.WSMsgType.ERROR:
                        print(f"WebSocket error: {ws.exception()}")
                        break
                        
                except asyncio.TimeoutError:
                    # No message received in 1 second, continue
                    pass
            
            print(f"\nTest completed. Total messages: {message_count}")
            print(f"Unique state changes: {len(state_changes)}")
            
            if len(state_changes) > 10:
                print("\n⚠️  WARNING: Too many state changes detected!")
                print("This indicates a rapid toggling issue.")
                
                # Calculate toggle frequency
                if len(state_changes) > 1:
                    time_diff = (datetime.fromisoformat(state_changes[-1]["time"]) - 
                                datetime.fromisoformat(state_changes[0]["time"])).total_seconds()
                    toggle_rate = len(state_changes) / time_diff
                    print(f"Toggle rate: {toggle_rate:.2f} changes per second")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await session.close()

async def test_status_endpoint():
    """Test the status endpoint"""
    
    print("\nTesting status endpoint...")
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get("http://localhost:8000/api/argosa/data/status") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    state = data.get("state", {})
                    print(f"Current state from /status endpoint:")
                    print(f"  - system: {state.get('system_status')}")
                    print(f"  - firefox: {state.get('firefox_status')}")
                    print(f"  - extension: {state.get('extension_status')}")
                else:
                    print(f"Status endpoint returned: {resp.status}")
        except Exception as e:
            print(f"Error calling status endpoint: {e}")

async def main():
    """Main test function"""
    
    print("=" * 60)
    print("Rapid Toggle Debug Test")
    print("=" * 60)
    
    # Test status endpoint first
    await test_status_endpoint()
    
    # Then monitor WebSocket for state changes
    await test_websocket_connection()

if __name__ == "__main__":
    asyncio.run(main())