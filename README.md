# Gemini MCP Client (Firefox Extension)

This is a lightweight Firefox extension that monitors `gemini.google.com` for chat responses from Gemini. It aims to detect and intercept tool calls made by Gemini.

## Current Functionality

*   Injects a content script into `gemini.google.com`.
*   Uses a `MutationObserver` to watch for new messages in the chat.
*   When a potential tool call (containing `<tool_code>`) is detected in a new message, it prints a debug message to the Browser Console.

## How to Install and Test (Temporary Add-on)

1.  **Download or Clone:** Make sure you have the extension files (`manifest.json`, `content_script.js`, and this `README.md`) in a local directory.
2.  **Open Firefox.**
3.  **Navigate to Add-ons:**
    *   Type `about:debugging` in the address bar and press Enter.
    *   Alternatively, click the menu button (☰) -> Add-ons and themes -> Extensions.
4.  **Load Temporary Add-on:**
    *   In the `about:debugging` page, click on "This Firefox" (or "This Nightly", "This Developer Edition" depending on your Firefox version) on the left sidebar.
    *   Click the "Load Temporary Add-on…" button.
5.  **Select the Manifest File:**
    *   Browse to the directory where you saved the extension files.
    *   Select the `manifest.json` file and click "Open".
6.  **Test the Extension:**
    *   Navigate to `https://gemini.google.com`.
    *   Open the Browser Console (you can usually do this by pressing `Ctrl+Shift+J` on Windows/Linux or `Cmd+Shift+J` on macOS).
    *   Interact with Gemini. If Gemini produces a response that includes XML for a tool call (e.g., something containing `<tool_code>...</tool_code>`), you should see a debug message from the "[Gemini MCP Client]" in the console.

## Future Development

*   More precise parsing of tool call XML.
*   Sending intercepted calls to defined MCP servers.
*   Returning MCP server responses to Gemini.

```
