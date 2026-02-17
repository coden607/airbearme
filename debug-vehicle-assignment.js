#!/usr/bin/env node

// Debug script to test vehicle assignment
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

// Create a cookie jar to maintain session
const cookies = new Map();

function getCookies(headers) {
    const setCookieHeader = headers.get('set-cookie');
    if (setCookieHeader) {
        setCookieHeader.split(',').forEach(cookie => {
            const [name, ...rest] = cookie.split('=');
            const value = rest.join('=').split(';')[0];
            cookies.set(name.trim(), value);
        });
    }
    return Array.from(cookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

async function testVehicleAssignment() {
    console.log('🔍 Testing Vehicle Assignment Flow...\n');

    try {
        // 1. Test getting all airbears
        console.log('1. Fetching all AirBears...');
        const airbearsResponse = await fetch(`${BASE_URL}/api/airbears`);
        const airbears = await airbearsResponse.json();
        console.log(`   Found ${airbears.length} AirBears`);
        
        if (airbears.length === 0) {
            console.log('   ❌ No AirBears found in database');
            return;
        }

        // Show available airbears
        const availableAirbears = airbears.filter(a => 
            !a.driverId && !a.driver_id && (a.isAvailable ?? a.is_available ?? a.isavailable)
        );
        console.log(`   Available AirBears: ${availableAirbears.length}`);
        
        if (availableAirbears.length === 0) {
            console.log('   ❌ No available AirBears to assign');
            console.log('   Current AirBears:');
            airbears.forEach((a, i) => {
                console.log(`     ${i+1}. ID: ${a.id?.slice(0, 8)} | Driver: ${a.driverId || a.driver_id || 'none'} | Available: ${a.isAvailable ?? a.is_available ?? a.isavailable}`);
            });
            return;
        }

        const targetAirbear = availableAirbears[0];
        console.log(`   Target AirBear: ${targetAirbear.id?.slice(0, 8)}`);

        // 2. Test authentication (we'll need a driver session)
        console.log('\n2. Testing authentication...');
        
        // Try to create/find a test driver
        const testDriver = {
            username: `testdriver_${Date.now()}`,
            email: `test${Date.now()}@example.com`,
            password: 'password123',
            confirmPassword: 'password123',
            fullName: 'Test Driver',
            role: 'driver'
        };

        console.log('   Creating test driver...');
        const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testDriver)
        });

        if (!registerResponse.ok) {
            const error = await registerResponse.text();
            console.log(`   ❌ Failed to create driver: ${error}`);
            return;
        }

        const driverData = await registerResponse.json();
        console.log(`   ✅ Driver created: ${driverData.user?.id?.slice(0, 8)}`);

        // Login to get session
        const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: testDriver.email,
                password: testDriver.password
            })
        });

        // Extract cookies from login response
        getCookies(loginResponse.headers);
        const sessionCookie = getCookies(loginResponse.headers);

        if (!loginResponse.ok) {
            const error = await loginResponse.text();
            console.log(`   ❌ Failed to login: ${error}`);
            return;
        }

        const loginData = await loginResponse.json();
        console.log(`   ✅ Logged in, session established`);
        console.log(`   Session cookie: ${sessionCookie.substring(0, 50)}...`);

        // 3. Test vehicle assignment
        console.log('\n3. Testing vehicle assignment...');
        
        const assignmentPayload = {
            driverId: driverData.user.id
        };

        console.log(`   Assigning AirBear ${targetAirbear.id?.slice(0, 8)} to driver ${driverData.user.id?.slice(0, 8)}`);
        
        const updateResponse = await fetch(`${BASE_URL}/api/airbears/${targetAirbear.id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': sessionCookie
            },
            body: JSON.stringify(assignmentPayload)
        });

        console.log(`   Response status: ${updateResponse.status}`);
        
        const updateResult = await updateResponse.text();
        console.log(`   Response body: ${updateResult}`);

        if (updateResponse.ok) {
            console.log('   ✅ Vehicle assignment successful!');
            
            // Verify the assignment
            const verifyResponse = await fetch(`${BASE_URL}/api/airbears`);
            const updatedAirbears = await verifyResponse.json();
            const updatedAirbear = updatedAirbears.find(a => a.id === targetAirbear.id);
            
            console.log(`   Verification - Driver ID: ${updatedAirbear?.driverId || updatedAirbear?.driver_id}`);
        } else {
            console.log('   ❌ Vehicle assignment failed');
        }

    } catch (error) {
        console.error('❌ Error during testing:', error.message);
    }
}

testVehicleAssignment();
