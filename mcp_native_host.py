#!/usr/bin/env python3

import asyncio
import fastmcp
import sys
import json
import struct
import os
import xml.etree.ElementTree as ET

# Helper function to run asyncio tasks
def run_async_task(task):
    """
    Runs an awaitable task using asyncio.run().
    This is a placeholder for integrating async calls, e.g., with fastmcp.Client.
    """
    return asyncio.run(task)

def print_debug(message):
    sys.stderr.write(str(message) + '\n')
    sys.stderr.flush()

# Base system prompt including a placeholder for the dynamic tool list
BASE_SYSTEM_PROMPT = r"""
[Start fresh Session from here]

<SYSTEM>
You have the capability to invoke functions and make the best use of them. You are a knowledgeable assistant focused on answering questions and providing information on any topics.
In this environment you have access to a set of tools you can use to answer the user's question.

Function Call Structure:
- All function calls should be wrapped in 'xml' codeblocks tags like ```xml ... ```. This is strict requirement.
- Wrap all function calls in 'function_calls' tags
- Each function call uses 'invoke' tags with a 'name' attribute
- Parameters use 'parameter' tags with 'name' attributes
- Parameter Formatting:
  - String/scalar parameters: written directly as values
  - Lists/objects: must use proper JSON format
  - Required parameters must always be included
  - Optional parameters should only be included when needed
  - If there is xml inside the parameter value, do not use CDATA for wrapping it, just give the xml directly

The instructions regarding 'invoke' specify that:
- When invoking functions, use the 'invoke' tag with a 'name' attribute specifying the function name.
- The invoke tag must be nested within an 'function_calls' block.
- Parameters for the function should be included as 'parameter' tags within the invoke tag, each with a 'name' attribute.
- Include all required parameters for each function call, while optional parameters should only be included when necessary.
- String and scalar parameters should be specified directly as values, while lists and objects should use proper JSON format.
- Do not refer to function/tool names when speaking directly to users - focus on what I'm doing rather than the tool I'm using.
- When invoking a function, ensure all necessary context is provided for the function to execute properly.
- Each 'invoke' tag should represent a single, complete function call with all its relevant parameters.
- DO not generate any <function_calls> tag in your thinking/resoning process, because those will be interpreted as a function call and executed. just formulate the correct parameters for the function call.

The instructions regarding 'call_id="$CALL_ID">
- It is a unique identifier for the function call.
- It is a number that is incremented by 1 for each new function call, starting from 1.

You can invoke one or more functions by writing a "<function_calls>" block like the following as part of your reply to the user, MAKE SURE TO INVOKE ONLY ONE FUNCTION AT A TIME, meaning only one '<function_calls>' tag in your output :

<Example>
```xml
<function_calls>
<invoke name="$FUNCTION_NAME" call_id="$CALL_ID">
<parameter name="$PARAMETER_NAME_1">$PARAMETER_VALUE</parameter>
<parameter name="$PARAMETER_NAME_2">$PARAMETER_VALUE</parameter>
...
</invoke>
</function_calls>
</Example>

String and scalar parameters should be specified as is, while lists and objects should use JSON format. Note that spaces for string values are not stripped. The output is not expected to be valid XML and is parsed with regular expressions.

When a user makes a request:
1. ALWAYS analyze what function calls would be appropriate for the task
2. ALWAYS format your function call usage EXACTLY as specified in the schema
3. NEVER skip required parameters in function calls
4. NEVER invent functions that arent available to you
5. ALWAYS wait for function call execution results before continuing
6. After invoking a function, wait for the output in <function_results> tag and then continue with your response
7. NEVER invoke multiple functions in a single response
8. NEVER mock or form <function_results> on your own, it will be provided to you after the execution


Answer the user's request using the relevant tool(s), if they are available. Check that all the required parameters for each tool call are provided or can reasonably be inferred from context. IF there are no relevant tools or there are missing values for required parameters, ask the user to supply these values; otherwise proceed with the tool calls. If the user provides a specific value for a parameter (for example provided in quotes), make sure to use that value EXACTLY. DO NOT make up values for or ask about optional parameters. Carefully analyze descriptive terms in the request as they may indicate required parameter values that should be included even if not explicitly quoted.

<Output Format>
<Start HERE>
## Thoughts
  - User Query Elaboration:
  - Thoughts:
  - Observations:
  - Solutions:
  - Function to be used:
  - call_id: $CALL_ID + 1 = $CALL_ID


```xml
<function_calls>
<invoke name="$FUNCTION_NAME" call_id="$CALL_ID">
<parameter name="$PARAMETER_NAME_1">$PARAMETER_VALUE</parameter>
<parameter name="$PARAMETER_NAME_2">$PARAMETER_VALUE</parameter>
...
</invoke>
</function_calls>
```
<End HERE>
</Output Format>

Do not use <Start HERE> and <End HERE> in your output, that is just output format reference to where to start and end your output.

How you work with tools:
  1. PRINT the function xml commands to be executed as part of the output/response
  2. There is a Capturing tool which needs printed text to run that tool manually, SO make sure you print the function xml commands with correct function name, parameters and call_id.
  3. Upon Capturing the fucntion xml commands, it will be executed with the call_id provided.
  4. The result of the function execution will be provided in <function_results> tag.
  5. DO NOT GENERATE python tool code like 'print(notion.notion_retrieve_block_children(...))' command generation, now that WON'T work, that will result in error like 'NameError: name 'notion' is not defined'. You can still use python tool code for tools which are part of other tool sets, apart from tools given to you below.
  6. ONLY BELOW SCHEMA WILL WORK FOR TOOL/FUNTION CALLING.

Example of a properly formatted tool call for Gemini:

```xml
<function_calls>
<invoke name="tool_name" call_id="1">
<parameter name="param1">value1</parameter>
<parameter name="param2">value2</parameter>
</invoke>
</function_calls>
```
If you are making a final response to the user, or if you do not need to use a tool, simply respond in plain text.

## AVAILABLE TOOLS
{dynamic_tool_list_placeholder}
<\SYSTEM>

User Interaction Starts here:
"""

