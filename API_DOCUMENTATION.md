# MCP Native Host API Documentation

This document describes the API interface for the MCP Native Host script.

## Enabling the API

The API is disabled by default for security reasons. To enable it, use the `--enable-api` flag when starting the native host script:

```bash
# Linux/macOS
./run_native_host.sh --enable-api

# Windows
run_native_host.bat --enable-api
```

Alternatively, you can edit the run scripts to uncomment the line that includes the `--enable-api` flag.

## API Endpoints

The API server runs on `http://localhost:8765` by default. You can change the port using the `--api-port` flag.

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
  "message": "Prompt received",
  "prompt": "Your prompt text here",
  "response": "Response from the MCP system"
}
```

## Example Usage

### Using curl

```bash
curl -X POST http://localhost:8765/api/send_prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is the weather like today?"}'
```

### Using JavaScript

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

## Security Considerations

The API server listens only on localhost by default, which means it can only be accessed from the same machine. If you need to access it from other machines, you would need to modify the code to listen on a specific IP address or all interfaces (0.0.0.0), but this is not recommended for security reasons.

Always be cautious about enabling the API in production environments, as it could potentially be used to execute arbitrary code if not properly secured.