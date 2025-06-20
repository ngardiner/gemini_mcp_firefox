#!/bin/bash

# This script helps with local development of the Firefox extension

# Check if web-ext is installed
if ! command -v web-ext &> /dev/null; then
    echo "web-ext is not installed. Installing it globally..."
    npm install -g web-ext
fi

# Function to display help
show_help() {
    echo "Firefox Extension Development Helper"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  run       Run the extension in Firefox"
    echo "  lint      Lint the extension"
    echo "  build     Build the extension"
    echo "  sign      Sign the extension with Mozilla (requires API credentials)"
    echo "  help      Show this help message"
    echo ""
}

# Parse command line arguments
case "$1" in
    run)
        echo "Running extension in Firefox..."
        web-ext run
        ;;
    lint)
        echo "Linting extension..."
        web-ext lint
        ;;
    build)
        echo "Building extension..."
        web-ext build --overwrite-dest
        echo "Extension built successfully! Check the web-ext-artifacts directory."
        ;;
    sign)
        echo "Signing extension with Mozilla..."
        if [ -z "$WEB_EXT_API_KEY" ] || [ -z "$WEB_EXT_API_SECRET" ]; then
            echo "Error: Mozilla API credentials not found."
            echo "Please set the following environment variables:"
            echo "  export WEB_EXT_API_KEY=your_api_key"
            echo "  export WEB_EXT_API_SECRET=your_api_secret"
            exit 1
        fi
        web-ext sign
        echo "Extension signed successfully! Check the web-ext-artifacts directory."
        ;;
    help|*)
        show_help
        ;;
esac