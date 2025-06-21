#!/bin/bash
# Get the directory where the script itself is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Path to venv Python interpreter
VENV_PYTHON="$DIR/venv/bin/python"

# Path to the target Python script
PYTHON_SCRIPT="$DIR/mcp_native_host.py"

# Activate venv (optional if directly calling venv python, but good for consistency)
# source "$DIR/venv/bin/activate"

# Execute the Python script with the venv's interpreter
# To enable the API, uncomment one of the lines below and comment out the last line
# exec "$VENV_PYTHON" "$PYTHON_SCRIPT" --enable-api
# exec "$VENV_PYTHON" "$PYTHON_SCRIPT" --enable-api --api-port 8765
exec "$VENV_PYTHON" "$PYTHON_SCRIPT"
