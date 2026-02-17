#!/usr/bin/env node

// Debug script to test ride booking and identify the passenger column issue
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
    } // Removed the extra closing parenthesis here
    return Array.from(cookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

async function createTestUser() {
    const timestamp = Date.now();
    const testUser = {
        username: `testuser_${timestamp}`,
        email: `testuser_${timestamp}@example.com`,
        password: 'password123',
        confirmPassword: 'password123',
        fullName: 'Test User',
        role: 'user'
    };

    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
    });

    if (!registerResponse.ok) {
        const error = await registerResponse.text();
        throw new Error(`Failed to create user: ${error}`);
    }

    const userData = await registerResponse.json();
    
    // Login
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: testUser.email,
            password: testUser.password
        })
    });

    getCookies(loginResponse.headers);
    const sessionCookie = getCookies(loginResponse.headers);

    if (!loginResponse.ok) {
        throw new Error(`Failed to login user`);
    }

    return {
        user: userData.user,
        sessionCookie
    };
}

async function testRideBooking() {
    console.log('🚗 Testing Ride Booking...\n');
    
    try {
        // Create test user
        const testUser = await createTestUser();
        console.log(`✅ Test user created: ${testUser.user.id.slice(0, 8)}`);

        // Get spots for booking
        const spotsResponse = await fetch(`${BASE_URL}/api/spots`);
        const spots = await spotsResponse.json();
        
        if (spots.length < 2) {
            throw new Error('Not enough spots available for booking');
        }

        const pickupSpot = spots[0];
        const dropoffSpot = spots[1];

        console.log(`📍 Pickup: ${pickupSpot.name}`);
        console.log(`📍 Dropoff: ${dropoffSpot.name}`);

        // Test different ride booking payloads
        const testCases = [
            {
                name: 'Basic ride booking',
                payload: {
                    userId: testUser.user.id,
                    pickupSpotId: pickupSpot.id,
                    dropoffSpotId: dropoffSpot.id,
                    airbearId: null,
                    passengers: 1,
                    fare: '4.00',
                    status: 'pending'
                }
            },
            {
                name: 'Ride with numeric fare',
                payload: {
                    userId: testUser.user.id,
                    pickupSpotId: pickupSpot.id,
                    dropoffSpotId: dropoffSpot.id,
                    airbearId: null,
                    passengers: 1,
                    fare: 4.00,
                    status: 'pending'
                }
            },
            {
                name: 'Ride with multiple passengers',
                payload: {
                    userId: testUser.user.id,
                    pickupSpotId: pickupSpot.id,
                    dropoffSpotId: dropoffSpot.id,
                    airbearId: null,
                    passengers: 2,
                    fare: '8.00',
                    status: 'pending'
                }
            }
        ];

        for (const testCase of testCases) {
            console.log(`\n🧪 Testing: ${testCase.name}`);
            console.log(`   Payload:`, JSON.stringify(testCase.payload, null, 2));
            
            const bookingResponse = await fetch(`${BASE_URL}/api/rides`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': testUser.sessionCookie
                },
                body: JSON.stringify(testCase.payload)
            });

            console.log(`   Response status: ${bookingResponse.status}`);
            
            const bookingResult = await bookingResponse.text();
            console.log(`   Response body: ${bookingResult.substring(0, 500)}...`);

            if (bookingResponse.ok) {
                console.log('   ✅ Ride booked successfully');
            } else {
                console.log('   ❌ Ride booking failed');
                
                // Check if it's the passenger column error
                if (bookingResult.toLowerCase().includes('passenger') || bookingResult.toLowerCase().includes('column')) {
                    console.log('   🔍 This appears to be the passenger column issue!');
                }
            }
        }

    } catch (error) {
        console.error('❌ Test setup failed:', error.message);
    }
}

testRideBooking();
