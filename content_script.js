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
    try {
        const doc = new DOMParser().parseFromString(htmlStringWithEntities, 'text/html');
        return doc.documentElement.textContent;
    } catch (error) {
        console.error("Error unescaping HTML entities:", error);
        // Return the original string if parsing fails
        return htmlStringWithEntities;
    }
}

// Function to safely normalize XML
function safeNormalizeXml(xmlString) {
    if (typeof xmlString !== 'string') return '';
    try {
        // Replace HTML-encoded angle brackets and other entities
        return xmlString
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    } catch (error) {
        console.error("Error normalizing XML:", error);
        // Return the original string if normalization fails
        return xmlString;
    }
}

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

    if (isToolResult) {
        // For tool results (raw XML), inject as textContent directly.
        // No HTML wrapping or escaping, as it's raw XML to be sent.
        chatInputField.textContent = textToInject;
        console.log("Gemini MCP Client [DEBUG]: Injecting raw XML for tool result into input field:", textToInject.substring(0, 100) + "...");
        
        // Store the tool result in a global variable for debugging
        window.lastToolResult = textToInject;
    } else {
        // For prompts (plain text), inject as textContent
        chatInputField.textContent = textToInject;
        console.log("Gemini MCP Client [DEBUG]: Injected plain text for prompt.");
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
    console.log("Gemini MCP Client [DEBUG]: processPotentialMessageContainer triggered for:", containerElement);

    // First try with the original selector that worked in v0.3
    let lineElements = containerElement.querySelectorAll('p.query-text-line');
    
    // If that doesn't find anything, try with additional selectors
    if (lineElements.length === 0) {
        lineElements = containerElement.querySelectorAll('p, div > span');
    }
    
    if (lineElements.length === 0) {
        console.log("Gemini MCP Client [DEBUG]: No text elements found in container:", containerElement);
        
        // If no line elements, check if the container itself contains the text directly
        if (containerElement.textContent) {
            const directText = containerElement.textContent.trim();
            
            // Use the unescapeHtmlEntities function directly on the container text
            const unescapedDirectXml = unescapeHtmlEntities(directText);
            
            // Check if it's a tool result, using the same logic as v0.3
            if (unescapedDirectXml.trim().startsWith("<tool_result") && 
                unescapedDirectXml.trim().endsWith("</tool_result>")) {
                console.log("Gemini MCP Client [DEBUG]: Identified tool result in direct container text");
                handleFoundCodeElement(containerElement, "directContainerText", true, unescapedDirectXml);
            }
        }
        return;
    }

    let reconstructedXml = "";
    lineElements.forEach(line => {
        reconstructedXml += line.textContent; // Add newlines if they were stripped and are needed for parsing/matching
    });

    reconstructedXml = reconstructedXml.trim(); // Trim whitespace

    // Use the unescapeHtmlEntities function - this is the key part from v0.3
    const unescapedXml = unescapeHtmlEntities(reconstructedXml);

    console.log("Gemini MCP Client [DEBUG]: Reconstructed and Unescaped XML from message container:", 
                unescapedXml.substring(0, 200) + "...");

    // Check if it's a tool result, using trim() on the unescaped XML - exactly as in v0.3
    if (unescapedXml.trim().startsWith("<tool_result") && unescapedXml.trim().endsWith("</tool_result>")) {
        console.log("Gemini MCP Client [DEBUG]: Identified tool result in message container:", containerElement);
        
        // Call handleFoundCodeElement, passing the container as the element to be replaced,
        // and the unescaped XML - exactly as in v0.3
        handleFoundCodeElement(containerElement, "messageContainerResult", true, unescapedXml);
    } 
    // Check if it's a tool result response that has been stripped of its XML tags
    // This pattern looks for the format that appears in the logs: "    2    list_objects    {    "success": true, ..."
    else if (unescapedXml.trim().match(/\s+\d+\s+\w+\s+\{/) || 
             unescapedXml.includes("success") && unescapedXml.includes("message") && 
             (unescapedXml.includes("objects") || unescapedXml.includes("result"))) {
        
        console.log("Gemini MCP Client [DEBUG]: Identified stripped tool result in message container:", containerElement);
        
        // Extract the call_id and tool_name from the text if possible
        const parts = unescapedXml.trim().split(/\s+/);
        let callId = null;
        let toolName = null;
        
        if (parts.length >= 2 && !isNaN(parseInt(parts[0]))) {
            callId = parts[0].trim();
            toolName = parts[1].trim();
        }
        
        // Reconstruct the tool result XML
        const reconstructedXml = `<tool_result>
  <call_id>${callId || "unknown"}</call_id>
  <tool_name>${toolName || "unknown"}</tool_name>
  <r>${unescapedXml}</r>
</tool_result>`;
        
        // Call handleFoundCodeElement with the reconstructed XML
        handleFoundCodeElement(containerElement, "reconstructedToolResult", true, reconstructedXml);
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

        // Normalize XML using the safe function
        const normalizedXml = safeNormalizeXml(actualXml);
        
        if (normalizedXml.startsWith("<function_calls>") && normalizedXml.endsWith("</function_calls>")) {
            isFunctionCall = true;
            isResultBlock = false; // Explicitly not a result block
            // Try to get call_id from dataset
            if (codeContentElement.dataset.callId) {
                parsedCallId = codeContentElement.dataset.callId;
            } else if (codeContentElement.parentElement && codeContentElement.parentElement.dataset.callId) {
                parsedCallId = codeContentElement.parentElement.dataset.callId;
            }
            // Fallback: parse from normalizedXml for function calls if no dataset.
            if (!parsedCallId) {
                const match = normalizedXml.match(/<invoke[^>]*call_id=["'](.*?)["']/);
                if (match && match[1]) parsedCallId = match[1];
            }
            displayIdentifierText = `Tool Call ID: ${parsedCallId || 'N/A'}`;
            
            // Update actualXml to use the normalized version
            actualXml = normalizedXml;
        } else if (normalizedXml.startsWith("<tool_result") && normalizedXml.endsWith("</tool_result>") ||
                 actualXml.startsWith("<tool_result") && actualXml.endsWith("</tool_result>")) {
            // This case (finding a tool_result directly in a code tag not from processPotentialMessageContainer)
            // means Gemini rendered it inside a single code block.
            isResultBlock = true;
            isFunctionCall = false;
            
            // Try to extract call_id from either normalized or actual XML
            let match = normalizedXml.match(/<tool_result[^>]*call_id=["'](.*?)["']/);
            if (!match) {
                match = actualXml.match(/<tool_result[^>]*call_id=["'](.*?)["']/);
            }
            
            if (match && match[1]) parsedCallId = match[1];
            displayIdentifierText = parsedCallId ? `Tool Result ID: ${parsedCallId}` : "Tool Result";
            
            // Use whichever XML version has the tool_result
            if (normalizedXml.startsWith("<tool_result")) {
                actualXml = normalizedXml;
            }
        } else {
            // console.log("Gemini MCP Client [DEBUG]: Direct <code> element content does not match known structures. Skipping UI.", passedElement);
            // Unset mcpProcessed if we are not handling it, so other processors (if any) could try.
            // Or, if this is the final processor for this element, keep it set. For now, keep it.
            // delete passedElement.dataset.mcpProcessed;
            return;
        }
    } else { // explicitXml is provided (from processPotentialMessageContainer)
        // Normalize XML using the safe function
        const normalizedXml = safeNormalizeXml(actualXml);
            
        // Update actualXml to use the normalized version
        actualXml = normalizedXml;
        
        if (isResultBlock) { // isResultBlockFromCaller was true
            // actualXml is now the normalized XML
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
        reprocessItem.classList.add('mcp-dropdown-item');
        reprocessItem.textContent = 'Reprocess';
        
        // Add click listener for reprocessing
        reprocessItem.addEventListener('click', (event) => {
            event.stopPropagation();
            
            // Show a visual indicator that reprocessing is happening
            const originalText = reprocessItem.textContent;
            reprocessItem.textContent = 'Reprocessing...';
            reprocessItem.classList.add('mcp-dropdown-item-processing');
            
            // Send the tool call to the background script with a flag to force reprocessing
            browser.runtime.sendMessage({
                type: "REPROCESS_TOOL_CALL",
                payload: {
                    raw_xml: actualXml,
                    call_id: parsedCallId,
                    force_reprocess: true
                }
            })
            .then(response => {
                console.log("Response from reprocessing:", response);
                
                if (response && response.status === "Reprocessing request sent to native host") {
                    // Show success message
                    reprocessItem.textContent = 'Reprocessing sent!';
                    
                    // If we have a new call ID, update the display
                    if (response.newCallId) {
                        console.log(`Tool call reprocessed with new ID: ${response.newCallId}`);
                        
                        // Optionally update the display text with the new call ID
                        if (toolCallBarText) {
                            const originalDisplayText = toolCallBarText.textContent;
                            toolCallBarText.textContent = `${originalDisplayText} (Reprocessing)`;
                            
                            // Restore after a delay
                            setTimeout(() => {
                                toolCallBarText.textContent = originalDisplayText;
                            }, 5000);
                        }
                    }
                } else {
                    // Show error or unknown response
                    reprocessItem.textContent = 'Unknown response';
                }
                
                // Reset the menu item text after a delay
                setTimeout(() => {
                    reprocessItem.textContent = originalText;
                    reprocessItem.classList.remove('mcp-dropdown-item-processing');
                    
                    // Close the dropdown menu
                    dropdownMenu.style.display = 'none';
                    dropdownMenu.classList.remove('mcp-active');
                }, 2000);
            })
            .catch(error => {
                console.error("Error reprocessing tool call:", error);
                reprocessItem.textContent = 'Error: ' + error.message;
                
                // Reset the menu item text after a short delay
                setTimeout(() => {
                    reprocessItem.textContent = originalText;
                    reprocessItem.classList.remove('mcp-dropdown-item-processing');
                }, 3000);
            });
        });
        
        dropdownMenu.appendChild(reprocessItem);
    }

    dropdownMenu.appendChild(collapseItem); // Collapse is always present, usually last.
    toolCallBar.appendChild(dropdownMenu);

    // Store references for the click listener on the wrapper/codeElement toggle
    let effectiveTargetElement = null; // This will be the element to show/hide
    let isCodeCurrentlyHidden = true; // Initial state

    // Insert the bar logic (slightly adjusted)
    // const parentElement = passedElement.parentElement; // parentElement might not be relevant if passedElement is a container

    // DOM Manipulation
    if (isResultBlock) {
        // If explicitXml was provided, passedElement is the container (e.g., div.query-text)
        // If explicitXml was null, passedElement is a <code> tag containing tool_result.
        // In both cases, we want to create a consistent UI for the tool result
        
        console.log("Gemini MCP Client [DEBUG]: Creating UI for tool result. Source:", sourceType);
        
        // First, create a wrapper to hold both the tool bar and the original content
        const resultWrapper = document.createElement('div');
        resultWrapper.classList.add('mcp-tool-result-wrapper');
        
        if (explicitXml) { // Called from processPotentialMessageContainer
            effectiveTargetElement = passedElement;
            
            // Create a pre-formatted code element to hold the XML content
            const codeElement = document.createElement('pre');
            codeElement.classList.add('mcp-tool-result-code');
            const codeContent = document.createElement('code');
            codeContent.textContent = actualXml;
            codeElement.appendChild(codeContent);
            
            // Add the code element to the wrapper
            resultWrapper.appendChild(codeElement);
            
            // Replace the original element with our wrapper
            if (effectiveTargetElement && effectiveTargetElement.parentNode) {
                effectiveTargetElement.parentNode.insertBefore(resultWrapper, effectiveTargetElement);
                effectiveTargetElement.remove();
                
                // Set the effective target to our new code element
                effectiveTargetElement = codeElement;
            } else {
                console.error("Gemini MCP Client [ERROR]: Could not replace Tool Result XML. ParentNode missing or effectiveTargetElement issue.");
                return;
            }
        } else { // Called with a <code> tag that contains a tool_result
            // Find the appropriate container for the tool result
            let messageContainer = passedElement.closest('.model-response-text'); // Common message wrapper
            if (!messageContainer) {
                const preElement = passedElement.parentElement; // Should be <pre>
                if (preElement && preElement.tagName === 'PRE') {
                    messageContainer = preElement.parentElement;
                } else {
                    messageContainer = preElement || passedElement.parentElement;
                }
            }
            
            // Create a pre-formatted code element if needed
            let codeElement;
            if (passedElement.tagName === 'CODE' && passedElement.parentElement.tagName === 'PRE') {
                // Use the existing pre element
                codeElement = passedElement.parentElement;
                effectiveTargetElement = codeElement;
            } else {
                // Create a new pre element
                codeElement = document.createElement('pre');
                codeElement.classList.add('mcp-tool-result-code');
                const codeContent = document.createElement('code');
                codeContent.textContent = actualXml;
                codeElement.appendChild(codeContent);
                effectiveTargetElement = codeElement;
            }
            
            // Add the code element to the wrapper
            resultWrapper.appendChild(codeElement);
            
            // Replace the original element with our wrapper
            if (messageContainer && messageContainer.parentNode) {
                messageContainer.parentNode.insertBefore(resultWrapper, messageContainer);
                messageContainer.remove();
            } else if (passedElement.parentElement) {
                passedElement.parentElement.insertBefore(resultWrapper, passedElement);
                passedElement.remove();
            } else {
                console.error("Gemini MCP Client [ERROR]: Could not replace Tool Result XML. No suitable parent found.");
                return;
            }
        }
        
        // Insert the tool bar at the beginning of the wrapper
        resultWrapper.insertBefore(toolCallBar, resultWrapper.firstChild);
        
        // Initially hide the code element
        effectiveTargetElement.style.display = 'none';
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
    } else if (isResultBlock && effectiveTargetElement) {
        // For tool results, toggle visibility of the original element
        toolCallBarText.addEventListener('click', () => {
            if (effectiveTargetElement) {
                const isHidden = effectiveTargetElement.style.display === 'none';
                effectiveTargetElement.style.display = isHidden ? '' : 'none';
            }
        });
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
                
                // Find the parent wrapper and hide any visible code elements
                const otherBar = otherDropdown.closest('.mcp-tool-call-bar');
                if (otherBar) {
                    const wrapper = otherBar.closest('.mcp-tool-result-wrapper');
                    if (wrapper) {
                        const codeElement = wrapper.querySelector('.mcp-tool-result-code');
                        if (codeElement) {
                            codeElement.style.display = 'none';
                        }
                    }
                }
            }
        });

        if (isActive) {
            dropdownMenu.style.display = 'none';
            dropdownMenu.classList.remove('mcp-active');
            if (isResultBlock && effectiveTargetElement) {
                effectiveTargetElement.style.display = 'none';
            }
        } else {
            // If it's a function call or result block and its effectiveTargetElement is hidden, show it when menu opens.
            if ((isFunctionCall || isResultBlock) && effectiveTargetElement && effectiveTargetElement.style.display === 'none') {
                effectiveTargetElement.style.display = '';
            } 
            
            // For result blocks, we now just show the existing code element
            if (isResultBlock && effectiveTargetElement) {
                // No need to create a new element, just show the existing one
                effectiveTargetElement.style.display = '';
            }
            dropdownMenu.style.display = 'block';
            dropdownMenu.classList.add('mcp-active');
        }
    });

    // Collapse item listener to hide the target element
    collapseItem.addEventListener('click', (event) => {
        event.stopPropagation();
        // Hide the original element for both function calls and tool results
        if (effectiveTargetElement) {
            effectiveTargetElement.style.display = 'none';
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
            
            // Also hide any visible code elements in the wrapper
            const wrapper = owningBar.closest('.mcp-tool-result-wrapper');
            if (wrapper) {
                const codeElement = wrapper.querySelector('.mcp-tool-result-code');
                if (codeElement) {
                    codeElement.style.display = 'none';
                }
            }
            
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
  console.log("Gemini MCP Client [DEBUG]: Received message from background script:", message);
  if (message.type === "FROM_NATIVE_HOST" && message.payload && message.payload.text_response) {
    console.log("Gemini MCP Client [DEBUG]: Received text_response from native host for injection:", 
               message.payload.text_response.substring(0, 100) + "...");
               
    // Check if this is a tool result
    const isToolResultResponse = message.payload.text_response.includes("<tool_result");
    console.log("Is tool result response:", isToolResultResponse);
    
    injectAndSendMessage(message.payload.text_response, true) // isToolResult is true for native host responses
        .then(success => {
            if (success) {
                console.log("Gemini MCP Client [DEBUG]: Successfully injected and sent native host response via injectAndSendMessage.");
            }
        })
        .catch(error => {
            console.error("Gemini MCP Client [ERROR]: Error injecting native host response via injectAndSendMessage:", error.message);
        });
  } else if (message.type === "PROMPT_FROM_NATIVE_HOST" && message.payload && message.payload.prompt) {
    // console.log("Gemini MCP Client [DEBUG]: PROMPT_FROM_NATIVE_HOST received in content_script:", message); // Added per requirement
    const promptToInject = message.payload.prompt;
    const isCustomPrompt = message.payload.isCustomPrompt === true;
    
    console.log(`Gemini MCP Client [DEBUG]: Received ${isCustomPrompt ? 'custom' : 'system'} prompt:`, 
                promptToInject.substring(0, 50) + "...");
    
    try {
      injectAndSendMessage(promptToInject, false) // isToolResult is false for prompts
          .then(success => {
              if (success) {
                  console.log(`Gemini MCP Client [DEBUG]: Successfully injected and sent ${isCustomPrompt ? 'custom' : 'system'} prompt.`);
              }
          })
          .catch(error => {
              // This catches errors from the promise returned by injectAndSendMessage (e.g., async errors, rejections)
              console.error(`Gemini MCP Client [ERROR]: Error injecting ${isCustomPrompt ? 'custom' : 'system'} prompt (async):`, 
                           error.message, error);
          });
    } catch (e) {
      // This catches synchronous errors that might occur when injectAndSendMessage is called, before a promise is returned.
      console.error(`Gemini MCP Client [CONTENT_SCRIPT_ERROR]: Synchronous error during ${isCustomPrompt ? 'custom' : 'system'} prompt injection:`, 
                   e, e.message, e.stack);
    }
  } else if (message.type === "FROM_NATIVE_HOST") {
    console.warn("Gemini MCP Client [DEBUG]: Received FROM_NATIVE_HOST message but no text_response found.", message.payload);
  } else if (message.type === "PROMPT_FROM_NATIVE_HOST") {
    console.warn("Gemini MCP Client [DEBUG]: Received PROMPT_FROM_NATIVE_HOST message but no prompt found.", message.payload);
  }
}

// We've removed the setupUI, showUI, and hideUI functions since we're now using only the popup UI
// The content script will still handle tool calls and respond to messages from the popup

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
        .mcp-dropdown-item-processing {
            color: #0056b3;
            font-style: italic;
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
        .mcp-dummy-prompt-button:disabled {
            background-color: #cccccc;
            border-color: #999999;
            cursor: not-allowed;
            opacity: 0.7;
        }
        .mcp-status-container {
            margin: 10px 0;
            display: flex;
            align-items: center;
        }
        .mcp-status-label {
            margin-right: 5px;
        }
        .mcp-connection-status {
            padding: 2px 6px;
            border-radius: 3px;
            font-weight: bold;
            font-size: 12px;
        }
        .mcp-status-connected {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .mcp-status-disconnected {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .mcp-toggle-container {
            margin-bottom: 10px;
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
        .mcp-tool-result-wrapper {
            margin: 8px 0;
            border-radius: 4px;
            overflow: hidden;
        }
        .mcp-tool-result-code {
            margin: 0;
            padding: 10px;
            background-color: #f8f8f8;
            border: 1px solid #ddd;
            border-top: none;
            font-family: "SF Mono", "Consolas", "Menlo", monospace;
            font-size: 12px;
            white-space: pre-wrap;
            overflow-x: auto;
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
                        // First, check if the node itself is a div.query-text[dir="ltr"] (original v0.3 selector)
                        if (node.matches && node.matches('div.query-text[dir="ltr"]')) {
                            processPotentialMessageContainer(node);
                        }
                        
                        // Also search for these containers within descendants, ensuring node is an Element
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // First try the original v0.3 selector
                            const containers = node.querySelectorAll('div.query-text[dir="ltr"]');
                            containers.forEach(container => {
                                processPotentialMessageContainer(container);
                            });
                            
                            // Then try additional selectors for the new UI
                            const additionalContainers = node.querySelectorAll(
                                'div.model-response-text, pre, div.response-container, div.markdown-container'
                            );
                            
                            if (additionalContainers.length > 0) {
                                console.log(`Found ${additionalContainers.length} additional potential containers in node`);
                                additionalContainers.forEach(container => {
                                    processPotentialMessageContainer(container);
                                });
                            }
                            
                            // Also check for code elements that might contain tool results directly
                            const codeElements = node.querySelectorAll('code');
                            codeElements.forEach(codeEl => {
                                if (!codeEl.closest('.mcp-tool-call-bar')) {
                                    if (codeEl.textContent && codeEl.textContent.includes("<tool_result")) {
                                        console.log("Found code element with potential tool result XML:", codeEl);
                                        handleFoundCodeElement(codeEl, "code element with tool result", false, null);
                                    } 
                                    // Check for stripped tool results in code elements
                                    else if (codeEl.textContent && 
                                             (codeEl.textContent.match(/\s+\d+\s+\w+\s+\{/) ||
                                              (codeEl.textContent.includes("success") && 
                                               codeEl.textContent.includes("message") &&
                                               (codeEl.textContent.includes("objects") || 
                                                codeEl.textContent.includes("result"))))) {
                                        
                                        console.log("Found code element with stripped tool result:", codeEl);
                                        
                                        // Extract the call_id and tool_name if possible
                                        const text = codeEl.textContent.trim();
                                        const parts = text.split(/\s+/);
                                        let callId = null;
                                        let toolName = null;
                                        
                                        if (parts.length >= 2 && !isNaN(parseInt(parts[0]))) {
                                            callId = parts[0].trim();
                                            toolName = parts[1].trim();
                                        }
                                        
                                        // Reconstruct the tool result XML
                                        const reconstructedXml = `<tool_result>
  <call_id>${callId || "unknown"}</call_id>
  <tool_name>${toolName || "unknown"}</tool_name>
  <r>${text}</r>
</tool_result>`;
                                        
                                        handleFoundCodeElement(codeEl, "code element with reconstructed tool result", true, reconstructedXml);
                                    }
                                }
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
    console.log("On Gemini page, initializing observer");
    // Initialize styles but don't create the UI yet
    injectStyles();
    
    // Initialize and start the observer after styles are injected
    setTimeout(() => {
        initializeTargetNodeAndObserver(true); // initializeTargetNodeAndObserver must be defined
    }, 1000);
} else {
    console.log("Not on Gemini page, skipping UI and observer initialization");
}

// Global variable to track native host connection status
let isNativeHostConnected = false;
let nativeHostConnectionError = null;

// Listen for messages from the popup and background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content script received message:", message);
    
    if (message.type === 'REQUEST_INJECT_PROMPT') {
        console.log("Content script received REQUEST_INJECT_PROMPT message");
        
        // Check if native host is connected before sending the request
        if (!isNativeHostConnected) {
            console.error("Cannot request prompt: Native host is not connected");
            sendResponse({ 
                status: 'Error: Native host is not connected', 
                error: nativeHostConnectionError || "Unknown connection error" 
            });
            return true;
        }
        
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
    } else if (message.type === 'NATIVE_HOST_CONNECTION_STATUS') {
        // Update the connection status
        isNativeHostConnected = message.payload.connected;
        nativeHostConnectionError = message.payload.error || null;
        
        sendResponse({ status: 'Connection status updated' });
        return true;
    }
    return false;
});
