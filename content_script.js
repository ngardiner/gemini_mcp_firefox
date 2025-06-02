console.log("Gemini MCP Client content script loaded. Version 2.0");

// Function to send tool call to background script
function sendToolCallToBackground(toolCallData) {
  console.log("Sending tool call to background script:", toolCallData);
  browser.runtime.sendMessage({
    type: "TOOL_CALL_DETECTED",
    payload: toolCallData
  }).then(response => {
    // console.log("Response from background script:", response); // Optional: handle ack from background
  }).catch(error => {
    console.error("Error sending message to background script:", error);
  });
}

// Function to handle responses from the background script (coming from native host)
function handleNativeHostResponse(message) {
  if (message.type === "FROM_NATIVE_HOST" && message.payload) {
    console.log("Received response from native host via background:", message.payload);
    const responseText = message.payload.text_response; // Assuming the native host sends { text_response: "..." }

    if (responseText) {
      // 1. Find the chat input field
      //    This selector needs to be verified on the actual gemini.google.com page.
      //    Common patterns: textarea, input[type='text'], contenteditable divs.
      //    Example selectors (likely need adjustment):
      //    - document.querySelector('textarea[aria-label*="Prompt"]')
      //    - document.querySelector('.chat-input textarea')
      //    - document.querySelector('div[contenteditable="true"][role="textbox"]')
      const chatInputField = document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]'); // Broader attempt

      if (chatInputField) {
        console.log("Found chat input field:", chatInputField);

        // 2. Inject the response text
        //    For a textarea or input:
        if (chatInputField.tagName === 'TEXTAREA' || chatInputField.tagName === 'INPUT') {
            chatInputField.value = responseText;
            // Dispatch an 'input' event to make sure any framework listeners are triggered
            chatInputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }
        // For a contenteditable div:
        else if (chatInputField.isContentEditable) {
            chatInputField.textContent = responseText;
            // Dispatch 'input' or 'focus/blur' events if needed
            chatInputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }

        console.log("Injected response text:", responseText);

        // 3. Find and click the send/submit button
        //    This selector also needs to be verified.
        //    Example selectors (likely need adjustment):
        //    - document.querySelector('button[aria-label*="Send"]')
        //    - document.querySelector('button[data-testid*="send"]')
        //    - A button with a specific SVG icon path inside it.
        const sendButton = document.querySelector('button[aria-label*="Send Message"], button[data-testid*="send-button"], button:has(svg[class*="send-icon"])'); // Example, needs refinement

        if (sendButton) {
          console.log("Found send button:", sendButton);
          sendButton.click();
          console.log("Clicked send button.");
        } else {
          console.error("Gemini MCP Client: Send button not found. Response injected but not submitted.");
        }
      } else {
        console.error("Gemini MCP Client: Chat input field not found. Cannot inject response.");
      }
    } else {
      console.warn("Gemini MCP Client: No text_response field in the payload from native host.", message.payload);
    }
  }
}

// Listen for messages from the background script
browser.runtime.onMessage.addListener(handleNativeHostResponse);

