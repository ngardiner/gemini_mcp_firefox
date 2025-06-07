# Gemini MCP Client (Firefox Extension)

This is a lightweight Firefox extension that brings MCP capability to the Gemini Web Interface. It aims to detect and intercept tool calls made by Gemini, process these calls and optionally send responses back to Gemini.

Full credit to SuperAssistant for the initial inspiration. I created this interface after experiencing performance issues with the MCP-SuperAssistant extension on Chrome, which led me to make certain architectural changes to ensure these and other MCP-SuperAgent issues were addressed:
   * This project uses Firefox, which is considerably lighter than Chrome in terms of plugin architecture
   * This project allows multiple MCP Servers to be defined, which provides greater flexibility
   * This project doesn't remove Gemini's ability to call the native Workspace capabilities
   * This project uses a back-end Python script for the processing of calls and responses, minimising the overhead experienced when trying to process these in browser extension space

## Core Functionality

*   The Python script manages MCP server connectivity and orchestrates tool discovery (`tools/list`) for configured MCP servers.
*   Browser extension monitors chat responses on `gemini.google.com`, and identifies potential tool-related `<code>` blocks within new messages.
*   The Python script is responsible for parsing the tool calls to determine if it's a valid tool call, extract tool names, parameters, and the `call_id` from the XML content itself.
*   The architecture supports bidirectional communication, allowing the Python script to send a response back to the extension, which can then inject it into the Gemini chat window and auto-submit.

## Setup Instructions

Setting up this extension involves two main parts: loading the Firefox extension and configuring the Python native messaging host.

### 1. Firefox Extension Setup

   * **Download or Clone:** Ensure you have all extension files (`manifest.json`, `content_script.js`, `background.js`, `mcp_native_host.py`, `mcp_native_host.json`, and this `README.md`) in a local directory.
   * **Open Firefox.**
   * **Navigate to Add-ons:**
      *   Type `about:debugging` in the address bar and press Enter.
      *   Alternatively, click the menu button (☰) -> Add-ons and themes -> Extensions.
   * **Load Temporary Add-on:**
      *   In the `about:debugging` page, click on "This Firefox" (or your Firefox version) on the left sidebar.
      *   Click the "Load Temporary Add-on…" button.
   * **Select the Manifest File:**
      *   Browse to the directory where you saved the extension files.
      *   Select the main extension `manifest.json` file and click "Open".

### 2. Python Native Messaging Host Setup

