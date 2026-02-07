#!/usr/bin/env node

// Debug password mismatch test
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testPasswordMismatch() {
  console.log('🔍 Debugging Password Mismatch Test\n');

  const testData = {
    email: `mismatch${Date.now()}@test.com`,
    username: `mismatchuser${Date.now()}`,
    password: 'ValidPass123!',
    confirmPassword: 'DifferentPass123!',
    role: 'user'
  };

  console.log('Sending data:', JSON.stringify(testData, null, 2));

  try {
    const response = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });

    console.log('Response status:', response.status);
    const responseText = await response.text();
    console.log('Response body:', responseText);

    if (response.status === 400) {
      console.log('✅ Password mismatch correctly rejected');
    } else {
      console.log('❌ Password mismatch was accepted (should be rejected)');
    }
  } catch (error) {
    console.log('❌ Network error:', error.message);
  }
}

testPasswordMismatch().catch(console.error);
