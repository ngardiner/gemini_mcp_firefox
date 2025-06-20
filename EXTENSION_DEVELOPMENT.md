# Firefox Extension Development Guide

This document provides information on how to develop, build, and release the Firefox extension.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [web-ext](https://github.com/mozilla/web-ext) tool: `npm install -g web-ext`

### Local Development

We provide a helper script for local development. Make sure it's executable:

```bash
chmod +x scripts/dev.sh
```

You can use the script as follows:

- **Run the extension in Firefox**: `./scripts/dev.sh run`
- **Lint the extension**: `./scripts/dev.sh lint`
- **Build the extension**: `./scripts/dev.sh build`
- **Sign the extension**: `./scripts/dev.sh sign` (requires API credentials)

### Manual Testing

1. Open Firefox
2. Enter `about:debugging` in the URL bar
3. Click "This Firefox"
4. Click "Load Temporary Add-on..."
5. Select any file in your extension's directory

## Continuous Integration

We use GitHub Actions for continuous integration and deployment. The workflows are defined in the `.github/workflows` directory.

### Available Workflows

1. **Build Firefox Extension** (`build-extension.yml`): Builds the extension without signing it.
2. **Build and Sign Firefox Extension** (`build-and-sign-extension.yml`): Builds and signs the extension with Mozilla's API.

For more details, see the [Workflows README](.github/workflows/README.md).

## Release Process

### Creating a New Release

1. Update your extension code and test it locally
2. Create and push a new tag with a version number:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. The GitHub Actions workflow will automatically:
   - Update the version in manifest.json
   - Build and sign the extension
   - Create a GitHub release with the signed extension attached

### Manual Release

If you prefer to create a release manually:

1. Update the version in `manifest.json`
2. Build the extension: `web-ext build`
3. Sign the extension: `web-ext sign --api-key YOUR_API_KEY --api-secret YOUR_API_SECRET`
4. The signed extension will be in the `web-ext-artifacts` directory

## Mozilla Add-on Submission

After signing the extension, you may need to submit it to the [Mozilla Add-on Store](https://addons.mozilla.org/):

1. Go to the [Mozilla Add-on Developer Hub](https://addons.mozilla.org/en-US/developers/)
2. Sign in with your Mozilla account
3. Click "Submit a New Add-on" or update an existing one
4. Follow the submission process

## Troubleshooting

### Common Issues

- **Signing fails**: Make sure your API credentials are correct and the extension passes validation
- **Build fails**: Check the linting errors and fix any issues in your code
- **Extension doesn't load**: Verify that your manifest.json is valid

### Getting Help

If you encounter any issues, please:

1. Check the GitHub Actions logs for detailed error messages
2. Consult the [web-ext documentation](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)
3. Open an issue in the GitHub repository