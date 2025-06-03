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

// Function to inject text and send the message using polling for the send button
async function injectAndSendMessage(textToInject, isToolResult = false) {
    console.log(`Gemini MCP Client [DEBUG]: injectAndSendMessage called. isToolResult: ${isToolResult}, text: "${textToInject.substring(0, 50)}..."`);

    const chatInputSelector = 'div.ql-editor.textarea.new-input-ui p';
    console.log("Gemini MCP Client [DEBUG]: Attempting to find chat input with selector:", chatInputSelector);
    const chatInputField = document.querySelector(chatInputSelector);

    if (!chatInputField) {
        console.error("Gemini MCP Client [ERROR]: Chat input field not found with selector:", chatInputSelector, "for injectAndSendMessage.");
        return Promise.reject("Chat input field not found.");
    }
    console.log("Gemini MCP Client [DEBUG]: Found chat input field for injection:", chatInputField);

    // Set text content
    chatInputField.textContent = textToInject;

    // Dispatch events
    chatInputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    chatInputField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    console.log("Gemini MCP Client [DEBUG]: Text injected and input/change events dispatched.");

    return new Promise((resolve, reject) => {
        const pollInterval = 500;
        const pollTimeout = 10000; // 10 seconds
        let elapsedTime = 0;

        const primarySendSelector = 'button.mat-mdc-icon-button.send-button';
        const oldPrimarySelector = 'button.send-button.submit[aria-label="Send message"]';
        const fallbackSendSelectors = [
            oldPrimarySelector,
            'button[data-testid="send-button"]',
            'button[aria-label*="Send" i]',
            'button[aria-label*="Submit" i]',
            'button:has(svg[class*="send-icon"])',
            'button.send-button'
        ];
        const allSelectors = [primarySendSelector, ...fallbackSendSelectors];

        console.log("Gemini MCP Client [DEBUG]: Starting polling for send button. Total timeout:", pollTimeout / 1000, "s. Interval:", pollInterval, "ms.");

        const intervalId = setInterval(() => {
            elapsedTime += pollInterval;
            let buttonClicked = false;

            for (const selector of allSelectors) {
                // console.log("Gemini MCP Client [DEBUG]: Polling: Attempting selector:", selector); // Kept for verbosity if needed
                const button = document.querySelector(selector);

                if (button) {
                    // console.log("Gemini MCP Client [DEBUG]: Polling: Button candidate found with selector '" + selector + "'."); // Kept for verbosity
                    // console.log("Gemini MCP Client [DEBUG]:   - outerHTML:", button.outerHTML.substring(0,100) + "...");
                    // console.log("Gemini MCP Client [DEBUG]:   - disabled property:", button.disabled);
                    // console.log("Gemini MCP Client [DEBUG]:   - offsetParent (for visibility):", button.offsetParent);
                    // const computedStyle = window.getComputedStyle(button);
                    // console.log("Gemini MCP Client [DEBUG]:   - computedStyle.display:", computedStyle.display);
                    // console.log("Gemini MCP Client [DEBUG]:   - computedStyle.visibility:", computedStyle.visibility);
                    // console.log("Gemini MCP Client [DEBUG]:   - computedStyle.opacity:", computedStyle.opacity);
                    // console.log("Gemini MCP Client [DEBUG]:   - computedStyle.pointerEvents:", computedStyle.pointerEvents);

                    if (!button.disabled && button.offsetParent !== null) { // Check if visible and not disabled
                        button.click();
                        console.log(`Gemini MCP Client [DEBUG]: Send button clicked successfully via polling. Selector: '${selector}'.`);
                        clearInterval(intervalId);
                        buttonClicked = true;
                        resolve(true);
                        break;
                    } else {
                        // console.log(`Gemini MCP Client [DEBUG]: Polling: Button found with selector '${selector}', but not clickable (Disabled: ${button.disabled}, Visible: ${button.offsetParent !== null}).`);
                    }
                }
            } // End of for loop (selectors)

            if (buttonClicked) return; // Already resolved

            if (elapsedTime >= pollTimeout) {
                console.error("Gemini MCP Client [ERROR]: Timeout: Send button did not become clickable after " + (pollTimeout / 1000) + " seconds.");
                clearInterval(intervalId);
                reject(new Error("Timeout: Send button did not become clickable."));
            } else {
                // console.log("Gemini MCP Client [DEBUG]: Polling: Send button not clickable yet or not found in this attempt, continuing to poll... Elapsed time:", elapsedTime / 1000, "s.");
            }

        }, pollInterval);
    });
}


  dummyPromptButton.addEventListener('click', () => {
    console.log("Gemini MCP Client [DEBUG]: Dummy prompt button clicked.");
    const dummyMessage = "Test message from MCP Client: Describe the process of photosynthesis.";

    injectAndSendMessage(dummyMessage, false)
      .then(success => {
        if (success) {
          console.log("Gemini MCP Client [DEBUG]: Dummy prompt successfully injected and sent via injectAndSendMessage.");
        }
      })
      .catch(error => {
        console.error("Gemini MCP Client [ERROR]: Error sending dummy prompt via injectAndSendMessage:", error.message);
        console.warn("Gemini MCP Client: No clickable send button found after trying all selectors. Dummy prompt injected but not submitted.");
      });
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
// This function is primarily for tool results, not directly used by the dummy prompt.
function handleNativeHostResponse(message) {
  if (message.type === "FROM_NATIVE_HOST" && message.payload) {
    console.log("Gemini MCP Client [DEBUG]: Received message from native host for potential injection:", message.payload);
    if (message.payload.text_response) {
        // If there's a text_response, inject it using the new function.
        // The 'isToolResult = true' is a placeholder for future differentiation if needed.
        injectAndSendMessage(message.payload.text_response, true)
            .then(success => {
                if (success) {
                    console.log("Gemini MCP Client [DEBUG]: Successfully injected and sent native host response via injectAndSendMessage.");
                }
            })
            .catch(error => {
                console.error("Gemini MCP Client [ERROR]: Error injecting native host response via injectAndSendMessage:", error.message);
            });
    } else {
        console.warn("Gemini MCP Client [DEBUG]: No text_response found in message from native host.", message.payload);
    }
  }
}

// Listen for messages from the background script
browser.runtime.onMessage.addListener(handleNativeHostResponse);

// Targeted Light DOM Tool Call Detection and Processing
function processLightDOMMutations(mutationsList, _observer) {
    if (!isMcpClientEnabled) return;

    mutationsList.forEach(mutation => {
        // console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Mutation type:", mutation.type); // Keep for general info

        const processCodeElement = (codeElement, source) => {
            if (codeElement.dataset.mcpProcessed === 'true') {
                return;
            }
            console.log(`Gemini MCP Client [DEBUG-LIGHT-DOM]: Found candidate <code.code-container.formatted> element (from ${source}).`);
            console.log("[DEBUG-LIGHT-DOM]: Candidate <code> element textContent:", codeElement.textContent);

            if (codeElement.textContent && codeElement.textContent.includes("function_calls")) { // Condition updated
                console.warn(`Gemini MCP Client [DEBUG-LIGHT-DOM]: !!! <function_calls> FOUND in textContent of <code.code-container.formatted> (from ${source}) !!!`);

                let raw_xml = codeElement.textContent.trim();
                if (!raw_xml.startsWith("<")) {
                    console.warn("[DEBUG-LIGHT-DOM]: Extracted textContent does not start with '<', might not be valid XML for tool call:", raw_xml.substring(0,100) + "...");
                }

                console.log("[DEBUG-LIGHT-DOM]: Sending to background:", { raw_xml: raw_xml, call_id: null });
                sendToolCallToBackground({ raw_xml: raw_xml, call_id: null }); // Re-enabled

                codeElement.dataset.mcpProcessed = 'true'; // Mark as processed
                console.log("[DEBUG-LIGHT-DOM]: Marked element as processed:", codeElement);
            }
        };

        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(addedNode => {
                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    if (addedNode.matches && addedNode.matches('code.code-container.formatted')) {
                        processCodeElement(addedNode, "addedNode directly");
                    }
                    const codeElements = addedNode.querySelectorAll('code.code-container.formatted');
                    codeElements.forEach(el => processCodeElement(el, "addedNode querySelectorAll"));
                }
            });
        } else if (mutation.type === 'characterData') {
            const targetElement = mutation.target.parentElement;
            if (targetElement && targetElement.matches && targetElement.matches('code.code-container.formatted')) {
                console.log("[DEBUG-LIGHT-DOM]: characterData mutation on relevant <code>; parent <code> textContent:", targetElement.textContent);
                // Check based on the whole textContent of the parent <code>
                if (targetElement.textContent && targetElement.textContent.includes("function_calls")) {
                     if (targetElement.dataset.mcpProcessed === 'true') { // Check before processing
                        // console.log("[DEBUG-LIGHT-DOM]: characterData change on already processed <code>, but re-evaluating as content changed.");
                        // Potentially allow re-processing if content significantly changes. For now, if it was processed, it means function_calls was found.
                        // To avoid re-sending for minor text changes after a tool call was found, we might need more sophisticated checks
                        // or rely on the call_id on the python side for deduplication.
                        // For now, if it contains function_calls, and hasn't been marked, process. If it has, it implies it was already sent.
                        // This simplified logic means if text changes AND still contains function_calls, it might re-trigger if not marked.
                        // The processCodeElement function now handles the mcpProcessed check.
                    }
                    processCodeElement(targetElement, "characterData parent");
                }
            }
        } else if (mutation.type === 'attributes') {
            const targetElement = mutation.target;
             if (targetElement && targetElement.matches && targetElement.matches('code.code-container.formatted')) {
                // console.log("[DEBUG-LIGHT-DOM]: attributes mutation on relevant <code>:", targetElement.outerHTML.substring(0, 300), "Attr:", mutation.attributeName);
                // Attribute changes are less likely to directly contain the tool call XML.
                // We will rely on the textContent check if this attribute change somehow reveals the text.
                // If the textContent now contains it, process.
                processCodeElement(targetElement, "attributes mutation target");
            }
        }
    });
}

