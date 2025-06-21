#!/usr/bin/env python3

import requests
import json
import sys

def send_prompt(prompt, api_url="http://localhost:8765/api/send_prompt"):
    """
    Sends a prompt to the MCP Native Host API and returns the response.
    
    Args:
        prompt (str): The prompt text to send to the API
        api_url (str): The URL of the API endpoint (default: http://localhost:8765/api/send_prompt)
        
    Returns:
        dict: The JSON response from the API
    """
    headers = {'Content-Type': 'application/json'}
    data = {'prompt': prompt}
    
    try:
        response = requests.post(api_url, headers=headers, data=json.dumps(data))
        response.raise_for_status()  # Raise an exception for HTTP errors
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}", file=sys.stderr)
        print("Make sure the MCP Native Host is running with the API enabled:", file=sys.stderr)
        print("  Linux/macOS: ./run_native_host.sh --enable-api", file=sys.stderr)
        print("  Windows: run_native_host.bat --enable-api", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: Failed to parse API response as JSON", file=sys.stderr)
        print(f"Response content: {response.text}", file=sys.stderr)
        sys.exit(1)

def main():
    # Check if there's any input from stdin
    if sys.stdin.isatty():
        print("Enter your prompt (Ctrl+D to submit):")
        prompt_lines = []
        try:
            for line in sys.stdin:
                prompt_lines.append(line)
        except KeyboardInterrupt:
            print("\nOperation cancelled by user", file=sys.stderr)
            sys.exit(1)
        prompt = "".join(prompt_lines)
    else:
        # Read from piped input
        prompt = sys.stdin.read()
    
    # Strip any trailing whitespace
    prompt = prompt.strip()
    
    if not prompt:
        print("Error: Empty prompt", file=sys.stderr)
        sys.exit(1)
    
    # Send the prompt to the API
    result = send_prompt(prompt)
    
    # Print the response
    if result.get('status') == 'success':
        print(result.get('response', 'No response received'))
    else:
        print(f"Error: {result.get('message', 'Unknown error')}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()