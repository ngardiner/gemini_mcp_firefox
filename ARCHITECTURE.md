# Introduction - Architecture and Approach

This file aims to detail the specific architectural decisions behind this project

## Key Goals

  * Introduce MCP client capability to Gemini Web
  * Achieve resilient, reliable and performant 2-way communication between Gemini and MCP servers

## Inspiration

  * The key inspiration behind this is [MCP-SuperAssistant](https://github.com/srbhptl39/MCP-SuperAssistant), which implements this in Chrome. The two issues I have run into with this extension are that Chrome is really not performant, I ran it on a 32 core 64GB machine and it struggled after about 15 tool calls. I suspect this is both due to Chrome's architecture and the extension trying to do everything in the browser.


# Architecture

Having experienced this, I propose a solution using Firefox (lower overhead) with a combination of Browser Extension (DOM access for extraction / injection of Tool Calls and Results) and a Python script

   * Browser Extension - As lightweight as possible. We should resist the temptation to perform processing here, for a number of reasons:
      * Updating the Browser Extension is complicated when compared to iterating on the Python script
      * Implementing processing logic in JavaScript is not (imho) easier than in Python
   * The Browser Extension should be responsible for:
      * [x] Monitoring the DOM for new Gemini responses. (Phase 1)
      * [x] Identifying potential tool-related `<code>` blocks using CSS selectors. (Phase 1)
      * [x] Extracting raw `textContent` from these blocks and any associated `data-call-id` attributes. (Phase 1)
      * [x] Sending this raw data to the Python native host. (Phase 1)
      * [x] Marking processed `<code>` elements in the DOM to prevent re-sending by the content script. (Phase 1)
      * [x] Receiving responses (tool results or errors) via Native Messaging from the Python script and injecting them back into Gemini. (Phase 2 logic largely in place)
      * [x] Injection of prompts which advise Gemini of available tools and how to invoke them (Phase 3 - `REQUEST_PROMPT` mechanism implemented, dynamic tool list generation in Python is done, UI button triggers this).
   * The browser extension should:
      * [x] Appear as an icon (any design is fine for Phase 1) in Firefox and provide a UI.
      * [x] The UI should have a slider/switch to turn the functionality on or off.
      * [x] The UI should have a button for prompt injection which triggers a `REQUEST_PROMPT` to the Python script.
   * Python Script - Interfaces with Browser Extension over Native Messaging.
      * [x] Communicates liberally with the user via `stderr` logging (Phase 1).
      * [x] Parses raw XML text received from the extension to identify actual tool calls (`<invoke>`), extract tool names, parameters, and `call_id`s. This is the primary parsing/validation point. (Phase 1)
      * [x] Maintains a set of processed `call_id`s (extracted from XML by Python) to prevent duplicate execution. (Phase 1)
      * [x] Loads MCP server configurations from `mcp_servers_config.json`. (Phase 1)
      * [x] Orchestrates tool discovery (`tools/list`) from configured MCP servers. (Phase 2 logic in place)
      * [x] Collates a central tools list and formats it for Gemini. (Phase 2 logic in place)
      * [x] Orchestrates tool execution by selecting the appropriate MCP server based on discovered tools. (Phase 2 logic in place)
      * [x] Encapsulates the result from tool execution (or errors) in the Gemini XML format and sends it back to the Browser Extension. (Phase 2 logic in place)
      * [x] **`fastmcp` Library Integration:** All MCP server communication (for discovery and execution) is designed to be handled by the `fastmcp` library. Currently, an internal, enhanced mock of `fastmcp` is used, allowing development and testing of the orchestration logic without live MCP servers. (Phase 2 scaffolding/mocking complete)
    
# Plan

   * The initial concern about "too much processing going on in the Browser Extension" has been addressed. The content script now primarily extracts raw `textContent` from candidate `<code>` blocks, and the Python script handles the detailed parsing and validation of this text as XML tool calls. This simplifies the JavaScript significantly.
   * Phase 1 items are largely complete.
   * Phase 2 items (tool discovery, execution orchestration, result encapsulation) have their core logic implemented in `mcp_native_host.py`, utilizing the mock `fastmcp` library. The next step for Phase 2 is to integrate the actual `fastmcp` library.
   * Phase 3 (prompt injection) has its messaging mechanism in place (`REQUEST_PROMPT`), and the Python script can generate the dynamic tool list. The UI button for this is also implemented.

# Current Issues

   * The "persistent parsing issues with the extension's JavaScript" have been mitigated by shifting the primary responsibility of parsing tool call XML from JavaScript to the Python native host. The content script now focuses on identifying candidate code blocks and extracting their raw text, rather than interpreting the XML structure itself.
   * The main pending item is the integration of a real `fastmcp` library to replace the current mock, enabling communication with actual MCP tool servers.
