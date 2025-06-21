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
      port.postMessage(message);
    } catch (e) {
      console.error("Error sending message to native host:", e);
      // Attempt to reconnect or handle error
      port = null; // Reset port
      connectToNativeHost(); // Try to reconnect
    }
  } else {
    console.error("Native host port not connected. Attempting to reconnect.");
    connectToNativeHost(); // Try to connect if not already
  }
}

// Function to connect to the native messaging host
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1000; // Start with 1 second delay
let reconnectTimeoutId = null;

function connectToNativeHost() {
  if (port) {
    // console.log("Already connected or connecting to native host.");
    return;
  }
  
  // Clear any existing reconnect timeout
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
  
  // If we've exceeded the maximum number of attempts, stop trying
  if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
    console.error(`Failed to connect to native host after ${MAX_CONNECTION_ATTEMPTS} attempts. Giving up.`);
    // Notify any open tabs about the connection failure
    browser.tabs.query({}).then(tabs => {
      tabs.forEach(tab => {
        if (tab.url && tab.url.includes("gemini.google.com")) {
          browser.tabs.sendMessage(tab.id, {
            type: "NATIVE_HOST_CONNECTION_STATUS",
            payload: { connected: false, error: "Failed to connect after multiple attempts" }
          }).catch(err => {
            // Ignore errors here, as the tab might not have the content script loaded
          });
        }
      });
    }).catch(err => {
      console.error("Error querying tabs:", err);
    });
    return;
  }
  
  connectionAttempts++;
  console.log(`Attempting to connect to native host: ${nativeHostName} (Attempt ${connectionAttempts} of ${MAX_CONNECTION_ATTEMPTS})`);
  
  try {
    port = browser.runtime.connectNative(nativeHostName);
    console.log("Successfully connected to native host.");
    
    // Reset connection attempts on successful connection
    connectionAttempts = 0;
    
    // Notify any open tabs about the successful connection
    browser.tabs.query({}).then(tabs => {
      tabs.forEach(tab => {
        if (tab.url && tab.url.includes("gemini.google.com")) {
          browser.tabs.sendMessage(tab.id, {
            type: "NATIVE_HOST_CONNECTION_STATUS",
            payload: { connected: true }
          }).catch(err => {
            // Ignore errors here, as the tab might not have the content script loaded
          });
        }
      });
    }).catch(err => {
      console.error("Error querying tabs:", err);
    });

    port.onMessage.addListener((response) => {
      try {
        // Validate the response structure
        if (!response) {
          console.error("Received empty response from native host");
          return;
        }
        
        // Handle different response types
        if (response.payload && response.payload.type === "PROMPT_RESPONSE" || 
            (response.payload && response.payload.type === "CUSTOM_PROMPT")) {
          // Get the prompt from the payload
          const promptToSend = response.payload.prompt;
          
          if (response.tabId && promptToSend) {
            const tabId = response.tabId;
            
            // Check if the tab still exists before sending the message
            browser.tabs.get(tabId).then(tab => {
              return browser.tabs.sendMessage(tabId, {
                type: "PROMPT_FROM_NATIVE_HOST",
                payload: { 
                  prompt: promptToSend,
                  isCustomPrompt: response.payload.type === "CUSTOM_PROMPT"
                }
              });
            }).then(() => {
              // console.log(`Background: PROMPT_FROM_NATIVE_HOST message successfully sent to tab ${tabId}`);
            }).catch(err => {
              console.error(`Background: Error sending PROMPT_FROM_NATIVE_HOST message to tab ${tabId}:`, err);
            });
          } else if (!response.tabId && promptToSend) {
            // No tabId provided, find an active tab with Gemini
            console.log("Background: No tabId provided for prompt, finding active Gemini tab");
            
            browser.tabs.query({ active: true, currentWindow: true })
              .then(tabs => {
                const geminiTabs = tabs.filter(tab => tab.url && tab.url.includes("gemini.google.com"));
                
                if (geminiTabs.length > 0) {
                  const activeTabId = geminiTabs[0].id;
                  console.log("Background: Found active Gemini tab:", activeTabId);
                  
                  return browser.tabs.sendMessage(activeTabId, {
                    type: "PROMPT_FROM_NATIVE_HOST",
                    payload: { 
                      prompt: promptToSend,
                      isCustomPrompt: response.payload.type === "CUSTOM_PROMPT"
                    }
                  });
                } else {
                  // Try any tab with Gemini
                  return browser.tabs.query({ url: "*://gemini.google.com/*" })
                    .then(allGeminiTabs => {
                      if (allGeminiTabs.length > 0) {
                        const tabId = allGeminiTabs[0].id;
                        console.log("Background: Found Gemini tab:", tabId);
                        
                        return browser.tabs.sendMessage(tabId, {
                          type: "PROMPT_FROM_NATIVE_HOST",
                          payload: { 
                            prompt: promptToSend,
                            isCustomPrompt: response.payload.type === "CUSTOM_PROMPT"
                          }
                        });
                      } else {
                        throw new Error("No Gemini tabs found");
                      }
                    });
                }
              })
              .then(() => {
                console.log("Background: PROMPT_FROM_NATIVE_HOST message successfully sent");
              })
              .catch(err => {
                console.error("Background: Error sending PROMPT_FROM_NATIVE_HOST message:", err);
              });
          } else {
            console.warn("Background: Malformed PROMPT_RESPONSE from native host. Missing prompt.", response);
          }
        } else if (response.tabId && response.payload) { // Existing handling for other messages like tool results
          // Check if the tab still exists before sending the message
          browser.tabs.get(response.tabId).then(tab => {
            return browser.tabs.sendMessage(response.tabId, {
              type: "FROM_NATIVE_HOST",
              payload: response.payload
            });
          }).then(() => {
            // console.log(`Background: FROM_NATIVE_HOST message sent to tab ${response.tabId}`);
          }).catch(err => {
            console.error(`Background: Error sending FROM_NATIVE_HOST message to tab ${response.tabId}:`, err);
          });
        } else {
          console.warn("Background: No tabId in response from native host or missing payload. Cannot forward to content script.", response);
        }
      } catch (error) {
        console.error("Error processing message from native host:", error);
      }
    });

    port.onDisconnect.addListener(() => {
      console.log("Disconnected from native host.");
      if (port && port.error) { // Check if port exists before accessing error
        console.error("Native host disconnect error:", port.error.message);
      }
      port = null; // Reset port
      
      // Notify any open tabs about the disconnection
      browser.tabs.query({}).then(tabs => {
        tabs.forEach(tab => {
          if (tab.url && tab.url.includes("gemini.google.com")) {
            browser.tabs.sendMessage(tab.id, {
              type: "NATIVE_HOST_CONNECTION_STATUS",
              payload: { connected: false, error: "Native host disconnected" }
            }).catch(err => {
              // Ignore errors here, as the tab might not have the content script loaded
            });
          }
        });
      }).catch(err => {
        console.error("Error querying tabs:", err);
      });
      
      // Attempt to reconnect with exponential backoff
      const reconnectDelay = Math.min(RECONNECT_DELAY_MS * Math.pow(2, connectionAttempts - 1), 30000); // Max 30 seconds
      console.log(`Will attempt to reconnect in ${reconnectDelay/1000} seconds...`);
      reconnectTimeoutId = setTimeout(connectToNativeHost, reconnectDelay);
    });

  } catch (error) {
    console.error("Error connecting to native host:", error);
    port = null;
    
    // Attempt to reconnect with exponential backoff
    const reconnectDelay = Math.min(RECONNECT_DELAY_MS * Math.pow(2, connectionAttempts - 1), 30000); // Max 30 seconds
    console.log(`Will attempt to reconnect in ${reconnectDelay/1000} seconds...`);
    reconnectTimeoutId = setTimeout(connectToNativeHost, reconnectDelay);
  }
}

