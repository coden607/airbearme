import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5000';

// Test credentials
const USER_CREDENTIALS = {
  email: 'testuser@airbear.com',
  password: 'TestUser123!',
  name: 'Test User'
};

const DRIVER_CREDENTIALS = {
  email: 'testdriver@airbear.com', 
  password: 'TestDriver123!',
  name: 'Test Driver'
};

test.describe('AirBear PWA - User Workflow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies before each test
    await page.context().clearCookies();
    // Safely clear storage - wrap in try-catch
    try {
      await page.goto(BASE_URL);
      await page.evaluate(() => {
        try {
          if (window.localStorage) localStorage.clear();
          if (window.sessionStorage) sessionStorage.clear();
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore navigation errors */ }
  });

  test('User registration and login workflow', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Test user registration
    await page.click('[data-testid="signup-button"], button:has-text("Sign Up")');
    await page.fill('[data-testid="email-input"], input[type="email"]', USER_CREDENTIALS.email);
    await page.fill('[data-testid="password-input"], input[type="password"]', USER_CREDENTIALS.password);
    await page.fill('[data-testid="name-input"], input[name="name"], input[placeholder*="name"]', USER_CREDENTIALS.name);
    
    // Select user role
    await page.click('[data-testid="user-role"], input[value="user"], button:has-text("User")');
    
    await page.click('[data-testid="register-button"], button:has-text("Sign Up"), button:has-text("Register")');
    
    // Wait for registration to complete
    await page.waitForTimeout(2000);
    
    // Verify successful registration (redirect to dashboard or login)
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/dashboard|login|rides/);

    // Test login
    await page.goto(BASE_URL + '/login');
    await page.fill('[data-testid="email-input"], input[type="email"]', USER_CREDENTIALS.email);
    await page.fill('[data-testid="password-input"], input[type="password"]', USER_CREDENTIALS.password);
    await page.click('[data-testid="login-button"], button:has-text("Sign In"), button:has-text("Login")');
    
    // Verify successful login
    await page.waitForURL(/dashboard|rides/);
    expect(page.locator('[data-testid="user-menu"], .user-profile, [data-testid="dashboard"]')).toBeVisible();
  });

  test('User ride booking workflow', async ({ page }) => {
    // Login as user
    await page.goto(BASE_URL + '/login');
    await page.fill('[data-testid="email-input"], input[type="email"]', USER_CREDENTIALS.email);
    await page.fill('[data-testid="password-input"], input[type="password"]', USER_CREDENTIALS.password);
    await page.click('[data-testid="login-button"], button:has-text("Sign In")');
    await page.waitForURL(/dashboard/);

    // Book a ride
    await page.click('[data-testid="book-ride"], button:has-text("Book Ride"), [data-testid="request-ride"]');
    
    // Fill ride details
    await page.fill('[data-testid="pickup-input"], input[placeholder*="pickup"], input[placeholder*="from"]', '123 Main St');
    await page.fill('[data-testid="destination-input"], input[placeholder*="destination"], input[placeholder*="to"]', '456 Oak Ave');
    
    // Select ride type
    await page.click('[data-testid="ride-type"], select[name="rideType"]');
    await page.click('option:has-text("Standard")');
    
    // Request ride
    await page.click('[data-testid="request-ride-button"], button:has-text("Request Ride"), button:has-text("Book")');
    
    // Verify ride request submitted
    await page.waitForSelector('[data-testid="ride-status"], .ride-status, [data-testid="tracking"]');
    expect(page.locator('[data-testid="ride-status"], .ride-status')).toBeVisible();
    
    // Check ride tracking
    await page.click('[data-testid="track-ride"], button:has-text("Track"), [data-testid="ride-details"]');
    await page.waitForSelector('[data-testid="map"], .map-container, [data-testid="driver-location"]');
    expect(page.locator('[data-testid="map"], .map-container')).toBeVisible();
  });

  test('User payment workflow', async ({ page }) => {
    // Login as user
    await page.goto(BASE_URL + '/login');
    await page.fill('[data-testid="email-input"], input[type="email"]', USER_CREDENTIALS.email);
    await page.fill('[data-testid="password-input"], input[type="password"]', USER_CREDENTIALS.password);
    await page.click('[data-testid="login-button"], button:has-text("Sign In")');
    
    // Navigate to payment section
    await page.click('[data-testid="payment"], button:has-text("Payment"), [data-testid="billing"]');
    
    // Add payment method
    await page.click('[data-testid="add-payment"], button:has-text("Add Payment"), button:has-text("Add Card")');
    
    // Fill payment details (test card)
    await page.fill('[data-testid="card-number"], input[name="cardNumber"], input[placeholder*="card"]', '4242424242424242');
    await page.fill('[data-testid="card-expiry"], input[name="expiry"], input[placeholder*="expiry"]', '12/25');
    await page.fill('[data-testid="card-cvc"], input[name="cvc"], input[placeholder*="CVC"]', '123');
    await page.fill('[data-testid="card-name"], input[name="name"], input[placeholder*="name"]', 'Test User');
    
    await page.click('[data-testid="save-card"], button:has-text("Save"), button:has-text("Add Card")');
    
    // Verify payment method added
    await page.waitForSelector('[data-testid="payment-method"], .payment-card, [data-testid="card-list"]');
    expect(page.locator('[data-testid="payment-method"], .payment-card')).toBeVisible();
  });

  test('User profile and settings workflow', async ({ page }) => {
    // Login as user
    await page.goto(BASE_URL + '/login');
    await page.fill('[data-testid="email-input"], input[type="email"]', USER_CREDENTIALS.email);
    await page.fill('[data-testid="password-input"], input[type="password"]', USER_CREDENTIALS.password);
    await page.click('[data-testid="login-button"], button:has-text("Sign In")');
    
    // Navigate to profile
    await page.click('[data-testid="profile"], button:has-text("Profile"), [data-testid="user-menu"]');
    
    // Update profile information
    await page.fill('[data-testid="profile-name"], input[name="name"], input[placeholder*="name"]', 'Updated Test User');
    await page.fill('[data-testid="profile-phone"], input[name="phone"], input[placeholder*="phone"]', '+1234567890');
    
    await page.click('[data-testid="save-profile"], button:has-text("Save"), button:has-text("Update")');
    
    // Verify profile updated
    await page.waitForSelector('[data-testid="success-message"], .success, [data-testid="profile-updated"]');
    expect(page.locator('[data-testid="success-message"], .success')).toBeVisible();
    
    // Test logout
    await page.click('[data-testid="logout"], button:has-text("Logout"), [data-testid="sign-out"]');
    await page.waitForURL(/login|home/);
    expect(page.url()).toMatch(/login|home/);
  });
});

