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

// Original MutationObserver logic (modified to call sendToolCallToBackground)
function detectToolCallInMutation(mutation) {
  mutation.addedNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const potentialToolCallText = node.textContent || node.innerText;
      // More robust tool call detection is needed here.
      // This should parse the XML specifically.
      // For now, we're still using a simple includes check.
      if (potentialToolCallText && potentialToolCallText.includes('<tool_code>')) { // Placeholder for actual XML parsing
        console.log("Potential tool call detected in node:", potentialToolCallText);

        // Placeholder: Extract actual tool name and parameters
        // This needs proper XML parsing. For now, sending the whole text.
        const toolData = {
          raw_xml: potentialToolCallText,
          detected_at: new Date().toISOString()
          // In a real scenario, you'd parse out tool_name, parameters, etc.
        };
        sendToolCallToBackground(toolData); // Send to background script
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
