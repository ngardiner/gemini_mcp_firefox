document.addEventListener('DOMContentLoaded', function() {
    console.log("Popup loaded");
    const toggleSwitch = document.getElementById('mcp-client-toggle');
    const injectPromptButton = document.getElementById('inject-prompt-button');
    const statusMessage = document.getElementById('status-message');
    
    // Helper function to send message to active tab
    function sendMessageToActiveTab(message) {
        browser.tabs.query({ active: true, currentWindow: true })
            .then(tabs => {
                if (tabs.length > 0) {
                    return browser.tabs.sendMessage(tabs[0].id, message);
                }
            })
            .then(response => {
                console.log("Response from content script:", response);
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
    
    // When popup is opened, show the UI in the content script
    console.log("Sending message to show UI");
    sendMessageToActiveTab({ type: 'TOGGLE_UI', show: true });

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
                    console.log("Sending request to content script in tab:", tabs[0].id);
                    return browser.tabs.sendMessage(tabs[0].id, { 
                        type: "REQUEST_INJECT_PROMPT" 
                    });
                } else {
                    throw new Error("No active tab found");
                }
            })
            .then(response => {
                console.log("Response from content script:", response);
                updateStatus('Prompt request sent to content script');
            })
            .catch(error => {
                console.error("Error sending REQUEST_INJECT_PROMPT message:", error);
                updateStatus('Error: ' + error.message);
            });
    });
    
    // Hide UI when popup is closed
    window.addEventListener('unload', function() {
        sendMessageToActiveTab({ type: 'TOGGLE_UI', show: false });
    });
});