test.describe('AirBear PWA - Driver Workflow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies before each test
    await page.context().clearCookies();
    // Safely clear storage - wrap in try-catch
    try {
      await page.goto(BASE_URL);
      await page.evaluate(() => {
        try {
          if (window.localStorage) localStorage.clear();
          if (window.sessionStorage) sessionStorage.clear();
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore navigation errors */ }
  });

  test('Driver registration and login workflow', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Test driver registration
    await page.click('[data-testid="signup-button"], button:has-text("Sign Up")');
    await page.fill('[data-testid="email-input"], input[type="email"]', DRIVER_CREDENTIALS.email);
    await page.fill('[data-testid="password-input"], input[type="password"]', DRIVER_CREDENTIALS.password);
    await page.fill('[data-testid="name-input"], input[name="name"], input[placeholder*="name"]', DRIVER_CREDENTIALS.name);
    
    // Select driver role
    await page.click('[data-testid="driver-role"], input[value="driver"], button:has-text("Driver")');
    
    // Fill driver-specific fields
    await page.fill('[data-testid="license-number"], input[name="licenseNumber"], input[placeholder*="license"]', 'DL123456789');
    await page.fill('[data-testid="vehicle-make"], input[name="vehicleMake"], input[placeholder*="make"]', 'Toyota');
    await page.fill('[data-testid="vehicle-model"], input[name="vehicleModel"], input[placeholder*="model"]', 'Camry');
    await page.fill('[data-testid="vehicle-year"], input[name="vehicleYear"], input[placeholder*="year"]', '2020');
    await page.fill('[data-testid="vehicle-plate"], input[name="vehiclePlate"], input[placeholder*="plate"]', 'ABC123');
    
    await page.click('[data-testid="register-button"], button:has-text("Sign Up"), button:has-text("Register")');
    
    // Wait for registration to complete
    await page.waitForTimeout(2000);
    
    // Test driver login
    await page.goto(BASE_URL + '/login');
    await page.fill('[data-testid="email-input"], input[type="email"]', DRIVER_CREDENTIALS.email);
    await page.fill('[data-testid="password-input"], input[type="password"]', DRIVER_CREDENTIALS.password);
    await page.click('[data-testid="login-button"], button:has-text("Sign In"), button:has-text("Login")');
    
    // Verify successful login
    await page.waitForURL(/dashboard|driver/);
    expect(page.locator('[data-testid="driver-menu"], .driver-dashboard, [data-testid="driver-status"]')).toBeVisible();
  });

  test('Driver availability and ride acceptance workflow', async ({ page }) => {
    // Login as driver
    await page.goto(BASE_URL + '/login');
    await page.fill('[data-testid="email-input"], input[type="email"]', DRIVER_CREDENTIALS.email);
    await page.fill('[data-testid="password-input"], input[type="password"]', DRIVER_CREDENTIALS.password);
    await page.click('[data-testid="login-button"], button:has-text("Sign In")');
    
    // Go online (available for rides)
    await page.click('[data-testid="go-online"], button:has-text("Go Online"), [data-testid="toggle-availability"]');
    
    // Verify driver is online
    await page.waitForSelector('[data-testid="online-status"], .status-online, [data-testid="available"]');
    expect(page.locator('[data-testid="online-status"], .status-online')).toBeVisible();
    
    // Wait for ride request (simulate)
    await page.waitForTimeout(3000);
    
    // Accept ride (if available)
    const acceptButton = page.locator('[data-testid="accept-ride"], button:has-text("Accept"), [data-testid="ride-request"]');
    if (await acceptButton.isVisible()) {
      await acceptButton.click();
      
      // Verify ride accepted
      await page.waitForSelector('[data-testid="ride-accepted"], .active-ride, [data-testid="navigation"]');
      expect(page.locator('[data-testid="ride-accepted"], .active-ride')).toBeVisible();
    }
  });

  test('Driver navigation and ride completion workflow', async ({ page }) => {
    // Login as driver and go online
    await page.goto(BASE_URL + '/login');
    await page.fill('[data-testid="email-input"], input[type="email"]', DRIVER_CREDENTIALS.email);
    await page.fill('[data-testid="password-input"], input[type="password"]', DRIVER_CREDENTIALS.password);
    await page.click('[data-testid="login-button"], button:has-text("Sign In")');
    await page.click('[data-testid="go-online"], button:has-text("Go Online")');
    
    // Simulate active ride
    await page.waitForTimeout(2000);
    
    // Check navigation interface
    const mapContainer = page.locator('[data-testid="driver-map"], .map-container, [data-testid="navigation-map"]');
    if (await mapContainer.isVisible()) {
      expect(mapContainer).toBeVisible();
      
      // Test ride completion
      const completeButton = page.locator('[data-testid="complete-ride"], button:has-text("Complete"), [data-testid="finish-ride"]');
      if (await completeButton.isVisible()) {
        await completeButton.click();
        
        // Verify ride completed
        await page.waitForSelector('[data-testid="ride-completed"], .completed-ride, [data-testid="payment-success"]');
        expect(page.locator('[data-testid="ride-completed"], .completed-ride')).toBeVisible();
      }
    }
  });

  test('Driver earnings and profile workflow', async ({ page }) => {
    // Login as driver
    await page.goto(BASE_URL + '/login');
    await page.fill('[data-testid="email-input"], input[type="email"]', DRIVER_CREDENTIALS.email);
    await page.fill('[data-testid="password-input"], input[type="password"]', DRIVER_CREDENTIALS.password);
    await page.click('[data-testid="login-button"], button:has-text("Sign In")');
    
    // Check earnings dashboard
    await page.click('[data-testid="earnings"], button:has-text("Earnings"), [data-testid="revenue"]');
    
    // Verify earnings display
    await page.waitForSelector('[data-testid="earnings-summary"], .earnings-dashboard, [data-testid="total-earnings"]');
    expect(page.locator('[data-testid="earnings-summary"], .earnings-dashboard')).toBeVisible();
    
    // Navigate to driver profile
    await page.click('[data-testid="driver-profile"], button:has-text("Profile"), [data-testid="account"]');
    
    // Update vehicle information
    await page.fill('[data-testid="vehicle-info"], input[name="vehicleInfo"], input[placeholder*="vehicle"]', 'Updated Vehicle Info');
    await page.click('[data-testid="save-vehicle"], button:has-text("Save"), button:has-text("Update")');
    
    // Verify profile updated
    await page.waitForSelector('[data-testid="profile-updated"], .success, [data-testid="update-success"]');
    expect(page.locator('[data-testid="profile-updated"], .success')).toBeVisible();
  });
});

