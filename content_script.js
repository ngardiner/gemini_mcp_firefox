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
  // This function is currently not called during BAREBONES-DETECT phase
  console.log("[BAREBONES-DETECT]: (DISABLED) Would send to background:", toolCallData);
  // browser.runtime.sendMessage({
  //   type: "TOOL_CALL_DETECTED",
  //   payload: toolCallData
  // }).then(response => {
  //   // console.log("Response from background script:", response);
  // }).catch(error => {
  //   console.error("Error sending message to background script:", error);
  // });
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

// Bare-bones string finder for debugging
function bareBonesStringFinder(mutationsList, _observer) {
    if (!isMcpClientEnabled) return;

    const functionCallsString = "function_calls"; // String to search for

    // Recursive helper to check element and its children
    function checkElementAndChildren(element) {
        if (!element || typeof element.matches !== 'function') return; // Ensure it's a valid element

        try {
            if (element.innerHTML && element.innerHTML.includes(functionCallsString)) {
                console.log(`[BAREBONES-DETECT]: '${functionCallsString}' found in innerHTML of element:`, element.tagName, `Class: ${element.className}`, `ID: ${element.id}`);
                console.log(`[BAREBONES-DETECT]:   innerHTML (sample):`, element.innerHTML.substring(0, 500) + (element.innerHTML.length > 500 ? "..." : ""));
            }
            if (element.textContent && element.textContent.includes(functionCallsString)) {
                console.log(`[BAREBONES-DETECT]: '${functionCallsString}' found in textContent of element:`, element.tagName, `Class: ${element.className}`, `ID: ${element.id}`);
                console.log(`[BAREBONES-DETECT]:   textContent (sample):`, element.textContent.substring(0, 500) + (element.textContent.length > 500 ? "..." : ""));
            }
        } catch (e) {
            console.warn(`[BAREBONES-DETECT]: Error accessing innerHTML/textContent for element: ${element.tagName}`, e.message);
        }


        if (element.children) {
            for (let i = 0; i < element.children.length; i++) {
                checkElementAndChildren(element.children[i]);
            }
        }
    }

    mutationsList.forEach(mutation => {
        console.log("[BAREBONES-DETECT]: Mutation type:", mutation.type);

        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(addedNode => {
                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    // console.log(`[BAREBONES-DETECT]: Added node: ${addedNode.nodeName}`, "outerHTML (truncated):", addedNode.outerHTML ? addedNode.outerHTML.substring(0, 200) : "N/A");
                    checkElementAndChildren(addedNode);
                } else if (addedNode.nodeType === Node.TEXT_NODE) {
                     if (addedNode.nodeValue && addedNode.nodeValue.includes(functionCallsString)) {
                        const parentElement = addedNode.parentElement;
                        console.log(`[BAREBONES-DETECT]: '${functionCallsString}' found in added textNode.nodeValue. Parent:`, parentElement ? `${parentElement.tagName} (Class: ${parentElement.className}, ID: ${parentElement.id})` : 'N/A');
                        console.log("[BAREBONES-DETECT]:   textNode.nodeValue (sample):", addedNode.nodeValue.substring(0, 500));
                    }
                }
            });
            // Optionally log removedNodes if needed, but addedNodes are primary for new content
        } else if (mutation.type === 'characterData') {
            const textNode = mutation.target;
            const parentElement = textNode.parentElement;
            // console.log("[BAREBONES-DETECT]: CharacterData change. Target nodeName:", textNode.nodeName);

            if (textNode.nodeValue && textNode.nodeValue.includes(functionCallsString)) {
                console.log(`[BAREBONES-DETECT]: '${functionCallsString}' found in characterData.nodeValue. Parent:`, parentElement ? `${parentElement.tagName} (Class: ${parentElement.className}, ID: ${parentElement.id})` : 'N/A');
                console.log("[BAREBONES-DETECT]:   New text value (sample):", textNode.nodeValue.substring(0, 500));
            }
            // Also check parent's full content, as characterData change might complete a partial string
            if (parentElement) {
                 try {
                    if (parentElement.innerHTML && parentElement.innerHTML.includes(functionCallsString)) {
                        console.log(`[BAREBONES-DETECT]: '${functionCallsString}' found in parentElement.innerHTML of characterData change. Parent:`, parentElement.tagName, `Class: ${parentElement.className}`, `ID: ${parentElement.id}`);
                        console.log(`[BAREBONES-DETECT]:   parentElement.innerHTML (sample):`, parentElement.innerHTML.substring(0, 500) + (parentElement.innerHTML.length > 500 ? "..." : ""));
                    }
                    if (parentElement.textContent && parentElement.textContent.includes(functionCallsString)) {
                        console.log(`[BAREBONES-DETECT]: '${functionCallsString}' found in parentElement.textContent of characterData change. Parent:`, parentElement.tagName, `Class: ${parentElement.className}`, `ID: ${parentElement.id}`);
                        console.log(`[BAREBONES-DETECT]:   parentElement.textContent (sample):`, parentElement.textContent.substring(0, 500) + (parentElement.textContent.length > 500 ? "..." : ""));
                    }
                } catch (e) {
                    console.warn(`[BAREBONES-DETECT]: Error accessing innerHTML/textContent for parent of characterData change: ${parentElement.tagName}`, e.message);
                }
            }
        }
    });
}


const observerCallback = bareBonesStringFinder;

const observerOptions = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: false
};

// Start and Stop observer functions
function startObserver() {
  if (!observer) {
      console.log("Gemini MCP Client [BAREBONES-DETECT]: Creating new MutationObserver with options:", observerOptions);
      observer = new MutationObserver(observerCallback);
  }
  if (targetNode && isMcpClientEnabled) {
    try {
        observer.observe(targetNode, observerOptions);
        console.log("Gemini MCP Client [BAREBONES-DETECT]: MutationObserver started/restarted. Target:", targetNode, "Options:", observerOptions);
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
    console.log("Gemini MCP Client [BAREBONES-DETECT]: MutationObserver stopped.");
  }
}

// Function to initialize targetNode and start observer
function initializeTargetNodeAndObserver(forceStart = false) {
    const userSpecifiedSelector = '#chat-history';
    console.log(`Gemini MCP Client [BAREBONES-DETECT]: Attempting to set observer targetNode to user-specified selector: '${userSpecifiedSelector}'.`);
    let specificTarget = document.getElementById('chat-history');
    if (!specificTarget) {
        specificTarget = document.querySelector(userSpecifiedSelector);
    }

    if (specificTarget) {
        targetNode = specificTarget;
        console.log(`Gemini MCP Client [BAREBONES-DETECT]: Observer targetNode set to ${userSpecifiedSelector} (user identified).`);
    } else {
        console.warn(`Gemini MCP Client [BAREBONES-DETECT]: ${userSpecifiedSelector} (user identified) NOT FOUND. Falling back to document.body.`);
        targetNode = document.body;
    }

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
     initializeTargetNodeAndObserver(true);
 }, 1000);
