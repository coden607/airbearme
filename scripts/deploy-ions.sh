#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting AirBear deployment to IONOS..."

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build the application
echo "🔨 Building application..."
npm run build

# Check if IONOS CLI is installed
if ! command -v ionos &> /dev/null; then
    echo "❌ IONOS CLI is not installed. Please install it first."
    echo "   Visit: https://github.com/ionos-cloud/ionos-cli"
    exit 1
fi

# Login to IONOS (if not already logged in)
if ! ionos auth status &> /dev/null; then
    echo "🔑 Logging in to IONOS..."
    ionos auth login
fi

# Deploy to IONOS
echo "🚀 Deploying to IONOS..."
ionos deploy --project airbear --environment production

# Get deployment status
echo "🔄 Checking deployment status..."
ionos deployments list --project airbear

echo "✅ Deployment completed successfully!"
echo "🌐 Your app should be live at: https://airbear.me"
echo "   (Note: DNS changes may take some time to propagate)"
