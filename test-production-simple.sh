#!/bin/bash

# Simple Production Lighthouse Test (no npm install)
PROD_URL="https://pwa4-seven.vercel.app"

echo "🚀 Testing Production: $PROD_URL"

# Test site accessibility
if curl -s -o /dev/null -w "%{http_code}" "$PROD_URL" | grep -q "200"; then
    echo "✅ Site accessible"
else
    echo "❌ Site not accessible"
    exit 1
fi

# Test APIs
echo "📡 Testing APIs..."
curl -s "$PROD_URL/api/health" | head -c 200
echo ""

# Test endpoints
for endpoint in "/api/spots" "/api/airbears" "/api/bodega/items"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL$endpoint")
    echo "$endpoint: HTTP $status"
done

# Test PWA files
echo "📱 Testing PWA..."
sw_status=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/sw.js")
manifest_status=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/manifest.json")
echo "Service Worker: HTTP $sw_status"
echo "Manifest: HTTP $manifest_status"

echo "✅ Basic production tests completed"
