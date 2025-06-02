import sys
import json
import struct
import os
# import urllib.request # No longer needed
# import urllib.error   # No longer needed
# import socket         # No longer needed

# Attempt to import fastmcp, provide a mock if not found for basic script structure to be valid
try:
    import fastmcp.client
    FASTMCP_AVAILABLE = True
except ImportError:
    FASTMCP_AVAILABLE = False
    # Mock fastmcp for script structure validity if library is not installed
    class MockFastMcpClient:
        def __init__(self, *args, **kwargs):
            self.server_id = kwargs.get('server_id', 'mock_server')
            # print_debug(f"MockFastMcpClient initialized for {self.server_id} with args: {args}, kwargs: {kwargs}")
        def call_method_jsonrpc(self, method_name, params=None):
            print_debug(f"MockFastMcpClient: Attempting to call '{method_name}' on {self.server_id} with params: {params}")
            if method_name == 'tools/list':
                # Return a mock tool list for testing structure
                mock_tool = {
                    "tool_name": f"mock_tool_from_{self.server_id}",
                    "description": "A mock tool.",
                    "parameters_schema": {"type": "object", "properties": {}},
                }
                # Simulate some servers having tools and some not, or an error
                if "error" in self.server_id:
                    raise Exception(f"Mock error for {self.server_id}")
                if "empty" in self.server_id:
                    return []
                return [mock_tool]
            return None
        def close(self):
            # print_debug(f"MockFastMcpClient for {self.server_id} closed.")
            pass # Keep mock quiet on close for cleaner logs

    class fastmcp_module_mock: # Renamed to avoid conflict if real fastmcp exists partially
        class client:
            HttpClient = MockFastMcpClient
            SseClient = MockFastMcpClient # Assume SseClient has similar interface for now
            StdioClient = MockFastMcpClient

    # Assign the mock to fastmcp if the real one isn't available
    if not FASTMCP_AVAILABLE: # Redundant check but safe
        fastmcp = fastmcp_module_mock


SERVER_CONFIGURATIONS = []
DISCOVERED_TOOLS = []
PROCESSED_CALL_IDS = set()

def print_debug(message):
    sys.stderr.write(str(message) + '\n')
    sys.stderr.flush()

def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length: return None
    message_length = struct.unpack('@I', raw_length)[0]
    message_content = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message_content)

def send_message(message_content):
    encoded_content = json.dumps(message_content).encode('utf-8')
    message_length = struct.pack('@I', len(encoded_content))
    sys.stdout.buffer.write(message_length)
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.buffer.flush()

def send_example_response(original_message_tab_id, received_payload):
    response_payload = {
        "status": "success",
        "text_response": f"Python script processed: {received_payload.get('raw_xml', 'No raw_xml found')[:50]}...",
        "original_request": received_payload
    }
    message_to_send = {"tabId": original_message_tab_id, "payload": response_payload}
    print_debug(f"If uncommented, would send to extension: {json.dumps(message_to_send)}")

def load_server_configurations(config_filename="mcp_servers_config.json"):
    global SERVER_CONFIGURATIONS; SERVER_CONFIGURATIONS = []
    script_dir = os.path.dirname(os.path.abspath(__file__)); config_path = os.path.join(script_dir, config_filename)
    print_debug(f"Attempting to load MCP server configurations from: {config_path}")
    if not os.path.exists(config_path): print_debug(f"Error: Server configuration file not found at {config_path}"); return False
    try:
        with open(config_path, 'r') as f: data = json.load(f)
        server_list_from_file = data.get("mcpServers")
        if not isinstance(server_list_from_file, list): print_debug(f"Error: 'mcpServers' field in {config_path} is not a list or is missing."); return False
        valid_servers = []
        for i, server_def in enumerate(server_list_from_file):
            if not isinstance(server_def, dict): print_debug(f"Warning: Server definition at index {i} is not a dict. Skipping."); continue
            server_id = server_def.get("id"); server_type = server_def.get("type")
            if not server_id or not isinstance(server_id, str): print_debug(f"Warning: Server def at index {i} missing 'id'. Skipping: {str(server_def)[:100]}"); continue
            if not server_type or not isinstance(server_type, str): print_debug(f"Warning: Server '{server_id}' missing 'type'. Skipping."); continue
            is_valid_type = True
            if server_type == "stdio":
                if not server_def.get("command") or not isinstance(server_def.get("command"), str): print_debug(f"Warning: Stdio server '{server_id}' missing 'command'. Skipping."); is_valid_type = False
            elif server_type in ["streamable-http", "sse"]:
                if not server_def.get("url") or not isinstance(server_def.get("url"), str): print_debug(f"Warning: Server '{server_id}' ({server_type}) missing 'url'. Skipping."); is_valid_type = False
            else: print_debug(f"Warning: Server '{server_id}' unknown type '{server_type}'. Skipping."); is_valid_type = False
            if is_valid_type:
                if not isinstance(server_def.get("enabled"), bool): server_def["enabled"] = True
                valid_servers.append(server_def)
        SERVER_CONFIGURATIONS = valid_servers; return True
    except json.JSONDecodeError as e: print_debug(f"Error parsing JSON from {config_path}: {e}")
    except Exception as e: print_debug(f"Unexpected error loading server config: {e}")
    return False

# Removed discover_tools_http function (now handled by fastmcp clients)

