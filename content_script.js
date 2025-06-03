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
    console.log("Gemini MCP Client [DEBUG]: Dummy prompt button clicked. Starting search for chat input and send button.");

    const chatInputSelector = 'div.ql-editor.textarea.new-input-ui p';
    console.log("Gemini MCP Client [DEBUG]: Attempting to find chat input with selector:", chatInputSelector);
    const chatInputField = document.querySelector(chatInputSelector);

    if (chatInputField) {
      console.log("Gemini MCP Client [DEBUG]: Found chat input field:", chatInputField);
      const dummyMessage = "Test message from MCP Client: Describe the process of photosynthesis.";

      // Set text content
      chatInputField.textContent = dummyMessage;

      // Dispatch events
      chatInputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      chatInputField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      console.log("Gemini MCP Client [DEBUG]: Injected dummy message and dispatched input/change events.");

      // Send button selection logic
      let sendButton = null;
      let clickedSuccessfully = false; // Flag to track if click was successful

      // Define selectors with the new primary selector first
      const newPrimarySendSelector = 'button.mat-mdc-icon-button.send-button';
      const oldPrimarySelector = 'button.send-button.submit[aria-label="Send message"]'; // Previous primary, now a high-priority fallback
      const fallbackSendSelectors = [
        oldPrimarySelector, // Keep the user-provided one high in fallback list
        'button[data-testid="send-button"]',
        'button[aria-label*="Send" i]',
        'button[aria-label*="Submit" i]',
        'button:has(svg[class*="send-icon"])', // Original attempt, class might vary
        'button.send-button' // A generic class that might be used
      ];

      const attemptClick = (button, selectorUsed) => {
        console.log("Gemini MCP Client [DEBUG]: attemptClick called for button found by selector:", selectorUsed, button);
        if (button && button.offsetParent !== null) { // Check if visible
          if (!button.disabled) {
            console.log(`Gemini MCP Client [DEBUG]: Found send button with selector: "${selectorUsed}". Attempting to click.`, button);
            button.click();
            console.log("Gemini MCP Client [DEBUG]: Click successful for button found by:", selectorUsed);
            return true; // Click successful
          } else {
            console.warn(`Gemini MCP Client [DEBUG]: Send button found with selector: "${selectorUsed}", but it is disabled.`, button);
            return false; // Found but disabled
          }
        } else if (button) {
            console.warn(`Gemini MCP Client [DEBUG]: Send button found with selector: "${selectorUsed}", but it is not visible (offsetParent is null).`, button);
            return false; // Found but not visible
        }
        return false; // Not found or not visible (button was null)
      };

      const trySelectors = (selectorsList) => {
          for (const selector of selectorsList) {
              console.log("Gemini MCP Client [DEBUG]: Attempting to find send button with selector:", selector);
              const button = document.querySelector(selector);
              if (button) {
                  console.log("Gemini MCP Client [DEBUG]: Found button candidate with selector '" + selector + "'. outerHTML:", button.outerHTML);
                  console.log("Gemini MCP Client [DEBUG]: Button innerText:", button.innerText);
                  console.log("Gemini MCP Client [DEBUG]: Button disabled state:", button.disabled);
                  console.log("Gemini MCP Client [DEBUG]: Button offsetParent (for visibility):", button.offsetParent);
                  const computedStyle = window.getComputedStyle(button);
                  console.log("Gemini MCP Client [DEBUG]: Button computed style - display:", computedStyle.display, "visibility:", computedStyle.visibility, "opacity:", computedStyle.opacity);
              } else {
                  console.log("Gemini MCP Client [DEBUG]: No button found with selector:", selector);
              }

              if (attemptClick(button, selector)) {
                  sendButton = button; // Assign to outer scope sendButton
                  return true; // Clicked successfully
              } else if (button) { // Found but not clickable
                  console.warn(`Gemini MCP Client [DEBUG]: Selector "${selector}" found a button, but it was not clickable.`);
              }
          }
          return false; // No selector in this list resulted in a click
      };

      // Try new primary selector first
      if (trySelectors([newPrimarySendSelector])) {
          clickedSuccessfully = true;
      } else {
          console.log(`Gemini MCP Client [DEBUG]: New primary selector "${newPrimarySendSelector}" did not find a clickable button. Trying other fallbacks.`);
          if (trySelectors(fallbackSendSelectors)) {
              clickedSuccessfully = true;
          }
      }

      if (!clickedSuccessfully) { // Check the flag instead of sendButton directly
        console.error("Gemini MCP Client [DEBUG]: After all attempts, no clickable send button was found.");
        console.warn("Gemini MCP Client: No clickable send button found after trying all selectors. Dummy prompt injected but not submitted.");
          }
      }
    } else {
      console.error("Gemini MCP Client [DEBUG]: Chat input field not found with selector:", chatInputSelector);
      console.error("Gemini MCP Client: Chat input field not found. Cannot inject dummy prompt."); // Original user-facing
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
    console.log("Gemini MCP Client [DEBUG]: Mutation observed. Type:", mutation.type);
    mutation.addedNodes.forEach((addedNode, index) => {
        if (addedNode.nodeType === Node.ELEMENT_NODE) {
            console.log(`Gemini MCP Client [DEBUG]: Added node [${index}] outerHTML:`, addedNode.outerHTML.substring(0, 500) + (addedNode.outerHTML.length > 500 ? "..." : ""));
        } else {
            console.log(`Gemini MCP Client [DEBUG]: Added node [${index}] (not an element):`, addedNode.nodeName, addedNode.textContent);
        }
    });

    mutation.addedNodes.forEach(addedNode => { // Keep original loop for processing
        if (addedNode.nodeType !== Node.ELEMENT_NODE) return;

        let codeBlocksToSearch = [];
        let responseElements = [];

        if (addedNode.matches && addedNode.matches('response-element')) {
            responseElements.push(addedNode);
        } else if (addedNode.querySelectorAll) {
            responseElements.push(...Array.from(addedNode.querySelectorAll('response-element')));
        }

        responseElements.forEach(responseElem => {
            console.log("Gemini MCP Client [DEBUG]: Found <response-element>. outerHTML:", responseElem.outerHTML.substring(0, 500) + (responseElem.outerHTML.length > 500 ? "..." : ""));
            if (responseElem.querySelectorAll) {
                 codeBlocksToSearch.push(...Array.from(responseElem.querySelectorAll('code-block')));
            }
        });

        if (addedNode.matches && addedNode.matches('code-block')) {
            codeBlocksToSearch.push(addedNode);
        } else if (addedNode.querySelectorAll) {
            codeBlocksToSearch.push(...Array.from(addedNode.querySelectorAll('code-block')));
        }

        const uniqueCodeBlocks = Array.from(new Set(codeBlocksToSearch));

        uniqueCodeBlocks.forEach(codeBlock => {
            console.log("Gemini MCP Client [DEBUG]: Processing <code-block>. outerHTML:", codeBlock.outerHTML.substring(0, 500) + (codeBlock.outerHTML.length > 500 ? "..." : ""));
            if (codeBlock.dataset.mcpProcessed === 'true') {
                return;
            }

            const codeElement = codeBlock.querySelector('pre > code, code');

            if (codeElement) {
                console.log("Gemini MCP Client [DEBUG]: Found <code> element. textContent:", codeElement.textContent);
                console.log("Gemini MCP Client [DEBUG]: Found <code> element. innerHTML:", codeElement.innerHTML.substring(0, 500) + (codeElement.innerHTML.length > 500 ? "..." : ""));

                let potentialToolCallText = (codeElement.textContent || codeElement.innerHTML || "").trim();

                if (potentialToolCallText.includes('<function_calls>') || potentialToolCallText.includes('<invoke>')) {
                    console.log("Gemini MCP Client: Found potential tool call XML in <code> element:", potentialToolCallText.substring(0, 200) + "...");

                    if (potentialToolCallText.startsWith('<invoke') && !potentialToolCallText.includes('<function_calls>')) {
                        potentialToolCallText = `<function_calls>${potentialToolCallText}</function_calls>`;
                        console.log("Gemini MCP Client: Wrapped single <invoke> with <function_calls>.");
                    }

                    const callIdFromDomAttribute = null;

                    console.log("Gemini MCP Client [DEBUG]: Sending to background:", { raw_xml: potentialToolCallText, call_id: callIdFromDomAttribute });
                    sendToolCallToBackground({
                        raw_xml: potentialToolCallText,
                        call_id: callIdFromDomAttribute
                    });

                    codeBlock.dataset.mcpProcessed = 'true';
                    console.log("Gemini MCP Client: Marked <code-block> as processed.", codeBlock);
                }
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
    const targetSelectors = [ // Renamed for clarity in logging
        '[role="log"]',
        '.chat-history',
        '.message-list-container',
        'div[aria-live="polite"]',
        'main .chat-area',
        'main',
    ];
    console.log("Gemini MCP Client [DEBUG]: Attempting to select targetNode. Candidate selectors:", targetSelectors);

    let foundNode = null;
    let usedSelector = "";
    for (const selector of targetSelectors) {
        foundNode = document.querySelector(selector);
        if (foundNode) {
            usedSelector = selector;
            console.log(`Gemini MCP Client [DEBUG]: Successfully selected targetNode with selector: '${usedSelector}'. Observed element:`, foundNode);
            break;
        }
    }

    targetNode = foundNode || document.body;

    if (targetNode === document.body && !foundNode) { // Only log fallback if no specific node was found
        console.warn("Gemini MCP Client [DEBUG]: Falling back to document.body for targetNode. This may be inefficient.");
    } else if (foundNode) { // Log the successfully chosen specific node (already done above)
        // console.log("Gemini MCP Client: Target node for MutationObserver set to:", targetNode); // Redundant due to log above
    }


    if (targetNode) {
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
