#!/usr/bin/env node

// Test script to verify driver payment restrictions
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

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

async function createTestUser(role = 'user') {
    const timestamp = Date.now();
    const testUser = {
        username: `test${role}_${timestamp}`,
        email: `test${role}_${timestamp}@example.com`,
        password: 'password123',
        confirmPassword: 'password123',
        fullName: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
        role: role
    };

    const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
    });

    if (!registerResponse.ok) {
        const error = await registerResponse.text();
        throw new Error(`Failed to create ${role}: ${error}`);
    }

    const userData = await registerResponse.json();
    
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUser.email, password: testUser.password })
    });

    getCookies(loginResponse.headers);
    const sessionCookie = getCookies(loginResponse.headers);

    return { user: userData.user, sessionCookie, role };
}

async function testRideBooking(user) {
    console.log(`\n🚗 Testing ${user.role} ride booking...`);
    
    try {
        const spotsResponse = await fetch(`${BASE_URL}/api/spots`);
        const spots = await spotsResponse.json();
        
        if (spots.length < 2) throw new Error('Not enough spots');

        const bookingData = {
            userId: user.user.id,
            pickupSpotId: spots[0].id,
            dropoffSpotId: spots[1].id,
            airbearId: null,
            passengers: 1,
            fare: "4.00",
            status: 'pending'
        };

        const bookingResponse = await fetch(`${BASE_URL}/api/rides`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': user.sessionCookie },
            body: JSON.stringify(bookingData)
        });

        const bookingResult = await bookingResponse.text();
        
        // Check if driver is blocked (403 with driver message)
        if (bookingResponse.status === 403 && bookingResult.toLowerCase().includes('driver')) {
            console.log(`   ✅ ${user.role} correctly BLOCKED from booking rides`);
            return { blocked: true };
        } else if (bookingResponse.ok) {
            console.log(`   ✅ ${user.role} successfully booked a ride`);
            return { allowed: true };
        } else {
            console.log(`   ⚠️  Status ${bookingResponse.status}: ${bookingResult.substring(0, 80)}`);
            return { error: bookingResult };
        }

    } catch (error) {
        console.error(`   ❌ Error:`, error.message);
        return { error: error.message };
    }
}

async function testBodegaOrder(user) {
    console.log(`\n🛍️ Testing ${user.role} bodega order...`);
    
    try {
        const itemsResponse = await fetch(`${BASE_URL}/api/bodega/items`);
        const items = await itemsResponse.json();
        
        if (items.length === 0) throw new Error('No items');

        const orderData = {
            userId: user.user.id,
            items: [{ itemId: items[0].id, quantity: 1, price: items[0].price }],
            totalAmount: items[0].price,
            status: 'pending'
        };

        const orderResponse = await fetch(`${BASE_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': user.sessionCookie },
            body: JSON.stringify(orderData)
        });

        const orderResult = await orderResponse.text();
        
        // Check if driver is blocked (403 with driver message)
        if (orderResponse.status === 403 && orderResult.toLowerCase().includes('driver')) {
            console.log(`   ✅ ${user.role} correctly BLOCKED from placing orders`);
            return { blocked: true };
        } else if (orderResponse.ok) {
            console.log(`   ✅ ${user.role} successfully placed an order`);
            return { allowed: true };
        } else {
            console.log(`   ⚠️  Status ${orderResponse.status}: ${orderResult.substring(0, 80)}`);
            return { error: orderResult };
        }

    } catch (error) {
        console.error(`   ❌ Error:`, error.message);
        return { error: error.message };
    }
}

async function testDriverRestrictions() {
    console.log('🔍 Driver Payment Restrictions Verification Test\n');

    try {
        console.log('👥 Creating test users...');
        const testUser = await createTestUser('user');
        console.log(`   ✅ User created: ${testUser.user.id.slice(0, 8)}`);
        
        const testDriver = await createTestUser('driver');
        console.log(`   ✅ Driver created: ${testDriver.user.id.slice(0, 8)}`);

        console.log('\n📱 USER WORKFLOWS:');
        const userRideResult = await testRideBooking(testUser);
        const userOrderResult = await testBodegaOrder(testUser);

        console.log('\n🚗 DRIVER WORKFLOWS:');
        const driverRideResult = await testRideBooking(testDriver);
        const driverOrderResult = await testBodegaOrder(testDriver);

        console.log('\n📊 RESULTS:');
        console.log('User can book rides:', userRideResult.allowed ? '✅ YES' : '❌ NO');
        console.log('User can place orders:', userOrderResult.allowed ? '✅ YES' : '❌ NO');
        console.log('Driver blocked from rides:', driverRideResult.blocked ? '✅ YES' : '❌ NO');
        console.log('Driver blocked from orders:', driverOrderResult.blocked ? '✅ YES' : '❌ NO');

        const allCorrect = userRideResult.allowed && userOrderResult.allowed && 
                         driverRideResult.blocked && driverOrderResult.blocked;

        if (allCorrect) {
            console.log('\n🎉 ALL TESTS PASSED! Driver payment restrictions working correctly!');
        } else {
            console.log('\n⚠️  Some restrictions may not be working');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testDriverRestrictions();
