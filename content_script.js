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

      console.log("Gemini MCP Client: Injected dummy prompt:", dummyMessage);

      // Refined send button selection logic, prioritizing user-provided selector
      let sendButton = null;
      const primarySelector = 'button.send-button.submit[aria-label="Send message"]';
      const fallbackSelectors = [
        'button[data-testid="send-button"]',
        'button[aria-label*="Send" i]',    // Case-insensitive, partial match for "Send"
        'button[aria-label*="Submit" i]',  // Case-insensitive, partial match for "Submit"
        'button:has(svg[class*="send-icon"])',
        'button.send-button'
      ];

      const attemptClick = (button, selectorUsed) => {
        if (button && button.offsetParent !== null) { // Check if visible
          if (!button.disabled) {
            console.log(`Gemini MCP Client: Found send button with selector: "${selectorUsed}". Attempting to click.`, button);
            button.click();
            console.log("Gemini MCP Client: Clicked send button for dummy prompt.");
            return true; // Click successful
          } else {
            console.warn(`Gemini MCP Client: Send button found with selector: "${selectorUsed}", but it is disabled.`, button);
            return false; // Found but disabled
          }
        }
        return false; // Not found or not visible
      };

      // Try primary selector first
      const primaryButton = document.querySelector(primarySelector);
      if (attemptClick(primaryButton, primarySelector)) {
        sendButton = primaryButton; // Mark as found
      } else {
        if (primaryButton) { // Found by primary selector but was not clickable (disabled or invisible)
             console.warn(`Gemini MCP Client: Primary selector "${primarySelector}" found a button, but it was not clickable (disabled or invisible). Trying fallbacks.`);
        } else {
            console.log(`Gemini MCP Client: Primary selector "${primarySelector}" did not find the send button. Trying fallbacks.`);
        }
        // Try fallback selectors
        for (const selector of fallbackSelectors) {
          const fallbackButton = document.querySelector(selector);
          if (attemptClick(fallbackButton, selector)) {
            sendButton = fallbackButton; // Mark as found
            break; // Exit loop once a button is successfully clicked
          } else if (fallbackButton) { // Found but not clickable
              console.warn(`Gemini MCP Client: Fallback selector "${selector}" found a button, but it was not clickable (disabled or invisible).`);
          }
        }
      }

      if (!sendButton) {
        console.warn("Gemini MCP Client: No clickable send button found after trying all selectors. Dummy prompt injected but not submitted.");
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

        // Find all <code-block> elements to search within.
        // This includes <code-block>s that are children of <response-element>s,
        // or <code-block>s that might be added directly or within other containers.
        let codeBlocksToSearch = [];

        // Scenario 1: The addedNode itself is a <response-element> or contains them.
        let responseElements = [];
        if (addedNode.matches && addedNode.matches('response-element')) {
            responseElements.push(addedNode);
        } else if (addedNode.querySelectorAll) {
            // Query for response-element children if addedNode is a container
            responseElements.push(...Array.from(addedNode.querySelectorAll('response-element')));
        }

        responseElements.forEach(responseElem => {
            if (responseElem.querySelectorAll) {
                 codeBlocksToSearch.push(...Array.from(responseElem.querySelectorAll('code-block')));
            }
        });

        // Scenario 2: The addedNode itself is a <code-block> or contains them (not nested in a response-element found above).
        // This handles cases where <code-block> might be added outside a <response-element>,
        // or if <response-element> was already in DOM and <code-block> is added to it.
        if (addedNode.matches && addedNode.matches('code-block')) {
            codeBlocksToSearch.push(addedNode);
        } else if (addedNode.querySelectorAll) {
            // Query for code-block children if addedNode is a container and not a response-element itself
            // (or if response-elements were already handled and we want other code-blocks)
            codeBlocksToSearch.push(...Array.from(addedNode.querySelectorAll('code-block')));
        }

        // Deduplicate codeBlocksToSearch as the same code-block could be found through multiple paths
        // (e.g. addedNode is response-element, and it also contains a code-block directly).
        // Using a Set is an efficient way to get unique elements.
        const uniqueCodeBlocks = Array.from(new Set(codeBlocksToSearch));

        uniqueCodeBlocks.forEach(codeBlock => {
            // Check if this code-block has already been processed
            if (codeBlock.dataset.mcpProcessed === 'true') {
                // console.log("Gemini MCP Client: Skipping already processed <code-block>:", codeBlock);
                return; // Use return to skip this iteration of forEach
            }

            // Find the <code> element, typically inside <pre>
            const codeElement = codeBlock.querySelector('pre > code, code'); // Handles if pre is there or not

            if (codeElement) {
                // Prefer textContent for cleaner XML, fallback to innerHTML if textContent is empty/null
                let potentialToolCallText = (codeElement.textContent || codeElement.innerHTML || "").trim();

                if (potentialToolCallText.includes('<function_calls>') || potentialToolCallText.includes('<invoke>')) {
                    console.log("Gemini MCP Client: Found potential tool call XML in <code> element:", potentialToolCallText.substring(0, 200) + "...");

                    // Ensure it's wrapped if it's a single invoke (Python also does this, but good for consistency)
                    if (potentialToolCallText.startsWith('<invoke') && !potentialToolCallText.includes('<function_calls>')) {
                        potentialToolCallText = `<function_calls>${potentialToolCallText}</function_calls>`;
                        console.log("Gemini MCP Client: Wrapped single <invoke> with <function_calls>.");
                    }

                    // call_id from DOM attributes is unlikely here as we are getting content from <code>.
                    // The actual <invoke> tag with a call_id attribute is part of the string, not a DOM element attribute here.
                    // Python will parse the call_id from the raw_xml string.
                    const callIdFromDomAttribute = null;

                    sendToolCallToBackground({
                        raw_xml: potentialToolCallText,
                        call_id: callIdFromDomAttribute // Python will extract the true call_id from raw_xml
                    });

                    // Mark the code-block as processed to avoid reprocessing its static content.
                    // This is important if mutations occur around this block but its content is unchanged.
                    codeBlock.dataset.mcpProcessed = 'true';
                    console.log("Gemini MCP Client: Marked <code-block> as processed.", codeBlock);

                } else {
                    // console.log("Gemini MCP Client: No tool call signature found in <code> content:", codeElement.textContent.substring(0,100));
                }
            } else {
                // console.log("Gemini MCP Client: No <code> element found within <code-block>:", codeBlock);
            }
        });
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