// The observer will now use the Light DOM processing function.
const observerCallback = processLightDOMMutations;

const observerOptions = {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true
};


// Start and Stop observer functions
function startObserver() {
  if (!observer) {
      console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Creating new MutationObserver with options:", observerOptions);
      observer = new MutationObserver(observerCallback);
  }
  if (targetNode && isMcpClientEnabled) {
    try {
        observer.observe(targetNode, observerOptions);
        console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: MutationObserver started/restarted. Target:", targetNode, "Options:", observerOptions);
    } catch (e) {
        console.error("Gemini MCP Client [ERROR]: Error starting MutationObserver:", e);
        initializeTargetNodeAndObserver(true);
    }
  } else if (!targetNode) {
    console.error("Gemini MCP Client [ERROR]: Target node not available for observer. Attempting to re-initialize.");
    initializeTargetNodeAndObserver(true);
  }
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: MutationObserver stopped.");
  }
}

// Function to initialize targetNode and start observer
function initializeTargetNodeAndObserver(forceStart = false) {
    console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Observer targetNode set to document.body for targeted light DOM debugging.");
    targetNode = document.body;

    if (targetNode) {
        if (isMcpClientEnabled || forceStart) {
            startObserver();
        }
    } else {
        console.error("Gemini MCP Client [ERROR]: Target node for MutationObserver could not be set (even to document.body).");
     }
 }

 // Initial setup
 setupUI(); // Create and inject UI elements

 // Initialize and start the observer after UI is ready and DOM might be more stable
 setTimeout(() => {
     initializeTargetNodeAndObserver(true); // Initialize and force start if enabled
 }, 1000);
```
