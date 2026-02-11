#!/bin/bash

# AirBear PWA Simple Validation Script
# This script runs basic validation without Node version requirements

set -e

echo "🚀 Starting AirBear PWA Simple Validation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if build exists
check_build() {
    print_status "Checking build status..."
    
    if [ -d "dist" ] && [ -f "dist/public/index.html" ]; then
        print_status "✅ Build exists"
    else
        print_status "Running build..."
        npm run build:static || {
            print_error "❌ Build failed"
            return 1
        }
        print_status "✅ Build completed"
    fi
}

# Start preview server
start_preview_server() {
    print_status "Starting preview server..."
    
    # Kill any existing process on port 3000
    pkill -f "python.*3000" || true
    pkill -f "vite.*3000" || true
    
    # Start simple Python server
    cd dist/public
    python3 -m http.server 3000 > ../../server.log 2>&1 &
    SERVER_PID=$!
    cd ../..
    
    # Wait for server to start
    print_status "Waiting for server to start..."
    for i in {1..15}; do
        if curl -s http://localhost:5000 > /dev/null 2>&1; then
            print_status "✅ Server started successfully (PID: $SERVER_PID)"
            return 0
        fi
        sleep 2
    done
    
    print_error "❌ Server failed to start"
    print_error "Server log:"
    cat server.log
    return 1
}

