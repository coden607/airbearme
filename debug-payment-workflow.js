#!/usr/bin/env node

// Debug script to test payment workflow for both users and drivers
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

async function testPaymentWorkflow(user, description) {
    console.log(`\n🧪 Testing ${description} Payment Workflow...`);
    
    try {
        // 1. Test creating a payment intent
        console.log('   1. Creating payment intent...');
        const paymentData = {
            amount: 10.00,
            orderId: `order_${Date.now()}`,
            rideId: `ride_${Date.now()}`,
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

        console.log(`   Response status: ${paymentResponse.status}`);
        
        const paymentResult = await paymentResponse.text();
        console.log(`   Response body: ${paymentResult.substring(0, 200)}...`);

        if (paymentResponse.ok) {
            const paymentJson = JSON.parse(paymentResult);
            console.log('   ✅ Payment intent created successfully');
            console.log(`   Client Secret: ${paymentJson.clientSecret?.substring(0, 20)}...`);
            console.log(`   Payment Intent ID: ${paymentJson.paymentIntentId}`);
            return { success: true, data: paymentJson };
        } else {
            console.log('   ❌ Payment intent creation failed');
            return { success: false, error: paymentResult };
        }

    } catch (error) {
        console.error(`   ❌ ${description} payment test error:`, error.message);
        return { success: false, error: error.message };
    }
}

async function testCashPaymentWorkflow(user, description) {
    console.log(`\n🧪 Testing ${description} Cash Payment Workflow...`);
    
    try {
        // 1. Test creating a cash payment QR code
        console.log('   1. Creating cash payment QR code...');
        const paymentData = {
            amount: 10.00,
            orderId: `order_${Date.now()}`,
            rideId: `ride_${Date.now()}`,
            userId: user.user.id,
            paymentMethod: 'cash'
        };

        const paymentResponse = await fetch(`${BASE_URL}/api/create-payment-intent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': user.sessionCookie
            },
            body: JSON.stringify(paymentData)
        });

        console.log(`   Response status: ${paymentResponse.status}`);
        
        const paymentResult = await paymentResponse.text();
        console.log(`   Response body: ${paymentResult.substring(0, 200)}...`);

        if (paymentResponse.ok) {
            const paymentJson = JSON.parse(paymentResult);
            console.log('   ✅ Cash payment QR code created successfully');
            console.log(`   QR Code length: ${paymentJson.qrCode?.length || 0}`);
            console.log(`   Payment Method: ${paymentJson.paymentMethod}`);
            return { success: true, data: paymentJson };
        } else {
            console.log('   ❌ Cash payment QR code creation failed');
            return { success: false, error: paymentResult };
        }

    } catch (error) {
        console.error(`   ❌ ${description} cash payment test error:`, error.message);
        return { success: false, error: error.message };
    }
}

async function testStripeCheckoutSession(user, description) {
    console.log(`\n🧪 Testing ${description} Stripe Checkout Session...`);
    
    try {
        const checkoutData = {
            amount: 10.00,
            currency: 'usd',
            successUrl: `${BASE_URL}/success`,
            cancelUrl: `${BASE_URL}/cancel`
        };

        const checkoutResponse = await fetch(`${BASE_URL}/api/stripe/create-checkout-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': user.sessionCookie
            },
            body: JSON.stringify(checkoutData)
        });

        console.log(`   Response status: ${checkoutResponse.status}`);
        
        const checkoutResult = await checkoutResponse.text();
        console.log(`   Response body: ${checkoutResult.substring(0, 200)}...`);

        if (checkoutResponse.ok) {
            const checkoutJson = JSON.parse(checkoutResult);
            console.log('   ✅ Stripe checkout session created successfully');
            console.log(`   Session ID: ${checkoutJson.sessionId?.substring(0, 20)}...`);
            console.log(`   Checkout URL: ${checkoutJson.url?.substring(0, 50)}...`);
            return { success: true, data: checkoutJson };
        } else {
            console.log('   ❌ Stripe checkout session creation failed');
            return { success: false, error: checkoutResult };
        }

    } catch (error) {
        console.error(`   ❌ ${description} checkout session test error:`, error.message);
        return { success: false, error: error.message };
    }
}

async function testPaymentSystem() {
    console.log('💳 Payment Workflow Debug Test\n');
    console.log('This test will check if users and drivers get different errors when making payments...\n');

    try {
        // Create test users
        console.log('👥 Creating test users...');
        const testUser = await createTestUser('user');
        console.log(`   ✅ Test user created: ${testUser.user.id.slice(0, 8)}`);
        
        const testDriver = await createTestUser('driver');
        console.log(`   ✅ Test driver created: ${testDriver.user.id.slice(0, 8)}`);

        // Test user payment workflows
        const userPaymentResult = await testPaymentWorkflow(testUser, 'User');
        const userCashResult = await testCashPaymentWorkflow(testUser, 'User');
        const userCheckoutResult = await testStripeCheckoutSession(testUser, 'User');

        // Test driver payment workflows
        const driverPaymentResult = await testPaymentWorkflow(testDriver, 'Driver');
        const driverCashResult = await testCashPaymentWorkflow(testDriver, 'Driver');
        const driverCheckoutResult = await testStripeCheckoutSession(testDriver, 'Driver');

        // Compare results
        console.log('\n📊 Results Comparison:');
        console.log('User Payment Intent:', userPaymentResult.success ? '✅ Success' : '❌ Failed');
        console.log('Driver Payment Intent:', driverPaymentResult.success ? '✅ Success' : '❌ Failed');
        
        console.log('User Cash Payment:', userCashResult.success ? '✅ Success' : '❌ Failed');
        console.log('Driver Cash Payment:', driverCashResult.success ? '✅ Success' : '❌ Failed');
        
        console.log('User Checkout Session:', userCheckoutResult.success ? '✅ Success' : '❌ Failed');
        console.log('Driver Checkout Session:', driverCheckoutResult.success ? '✅ Success' : '❌ Failed');

        // Check if they get the same errors
        if (!userPaymentResult.success && !driverPaymentResult.success) {
            if (userPaymentResult.error === driverPaymentResult.error) {
                console.log('\n⚠️  IDENTIFIED ISSUE: Users and drivers get the SAME error for payment intents');
                console.log(`Error: ${userPaymentResult.error}`);
            } else {
                console.log('\n✅ Users and drivers get DIFFERENT errors for payment intents');
            }
        }

        console.log('\n🎉 Payment workflow debug complete!');

    } catch (error) {
        console.error('❌ Test setup failed:', error.message);
    }
}

testPaymentSystem();
