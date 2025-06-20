// console.log("Gemini MCP Client content script loaded. Version 2.0");

// Global variable to track client state
let isMcpClientEnabled = true;
let observer = null; // Will be initialized later
let targetNode = null; // Will be set later

// Helper function to escape HTML characters
function escapeHTML(str) {
    if (str === null || str === undefined) {
        return '';
    }
    return str.replace(/[&<>"']/g, function (match) {
        switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return match;
        }
    });
}

// Function to unescape HTML entities (should be defined before first use)
function unescapeHtmlEntities(htmlStringWithEntities) {
    if (typeof htmlStringWithEntities !== 'string') return '';
    const doc = new DOMParser().parseFromString(htmlStringWithEntities, 'text/html');
    return doc.documentElement.textContent;
}

// Function to inject text and send the message using polling for the send button
async function injectAndSendMessage(textToInject, isToolResult = false) {
    // console.log(`Gemini MCP Client [DEBUG]: injectAndSendMessage called. isToolResult: ${isToolResult}, text: "${textToInject.substring(0, 50)}..."`);

    const chatInputSelector = 'div.ql-editor.textarea.new-input-ui p';
    // console.log("Gemini MCP Client [DEBUG]: Attempting to find chat input with selector:", chatInputSelector);
    const chatInputField = document.querySelector(chatInputSelector);

    if (!chatInputField) {
        console.error("Gemini MCP Client [ERROR]: Chat input field not found with selector:", chatInputSelector, "for injectAndSendMessage.");
        return Promise.reject("Chat input field not found.");
    }
    // console.log("Gemini MCP Client [DEBUG]: Found chat input field for injection:", chatInputField);

    if (isToolResult) {
        // For tool results (raw XML), inject as textContent directly.
        // No HTML wrapping or escaping, as it's raw XML to be sent.
        chatInputField.textContent = textToInject;
        // console.log("Gemini MCP Client [DEBUG]: Injecting raw XML for tool result into input field.");
    } else {
        // For prompts (plain text), inject as textContent
        chatInputField.textContent = textToInject;
        // console.log("Gemini MCP Client [DEBUG]: Injected plain text for prompt.");
    }

    // Dispatch events (common for both cases)
    chatInputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    chatInputField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    // console.log("Gemini MCP Client [DEBUG]: Text injected and input/change events dispatched.");

    // Conditional return for isToolResult has been removed.
    // Proceed to send button polling for both prompts and tool results.

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
                        // console.log(`Gemini MCP Client [DEBUG]: Send button clicked successfully via polling. Selector: '${selector}'.`);
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
  // console.log("Gemini MCP Client [TOOL-DETECT]: Sending to background:", toolCallData);
  browser.runtime.sendMessage({ // This line is now active
    type: "TOOL_CALL_DETECTED",
    payload: toolCallData
  }).then(response => {
    // console.log("Response from background script:", response);
  }).catch(error => {
    console.error("Error sending message to background script:", error);
  });
}

function processPotentialMessageContainer(containerElement) {
    if (!containerElement || containerElement.dataset.mcpProcessed === 'true') {
        // console.log("Gemini MCP Client [DEBUG]: Skipping already processed message container or invalid element:", containerElement);
        return;
    }

    // Log when this specific processor is entered
    // console.log("Gemini MCP Client [DEBUG]: processPotentialMessageContainer triggered for:", containerElement);

    const lineElements = containerElement.querySelectorAll('p.query-text-line');
    if (lineElements.length === 0) {
        // console.log("Gemini MCP Client [DEBUG]: No 'p.query-text-line' children found in container:", containerElement);
        return;
    }

    let reconstructedXml = "";
    lineElements.forEach(line => {
        reconstructedXml += line.textContent; // Add newlines if they were stripped and are needed for parsing/matching
    });

    reconstructedXml = reconstructedXml.trim(); // Trim whitespace

    // Use the new unescapeHtmlEntities function
    const unescapedXml = unescapeHtmlEntities(reconstructedXml);

    // console.log("Gemini MCP Client [DEBUG]: Reconstructed and Unescaped XML from message container:", unescapedXml.substring(0, 200) + "...");

    // Check if it's a tool result, using trim() on the unescaped XML
    if (unescapedXml.trim().startsWith("<tool_result") && unescapedXml.trim().endsWith("</tool_result>")) {
        // console.log("Gemini MCP Client [DEBUG]: Identified tool result in message container:", containerElement);
        // Mark the container as processed by this specific path to avoid re-entry from other observers if any overlap
        // containerElement.dataset.mcpProcessed = 'true'; // This is handled by handleFoundCodeElement on the passedElement

        // Call handleFoundCodeElement, passing the container as the element to be replaced,
        // and the reconstructed/unescaped XML.
        // The 'sourceType' can indicate this new path.
        // handleFoundCodeElement will need to be adapted to take this reconstructed XML.
        handleFoundCodeElement(containerElement, "messageContainerResult", true, unescapedXml);
    } else {
        // console.log("Gemini MCP Client [DEBUG]: Reconstructed XML did not match tool_result structure:", unescapedXml.substring(0,100));
    }
}