This is the more complex part and requires careful setup. The extension needs to communicate with the `mcp_native_host.py` script.

   a. **Install Python:**
   
   *   Ensure you have Python 3 installed (Python 3.7+ recommended). You can download it from [python.org](https://www.python.org/).
   *   Verify it's in your system's PATH. This is a prerequisite for creating virtual environments.

   b. **Using a Python Virtual Environment (Recommended):**
   Using a virtual environment (`venv`) is highly recommended to manage dependencies for the Python script without affecting your global Python installation.

   *  **Install Python:** (As mentioned above, Python 3 is required).

   *  **Create a Virtual Environment:**
       *   Navigate to your project directory (where you have `mcp_native_host.py`).
       *   Run the following command:
           ```bash
           python3 -m venv venv
           ```
           (On Windows, you might use `python -m venv venv`)
       *   This creates a new directory named `venv` inside your project folder, containing the Python interpreter and libraries for this isolated environment.

   3.  **Activate the Virtual Environment:**
       *   **Linux/macOS:**
           ```bash
           source venv/bin/activate
           ```
       *   **Windows (cmd.exe):**
           ```batch
           venv\Scripts\activate.bat
           ```
       *   **Windows (PowerShell):**
           ```powershell
           .\venv\Scripts\Activate.ps1
           ```
       *   Your terminal prompt should change (e.g., prefix with `(venv)`) to indicate the virtual environment is active.

   4.  **Install Dependencies (e.g., `fastmcp`):**
       *   With the virtual environment active, install necessary packages using `pip`. The `mcp_native_host.py` script relies on the `fastmcp` library.
          ```bash
          pip install fastmcp
          ```
       *   Packages installed this way are only available within this virtual environment, keeping your global Python clean.

   5.  **Configuring Firefox for the Virtual Environment:**
          For Firefox to correctly run `mcp_native_host.py` using the Python interpreter and packages from your virtual environment, the native messaging manifest file (`mcp_native_host.json`) must point to an executable that uses this venv. The most robust way to achieve this is with a wrapper script.

       *   **Update `mcp_native_host.json`:**
           The `"path"` field in your `mcp_native_host.json` (the one you place in Firefox's native-messaging-hosts directory) must now be the **absolute path** to this new wrapper script.
           For example:
             - Linux/macOS: `"path": "/path/to/your/project/run_native_host.sh"`
             - Windows: `"path": "C:\\path\\to\\your\\project\\run_native_host.bat"` (use double backslashes)

       *   **Why this is important:** This ensures that when Firefox launches your native host, it uses the Python interpreter from your virtual environment, which has access to `fastmcp` and any other packages you installed there.

   6.  **Deactivating the Virtual Environment:**
       *   When you're done working in your terminal session, you can deactivate the venv:
           ```bash
           deactivate
           ```

   c. **Prepare the Python Script (`mcp_native_host.py`):**
      *   This script is included in the repository.
      *   **On Linux/macOS:** Make it executable: `chmod +x /path/to/your/mcp_native_host.py`. This is good practice even if using a wrapper script. You may need to re-run this command if you find the script loses its executable permission after pulling updates from the repository.
      *   Ensure it has the correct shebang line at the top: `#!/usr/bin/env python3`. This is mainly relevant if you were to run the script directly or use Method 1 for venv configuration (not detailed here but mentioned in earlier discussions). With the wrapper script method, the wrapper explicitly calls the venv's Python.
      *   Place this script in a known location (e.g., your project directory).

   d. **Configure and Register the Native Messaging Host Manifest (`mcp_native_host.json`):**
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
          You **MUST** update the `"path"` value in `mcp_native_host.json` to be the **absolute path** to your Python script *or preferably, the wrapper script* (`run_native_host.sh` or `run_native_host.bat`) as described in the "Using a Python Virtual Environment" section.

          If using the recommended wrapper script method:
            - Windows: `"path": "C:\\Users\\YourName\\path\\to\\project\\run_native_host.bat"`
            - Linux/macOS: `"path": "/home/yourname/path/to/project/run_native_host.sh"`

          If you are *not* using a virtual environment or a wrapper script (not recommended for managing dependencies like `fastmcp`):
            - Windows: `"path": "C:\\Users\\YourName\\path\\to\\mcp_native_host.py"` (ensure Python is in PATH or provide absolute path to python.exe and script as argument if supported, though a .bat wrapper is more reliable).
            - Linux/macOS: `"path": "/home/yourname/path/to/mcp_native_host.py"` (ensure script is executable and shebang is correct).

      *   **Place the (potentially edited) `mcp_native_host.json` from your repository into the correct Firefox directory. The file *in that browser directory* must be named `mcp_native_host.json` (matching the `"name"` field within the JSON content). Ensure the `path` field inside this JSON file correctly points to your executable script or wrapper.**
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
Upon starting, `mcp_native_host.py` reads server definitions from `mcp_servers_config.json`. Using the `fastmcp` library, it then attempts to connect to each **enabled** server based on its configured type (`stdio`, `streamable-http`, `sse`).
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
2.  If a new message contains `<code>` elements matching specific selectors (e.g., `.code-container.formatted`), the script extracts their raw `textContent` and any `data-call-id` attribute.
3.  This `rawXml` (the `textContent`) and `extractedCallId` (from `data-call-id`) are sent to `background.js` without further validation in the content script.
4.  Before sending, `content_script.js` marks the `<code>` DOM element with `data-mcp-processed="true"` to prevent reprocessing by the content script itself.
5.  `background.js` forwards the `rawXml` and `extractedCallId` to `mcp_native_host.py` over `stdin`.
6.  `mcp_native_host.py` attempts to parse the `rawXml`.
7.  If parsing is successful and `<invoke>` elements are found, the Python script extracts the tool name(s), parameters, and `call_id`(s) from the XML content.
8.  The Python script checks the `call_id` (obtained from the XML) against its set of `PROCESSED_CALL_IDS`. If seen, the request is ignored (logged as duplicate). Otherwise, the `call_id` is added.
9.  The Python script then proceeds to execute the tool call, currently using a mock `fastmcp` library to simulate communication with MCP servers. It will send responses (success or error) back.
10. `background.js` receives any response from the native host and forwards it to `content_script.js`.
11. `content_script.js` injects the response text into Gemini's input field and attempts to submit it.

```
