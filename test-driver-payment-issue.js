#!/usr/bin/env node

// Test script to reproduce the driver payment issue
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
        throw new Error(`Failed to login ${role}`);
    }

    return {
        user: userData.user,
        sessionCookie,
        role
    };
}

async function testRideBooking(user) {
    console.log(`\n🚗 Testing ${user.role} ride booking...`);
    
    try {
        // Get spots for booking
        const spotsResponse = await fetch(`${BASE_URL}/api/spots`);
        const spots = await spotsResponse.json();
        
        if (spots.length < 2) {
            throw new Error('Not enough spots available for booking');
        }

        const pickupSpot = spots[0];
        const dropoffSpot = spots[1];

        console.log(`   Pickup: ${pickupSpot.name}`);
        console.log(`   Dropoff: ${dropoffSpot.name}`);

        // Book a ride
        const bookingData = {
            userId: user.user.id,
            pickupSpotId: pickupSpot.id,
            dropoffSpotId: dropoffSpot.id,
            airbearId: null,
            passengers: 1,
            fare: 4.00,
            status: 'pending'
        };

        const bookingResponse = await fetch(`${BASE_URL}/api/rides`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': user.sessionCookie
            },
            body: JSON.stringify(bookingData)
        });

        console.log(`   Booking response status: ${bookingResponse.status}`);
        
        const bookingResult = await bookingResponse.text();
        console.log(`   Booking response: ${bookingResult.substring(0, 200)}...`);

        if (bookingResponse.ok) {
            const bookingJson = JSON.parse(bookingResult);
            console.log('   ✅ Ride booked successfully');
            console.log(`   Ride ID: ${bookingJson.id}`);
            
            // Now test payment for this ride
            return await testRidePayment(user, bookingJson);
        } else {
            console.log('   ❌ Ride booking failed');
            return { success: false, error: bookingResult };
        }

    } catch (error) {
        console.error(`   ❌ ${user.role} ride booking error:`, error.message);
        return { success: false, error: error.message };
    }
}

async function testRidePayment(user, rideData) {
    console.log(`\n💳 Testing ${user.role} ride payment...`);
    
    try {
        const paymentData = {
            amount: rideData.fare || 4.00,
            orderId: `order_${Date.now()}`,
            rideId: rideData.id,
            userId: user.user.id,
            paymentMethod: 'stripe'
        };

        const paymentResponse = await fetch(`${BASE_URL}/api/create-payment-intent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': user.sessionCookie
            },
            body: JSON.stringify(paymentData)
        });

        console.log(`   Payment response status: ${paymentResponse.status}`);
        
        const paymentResult = await paymentResponse.text();
        console.log(`   Payment response: ${paymentResult.substring(0, 200)}...`);

        if (paymentResponse.ok) {
            const paymentJson = JSON.parse(paymentResult);
            console.log('   ✅ Payment intent created successfully');
            console.log(`   Client Secret: ${paymentJson.clientSecret?.substring(0, 20)}...`);
            return { success: true, data: paymentJson };
        } else {
            console.log('   ❌ Payment intent creation failed');
            return { success: false, error: paymentResult };
        }

    } catch (error) {
        console.error(`   ❌ ${user.role} ride payment error:`, error.message);
        return { success: false, error: error.message };
    }
}

async function testBodegaOrder(user) {
    console.log(`\n🛍️ Testing ${user.role} bodega order...`);
    
    try {
        // Get bodega items
        const itemsResponse = await fetch(`${BASE_URL}/api/bodega/items`);
        const items = await itemsResponse.json();
        
        if (items.length === 0) {
            throw new Error('No bodega items available');
        }

        const selectedItem = items[0];
        console.log(`   Selected item: ${selectedItem.name}`);

        // Create an order
        const orderData = {
            userId: user.user.id,
            items: [{
                itemId: selectedItem.id,
                quantity: 1,
                price: selectedItem.price
            }],
            totalAmount: selectedItem.price,
            status: 'pending'
        };

        const orderResponse = await fetch(`${BASE_URL}/api/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': user.sessionCookie
            },
            body: JSON.stringify(orderData)
        });

        console.log(`   Order response status: ${orderResponse.status}`);
        
        const orderResult = await orderResponse.text();
        console.log(`   Order response: ${orderResult.substring(0, 200)}...`);

        if (orderResponse.ok) {
            const orderJson = JSON.parse(orderResult);
            console.log('   ✅ Order created successfully');
            console.log(`   Order ID: ${orderJson.id}`);
            
            // Now test payment for this order
            return await testOrderPayment(user, orderJson);
        } else {
            console.log('   ❌ Order creation failed');
            return { success: false, error: orderResult };
        }

    } catch (error) {
        console.error(`   ❌ ${user.role} bodega order error:`, error.message);
        return { success: false, error: error.message };
    }
}

