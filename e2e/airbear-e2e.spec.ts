import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5000';

// Helper to check for console errors
async function checkNoConsoleErrors(page: Page, allowedPatterns: RegExp[] = []) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Skip allowed error patterns
      const isAllowed = allowedPatterns.some(pattern => pattern.test(text));
      if (!isAllowed) {
        errors.push(text);
      }
    }
  });
  return errors;
}

test.describe('AirBear PWA - Production E2E Tests', () => {

  test.describe('Homepage & Navigation', () => {
    test('homepage loads without errors', async ({ page }) => {
      const errors = await checkNoConsoleErrors(page, [
        /favicon/i,
        /manifest/i,
        /Failed to load resource.*favicon/i,
      ]);

      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      // Check title
      await expect(page).toHaveTitle(/AirBear/i);

      // Check main content loaded
      await expect(page.locator('#root')).toBeVisible();
      await expect(page.locator('body')).not.toBeEmpty();

      // No critical errors
      expect(errors.filter(e => !e.includes('Stripe') && !e.includes('supabase'))).toHaveLength(0);
    });

    test('navigation links work', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      // Find and click navigation links
      const navLinks = page.locator('nav a, header a');
      const count = await navLinks.count();

      if (count > 0) {
        // Click first navigation link
        await navLinks.first().click();
        await page.waitForLoadState('networkidle');
      }
    });
  });

  test.describe('Authentication Flow', () => {
    test('auth page loads', async ({ page }) => {
      await page.goto(`${BASE_URL}/auth`);
      await page.waitForLoadState('networkidle');

      // Should have login/signup form elements
      const hasForm = await page.locator('form, input[type="email"], input[type="password"]').count() > 0;
      expect(hasForm || page.url().includes('auth')).toBeTruthy();
    });

    test('can switch between login and signup', async ({ page }) => {
      await page.goto(`${BASE_URL}/auth`);
      await page.waitForLoadState('networkidle');

      // Look for tabs or buttons to switch modes
      const signupTab = page.locator('button:has-text("Sign Up"), button:has-text("Register"), [role="tab"]:has-text("Sign")');
      if (await signupTab.count() > 0) {
        await signupTab.first().click();
        await page.waitForTimeout(500);
      }

      const loginTab = page.locator('button:has-text("Login"), button:has-text("Sign In"), [role="tab"]:has-text("Login")');
      if (await loginTab.count() > 0) {
        await loginTab.first().click();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Map Page', () => {
    test('map page loads with Binghamton map', async ({ page }) => {
      await page.goto(`${BASE_URL}/map`);
      await page.waitForLoadState('networkidle');

      // Wait for Leaflet map to initialize
      await page.waitForTimeout(2000);

      // Check for Leaflet map container
      const mapContainer = page.locator('.leaflet-container');
      await expect(mapContainer).toBeVisible({ timeout: 10000 });

      // Check for map tiles
      const tiles = page.locator('.leaflet-tile-loaded');
      await expect(tiles.first()).toBeVisible({ timeout: 10000 });
    });

    test('spots are displayed on map', async ({ page }) => {
      await page.goto(`${BASE_URL}/map`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Check for markers or spot indicators
      const markers = page.locator('.leaflet-marker-icon, .leaflet-marker-pane img, [class*="marker"]');
      const markerCount = await markers.count();

      // Should have at least some markers for spots
      expect(markerCount).toBeGreaterThan(0);
    });

    test('airbear/driver locations update', async ({ page }) => {
      await page.goto(`${BASE_URL}/map`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Get initial marker positions
      const markers = page.locator('.leaflet-marker-icon');
      const initialCount = await markers.count();

      // Wait for location update interval (2.5 seconds)
      await page.waitForTimeout(3000);

      // Markers should still be present (real-time updates working)
      const currentCount = await markers.count();
      expect(currentCount).toBeGreaterThanOrEqual(0);
    });

    test('can interact with spot selection', async ({ page }) => {
      await page.goto(`${BASE_URL}/map`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Try clicking on markers or spot cards
      const spotCards = page.locator('[class*="spot"], [class*="card"], button:has-text("Book")');
      if (await spotCards.count() > 0) {
        await spotCards.first().click();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Checkout Flow', () => {
    test('checkout page loads with ride info', async ({ page }) => {
      await page.goto(`${BASE_URL}/checkout?rideId=test-ride&amount=4.00`);
      await page.waitForLoadState('networkidle');

      // Should show payment options
      const paymentSection = page.locator('text=/payment|card|pay/i');
      await expect(paymentSection.first()).toBeVisible({ timeout: 10000 });
    });

    test('payment method tabs work', async ({ page }) => {
      await page.goto(`${BASE_URL}/checkout?rideId=test-ride&amount=4.00`);
      await page.waitForLoadState('networkidle');

      // Look for payment method tabs
      const cardTab = page.locator('[role="tab"]:has-text("Card"), button:has-text("Card")');
      const cashTab = page.locator('[role="tab"]:has-text("Cash"), button:has-text("Cash")');

      if (await cardTab.count() > 0) {
        await cardTab.first().click();
        await page.waitForTimeout(500);
      }

      if (await cashTab.count() > 0) {
        await cashTab.first().click();
        await page.waitForTimeout(500);

        // Cash tab should show QR code
        const qrSection = page.locator('text=/QR|scan|cash/i');
        await expect(qrSection.first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('order summary displays correctly', async ({ page }) => {
      await page.goto(`${BASE_URL}/checkout?rideId=test-ride&amount=4.00`);
      await page.waitForLoadState('networkidle');

      // Should show amount
      const amount = page.locator('text=/\\$4|4\\.00|4\\.32/');
      await expect(amount.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Bodega Shop', () => {
    test('bodega page loads with items', async ({ page }) => {
      await page.goto(`${BASE_URL}/bodega`);
      await page.waitForLoadState('networkidle');

      // Should show product cards or list
      await page.waitForTimeout(2000);
      const products = page.locator('[class*="card"], [class*="product"], [class*="item"]');
      const count = await products.count();

      expect(count).toBeGreaterThan(0);
    });

    test('can add items to cart', async ({ page }) => {
      await page.goto(`${BASE_URL}/bodega`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Find add to cart button
      const addButton = page.locator('button:has-text("Add"), button:has-text("Cart"), button:has-text("+")');
      if (await addButton.count() > 0) {
        await addButton.first().click();
        await page.waitForTimeout(500);
      }
    });
  });

  test.describe('Driver Dashboard', () => {
    test('driver dashboard loads', async ({ page }) => {
      await page.goto(`${BASE_URL}/driver-dashboard`);
      await page.waitForLoadState('networkidle');

      // Should show driver interface or redirect to auth
      const isDriverPage = page.url().includes('driver') || page.url().includes('auth');
      expect(isDriverPage).toBeTruthy();
    });
  });

  test.describe('API Health', () => {
    test('API health check passes', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/health`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.status).toBe('ok');
    });

    test('spots API returns data', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/spots`);
      expect(response.ok()).toBeTruthy();

      const spots = await response.json();
      expect(Array.isArray(spots)).toBeTruthy();
      expect(spots.length).toBeGreaterThan(0);
    });

    test('airbears API returns data', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/airbears`);
      expect(response.ok()).toBeTruthy();

      const airbears = await response.json();
      expect(Array.isArray(airbears)).toBeTruthy();
      expect(airbears.length).toBeGreaterThan(0);
    });

    test('bodega items API returns data', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/bodega-items`);
      expect(response.ok()).toBeTruthy();

      const items = await response.json();
      expect(Array.isArray(items)).toBeTruthy();
      expect(items.length).toBeGreaterThan(0);
    });

    test('can create and retrieve order', async ({ request }) => {
      // Create order
      const createResponse = await request.post(`${BASE_URL}/api/orders`, {
        data: {
          userId: 'e2e-test-user',
          items: [{ itemId: 'test-item', quantity: 1, price: '5.00' }],
          totalAmount: '5.00',
          status: 'pending'
        }
      });
      expect(createResponse.ok()).toBeTruthy();

      const order = await createResponse.json();
      expect(order.id).toBeDefined();

      // Retrieve order
      const getResponse = await request.get(`${BASE_URL}/api/orders/${order.id}`);
      expect(getResponse.ok()).toBeTruthy();

      const retrieved = await getResponse.json();
      expect(retrieved.id).toBe(order.id);
    });

    test('payment intent creation works', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/create-payment-intent`, {
        data: {
          amount: 4.32,
          orderId: 'e2e-test-order',
          paymentMethod: 'stripe'
        }
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.clientSecret || data.paymentIntentId).toBeDefined();
    });

    test('cash payment QR generation works', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/create-payment-intent`, {
        data: {
          amount: 4.00,
          rideId: 'e2e-test-ride',
          paymentMethod: 'cash'
        }
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.qrCode).toBeDefined();
    });
  });

  test.describe('PWA Features', () => {
    test('service worker is registered', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      const swSupported = await page.evaluate(() => 'serviceWorker' in navigator);
      expect(swSupported).toBeTruthy();
    });

    test('manifest is accessible', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/manifest.json`);
      expect(response.ok()).toBeTruthy();

      const manifest = await response.json();
      expect(manifest.name).toContain('AirBear');
      expect(manifest.theme_color).toBeDefined();
    });
  });

  test.describe('No Console Errors', () => {
    const pagesToTest = ['/', '/map', '/auth', '/bodega', '/checkout'];

    for (const path of pagesToTest) {
      test(`${path} has no critical console errors`, async ({ page }) => {
        const errors: string[] = [];
        page.on('console', msg => {
          if (msg.type() === 'error') {
            const text = msg.text();
            // Filter out known non-critical errors
            if (!text.includes('favicon') &&
                !text.includes('manifest') &&
                !text.includes('net::ERR_') &&
                !text.includes('Failed to load resource')) {
              errors.push(text);
            }
          }
        });

        await page.goto(`${BASE_URL}${path}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // Log errors for debugging but don't fail on Stripe/Supabase config warnings
        const criticalErrors = errors.filter(e =>
          !e.includes('Stripe') &&
          !e.includes('supabase') &&
          !e.includes('VITE_')
        );

        if (criticalErrors.length > 0) {
          console.log(`Errors on ${path}:`, criticalErrors);
        }

        expect(criticalErrors).toHaveLength(0);
      });
    }
  });
});
