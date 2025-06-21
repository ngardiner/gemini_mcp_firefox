document.addEventListener('DOMContentLoaded', function() {
    const toggleSwitch = document.getElementById('mcp-client-toggle');
    const injectPromptButton = document.getElementById('inject-prompt-button');
    const statusMessage = document.getElementById('status-message');
    const connectionStatus = document.getElementById('connection-status');
    
    // Set up a periodic check for connection status
    let connectionCheckInterval = null;
    
    // Helper function to send message to active tab
    function sendMessageToActiveTab(message) {
        browser.tabs.query({ active: true, currentWindow: true })
            .then(tabs => {
                if (tabs.length > 0) {
                    return browser.tabs.sendMessage(tabs[0].id, message);
                }
            })
            .then(response => {
                // Process response from content script
            })
            .catch(error => {
                console.error("Error sending message to tab:", error);
                updateStatus('Error communicating with page');
            });
    }
    
    // Helper function to update status message
    function updateStatus(message) {
        statusMessage.textContent = message;
    }
    
    // Function to update connection status display
    function updateConnectionStatus(isConnected, errorMessage) {
        if (isConnected) {
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'connection-status status-connected';
            connectionStatus.title = 'Native host is connected';
            injectPromptButton.disabled = false;
        } else {
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.className = 'connection-status status-disconnected';
            connectionStatus.title = errorMessage || 'Native host is not connected';
            injectPromptButton.disabled = true;
        }
    }
    
    // Function to check connection status
    function checkConnectionStatus() {
        browser.runtime.sendMessage({ type: "CHECK_NATIVE_HOST_CONNECTION" })
            .then(response => {
                // Update connection status based on response
                // Update the connection status based on the response
                updateConnectionStatus(response.connected, response.error);
            })
            .catch(error => {
                console.error("Error checking native host connection:", error);
                updateConnectionStatus(false, error.message);
            });
    }
    
    // Initial connection status check
    checkConnectionStatus();
    
    // Set up periodic connection status check (every 2 seconds)
    connectionCheckInterval = setInterval(checkConnectionStatus, 2000);
        
    // Listen for connection status updates
    browser.runtime.onMessage.addListener((message) => {
        if (message.type === 'NATIVE_HOST_CONNECTION_STATUS') {
            updateConnectionStatus(message.payload.connected, message.payload.error);
        }
    });

    // Load saved state
    browser.storage.local.get('mcpClientEnabled').then(result => {
        const enabled = result.mcpClientEnabled !== undefined ? result.mcpClientEnabled : true;
        toggleSwitch.checked = enabled;
        updateStatus(enabled ? 'MCP Client is active' : 'MCP Client is disabled');
    }).catch(error => {
        console.error("Error loading saved state:", error);
        updateStatus('Error loading settings');
    });

    // Toggle switch event listener
    toggleSwitch.addEventListener('change', function() {
        const isEnabled = toggleSwitch.checked;
        
        // Save state
        browser.storage.local.set({ mcpClientEnabled: isEnabled }).catch(error => {
            console.error("Error saving state:", error);
        });
        
        // Send message to content script
        sendMessageToActiveTab({ type: 'TOGGLE_MCP_CLIENT', enabled: isEnabled });
        
        updateStatus(isEnabled ? 'MCP Client activated' : 'MCP Client deactivated');
    });

    // Inject prompt button event listener
    injectPromptButton.addEventListener('click', function() {
        updateStatus('Requesting prompt...');
        
        // Send message to content script to request a prompt
        // This ensures the request comes from the content script which has a valid tabId
        browser.tabs.query({ active: true, currentWindow: true })
            .then(tabs => {
                if (tabs.length > 0) {
                    // Send request to content script
                    return browser.tabs.sendMessage(tabs[0].id, { 
                        type: "REQUEST_INJECT_PROMPT" 
                    });
                } else {
                    throw new Error("No active tab found");
                }
            })
            .then(response => {
                updateStatus('Prompt request sent to content script');
            })
            .catch(error => {
                console.error("Error sending REQUEST_INJECT_PROMPT message:", error);
                updateStatus('Error: ' + error.message);
            });
    });
    
    // Clean up when popup is closed
    window.addEventListener('unload', function() {
        if (connectionCheckInterval) {
            clearInterval(connectionCheckInterval);
        }
    });
});