SERVER_CONFIGURATIONS = []
DISCOVERED_TOOLS = []
PROCESSED_CALL_IDS = set()
FORMATTED_TOOL_LIST_MD = "" # Global variable to store the formatted tool list

# print_debug is now defined much earlier in the script.

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

async def _discover_tools_for_server_async(server_config, current_fastmcp_module):
    # This function will encapsulate the logic for discovering tools from a single server.
    # It should return a list of tool definitions from this server.
    server_id = server_config.get('id')
    server_type = server_config.get('type')
    tools_from_this_server = []
    client = None # Ensure client is defined

    print_debug(f"Async Discover: Processing server '{server_id}' (Type: {server_type})")

    client_target = None
    if server_type == "streamable-http" or server_type == "sse":
        client_target = server_config.get('url')
    elif server_type == "stdio":
        client_target = server_config.get('command')

    if not client_target:
        print_debug(f"Async Discover: No valid client target for server '{server_id}' (type: {server_type}). Skipping.")
        return tools_from_this_server

    try:
        # server_id for Client constructor is not yet defined in fastmcp.Client API
        # Pass only target for now. Context might be passed via methods if needed by the library.
        async with current_fastmcp_module.Client(client_target) as client:
            print_debug(f"Async Discover: [{server_id}] Calling 'tools/list'...")
            raw_tools_data = await client.list_tools()

            for tool in raw_tools_data:
                tool_def = {}
                tool_def['name'] = tool.name
                tool_def['tool'] = tool
                tool_def['mcp_server_id'] = server_id
                tool_def['mcp_server_url'] = server_config.get("url")
                tool_def['mcp_server_command'] = server_config.get("command")
                tool_def['mcp_server_type'] = server_type
                tools_from_this_server.append(tool_def)
            print_debug(f"Async Discover: Successfully discovered {len(tools_from_this_server)} tools from '{server_id}'.")
    except Exception as e:
        print_debug(f"Async Discover: Error during async tool discovery for server '{server_id}': {e}")
        # tools_from_this_server will be empty or partially filled, and returned.

    return tools_from_this_server

