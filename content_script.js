console.log("Gemini MCP Client content script loaded. Version 2.0");

// Global variable to track client state
let isMcpClientEnabled = true;
let observer = null; // Will be initialized later
let targetNode = null; // Will be set later

// Function to create and inject UI elements
function setupUI() {
  const uiContainer = document.createElement('div');
  uiContainer.id = 'mcp-client-ui-container';
  uiContainer.style.position = 'fixed';
  uiContainer.style.top = '10px';
  uiContainer.style.right = '10px';
  uiContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
  uiContainer.style.padding = '10px';
  uiContainer.style.border = '1px solid #ccc';
  uiContainer.style.borderRadius = '5px';
  uiContainer.style.zIndex = '9999';
  uiContainer.style.fontFamily = 'Arial, sans-serif';
  uiContainer.style.fontSize = '14px';
  uiContainer.style.color = '#333';

  // Toggle Switch
  const toggleLabel = document.createElement('label');
  toggleLabel.htmlFor = 'mcp-client-toggle';
  toggleLabel.textContent = 'Enable MCP Client: ';
  toggleLabel.style.marginRight = '5px';

  const toggleSwitch = document.createElement('input');
  toggleSwitch.type = 'checkbox';
  toggleSwitch.id = 'mcp-client-toggle';
  toggleSwitch.checked = isMcpClientEnabled;
  toggleSwitch.style.verticalAlign = 'middle';

  toggleSwitch.addEventListener('change', () => {
    isMcpClientEnabled = toggleSwitch.checked;
    console.log(`Gemini MCP Client ${isMcpClientEnabled ? 'enabled' : 'disabled'}`);
    if (isMcpClientEnabled) {
      startObserver();
    } else {
      stopObserver();
    }
  });

  // Dummy Prompt Button
  const dummyPromptButton = document.createElement('button');
  dummyPromptButton.id = 'mcp-inject-dummy-prompt';
  dummyPromptButton.textContent = 'Inject Dummy Prompt';
  dummyPromptButton.style.marginTop = '10px';
  dummyPromptButton.style.display = 'block';
  dummyPromptButton.style.padding = '5px 10px';
  dummyPromptButton.style.border = '1px solid #007bff';
  dummyPromptButton.style.backgroundColor = '#007bff';
  dummyPromptButton.style.color = 'white';
  dummyPromptButton.style.borderRadius = '3px';
  dummyPromptButton.style.cursor = 'pointer';

  dummyPromptButton.addEventListener('click', () => {
    const chatInputField = document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
    if (chatInputField) {
      const dummyMessage = "Test message from MCP Client: Describe the process of photosynthesis.";
      if (chatInputField.tagName === 'TEXTAREA' || chatInputField.tagName === 'INPUT') {
        chatInputField.value = dummyMessage;
        chatInputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      } else if (chatInputField.isContentEditable) {
        chatInputField.textContent = dummyMessage;
        chatInputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      }
      console.log("Gemini MCP Client: Injected dummy prompt:", dummyMessage);

      // Refined send button selection logic
      let sendButton = null;
      const sendButtonSelectors = [
        'button[data-testid="send-button"]', // Often used for testing, can be stable
        'button[aria-label*="Send" i]',    // Case-insensitive aria-label containing "Send"
        'button[aria-label*="Submit" i]',  // Case-insensitive aria-label containing "Submit"
        // The following selector attempts to find a button that is likely the send button
        // by looking for common SVG paths associated with send icons (paper airplane).
        // This is highly dependent on the SVG structure used by Gemini.
        // Example: 'button:has(svg path[d*="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"])', // Material Design paper airplane
        // For now, keeping it simpler as complex SVG path selectors can be brittle.
        'button:has(svg[class*="send-icon"])', // Original attempt, class might vary
        'button.send-button' // A generic class that might be used
      ];

      for (const selector of sendButtonSelectors) {
        const button = document.querySelector(selector);
        if (button && !button.disabled && button.offsetParent !== null) { // Check if visible and not disabled
          sendButton = button;
          console.log("Gemini MCP Client: Found potential send button with selector:", selector, sendButton);
          break;
        }
      }
      
      if (sendButton) {
        console.log("Gemini MCP Client: Attempting to click send button:", sendButton);
        if (!sendButton.disabled) {
            sendButton.click();
            console.log("Gemini MCP Client: Clicked send button for dummy prompt.");
        } else {
            console.warn("Gemini MCP Client: Send button found but is disabled. Cannot send dummy prompt automatically.");
        }
      } else {
        console.warn("Gemini MCP Client: Send button not found or not clickable. Dummy prompt injected but not submitted.");
      }
    } else {
      console.error("Gemini MCP Client: Chat input field not found for dummy prompt.");
    }
  });

  const toggleDiv = document.createElement('div');
  toggleDiv.appendChild(toggleLabel);
  toggleDiv.appendChild(toggleSwitch);

  uiContainer.appendChild(toggleDiv);
  uiContainer.appendChild(dummyPromptButton);
  document.body.appendChild(uiContainer);
  console.log("Gemini MCP Client: UI elements injected.");
}


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

