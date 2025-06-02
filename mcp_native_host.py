import sys
import json
import struct
import os
import urllib.request
import urllib.error
import socket

SERVER_CONFIGURATIONS = []
DISCOVERED_TOOLS = []
PROCESSED_CALL_IDS = set() # Global set for tracking processed call_ids

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
    global SERVER_CONFIGURATIONS
    SERVER_CONFIGURATIONS = []
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(script_dir, config_filename)
    print_debug(f"Attempting to load MCP server configurations from: {config_path}")
    if not os.path.exists(config_path):
        print_debug(f"Error: Server configuration file not found at {config_path}")
        return False
    try:
        with open(config_path, 'r') as f: data = json.load(f)
        server_list_from_file = data.get("mcpServers")
        if not isinstance(server_list_from_file, list):
            print_debug(f"Error: 'mcpServers' field in {config_path} is not a list or is missing.")
            return False
        valid_servers = []
        for i, server_def in enumerate(server_list_from_file):
            if not isinstance(server_def, dict):
                print_debug(f"Warning: Server definition at index {i} is not a dict. Skipping.")
                continue
            server_id = server_def.get("id")
            server_type = server_def.get("type")
            if not server_id or not isinstance(server_id, str):
                print_debug(f"Warning: Server def at index {i} missing 'id'. Skipping: {str(server_def)[:100]}")
                continue
            if not server_type or not isinstance(server_type, str):
                print_debug(f"Warning: Server '{server_id}' missing 'type'. Skipping.")
                continue
            is_valid_type = True
            if server_type == "stdio":
                if not server_def.get("command") or not isinstance(server_def.get("command"), str):
                    print_debug(f"Warning: Stdio server '{server_id}' missing 'command'. Skipping.")
                    is_valid_type = False
            elif server_type in ["streamable-http", "sse"]:
                if not server_def.get("url") or not isinstance(server_def.get("url"), str):
                    print_debug(f"Warning: Server '{server_id}' ({server_type}) missing 'url'. Skipping.")
                    is_valid_type = False
            else:
                print_debug(f"Warning: Server '{server_id}' unknown type '{server_type}'. Skipping.")
                is_valid_type = False
            if is_valid_type:
                if not isinstance(server_def.get("enabled"), bool):
                    server_def["enabled"] = True
                valid_servers.append(server_def)
        SERVER_CONFIGURATIONS = valid_servers
        return True
    except json.JSONDecodeError as e: print_debug(f"Error parsing JSON from {config_path}: {e}")
    except Exception as e: print_debug(f"Unexpected error loading server config: {e}")
    return False

def discover_tools_http(server_config):
    server_id = server_config.get("id")
    base_url = server_config.get("url", "") # Ensure base_url is always a string
    if not base_url.endswith('/'): base_url += '/'
    discovery_url = base_url + "tools/list"
    headers = server_config.get("headers", {})
    timeout_seconds = 10
    print_debug(f"Attempting tool discovery for server '{server_id}' at {discovery_url}")
    discovered_tools_for_server = []
    response_body_for_error_logging = "[Could not read response body]"
    try:
        req = urllib.request.Request(discovery_url, headers=headers, method='GET')
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            response_body_for_error_logging = response.read().decode('utf-8', errors='ignore') # Read once
            if response.status == 200:
                tools_data = json.loads(response_body_for_error_logging)
                if isinstance(tools_data, list):
                    for i, tool_def in enumerate(tools_data):
                        if isinstance(tool_def, dict) and tool_def.get("tool_name") and tool_def.get("description") and tool_def.get("parameters_schema"):
                            tool_def['mcp_server_id'] = server_id
                            tool_def['mcp_server_url'] = server_config.get("url")
                            tool_def['mcp_server_type'] = server_config.get("type")
                            discovered_tools_for_server.append(tool_def)
                        else:
                            print_debug(f"Warning: Invalid tool definition from '{server_id}' index {i}. Skipping: {str(tool_def)[:100]}")
                    print_debug(f"Successfully discovered {len(discovered_tools_for_server)} tools from '{server_id}'.")
                else:
                    print_debug(f"Error: Tool discovery response from '{server_id}' not a list. Response: {str(tools_data)[:200]}")
            else:
                print_debug(f"Error: Tool discovery for '{server_id}' failed HTTP status {response.status}. Response: {response_body_for_error_logging[:200]}")
    except urllib.error.HTTPError as e:
        error_response_body = "[Could not read error response body]"
        try: error_response_body = e.read().decode('utf-8', errors='ignore')
        except: pass
        print_debug(f"HTTPError for '{server_id}': {e.code} {e.reason}. Response: {error_response_body[:200]}")
    except urllib.error.URLError as e: print_debug(f"URLError for '{server_id}': {e.reason}")
    except socket.timeout: print_debug(f"Timeout for '{server_id}' at {discovery_url}")
    except json.JSONDecodeError as e: print_debug(f"JSONDecodeError parsing tools from '{server_id}': {e}. Response: {response_body_for_error_logging[:200]}")
    except Exception as e: print_debug(f"Unexpected error during tool discovery for '{server_id}': {e}")
    return discovered_tools_for_server

