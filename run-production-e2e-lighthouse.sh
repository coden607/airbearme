#!/bin/bash

# AirBear PWA Production E2E Lighthouse Testing Script
# Tests the live production version at https://pwa4-seven.vercel.app

set -e

echo "🚀 Starting Production E2E Lighthouse Tests..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Production URL
PROD_URL="https://pwa4-seven.vercel.app"

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

print_header() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    print_status "All dependencies are available"
}

# Install Lighthouse CLI if needed
install_lighthouse() {
    if ! command -v lighthouse &> /dev/null; then
        print_status "Installing Lighthouse CLI..."
        npm install -g lighthouse
    else
        print_status "Lighthouse CLI already installed"
    fi
}

# Create results directory
setup_results() {
    mkdir -p production-test-results/lighthouse
    mkdir -p production-test-results/screenshots
    print_status "Created results directories"
}

# Test production site accessibility
test_site_accessibility() {
    print_header "Testing Production Site Accessibility..."
    
    if curl -s -o /dev/null -w "%{http_code}" "$PROD_URL" | grep -q "200"; then
        print_status "✅ Production site is accessible (HTTP 200)"
    else
        print_error "❌ Production site is not accessible"
        return 1
    fi
    
    # Check key endpoints
    local endpoints=(
        "$PROD_URL/api/health"
        "$PROD_URL/api/spots"
        "$PROD_URL/api/airbears"
        "$PROD_URL/api/bodega/items"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint")
        if [ "$status_code" = "200" ]; then
            print_status "✅ $endpoint - HTTP $status_code"
        else
            print_warning "⚠️  $endpoint - HTTP $status_code"
        fi
    done
}

# Run comprehensive Lighthouse audit
run_lighthouse_audit() {
    print_header "Running Comprehensive Lighthouse Audit..."
    
    local categories="performance,accessibility,best-practices,seo,pwa"
    local output_file="./production-test-results/lighthouse/production-audit.json"
    local html_file="./production-test-results/lighthouse/production-audit.html"
    
    print_status "Running Lighthouse audit on $PROD_URL..."
    
    lighthouse "$PROD_URL" \
        --output=json \
        --output=html \
        --output-path="$output_file" \
        --chrome-flags="--headless" \
        --only-categories="$categories" \
        --quiet \
        --throttling.method=provided \
        --throttling.rttMs=40 \
        --throttling.throughputKbps=10240 \
        --throttling.cpuSlowdownMultiplier=1 \
        --screenEmulation.disabled=true \
        --emulated-form-factor=desktop
    
    if [ -f "$output_file" ]; then
        print_status "✅ Lighthouse audit completed"
        
        # Extract and display scores
        node -e "
        const report = JSON.parse(require('fs').readFileSync('$output_file', 'utf8'));
        const categories = report.categories;
        
        console.log('\\n📊 Production Lighthouse Scores:');
        console.log('═══════════════════════════════════════');
        
        Object.entries(categories).forEach(([key, cat]) => {
            const score = Math.round(cat.score * 100);
            const status = score >= 90 ? '🟢' : score >= 70 ? '🟡' : '🔴';
            console.log(status + ' ' + key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ') + ': ' + score + '/100');
        });
        
        console.log('═══════════════════════════════════════');
        
        // Check for critical issues
        const audits = report.audits;
        const criticalIssues = [];
        
        if (audits['errors-in-console'] && audits['errors-in-console'].score < 1) {
            criticalIssues.push('Console errors detected');
        }
        
        if (audits['redirects-http'] && audits['redirects-http'].score < 1) {
            criticalIssues.push('HTTP to HTTPS redirects not configured');
        }
        
        if (audits['service-worker'] && audits['service-worker'].score < 1) {
            criticalIssues.push('Service worker not properly configured');
        }
        
        if (criticalIssues.length > 0) {
            console.log('\\n🚨 Critical Issues:');
            criticalIssues.forEach(issue => console.log('  - ' + issue));
        }
        
        // Performance metrics
        const perfMetrics = {
            'First Contentful Paint': audits['first-contentful-paint'].displayValue,
            'Largest Contentful Paint': audits['largest-contentful-paint'].displayValue,
            'Cumulative Layout Shift': audits['cumulative-layout-shift'].displayValue,
            'Total Blocking Time': audits['total-blocking-time'].displayValue
        };
        
        console.log('\\n⚡ Performance Metrics:');
        Object.entries(perfMetrics).forEach(([key, value]) => {
            console.log('  ' + key + ': ' + value);
        });
        "
        
        print_status "📄 HTML report available at: $html_file"
    else
        print_error "❌ Lighthouse audit failed"
        return 1
    fi
}

# Run mobile Lighthouse audit
run_mobile_audit() {
    print_header "Running Mobile Lighthouse Audit..."
    
    local output_file="./production-test-results/lighthouse/production-mobile-audit.json"
    
    lighthouse "$PROD_URL" \
        --output=json \
        --output-path="$output_file" \
        --chrome-flags="--headless" \
        --only-categories="performance,accessibility,best-practices,seo,pwa" \
        --quiet \
        --throttling.method=provided \
        --throttling.rttMs=150 \
        --throttling.throughputKbps=1638.4 \
        --throttling.cpuSlowdownMultiplier=4 \
        --screenEmulation.mobile=true \
        --emulated-form-factor=mobile
    
    if [ -f "$output_file" ]; then
        print_status "✅ Mobile Lighthouse audit completed"
        
        node -e "
        const report = JSON.parse(require('fs').readFileSync('$output_file', 'utf8'));
        const categories = report.categories;
        
        console.log('\\n📱 Mobile Lighthouse Scores:');
        console.log('═══════════════════════════════════════');
        
        Object.entries(categories).forEach(([key, cat]) => {
            const score = Math.round(cat.score * 100);
            const status = score >= 90 ? '🟢' : score >= 70 ? '🟡' : '🔴';
            console.log(status + ' ' + key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ') + ': ' + score + '/100');
        });
        
        console.log('═══════════════════════════════════════');
        "
    else
        print_warning "⚠️  Mobile Lighthouse audit failed"
    fi
}

# Test PWA functionality
test_pwa_features() {
    print_header "Testing PWA Features..."
    
    # Test service worker
    local sw_response=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/sw.js")
    if [ "$sw_response" = "200" ]; then
        print_status "✅ Service worker accessible"
    else
        print_warning "⚠️  Service worker not accessible (HTTP $sw_response)"
    fi
    
    # Test manifest
    local manifest_response=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/manifest.json")
    if [ "$manifest_response" = "200" ]; then
        print_status "✅ PWA manifest accessible"
    else
        print_warning "⚠️  PWA manifest not accessible (HTTP $manifest_response)"
    fi
    
    # Test HTTPS
    if [[ "$PROD_URL" == https://* ]]; then
        print_status "✅ Site served over HTTPS"
    else
        print_warning "⚠️  Site not served over HTTPS"
    fi
}

# Test API endpoints functionality
test_api_functionality() {
    print_header "Testing API Functionality..."
    
    # Test health endpoint
    local health_response=$(curl -s "$PROD_URL/api/health")
    if echo "$health_response" | grep -q "ok"; then
        print_status "✅ Health endpoint working"
    else
        print_warning "⚠️  Health endpoint issues"
    fi
    
    # Test spots endpoint
    local spots_count=$(curl -s "$PROD_URL/api/spots" | jq length 2>/dev/null || echo "0")
    if [ "$spots_count" -gt 0 ]; then
        print_status "✅ Spots API working ($spots_count spots)"
    else
        print_warning "⚠️  Spots API issues"
    fi
    
    # Test airbears endpoint
    local airbears_count=$(curl -s "$PROD_URL/api/airbears" | jq length 2>/dev/null || echo "0")
    if [ "$airbears_count" -gt 0 ]; then
        print_status "✅ AirBears API working ($airbears_count vehicles)"
    else
        print_warning "⚠️  AirBears API issues"
    fi
    
    # Test bodega endpoint
    local bodega_count=$(curl -s "$PROD_URL/api/bodega/items" | jq length 2>/dev/null || echo "0")
    if [ "$bodega_count" -gt 0 ]; then
        print_status "✅ Bodega API working ($bodega_count items)"
    else
        print_warning "⚠️  Bodega API issues (likely database schema problem)"
    fi
}

# Generate comprehensive report
generate_production_report() {
    print_header "Generating Production Test Report..."
    
    cat > PRODUCTION-E2E-REPORT.md << EOF
# AirBear PWA Production E2E Lighthouse Report

**Date:** $(date)
**Production URL:** $PROD_URL
**Test Type:** Automated E2E Lighthouse Testing

## 📊 Lighthouse Scores Summary

### Desktop Performance
EOF

    # Add scores from JSON if available
    if [ -f "./production-test-results/lighthouse/production-audit.json" ]; then
        node -e "
        const report = JSON.parse(require('fs').readFileSync('./production-test-results/lighthouse/production-audit.json', 'utf8'));
        const categories = report.categories;
        
        Object.entries(categories).forEach(([key, cat]) => {
            const score = Math.round(cat.score * 100);
            const status = score >= 90 ? '🟢' : score >= 70 ? '🟡' : '🔴';
            console.log('- **' + key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ') + ':** ' + status + ' ' + score + '/100');
        });
        " >> PRODUCTION-E2E-REPORT.md
    fi
    
    cat >> PRODUCTION-E2E-REPORT.md << EOF

### Mobile Performance
EOF

    # Add mobile scores if available
    if [ -f "./production-test-results/lighthouse/production-mobile-audit.json" ]; then
        node -e "
        const report = JSON.parse(require('fs').readFileSync('./production-test-results/lighthouse/production-mobile-audit.json', 'utf8'));
        const categories = report.categories;
        
        Object.entries(categories).forEach(([key, cat]) => {
            const score = Math.round(cat.score * 100);
            const status = score >= 90 ? '🟢' : score >= 70 ? '🟡' : '🔴';
            console.log('- **' + key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ') + ':** ' + status + ' ' + score + '/100');
        });
        " >> PRODUCTION-E2E-REPORT.md
    fi
    
    cat >> PRODUCTION-E2E-REPORT.md << EOF

## 🔍 API Endpoint Status

- **Health Check:** Tested
- **Spots API:** Tested  
- **AirBears API:** Tested
- **Bodega API:** Tested

## 📱 PWA Features

- **Service Worker:** Tested
- **PWA Manifest:** Tested
- **HTTPS:** Verified

## 📄 Detailed Reports

- **Desktop HTML Report:** [production-audit.html](./production-test-results/lighthouse/production-audit.html)
- **Desktop JSON Data:** [production-audit.json](./production-test-results/lighthouse/production-audit.json)
- **Mobile JSON Data:** [production-mobile-audit.json](./production-test-results/lighthouse/production-mobile-audit.json)

## 🎯 Recommendations

Based on the Lighthouse scores and API tests:

1. **Performance Optimization**
   - Review Core Web Vitals metrics
   - Optimize images and assets
   - Implement lazy loading where needed

2. **Accessibility Improvements**
   - Ensure all interactive elements are keyboard accessible
   - Add proper ARIA labels
   - Improve color contrast ratios

3. **PWA Enhancements**
   - Verify service worker caching strategy
   - Test offline functionality
   - Optimize app shell architecture

4. **SEO Best Practices**
   - Add meta descriptions
   - Implement structured data
   - Optimize page titles

## 🚀 Next Steps

1. Review detailed HTML report for specific issues
2. Address any critical performance bottlenecks
3. Fix accessibility violations
4. Implement PWA best practices
5. Re-run tests after fixes

---

**Report generated by:** Production E2E Lighthouse Testing Script
**Environment:** Production ($PROD_URL)
EOF

    print_status "✅ Production test report generated: PRODUCTION-E2E-REPORT.md"
}

# Main execution
main() {
    print_status "🚀 Starting Production E2E Lighthouse Tests on $PROD_URL..."
    
    check_dependencies
    install_lighthouse
    setup_results
    test_site_accessibility
    test_pwa_features
    test_api_functionality
    run_lighthouse_audit
    run_mobile_audit
    generate_production_report
    
    print_status "🎉 Production E2E Lighthouse testing completed!"
    print_status "📊 Check PRODUCTION-E2E-REPORT.md for detailed results"
    print_status "📄 Open production-test-results/lighthouse/production-audit.html for interactive report"
}

# Run main function
main "$@"
