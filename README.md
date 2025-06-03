# Gemini MCP Client (Firefox Extension)

This is a lightweight Firefox extension that monitors `gemini.google.com` for chat responses from Gemini. It aims to detect and intercept tool calls made by Gemini, forwarding them to a local Python script via Native Messaging. The Python script can then process these calls and optionally send responses back to the extension to be injected into Gemini.

## Core Functionality

*   Injects a content script into `gemini.google.com`.
*   Uses a `MutationObserver` to watch for new messages in the chat.
*   Uses `DOMParser` to robustly parse XML-like tool call structures, looking for `<function_calls>` and `<invoke name='...' call_id='...'>` patterns in new chat messages.
*   Extracts `call_id` from `<invoke>` tags, which is used for deduplication in the Python host and for marking processed elements in the DOM.
*   Supports detection of multiple, parallel tool calls if Gemini outputs several `<invoke>` operations within a single `<function_calls>` block. Each is processed individually.
*   For tool parameters that contain nested XML structures, the raw inner HTML of the `<parameter>` tag is captured as a string.
*   When a potential tool call is detected, its structured data (tool name, parameters, `call_id`) is sent to a background script.
*   The background script forwards the tool call data to the Python native host script (`mcp_native_host.py`).
*   **`call_id` Tracking (Deduplication):** The Python script maintains a set of processed `call_id`s for the current session. If a `call_id` is received that has already been processed, the script skips it to prevent duplicate actions.
*   **Visual DOM Markers:** After a tool call is sent from the content script, the corresponding `<invoke>` DOM element in the Gemini interface is marked with a `data-mcp-processed="true"` attribute. This helps prevent reprocessing by the content script and can be used for custom styling.
*   The Python script receives the tool call, logs it, and (currently) sends back an example response. (Full proxying to MCP servers based on `call_id` and discovered tools is the next step).
*   The architecture supports bidirectional communication, allowing the Python script to send a response back to the extension, which can then inject it into the Gemini chat window and auto-submit.

## Setup Instructions

Setting up this extension involves two main parts: loading the Firefox extension and configuring the Python native messaging host.

### 1. Firefox Extension Setup

   a. **Download or Clone:** Ensure you have all extension files (`manifest.json`, `content_script.js`, `background.js`, `mcp_native_host.py`, `mcp_native_host.json`, and this `README.md`) in a local directory.
   b. **Open Firefox.**
   c. **Navigate to Add-ons:**
      *   Type `about:debugging` in the address bar and press Enter.
      *   Alternatively, click the menu button (☰) -> Add-ons and themes -> Extensions.
   d. **Load Temporary Add-on:**
      *   In the `about:debugging` page, click on "This Firefox" (or your Firefox version) on the left sidebar.
      *   Click the "Load Temporary Add-on…" button.
   e. **Select the Manifest File:**
      *   Browse to the directory where you saved the extension files.
      *   Select the main extension `manifest.json` file and click "Open".

### 2. Python Native Messaging Host Setup

