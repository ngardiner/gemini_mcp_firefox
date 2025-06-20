// background.js

const nativeHostName = "mcp_native_host";
let port = null;
let processedCallIds = new Set();

// Function to send a message to the native host
function sendToNativeHost(message) {
  // Check if the message has a tabId, if not and it's a REQUEST_PROMPT, try to get the active tab
  if (message.type === "REQUEST_PROMPT" && (!message.tabId || message.tabId === null)) {
    console.log("No tabId provided for REQUEST_PROMPT, trying to get active tab");
    
    browser.tabs.query({ active: true, currentWindow: true })
      .then(tabs => {
        if (tabs.length > 0) {
          const activeTabId = tabs[0].id;
          console.log("Got active tab id:", activeTabId);
          
          // Create a new message with the tabId
          const messageWithTabId = {
            ...message,
            tabId: activeTabId
          };
          
          console.log("Sending message with active tab id:", messageWithTabId);
          if (port) {
            try {
              port.postMessage(messageWithTabId);
            } catch (e) {
              console.error("Error sending message with active tab id to native host:", e);
            }
          } else {
            console.error("Native host port not connected when trying to send message with active tab id");
          }
        } else {
          console.error("No active tab found when trying to get tabId for REQUEST_PROMPT");
        }
      })
      .catch(error => {
        console.error("Error getting active tab for REQUEST_PROMPT:", error);
      });
    
    return; // Return early as we're handling this asynchronously
  }
  
  // Normal message sending path
  if (port) {
    try {
      console.log("Sending message to native host:", message);
      port.postMessage(message);
    } catch (e) {
      console.error("Error sending message to native host:", e);
      console.error("Message was:", message);
      // Attempt to reconnect or handle error
      port = null; // Reset port
      connectToNativeHost(); // Try to reconnect
    }
  } else {
    console.error("Native host port not connected. Attempting to reconnect.");
    connectToNativeHost(); // Try to connect if not already
    // Optionally queue the message or inform the user/content script
  }
}

// Function to connect to the native messaging host
function connectToNativeHost() {
  if (port) {
    // console.log("Already connected or connecting to native host.");
    return;
  }
  console.log(`Attempting to connect to native host: ${nativeHostName}`);
  try {
    port = browser.runtime.connectNative(nativeHostName);
    console.log("Successfully connected to native host.");

    port.onMessage.addListener((response) => {
      // console.log("Received from native host:", response);

      if (response.payload && response.payload.type === "PROMPT_RESPONSE") {
        // console.log("Background: Received PROMPT_RESPONSE from native host:", response);
        if (response.tabId && response.payload.prompt) {
          const tabId = response.tabId;
          const promptToSend = response.payload.prompt;
          // console.log("Background: Forwarding PROMPT_FROM_NATIVE_HOST to tabId:", tabId, "with prompt:", promptToSend); // Added per requirement
          browser.tabs.sendMessage(tabId, {
            type: "PROMPT_FROM_NATIVE_HOST",
            payload: { prompt: promptToSend }
          }).then(() => {
            // console.log(`Background: PROMPT_FROM_NATIVE_HOST message successfully sent to tab ${tabId}`);
          }).catch(err => {
            console.error(`Background: Error sending PROMPT_FROM_NATIVE_HOST message to tab ${response.tabId}:`, err);
          });
        } else {
          console.warn("Background: Malformed PROMPT_RESPONSE from native host. Missing tabId or prompt.", response);
        }
      } else if (response.tabId && response.payload) { // Existing handling for other messages like tool results
        // console.log("Background: Received other message from native host with tabId:", response);
        browser.tabs.sendMessage(response.tabId, {
          type: "FROM_NATIVE_HOST", // Generic type for other native host responses
          payload: response.payload
        }).then(() => {
            // console.log(`Background: FROM_NATIVE_HOST message sent to tab ${response.tabId}`);
        }).catch(err => {
            console.error(`Background: Error sending FROM_NATIVE_HOST message to tab ${response.tabId}:`, err);
        });
      } else {
        console.warn("Background: No tabId in response from native host or missing payload. Cannot forward to content script.", response);
      }
    });

    port.onDisconnect.addListener(() => {
      console.log("Disconnected from native host.");
      if (port && port.error) { // Check if port exists before accessing error
        console.error("Native host disconnect error:", port.error.message);
      }
      port = null; // Reset port so connectToNativeHost can try again
    });

  } catch (error) {
    console.error("Error connecting to native host:", error);
    port = null;
  }
}

