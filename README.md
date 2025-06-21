# Gemini MCP Client (Firefox Extension)

This lightweight Firefox extension brings MCP (Model Context Protocol) capability to the Gemini Web Interface. It detects and intercepts tool calls made by Gemini, processes these calls, and sends responses back to Gemini.

## Features

* Seamlessly integrates with the Gemini web interface
* Allows Gemini to use external tools via MCP
* Supports multiple MCP servers for greater flexibility
* Preserves Gemini's native Workspace capabilities
* Optional API interface for integration with other applications

## Installation

### 1. Install the Firefox Extension

1. Download the latest release from the [Releases page](https://github.com/ngardiner/gemini-mcp-client/releases)
2. Open Firefox and navigate to `about:addons`
3. Click the gear icon and select "Install Add-on From File..."
4. Select the downloaded `.xpi` file

### 2. Set Up the Native Messaging Host

The extension requires a Python-based native messaging host to function properly.

#### Prerequisites

* Python 3.7 or higher
* Firefox browser

#### Installation Steps

1. **Install Python Dependencies**:
   ```bash
   pip install fastmcp
   ```

2. **Configure the Native Messaging Host**:
   
   * **Windows**:
     1. Open Registry Editor (`regedit`)
     2. Navigate to `HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\`
     3. Create a new key named `mcp_native_host`
     4. Set the `(Default)` value to the full path of your `mcp_native_host.json` file
   
   * **Linux**:
     ```bash
     mkdir -p ~/.mozilla/native-messaging-hosts/
     cp mcp_native_host.json ~/.mozilla/native-messaging-hosts/
     ```
   
   * **macOS**:
     ```bash
     mkdir -p ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/
     cp mcp_native_host.json ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/
     ```

3. **Configure MCP Servers**:
   
   Create a file named `mcp_servers_config.json` in the same directory as `mcp_native_host.py` with your MCP server configurations:
   
   ```json
   {
     "mcpServers": [
       {
         "id": "local_python_stdio_server",
         "type": "stdio",
         "enabled": true,
         "command": "python",
         "args": ["/path/to/your/local_mcp_stdio_script.py"]
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

## Usage

1. After installation, navigate to [Gemini](https://gemini.google.com)
2. The extension will automatically detect and process tool calls made by Gemini
3. You can verify the extension is working by checking the extension icon in your browser toolbar

## API Interface (Optional)

The extension includes an optional API interface that allows other applications to interact with the native host script. This feature is disabled by default.

To enable the API:

```bash
# Linux/macOS
./run_native_host.sh --enable-api

# Windows
run_native_host.bat --enable-api
```

For more details, see the [API Documentation](docs/API_DOCUMENTATION.md).

## Troubleshooting

If you encounter issues:

1. Check that the native messaging host is properly configured
2. Verify that the `mcp_servers_config.json` file is correctly formatted
3. Look for error messages in the browser console (Ctrl+Shift+J or Cmd+Shift+J)
4. For more detailed debugging, see the [Developer Documentation](docs/DEVELOPER-README.md)

## Credits

Full credit to MCP-SuperAssistant for the initial inspiration. This project was created to address performance issues with the MCP-SuperAssistant extension on Chrome.

## License

[License information here]