// Example of how parseFunctionCalls should be structured
function parseFunctionCalls(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");
  const tools = [];

  // Check for parser errors
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    console.error("Gemini MCP Client: XML parsing error:", parserError.textContent);
    return [{
      raw_xml: xmlString,
      error: "XML parsing error: " + parserError.textContent,
      tool_name: null,
      parameters: {},
      call_id: null
    }];
  }

  const functionCallsElement = doc.documentElement.nodeName === 'function_calls' ? doc.documentElement : doc.querySelector("function_calls");

  if (!functionCallsElement) {
    console.warn("Gemini MCP Client: <function_calls> tag not found in the XML structure.");
    return [{
      raw_xml: xmlString,
      error: "<function_calls> not found",
      tool_name: null,
      parameters: {},
      call_id: null
    }];
  }

  const invokeElements = functionCallsElement.querySelectorAll("invoke");

  if (invokeElements.length === 0) {
    // This case should ideally be handled by the improved wrapping logic in detectToolCallInMutation
    // or by ensuring xmlString always has a <function_calls> root if it contains invokes.
    console.warn("Gemini MCP Client: No <invoke> tags found within the primary parsed structure.");
    return [];
  }

  invokeElements.forEach(invokeElement => {
    const toolName = invokeElement.getAttribute("name");
    const callId = invokeElement.getAttribute("call_id"); // Extract call_id

    if (!toolName) {
      console.warn("Gemini MCP Client: <invoke> tag missing 'name' attribute.", invokeElement.outerHTML);
      // Optionally push an error object or just skip
      // tools.push({ tool_name: null, parameters: {}, call_id: callId, raw_xml: invokeElement.outerHTML, error: "Invoke tag missing name" });
      return; // Skip this invoke element if name is missing
    }
    // It's debatable if a missing call_id should be a hard error or just logged.
    // For now, we'll pass it as null if missing, but log a warning.
    if (!callId) {
        console.warn("Gemini MCP Client: <invoke> tag missing 'call_id' attribute for tool:", toolName, invokeElement.outerHTML);
    }

    const parameters = {};
    const parameterElements = invokeElement.querySelectorAll("parameter");

    parameterElements.forEach(paramElement => {
      const paramName = paramElement.getAttribute("name");
      if (!paramName) {
        console.warn("Gemini MCP Client: <parameter> tag missing 'name' attribute.", paramElement.outerHTML);
        return; // Skip this parameter
      }
      if (paramElement.children.length > 0) {
        parameters[paramName] = paramElement.innerHTML.trim();
      } else {
        parameters[paramName] = paramElement.textContent.trim();
      }
    });

    tools.push({
      tool_name: toolName,
      parameters: parameters,
      call_id: callId, // Add call_id to the toolData object
      raw_xml: invokeElement.outerHTML
    });
  });

  return tools;
}

