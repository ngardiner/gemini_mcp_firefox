# Gemini MCP Client (Firefox Extension)

This is a lightweight Firefox extension that monitors `gemini.google.com` for chat responses from Gemini. It aims to detect and intercept tool calls made by Gemini, forwarding them to a local Python script via Native Messaging. The Python script can then process these calls and optionally send responses back to the extension to be injected into Gemini.

## Core Functionality

*   Injects a content script into `gemini.google.com`.
*   Uses a `MutationObserver` to watch for new messages in the chat.
*   When a potential tool call (containing `<tool_code>`) is detected, it's sent to a background script.
*   The background script forwards the tool call to a Python script (`mcp_native_host.py`) using Firefox's Native Messaging API.
*   The Python script receives the tool call, prints it to its console (for debugging/logging).
*   The architecture supports bidirectional communication, allowing the Python script to send a response back to the extension, which can then inject it into the Gemini chat window and auto-submit.

## Setup Instructions

Setting up this extension involves two main parts: loading the Firefox extension and configuring the Python native messaging host.

### 1. Firefox Extension Setup

   1 **Download or Clone:** Ensure you have all extension files (`manifest.json`, `content_script.js`, `background.js`, `mcp_native_host.py`, `mcp_native_host_manifest.json`, and this `README.md`) in a local directory.
   
   2 **Open Firefox.**
   
   3 **Navigate to Add-ons:**
   
      *   Type `about:debugging` in the address bar and press Enter.
      *   Alternatively, click the menu button (☰) -> Add-ons and themes -> Extensions.
      
   4 **Load Temporary Add-on:**
   
      *   In the `about:debugging` page, click on "This Firefox" (or your Firefox version) on the left sidebar.
      *   Click the "Load Temporary Add-on…" button.
      
   5 **Select the Manifest File:**
   
      *   Browse to the directory where you saved the extension files.
      *   Select the main extension `manifest.json` file and click "Open".

### 2. Python Native Messaging Host Setup

This is the more complex part and requires careful setup. The extension needs to communicate with the `mcp_native_host.py` script.

   1 **Install Python:**
   
      *   Ensure you have Python 3 installed. You can download it from [python.org](https://www.python.org/).
      *   Verify it's in your system's PATH.

   2 **Prepare the Python Script (`mcp_native_host.py`):**
   
      *   This script is included in the repository.
      *   **On Linux/macOS:** Make it executable: `chmod +x /path/to/your/mcp_native_host.py`
      *   Ensure it has the correct shebang line at the top: `#!/usr/bin/env python3` (or your Python 3 path).
      *   Place this script in a known location. For example, you can place it in the same directory where you will put the native messaging host manifest file (see next step), or another directory of your choice.

   3 **Configure and Register the Native Messaging Host Manifest (`mcp_native_host_manifest.json`):**
   
      This JSON file tells Firefox where to find your Python script and which extension can talk to it.
      
   * **Edit `mcp_native_host_manifest.json`:**
     The provided `mcp_native_host_manifest.json` has a `"path"` field:
     
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
     You **MUST** update the `"path"` value in `mcp_native_host_manifest.json` to be the **absolute path** to your `mcp_native_host.py` script.
     For example:
      - Windows: `"path": "C:\\Users\\YourName\\path\\to\\mcp_native_host.py"` (use double backslashes) or you might need to invoke python directly like `"path": "C:\\Path\\To\\Python\\python.exe", "C:\\Users\\YourName\\path\\to\\mcp_native_host.py"`. Simpler is often a .bat wrapper.
      - Linux/macOS: `"path": "/home/yourname/path/to/mcp_native_host.py"`

      *   **Place the edited `mcp_native_host_manifest.json` into the correct Firefox directory, naming the file `mcp_native_host.json` (matching the `"name"` field):**
          *   **Windows:**
              1. Open Registry Editor (`regedit`).
              2. Navigate to `HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\`. If `Mozilla` or `NativeMessagingHosts` doesn't exist, create the key(s).
              3. Create a new key named `mcp_native_host`.
              4. Set the `(Default)` value of this `mcp_native_host` key to the **full, absolute path** of your edited `mcp_native_host_manifest.json` file.
                 Example: `C:\Users\YourName\path\to\the\mcp_native_host_manifest.json`
          *   **Linux:**
              Create the directory if it doesn't exist: `mkdir -p ~/.mozilla/native-messaging-hosts/`
              Copy your edited `mcp_native_host_manifest.json` to this directory, **renaming it to `mcp_native_host.json`**:
              `cp /path/to/your/edited/mcp_native_host_manifest.json ~/.mozilla/native-messaging-hosts/mcp_native_host.json`
          *   **macOS:**
              Create the directory if it doesn't exist: `mkdir -p ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/`
              Copy your edited `mcp_native_host_manifest.json` to this directory, **renaming it to `mcp_native_host.json`**:
              `cp /path/to/your/edited/mcp_native_host_manifest.json ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/mcp_native_host.json`

   d. **Verify Extension ID:**
      The `mcp_native_host_manifest.json` allows connections from `"gemini-mcp-client@example.com"`. This ID is defined in the extension's `manifest.json` under `browser_specific_settings.gecko.id`. If you change it there, you must change it in `mcp_native_host_manifest.json` too.

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

1.  `content_script.js` on `gemini.google.com` sees a tool call.
2.  It sends the tool call data to `background.js`.
3.  `background.js` starts `mcp_native_host.py` (via the registered native messaging host manifest).
4.  `background.js` sends the data to `mcp_native_host.py` over `stdin`.
5.  `mcp_native_host.py` prints the received data (for now) and can send a JSON response back via `stdout`.
6.  `background.js` receives the response and forwards it to `content_script.js`.
7.  `content_script.js` injects the response into Gemini's input field and tries to submit it.

## Future Development

*   More precise XML parsing of tool calls in `content_script.js`.
*   Actual implementation of MCP server communication in `mcp_native_host.py`.
*   Robust error handling and user feedback within the extension.
*   Refining DOM selectors for Gemini's chat input and send button for better reliability.
```