// Listen for messages from content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in background script from content script:", message);
  console.log("Sender information:", sender);
  
  if (message.type === "GET_PROMPT") {
    console.log("Background: GET_PROMPT message received from content script.");
    
    // Check if sender.tab exists and has an id
    if (!sender.tab) {
      console.error("Background: sender.tab is missing for GET_PROMPT message");
    } else if (sender.tab.id === undefined) {
      console.error("Background: sender.tab.id is undefined for GET_PROMPT message");
    } else {
      console.log("Background: sender.tab.id is", sender.tab.id);
    }
    
    if (!port) {
      console.log("Background: Native host port not connected, attempting to connect for GET_PROMPT.");
      connectToNativeHost();
    }
    
    if (port) {
      // Get the active tab if sender.tab is not available
      if (!sender.tab) {
        console.log("Background: sender.tab not available, trying to get active tab");
        browser.tabs.query({ active: true, currentWindow: true })
          .then(tabs => {
            if (tabs.length > 0) {
              const activeTabId = tabs[0].id;
              console.log("Background: Got active tab id:", activeTabId);
              const requestPromptMessage = {
                type: "REQUEST_PROMPT",
                tabId: activeTabId
              };
              console.log("Background: Sending REQUEST_PROMPT to native host with active tab id:", requestPromptMessage);
              sendToNativeHost(requestPromptMessage);
            } else {
              console.error("Background: No active tab found");
              sendResponse({ status: "Error: No active tab found" });
            }
          })
          .catch(error => {
            console.error("Background: Error getting active tab:", error);
            sendResponse({ status: "Error: Failed to get active tab" });
          });
      } else {
        const requestPromptMessage = {
          type: "REQUEST_PROMPT",
          tabId: sender.tab ? sender.tab.id : null
        };
        console.log("Background: Sending REQUEST_PROMPT to native host:", requestPromptMessage);
        sendToNativeHost(requestPromptMessage);
      }
      
      // Send a response to the content script
      sendResponse({ status: "GET_PROMPT received, forwarding to native host" });
    } else {
      console.error("Background: Native host port not available for GET_PROMPT. Cannot send REQUEST_PROMPT.");
      sendResponse({ status: "Error: Native host not connected" });
    }
    return true; // Indicate that we might send a response asynchronously (or not)
  } else if (message.type === "TOOL_CALL_DETECTED") {
    const callId = message.payload && message.payload.call_id;

    if (callId) {
      if (processedCallIds.has(callId)) {
        console.warn(`Duplicate call_id detected, skipping: ${callId}`);
        // Optionally send a response to the content script indicating a duplicate
        // sendResponse({ status: "Duplicate call_id, message not forwarded." });
        return false; // Or true if sending async response
      }
      processedCallIds.add(callId);
      // console.log(`New call_id ${callId} added to processed set.`);
    }

    if (!port) {
        connectToNativeHost();
    }
    if (port) {
        // Add tabId to the message so native host can send it back
        // allowing background script to route response to correct tab.
        const messageToNative = {
            ...message,
            tabId: sender.tab ? sender.tab.id : null
        };
        sendToNativeHost(messageToNative);
        // sendResponse({ status: "Message forwarded to native host." }); // Optional: acknowledge receipt
    } else {
        console.error("Failed to connect to native host. Message not sent.");
        // sendResponse({ status: "Failed to forward message.", error: "Native host connection failed." });
    }
    // Return true if you want to send a response asynchronously.
    // For now, we are not sending an immediate response back to content script from here.
    return false;
  }
  return false; // Default handling for other messages
});

// Initial connection attempt when the background script loads
connectToNativeHost();