def main():
    global DISCOVERED_TOOLS
    DISCOVERED_TOOLS = []
    if load_server_configurations():
        if SERVER_CONFIGURATIONS: print_debug(f"Loaded {len(SERVER_CONFIGURATIONS)} MCP server configurations.")
        else: print_debug("No valid server configurations found.")
    else: print_debug("Failed to load MCP server configurations.")

    print_debug("Starting tool discovery...")
    for server_conf in SERVER_CONFIGURATIONS:
        server_id = server_conf.get('id')
        server_type = server_conf.get('type')
        is_enabled = server_conf.get('enabled', True)
        if not is_enabled: print_debug(f"Skipping disabled server: '{server_id}'"); continue
        print_debug(f"Processing server: '{server_id}' (Type: {server_type})")
        if server_type in ["streamable-http", "sse"]:
            tools_from_server = discover_tools_http(server_conf)
            DISCOVERED_TOOLS.extend(tools_from_server)
        elif server_type == "stdio": print_debug(f"Tool discovery for stdio server '{server_id}' not yet implemented.")
        else: print_debug(f"Warning: Unknown server type '{server_type}' for '{server_id}'. Cannot discover.")

    if DISCOVERED_TOOLS:
        print_debug(f"--- Total tools discovered: {len(DISCOVERED_TOOLS)} ---")
        tool_names_seen = {}
        for tool in DISCOVERED_TOOLS:
            tool_name = tool.get('tool_name')
            origin_server = tool.get('mcp_server_id')
            print_debug(f"  - Found tool: '{tool_name}' from server: '{origin_server}'")
            if tool_name in tool_names_seen: print_debug(f"    WARNING: Duplicate tool_name '{tool_name}' also on server '{tool_names_seen[tool_name]}'.")
            tool_names_seen[tool_name] = origin_server
    else: print_debug("No tools discovered.")

    print_debug(f"MCP Native Host script initialized. Waiting for messages...")
    while True:
        try:
            received_message = get_message()
            if received_message is None: print_debug("No message from extension. Browser might have closed."); break

            print_debug(f"Received message: {json.dumps(received_message)}") # Log raw message first

            payload = received_message.get("payload")
            if isinstance(payload, dict):
                call_id = payload.get("call_id")
                if call_id and isinstance(call_id, str) and call_id.strip(): # Ensure call_id is a non-empty string
                    if call_id in PROCESSED_CALL_IDS:
                        print_debug(f"Duplicate call_id '{call_id}' received. Skipping.")
                        continue # Skip to the next message
                    PROCESSED_CALL_IDS.add(call_id)
                    print_debug(f"Added call_id '{call_id}' to processed set.")
                elif call_id is not None: # It's present but not a non-empty string (e.g. empty string, null from JS if attribute missing)
                     print_debug(f"Warning: Received tool call with invalid or empty call_id ('{call_id}'). Processing without duplicate check for this call.")
                else: # call_id key was not in payload
                    print_debug("Warning: Received tool call without 'call_id' in payload. Processing without duplicate check for this call.")
            else:
                print_debug("Warning: Received message payload is not a dictionary. Cannot check for call_id.")

            # Placeholder for actual tool execution logic based on payload['tool_name']
            # This is where you would look up the tool in DISCOVERED_TOOLS and proxy to its mcp_server_url
            # For now, just using the example response if it's a tool call type message
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