function detectToolCallInMutation(mutation) {
  mutation.addedNodes.forEach(addedNode => {
    if (addedNode.nodeType !== Node.ELEMENT_NODE) return;

    // Find all potential <invoke> elements within the addedNode context.
    // This could be the addedNode itself if it's an invoke, or children if it's a container.
    let potentialInvokeElements = [];
    if (addedNode.matches('invoke')) {
        potentialInvokeElements.push(addedNode);
    } else {
        // QuerySelectorAll is not available on text nodes, ensure addedNode is Element.
        if (typeof addedNode.querySelectorAll === 'function') {
            const nodeList = addedNode.querySelectorAll('invoke');
            for (let i = 0; i < nodeList.length; i++) {
              potentialInvokeElements.push(nodeList[i]);
            }
        }
    }

    // If no <invoke> elements found directly, check if the addedNode contains a <function_calls> block
    // that might wrap <invoke> elements which were not directly part of the initially added DOM snippet's
    // direct structure but part of its conceptual content (e.g. if outerHTML of function_calls was used).
    if (potentialInvokeElements.length === 0 && typeof addedNode.querySelector === 'function' && addedNode.querySelector('function_calls')){
        // This path is more complex if the actual <invoke> nodes are not directly in `addedNode`'s queryable DOM yet.
        // For now, we primarily rely on finding <invoke> tags directly or as immediate children.
        // The string parsing later will handle cases where `outerHTML` of `function_calls` is processed.
    }

    // Step 1: Check existing <invoke> DOM elements for being already processed.
    potentialInvokeElements.forEach(invokeElem => {
        if (invokeElem.getAttribute('data-mcp-processed') === 'true') {
            console.log("Gemini MCP Client: Skipping already processed <invoke> element with call_id:", invokeElem.getAttribute('data-mcp-call-id'));
            return; // Skip this specific invoke element
        }
    });

    // Step 2: Extract XML string for parsing (this part might lead to reparsing if not careful)
    // The goal is to get the full <function_calls> block if possible for context.
    let potentialToolCallText = "";
    let sourceIsOuterHTML = false;
    if (addedNode.matches('function_calls') || (typeof addedNode.querySelector === 'function' && addedNode.querySelector('function_calls'))) {
        const fcElement = addedNode.matches('function_calls') ? addedNode : addedNode.querySelector('function_calls');
        potentialToolCallText = fcElement.outerHTML;
        sourceIsOuterHTML = true;
    } else if (addedNode.matches('invoke')) {
        potentialToolCallText = addedNode.outerHTML;
        sourceIsOuterHTML = true; // It's an invoke node's outerHTML
    } else if (addedNode.textContent) {
        let text = addedNode.textContent;
        let functionCallsIndex = text.indexOf('<function_calls>');
        let invokeIndex = text.indexOf('<invoke>');
        if (functionCallsIndex !== -1 && (invokeIndex === -1 || functionCallsIndex < invokeIndex)) {
            potentialToolCallText = text.substring(functionCallsIndex);
        } else if (invokeIndex !== -1) {
            potentialToolCallText = text.substring(invokeIndex);
        } else { potentialToolCallText = ""; }
    }
    potentialToolCallText = potentialToolCallText.trim();

    if (potentialToolCallText) {
        if (potentialToolCallText.startsWith('<invoke')) {
             if (!potentialToolCallText.includes('<function_calls>')) { // Avoid double wrap
                 potentialToolCallText = `<function_calls>${potentialToolCallText}</function_calls>`;
             }
        } else if (sourceIsOuterHTML && addedNode.matches('invoke') && !potentialToolCallText.includes('<function_calls>')){
            potentialToolCallText = `<function_calls>${potentialToolCallText}</function_calls>`;
        }

        console.log("Gemini MCP Client: Text for parsing:", potentialToolCallText);
        const parsedToolDataArray = parseFunctionCalls(potentialToolCallText);

        if (parsedToolDataArray && parsedToolDataArray.length > 0) {
          parsedToolDataArray.forEach(parsedToolData => {
            if (parsedToolData.error) {
                console.warn("Gemini MCP Client: Error parsing tool data, skipping send:", parsedToolData);
                return; // Skip if there was a parsing error from parseFunctionCalls
            }
            if (parsedToolData.tool_name && parsedToolData.call_id) {
                // Find the corresponding DOM element to mark it.
                // This assumes call_id is unique within the scope of `addedNode` or its children.
                let invokeToMark = null;
                if (addedNode.matches('invoke') && addedNode.getAttribute('call_id') === parsedToolData.call_id) {
                    invokeToMark = addedNode;
                } else if (typeof addedNode.querySelectorAll === 'function'){
                    // Query within the context of the addedNode that contained the tool call string
                    const callIdValue = String(parsedToolData.call_id).replace(/"/g, '\\"').replace(/`/g, '\\`'); // Escape " as \\" and ` as \\`
                    invokeToMark = addedNode.querySelector(`invoke[call_id="${callIdValue}"]`);
                }

                if (invokeToMark) {
                    if (invokeToMark.getAttribute('data-mcp-processed') === 'true') {
                        console.log("Gemini MCP Client: Tool call already marked processed, skipping send for call_id:", parsedToolData.call_id);
                        return;
                    }
                    console.log("Gemini MCP Client: Successfully parsed tool data:", parsedToolData);
                    sendToolCallToBackground(parsedToolData);
                    invokeToMark.setAttribute('data-mcp-processed', 'true');
                    invokeToMark.setAttribute('data-mcp-call-id', parsedToolData.call_id);
                    console.log("Gemini MCP Client: Marked invoke element as processed for call_id:", parsedToolData.call_id);
                } else {
                    // If we can't find the specific invoke element to mark (e.g. if parsing from textContent of a large block)
                    // we might still send it, but won't get DOM-based re-processing protection for this specific instance.
                    // ***** MODIFIED LINE BELOW *****
                    console.warn("Gemini MCP Client: Could not find specific invoke DOM element to mark for call_id: " + parsedToolData.call_id + ". Sending data anyway.");
                    sendToolCallToBackground(parsedToolData);
                }
            } else if (parsedToolData.tool_name && !parsedToolData.call_id) {
                console.warn("Gemini MCP Client: Parsed tool data is missing call_id. Sending without marking DOM.", parsedToolData);
                sendToolCallToBackground(parsedToolData);
            }
          });
        }
      }
    }
  });
}
function observerCallback(mutationsList, observer) {
  for (const mutation of mutationsList) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      detectToolCallInMutation(mutation);
    }
  }
}

const observerOptions = {
  childList: true,
  subtree: true,
  attributes: false
};

// Refined targetNode selection - this is still a guess and needs inspection of Gemini's DOM
// It's better to find the most specific container for chat messages.
// Example: document.querySelector('.chat-history-container') or similar
const targetNode = document.body; // Fallback, should be more specific

const observer = new MutationObserver(observerCallback);

if (targetNode) {
  observer.observe(targetNode, observerOptions);
  console.log("Gemini MCP Client: MutationObserver started. Target:", targetNode);
} else {
  console.error("Gemini MCP Client: Target node for MutationObserver not found.");
}

// No need for the old logDebugMessage function, as logging is now part of sendToolCallToBackground or handled by native host.
