# GitHub Actions Workflows for Firefox Extension

This directory contains GitHub Actions workflows for building and signing the Firefox extension.

## Available Workflows

### 1. Build Firefox Extension (`build-extension.yml`)

This workflow builds the Firefox extension without signing it.

**Triggers:**
- Push to `main` branch
- Pull requests to `main` branch
- Manual trigger from GitHub UI

**Steps:**
1. Checkout code
2. Setup Node.js
3. Install web-ext tool
4. Lint the extension
5. Build the extension
6. Upload the built extension as an artifact

### 2. Build and Sign Firefox Extension (`build-and-sign-extension.yml`)

This workflow builds the Firefox extension and signs it with Mozilla's API if appropriate credentials are provided.

**Triggers:**
- Push to `main` branch
- Push of version tags (e.g., `v1.0.0`)
- Pull requests to `main` branch
- Manual trigger from GitHub UI

**Steps:**
1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Update version in manifest.json (only on tag pushes)
5. Lint the extension
6. Build the extension
7. Upload the built extension as an artifact
8. Sign the extension with Mozilla (only on push to main or tag)
9. Upload the signed extension as an artifact
10. Create a GitHub release (only on tag pushes)

## Setting Up Mozilla API Credentials

To sign the extension with Mozilla's API, you need to set up the following secrets in your GitHub repository:

1. Go to your repository on GitHub
2. Navigate to Settings > Secrets and variables > Actions
3. Add the following secrets:
   - `MOZILLA_API_KEY`: Your Mozilla Add-ons API key
   - `MOZILLA_API_SECRET`: Your Mozilla Add-ons API secret

You can obtain these credentials from the [Mozilla Add-on Developer Hub](https://addons.mozilla.org/en-US/developers/addon/api/key/).

## Creating a Release

To create a new release:

1. Update your extension code and test it locally
2. Create and push a new tag with a version number:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. The workflow will automatically:
   - Update the version in manifest.json
   - Build and sign the extension
   - Create a GitHub release with the signed extension attached

## Manual Builds

You can also trigger a build manually:

1. Go to the "Actions" tab in your GitHub repository
2. Select the workflow you want to run
3. Click "Run workflow"
4. Choose the branch to run it on
5. Click "Run workflow"