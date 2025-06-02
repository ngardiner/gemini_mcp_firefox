console.log("Gemini MCP Client content script loaded.");

// Function to detect tool calls (placeholder)
function detectToolCall(mutation) {
  // This function will parse the mutation records to find tool calls.
  // For now, it will just log the added nodes.
  mutation.addedNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      // In a real scenario, we would inspect the node's content
      // for XML structures indicating a tool call.
      // Example: check for <tool_code> or similar tags.
      const potentialToolCall = node.textContent || node.innerText;
      if (potentialToolCall && potentialToolCall.includes('<tool_code>')) {
        console.log("Potential tool call detected:", potentialToolCall);
        // Further parsing would be needed here to extract specifics.
        const decodedCall = `Tool: ExtractedToolName, Parameters: {...}`; // Placeholder
        logDebugMessage(decodedCall);
      }
    }
  });
}

// Function to log debug messages
function logDebugMessage(message) {
  console.log("[Gemini MCP Client] Intercepted call: ", message);
}

// Observer callback
function observerCallback(mutationsList, observer) {
  for (const mutation of mutationsList) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // New nodes were added, let's check them
      detectToolCall(mutation);
    }
  }
}

// Options for the observer (which mutations to observe)
const observerOptions = {
  childList: true, // Observe direct children additions/removals
  subtree: true,   // Observe all descendants
  attributes: false // We are not interested in attribute changes for now
};

// Select the node that will be observed for mutations
// This needs to be a robust selector for the chat output area in Gemini.
// For now, we'll assume a common target like 'body' for broad observation,
// but this should be refined to a more specific element.
// A more specific selector might be something like 'div.chat-message-container' or similar.
// We will need to inspect Gemini's actual DOM structure to find the correct one.
const targetNode = document.body;

// Create an observer instance linked to the callback function
const observer = new MutationObserver(observerCallback);

// Start observing the target node for configured mutations
if (targetNode) {
  observer.observe(targetNode, observerOptions);
  console.log("Gemini MCP Client: MutationObserver started on document.body.");
} else {
  console.error("Gemini MCP Client: Target node for MutationObserver not found.");
}

// It's good practice to disconnect the observer when the script is unloaded
// or the page is navigated away, though this is handled by the browser
// for content scripts when the page is closed.
// window.addEventListener('unload', () => {
//   observer.disconnect();
//   console.log("Gemini MCP Client: MutationObserver disconnected.");
// });
