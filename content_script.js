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
                console.log("Gemini MCP Client [DEBUG]: Polling: Attempting selector:", selector);
                const button = document.querySelector(selector);

                if (button) {
                    console.log("Gemini MCP Client [DEBUG]: Polling: Button candidate found with selector '" + selector + "'.");
                    console.log("Gemini MCP Client [DEBUG]:   - outerHTML:", button.outerHTML.substring(0,100) + "...");
                    console.log("Gemini MCP Client [DEBUG]:   - disabled property:", button.disabled);
                    console.log("Gemini MCP Client [DEBUG]:   - offsetParent (for visibility):", button.offsetParent);
                    const computedStyle = window.getComputedStyle(button);
                    console.log("Gemini MCP Client [DEBUG]:   - computedStyle.display:", computedStyle.display);
                    console.log("Gemini MCP Client [DEBUG]:   - computedStyle.visibility:", computedStyle.visibility);
                    console.log("Gemini MCP Client [DEBUG]:   - computedStyle.opacity:", computedStyle.opacity);
                    console.log("Gemini MCP Client [DEBUG]:   - computedStyle.pointerEvents:", computedStyle.pointerEvents);

                    if (!button.disabled && button.offsetParent !== null) { // Check if visible and not disabled
                        button.click();
                        console.log(`Gemini MCP Client [DEBUG]: Send button clicked successfully via polling. Selector: '${selector}'.`);
                        clearInterval(intervalId);
                        buttonClicked = true;
                        resolve(true);
                        break;
                    } else {
                        console.log(`Gemini MCP Client [DEBUG]: Polling: Button found with selector '${selector}', but not clickable (Disabled: ${button.disabled}, Visible: ${button.offsetParent !== null}).`);
                    }
                } else {
                     // console.log("Gemini MCP Client [DEBUG]: Polling: No button found with selector:", selector); // Can be too verbose
                }
            } // End of for loop (selectors)

            if (buttonClicked) return; // Already resolved

            if (elapsedTime >= pollTimeout) {
                console.error("Gemini MCP Client [ERROR]: Timeout: Send button did not become clickable after " + (pollTimeout / 1000) + " seconds.");
                clearInterval(intervalId);
                reject(new Error("Timeout: Send button did not become clickable."));
            } else {
                console.log("Gemini MCP Client [DEBUG]: Polling: Send button not clickable yet or not found in this attempt, continuing to poll... Elapsed time:", elapsedTime / 1000, "s.");
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
        } else {
          // This case should ideally be handled by the reject part of the promise,
          // but adding a log here if the promise somehow resolves with false.
          console.warn("Gemini MCP Client [DEBUG]: injectAndSendMessage resolved with false for dummy prompt.");
        }
      })
      .catch(error => {
        console.error("Gemini MCP Client [ERROR]: Error sending dummy prompt via injectAndSendMessage:", error.message);
        // Display original user-facing warning if the more detailed error isn't sufficient
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

// Listen for messages from the background script
browser.runtime.onMessage.addListener(handleNativeHostResponse);

// Targeted Light DOM Debugging for <code class="code-container formatted">
function debugLightDOMCodeElements(mutationsList, _observer) {
    if (!isMcpClientEnabled) return;

    mutationsList.forEach(mutation => {
        console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Mutation type:", mutation.type);

        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(addedNode => {
                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    // Check if the addedNode itself is the target element
                    if (addedNode.matches && addedNode.matches('code.code-container.formatted')) {
                        const codeElement = addedNode;
                        console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Found candidate <code.code-container.formatted> element (as addedNode):", codeElement.outerHTML.substring(0, 500));
                        console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]:   Parent:", codeElement.parentElement ? codeElement.parentElement.outerHTML.substring(0, 200) : 'N/A');
                        console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]:   Grandparent:", codeElement.parentElement && codeElement.parentElement.parentElement ? codeElement.parentElement.parentElement.outerHTML.substring(0, 200) : 'N/A');
                        if (codeElement.innerHTML.includes("<function_calls>")) {
                            console.warn("Gemini MCP Client [DEBUG-LIGHT-DOM]: !!! <function_calls> FOUND in innerHTML of <code.code-container.formatted> (as addedNode) !!!");
                            console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Full innerHTML:", codeElement.innerHTML);
                        }
                    }
                    // Check descendants of addedNode
                    const codeElements = addedNode.querySelectorAll('code.code-container.formatted');
                    codeElements.forEach(codeElement => {
                        console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Found candidate <code.code-container.formatted> element (from addedNode querySelectorAll):", codeElement.outerHTML.substring(0, 500));
                        console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]:   Parent:", codeElement.parentElement ? codeElement.parentElement.outerHTML.substring(0, 200) : 'N/A');
                        console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]:   Grandparent:", codeElement.parentElement && codeElement.parentElement.parentElement ? codeElement.parentElement.parentElement.outerHTML.substring(0, 200) : 'N/A');
                        if (codeElement.innerHTML.includes("<function_calls>")) {
                            console.warn("Gemini MCP Client [DEBUG-LIGHT-DOM]: !!! <function_calls> FOUND in innerHTML of <code.code-container.formatted> (from addedNode querySelectorAll) !!!");
                            console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Full innerHTML:", codeElement.innerHTML);
                        }
                    });
                }
            });
        } else if (mutation.type === 'characterData') {
            const targetElement = mutation.target.parentElement;
            if (targetElement && targetElement.matches && targetElement.matches('code.code-container.formatted')) {
                console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: characterData mutation on target:", targetElement.outerHTML.substring(0, 500));
                if (mutation.target.nodeValue && mutation.target.nodeValue.includes("<function_calls>")) {
                    console.warn("Gemini MCP Client [DEBUG-LIGHT-DOM]: !!! <function_calls> FOUND in characterData nodeValue !!!");
                    console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Full nodeValue:", mutation.target.nodeValue);
                    console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: innerHTML of parent <code>:", targetElement.innerHTML);
                }
            }
        } else if (mutation.type === 'attributes') {
            const targetElement = mutation.target;
            if (targetElement && targetElement.matches && targetElement.matches('code.code-container.formatted')) {
                console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: attributes mutation on target:", targetElement.outerHTML.substring(0, 500), ". Attribute changed:", mutation.attributeName);
                const newAttrValue = targetElement.getAttribute(mutation.attributeName);
                if ((newAttrValue && newAttrValue.includes("<function_calls>")) || targetElement.innerHTML.includes("<function_calls>")) {
                    console.warn("Gemini MCP Client [DEBUG-LIGHT-DOM]: !!! <function_calls> FOUND after attribute change on <code> element !!!");
                    console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Attribute value:", newAttrValue);
                    console.log("Gemini MCP Client [DEBUG-LIGHT-DOM]: Full innerHTML of <code>:", targetElement.innerHTML);
                }
            }
        }
        // Temporarily disable Shadow DOM checks or other broad logging to focus
        /*
         if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(addedNode => {
                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    // recursivelyCheckShadowDOM(addedNode); // Shadow DOM logic disabled
                }
            });
        }
        */
    });
}

