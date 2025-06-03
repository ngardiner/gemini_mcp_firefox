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

        // console.log("Gemini MCP Client [DEBUG]: Starting polling for send button. Total timeout:", pollTimeout / 1000, "s. Interval:", pollInterval, "ms.");

        const intervalId = setInterval(() => {
            elapsedTime += pollInterval;
            let buttonClicked = false;

            for (const selector of allSelectors) {
                const button = document.querySelector(selector);
                if (button) {
                    if (!button.disabled && button.offsetParent !== null) {
                        button.click();
                        console.log(`Gemini MCP Client [DEBUG]: Send button clicked successfully via polling. Selector: '${selector}'.`);
                        clearInterval(intervalId);
                        buttonClicked = true;
                        resolve(true);
                        break;
                    }
                }
            }

            if (buttonClicked) return;

            if (elapsedTime >= pollTimeout) {
                console.error("Gemini MCP Client [ERROR]: Timeout: Send button did not become clickable after " + (pollTimeout / 1000) + " seconds.");
                clearInterval(intervalId);
                reject(new Error("Timeout: Send button did not become clickable."));
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
  // Using [TOOL-DEBUG-VERBOSE] for this phase, but this function is general.
  // For now, aligning with the current debug phase's prefix.
  console.log("[TOOL-DEBUG-VERBOSE]: Sending to background:", toolCallData);
  browser.runtime.sendMessage({
    type: "TOOL_CALL_DETECTED",
    payload: toolCallData
  }).then(response => {
    // console.log("Response from background script:", response);
  }).catch(error => {
    console.error("Error sending message to background script:", error);
  });
}

// Function to handle responses from the background script (coming from native host)
function handleNativeHostResponse(message) {
  if (message.type === "FROM_NATIVE_HOST" && message.payload) {
    console.log("Gemini MCP Client [DEBUG]: Received message from native host for potential injection:", message.payload);
    if (message.payload.text_response) {
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

// Helper function to process a found <code> element for tool calls (currently disabled for verbose logging)
/*
function handlePotentialToolCallElement(codeElement, sourceType) {
    if (!codeElement || codeElement.dataset.mcpProcessed === 'true') {
        return;
    }

    console.log(`Gemini MCP Client [TOOL-DETECT]: Found candidate <code> element (from ${sourceType}). outerHTML:`, codeElement.outerHTML.substring(0, 300) + "...");
    const rawXml = codeElement.textContent ? codeElement.textContent.trim() : "";
    console.log("[TOOL-DETECT]: Extracted textContent:", rawXml.substring(0, 300) + "...");

    if (rawXml.includes("function_calls")) {
        console.warn(`Gemini MCP Client [TOOL-DETECT]: !!! function_calls STRING FOUND in textContent !!! Source: ${sourceType}`);

        if (!rawXml.startsWith("<")) {
            console.warn("[TOOL-DETECT]: Extracted textContent does not start with '<', might not be valid XML for tool call:", rawXml.substring(0,100) + "...");
        }

        sendToolCallToBackground({ raw_xml: rawXml, call_id: null });

        codeElement.dataset.mcpProcessed = 'true';
        console.log("[TOOL-DETECT]: Marked <code> element as processed.");
    }
}
*/

// Main MutationObserver callback for VERBOSE tool call detection debugging
function verboseMutationLogger(mutationsList, _observer) {
    if (!isMcpClientEnabled) return;

    mutationsList.forEach(mutation => {
        console.log("[TOOL-DEBUG-VERBOSE]: Mutation type:", mutation.type);

        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node, index) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    console.log(`[TOOL-DEBUG-VERBOSE]: Added node [${index}]: ${node.nodeName}`, "outerHTML (truncated):", node.outerHTML ? node.outerHTML.substring(0, 500) : "N/A");
                } else {
                    console.log(`[TOOL-DEBUG-VERBOSE]: Added node [${index}]: ${node.nodeName}`, "nodeValue (truncated):", node.nodeValue ? node.nodeValue.substring(0, 200) : "N/A");
                }
            });
            mutation.removedNodes.forEach((node, index) => {
                 if (node.nodeType === Node.ELEMENT_NODE) {
                    console.log(`[TOOL-DEBUG-VERBOSE]: Removed node [${index}]: ${node.nodeName}`, "outerHTML (truncated):", node.outerHTML ? node.outerHTML.substring(0, 500) : "N/A");
                } else {
                    console.log(`[TOOL-DEBUG-VERBOSE]: Removed node [${index}]: ${node.nodeName}`, "nodeValue (truncated):", node.nodeValue ? node.nodeValue.substring(0, 200) : "N/A");
                }
            });
        } else if (mutation.type === 'characterData') {
            console.log("[TOOL-DEBUG-VERBOSE]: CharacterData change. Target nodeName:", mutation.target.nodeName);
            if (mutation.target.parentElement) {
                console.log("[TOOL-DEBUG-VERBOSE]:   Parent of text node outerHTML (truncated):", mutation.target.parentElement.outerHTML ? mutation.target.parentElement.outerHTML.substring(0, 500) : "N/A");
            } else {
                console.log("[TOOL-DEBUG-VERBOSE]:   Parent of text node: N/A");
            }
            console.log("[TOOL-DEBUG-VERBOSE]:   New text value (sample):", mutation.target.nodeValue ? mutation.target.nodeValue.substring(0, 200) : "N/A");
        }
        // Attributes logging can be added here if observerOptions.attributes is true
        // else if (mutation.type === 'attributes') {
        //     console.log(`[TOOL-DEBUG-VERBOSE]: Attribute mutation: ${mutation.attributeName} on ${mutation.target.nodeName}. Target outerHTML:`, mutation.target.outerHTML ? mutation.target.outerHTML.substring(0,500) : "N/A");
        // }
    });
    // Specific logic for .model-response-text and code.code-container.formatted is TEMPORARILY DISABLED
    // by commenting out the call to handlePotentialToolCallElement or similar processing.
}

