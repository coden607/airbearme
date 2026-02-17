#!/usr/bin/env node

// Test script to verify vehicle assignment fix
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

async function testVehicleAssignmentFix() {
    console.log('🔧 Testing Vehicle Assignment Fix...\n');

    try {
        // 1. Check initial state
        console.log('1. Checking initial AirBear state...');
        const initialResponse = await fetch(`${BASE_URL}/api/airbears`);
        const initialAirbears = await initialResponse.json();
        
        const availableCount = initialAirbears.filter(a => 
            !a.driverId && !a.driver_id && (a.isAvailable ?? a.is_available ?? a.isavailable)
        ).length;
        
        console.log(`   Total AirBears: ${initialAirbears.length}`);
        console.log(`   Available: ${availableCount}`);

        // 2. Create and login driver
        console.log('\n2. Creating test driver...');
        const testDriver = {
            username: `testdriver_${Date.now()}`,
            email: `test${Date.now()}@example.com`,
            password: 'password123',
            confirmPassword: 'password123',
            fullName: 'Test Driver',
            role: 'driver'
        };

        const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testDriver)
        });

        if (!registerResponse.ok) {
            console.log('   ❌ Driver creation failed');
            return;
        }

        const driverData = await registerResponse.json();
        console.log(`   ✅ Driver created: ${driverData.user?.id?.slice(0, 8)}`);

        // Login
        const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: testDriver.email,
                password: testDriver.password
            })
        });

        getCookies(loginResponse.headers);
        const sessionCookie = getCookies(loginResponse.headers);

        if (!loginResponse.ok) {
            console.log('   ❌ Login failed');
            return;
        }

        console.log('   ✅ Driver logged in');

        // 3. Test vehicle assignment (simulating frontend behavior)
        console.log('\n3. Testing vehicle assignment...');
        
        // Get available airbears (like frontend does)
        const airbearsResponse = await fetch(`${BASE_URL}/api/airbears`);
        const airbears = await airbearsResponse.json();
        const available = airbears.find((a) => 
            !a.driverId && !a.driver_id && (a.isAvailable ?? a.is_available ?? a.isavailable)
        );

        if (!available) {
            console.log('   ❌ No available AirBears found');
            return;
        }

        console.log(`   Found available AirBear: ${available.id?.slice(0, 8)}`);

        // Assign vehicle (like frontend claimAirbear function)
        const updateRes = await fetch(`${BASE_URL}/api/airbears/${available.id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': sessionCookie
            },
            body: JSON.stringify({ driverId: driverData.user.id }),
        });

        console.log(`   Assignment response status: ${updateRes.status}`);

        if (updateRes.ok) {
            const updated = await updateRes.json();
            console.log('   ✅ Assignment successful!');
            console.log(`   Response structure: ${Object.keys(updated).join(', ')}`);
            
            // Verify the fix - check if data property exists
            if (updated.data) {
                console.log('   ✅ Response has data property (fix working)');
                console.log(`   Assigned driver ID: ${updated.data.driverId?.slice(0, 8)}`);
            } else {
                console.log('   ⚠️  Response missing data property');
            }
        } else {
            const errorText = await updateRes.text();
            console.log(`   ❌ Assignment failed: ${errorText}`);
        }

        // 4. Verify final state
        console.log('\n4. Verifying final state...');
        const finalResponse = await fetch(`${BASE_URL}/api/airbears`);
        const finalAirbears = await finalResponse.json();
        
        const assignedAirbear = finalAirbears.find(a => 
            a.driverId === driverData.user.id || a.driver_id === driverData.user.id
        );
        
        if (assignedAirbear) {
            console.log(`   ✅ AirBear ${assignedAirbear.id?.slice(0, 8)} assigned to driver`);
            console.log(`   ✅ Available count reduced to: ${finalAirbears.filter(a => !a.driverId && !a.driver_id && (a.isAvailable ?? a.is_available ?? a.isavailable)).length}`);
        } else {
            console.log('   ❌ Assignment not persisted');
        }

        console.log('\n🎉 Vehicle assignment fix verification complete!');

    } catch (error) {
        console.error('❌ Error during testing:', error.message);
    }
}

testVehicleAssignmentFix();