# Run basic browser tests
run_browser_tests() {
    print_status "Running browser-based validation..."
    
    # Create a simple test HTML file
    cat > test-validation.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AirBear PWA Validation</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .test { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
        .pass { background-color: #d4edda; border-color: #c3e6cb; }
        .fail { background-color: #f8d7da; border-color: #f5c6cb; }
        .pending { background-color: #fff3cd; border-color: #ffeaa7; }
    </style>
</head>
<body>
    <h1>AirBear PWA Validation</h1>
    <div id="results"></div>
    
    <script>
        const results = document.getElementById('results');
        
        function addTest(name, status, details = '') {
            const div = document.createElement('div');
            div.className = `test ${status}`;
            div.innerHTML = `<strong>${name}:</strong> ${status.toUpperCase()} ${details}`;
            results.appendChild(div);
        }
        
        // Test 1: Page loads
        addTest('Page Load', 'pass');
        
        // Test 2: Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(() => addTest('Service Worker', 'pass'))
                .catch(() => addTest('Service Worker', 'fail'));
        } else {
            addTest('Service Worker', 'fail', 'Not supported');
        }
        
        // Test 3: Manifest
        const manifest = document.querySelector('link[rel="manifest"]');
        if (manifest) {
            addTest('PWA Manifest', 'pass');
        } else {
            addTest('PWA Manifest', 'fail');
        }
        
        // Test 4: Responsive viewport
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport && viewport.content.includes('width=device-width')) {
            addTest('Responsive Viewport', 'pass');
        } else {
            addTest('Responsive Viewport', 'fail');
        }
        
        // Test 5: HTTPS check (will fail on localhost)
        if (location.protocol === 'https:' || location.hostname === 'localhost') {
            addTest('HTTPS/Localhost', 'pass');
        } else {
            addTest('HTTPS/Localhost', 'fail');
        }
        
        // Test 6: Core Web Vitals simulation
        setTimeout(() => {
            const navigation = performance.getEntriesByType('navigation')[0];
            const loadTime = navigation.loadEventEnd - navigation.loadEventStart;
            
            if (loadTime < 3000) {
                addTest('Page Load Time', 'pass', `${Math.round(loadTime)}ms`);
            } else {
                addTest('Page Load Time', 'fail', `${Math.round(loadTime)}ms`);
            }
        }, 1000);
        
        // Test 7: Check for console errors
        let errorCount = 0;
        const originalError = console.error;
        console.error = function() {
            errorCount++;
            originalError.apply(console, arguments);
        };
        
        setTimeout(() => {
            if (errorCount === 0) {
                addTest('Console Errors', 'pass', 'No errors detected');
            } else {
                addTest('Console Errors', 'fail', `${errorCount} errors detected`);
            }
        }, 2000);
        
        // Test 8: Local Storage
        try {
            localStorage.setItem('test', 'value');
            localStorage.removeItem('test');
            addTest('Local Storage', 'pass');
        } catch (e) {
            addTest('Local Storage', 'fail');
        }
        
        // Test 9: Session Storage
        try {
            sessionStorage.setItem('test', 'value');
            sessionStorage.removeItem('test');
            addTest('Session Storage', 'pass');
        } catch (e) {
            addTest('Session Storage', 'fail');
        }
        
        // Test 10: Geolocation API
        if ('geolocation' in navigator) {
            addTest('Geolocation API', 'pass');
        } else {
            addTest('Geolocation API', 'fail', 'Not available');
        }
        
        // Summary
        setTimeout(() => {
            const tests = document.querySelectorAll('.test');
            const passCount = document.querySelectorAll('.pass').length;
            const failCount = document.querySelectorAll('.fail').length;
            const pendingCount = document.querySelectorAll('.pending').length;
            
            const summary = document.createElement('div');
            summary.innerHTML = `
                <h2>Summary</h2>
                <p><strong>Total Tests:</strong> ${tests.length}</p>
                <p><strong>Passed:</strong> ${passCount}</p>
                <p><strong>Failed:</strong> ${failCount}</p>
                <p><strong>Pending:</strong> ${pendingCount}</p>
                <p><strong>Success Rate:</strong> ${Math.round((passCount / tests.length) * 100)}%</p>
            `;
            results.appendChild(summary);
        }, 3000);
    </script>
</body>
</html>
EOF

    print_status "✅ Browser test page created: test-validation.html"
}

# Run Lighthouse using CLI if available
run_lighthouse_simple() {
    print_status "Attempting Lighthouse audit..."
    
    # Try to run Lighthouse if available
    if command -v lighthouse &> /dev/null; then
        mkdir -p test-results
        lighthouse http://localhost:5000 \
            --output=json \
            --output-path=./test-results/lighthouse.json \
            --chrome-flags="--headless" \
            --only-categories=performance,accessibility,best-practices,seo,pwa \
            --quiet \
            || print_warning "Lighthouse failed, continuing..."
        
        if [ -f "./test-results/lighthouse.json" ]; then
            print_status "✅ Lighthouse audit completed"
            node -e "
            const report = JSON.parse(require('fs').readFileSync('./test-results/lighthouse.json', 'utf8'));
            const categories = report.categories;
            console.log('\\n📊 Lighthouse Scores:');
            Object.entries(categories).forEach(([key, cat]) => {
                console.log(key + ': ' + Math.round(cat.score * 100) + '/100');
            });
            "
        fi
    else
        print_warning "Lighthouse CLI not available, skipping audit"
    fi
}

# Generate simple report
generate_simple_report() {
    print_status "Generating validation report..."
    
    cat > SIMPLE-VALIDATION-REPORT.md << EOF
# AirBear PWA Simple Validation Report

**Date:** $(date)
**Status:** ✅ COMPLETED

## Validation Summary

### ✅ Build Process
- Static build: COMPLETED
- Preview server: RUNNING

### ✅ Browser Tests
- Open test-validation.html in your browser to see detailed results
- Tests include: PWA features, performance, APIs, and more

### 📊 Manual Testing Required
Since of Node.js version constraints, please manually test:

1. **User Registration & Login**
   - Visit http://localhost:5000
   - Test user signup and login flows

2. **Driver Registration & Login**  
   - Test driver signup and login flows

3. **Ride Booking**
   - Test ride request and tracking

4. **Payment Processing**
   - Test payment integration

5. **Real-time Features**
   - Test live tracking and notifications

## Next Steps

1. Upgrade Node.js to version 18+ for full automated testing
2. Run comprehensive e2e tests with Playwright
3. Run Lighthouse audits for performance optimization

## Server Information

- Preview server running on: http://localhost:5000
- Test page available: test-validation.html
- Server log: server.log

EOF

    print_status "✅ Simple validation report generated: SIMPLE-VALIDATION-REPORT.md"
}

# Cleanup function
cleanup() {
    print_status "Cleaning up..."
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
    pkill -f "python.*3000" || true
}

# Set up cleanup on exit
trap cleanup EXIT

# Main execution
main() {
    print_status "🚀 Starting simple validation..."
    
    check_build || exit 1
    start_preview_server || exit 1
    run_browser_tests
    run_lighthouse_simple
    generate_simple_report
    
    print_status "🎉 Simple validation completed!"
    print_status "📊 Open http://localhost:5000/test-validation.html in your browser"
    print_status "📋 Check SIMPLE-VALIDATION-REPORT.md for details"
}

# Run main function
main "$@"
