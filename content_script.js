console.log("Gemini MCP Client content script loaded. Version 2.0");

// Global variable to track client state
let isMcpClientEnabled = true;
let observer = null; // Will be initialized later
let targetNode = null; // Will be set later

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

// Function to send tool call to background script
function sendToolCallToBackground(toolCallData) {
  console.log("Gemini MCP Client [TOOL-DETECT]: Sending to background:", toolCallData);
  browser.runtime.sendMessage({ // This line is now active
    type: "TOOL_CALL_DETECTED",
    payload: toolCallData
  }).then(response => {
    // console.log("Response from background script:", response);
  }).catch(error => {
    console.error("Error sending message to background script:", error);
  });
}

// Helper function to process a found <code> element for tool calls
function handleFoundCodeElement(codeElement, sourceType) {
    if (!codeElement || codeElement.dataset.mcpProcessed === 'true') {
        // console.log(`[TOOL-DETECT]: Skipping already processed <code> element from ${sourceType} or invalid element.`);
        return;
    }
    // Add the new console log here
    console.log("Gemini MCP Client [DEBUG]: handleFoundCodeElement triggered. Source: " + sourceType, codeElement);

    console.log(`Gemini MCP Client [TOOL-DETECT]: Candidate <code> element found by selectors. Class: ${codeElement.className}, ID: ${codeElement.id}, Source: ${sourceType}`);
    const rawXml = codeElement.textContent ? codeElement.textContent.trim() : "";

    // The check for "function_calls" will now be done by the native host.
    // We unconditionally send the content for further inspection.

    console.log(`Gemini MCP Client [TOOL-DETECT]: Extracted rawXml (sample): ${rawXml.substring(0, 200)}...`);
    console.log("[TOOL-DETECT]: Sending content of <code> element to native host for inspection and potential tool call execution.");

    // It's still possible the rawXml might not be structured as expected (e.g. not starting with '<'),
    // but the native host will handle that.
    // We can still log a warning if it's obviously not XML-like, as a local debug hint.
    if (!rawXml.startsWith("<") && rawXml.length > 0) { // Added length check to avoid warning for empty textContent
        console.warn(`Gemini MCP Client [TOOL-DETECT]: contentScript notices textContent does not start with '<'. Native host will make final determination. Content (sample): ${rawXml.substring(0,100)}...`);
    }

    let extractedCallId = null;
    if (codeElement.dataset.callId) {
        extractedCallId = codeElement.dataset.callId;
        console.log(`Gemini MCP Client [TOOL-DETECT]: Found call_id on element: ${extractedCallId}`);
    } else if (codeElement.parentElement && codeElement.parentElement.dataset.callId) {
        extractedCallId = codeElement.parentElement.dataset.callId;
        console.log(`Gemini MCP Client [TOOL-DETECT]: Found call_id on parentElement: ${extractedCallId}`);
    } else {
        console.log(`Gemini MCP Client [TOOL-DETECT]: No call_id found on element or its parent. Sending null call_id.`);
    }

    sendToolCallToBackground({ raw_xml: rawXml, call_id: extractedCallId });

    codeElement.dataset.mcpProcessed = 'true';
    codeElement.style.display = 'none'; // Hide the original code element

    // Create and display the horizontal bar
    const toolCallBar = document.createElement('div');
    toolCallBar.classList.add('mcp-tool-call-bar');
    // toolCallBar.style.position = 'relative'; // This will be handled by class mcp-tool-call-bar

    const displayCallId = extractedCallId || 'N/A';

    // Create text part of the bar (for toggling code)
    const toolCallBarText = document.createElement('span');
    toolCallBarText.classList.add('mcp-tool-call-bar-text');
    toolCallBarText.textContent = `Tool Call ID: ${displayCallId}`;
    // toolCallBarText.style.flexGrow = '1'; // Handled by class
    // toolCallBarText.style.cursor = 'pointer'; // Handled by class

    // Create arrow icon for dropdown menu
    const toolCallBarArrow = document.createElement('span');
    toolCallBarArrow.classList.add('mcp-tool-call-bar-arrow');
    toolCallBarArrow.innerHTML = '▼'; // Down arrow U+25BC

    toolCallBar.appendChild(toolCallBarText);
    toolCallBar.appendChild(toolCallBarArrow);

    // Create Dropdown Menu
    const dropdownMenu = document.createElement('div');
    dropdownMenu.classList.add('mcp-dropdown-menu'); // Already added, but ensure it's the primary way
    dropdownMenu.style.display = 'none'; // Dynamic, remains inline
    // Static positioning like top/right will be in CSS if truly static, or remain inline if calculated/simple.
    // For now, keeping top/right inline as it's simple and tied to parent.
    dropdownMenu.style.top = '100%';
    dropdownMenu.style.right = '0';
    // Other styles like zIndex, minWidth, bg, border, padding will be in CSS.

    // "Reprocess" Menu Item
    const reprocessItem = document.createElement('div');
    reprocessItem.classList.add('mcp-dropdown-item', 'mcp-dropdown-item-disabled');
    reprocessItem.textContent = 'Reprocess';
    // All styling for reprocessItem (padding, cursor, opacity) will be handled by CSS classes.

    // Remove JS-based hover effects for reprocessItem, will be handled by CSS
    // reprocessItem.addEventListener('mouseenter', ...);
    // reprocessItem.addEventListener('mouseleave', ...);

    dropdownMenu.appendChild(reprocessItem);
    toolCallBar.appendChild(dropdownMenu);

    // Store references for the click listener on the wrapper/codeElement toggle
    let effectiveTargetElement = null; // This will be 'wrapper' or 'codeElement'
    let isCodeCurrentlyHidden = true; // Initial state

    // Insert the bar logic (slightly adjusted)
    const parentElement = codeElement.parentElement;
    // More robust check for known wrapper selectors
    const knownWrapperSelectors = [
        '.output-component', // Gemini specific
        '.tool-code-block',  // Common class for tool blocks
        '.code-block-container', // Another common one
        'div.scrollable-code-block > div.code-block' // More specific Gemini structure
    ];
    let wrapper = null;
    for (const selector of knownWrapperSelectors) {
        const closestWrapper = codeElement.closest(selector);
        if (closestWrapper) {
            let currentElement = codeElement;
            while(currentElement && currentElement !== document.body) {
                if (currentElement.parentElement === closestWrapper) {
                    wrapper = closestWrapper;
                    break;
                }
                currentElement = currentElement.parentElement;
            }
            if (wrapper) break;
        }
    }

    if (wrapper) {
        console.log(`Gemini MCP Client [UI-UPDATE]: Found wrapper for code element:`, wrapper);
        wrapper.parentNode.insertBefore(toolCallBar, wrapper);
        wrapper.style.display = 'none';
        effectiveTargetElement = wrapper;
    } else {
        console.log(`Gemini MCP Client [UI-UPDATE]: No specific wrapper found. Inserting bar before code element.`);
        parentElement.insertBefore(toolCallBar, codeElement);
        // codeElement is already hidden by: codeElement.style.display = 'none';
        effectiveTargetElement = codeElement;
    }

    isCodeCurrentlyHidden = effectiveTargetElement.style.display === 'none';


    isCodeCurrentlyHidden = effectiveTargetElement.style.display === 'none';

    // Event Listener for Toggling Code Visibility (on text part)
    // Defined here, after effectiveTargetElement is known.
    toolCallBarText.addEventListener('click', () => {
        const isHidden = effectiveTargetElement.style.display === 'none';
        effectiveTargetElement.style.display = isHidden ? '' : 'none';
        // If you want to change the main text area's arrow or something upon code toggle:
        // e.g., toolCallBarText.parentElement.querySelector('.some-indicator-on-text').innerHTML = isHidden ? 'Hide Code' : 'Show Code';
    });

    // Event Listener for Toggling Dropdown Menu (on arrow icon)
    // Defined here, inside handleFoundCodeElement, using local variables.
    toolCallBarArrow.addEventListener('click', (event) => {
        event.stopPropagation(); // Important: Prevents the document click listener from immediately closing the menu.
                                 // Also prevents code toggle if arrow is considered part of toolCallBarText's parent for event bubbling.
        const isActive = dropdownMenu.classList.contains('mcp-active');

        // First, close all other active dropdowns
        document.querySelectorAll('.mcp-dropdown-menu.mcp-active').forEach(otherDropdown => {
            if (otherDropdown !== dropdownMenu) { // Don't close the current one yet
                otherDropdown.style.display = 'none';
                otherDropdown.classList.remove('mcp-active');
                // Optionally reset arrow for other dropdowns
                const otherArrow = otherDropdown.closest('.mcp-tool-call-bar')?.querySelector('.mcp-tool-call-bar-arrow');
                if (otherArrow) {
                    // otherArrow.innerHTML = '▼'; // Reset if you have stateful arrows
                }
            }
        });

        if (isActive) {
            dropdownMenu.style.display = 'none';
            dropdownMenu.classList.remove('mcp-active');
            // toolCallBarArrow.innerHTML = '▼'; // Change arrow back if stateful
        } else {
            dropdownMenu.style.display = 'block';
            dropdownMenu.classList.add('mcp-active');
            // toolCallBarArrow.innerHTML = '▶'; // Change arrow to indicate open if stateful
        }
    });

    console.log(`Gemini MCP Client [TOOL-DETECT]: Marked <code> element as processed, hid original, and inserted tool call bar with dropdown. Class: ${codeElement.className}, ID: ${codeElement.id}`);
}

