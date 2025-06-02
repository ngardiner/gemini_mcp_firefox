// background.js

const nativeHostName = "mcp_native_host";
let port = null;

console.log("Background script loaded.");

// Function to send a message to the native host
function sendToNativeHost(message) {
  if (port) {
    try {
      port.postMessage(message);
      console.log("Sent to native host:", message);
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
    console.log("Already connected or connecting to native host.");
    return;
  }
  console.log(`Attempting to connect to native host: ${nativeHostName}`);
  try {
    port = browser.runtime.connectNative(nativeHostName);
    console.log("Successfully connected to native host.");

    port.onMessage.addListener((response) => {
      console.log("Received from native host:", response);
      // Forward the response to the appropriate content script
      // We need the tabId to send it to the correct content script.
      // The content script should pass its tabId when sending the initial message,
      // or we can try to get the active tab.
      if (response.tabId) {
        browser.tabs.sendMessage(response.tabId, {
          type: "FROM_NATIVE_HOST",
          payload: response.payload
        }).catch(err => console.error("Error sending message to content script:", err));
      } else {
        console.warn("No tabId in response from native host. Cannot forward to content script.", response);
      }
    });

    port.onDisconnect.addListener(() => {
      console.log("Disconnected from native host.");
      if (port.error) {
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
  if (message.type === "TOOL_CALL_DETECTED") {
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

// Keep alive for event-based background scripts (Manifest V2)
// This is generally not needed if you have active listeners like onMessage or connectNative.
// browser.alarms.create('keepAlive', { periodInMinutes: 4.9 });
// browser.alarms.onAlarm.addListener(alarm => {
//   if (alarm.name === 'keepAlive') {
//     console.log('Keep-alive alarm fired.');
//     if (!port) {
//       connectToNativeHost();
//     }
//   }
// });