def main():
    global DISCOVERED_TOOLS; DISCOVERED_TOOLS = []
    if not FASTMCP_AVAILABLE: # This global is set at import time
        print_debug("WARNING: fastmcp library not found. Tool discovery will use mock data and may not reflect real server behavior.")
    else:
        print_debug("fastmcp library seems to be available.")


    if load_server_configurations():
        if SERVER_CONFIGURATIONS: print_debug(f"Loaded {len(SERVER_CONFIGURATIONS)} MCP server configurations.")
        else: print_debug("No valid server configurations found.")
    else: print_debug("Failed to load MCP server configurations.")

    print_debug("Starting tool discovery using fastmcp library approach...")
    for server_config in SERVER_CONFIGURATIONS:
        server_id = server_config.get('id')
        server_type = server_config.get('type')
        is_enabled = server_config.get('enabled', True)

        if not is_enabled:
            print_debug(f"Skipping disabled server: '{server_id}'")
            continue

        print_debug(f"Processing server for tool discovery: '{server_id}' (Type: {server_type})")
        client = None
        tools_from_this_server = []
        try:
            if server_type == "streamable-http":
                client = fastmcp.client.HttpClient(url=server_config['url'], headers=server_config.get('headers', {}), server_id=server_id)
            elif server_type == "sse":
                client = fastmcp.client.SseClient(url=server_config['url'], headers=server_config.get('headers', {}), server_id=server_id)
            elif server_type == "stdio":
                client = fastmcp.client.StdioClient(
                    command=server_config['command'],
                    args=server_config.get('args', []),
                    env=server_config.get('env', {}),
                    server_id=server_id
                )
            else:
                print_debug(f"Warning: Unknown server type '{server_type}' for server '{server_id}'. Cannot perform discovery.")
                continue

            if client:
                print_debug(f"[{server_id}] Calling 'tools/list'...")
                raw_tools_data = client.call_method_jsonrpc('tools/list')

                if isinstance(raw_tools_data, list):
                    for i, tool_def in enumerate(raw_tools_data):
                        if isinstance(tool_def, dict) and \
                           tool_def.get("tool_name") and \
                           tool_def.get("description") and \
                           tool_def.get("parameters_schema"):
                            tool_def['mcp_server_id'] = server_id
                            tool_def['mcp_server_url'] = server_config.get("url")
                            tool_def['mcp_server_command'] = server_config.get("command")
                            tool_def['mcp_server_type'] = server_type
                            tools_from_this_server.append(tool_def)
                        else:
                            print_debug(f"Warning: Invalid tool definition received from '{server_id}' at index {i}. Skipping: {str(tool_def)[:100]}")
                    print_debug(f"Successfully discovered {len(tools_from_this_server)} tools from '{server_id}'.")
                    DISCOVERED_TOOLS.extend(tools_from_this_server)
                else:
                    print_debug(f"Error: Tool discovery response from '{server_id}' is not a list as expected. Got: {type(raw_tools_data)}")
        except Exception as e:
            print_debug(f"Error during tool discovery for server '{server_id}': {e}")
        finally:
            if client and hasattr(client, 'close') and callable(client.close):
                 try: client.close()
                 except Exception as e_close: print_debug(f"Error closing client for '{server_id}': {e_close}")

    if DISCOVERED_TOOLS:
        print_debug(f"--- Total tools discovered: {len(DISCOVERED_TOOLS)} ---")
        tool_names_seen = {}
        for tool in DISCOVERED_TOOLS:
            tool_name = tool.get('tool_name'); origin_server = tool.get('mcp_server_id')
            print_debug(f"  - Found tool: '{tool_name}' from server: '{origin_server}'")
            if tool_name in tool_names_seen: print_debug(f"    WARNING: Duplicate tool_name '{tool_name}' also on server '{tool_names_seen[tool_name]}'.")
            tool_names_seen[tool_name] = origin_server
    else:
        print_debug("No tools were discovered from any active server.")

    print_debug(f"MCP Native Host script initialized. Waiting for messages...")
    while True:
        try:
            received_message = get_message()
            if received_message is None: print_debug("No message from extension. Browser might have closed."); break

            print_debug(f"Received message: {json.dumps(received_message)}")

            payload = received_message.get("payload")
            if isinstance(payload, dict):
                call_id = payload.get("call_id")
                if call_id and isinstance(call_id, str) and call_id.strip():
                    if call_id in PROCESSED_CALL_IDS:
                        print_debug(f"Duplicate call_id '{call_id}' received. Skipping.")
                        continue
                    PROCESSED_CALL_IDS.add(call_id)
                    print_debug(f"Added call_id '{call_id}' to processed set.")
                elif call_id is not None:
                     print_debug(f"Warning: Received tool call with invalid or empty call_id ('{call_id}'). Processing without duplicate check for this call.")
                else:
                    print_debug("Warning: Received tool call without 'call_id' in payload. Processing without duplicate check for this call.")
            else:
                print_debug("Warning: Received message payload is not a dictionary. Cannot check for call_id.")

            if received_message.get("type") == "TOOL_CALL_DETECTED":
                 send_example_response(received_message.get("tabId"), payload)

        except EOFError: print_debug("EOF encountered, stdin closed. Exiting."); break
        except Exception as e:
            print_debug(f"Error processing message loop: {e}")
            if isinstance(e, struct.error): print_debug("Struct error, likely malformed message length. Exiting."); break

if __name__ == '__main__':
    try: main()
    except Exception as e: print_debug(f"Unhandled exception in main: {e}"); sys.exit(1)

```