// Close dropdown if clicked outside - This remains a global listener.
document.addEventListener('click', function(event) {
    const openDropdowns = document.querySelectorAll('.mcp-dropdown-menu.mcp-active');
    openDropdowns.forEach(dropdown => {
        const owningBar = dropdown.closest('.mcp-tool-call-bar');
        // If the click is outside the owning bar of this specific active dropdown, close it.
        if (owningBar && !owningBar.contains(event.target)) {
            dropdown.style.display = 'none';
            dropdown.classList.remove('mcp-active');
            // Optionally reset arrow for this dropdown
            const arrow = owningBar.querySelector('.mcp-tool-call-bar-arrow');
            if (arrow) {
                // arrow.innerHTML = '▼'; // Reset if you have stateful arrows
            }
        }
    });
});

// Function to handle responses from the background script (coming from native host or for prompts)
function handleBackgroundMessages(message) {
  console.log("Gemini MCP Client [DEBUG]: Received message from background script:", message);
  if (message.type === "FROM_NATIVE_HOST" && message.payload && message.payload.text_response) {
    console.log("Gemini MCP Client [DEBUG]: Received text_response from native host for injection:", message.payload.text_response);
    injectAndSendMessage(message.payload.text_response, true) // isToolResult is true for native host responses
        .then(success => {
            if (success) {
                console.log("Gemini MCP Client [DEBUG]: Successfully injected and sent native host response via injectAndSendMessage.");
            }
        })
        .catch(error => {
            console.error("Gemini MCP Client [ERROR]: Error injecting native host response via injectAndSendMessage:", error.message);
        });
  } else if (message.type === "PROMPT_FROM_NATIVE_HOST" && message.payload && message.payload.prompt) {
    console.log("Gemini MCP Client [DEBUG]: PROMPT_FROM_NATIVE_HOST received in content_script:", message); // Added per requirement
    const promptToInject = message.payload.prompt;
    console.log("Gemini MCP Client [DEBUG]: Extracted prompt:", promptToInject); // Confirming extraction
    console.log("Gemini MCP Client [DEBUG]: About to call injectAndSendMessage with prompt:", promptToInject); // Added per requirement
    try {
      injectAndSendMessage(promptToInject, false) // isToolResult is false for prompts
          .then(success => {
              if (success) {
                  console.log("Gemini MCP Client [DEBUG]: Successfully injected and sent prompt from native host via injectAndSendMessage.");
              }
          })
          .catch(error => {
              // This catches errors from the promise returned by injectAndSendMessage (e.g., async errors, rejections)
              console.error("Gemini MCP Client [ERROR]: Error injecting prompt from native host via injectAndSendMessage (async):", error.message, error);
          });
    } catch (e) {
      // This catches synchronous errors that might occur when injectAndSendMessage is called, before a promise is returned.
      console.error("Gemini MCP Client [CONTENT_SCRIPT_ERROR]: Synchronous error during injectAndSendMessage call for prompt:", e, e.message, e.stack);
    }
  } else if (message.type === "FROM_NATIVE_HOST") {
    console.warn("Gemini MCP Client [DEBUG]: Received FROM_NATIVE_HOST message but no text_response found.", message.payload);
  } else if (message.type === "PROMPT_FROM_NATIVE_HOST") {
    console.warn("Gemini MCP Client [DEBUG]: Received PROMPT_FROM_NATIVE_HOST message but no prompt found.", message.payload);
  }
}