async def _execute_tool_call_async(tool_name, parameters, server_config, current_fastmcp_module, parsed_call_id_for_logging):
    # This function will execute a single tool call.
    # It should return the result from the tool.
    mcp_server_id = server_config.get('id')
    server_type = server_config.get('type')
    tool_result = None

    print_debug(f"Async Execute: Preparing tool '{tool_name}' (Call ID: {parsed_call_id_for_logging}) on server '{mcp_server_id}' (Type: {server_type})")

    client_target = None
    if server_type == "streamable-http" or server_type == "sse":
        client_target = server_config.get('url')
    elif server_type == "stdio":
        client_target = server_config.get('command')

    if not client_target:
        print_debug(f"Async Execute: No valid client target for server '{mcp_server_id}' (type: {server_type}) for tool '{tool_name}'.")
        # Consider raising an exception or returning an error structure
        raise ValueError(f"Cannot determine client target for server {mcp_server_id} to execute {tool_name}")

    try:
        async with current_fastmcp_module.Client(client_target) as client:
            print_debug(f"Async Execute: Executing tool '{tool_name}' (Call ID: {parsed_call_id_for_logging}) async with params: {parameters} via MCP client for server '{mcp_server_id}'.")
            tool_result = await client.call_tool(tool_name, parameters)
            print_debug(f"Async Execute: Tool '{tool_name}' (Call ID: {parsed_call_id_for_logging}) async executed successfully. Raw Result: {str(tool_result)[:200]}...")
    except Exception as e:
        print_debug(f"Async Execute: Error during async execution of tool '{tool_name}' (Call ID: {parsed_call_id_for_logging}) on server '{mcp_server_id}': {e}")
        # Propagate the exception to be handled by the caller in the message loop
        raise

    return tool_result

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
    global DISCOVERED_TOOLS

    if load_server_configurations():
        if SERVER_CONFIGURATIONS: print_debug(f"Loaded {len(SERVER_CONFIGURATIONS)} MCP server configurations.")
        else: print_debug("No valid server configurations found.")
    else: print_debug("Failed to load MCP server configurations.")

    DISCOVERED_TOOLS = []
    print_debug("Starting tool discovery...")

    for server_config in SERVER_CONFIGURATIONS:
        server_id = server_config.get('id') # Get server_id for logging outside try block
        is_enabled = server_config.get('enabled', True) # Default to True if missing

        if not is_enabled:
            print_debug(f"Skipping disabled server: '{server_id}'")
            continue

        print_debug(f"Attempting discovery for server: '{server_id}' (Type: {server_config.get('type')})")

        try:
            discovered_list = run_async_task(
                _discover_tools_for_server_async(server_config, fastmcp)
            )

            # _discover_tools_for_server_async is expected to return a list (empty if errors or no tools)
            if discovered_list: # If the list is not None and not empty
                print_debug(f"Successfully discovered {len(discovered_list)} tools from server '{server_id}'.")
                DISCOVERED_TOOLS.extend(discovered_list)
            else: # Includes None or empty list
                print_debug(f"No tools discovered from server '{server_id}'.")
        except Exception as e:
            # This catches errors from run_async_task or if _discover_tools_for_server_async re-raised an exception
            print_debug(f"Failed to discover tools from server '{server_id}' due to an error: {e}")
            # Loop continues to the next server

    if DISCOVERED_TOOLS:
        print_debug(f"--- Total tools discovered across all servers: {len(DISCOVERED_TOOLS)} ---")
        tool_names_seen = {}
        for tool in DISCOVERED_TOOLS:
            tool_name = tool.get('name'); origin_server = tool.get('mcp_server_id')
            print_debug(f"  - Found tool: '{tool_name}' from server: '{origin_server}'")
            if tool_name in tool_names_seen: print_debug(f"    WARNING: Duplicate tool_name '{tool_name}' also on server '{tool_names_seen[tool_name]}'.")
            tool_names_seen[tool_name] = origin_server
    else:
        print_debug("No tools were discovered from any active server.")

    # Format the discovered tools into a markdown string
    global FORMATTED_TOOL_LIST_MD
    md_parts = []
    if DISCOVERED_TOOLS:
        print_debug(f"Formatting {len(DISCOVERED_TOOLS)} discovered tools for system prompt...")
        for tool_info in DISCOVERED_TOOLS:
            tool_md = []
            tool_md.append(f" - {tool_info.get('name', 'Unnamed Tool')}")
            tool_md.append(f"   **Description**: {tool_info['tool'].description}")
            tool_md.append(f"   **Parameters**:")

            params_schema = tool_info['tool'].inputSchema
            properties = None
            if isinstance(params_schema, dict):
                properties = params_schema.get('properties')

            if properties and isinstance(properties, dict) and len(properties) > 0:
                required_params = params_schema.get('required', [])
                for param_name, param_details in properties.items():
                    if not isinstance(param_details, dict):
                        print_debug(f"Warning: Parameter '{param_name}' for tool '{tool_info.get('name')}' has invalid details format. Skipping.")
                        continue
                    param_desc = param_details.get('description', '')
                    param_type = param_details.get('type', 'any')
                    is_req = 'required' if param_name in required_params else 'optional'
                    tool_md.append(f"     - `{param_name}`: {param_desc} ({param_type}) ({is_req})")
            else:
                tool_md.append(f"     - No parameters defined.")

            md_parts.append("\n".join(tool_md) + "\n") # Add extra newline after each tool block

        FORMATTED_TOOL_LIST_MD = "\n".join(md_parts) # Join all tool blocks
        # Remove last extra newline if string is not empty, to avoid triple newline before </SYSTEM>
        if FORMATTED_TOOL_LIST_MD.endswith("\n\n"):
             FORMATTED_TOOL_LIST_MD = FORMATTED_TOOL_LIST_MD[:-1]
        print_debug(f"Formatted tool list MD:\n{FORMATTED_TOOL_LIST_MD}")

    else:
        FORMATTED_TOOL_LIST_MD = "No tools available." # Placeholder if no tools are discovered
        print_debug("No tools discovered, FORMATTED_TOOL_LIST_MD set to 'No tools available.'.")


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

                # Case 1: parse_tool_call_xml itself returned an error structure (e.g., XML syntax error)
                # This is usually a single-item list with an "error" key.
                if parsed_tool_calls and isinstance(parsed_tool_calls, list) and "error" in parsed_tool_calls[0]:
                    error_data = parsed_tool_calls[0]
                    print_debug(f"XML parsing directly returned an error: {error_data.get('error')}")
                    if tab_id:
                        send_message({
                            "tabId": tab_id,
                            "payload": {
                                "status": "error_parsing_xml", # More specific status
                                "message": f"Python host: {error_data.get('error', 'Unknown XML parsing error.')}",
                                "call_id": error_data.get("call_id", call_id_from_cs_attr), # Use original call_id if available
                                "raw_xml_snippet": error_data.get("raw_xml", raw_xml_from_cs)[:200]
                            }
                        })
                    continue # Skip further processing for this message

                # Case 2: XML was valid, but no <invoke> elements were found.
                # parse_tool_call_xml returns an empty list in this scenario (unless it's an error like root tag mismatch, handled above).
                if not parsed_tool_calls: # This now specifically means no invokable tools found in otherwise valid XML structure
                    print_debug(f"Valid XML received, but no <invoke> elements found or no tools parsed from: {raw_xml_from_cs[:100]}... Silently ignoring as per new logic.")
                    # DO NOT send a message back to the extension. Silently ignore.
                    continue

                # Case 3: Valid tool calls were parsed.
                # Iterate through potentially multiple tool calls within one <function_calls> block.
                for tool_call_data in parsed_tool_calls:
                    # It's possible that parse_tool_call_xml could be extended to return per-tool errors
                    # even within a list of otherwise valid calls. This handles that defensively.
                    if "error" in tool_call_data: # Should ideally be caught by Case 1 if it's a global XML error.
                        print_debug(f"Individual tool call data contained an error: {tool_call_data['error']}")
                        if tab_id:
                            send_message({
                                "tabId": tab_id,
                                "payload": {
                                    "status": "error_processing_tool_data", # Specific error for this tool
                                    "message": f"Python host: {tool_call_data.get('error', 'Error in specific tool data.')}",
                                    "call_id": tool_call_data.get("call_id"),
                                    "tool_name": tool_call_data.get("tool_name", "Unknown tool"),
                                    "raw_xml_snippet": tool_call_data.get("raw_xml_invoke", "")[:200]
                                }
                            })
                        continue # Move to the next tool call in the list

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
                    # 1. Find Tool and Server Configuration
                    discovered_tool_config = None
                    for dt in DISCOVERED_TOOLS:
                        if dt.get("name") == tool_name:
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

                    # 2. & 3. Instantiate MCP Client and Execute Tool Call are now handled by _execute_tool_call_async
                    tool_result = None
                    execution_error = None

                    try:
                        print_debug(f"Main Loop: Calling run_async_task for tool '{tool_name}' (Call ID: {parsed_call_id}) on server '{mcp_server_id}'.")
                        # Pass `parsed_call_id` for logging purposes within the async helper
                        tool_result = run_async_task(
                            _execute_tool_call_async(tool_name, parameters, server_config, fastmcp, parsed_call_id)
                        )
                        # If _execute_tool_call_async completes without raising an exception, tool_result is set.
                        # If it raises, execution_error will be set in the except block below.
                        print_debug(f"Main Loop: Tool '{tool_name}' (Call ID: {parsed_call_id}) async task completed. Raw Result: {str(tool_result)[:200]}...")

                    except Exception as e_async_call:
                        # This catches errors from run_async_task or if _execute_tool_call_async raised an exception.
                        print_debug(f"Main Loop: Error calling async execution helper for tool '{tool_name}' (Call ID: {parsed_call_id}): {e_async_call}")
                        execution_error = e_async_call # Store the exception

                    # Process result or error
                    if execution_error:
                        # Handle error (e.g., send error message to extension)
                        if tab_id:
                            send_message({
                                "tabId": tab_id,
                                "payload": {
                                    "status": "error_executing_tool",
                                    "tool_name": tool_name,
                                    "call_id": parsed_call_id,
                                    "message": f"Python host: Error during execution of tool '{tool_name}': {str(execution_error)}",
                                    "text_response": f"<tool_result><call_id>{parsed_call_id}</call_id><tool_name>{tool_name}</tool_name><result>ERROR: During execution of tool '{tool_name}': {str(execution_error)}</result></tool_result>"
                                }
                            })
                        continue # Continue to next tool call in the parsed_tool_calls list
                    else:
                        # Process successful tool_result
                        actual_result_content = tool_result[0].text

                        actual_result_content = actual_result_content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                        formatted_xml_result = f"""<tool_result>
  <call_id>{parsed_call_id}</call_id>
  <tool_name>{tool_name}</tool_name>
  <result>{actual_result_content}</result>
</tool_result>"""
                        print_debug(f"Formatted XML result for '{tool_name}' (ID: {parsed_call_id}): {formatted_xml_result}")

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
                    # --- END TOOL EXECUTION LOGIC (Refactored) ---

            elif message_type == "PING": # Example of handling other message types
                print_debug("Received PING from extension.")
                if tab_id:
                    send_message({"tabId": tab_id, "payload": {"type": "PONG", "message": "Python host says PONG!"}})

            elif message_type == "REQUEST_PROMPT":
                print_debug(f"Received REQUEST_PROMPT message. Tab ID: {tab_id}")
                # Ensure tab_id is present, though background.js should always send it
                if tab_id is None:
                    print_debug("Error: REQUEST_PROMPT received without a tabId. Cannot respond.")
                else:
                    # Access global BASE_SYSTEM_PROMPT and FORMATTED_TOOL_LIST_MD
                    # Ensure FORMATTED_TOOL_LIST_MD is not None, though it's initialized to "" or "No tools available."
                    tool_list_for_prompt = FORMATTED_TOOL_LIST_MD if FORMATTED_TOOL_LIST_MD else ""

                    final_prompt = BASE_SYSTEM_PROMPT.replace("{dynamic_tool_list_placeholder}", tool_list_for_prompt)

                    # Debug log for the final prompt (snippet)
                    snippet_length = 200
                    prompt_snippet_start = final_prompt[:snippet_length]
                    prompt_snippet_end = final_prompt[-snippet_length:] if len(final_prompt) > snippet_length * 2 else ""
                    ellipsis = " ... " if len(final_prompt) > snippet_length * 2 else ""
                    print_debug(f"Final prompt snippet being sent to tabId {tab_id}: {prompt_snippet_start}{ellipsis}{prompt_snippet_end}")

                    response_message = {
                        "tabId": tab_id,
                        "payload": {
                            "type": "PROMPT_RESPONSE",
                            "prompt": final_prompt
                        }
                    }
                    send_message(response_message)
                    print_debug(f"Sent PROMPT_RESPONSE with dynamically generated prompt to tabId: {tab_id}")

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