function detectToolCallInMutation(mutation) {
  mutation.addedNodes.forEach(addedNode => {
    if (addedNode.nodeType !== Node.ELEMENT_NODE) return;

    let potentialToolCallText = "";
    let callId = null;
    let
      isInvokeCall = false;
    let elementToMark = null; // The DOM element that might be marked as processed

    // Case 1: Added node is <function_calls>
    if (addedNode.matches('function_calls')) {
      console.log("Gemini MCP Client: Detected <function_calls> element directly added.");
      potentialToolCallText = addedNode.outerHTML;
      elementToMark = addedNode; // Mark the <function_calls> element itself or its first <invoke> child
      // Try to find an invoke child to get call_id and potentially mark it
      const invokeChild = addedNode.querySelector('invoke');
      if (invokeChild) {
        callId = invokeChild.getAttribute('call_id');
        elementToMark = invokeChild; // Prefer marking the <invoke> element
      }
    }
    // Case 2: Added node is <invoke>
    else if (addedNode.matches('invoke')) {
      console.log("Gemini MCP Client: Detected <invoke> element directly added.");
      potentialToolCallText = addedNode.outerHTML;
      callId = addedNode.getAttribute('call_id');
      isInvokeCall = true;
      elementToMark = addedNode;
    }
    // Case 3: Added node contains <function_calls>
    else if (typeof addedNode.querySelector === 'function' && addedNode.querySelector('function_calls')) {
      console.log("Gemini MCP Client: Detected <function_calls> element within added node.");
      const fcElement = addedNode.querySelector('function_calls');
      potentialToolCallText = fcElement.outerHTML;
      elementToMark = fcElement; // Mark the <function_calls> element
      const invokeChild = fcElement.querySelector('invoke');
      if (invokeChild) {
        callId = invokeChild.getAttribute('call_id');
        elementToMark = invokeChild; // Prefer marking the <invoke> element
      }
    }
    // Case 4: Added node contains <invoke> (but not inside function_calls, e.g. if function_calls is higher up)
    else if (typeof addedNode.querySelectorAll === 'function') {
        const invokes = addedNode.querySelectorAll('invoke');
        if (invokes.length > 0) {
            // Process the first one for now. Robust handling of multiple independent invokes
            // without a common function_calls parent in the same mutation needs careful consideration.
            console.log("Gemini MCP Client: Detected <invoke> element(s) within added node.");
            const firstInvoke = invokes[0];
            potentialToolCallText = firstInvoke.outerHTML;
            callId = firstInvoke.getAttribute('call_id');
            isInvokeCall = true;
            elementToMark = firstInvoke;

            // If multiple invokes are added in the same blob without a parent <function_calls>
            // this simplified logic will only catch the first. This might be an edge case.
            if (invokes.length > 1) {
                console.warn("Gemini MCP Client: Multiple <invoke> elements found in added node without a <function_calls> parent. Processing only the first.");
            }
        }
    }


    if (potentialToolCallText) {
      // If it's an invoke call and not already wrapped, wrap it.
      if (isInvokeCall && !potentialToolCallText.includes('<function_calls>')) {
        potentialToolCallText = `<function_calls>${potentialToolCallText}</function_calls>`;
        console.log("Gemini MCP Client: Wrapped <invoke> with <function_calls>.");
      }

      // DOM Marking Logic (Simplified)
      if (elementToMark && callId) {
        if (elementToMark.getAttribute('data-mcp-processed') === 'true' && elementToMark.getAttribute('data-mcp-call-id') === callId) {
          console.log("Gemini MCP Client: Skipping already processed element with call_id:", callId);
          return; // Already processed and sent
        }
      } else if (elementToMark && elementToMark.matches('function_calls') && !callId) {
        // If we have a function_calls element but couldn't find a call_id from a child invoke,
        // check if it has been marked processed by text content (less ideal).
        if (elementToMark.getAttribute('data-mcp-processed') === 'true') {
             console.log("Gemini MCP Client: Skipping already processed <function_calls> element (no call_id found for specific marking).");
             return;
        }
      }


      console.log("Gemini MCP Client: Extracted raw XML:", potentialToolCallText, "Call ID from DOM:", callId);

      sendToolCallToBackground({
        raw_xml: potentialToolCallText,
        call_id: callId || null
      });

      // Mark as processed if we have an element and a call_id from its attribute
      if (elementToMark && callId) {
        elementToMark.setAttribute('data-mcp-processed', 'true');
        elementToMark.setAttribute('data-mcp-call-id', callId);
        console.log("Gemini MCP Client: Marked element as processed with call_id:", callId, elementToMark);
      } else if (elementToMark && elementToMark.matches('function_calls>') && !callId) {
        // If it's a function_calls element and we didn't get a call_id (e.g. no invoke child or invoke missing id),
        // we can still mark the function_calls element itself to prevent re-processing its whole outerHTML text.
        elementToMark.setAttribute('data-mcp-processed', 'true');
        console.log("Gemini MCP Client: Marked <function_calls> element as processed (no specific call_id).", elementToMark);
      } else {
        // If no specific element could be pinpointed for marking (e.g., text-based detection - though less emphasized now)
        // or if call_id was not available from DOM attribute. Python side will do more robust duplicate check.
        console.log("Gemini MCP Client: Tool call sent. No specific DOM element marked as call_id was not available or elementToMark is null.");
      }
    }
  });
}

