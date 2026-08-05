#!/usr/bin/env bash
set -euo pipefail

echo "[+] Checking environment requirements..."

# Ensure Node.js (>= 20) and npm are installed
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 20 ]; then
    echo "[+] Node.js v20+ not detected. Installing Node.js..."
    if command -v brew >/dev/null 2>&1; then
        brew install node
    elif command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -y
        sudo apt-get install -y curl
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y nodejs
    else
        echo "[!] Package manager not recognized. Please install Node.js >= 20 manually."
        exit 1
    fi
fi

echo "[+] Node.js version: $(node -v)"
echo "[+] npm version: $(npm -v)"

# Install Gemini CLI globally
echo "[+] Installing @google/gemini-cli globally via npm..."
if [ "$(id -u)" -ne 0 ] && ! command -v brew >/dev/null 2>&1; then
    sudo npm install -g @google/gemini-cli@latest
else
    npm install -g @google/gemini-cli@latest
fi

echo "[+] Verifying installation..."
gemini --version

echo "[+] Installation complete. Run 'gemini' to launch and authenticate."