This is the more complex part and requires careful setup. The extension needs to communicate with the `mcp_native_host.py` script.

   a. **Install Python:**
      *   Ensure you have Python 3 installed. You can download it from [python.org](https://www.python.org/).
      *   Verify it's in your system's PATH.

   b. **Dependencies:**
      The `mcp_native_host.py` script now relies on the `fastmcp` library (hypothetical, for this project) to communicate with MCP servers. If this were a real library, you would install it, for example:
      ```bash
      pip install fastmcp
      ```
      Since `fastmcp` is hypothetical for this project, the script includes an internal mock for basic structural execution if the library is not found. This allows the script to run for development and testing of other features, but it will not perform real tool discovery without the actual library.

   c. **Prepare the Python Script (`mcp_native_host.py`):**
      *   This script is included in the repository.
      *   **On Linux/macOS:** Make it executable: `chmod +x /path/to/your/mcp_native_host.py`
      *   Ensure it has the correct shebang line at the top: `#!/usr/bin/env python3` (or your Python 3 path).
      *   Place this script in a known location. For example, you can place it in the same directory where you will put the native messaging host manifest file (see next step), or another directory of your choice.

   c. **Configure and Register the Native Messaging Host Manifest (`mcp_native_host.json`):**
      This JSON file tells Firefox where to find your Python script and which extension can talk to it. The manifest file is named `mcp_native_host.json` in the repository.
      *   **Edit `mcp_native_host.json`:**
          The provided `mcp_native_host.json` has a `"path"` field:
          ```json
          {
            "name": "mcp_native_host",
            "description": "Native Messaging Host for Gemini MCP Client to run Python script.",
            "path": "mcp_native_host.py", // <-- THIS PATH MIGHT NEED TO BE ABSOLUTE
            "type": "stdio",
            "allowed_extensions": [
              "gemini-mcp-client@example.com"
            ]
          }
          ```
          You **MUST** update the `"path"` value in `mcp_native_host.json` to be the **absolute path** to your `mcp_native_host.py` script.
          For example:
            - Windows: `"path": "C:\\Users\\YourName\\path\\to\\mcp_native_host.py"` (use double backslashes) or you might need to invoke python directly like `"path": "C:\\Path\\To\\Python\\python.exe", "C:\\Users\\YourName\\path\\to\\mcp_native_host.py"`. Simpler is often a .bat wrapper.
            - Linux/macOS: `"path": "/home/yourname/path/to/mcp_native_host.py"`

      *   **Place the (potentially edited) `mcp_native_host.json` from your repository into the correct Firefox directory. The file *in that browser directory* must be named `mcp_native_host.json` (matching the `"name"` field within the JSON content). Ensure the `path` field inside this JSON file correctly points to your `mcp_native_host.py` script.**
          *   **Windows:**
              1. Open Registry Editor (`regedit`).
              2. Navigate to `HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\`. If `Mozilla` or `NativeMessagingHosts` doesn't exist, create the key(s).
              3. Create a new key named `mcp_native_host`.
              4. Set the `(Default)` value of this `mcp_native_host` key to the **full, absolute path** of the `mcp_native_host.json` file you have prepared (e.g., the one you copied from the repository and potentially edited).
                 Example: `C:\Users\YourName\path\to\your\mcp_native_host.json`
          *   **Linux:**
              Create the directory if it doesn't exist: `mkdir -p ~/.mozilla/native-messaging-hosts/`
              Copy the `mcp_native_host.json` from your repository (after ensuring its internal `path` field is correct) to this directory. The destination file must be named `mcp_native_host.json`.
              `cp /path/to/your/repository/mcp_native_host.json ~/.mozilla/native-messaging-hosts/`
          *   **macOS:**
              Create the directory if it doesn't exist: `mkdir -p ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/`
              Copy the `mcp_native_host.json` from your repository (after ensuring its internal `path` field is correct) to this directory. The destination file must be named `mcp_native_host.json`.
              `cp /path/to/your/repository/mcp_native_host.json ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/`

   d. **Verify Extension ID:**
      The `mcp_native_host.json` allows connections from `"gemini-mcp-client@example.com"`. This ID is defined in the extension's `manifest.json` under `browser_specific_settings.gecko.id`. If you change it there, you must change it in `mcp_native_host.json` too.

### MCP Server Configuration (`mcp_servers_config.json`)

The `mcp_native_host.py` script determines which MCP servers to contact by reading a configuration file named `mcp_servers_config.json`. This file must be placed in the **same directory** as the `mcp_native_host.py` script.

**Purpose:** This file is used to define the MCP servers that the Python script will attempt to connect to for dynamic tool discovery. **You no longer define tools directly in this file.** Instead, the script queries each configured server to learn about the tools it offers.

**Format:**
The `mcp_servers_config.json` file should contain a JSON object with a top-level key `"mcpServers"`, which is an array of server definition objects. Each server object has fields like `id`, `type` ("stdio", "streamable-http", "sse"), `enabled`, and type-specific connection details (e.g., `command` and `args` for stdio, `url` and `headers` for HTTP/SSE).

```json
{
  "mcpServers": [
    {
      "id": "local_python_stdio_server",
      "type": "stdio",
      "enabled": true,
      "command": "python",
      "args": ["/path/to/your/local_mcp_stdio_script.py"],
      "notes": "Update path in 'args'."
    },
    {
      "id": "remote_tool_api_http",
      "type": "streamable-http",
      "enabled": true,
      "url": "https://api.exampletools.com/mcp_endpoint",
      "headers": { "X-Custom-Auth-Token": "YOUR_API_TOKEN" }
    }
    // ... more server definitions
  ]
}
```
An example file, `mcp_servers_config.json`, is included in the repository with various sample server definitions.

**Dynamic Tool Discovery at Startup:**
Upon starting, `mcp_native_host.py` reads server definitions from `mcp_servers_config.json`. Using the (hypothetical) `fastmcp` library, it then attempts to connect to each **enabled** server based on its configured type (`stdio`, `streamable-http`, `sse`).
- The script will log details for each server configuration it loads or any errors encountered during parsing.
- For each server, it calls the standard MCP method `tools/list` to discover the tools it offers. The `fastmcp` library handles the underlying transport protocols for these calls based on the server type.
  - For `streamable-http` and `sse` types, this involves an HTTP GET request to `[server_url]/tools/list`.
  - For `stdio` type, this involves starting the configured command and communicating over stdin/stdout to make the `tools/list` request.
- The JSON response from the `tools/list` call is expected to be a list of tool definitions (each including `tool_name`, `description`, and `parameters_schema`).
- These discovered tools are then aggregated. The script will log (to stderr) the total number of tools found and list each tool along with the ID of the server it was discovered from (e.g., `DEBUG:   - Found tool: 'get_weather' from server: 'remote_tool_api_http'`).
- Check the script's startup logs (stderr) for details on which servers were processed, what tools (if any) were discovered, or if errors occurred during discovery (e.g., connection errors, errors from `fastmcp`).

This dynamic discovery allows for a more flexible system where tools are managed by their respective MCP servers, and the `fastmcp` library abstracts the communication details.

### 3. Testing and Debugging

1.  **Load the Extension:** Follow step 1.
2.  **Open Gemini:** Navigate to `https://gemini.google.com`.
3.  **Open Browser Console:** In Firefox, press `Ctrl+Shift+J` (Windows/Linux) or `Cmd+Shift+J` (macOS). Look for logs from "Gemini MCP Client content script" and "Background script".
4.  **Trigger a Tool Call:** Interact with Gemini in a way that you expect might generate a tool call.
5.  **Check Python Script Output:**
    *   When the native host is invoked by Firefox, its `print_debug()` messages (sent to `stderr`) might not be easily visible.
    *   To debug the Python script:
        *   Try running Firefox from a terminal. Sometimes `stderr` from native hosts is printed there.
        *   Temporarily modify `mcp_native_host.py` to log to a file for easier debugging:
          ```python
          # At the top of mcp_native_host.py
          # import sys
          # def print_debug(message):
          #     with open("/tmp/mcp_host_debug.log", "a") as f: # Choose a writable path
          #         f.write(str(message) + '\n')
          ```
6.  **Browser Toolbox:** For advanced debugging of the extension itself (background script, popups, etc.), use the Browser Toolbox: `Ctrl+Shift+Alt+I` (or Tools > Browser Tools > Browser Toolbox). Connect to the main process.

## How it Works (Briefly)

1.  `content_script.js` on `gemini.google.com` observes new chat messages using `MutationObserver`.
2.  If a new message appears to contain a tool call (i.e., includes `<function_calls>` or `<invoke>` elements), the script uses `DOMParser` to parse the XML structure.
3.  It extracts the tool name, parameters, and the `call_id` attribute from each `<invoke>` element. If parameters have nested XML, their `innerHTML` is taken. It can process multiple `<invoke>` calls from one `<function_calls>` block.
4.  Before sending, it checks if the specific `<invoke>` DOM element (if identifiable) has already been marked with `data-mcp-processed="true"`. If so, it skips it.
5.  The structured tool data (including `call_id`) is sent to `background.js`.
6.  Upon successful sending, `content_script.js` marks the `<invoke>` DOM element with `data-mcp-processed="true"` and `data-mcp-call-id="[call_id_value]"`.
7.  `background.js` forwards the data to `mcp_native_host.py` over `stdin`.
8.  `mcp_native_host.py` checks the `call_id` against its set of `PROCESSED_CALL_IDS`. If the `call_id` has been seen before, the request is ignored (logged as duplicate). Otherwise, the `call_id` is added to the set.
9.  The Python script (currently) prints the received data and can send an example JSON response back via `stdout`. (Future: it will proxy to the correct MCP server).
10. `background.js` receives any response from the native host and forwards it to `content_script.js`.
11. `content_script.js` injects the response text into Gemini's input field and attempts to submit it.

## Future Development

*   The tool call parsing in `content_script.js` was upgraded from regular expressions to the browser's standard `DOMParser` for improved accuracy and robustness against variations in XML structure. This allows for more reliable extraction of tool names and parameters, including support for parallel tool invocations and capturing nested XML within parameters.
*   Actual implementation of MCP server communication in `mcp_native_host.py`.
*   Robust error handling and user feedback within the extension.
*   Refining DOM selectors for Gemini's chat input and send button for better reliability.
```
