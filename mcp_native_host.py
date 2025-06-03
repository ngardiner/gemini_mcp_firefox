#!/usr/bin/env python3

import sys
import sys
import json
import struct
import os
import xml.etree.ElementTree as ET

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

def parse_tool_call_xml(xml_string, received_call_id_attr=None):
    """
    Parses an XML string containing tool calls.
    Returns a list of dictionaries, each representing a tool call.
    """
    tool_calls = []
    try:
        print_debug(f"Attempting to parse XML: {xml_string}")
        # Sanitize common problematic characters if any (though ET should handle most standard XML)
        # xml_string = xml_string.replace('&', '&amp;') # ET usually handles this. Be careful not to double-escape.

        root = ET.fromstring(xml_string)

        invoke_elements = []
        if root.tag == 'function_calls':
            invoke_elements = root.findall('invoke')
            if not invoke_elements: # Check if root itself might be a mis-nested invoke
                 print_debug(f"Warning: <function_calls> root found, but no <invoke> children. XML: {xml_string}")
        elif root.tag == 'invoke':
            invoke_elements.append(root)
        else:
            print_debug(f"Error: XML root is neither <function_calls> nor <invoke>. Root tag: {root.tag}. XML: {xml_string}")
            return [{"error": f"XML root is not <function_calls> or <invoke>, got <{root.tag}>", "raw_xml": xml_string, "call_id": received_call_id_attr}]

        if not invoke_elements:
            print_debug(f"Warning: No <invoke> elements found after parsing. XML: {xml_string}")
            # Return an error if received_call_id_attr was present, as an invocation was expected.
            if received_call_id_attr:
                 return [{"error": "No <invoke> elements found in XML", "raw_xml": xml_string, "call_id": received_call_id_attr}]
            return []


        for invoke_element in invoke_elements:
            tool_name = invoke_element.get('name')
            call_id_from_xml = invoke_element.get('call_id')

            final_call_id = call_id_from_xml # Prefer call_id from XML content
            if not final_call_id and received_call_id_attr:
                final_call_id = received_call_id_attr
                print_debug(f"Used call_id ('{received_call_id_attr}') from content_script attribute as XML was missing one for tool '{tool_name}'.")
            elif call_id_from_xml and received_call_id_attr and call_id_from_xml != received_call_id_attr:
                print_debug(f"Warning: call_id from XML ('{call_id_from_xml}') differs from content_script attribute ('{received_call_id_attr}') for tool '{tool_name}'. Using XML value.")

            if not tool_name:
                print_debug(f"Warning: <invoke> element missing 'name' attribute. Skipping. XML: {ET.tostring(invoke_element, encoding='unicode')}")
                # Optionally, could append an error object to tool_calls here
                continue
            if not final_call_id:
                print_debug(f"Warning: <invoke> element for tool '{tool_name}' missing 'call_id' (both in XML and from attribute). Skipping. XML: {ET.tostring(invoke_element, encoding='unicode')}")
                # Optionally, could append an error object
                continue

            parameters = {}
            for param_element in invoke_element.findall('parameter'):
                param_name = param_element.get('name')
                if param_name:
                    parameters[param_name] = param_element.text.strip() if param_element.text else ""
                else:
                    print_debug(f"Warning: <parameter> tag missing 'name' attribute in tool '{tool_name}'. Skipping parameter. XML: {ET.tostring(param_element, encoding='unicode')}")

            tool_calls.append({
                "tool_name": tool_name,
                "parameters": parameters,
                "call_id": final_call_id,
                "raw_xml_invoke": ET.tostring(invoke_element, encoding='unicode') # XML for this specific invoke
            })

        print_debug(f"Successfully parsed {len(tool_calls)} tool call(s) from XML.")
        return tool_calls

    except ET.ParseError as e:
        print_debug(f"XML parsing error: {e}. XML string: {xml_string}")
        return [{"error": f"XML parsing error: {e}", "raw_xml": xml_string, "call_id": received_call_id_attr}]
    except Exception as e:
        print_debug(f"Unexpected error in parse_tool_call_xml: {e}. XML string: {xml_string}")
        return [{"error": f"Unexpected error during XML parsing: {e}", "raw_xml": xml_string, "call_id": received_call_id_attr}]


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

            message_type = received_message.get("type")
            tab_id = received_message.get("tabId") # Ensure tabId is captured for responses
            payload = received_message.get("payload")

            print_debug(f"Received message of type '{message_type}': {json.dumps(payload if payload else received_message)}")

            if message_type == "TOOL_CALL_DETECTED":
                if not payload or "raw_xml" not in payload:
                    print_debug("Error: TOOL_CALL_DETECTED message missing payload or raw_xml.")
                    if tab_id: # Try to send error back if tab_id is known
                         send_message({"tabId": tab_id, "payload": {"status": "error", "message": "Python host received empty/invalid tool call payload."}})
                    continue

                raw_xml_from_cs = payload.get("raw_xml")
                call_id_from_cs_attr = payload.get("call_id") # This is the call_id extracted from DOM attribute by content_script

                print_debug(f"Processing TOOL_CALL_DETECTED. XML: {raw_xml_from_cs[:200]}... CS CallID Attr: {call_id_from_cs_attr}")

                parsed_tool_calls = parse_tool_call_xml(raw_xml_from_cs, call_id_from_cs_attr)

                if not parsed_tool_calls:
                    print_debug("No tool calls parsed or XML was empty/invalid.")
                    # Consider sending a specific response if parsing returned nothing but no explicit error
                    if tab_id:
                         send_message({
                             "tabId": tab_id,
                             "payload": {
                                 "status": "no_tools_parsed",
                                 "message": "Python host: XML received, but no valid tool calls were parsed.",
                                 "original_raw_xml": raw_xml_from_cs[:200]
                             }
                         })
                    continue

                for tool_call_data in parsed_tool_calls:
                    if "error" in tool_call_data:
                        print_debug(f"Error in parsed tool call data: {tool_call_data['error']}")
                        if tab_id:
                            send_message({
                                "tabId": tab_id,
                                "payload": {
                                    "status": "error_parsing",
                                    "message": f"Python host: {tool_call_data['error']}",
                                    "call_id": tool_call_data.get("call_id"), # This might be the CS attr if parsing failed early
                                    "raw_xml_snippet": tool_call_data.get("raw_xml", raw_xml_from_cs)[:200]
                                }
                            })
                        continue # Move to the next parsed call, if any

                    # This is the call_id from Python parsing (XML content preferred, then CS attribute)
                    parsed_call_id = tool_call_data.get("call_id")
                    tool_name = tool_call_data.get("tool_name")
                    parameters = tool_call_data.get("parameters")

                    if not parsed_call_id:
                        print_debug(f"Critical: Parsed tool '{tool_name}' is missing a call_id after parsing. This should not happen if parse_tool_call_xml is correct. Skipping.")
                        if tab_id:
                             send_message({
                                 "tabId": tab_id,
                                 "payload": {
                                     "status": "error_internal",
                                     "tool_name": tool_name,
                                     "message": f"Python host: Internal error - parsed tool '{tool_name}' is missing call_id."
                                 }
                             })
                        continue

                    print_debug(f"Parsed Tool Call: Name='{tool_name}', Call_ID='{parsed_call_id}', Params='{parameters}'")

                    # Duplicate Check using the call_id from Python parsing
                    if parsed_call_id in PROCESSED_CALL_IDS:
                        print_debug(f"Duplicate call_id '{parsed_call_id}' (from Python parsing) detected. Skipping tool '{tool_name}'.")
                        if tab_id: # Inform extension about skipping duplicate
                            send_message({
                                "tabId": tab_id,
                                "payload": {
                                    "status": "skipped_duplicate",
                                    "tool_name": tool_name,
                                    "call_id": parsed_call_id,
                                    "message": f"Python host: Tool call '{tool_name}' (ID: {parsed_call_id}) skipped as duplicate."
                                }
                            })
                        continue
                    PROCESSED_CALL_IDS.add(parsed_call_id)
                    print_debug(f"Added call_id '{parsed_call_id}' to processed set. Set size: {len(PROCESSED_CALL_IDS)}")

                    # --- BEGIN TOOL EXECUTION LOGIC ---
                    if not FASTMCP_AVAILABLE:
                        print_debug(f"FASTMCP_AVAILABLE is False. Cannot execute tool '{tool_name}'. Sending error to extension.")
                        if tab_id:
                            send_message({
                                "tabId": tab_id,
                                "payload": {
                                    "status": "error_executing_tool",
                                    "tool_name": tool_name,
                                    "call_id": parsed_call_id,
                                    "message": "fastmcp library is not available in the native host. Tool execution is disabled.",
                                    "text_response": f"<tool_result><call_id>{parsed_call_id}</call_id><tool_name>{tool_name}</tool_name><result>ERROR: fastmcp library not available. Tool execution disabled.</result></tool_result>"
                                }
                            })
                        continue # Skip to next tool call

                    # 1. Find Tool and Server Configuration
                    discovered_tool_config = None
                    for dt in DISCOVERED_TOOLS:
                        if dt.get("tool_name") == tool_name:
                            discovered_tool_config = dt
                            break

                    if not discovered_tool_config:
                        print_debug(f"Error: Tool '{tool_name}' (ID: {parsed_call_id}) not found in DISCOVERED_TOOLS list after initial check.")
                        if tab_id:
                            send_message({
                                "tabId": tab_id,
                                "payload": {
                                    "status": "tool_not_found",
                                    "tool_name": tool_name,
                                    "call_id": parsed_call_id,
                                    "message": f"Python host: Tool '{tool_name}' (ID: {parsed_call_id}) not found in discovered tools during execution phase.",
                                    "text_response": f"<tool_result><call_id>{parsed_call_id}</call_id><tool_name>{tool_name}</tool_name><result>ERROR: Tool '{tool_name}' not found.</result></tool_result>"
                                }
                            })
                        continue

                    mcp_server_id = discovered_tool_config.get("mcp_server_id")
                    server_config = None
                    for sc in SERVER_CONFIGURATIONS:
                        if sc.get("id") == mcp_server_id:
                            server_config = sc
                            break

                    if not server_config:
                        print_debug(f"Error: Server configuration for mcp_server_id '{mcp_server_id}' not found for tool '{tool_name}'.")
                        if tab_id:
                            send_message({
                                "tabId": tab_id,
                                "payload": {
                                    "status": "error_executing_tool",
                                    "tool_name": tool_name,
                                    "call_id": parsed_call_id,
                                    "message": f"Python host: Server configuration for '{mcp_server_id}' not found while trying to execute tool '{tool_name}'.",
                                    "text_response": f"<tool_result><call_id>{parsed_call_id}</call_id><tool_name>{tool_name}</tool_name><result>ERROR: Server configuration for '{mcp_server_id}' not found for tool '{tool_name}'.</result></tool_result>"
                                }
                            })
                        continue

                    # 2. Instantiate MCP Client
                    client = None
                    try:
                        server_type = server_config['type']
                        if server_type == "streamable-http":
                            client = fastmcp.client.HttpClient(url=server_config['url'], headers=server_config.get('headers', {}), server_id=mcp_server_id)
                        elif server_type == "sse":
                            client = fastmcp.client.SseClient(url=server_config['url'], headers=server_config.get('headers', {}), server_id=mcp_server_id)
                        elif server_type == "stdio":
                            client = fastmcp.client.StdioClient(
                                command=server_config['command'],
                                args=server_config.get('args', []),
                                env=server_config.get('env', {}),
                                server_id=mcp_server_id
                            )
                        else:
                            raise ValueError(f"Unsupported server type: {server_type}")
                        print_debug(f"Successfully instantiated MCP client for tool '{tool_name}' on server '{mcp_server_id}' of type '{server_type}'.")
                    except Exception as e_client_init:
                        print_debug(f"Error instantiating MCP client for tool '{tool_name}' (server '{mcp_server_id}'): {e_client_init}")
                        if tab_id:
                            send_message({
                                "tabId": tab_id,
                                "payload": {
                                    "status": "error_executing_tool",
                                    "tool_name": tool_name,
                                    "call_id": parsed_call_id,
                                    "message": f"Python host: Error initializing client for tool '{tool_name}': {str(e_client_init)}",
                                    "text_response": f"<tool_result><call_id>{parsed_call_id}</call_id><tool_name>{tool_name}</tool_name><result>ERROR: Initializing client for tool '{tool_name}': {str(e_client_init)}</result></tool_result>"
                                }
                            })
                        if client and hasattr(client, 'close'): client.close() # Ensure close if partially initialized
                        continue

                    # 3. Execute Tool Call
                    tool_result = None
                    try:
                        print_debug(f"Executing tool '{tool_name}' (ID: {parsed_call_id}) with params: {parameters} via MCP client for server '{mcp_server_id}'.")
                        tool_result = client.call_method_jsonrpc(tool_name, parameters)
                        print_debug(f"Tool '{tool_name}' (ID: {parsed_call_id}) executed successfully. Raw Result: {str(tool_result)[:200]}...")

                        # 1. Define Result XML Structure & 2. Format the Result
                        actual_result_content = ""
                        if isinstance(tool_result, (dict, list)):
                            actual_result_content = json.dumps(tool_result)
                        elif tool_result is None: # Handle None explicitly if necessary
                            actual_result_content = "" # Or json.dumps(None) -> "null"
                        else:
                            actual_result_content = str(tool_result)

                        # Basic XML escaping for the content - just in case, though JSON strings are usually safe.
                        # A more robust solution might use a library or more careful escaping.
                        actual_result_content = actual_result_content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

                        formatted_xml_result = f"""<tool_result>
  <call_id>{parsed_call_id}</call_id>
  <tool_name>{tool_name}</tool_name>
  <result>{actual_result_content}</result>
</tool_result>"""

                        print_debug(f"Formatted XML result for '{tool_name}' (ID: {parsed_call_id}): {formatted_xml_result}")

                        # 3. Send Formatted Result to Extension
                        response_payload_to_extension = {
                            "status": "tool_executed_and_result_ready",
                            "tool_name": tool_name,
                            "call_id": parsed_call_id,
                            "text_response": formatted_xml_result
                        }
                        if tab_id:
                            send_message({"tabId": tab_id, "payload": response_payload_to_extension})
                            print_debug(f"Sent formatted XML result to extension for tool '{tool_name}', call_id '{parsed_call_id}'.")
                        else:
                            print_debug(f"Warning: No tabId, cannot send formatted XML result for call_id '{parsed_call_id}'.")

                    except Exception as e_tool_call:
                        print_debug(f"Error executing tool '{tool_name}' (ID: {parsed_call_id}) via MCP client: {e_tool_call}")
                        if tab_id:
                            send_message({
                                "tabId": tab_id,
                                "payload": {
                                    "status": "error_executing_tool",
                                    "tool_name": tool_name,
                                    "call_id": parsed_call_id,
                                    "message": f"Python host: Error during execution of tool '{tool_name}': {str(e_tool_call)}",
                                    "text_response": f"<tool_result><call_id>{parsed_call_id}</call_id><tool_name>{tool_name}</tool_name><result>ERROR: During execution of tool '{tool_name}': {str(e_tool_call)}</result></tool_result>"
                                }
                            })
                        continue # Continue to next tool call if there was an error
                    finally:
                        if client and hasattr(client, 'close') and callable(client.close):
                            try:
                                client.close()
                                print_debug(f"Closed MCP client for tool '{tool_name}' (server '{mcp_server_id}').")
                            except Exception as e_close:
                                print_debug(f"Error closing MCP client for '{mcp_server_id}': {e_close}")
                    # --- END TOOL EXECUTION LOGIC ---

            elif message_type == "PING": # Example of handling other message types
                print_debug("Received PING from extension.")
                if tab_id:
                    send_message({"tabId": tab_id, "payload": {"type": "PONG", "message": "Python host says PONG!"}})


        except EOFError: print_debug("EOF encountered, stdin closed. Exiting."); break
        except Exception as e:
            print_debug(f"Error processing message loop: {e}")
            # Attempt to send an error message back to the extension if a tabId is available
            # This is a general error catch, might not always have tab_id if error is in get_message() itself
            try:
                current_tab_id = received_message.get("tabId") if 'received_message' in locals() and received_message else None
                if current_tab_id:
                     send_message({"tabId": current_tab_id, "payload": {"status": "error_processing_loop", "message": f"Python host error: {str(e)}"}})
            except Exception as e_send:
                print_debug(f"Failed to send error message to extension during exception handling: {e_send}")

            if isinstance(e, struct.error): print_debug("Struct error, likely malformed message length. Exiting."); break

if __name__ == '__main__':
    try: main()
    except Exception as e: print_debug(f"Unhandled exception in main: {e}"); sys.exit(1)
