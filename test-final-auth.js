#!/usr/bin/env node

// Final comprehensive authentication test
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function finalAuthTest() {
  console.log('🔥 FINAL AUTHENTICATION TEST\n');
  console.log('Testing all authentication scenarios...\n');

  const testCases = [
    {
      name: 'Valid Registration & Login',
      email: `valid${Date.now()}@test.com`,
      username: `validuser${Date.now()}`,
      password: 'ValidPass123!',
      shouldSucceed: true
    },
    {
      name: 'Weak Password',
      email: `weak${Date.now()}@test.com`,
      username: `weakuser${Date.now()}`,
      password: '123',
      shouldSucceed: false
    },
    {
      name: 'Invalid Email',
      email: 'invalid-email',
      username: `invaliduser${Date.now()}`,
      password: 'ValidPass123!',
      shouldSucceed: false
    },
    {
      name: 'Password Mismatch',
      email: `mismatch${Date.now()}@test.com`,
      username: `mismatchuser${Date.now()}`,
      password: 'ValidPass123!',
      confirmPassword: 'DifferentPass123!',
      shouldSucceed: false
    }
  ];

  let successCount = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    console.log(`🧪 Testing: ${testCase.name}`);
    
    try {
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testCase.email,
          username: testCase.username,
          password: testCase.password,
          confirmPassword: testCase.confirmPassword || testCase.password,
          role: 'user'
        })
      });

      const succeeded = response.ok;
      
      if (succeeded === testCase.shouldSucceed) {
        console.log(`✅ ${testCase.name}: ${succeeded ? 'Passed' : 'Failed as expected'}`);
        successCount++;
        
        // If registration succeeded, test login
        if (succeeded) {
          const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: testCase.email,
              password: testCase.password
            })
          });
          
          if (loginResponse.ok) {
            console.log(`  ✅ Login also successful for ${testCase.email}`);
          } else {
            console.log(`  ❌ Login failed for ${testCase.email}`);
          }
        }
      } else {
        console.log(`❌ ${testCase.name}: Unexpected result`);
      }
    } catch (error) {
      console.log(`❌ ${testCase.name}: Network error - ${error.message}`);
    }
    
    console.log('');
  }

  // Test existing user login
  console.log('🔐 Testing existing user login...');
  try {
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testCases[0].email,
        password: testCases[0].password
      })
    });
    
    if (loginResponse.ok) {
      console.log('✅ Existing user login successful');
      successCount++;
    } else {
      console.log('❌ Existing user login failed');
    }
  } catch (error) {
    console.log('❌ Existing user login error:', error.message);
  }

  // Test wrong password
  console.log('\n🚫 Testing wrong password...');
  try {
    const wrongPassResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testCases[0].email,
        password: 'WrongPassword123!'
      })
    });
    
    if (!wrongPassResponse.ok) {
      console.log('✅ Wrong password correctly rejected');
      successCount++;
    } else {
      console.log('❌ Wrong password was accepted (security issue!)');
    }
  } catch (error) {
    console.log('❌ Wrong password test error:', error.message);
  }

  // Test password reset
  console.log('\n🔄 Testing password reset...');
  try {
    const resetResponse = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testCases[0].email
      })
    });
    
    if (resetResponse.ok) {
      console.log('✅ Password reset request processed');
      successCount++;
    } else {
      console.log('❌ Password reset failed');
    }
  } catch (error) {
    console.log('❌ Password reset error:', error.message);
  }

  console.log('\n📊 FINAL RESULTS:');
  console.log(`✅ Passed: ${successCount}/${totalTests + 3} tests`);
  console.log(`❌ Failed: ${totalTests + 3 - successCount}/${totalTests + 3} tests`);
  
  if (successCount === totalTests + 3) {
    console.log('\n🎉 ALL TESTS PASSED! Authentication is ready for production! 🚀');
  } else {
    console.log('\n⚠️ Some tests failed. Please review the issues above.');
  }
}

finalAuthTest().catch(console.error);