// The observer will now use the Light DOM debugging function.
const observerCallback = debugLightDOMCodeElements;

const observerOptions = {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true
};


// Start and Stop observer functions
function startObserver() {
  if (!observer) {
      console.log("Gemini MCP Client [DEBUG-TOOL-DETECT]: Creating new MutationObserver with options:", observerOptions);
      observer = new MutationObserver(observerCallback); // Ensure it uses the new callback
  }
  if (targetNode && isMcpClientEnabled) {
    try {
        observer.observe(targetNode, observerOptions);
        console.log("Gemini MCP Client [DEBUG-TOOL-DETECT]: MutationObserver started/restarted. Target:", targetNode, "Options:", observerOptions);
    } catch (e) {
        console.error("Gemini MCP Client [ERROR]: Error starting MutationObserver:", e);
        initializeTargetNodeAndObserver(true);
    }
  } else if (!targetNode) {
    console.error("Gemini MCP Client [ERROR]: Target node not available to start observer.");
    initializeTargetNodeAndObserver(true);
  }
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    console.log("Gemini MCP Client [DEBUG-TOOL-DETECT]: MutationObserver stopped.");
  }
}

// Function to initialize targetNode and start observer
function initializeTargetNodeAndObserver(forceStart = false) {
    // Temporarily bypass multi-selector logic and use document.body for broad debugging
    console.log("Gemini MCP Client [DEBUG-TOOL-DETECT]: Observer targetNode set to document.body for broad debugging.");
    targetNode = document.body;

    // Original multi-selector logic - temporarily commented out for broad debugging
    /*
    const targetSelectors = [
        '[role="log"]',
        '.chat-history',
        // ... other selectors ...
    ];
    console.log("Gemini MCP Client [DEBUG]: Attempting to select targetNode. Candidate selectors:", targetSelectors);
    // ... (rest of the original selector logic) ...
    if (targetNode === document.body && !foundNode) {
        console.warn("Gemini MCP Client [DEBUG]: Falling back to document.body for targetNode. This may be inefficient.");
    }
    */

    if (targetNode) {
        if (isMcpClientEnabled || forceStart) {
            startObserver();
        }
    } else {
        // This case should not be reached if targetNode is set to document.body by default
        console.error("Gemini MCP Client [ERROR]: Target node for MutationObserver could not be set, even to document.body.");
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