const observerCallback = verboseMutationLogger;

const observerOptions = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: false // As per plan, keep false to reduce noise for this phase
};

// Start and Stop observer functions
function startObserver() {
  if (!observer) {
      console.log("Gemini MCP Client [TOOL-DEBUG-VERBOSE]: Creating new MutationObserver with options:", observerOptions);
      observer = new MutationObserver(observerCallback);
  }
  if (targetNode && isMcpClientEnabled) {
    try {
        observer.observe(targetNode, observerOptions);
        console.log("Gemini MCP Client [TOOL-DEBUG-VERBOSE]: MutationObserver started/restarted. Target:", targetNode, "Options:", observerOptions);
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
    console.log("Gemini MCP Client [TOOL-DEBUG-VERBOSE]: MutationObserver stopped.");
  }
}

// Function to initialize targetNode and start observer
function initializeTargetNodeAndObserver(forceStart = false) {
    const specificTargetSelector = '.chat-history';
    // Ensure logs use the current debugging prefix
    console.log(`Gemini MCP Client [TOOL-DEBUG-VERBOSE]: Attempting to set observer targetNode to '${specificTargetSelector}'.`);
    const specificTarget = document.querySelector(specificTargetSelector);
    if (specificTarget) {
        targetNode = specificTarget;
        console.log(`Gemini MCP Client [TOOL-DEBUG-VERBOSE]: Observer targetNode set to '${specificTargetSelector}'.`);
    } else {
        console.warn(`Gemini MCP Client [TOOL-DEBUG-VERBOSE]: '${specificTargetSelector}' not found. Falling back to document.body for observer targetNode.`);
        targetNode = document.body;
    }
    // console.log("Gemini MCP Client [TOOL-DEBUG-VERBOSE]: Final targetNode for MutationObserver:", targetNode); // Slightly redundant


    if (targetNode) {
        if (isMcpClientEnabled || forceStart) {
            startObserver();
        }
    } else {
        // This case should ideally not be reached if document.body is the ultimate fallback
        console.error("Gemini MCP Client [ERROR]: Target node for MutationObserver could not be set (even to document.body).");
     }
 }

 // Initial setup
 setupUI(); // Create and inject UI elements

 // Initialize and start the observer after UI is ready and DOM might be more stable
 setTimeout(() => {
     initializeTargetNodeAndObserver(true);
 }, 1000);