// Helper function to process a found <code> element or a message container
function handleFoundCodeElement(passedElement, sourceType, isResultBlockFromCaller, explicitXml) {
    if (!passedElement || passedElement.dataset.mcpProcessed === 'true') {
        // If it's a container, its direct mcpProcessed might not be set,
        // but if it's a codeElement, this check is valid.
        // The caller (processPotentialMessageContainer) also checks its own mcpProcessed for containers.
        return;
    }
    // For code elements, this prevents re-processing if found by multiple querySelectors.
    // For containers, processPotentialMessageContainer sets this if it calls this function.
    // However, if handleFoundCodeElement is called directly with a container (not typical), this line is important.
    passedElement.dataset.mcpProcessed = 'true';


    let isResultBlock = !!isResultBlockFromCaller; // Ensure boolean
    let actualXml = explicitXml;
    let codeContentElement = null; // This will be the <code> element for function calls, or null for results from container
    let isFunctionCall = false;
    let displayIdentifierText = "";
    let parsedCallId = null; // Can be from result XML or function call dataset/XML

    if (actualXml === null || actualXml === undefined) {
        // This path is taken for direct <code> element processing (likely outgoing function calls)
        codeContentElement = passedElement; // passedElement is assumed to be the <code> element
        actualXml = codeContentElement.textContent ? codeContentElement.textContent.trim() : "";

        if (actualXml.startsWith("<function_calls>") && actualXml.endsWith("</function_calls>")) {
            isFunctionCall = true;
            isResultBlock = false; // Explicitly not a result block
            // Try to get call_id from dataset
            if (codeContentElement.dataset.callId) {
                parsedCallId = codeContentElement.dataset.callId;
            } else if (codeContentElement.parentElement && codeContentElement.parentElement.dataset.callId) {
                parsedCallId = codeContentElement.parentElement.dataset.callId;
            }
            // Fallback: parse from actualXml for function calls if no dataset.
            if (!parsedCallId) {
                const match = actualXml.match(/<invoke[^>]*call_id=["'](.*?)["']/);
                if (match && match[1]) parsedCallId = match[1];
            }
            displayIdentifierText = `Tool Call ID: ${parsedCallId || 'N/A'}`;
        } else if (actualXml.startsWith("<tool_result") && actualXml.endsWith("</tool_result>")) {
            // This case (finding a tool_result directly in a code tag not from processPotentialMessageContainer)
            // means Gemini rendered it inside a single code block.
            isResultBlock = true;
            isFunctionCall = false;
            const match = actualXml.match(/<tool_result[^>]*call_id=["'](.*?)["']/);
            if (match && match[1]) parsedCallId = match[1];
            displayIdentifierText = parsedCallId ? `Tool Result ID: ${parsedCallId}` : "Tool Result";
        } else {
            // console.log("Gemini MCP Client [DEBUG]: Direct <code> element content does not match known structures. Skipping UI.", passedElement);
            // Unset mcpProcessed if we are not handling it, so other processors (if any) could try.
            // Or, if this is the final processor for this element, keep it set. For now, keep it.
            // delete passedElement.dataset.mcpProcessed;
            return;
        }
    } else { // explicitXml is provided (from processPotentialMessageContainer)
        if (isResultBlock) { // isResultBlockFromCaller was true
            // actualXml is already set from explicitXml
            const match = actualXml.match(/<tool_result[^>]*call_id=["'](.*?)["']/);
            if (match && match[1]) parsedCallId = match[1];
            displayIdentifierText = parsedCallId ? `Tool Result ID: ${parsedCallId}` : "Tool Result";
        } else {
            // This case (explicitXml provided, but isResultBlockFromCaller is false) is unexpected.
            // For safety, we can check if this explicitXml is a function call.
            if (actualXml.startsWith("<function_calls>") && actualXml.endsWith("</function_calls>")) {
                isFunctionCall = true;
                const match = actualXml.match(/<invoke[^>]*call_id=["'](.*?)["']/);
                if (match && match[1]) parsedCallId = match[1];
                displayIdentifierText = `Tool Call ID: ${parsedCallId || 'N/A'}`;
            } else {
                 // console.log("Gemini MCP Client [DEBUG]: explicitXml provided but not identified as result or function call. Skipping UI.", passedElement);
                 // delete passedElement.dataset.mcpProcessed;
                 return;
            }
        }
    }

    // console.log(`Gemini MCP Client [DEBUG]: handleFoundCodeElement determined type. Source: ${sourceType}, isResultBlock: ${isResultBlock}, isFunctionCall: ${isFunctionCall}, Call ID (parsed/extracted): ${parsedCallId}, XML starts with: ${actualXml.substring(0,70)}...`, passedElement);

    if (isFunctionCall) {
        sendToolCallToBackground({ raw_xml: actualXml, call_id: parsedCallId });
    }

    // --- Common UI Setup ---
    const toolCallBar = document.createElement('div');
    toolCallBar.classList.add('mcp-tool-call-bar');

    const toolCallBarText = document.createElement('span');
    toolCallBarText.classList.add('mcp-tool-call-bar-text');
    toolCallBarText.textContent = displayIdentifierText;

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
    // top and right positioning will be moved to CSS.
    // Other styles like zIndex, minWidth, bg, border, padding are already in CSS.

    // --- Menu Items ---
    // "Collapse" Menu Item (Common to both)
    const collapseItem = document.createElement('div');
    collapseItem.classList.add('mcp-dropdown-item');
    collapseItem.textContent = 'Collapse';
    collapseItem.addEventListener('click', (event) => {
        event.stopPropagation();
        if (effectiveTargetElement) {
            effectiveTargetElement.style.display = 'none';
        }
        dropdownMenu.style.display = 'none';
        dropdownMenu.classList.remove('mcp-active');
    });

    if (!isResultBlock) {
        // "Reprocess" Menu Item (Only for outgoing tool calls)
        const reprocessItem = document.createElement('div');
        reprocessItem.classList.add('mcp-dropdown-item', 'mcp-dropdown-item-disabled');
        reprocessItem.textContent = 'Reprocess';
        // Styling and disabled state are handled by CSS.
        // Add click listener if it were to be enabled later:
        // reprocessItem.addEventListener('click', (event) => { ... });
        dropdownMenu.appendChild(reprocessItem);
    }

    dropdownMenu.appendChild(collapseItem); // Collapse is always present, usually last.
    toolCallBar.appendChild(dropdownMenu);

    // Store references for the click listener on the wrapper/codeElement toggle
    let effectiveTargetElement = null; // This will be 'wrapper' or 'codeElement'
    let isCodeCurrentlyHidden = true; // Initial state
    let displayedResultContentElement = null; // For dynamically showing XML for tool results

    // Insert the bar logic (slightly adjusted)
    // const parentElement = passedElement.parentElement; // parentElement might not be relevant if passedElement is a container

    // DOM Manipulation
    if (isResultBlock) {
        // If explicitXml was provided, passedElement is the container (e.g., div.query-text)
        // If explicitXml was null, passedElement is a <code> tag containing tool_result.
        // In both cases, we want to replace/remove the container of the result.
        if (explicitXml) { // Called from processPotentialMessageContainer
            effectiveTargetElement = passedElement;
        } else { // Called with a <code> tag that contains a tool_result
            let messageContainer = passedElement.closest('.model-response-text'); // Common message wrapper
             if (!messageContainer) {
                const preElement = passedElement.parentElement; // Should be <pre>
                if (preElement && preElement.tagName === 'PRE') {
                    messageContainer = preElement.parentElement;
                } else {
                    messageContainer = preElement || passedElement.parentElement;
                }
            }
            effectiveTargetElement = messageContainer || passedElement.parentElement;
        }

        if (effectiveTargetElement && effectiveTargetElement.parentNode) {
            // console.log(`Gemini MCP Client [UI-UPDATE]: Tool Result. Replacing element:`, effectiveTargetElement);
            effectiveTargetElement.parentNode.insertBefore(toolCallBar, effectiveTargetElement);
            effectiveTargetElement.remove();
        } else {
            console.error("Gemini MCP Client [ERROR]: Could not replace Tool Result XML. ParentNode missing or effectiveTargetElement issue.", effectiveTargetElement);
            // Fallback: insert bar before passedElement (which could be code or container) and try to hide parent.
            if (passedElement.parentElement) {
                 passedElement.parentElement.insertBefore(toolCallBar, passedElement);
                 passedElement.style.display = 'none'; // Hide the direct element
                 if(passedElement.parentElement !== document.body) passedElement.parentElement.style.display = 'none'; // Try to hide parent too
                 effectiveTargetElement = passedElement.parentElement; // for collapse
            } else { // last resort
                document.body.appendChild(toolCallBar);
                passedElement.style.display = 'none';
                effectiveTargetElement = passedElement;
            }
        }
    } else if (isFunctionCall) {
        // This means codeContentElement should be defined (it's the <code> tag)
        const targetCodeElement = codeContentElement || passedElement; // Should be codeContentElement normally
        const parentEl = targetCodeElement.parentElement;
        const knownWrapperSelectors = [
            '.output-component', '.tool-code-block', '.code-block-container',
            'div.scrollable-code-block > div.code-block'
        ];
        let wrapper = null;
        for (const selector of knownWrapperSelectors) {
            const closestWrapper = targetCodeElement.closest(selector);
            if (closestWrapper) {
                let current = targetCodeElement;
                while (current && current !== document.body) {
                    if (current.parentElement === closestWrapper) {
                        wrapper = closestWrapper; break;
                    }
                    current = current.parentElement;
                }
                if (wrapper) break;
            }
        }

        effectiveTargetElement = wrapper || targetCodeElement;
        if (effectiveTargetElement.parentNode) {
            effectiveTargetElement.parentNode.insertBefore(toolCallBar, effectiveTargetElement);
        } else if (parentEl) { // Fallback to targetCodeElement's direct parent if wrapper logic fails weirdly
             parentEl.insertBefore(toolCallBar, effectiveTargetElement);
        } else {
            console.error("Gemini MCP Client [ERROR]: Parent node not found for function call effective target.", effectiveTargetElement);
            document.body.appendChild(toolCallBar); // Last resort
        }
        effectiveTargetElement.style.display = 'none';
    }
    // else: if neither, we already returned.

    // Click listener for the text part of the bar
    if (isFunctionCall && effectiveTargetElement) {
        // For function calls, the text toggles visibility of the original (now hidden) code/wrapper
        toolCallBarText.addEventListener('click', () => {
            if (effectiveTargetElement) {
                const isHidden = effectiveTargetElement.style.display === 'none';
                effectiveTargetElement.style.display = isHidden ? '' : 'none';
                // Consider updating arrow if you have one for code visibility state
            }
        });
    } else if (isResultBlock) {
        // For tool results, the original element is removed.
        // The text click could show the raw XML if we implement that.
        // For now, it's non-interactive.
        toolCallBarText.style.cursor = 'default';
    }

    // Common event listener for the dropdown arrow
    toolCallBarArrow.addEventListener('click', (event) => {
        event.stopPropagation();
        const isActive = dropdownMenu.classList.contains('mcp-active');

        // Close other active dropdowns
        document.querySelectorAll('.mcp-dropdown-menu.mcp-active').forEach(otherDropdown => {
            if (otherDropdown !== dropdownMenu) {
                otherDropdown.style.display = 'none';
                otherDropdown.classList.remove('mcp-active');
                // Also hide their associated dynamic XML view if they are tool results
                const otherBar = otherDropdown.closest('.mcp-tool-call-bar');
                if (otherBar && otherBar._displayedResultContentElement) { // Check if custom property exists
                    otherBar._displayedResultContentElement.style.display = 'none';
                }
            }
        });

        if (isActive) {
            dropdownMenu.style.display = 'none';
            dropdownMenu.classList.remove('mcp-active');
            if (isResultBlock && displayedResultContentElement) {
                displayedResultContentElement.style.display = 'none';
            }
        } else {
            // If it's a function call and its effectiveTargetElement is hidden, show it when menu opens.
            if (isFunctionCall && effectiveTargetElement && effectiveTargetElement.style.display === 'none') {
                effectiveTargetElement.style.display = '';
            } else if (isResultBlock) {
                if (!displayedResultContentElement || !displayedResultContentElement.parentNode) {
                    displayedResultContentElement = document.createElement('div');
                    displayedResultContentElement.classList.add('mcp-displayed-result-xml');
                    displayedResultContentElement.textContent = actualXml; // The full reconstructed XML
                    toolCallBar.parentNode.insertBefore(displayedResultContentElement, toolCallBar.nextSibling);
                    toolCallBar._displayedResultContentElement = displayedResultContentElement; // Associate with bar
                } else {
                    displayedResultContentElement.style.display = ''; // Or 'block'
                }
            }
            dropdownMenu.style.display = 'block';
            dropdownMenu.classList.add('mcp-active');
        }
    });

    // Collapse item listener needs to handle the 'effectiveTargetElement' and 'displayedResultContentElement'
    collapseItem.addEventListener('click', (event) => {
        event.stopPropagation();
        if (isFunctionCall && effectiveTargetElement) {
            effectiveTargetElement.style.display = 'none'; // Hide for function calls
        } else if (isResultBlock && displayedResultContentElement) {
            displayedResultContentElement.style.display = 'none'; // Hide dynamic XML view
        }
        dropdownMenu.style.display = 'none';
        dropdownMenu.classList.remove('mcp-active');
    });

    // console.log(`Gemini MCP Client [TOOL-DETECT]: Processed element and inserted UI bar. SourceType: ${sourceType}, isResultBlock: ${isResultBlock}, isFunctionCall: ${isFunctionCall}`);
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
  // console.log("Gemini MCP Client [DEBUG]: Received message from background script:", message);
  if (message.type === "FROM_NATIVE_HOST" && message.payload && message.payload.text_response) {
    // console.log("Gemini MCP Client [DEBUG]: Received text_response from native host for injection:", message.payload.text_response);
    injectAndSendMessage(message.payload.text_response, true) // isToolResult is true for native host responses
        .then(success => {
            if (success) {
                // console.log("Gemini MCP Client [DEBUG]: Successfully injected and sent native host response via injectAndSendMessage.");
            }
        })
        .catch(error => {
            console.error("Gemini MCP Client [ERROR]: Error injecting native host response via injectAndSendMessage:", error.message);
        });
  } else if (message.type === "PROMPT_FROM_NATIVE_HOST" && message.payload && message.payload.prompt) {
    // console.log("Gemini MCP Client [DEBUG]: PROMPT_FROM_NATIVE_HOST received in content_script:", message); // Added per requirement
    const promptToInject = message.payload.prompt;
    // console.log("Gemini MCP Client [DEBUG]: Extracted prompt:", promptToInject); // Confirming extraction
    // console.log("Gemini MCP Client [DEBUG]: About to call injectAndSendMessage with prompt:", promptToInject); // Added per requirement
    try {
      injectAndSendMessage(promptToInject, false) // isToolResult is false for prompts
          .then(success => {
              if (success) {
                  // console.log("Gemini MCP Client [DEBUG]: Successfully injected and sent prompt from native host via injectAndSendMessage.");
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

  // Check if UI already exists
  let uiContainer = document.getElementById('mcp-client-ui-container');
  if (uiContainer) {
    console.log("UI container already exists, returning existing one");
    return uiContainer;
  }

  console.log("Creating new UI container");
  // Create UI container
  uiContainer = document.createElement('div');
  uiContainer.id = 'mcp-client-ui-container';
  uiContainer.classList.add('mcp-ui-container');
  
  // Set initial display to none - will be shown when popup is clicked
  uiContainer.style.display = 'none';

  // Toggle Switch
  const toggleLabel = document.createElement('label');
  toggleLabel.htmlFor = 'mcp-client-toggle';
  toggleLabel.textContent = 'Enable MCP Client: ';
  toggleLabel.classList.add('mcp-toggle-label');

  const toggleSwitch = document.createElement('input');
  toggleSwitch.type = 'checkbox';
  toggleSwitch.id = 'mcp-client-toggle';
  toggleSwitch.checked = isMcpClientEnabled;
  toggleSwitch.classList.add('mcp-toggle-switch');

  toggleSwitch.addEventListener('change', () => {
    isMcpClientEnabled = toggleSwitch.checked;
    // console.log(`Gemini MCP Client ${isMcpClientEnabled ? 'enabled' : 'disabled'}`);
    
    // Save the state to storage
    browser.storage.local.set({ mcpClientEnabled: isMcpClientEnabled }).catch(error => {
      console.error("Error saving state:", error);
    });
    
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
  dummyPromptButton.classList.add('mcp-dummy-prompt-button');

  dummyPromptButton.addEventListener('click', () => {
    console.log("Gemini MCP Client [DEBUG]: Inject prompt button clicked. Requesting prompt from background script.");
    
    // Get the current tab ID to include in the message
    const currentUrl = window.location.href;
    console.log("Current URL:", currentUrl);
    
    // Send message to background script to request a prompt
    browser.runtime.sendMessage({ 
      type: "GET_PROMPT",
      url: currentUrl  // Include the URL to help identify the tab
    })
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
  // console.log("Gemini MCP Client: UI elements injected.");
  
  return uiContainer;
}

// Functions to show/hide the UI
function showUI() {
  console.log("showUI called");
  let uiContainer = document.getElementById('mcp-client-ui-container');
  if (!uiContainer) {
    console.log("UI container not found, creating it");
    uiContainer = setupUI();
  }
  console.log("Setting UI container display to block");
  uiContainer.style.display = 'block';
  
  // Make sure it's visible by setting opacity and z-index
  uiContainer.style.opacity = '1';
  uiContainer.style.zIndex = '10000';
  
  // Log the UI container's computed style to verify it's visible
  const computedStyle = window.getComputedStyle(uiContainer);
  console.log("UI container computed style:", {
    display: computedStyle.display,
    opacity: computedStyle.opacity,
    zIndex: computedStyle.zIndex,
    position: computedStyle.position
  });
}

function hideUI() {
  console.log("hideUI called");
  const uiContainer = document.getElementById('mcp-client-ui-container');
  if (uiContainer) {
    console.log("Setting UI container display to none");
    uiContainer.style.display = 'none';
  } else {
    console.log("UI container not found when trying to hide");
  }
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
            /* display: none; is set inline by JS */
            position: absolute;
            top: 100%; /* Position below the bar */
            right: 0; /* Align to the right of the bar */
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
        .mcp-ui-container {
            position: fixed;
            top: 10px;
            right: 10px;
            background-color: rgba(255, 255, 255, 0.95);
            padding: 15px;
            border: 1px solid #ccc;
            border-radius: 8px;
            z-index: 9999;
            font-family: Arial, sans-serif;
            font-size: 14px;
            color: #333;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            transition: opacity 0.3s ease-in-out;
        }
        .mcp-toggle-label {
            margin-right: 5px;
        }
        .mcp-toggle-switch {
            vertical-align: middle;
        }
        .mcp-dummy-prompt-button {
            margin-top: 10px;
            display: block;
            padding: 5px 10px;
            border: 1px solid #007bff;
            background-color: #007bff;
            color: white;
            border-radius: 3px;
            cursor: pointer;
        }
        .mcp-dummy-prompt-button:hover {
            background-color: #0056b3;
        }
        .mcp-displayed-result-xml {
            white-space: pre-wrap;
            background: #f4f4f4;
            padding: 10px;
            margin-top: 5px;
            border: 1px solid #ddd;
            font-size: 12px;
            font-family: "SF Mono", "Consolas", "Menlo", monospace;
        }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.id = "mcp-client-styles"; // ID to check if already injected
    styleSheet.textContent = css;
    document.head.appendChild(styleSheet);
    stylesInjected = true;
    // console.log("Gemini MCP Client: Custom styles injected.");
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
                    // Define the processing for an added node
                    const processAddedNode = (node) => {
                        // 1. Handle outgoing tool calls (standard <code> blocks)
                        if (node.matches &&
                            (node.matches('code.code-container.formatted') || node.matches('code[class*="code-container"][class*="formatted"]')) &&
                            node.closest('.model-response-text') &&
                            !node.closest('.mcp-tool-call-bar')) {
                            // This directly calls the version of handleFoundCodeElement that expects a <code> element
                            // and determines type by content.
                            handleFoundCodeElement(node, "addedNode directly matching <code>");
                        } else {
                             // Search for outgoing <code> blocks in children
                            const codeElements = node.querySelectorAll(
                                'code.code-container.formatted, code[class*="code-container"][class*="formatted"]'
                            );
                            codeElements.forEach(codeEl => {
                                if (codeEl.closest('.model-response-text') && !codeEl.closest('.mcp-tool-call-bar')) {
                                    handleFoundCodeElement(codeEl, "childList querySelectorAll <code>");
                                }
                            });
                        }

                        // 2. Handle potential message containers for tool results (fragmented XML)
                        if (node.matches && node.matches('div.query-text[dir="ltr"]')) {
                            processPotentialMessageContainer(node);
                        }
                        // Also search for these containers within descendants, ensuring node is an Element
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const containers = node.querySelectorAll('div.query-text[dir="ltr"]');
                            containers.forEach(container => {
                                processPotentialMessageContainer(container);
                            });
                        }
                    };
                    processAddedNode(addedNode);
                }
            });
        }
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
      // console.log("Gemini MCP Client [TOOL-DETECT]: Creating new MutationObserver with options:", observerOptions);
      observer = new MutationObserver(observerCallback);
  }
  if (targetNode && isMcpClientEnabled) {
    try {
        observer.observe(targetNode, observerOptions);
        // console.log("Gemini MCP Client [TOOL-DETECT]: MutationObserver started/restarted. Target:", targetNode, "Options:", observerOptions);
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
    // console.log("Gemini MCP Client [TOOL-DETECT]: MutationObserver stopped.");
  }
}

// Function to initialize targetNode and start observer
function initializeTargetNodeAndObserver(forceStart = false) {
    const userSpecifiedSelector = '#chat-history';
    // console.log(`Gemini MCP Client [TOOL-DETECT]: Attempting to set observer targetNode to user-specified selector: '${userSpecifiedSelector}'.`);
    let specificTarget = document.getElementById('chat-history');
    if (!specificTarget) {
        specificTarget = document.querySelector(userSpecifiedSelector);
    }

    if (specificTarget) {
        targetNode = specificTarget;
        // console.log(`Gemini MCP Client [TOOL-DETECT]: Observer targetNode set to ${userSpecifiedSelector} (user identified).`);
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
console.log("Content script loaded on:", window.location.href);

// Check if we're on the correct page
if (window.location.href.includes("gemini.google.com")) {
    console.log("On Gemini page, initializing UI and observer");
    // Initialize the UI but don't show it yet
    setupUI(); 

    // Initialize and start the observer after UI is ready and DOM might be more stable
    setTimeout(() => {
        initializeTargetNodeAndObserver(true); // initializeTargetNodeAndObserver must be defined
    }, 1000);
} else {
    console.log("Not on Gemini page, skipping UI and observer initialization");
}

// Listen for messages from the popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content script received message:", message);
    if (message.type === 'TOGGLE_UI') {
        console.log("Toggling UI visibility:", message.show);
        if (message.show) {
            showUI();
        } else {
            hideUI();
        }
        sendResponse({ status: 'UI visibility updated' });
        return true;
    } else if (message.type === 'REQUEST_INJECT_PROMPT') {
        console.log("Content script received REQUEST_INJECT_PROMPT message");
        
        // Send message to background script to request a prompt
        // This ensures the tabId is properly included
        browser.runtime.sendMessage({ 
            type: "GET_PROMPT",
            url: window.location.href
        })
        .then(response => {
            console.log("Content script: Response from background script for GET_PROMPT:", response);
            sendResponse({ status: 'Prompt request forwarded to background script' });
        })
        .catch(error => {
            console.error("Content script: Error sending GET_PROMPT message to background script:", error);
            sendResponse({ status: 'Error: ' + error.message });
        });
        
        return true; // Keep the message channel open for the async response
    } else if (message.type === 'TOGGLE_MCP_CLIENT') {
        isMcpClientEnabled = message.enabled;
        
        // Update the toggle switch if UI is visible
        const toggleSwitch = document.getElementById('mcp-client-toggle');
        if (toggleSwitch) {
            toggleSwitch.checked = isMcpClientEnabled;
        }
        
        if (isMcpClientEnabled) {
            startObserver();
        } else {
            stopObserver();
        }
        
        sendResponse({ status: `MCP Client ${isMcpClientEnabled ? 'enabled' : 'disabled'}` });
        return true;
    }
    return false;
});
