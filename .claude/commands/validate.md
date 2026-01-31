# AirBear PWA Ultimate Validation Command

**Purpose**: Comprehensive validation of the AirBear PWA deployment, functionality, and production readiness.

## Quick Validation (Essential Checks)
```bash
# Phase 1: Code Quality
echo "🔍 PHASE 1: CODE QUALITY"
npm run build
npm run check

# Phase 2: Deployment
echo "🌐 PHASE 2: DEPLOYMENT"
curl -I https://pwa41.vercel.app
curl -s https://pwa41.vercel.app/manifest.json | jq -r '.name, .theme_color'
curl -I https://pwa41.vercel.app/sw.js

# Phase 3: Bundle Analysis
echo "📊 PHASE 3: BUNDLE"
du -sh dist/public/
ls -lh dist/public/assets/ | head -10
```

## Comprehensive Validation (Complete Testing)

### Phase 1: Code Quality Validation
```bash
echo "🎯 STEP 1.1: Build Verification"
npm run build
if [ $? -eq 0 ]; then
  echo "✅ Build: SUCCESS"
else
  echo "❌ Build: FAILED"
  exit 1
fi

echo "🎯 STEP 1.2: TypeScript Type Checking"
npm run check
if [ $? -eq 0 ]; then
  echo "✅ TypeScript: PASSED"
else
  echo "❌ TypeScript: FAILED"
  exit 1
fi

echo "🎯 STEP 1.3: Bundle Analysis"
echo "Build size: $(du -sh dist/public/)"
echo "Assets size: $(du -sh dist/public/assets/)"
echo "Total JS files: $(ls dist/public/assets/*.js 2>/dev/null | wc -l)"
echo "Total CSS files: $(ls dist/public/assets/*.css 2>/dev/null | wc -l)"
```

### Phase 2: Deployment Validation
```bash
echo "🌐 STEP 2.1: Live Site Accessibility"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://pwa41.vercel.app)
if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Site accessible: HTTP $HTTP_STATUS"
else
  echo "❌ Site inaccessible: HTTP $HTTP_STATUS"
  exit 1
fi

echo "🌐 STEP 2.2: SSL Certificate"
SSL_INFO=$(curl -s -I https://pwa41.vercel.app | grep -E "HTTP|Server")
echo "SSL Status: $SSL_INFO"

echo "🌐 STEP 2.3: PWA Manifest Validation"
MANIFEST_NAME=$(curl -s https://pwa41.vercel.app/manifest.json | jq -r '.name // "missing"')
MANIFEST_COLOR=$(curl -s https://pwa41.vercel.app/manifest.json | jq -r '.theme_color // "missing"')
MANIFEST_START=$(curl -s https://pwa41.vercel.app/manifest.json | jq -r '.start_url // "missing"')
echo "✅ PWA Name: $MANIFEST_NAME"
echo "✅ Theme Color: $MANIFEST_COLOR"
echo "✅ Start URL: $MANIFEST_START"

echo "🌐 STEP 2.4: Critical Files Integrity"
for file in "index.html" "manifest.json" "sw.js"; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://pwa41.vercel.app/$file)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ $file: HTTP $HTTP_CODE"
  else
    echo "❌ $file: HTTP $HTTP_CODE"
  fi
done
```

### Phase 3: API & Functional Testing
```bash
echo "🧪 STEP 3.1: API Health Check"
curl -s https://pwa41.vercel.app/api/health | jq .

echo "🧪 STEP 3.2: Spots API"
SPOTS=$(curl -s https://pwa41.vercel.app/api/spots | jq length)
echo "✅ Spots loaded: $SPOTS"

echo "🧪 STEP 3.3: AirBears API"
curl -s https://pwa41.vercel.app/api/airbears | jq .

echo "🧪 STEP 3.4: Bodega Items API"
ITEMS=$(curl -s https://pwa41.vercel.app/api/bodega/items | jq length)
echo "✅ Bodega items: $ITEMS"
```

### Phase 4: Performance Check
```bash
echo "⚡ STEP 4.1: Load Time Analysis"
LOAD_TIME=$(curl -s -o /dev/null -w "%{time_total}" https://pwa41.vercel.app)
echo "Load time: ${LOAD_TIME}s"

echo "⚡ STEP 4.2: Bundle Sizes"
ls -lh dist/public/assets/*.js | awk '{print $5, $9}'
ls -lh dist/public/assets/*.css | awk '{print $5, $9}'
```

## Success Criteria
**Validation passes if:**
- ✅ Build completes without errors
- ✅ TypeScript validation passes
- ✅ Site loads at https://pwa41.vercel.app
- ✅ PWA manifest properly configured
- ✅ All API endpoints responding
- ✅ Service worker functional
- ✅ No console errors

## Workflow Tests
```bash
# Run user/driver workflow tests
node test-user-driver-workflows.js

# Run production complete test
node test-production-complete.js
```