function observerCallback(mutationsList, _observer) {
  if (!isMcpClientEnabled) return; // Check if client is enabled

  for (const mutation of mutationsList) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      detectToolCallInMutation(mutation);
    }
  }
}

const observerOptions = {
  childList: true,
  subtree: true,
  // attributes: false // Not watching attributes for now.
};

// Start and Stop observer functions
function startObserver() {
  if (!observer) { // Check if observer is already initialized
      observer = new MutationObserver(observerCallback);
  }
  if (targetNode && isMcpClientEnabled) {
    try {
        observer.observe(targetNode, observerOptions);
        console.log("Gemini MCP Client: MutationObserver started/restarted. Target:", targetNode);
    } catch (e) {
        console.error("Gemini MCP Client: Error starting MutationObserver:", e);
        // Potentially, targetNode became invalid if UI framework replaced it. Re-query.
        initializeTargetNodeAndObserver(true); // Force re-query
    }
  } else if (!targetNode) {
    console.error("Gemini MCP Client: Target node not available to start observer.");
    initializeTargetNodeAndObserver(true); // Attempt to initialize again
  }
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    console.log("Gemini MCP Client: MutationObserver stopped.");
  }
}

// Function to initialize targetNode and start observer
function initializeTargetNodeAndObserver(forceStart = false) {
    // Attempt to find a more specific target node for Gemini's responses.
    // These selectors are common patterns for chat applications.
    const selectors = [
        '[role="log"]',                           // ARIA role often used for chat logs
        '.chat-history',                        // Common class name for chat history container
        '.message-list-container',              // Another common class name
        'div[aria-live="polite"]',              // Elements that announce updates
        'main .chat-area',                      // More specific if 'main' contains a 'chat-area'
        'main',                                 // General main content area
        // Add more selectors here if needed based on Gemini's actual DOM structure
    ];

    let foundNode = null;
    for (const selector of selectors) {
        foundNode = document.querySelector(selector);
        if (foundNode) {
            console.log("Gemini MCP Client: Found targetNode with selector:", selector, foundNode);
            break;
        }
    }

    targetNode = foundNode || document.body; // Fallback to document.body if no specific selector matches

    if (targetNode === document.body) {
        console.warn("Gemini MCP Client: Using document.body as fallback targetNode for MutationObserver. This might be inefficient. A more specific selector is recommended for Gemini's response area.");
    } else {
        console.log("Gemini MCP Client: Target node for MutationObserver set to:", targetNode);
    }

    if (targetNode) {
        // console.log("Gemini MCP Client: Target node for MutationObserver set to:", targetNode); // Already logged above with more context
        if (isMcpClientEnabled || forceStart) {
            startObserver();
        }
    } else {
        console.error("Gemini MCP Client: Target node for MutationObserver not found even after attempt.");
    }
}

// Initial setup
setupUI(); // Create and inject UI elements

// Initialize and start the observer after UI is ready and DOM might be more stable
// Adding a small delay to potentially allow Gemini's UI to finish its initial rendering.
setTimeout(() => {
    initializeTargetNodeAndObserver(true); // Initialize and force start if enabled
}, 1000);


// No need for the old logDebugMessage function
