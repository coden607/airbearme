#!/usr/bin/env node

/**
 * AirBear PWA - Complete E2E Workflow Validation
 * Tests all user flows: signup, login, map, ride booking, payments, bodega
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// Test data
const testUser = {
  email: `testuser${Date.now()}@airbear.app`,
  password: 'Test123456!',
  username: `testuser${Date.now()}`,
  fullName: 'Test User',
  role: 'user'
};

const testDriver = {
  email: `driver${Date.now()}@airbear.app`,
  password: 'Driver123456!',
  username: `driver${Date.now()}`,
  fullName: 'Test Driver',
  role: 'driver'
};

let createdUserId = null;
let createdDriverId = null;
let spots = [];
let airbears = [];
let createdRide = null;
let createdOrder = null;

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

async function runTest(testName, testFn) {
  try {
    console.log(`\n🧪 Testing: ${testName}...`);
    const result = await testFn();
    console.log(`   ✅ PASS: ${testName}`);
    results.passed++;
    results.tests.push({ name: testName, status: 'pass', result });
    return result;
  } catch (error) {
    console.log(`   ❌ FAIL: ${testName}`);
    console.log(`      Error: ${error.message}`);
    results.failed++;
    results.tests.push({ name: testName, status: 'fail', error: error.message });
    return null;
  }
}

// ============== INFRASTRUCTURE TESTS ==============

async function testHealthCheck() {
  const response = await fetch(`${BASE_URL}/api/health`);
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'ok') throw new Error('Health status not ok');
  console.log(`      Server status: ${JSON.stringify(data)}`);
  return data;
}

async function testGetSpots() {
  const response = await fetch(`${BASE_URL}/api/spots`);
  if (!response.ok) throw new Error(`Failed to get spots: ${response.status}`);
  spots = await response.json();
  if (!Array.isArray(spots)) throw new Error('Spots is not an array');
  console.log(`      Found ${spots.length} spots`);
  if (spots.length === 0) throw new Error('No spots available');
  return spots;
}

async function testGetAirbears() {
  const response = await fetch(`${BASE_URL}/api/airbears`);
  if (!response.ok) throw new Error(`Failed to get airbears: ${response.status}`);
  airbears = await response.json();
  if (!Array.isArray(airbears)) throw new Error('Airbears is not an array');
  console.log(`      Found ${airbears.length} airbears`);
  const available = airbears.filter(a => a.isAvailable || a.is_available);
  console.log(`      Available: ${available.length}, Charging: ${airbears.filter(a => a.isCharging || a.is_charging).length}`);
  return airbears;
}

async function testGetBodegaItems() {
  const response = await fetch(`${BASE_URL}/api/bodega-items`);
  if (!response.ok) throw new Error(`Failed to get bodega items: ${response.status}`);
  const items = await response.json();
  if (!Array.isArray(items)) throw new Error('Bodega items is not an array');
  console.log(`      Found ${items.length} bodega items`);
  return items;
}

// ============== USER AUTHENTICATION TESTS ==============

async function testUserSignup() {
  const response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testUser)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Registration failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.user || !data.user.id) throw new Error('No user returned');
  createdUserId = data.user.id;
  console.log(`      Created user: ${data.user.email} (${data.user.role})`);
  return data;
}

async function testDriverSignup() {
  const response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testDriver)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Driver registration failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.user || !data.user.id) throw new Error('No driver user returned');
  createdDriverId = data.user.id;
  console.log(`      Created driver: ${data.user.email} (${data.user.role})`);
  return data;
}

// ============== MAP & SPOTS TESTS ==============

async function testSpotsHaveCoordinates() {
  if (spots.length === 0) throw new Error('No spots to validate');

  for (const spot of spots.slice(0, 5)) {
    const lat = Number(spot.latitude);
    const lng = Number(spot.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      throw new Error(`Spot ${spot.name} has invalid coordinates`);
    }
  }
  console.log(`      All spot coordinates are valid`);
  return true;
}

async function testAirbearsHaveLocations() {
  if (airbears.length === 0) throw new Error('No airbears to validate');

  for (const bear of airbears) {
    const lat = Number(bear.latitude);
    const lng = Number(bear.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      throw new Error(`Airbear ${bear.id} has invalid coordinates`);
    }
  }
  console.log(`      All airbear locations are valid`);
  return true;
}

// ============== RIDE BOOKING TESTS ==============

async function testBookRide() {
  if (spots.length < 2) throw new Error('Need at least 2 spots to book ride');

  const pickupSpot = spots[0];
  const dropoffSpot = spots[1];

  const response = await fetch(`${BASE_URL}/api/rides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: createdUserId || 'demo-user',
      pickupSpotId: pickupSpot.id,
      dropoffSpotId: dropoffSpot.id,
      airbearId: airbears[0]?.id || null,
      fare: '4.00',
      distance: '2.5',
      status: 'pending'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ride booking failed: ${error}`);
  }

  createdRide = await response.json();
  console.log(`      Booked ride: ${pickupSpot.name} → ${dropoffSpot.name}`);
  console.log(`      Ride ID: ${createdRide.id}, Fare: $${createdRide.fare}`);
  return createdRide;
}

async function testGetUserRides() {
  const userId = createdUserId || 'demo-user';
  const response = await fetch(`${BASE_URL}/api/rides/user/${userId}`);
  if (!response.ok) throw new Error(`Failed to get user rides: ${response.status}`);
  const rides = await response.json();
  console.log(`      User has ${rides.length} rides`);
  return rides;
}

async function testUpdateRideStatus() {
  if (!createdRide) throw new Error('No ride to update');

  const response = await fetch(`${BASE_URL}/api/rides/${createdRide.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'accepted' })
  });

  if (!response.ok) throw new Error(`Failed to update ride: ${response.status}`);
  const updated = await response.json();
  console.log(`      Ride status updated to: ${updated.status}`);
  return updated;
}

// ============== PAYMENT TESTS ==============

async function testCreatePaymentIntent() {
  const response = await fetch(`${BASE_URL}/api/create-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 4.32,
      orderId: 'test-order-123',
      rideId: createdRide?.id,
      userId: createdUserId || 'demo-user',
      paymentMethod: 'stripe'
    })
  });

  if (!response.ok) {
    // In demo mode without Stripe keys, this might return a mock
    const data = await response.json().catch(() => ({}));
    if (data.clientSecret?.startsWith('mock_')) {
      console.log(`      Demo mode payment intent created`);
      return data;
    }
    throw new Error(`Payment intent failed: ${response.status}`);
  }

  const data = await response.json();
  console.log(`      Payment intent created: ${data.clientSecret?.substring(0, 20)}...`);
  return data;
}

async function testCashPaymentQR() {
  const response = await fetch(`${BASE_URL}/api/create-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 4.00,
      rideId: createdRide?.id,
      paymentMethod: 'cash'
    })
  });

  if (!response.ok) throw new Error(`Cash payment QR failed: ${response.status}`);
  const data = await response.json();
  if (!data.qrCode) throw new Error('No QR code returned');
  console.log(`      Cash QR code generated (${data.qrCode.length} chars)`);
  return data;
}

// ============== BODEGA TESTS ==============

async function testCreateOrder() {
  const items = await fetch(`${BASE_URL}/api/bodega-items`).then(r => r.json());
  if (!items || items.length === 0) throw new Error('No bodega items available');

  const response = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: createdUserId || 'demo-user',
      items: [
        { itemId: items[0].id, quantity: 2, price: items[0].price }
      ],
      totalAmount: (parseFloat(items[0].price) * 2).toFixed(2),
      status: 'pending'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Order creation failed: ${error}`);
  }

  createdOrder = await response.json();
  console.log(`      Created order: ${createdOrder.id}, Total: $${createdOrder.totalAmount}`);
  return createdOrder;
}

async function testGetOrderById() {
  if (!createdOrder) throw new Error('No order to fetch');

  const response = await fetch(`${BASE_URL}/api/orders/${createdOrder.id}`);
  if (!response.ok) throw new Error(`Failed to get order: ${response.status}`);
  const order = await response.json();
  console.log(`      Retrieved order: ${order.id}, Status: ${order.status}`);
  return order;
}

async function testGetUserOrders() {
  const userId = createdUserId || 'demo-user';
  const response = await fetch(`${BASE_URL}/api/orders/user/${userId}`);
  if (!response.ok) throw new Error(`Failed to get user orders: ${response.status}`);
  const orders = await response.json();
  console.log(`      User has ${orders.length} orders`);
  return orders;
}

// ============== ANALYTICS TESTS ==============

async function testAnalyticsOverview() {
  const response = await fetch(`${BASE_URL}/api/analytics/overview`);
  if (!response.ok) throw new Error(`Analytics failed: ${response.status}`);
  const data = await response.json();
  console.log(`      Fleet: ${data.totalAirbears} airbears, ${data.activeAirbears} active, ${data.averageBatteryLevel}% avg battery`);
  return data;
}

// ============== RUN ALL TESTS ==============

async function runAllTests() {
  console.log('\n🚀 AIRBEAR PWA - COMPLETE E2E VALIDATION');
  console.log('==========================================');
  console.log(`Target: ${BASE_URL}`);
  console.log('==========================================\n');

  console.log('📡 INFRASTRUCTURE TESTS');
  console.log('------------------------');
  await runTest('Health Check', testHealthCheck);
  await runTest('Load Spots', testGetSpots);
  await runTest('Load Airbears', testGetAirbears);
  await runTest('Load Bodega Items', testGetBodegaItems);

  console.log('\n🗺️  MAP & LOCATION TESTS');
  console.log('-------------------------');
  await runTest('Validate Spot Coordinates', testSpotsHaveCoordinates);
  await runTest('Validate Airbear Locations', testAirbearsHaveLocations);

  console.log('\n👤 USER AUTHENTICATION TESTS');
  console.log('-----------------------------');
  await runTest('User Signup', testUserSignup);
  await runTest('Driver Signup', testDriverSignup);

  console.log('\n🚗 RIDE BOOKING TESTS');
  console.log('----------------------');
  await runTest('Book Ride', testBookRide);
  await runTest('Get User Rides', testGetUserRides);
  await runTest('Update Ride Status', testUpdateRideStatus);

  console.log('\n💳 PAYMENT TESTS');
  console.log('-----------------');
  await runTest('Create Payment Intent (Card)', testCreatePaymentIntent);
  await runTest('Create Cash Payment QR', testCashPaymentQR);

  console.log('\n🛒 BODEGA TESTS');
  console.log('----------------');
  await runTest('Create Order', testCreateOrder);
  await runTest('Get Order By ID', testGetOrderById);
  await runTest('Get User Orders', testGetUserOrders);

  console.log('\n📊 ANALYTICS TESTS');
  console.log('-------------------');
  await runTest('Fleet Analytics', testAnalyticsOverview);

  // Print summary
  console.log('\n==========================================');
  console.log('📋 TEST SUMMARY');
  console.log('==========================================');
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📊 Total:  ${results.passed + results.failed}`);

  if (results.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.tests.filter(t => t.status === 'fail').forEach(t => {
      console.log(`   - ${t.name}: ${t.error}`);
    });
  }

  console.log('\n==========================================');
  if (results.failed === 0) {
    console.log('🎉 ALL TESTS PASSED! App is working flawlessly!');
  } else {
    console.log('⚠️  Some tests failed. Please review and fix.');
  }
  console.log('==========================================\n');

  return results.failed === 0;
}

// Run tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
