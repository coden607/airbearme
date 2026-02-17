#!/usr/bin/env node

// Quick validation of core API endpoints
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testEndpoint(name, path, expectedStatus = 200) {
    try {
        const res = await fetch(`${BASE_URL}${path}`);
        const status = res.status;
        const ok = status === expectedStatus;
        console.log(`${ok ? '✅' : '❌'} ${name}: ${status}${ok ? '' : ` (expected ${expectedStatus})`}`);
        return ok;
    } catch (e) {
        console.log(`❌ ${name}: ERROR - ${e.message}`);
        return false;
    }
}

async function runTests() {
    console.log('🔍 Quick API Validation\n');
    
    const results = await Promise.all([
        testEndpoint('Health', '/api/health'),
        testEndpoint('Spots', '/api/spots'),
        testEndpoint('Airbears', '/api/airbears'),
        testEndpoint('Bodega Items', '/api/bodega-items'),
        testEndpoint('Analytics', '/api/analytics/overview'),
    ]);
    
    const pass = results.filter(r => r).length;
    console.log(`\n📊 Results: ${pass}/${results.length} passed`);
    
    if (pass === results.length) {
        console.log('✅ All core endpoints working!');
    } else {
        console.log('⚠️  Some endpoints need attention');
    }
}

runTests();