// Function to create and inject UI elements
function setupUI() {
  injectStyles(); // Call the function to inject CSS styles

  const uiContainer = document.createElement('div');
  uiContainer.id = 'mcp-client-ui-container';
  // Most of uiContainer styles can also be moved to CSS if it gets its own class
  uiContainer.style.position = 'fixed';
  uiContainer.style.top = '10px';
  uiContainer.style.right = '10px';
  uiContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
  uiContainer.style.padding = '10px';
  uiContainer.style.border = '1px solid #ccc';
  uiContainer.style.borderRadius = '5px';
  uiContainer.style.zIndex = '9999'; // Keep z-index high
  uiContainer.style.fontFamily = 'Arial, sans-serif';
  uiContainer.style.fontSize = '14px';
  uiContainer.style.color = '#333';

  // Toggle Switch
  const toggleLabel = document.createElement('label');
  toggleLabel.htmlFor = 'mcp-client-toggle';
  toggleLabel.textContent = 'Enable MCP Client: ';
  toggleLabel.style.marginRight = '5px'; // Simple style, can remain inline

  const toggleSwitch = document.createElement('input');
  toggleSwitch.type = 'checkbox';
  toggleSwitch.id = 'mcp-client-toggle';
  toggleSwitch.checked = isMcpClientEnabled;
  toggleSwitch.style.verticalAlign = 'middle'; // Simple style, can remain inline

  toggleSwitch.addEventListener('change', () => {
    isMcpClientEnabled = toggleSwitch.checked;
    console.log(`Gemini MCP Client ${isMcpClientEnabled ? 'enabled' : 'disabled'}`);
    if (isMcpClientEnabled) {
      startObserver(); // Depends on startObserver being defined
    } else {
      stopObserver(); // Depends on stopObserver being defined
    }
  });

  // Dummy Prompt Button
  const dummyPromptButton = document.createElement('button');
  dummyPromptButton.id = 'mcp-inject-dummy-prompt';
  dummyPromptButton.textContent = 'Inject Prompt'; // Changed textContent
  dummyPromptButton.style.marginTop = '10px';
  dummyPromptButton.style.display = 'block';
  dummyPromptButton.style.padding = '5px 10px';
  dummyPromptButton.style.border = '1px solid #007bff';
  dummyPromptButton.style.backgroundColor = '#007bff';
  dummyPromptButton.style.color = 'white';
  dummyPromptButton.style.borderRadius = '3px';
  dummyPromptButton.style.cursor = 'pointer';

  dummyPromptButton.addEventListener('click', () => {
    console.log("Gemini MCP Client [DEBUG]: Inject prompt button clicked. Requesting prompt from background script.");
    // Send message to background script to request a prompt
    chrome.runtime.sendMessage({ type: "GET_PROMPT" }) // chrome namespace here, browser for listener. Keep as is.
      .then(response => {
        console.log("Gemini MCP Client [DEBUG]: Response from background script for GET_PROMPT:", response);
      })
      .catch(error => {
        console.error("Gemini MCP Client [ERROR]: Error sending GET_PROMPT message to background script:", error);
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

// Style injection function
let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;

    const css = `
        .mcp-tool-call-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 10px;
            margin: 8px 0;
            background-color: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-family: "SF Mono", "Consolas", "Menlo", monospace;
            font-size: 13px;
            color: #333;
            position: relative; /* For dropdown positioning */
        }
        .mcp-tool-call-bar-text {
            cursor: pointer;
            flex-grow: 1;
            color: #222; /* Darker text for better readability */
        }
        .mcp-tool-call-bar-text:hover {
            color: #000;
        }
        .mcp-tool-call-bar-arrow {
            cursor: pointer;
            margin-left: 10px;
            font-size: 12px; /* Slightly larger for easier clicking */
            padding: 3px 6px; /* More clickable area */
            border-radius: 3px;
            user-select: none; /* Prevent text selection */
            transition: background-color 0.2s ease-in-out;
        }
        .mcp-tool-call-bar-arrow:hover {
            background-color: #e0e0e0;
        }
        .mcp-dropdown-menu {
            /* display: none; is set inline */
            position: absolute;
            /* top: 100%; right: 0; are set inline */
            background-color: #ffffff;
            border: 1px solid #b0b0b0; /* Slightly softer border */
            border-radius: 4px;
            min-width: 160px; /* Increased min-width */
            z-index: 10000; /* Ensure it's on top */
            box-shadow: 0 3px 6px rgba(0,0,0,0.12); /* Softer shadow */
            padding: 5px 0; /* Vertical padding for the menu itself */
        }
        .mcp-dropdown-item {
            padding: 9px 15px; /* More padding for items */
            font-size: 13px;
            color: #333;
            cursor: pointer;
            display: block; /* Ensure it takes full width */
            transition: background-color 0.15s ease-in-out;
        }
        .mcp-dropdown-item:hover {
            background-color: #f5f5f5; /* Standard hover for active items */
        }
        .mcp-dropdown-item-disabled {
            color: #999999; /* Lighter text for disabled */
            opacity: 0.7; /* Slightly more visible disabled state */
            cursor: not-allowed;
        }
        .mcp-dropdown-item-disabled:hover {
            background-color: transparent !important; /* Important to override general hover */
        }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.id = "mcp-client-styles"; // ID to check if already injected
    styleSheet.textContent = css;
    document.head.appendChild(styleSheet);
    stylesInjected = true;
    console.log("Gemini MCP Client: Custom styles injected.");
}

// --- MutationObserver Related Functions ---

// Final MutationObserver callback for processing tool calls
function finalProcessMutations(mutationsList, _observer) {
    if (!isMcpClientEnabled) return;

    mutationsList.forEach(mutation => {
        // console.log("Gemini MCP Client [TOOL-DETECT]: Mutation type:", mutation.type); // Keep this commented unless very detailed debugging is needed

        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(addedNode => {
                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    // Define the processing for an added node (can be a helper)
                    const processAddedNode = (node) => {
                        // Check if the node itself is a target <code> element
                        if (node.matches && (node.matches('code.code-container.formatted') || node.matches('code[class*="code-container"][class*="formatted"]'))) {
                            // Check if it's within a .model-response-text if that's a required parent
                             if (node.closest('.model-response-text')) {
                                handleFoundCodeElement(node, "addedNode directly matching <code> and in .model-response-text");
                             } else {
                                // console.log("[TOOL-DETECT]: Found matching <code> but not within .model-response-text:", node);
                             }
                        }
                        // Find all relevant <code> elements within the added node's descendants
                        const codeElements = node.querySelectorAll('code.code-container.formatted, code[class*="code-container"][class*="formatted"]');
                        codeElements.forEach(codeEl => {
                            // Ensure this code element is within a .model-response-text context
                            if (codeEl.closest('.model-response-text')) {
                                handleFoundCodeElement(codeEl, "childList querySelectorAll in .model-response-text");
                            } else {
                                // console.log("[TOOL-DETECT]: Found matching <code> via querySelectorAll, but not within .model-response-text:", codeEl);
                            }
                        });
                    };
                    processAddedNode(addedNode);
                }
            });
        }
        // CharacterData handling is removed as per plan focus on childList and subtree for structural additions
        // else if (mutation.type === 'characterData') {
        // ...
        // }
    });
}

const observerCallback = finalProcessMutations;

const observerOptions = {
  childList: true,
  subtree: true,
  characterData: false, // As per plan, focus on structural changes
  attributes: false
};

// Start and Stop observer functions
function startObserver() {
  if (!observer) {
      console.log("Gemini MCP Client [TOOL-DETECT]: Creating new MutationObserver with options:", observerOptions);
      observer = new MutationObserver(observerCallback);
  }
  if (targetNode && isMcpClientEnabled) {
    try {
        observer.observe(targetNode, observerOptions);
        console.log("Gemini MCP Client [TOOL-DETECT]: MutationObserver started/restarted. Target:", targetNode, "Options:", observerOptions);
    } catch (e) {
        console.error("Gemini MCP Client [ERROR]: Error starting MutationObserver:", e);
        initializeTargetNodeAndObserver(true); // Depends on initializeTargetNodeAndObserver
    }
  } else if (!targetNode) {
    console.error("Gemini MCP Client [ERROR]: Target node not available for observer. Attempting to re-initialize.");
    initializeTargetNodeAndObserver(true); // Depends on initializeTargetNodeAndObserver
  }
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    console.log("Gemini MCP Client [TOOL-DETECT]: MutationObserver stopped.");
  }
}

// Function to initialize targetNode and start observer
function initializeTargetNodeAndObserver(forceStart = false) {
    const userSpecifiedSelector = '#chat-history';
    console.log(`Gemini MCP Client [TOOL-DETECT]: Attempting to set observer targetNode to user-specified selector: '${userSpecifiedSelector}'.`);
    let specificTarget = document.getElementById('chat-history');
    if (!specificTarget) {
        specificTarget = document.querySelector(userSpecifiedSelector);
    }

    if (specificTarget) {
        targetNode = specificTarget;
        console.log(`Gemini MCP Client [TOOL-DETECT]: Observer targetNode set to ${userSpecifiedSelector} (user identified).`);
    } else {
        console.warn(`Gemini MCP Client [TOOL-DETECT]: ${userSpecifiedSelector} (user identified) NOT FOUND. Falling back to document.body.`);
        targetNode = document.body;
    }

    if (targetNode) {
        if (isMcpClientEnabled || forceStart) {
            startObserver(); // Depends on startObserver
        }
    } else {
        console.error("Gemini MCP Client [ERROR]: Target node for MutationObserver could not be set (even to document.body).");
     }
 }

// --- Event Listeners and Initial Calls ---

// Listen for messages from the background script
browser.runtime.onMessage.addListener(handleBackgroundMessages); // handleBackgroundMessages must be defined

// Initial setup
setupUI(); // setupUI must be defined, and it calls startObserver/stopObserver

// Initialize and start the observer after UI is ready and DOM might be more stable
setTimeout(() => {
     initializeTargetNodeAndObserver(true); // initializeTargetNodeAndObserver must be defined
 }, 1000);
