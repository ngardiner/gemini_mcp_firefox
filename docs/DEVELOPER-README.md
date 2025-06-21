# Gemini MCP Client - Developer Documentation

This document provides technical details for developers who want to work on the Gemini MCP Client extension.

## Architecture Overview

The extension consists of three main components:

1. **Firefox Extension**: Content script and background script that monitor Gemini's web interface
2. **Native Messaging Host**: Python script that processes tool calls and communicates with MCP servers
3. **MCP Servers**: External servers that provide tools for Gemini to use

### Core Functionality

* The Python script manages MCP server connectivity and orchestrates tool discovery (`tools/list`) for configured MCP servers
* Browser extension monitors chat responses on `gemini.google.com` and identifies potential tool-related `<code>` blocks within new messages
* The Python script parses tool calls to determine if they're valid, extract tool names, parameters, and the `call_id`
* The architecture supports bidirectional communication, allowing the Python script to send responses back to the extension
* An optional API interface allows other applications to interact with the native host script

## Development Setup

### 1. Firefox Extension Development

#### Loading the Extension for Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/gemini-mcp-client.git
   cd gemini-mcp-client
   ```

2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on..."
5. Select the `manifest.json` file from the cloned repository

#### Extension Structure

* `manifest.json`: Extension configuration
* `content_script.js`: Runs on gemini.google.com, monitors for tool calls
* `background.js`: Handles communication with the native messaging host
* `popup.html` and `popup.js`: Extension popup UI

### 2. Python Native Messaging Host Development

#### Using a Python Virtual Environment (Recommended)

1. Create a virtual environment:
   ```bash
   python3 -m venv venv
   ```

2. Activate the virtual environment:
   * **Linux/macOS**:
     ```bash
     source venv/bin/activate
     ```
   * **Windows (cmd.exe)**:
     ```batch
     venv\Scripts\activate.bat
     ```
   * **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```

3. Install dependencies:
   ```bash
   pip install fastmcp
   ```

#### Native Host Script Structure

* `mcp_native_host.py`: Main Python script that processes tool calls
* `mcp_native_host.json`: Manifest file that tells Firefox where to find the script
* `run_native_host.sh` / `run_native_host.bat`: Wrapper scripts to run the Python script with the virtual environment

#### Configuring the Native Messaging Host for Development

1. Edit `mcp_native_host.json` to point to your wrapper script:
   ```json
   {
     "name": "mcp_native_host",
     "description": "Native Messaging Host for Gemini MCP Client to run Python script.",
     "path": "/absolute/path/to/run_native_host.sh", // or .bat on Windows
     "type": "stdio",
     "allowed_extensions": [
       "gemini-mcp-client@example.com"
     ]
   }
   ```

2. Register the native messaging host with Firefox:
   * **Windows**:
     1. Open Registry Editor (`regedit`)
     2. Navigate to `HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\`
     3. Create a new key named `mcp_native_host`
     4. Set the `(Default)` value to the full path of your `mcp_native_host.json` file
   
   * **Linux**:
     ```bash
     mkdir -p ~/.mozilla/native-messaging-hosts/
     cp /path/to/your/mcp_native_host.json ~/.mozilla/native-messaging-hosts/
     ```
   
   * **macOS**:
     ```bash
     mkdir -p ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/
     cp /path/to/your/mcp_native_host.json ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/
     ```

### 3. MCP Server Configuration

Create a file named `mcp_servers_config.json` in the same directory as `mcp_native_host.py`:

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
  ]
}
```

## Testing and Debugging

### Browser Console

1. Open Firefox and navigate to `gemini.google.com`
2. Open the Browser Console with `Ctrl+Shift+J` (Windows/Linux) or `Cmd+Shift+J` (macOS)
3. Look for logs from "Gemini MCP Client content script" and "Background script"

### Python Script Debugging

When the native host is invoked by Firefox, its debug messages may not be easily visible. To debug:

1. Run Firefox from a terminal to see `stderr` output
2. Modify `mcp_native_host.py` to log to a file:
   ```python
   # At the top of mcp_native_host.py
   def print_debug(message):
       with open("/tmp/mcp_host_debug.log", "a") as f:
           f.write(str(message) + '\n')
   ```

### Advanced Debugging

For advanced debugging of the extension itself:

1. Use the Browser Toolbox: `Ctrl+Shift+Alt+I` (or Tools > Browser Tools > Browser Toolbox)
2. Connect to the main process

## API Interface Development

The native host script includes an optional API interface that can be enabled with the `--enable-api` flag:

```bash
# Linux/macOS
./run_native_host.sh --enable-api

# Windows
run_native_host.bat --enable-api
```

The API server runs on port 8765 by default. You can change the port with the `--api-port` flag.

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for more details.

## How it Works (Technical Flow)

1. `content_script.js` observes new chat messages using `MutationObserver`
2. If a new message contains `<code>` elements matching specific selectors, the script extracts their raw `textContent` and any `data-call-id` attribute
3. This `rawXml` and `extractedCallId` are sent to `background.js`
4. `content_script.js` marks the `<code>` DOM element with `data-mcp-processed="true"` to prevent reprocessing
5. `background.js` forwards the `rawXml` and `extractedCallId` to `mcp_native_host.py` over `stdin`
6. `mcp_native_host.py` attempts to parse the `rawXml`
7. If parsing is successful and `<invoke>` elements are found, the Python script extracts the tool name(s), parameters, and `call_id`(s)
8. The Python script checks the `call_id` against its set of `PROCESSED_CALL_IDS` to prevent duplicate processing
9. The Python script executes the tool call using the `fastmcp` library to communicate with MCP servers
10. `background.js` receives any response from the native host and forwards it to `content_script.js`
11. `content_script.js` injects the response text into Gemini's input field and attempts to submit it

## Contributing

[Contribution guidelines here]