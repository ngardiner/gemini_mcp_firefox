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
    // Potentially return raw string or an error object
    // For now, returning empty if major parsing error
    return [{ raw_xml: xmlString, error: "XML parsing error", tool_name: null, parameters: {} }];
  }

  const functionCallsElement = doc.documentElement.nodeName === 'function_calls' ? doc.documentElement : doc.querySelector("function_calls");

  if (!functionCallsElement) {
    console.warn("Gemini MCP Client: <function_calls> tag not found in the XML structure.");
    return [{ raw_xml: xmlString, error: "<function_calls> not found", tool_name: null, parameters: {} }];
  }

  let invokeElements = functionCallsElement.querySelectorAll("invoke");

  if (invokeElements.length === 0) {
    // Fallback: maybe the xmlString itself is a single invoke if function_calls was missing but invoke was found
    if (doc.documentElement.nodeName === 'invoke') {
        invokeElements = [doc.documentElement];
    } else {
        console.warn("Gemini MCP Client: No <invoke> tags found within <function_calls>.");
        // return [{ raw_xml: xmlString, error: "No <invoke> tags found", tool_name: null, parameters: {} }];
        return []; // Return empty array if no invokes found
    }
  }

  invokeElements.forEach(invokeElement => {
    const toolName = invokeElement.getAttribute("name");
    if (!toolName) {
      console.warn("Gemini MCP Client: <invoke> tag missing 'name' attribute.", invokeElement.outerHTML);
      // tools.push({ tool_name: null, parameters: {}, raw_xml: invokeElement.outerHTML, error: "Invoke tag missing name" });
      return; // Skip this invoke element
    }

    const parameters = {};
    const parameterElements = invokeElement.querySelectorAll("parameter");

    parameterElements.forEach(paramElement => {
      const paramName = paramElement.getAttribute("name");
      if (!paramName) {
        console.warn("Gemini MCP Client: <parameter> tag missing 'name' attribute.", paramElement.outerHTML);
        return; // Skip this parameter
      }
      // Check if the parameter has child elements vs only text content
      if (paramElement.children.length > 0) {
        parameters[paramName] = paramElement.innerHTML.trim(); // Serialize children as HTML string
      } else {
        parameters[paramName] = paramElement.textContent.trim();
      }
    });

    tools.push({
      tool_name: toolName,
      parameters: parameters,
      raw_xml: invokeElement.outerHTML // Or xmlString if you want the whole <function_calls> block
    });
  });

  return tools;
}

// Modify detectToolCallInMutation to handle the array from parseFunctionCalls
function detectToolCallInMutation(mutation) {
  mutation.addedNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      let potentialToolCallText = "";
      // Prioritize direct function_calls element or one containing it
      if (node.matches('function_calls') || node.querySelector('function_calls')) {
          const fcElement = node.matches('function_calls') ? node : node.querySelector('function_calls');
          potentialToolCallText = fcElement.outerHTML;
      } else if (node.matches('invoke')) { // Handle case where a single invoke might be added
          potentialToolCallText = node.outerHTML; // Wrap it or assume parseFunctionCalls can handle it
      } else if (node.textContent && (node.textContent.includes('<function_calls>') || node.textContent.includes('<invoke'))) {
          potentialToolCallText = node.textContent; // Fallback
      }

      if (potentialToolCallText) {
        // Ensure the string is a complete XML document for the parser,
        // especially if we only grabbed an invoke node's outerHTML.
        // If it doesn't start with <function_calls but is an invoke, wrap it.
        if (!potentialToolCallText.trim().startsWith('<function_calls>') && potentialToolCallText.trim().startsWith('<invoke')) {
            potentialToolCallText = `<function_calls>${potentialToolCallText}</function_calls>`;
        }

        console.log("Gemini MCP Client: Potential tool call structure identified. Raw text for parsing:", potentialToolCallText);
        const parsedToolDataArray = parseFunctionCalls(potentialToolCallText);

        if (parsedToolDataArray && parsedToolDataArray.length > 0) {
          parsedToolDataArray.forEach(parsedToolData => {
            if (parsedToolData.tool_name) { // Check if tool_name is valid after parsing
              console.log("Gemini MCP Client: Successfully parsed tool data:", parsedToolData);
              sendToolCallToBackground(parsedToolData);
            } else if (parsedToolData.error) {
              console.warn("Gemini MCP Client: Error parsing tool data, but sending raw:", parsedToolData);
              // Decide if you want to send data even if parsing partially failed
              // sendToolCallToBackground({ raw_xml: parsedToolData.raw_xml, error: parsedToolData.error, tool_name: null });
            }
          });
        } else {
          // This case might be hit if parseFunctionCalls returns an empty array (e.g. no invokes found)
          // Or if there was a non-XML string that passed the initial checks.
          console.log("Gemini MCP Client: No tool data parsed or empty array returned from parseFunctionCalls for text:", potentialToolCallText);
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
