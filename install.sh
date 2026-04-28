#!/bin/sh
set -e

REPO="Airtable/airtable-mcp-cli"
DEFAULT_INSTALL_DIR="${HOME}/.local/bin"
INSTALL_DIR="${AIRTABLE_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
BINARY_NAME="airtable-mcp"

# Detect version
VERSION="${1:-latest}"
if [ "$VERSION" = "latest" ]; then
    VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//')
fi

if [ -z "$VERSION" ]; then
    echo "Error: Could not determine latest version." >&2
    exit 1
fi

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64)  ARCH="x64" ;;
    aarch64) ARCH="arm64" ;;
esac

case "$OS" in
    darwin|linux) ;;
    *)
        echo "Error: Unsupported OS: $OS. Use npm install -g @airtable/mcp-cli instead." >&2
        exit 1
        ;;
esac

case "$ARCH" in
    x64|arm64) ;;
    *)
        echo "Error: Unsupported architecture: $ARCH. Use npm install -g @airtable/mcp-cli instead." >&2
        exit 1
        ;;
esac

ASSET="airtable-mcp-${OS}-${ARCH}"
echo "Installing airtable-mcp CLI $VERSION ($OS/$ARCH)..."

# Download binary and checksum
DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION"
TMP_DIR=$(mktemp -d)
curl -fsSL "$DOWNLOAD_URL/$ASSET" -o "$TMP_DIR/$ASSET"
curl -fsSL "$DOWNLOAD_URL/$ASSET.sha256" -o "$TMP_DIR/$ASSET.sha256"

# Verify checksum
cd "$TMP_DIR"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$ASSET.sha256"
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "$ASSET.sha256"
else
    echo "Error: sha256sum or shasum is required to verify the download." >&2
    rm -rf "$TMP_DIR"
    exit 1
fi

# Install
mkdir -p "$INSTALL_DIR"

if [ ! -w "$INSTALL_DIR" ]; then
    echo "Error: Install directory is not writable: $INSTALL_DIR" >&2
    echo "Set AIRTABLE_INSTALL_DIR to a writable directory and try again." >&2
    rm -rf "$TMP_DIR"
    exit 1
fi

mv "$TMP_DIR/$ASSET" "$INSTALL_DIR/$BINARY_NAME"
chmod +x "$INSTALL_DIR/$BINARY_NAME"

rm -rf "$TMP_DIR"
echo "Installed airtable-mcp $VERSION to $INSTALL_DIR/$BINARY_NAME"

case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *)
        echo ""
        echo "Add this to your PATH:"
        echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
        ;;
esac
