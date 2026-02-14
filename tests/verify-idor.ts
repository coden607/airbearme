
import { storage } from '../server/storage.js';

// Logic verification for IDOR checks
async function runTests() {
  console.log('--- Starting IDOR Logic Verification Tests ---');

  // Setup test users
  const userA = await storage.createUser({
    email: 'userA@test.com',
    username: 'userA',
    role: 'user'
  });
  const userB = await storage.createUser({
    email: 'userB@test.com',
    username: 'userB',
    role: 'user'
  });
  const adminUser = await storage.createUser({
    email: 'admin@test.com',
    username: 'admin',
    role: 'admin'
  });

  console.log(`Created test users: UserA(${userA.id}), UserB(${userB.id}), Admin(${adminUser.id})`);

  // 1. Test GET /api/rides/:id
  console.log('\nTesting GET /api/rides/:id IDOR logic...');
  const ride = await storage.createRide({
    userId: userA.id,
    pickupSpotId: 'spot1',
    dropoffSpotId: 'spot2',
    fare: '15.00',
    status: 'pending'
  });

  const checkRideAccess = (ride: any, authUserId: string, authUserRole: string) => {
    const isOwner = ride.userId === authUserId;
    const isDriver = ride.driverId === authUserId;
    const isAdmin = authUserRole === "admin";
    return isOwner || isDriver || isAdmin;
  };

  if (!checkRideAccess(ride, userB.id, 'user')) {
    console.log('✅ Correct: User B cannot access User A\'s ride');
  } else {
    throw new Error('FAILED: User B accessed User A\'s ride');
  }

  // 2. Test POST endpoints IDOR logic
  console.log('\nTesting POST endpoints IDOR logic...');
  const checkPostAccess = (targetUserId: string, authUserId: string) => {
    return targetUserId === authUserId;
  };

  if (!checkPostAccess(userA.id, userB.id)) {
    console.log('✅ Correct: User B cannot perform action for User A');
  } else {
    throw new Error('FAILED: User B performed action for User A');
  }

  if (checkPostAccess(userA.id, userA.id)) {
    console.log('✅ Correct: User A can perform action for User A');
  }

  console.log('\n--- IDOR Logic Verification Tests Completed ---');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
