#!/usr/bin/env node

// Debug authentication flow step by step
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function debugAuth() {
  console.log('🔍 Debugging Authentication Flow...\n');

  const testUser = {
    email: `debug${Date.now()}@example.com`,
    username: `debuguser${Date.now()}`,
    password: 'testpassword123',
    confirmPassword: 'testpassword123',
    role: 'user'
  };

  // Step 1: Register
  console.log('📝 Step 1: Registration');
  try {
    const regResponse = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    const regText = await regResponse.text();
    console.log('Response status:', regResponse.status);
    console.log('Response body:', regText);

    if (regResponse.ok) {
      const regData = JSON.parse(regText);
      console.log('✅ Registration successful for:', regData.user.email);
      console.log('✅ User ID:', regData.user.id);

      // Step 2: Try login immediately
      console.log('\n🔐 Step 2: Login Test');
      const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password
        })
      });

      const loginText = await loginResponse.text();
      console.log('Login response status:', loginResponse.status);
      console.log('Login response body:', loginText);

      // Step 3: Test with wrong password
      console.log('\n❌ Step 3: Wrong Password Test');
      const wrongPassResponse = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: 'wrongpassword'
        })
      });

      const wrongText = await wrongPassResponse.text();
      console.log('Wrong pass response status:', wrongPassResponse.status);
      console.log('Wrong pass response body:', wrongText);

    } else {
      console.log('❌ Registration failed');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

debugAuth().catch(console.error);
