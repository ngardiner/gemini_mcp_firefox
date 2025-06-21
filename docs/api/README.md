# MCP Native Host API Documentation

This document provides detailed information about the API interface for the MCP Native Host script, including how to enable it, available endpoints, and usage examples.

## Overview

The MCP Native Host API provides a way to interact with the MCP system programmatically via HTTP requests. This allows external applications to send prompts to the MCP system and receive responses without going through the browser extension.

## Enabling the API

The API is **disabled by default** for security reasons. To enable it, use the `--enable-api` flag when starting the native host script:

```bash
# Linux/macOS
./run_native_host.sh --enable-api

# Windows
run_native_host.bat --enable-api
```

You can also specify a custom port using the `--api-port` flag:

```bash
# Linux/macOS
./run_native_host.sh --enable-api --api-port 9000

# Windows
run_native_host.bat --enable-api --api-port 9000
```

Alternatively, you can edit the run scripts to uncomment the line that includes the `--enable-api` flag for persistent configuration.

## API Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--enable-api` | `false` | Flag to enable the API server |
| `--api-port` | `8765` | Port number for the API server |

## API Endpoints

The API server runs on `http://localhost:8765` by default (or your custom port if specified).

### Send Prompt

**Endpoint:** `/api/send_prompt`

**Method:** POST

**Description:** Sends a prompt to the MCP system for processing.

**Request Body:**
```json
{
  "prompt": "Your prompt text here"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Prompt sent to browser extension",
  "prompt": "Your prompt text here",
  "response": "Prompt successfully sent to browser extension"
}
```

**Error Responses:**

- Missing prompt parameter:
  ```json
  {
    "status": "error",
    "message": "Missing prompt parameter"
  }
  ```

- Server error:
  ```json
  {
    "status": "error",
    "message": "Server error: [error details]"
  }
  ```

## CORS Support

The API includes CORS (Cross-Origin Resource Sharing) headers to allow requests from any origin. This enables web applications hosted on different domains to interact with the API.

## Usage Examples

### Using curl

```bash
curl -X POST http://localhost:8765/api/send_prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is the weather like today?"}'
```

### Using JavaScript (Fetch API)

```javascript
async function sendPrompt(prompt) {
  const response = await fetch('http://localhost:8765/api/send_prompt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });
  
  return await response.json();
}

// Example usage
sendPrompt('What is the weather like today?')
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));
```

### Using Python (requests)

```python
import requests
import json

def send_prompt(prompt):
    url = 'http://localhost:8765/api/send_prompt'
    headers = {'Content-Type': 'application/json'}
    data = {'prompt': prompt}
    
    response = requests.post(url, headers=headers, data=json.dumps(data))
    return response.json()

# Example usage
result = send_prompt('What is the weather like today?')
print(result)

# The response will look like:
# {
#   "status": "success",
#   "message": "Prompt sent to browser extension",
#   "prompt": "What is the weather like today?",
#   "response": "Prompt successfully sent to browser extension"
# }
```

## Implementation Details

The API server is implemented using Python's built-in `http.server` module. It runs in a separate thread from the main MCP Native Host process, allowing it to handle requests asynchronously without interrupting the main functionality.

Key components of the implementation:

1. **MCPAPIHandler**: A custom request handler class that processes HTTP requests
2. **start_api_server**: Function to initialize and start the API server in a separate thread
3. **stop_api_server**: Function to gracefully shut down the API server

## Security Considerations

The API server listens only on `localhost` by default, which means it can only be accessed from the same machine. This provides a basic level of security by preventing remote access.

**Important security notes:**

1. The API does not currently implement authentication or authorization. Any application on the local machine can access it.
2. If you need to access the API from other machines, you would need to modify the code to listen on a specific IP address or all interfaces (`0.0.0.0`), but this is **not recommended** for security reasons without implementing proper authentication.
3. Always be cautious about enabling the API in production environments, as it could potentially be used to execute arbitrary code if not properly secured.
4. Consider implementing rate limiting if you expect high volumes of requests.

## Future Enhancements

Potential future enhancements to the API include:

1. Authentication and authorization mechanisms
2. Additional endpoints for managing MCP configurations
3. Streaming responses for long-running prompts
4. Rate limiting and request throttling
5. Enhanced error handling and logging

## Troubleshooting

If you encounter issues with the API:

1. Verify the API is enabled with the `--enable-api` flag
2. Check that no other service is using the specified port
3. Examine the native host script's stderr output for error messages
4. Ensure your requests include the correct Content-Type header
5. Verify that your JSON payload is properly formatted

For further assistance, please refer to the main MCP documentation or open an issue in the project repository.