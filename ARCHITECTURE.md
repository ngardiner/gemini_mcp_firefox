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
      * [x] Monitoring the DOM and capturing incoming tool requests from Gemini (Phase 1)
      * [ ] Tracking of call_ids for incoming tool requests to ensure we do not re-execute tasks when we refresh the browser
      * [ ] Recieving responses via Native Messaging from the Python script and sending those back to Gemini automatically (Phase 2)
      * [ ] Injection of prompts which advise Gemini of available tools and how to invoke them (Phase 3)
   * The browser extension should:
      * [x] Appear as an icon (any design is fine for Phase 1) in Firefox and provide a UI
      * [x] The UI should have a slider/switch to turn the functionality on or off
      * [x] The UI should have a button for prompt injection which in Phase 1 should just inject a dummy test message and send it to Gemini
   * Python Script - Interfaces with Browser Extension over Native Messaging.
      * [x] Communicates liberally with the user via the most appropriate mean(s) - Browser debug, log file etc at this stage of development. In future, we'll toggle this debugging down/off but for now I'd like positive feedback from the script that it is operating (Phase 1)
      * [x] Acts as an MCP Client to the MCP Servers defined in industry-standard JSON configuration (supporting SSE, http streaming and stdio) (Phase 1)
      * [ ] Does discovery (through tools/list) across all MCP Servers and collates a central tools list to provide to Gemini (Phase 2)
      * [x] Does all processing related to the tool calls recieved from Gemini (Phase 1). Note that the processing is based on Gemini's standard tool calling protocol.
      * [ ] Executes the tool calls on the appropriate MCP Server (Phase 2)
      * [ ] Encapsulates the result in the correct Gemini format and sends it back to the Browser Extension (Phase 2)
    
# Plan

   * We currently have a bit too much processing going on in the Browser Extension. Ideally, processing outside of the definition under Architecture should be moved to the Python script, and only raw data should be exchanged within the extension. This should allieviate the current parsing errors by simplifying the javascript significantly
   * Currently, we should implement the items marked as Phase 1 in this architecture plan in full, and should set up scaffolding as described for Phase 2 and 3 items.
   * Once these items are completed to satisfaction, they will be marked with ticks

# Current Issues

   * We have persistent parsing issues with the extension's JavaScript. I put this down to too much processing logic in the extension which could be greatly simplified. After the Phase 1 activities, I expect this will not be a problem going forward