async function testOrderPayment(user, orderData) {
    console.log(`\n💳 Testing ${user.role} order payment...`);
    
    try {
        const paymentData = {
            amount: parseFloat(orderData.totalAmount) || 10.00,
            orderId: orderData.id,
            rideId: null,
            userId: user.user.id,
            paymentMethod: 'stripe'
        };

        const paymentResponse = await fetch(`${BASE_URL}/api/create-payment-intent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': user.sessionCookie
            },
            body: JSON.stringify(paymentData)
        });

        console.log(`   Payment response status: ${paymentResponse.status}`);
        
        const paymentResult = await paymentResponse.text();
        console.log(`   Payment response: ${paymentResult.substring(0, 200)}...`);

        if (paymentResponse.ok) {
            const paymentJson = JSON.parse(paymentResult);
            console.log('   ✅ Payment intent created successfully');
            console.log(`   Client Secret: ${paymentJson.clientSecret?.substring(0, 20)}...`);
            return { success: true, data: paymentJson };
        } else {
            console.log('   ❌ Payment intent creation failed');
            return { success: false, error: paymentResult };
        }

    } catch (error) {
        console.error(`   ❌ ${user.role} order payment error:`, error.message);
        return { success: false, error: error.message };
    }
}

async function testDriverPaymentIssue() {
    console.log('🔍 Driver Payment Issue Reproduction Test\n');
    console.log('This test will check if drivers can book rides and make payments like regular users...\n');

    try {
        // Create test users
        console.log('👥 Creating test users...');
        const testUser = await createTestUser('user');
        console.log(`   ✅ Test user created: ${testUser.user.id.slice(0, 8)}`);
        
        const testDriver = await createTestUser('driver');
        console.log(`   ✅ Test driver created: ${testDriver.user.id.slice(0, 8)}`);

        // Test user workflows
        console.log('\n📱 USER WORKFLOWS:');
        const userRideResult = await testRideBooking(testUser);
        const userOrderResult = await testBodegaOrder(testUser);

        // Test driver workflows
        console.log('\n🚗 DRIVER WORKFLOWS:');
        const driverRideResult = await testRideBooking(testDriver);
        const driverOrderResult = await testBodegaOrder(testDriver);

        // Compare results
        console.log('\n📊 RESULTS COMPARISON:');
        console.log('User Ride Booking + Payment:', userRideResult.success ? '✅ Success' : '❌ Failed');
        console.log('Driver Ride Booking + Payment:', driverRideResult.success ? '✅ Success' : '❌ Failed');
        
        console.log('User Order + Payment:', userOrderResult.success ? '✅ Success' : '❌ Failed');
        console.log('Driver Order + Payment:', driverOrderResult.success ? '✅ Success' : '❌ Failed');

        // Check if drivers should be restricted
        if (driverRideResult.success || driverOrderResult.success) {
            console.log('\n⚠️  ISSUE IDENTIFIED: Drivers can book rides and make payments like regular users!');
            console.log('   This might be the source of confusion - drivers should probably not be able to:');
            console.log('   1. Book rides as passengers');
            console.log('   2. Make purchases from the bodega');
            console.log('   3. Access customer checkout flows');
        } else {
            console.log('\n✅ Drivers are properly restricted from customer workflows');
        }

        console.log('\n🎉 Driver payment issue reproduction test complete!');

    } catch (error) {
        console.error('❌ Test setup failed:', error.message);
    }
}

testDriverPaymentIssue();