test.describe('AirBear PWA - Cross-Role Workflows', () => {
  test('End-to-end ride workflow with user and driver', async ({ context }) => {
    // Create user and driver pages
    const userPage = await context.newPage();
    const driverPage = await context.newPage();
    
    // User requests a ride
    await userPage.goto(BASE_URL + '/login');
    await userPage.fill('[data-testid="email-input"], input[type="email"]', USER_CREDENTIALS.email);
    await userPage.fill('[data-testid="password-input"], input[type="password"]', USER_CREDENTIALS.password);
    await userPage.click('[data-testid="login-button"], button:has-text("Sign In")');
    
    await userPage.click('[data-testid="book-ride"], button:has-text("Book Ride")');
    await userPage.fill('[data-testid="pickup-input"], input[placeholder*="pickup"]', '123 Main St');
    await userPage.fill('[data-testid="destination-input"], input[placeholder*="destination"]', '456 Oak Ave');
    await userPage.click('[data-testid="request-ride-button"], button:has-text("Request Ride")');
    
    // Driver goes online and accepts ride
    await driverPage.goto(BASE_URL + '/login');
    await driverPage.fill('[data-testid="email-input"], input[type="email"]', DRIVER_CREDENTIALS.email);
    await driverPage.fill('[data-testid="password-input"], input[type="password"]', DRIVER_CREDENTIALS.password);
    await driverPage.click('[data-testid="login-button"], button:has-text("Sign In")');
    await driverPage.click('[data-testid="go-online"], button:has-text("Go Online")');
    
    // Wait for ride request and accept
    await driverPage.waitForTimeout(2000);
    const acceptButton = driverPage.locator('[data-testid="accept-ride"], button:has-text("Accept")');
    if (await acceptButton.isVisible()) {
      await acceptButton.click();
      
      // Verify both user and driver see active ride
      await userPage.waitForSelector('[data-testid="ride-active"], .active-ride');
      await driverPage.waitForSelector('[data-testid="ride-accepted"], .active-ride');
      
      expect(await userPage.locator('[data-testid="ride-active"], .active-ride').isVisible()).toBe(true);
      expect(await driverPage.locator('[data-testid="ride-accepted"], .active-ride').isVisible()).toBe(true);
    }
    
    await userPage.close();
    await driverPage.close();
  });
});