// Listen for messages from content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Process message from content script
  
  if (message.type === "GET_PROMPT") {
    // Handle GET_PROMPT message
    
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
  } else if (message.type === "CHECK_NATIVE_HOST_CONNECTION") {
    // Send the current connection status back to the content script or popup
    const isConnected = !!port; // Convert to boolean
    const connectionStatus = {
      connected: isConnected,
      error: isConnected ? null : "Native host not connected"
    };
    
    console.log("Responding to CHECK_NATIVE_HOST_CONNECTION with:", connectionStatus);
    sendResponse(connectionStatus);
    
    // Also send a NATIVE_HOST_CONNECTION_STATUS message to ensure the UI is updated
    // This is mainly for content scripts in tabs, as the popup will get the direct response
    if (sender.tab && sender.tab.id) {
      browser.tabs.sendMessage(sender.tab.id, {
        type: "NATIVE_HOST_CONNECTION_STATUS",
        payload: connectionStatus
      }).catch(err => {
        console.error("Error sending connection status to tab:", err);
      });
    }
    
    return true;
  } else if (message.type === "TOOL_CALL_DETECTED" || message.type === "REPROCESS_TOOL_CALL") {
    const callId = message.payload && message.payload.call_id;
    const isReprocessing = message.type === "REPROCESS_TOOL_CALL";
    
    // Log the action
    if (isReprocessing) {
      console.log(`Reprocessing tool call with ID: ${callId}`);
    }

    // Only check for duplicate call_id if not reprocessing
    if (callId && !isReprocessing) {
      if (processedCallIds.has(callId)) {
        console.warn(`Duplicate call_id detected, skipping: ${callId}`);
        // Optionally send a response to the content script indicating a duplicate
        sendResponse({ status: "Duplicate call_id, message not forwarded." });
        return true; // We're sending a response
      }
      processedCallIds.add(callId);
      // console.log(`New call_id ${callId} added to processed set.`);
    }

    if (!port) {
        connectToNativeHost();
    }
    
    if (port) {
        // Create a new message to send to the native host
        const messageToNative = {
            // Always use TOOL_CALL_DETECTED as the type for the native host
            type: "TOOL_CALL_DETECTED",
            tabId: sender.tab ? sender.tab.id : null,
            payload: message.payload
        };
        
        // If this is a reprocessing request, modify the payload to bypass duplicate check
        if (isReprocessing) {
          // Generate a new unique call_id by appending a timestamp
          const timestamp = Date.now();
          const originalCallId = messageToNative.payload.call_id;
          const newCallId = `${originalCallId}_reprocess_${timestamp}`;
          
          // Normalize XML
          let modifiedXml = messageToNative.payload.raw_xml;
          try {
            modifiedXml = modifiedXml
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .replace(/&amp;/g, '&');
          } catch (error) {
            console.error("Error normalizing XML in reprocessing:", error);
            // Use the original XML if normalization fails
          }
            
          // Replace the call_id in the XML
          modifiedXml = modifiedXml.replace(
            new RegExp(`call_id=["']${originalCallId}["']`, 'g'), 
            `call_id="${newCallId}"`
          );
          
          // Update the payload with the modified XML and call_id
          messageToNative.payload.raw_xml = modifiedXml;
          messageToNative.payload.call_id = newCallId;
          
          console.log(`Modified call_id from ${originalCallId} to ${newCallId} for reprocessing`);
          
          // Send a response to the content script
          sendResponse({ 
            status: "Reprocessing request sent to native host",
            newCallId: newCallId
          });
        }
        
        // Send the message to the native host
        sendToNativeHost(messageToNative);
    } else {
        console.error("Failed to connect to native host. Message not sent.");
        sendResponse({ 
          status: "Failed to forward message.", 
          error: "Native host connection failed." 
        });
    }
    
    // Return true to indicate we're sending a response asynchronously
    return true;
  }
  return false; // Default handling for other messages
});

// Initial connection attempt when the background script loads
connectToNativeHost();
