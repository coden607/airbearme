#!/usr/bin/env node

// Test script to verify authentication fixes
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testAuth() {
  console.log('🧪 Testing Authentication Fixes...\n');

  // Test 1: Registration
  console.log('1️⃣ Testing Registration...');
  const testUser = {
    email: `test${Date.now()}@example.com`,
    username: `testuser${Date.now()}`,
    password: 'testpassword123',
    confirmPassword: 'testpassword123',
    role: 'user'
  };

  try {
    const regResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    if (regResponse.ok) {
      const regData = await regResponse.json();
      console.log('✅ Registration successful:', regData.user.email);
      
      // Test 2: Login with same credentials
      console.log('\n2️⃣ Testing Login...');
      const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password
        })
      });

      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        console.log('✅ Login successful:', loginData.user.email);
        console.log('✅ User role:', loginData.user.role);
        console.log('✅ User ID:', loginData.user.id);
      } else {
        const error = await loginResponse.json();
        console.log('❌ Login failed:', error.message);
      }
    } else {
      const error = await regResponse.json();
      console.log('❌ Registration failed:', error.message);
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
  }

  // Test 3: Health check
  console.log('\n3️⃣ Testing Server Health...');
  try {
    const healthResponse = await fetch(`${BASE_URL}/api/health`);
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log('✅ Server health:', health.status);
    } else {
      console.log('❌ Server health check failed');
    }
  } catch (error) {
    console.log('❌ Server unreachable:', error.message);
  }

  console.log('\n🎉 Authentication test completed!');
}

testAuth().catch(console.error);
