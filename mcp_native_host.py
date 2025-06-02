import sys
import json
import struct

# Python 3.x version
# For Python 2.x, adjustments for string/byte handling might be needed.

# Helper function to read a message from stdin
def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        # This can happen if the browser closes the connection.
        return None
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

# Helper function to send a message to stdout
def send_message(message_content):
    encoded_content = json.dumps(message_content).encode('utf-8')
    message_length = struct.pack('@I', len(encoded_content))
    sys.stdout.buffer.write(message_length)
    sys.stdout.buffer.write(encoded_content)
    sys.stdout.buffer.flush()

# Example function to send a response back to the extension
# This would be called after processing a tool call and getting a result.
def send_example_response(original_message_tab_id, received_payload):
    # Construct your response payload
    response_payload = {
        "status": "success",
        "text_response": f"Python script processed: {received_payload.get('raw_xml', 'No raw_xml found')[:50]}...",
        "original_request": received_payload
    }

    message_to_send = {
        "tabId": original_message_tab_id, # Crucial for routing in background.js
        "payload": response_payload
    }
    # send_message(message_to_send) # Uncomment to send this example response
    # For debugging, let's print what would be sent
    print_debug(f"If uncommented, would send to extension: {json.dumps(message_to_send)}")


# Function to print debug messages to stderr (so it doesn't interfere with stdout protocol)
def print_debug(message):
    sys.stderr.write(str(message) + '\n')
    sys.stderr.flush()

def main():
    print_debug("MCP Native Host script started.")
    while True:
        try:
            received_message = get_message()
            if received_message is None:
                print_debug("No message received, browser might have closed connection. Exiting.")
                break # Exit loop if connection is closed

            print_debug(f"Received message: {json.dumps(received_message)}")

            # For now, just print the received tool call to the script's console (stderr)
            # In a real scenario, you would process `received_message.payload`
            # and potentially call an MCP server.

            # Example of how you might call the function to send a response:
            # if received_message.get("type") == "TOOL_CALL_DETECTED":
            #    tab_id = received_message.get("tabId")
            #    payload = received_message.get("payload")
            #    if tab_id and payload:
            #        # This is where you would do actual work and then send a real response
            #        send_example_response(tab_id, payload) # Call the example response function
            #    else:
            #        print_debug("Message was not a tool call or missing tabId/payload.")

            # Simple echo for testing bidirectional communication (uncomment to test)
            # tab_id = received_message.get("tabId")
            # if tab_id:
            #     send_message({
            #         "tabId": tab_id,
            #         "payload": {
            #             "text_response": f"Python script echoing: {received_message.get('payload', {}).get('raw_xml', 'N/A')}"
            #         }
            #     })
            #     print_debug("Sent echo response back to extension.")


        except EOFError:
            print_debug("EOF encountered, stdin closed. Exiting.")
            break # stdin closed, exit loop
        except Exception as e:
            print_debug(f"Error processing message: {e}")
            # Depending on the error, you might want to break or continue
            # If it's a struct.error due to malformed length, best to exit.
            if isinstance(e, struct.error):
                print_debug("Struct error, likely malformed message length. Exiting.")
                break
            # Continue for other errors for now, or implement more robust error handling.

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print_debug(f"Unhandled exception in main: {e}")
        sys.exit(1)

```
