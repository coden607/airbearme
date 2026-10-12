import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const BASE_URL = 'http://localhost:5000';

// Unique credentials per test so reruns against a warm server never collide
let credSeq = 0;
function freshCredentials(role: 'user' | 'driver') {
  const suffix = `${Date.now().toString(36)}-${++credSeq}`;
  const prefix = role === 'driver' ? 'wfdriver' : 'wfuser';
  return {
    email: `${prefix}-${suffix}@airbear.com`,
    password: role === 'driver' ? 'TestDriver123!' : 'TestUser123!',
    username: `${prefix}${suffix.replace(/-/g, '')}`,
  };
}

async function registerViaApi(request: APIRequestContext, creds: ReturnType<typeof freshCredentials>, role: 'user' | 'driver') {
  const response = await request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      email: creds.email,
      username: creds.username,
      password: creds.password,
      confirmPassword: creds.password,
      role,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

// After a successful login the app hard-navigates via location.href: users to
// /map, drivers to /driver-dashboard. The auth page also wouter-navigates to
// the same target, so two navigations fire; wait for the landing URL, let the
// full load settle, and prove the session stuck before handing the page back.
async function loginViaUi(page: Page, creds: ReturnType<typeof freshCredentials>, role: 'user' | 'driver' = 'user') {
  await page.goto(`${BASE_URL}/auth`);
  await page.getByTestId('tab-signin').click();
  await page.getByTestId('card-signin').getByTestId('input-email').fill(creds.email);
  await page.getByTestId('card-signin').getByTestId('input-password').fill(creds.password);
  await page.getByTestId('card-signin').getByTestId('button-submit').click();
  const landing = role === 'driver' ? /\/driver-dashboard/ : /\/map/;
  await page.waitForURL(landing, { timeout: 15000 });
  await page.waitForLoadState('load');
  await expect(page.getByTestId('button-user-menu')).toBeVisible({ timeout: 15000 });
}

async function logoutViaUi(page: Page) {
  await page.getByTestId('button-user-menu').click();
  await page.getByTestId('menu-logout').click();
}

// Select two distinct spots on the map page and confirm the booking.
// Returns the ride id from the checkout redirect.
async function bookRideViaMap(page: Page) {
  await page.goto(`${BASE_URL}/map`);
  // Spot cards render in a grid below the map; select pickup then destination.
  const cards = page.locator('[data-testid^="card-spot-"]');
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(2);
  await cards.nth(0).scrollIntoViewIfNeeded();
  await cards.nth(0).click();
  await cards.nth(1).click();
  await page.getByTestId('button-book-ride').click();
  await page.waitForURL(/\/checkout\?rideId=.*/, { timeout: 15000 });
  const url = new URL(page.url());
  return url.searchParams.get('rideId');
}

test.describe('AirBear PWA - User Workflow E2E Tests', () => {
  test('User registration and login workflow', async ({ page }) => {
    const creds = freshCredentials('user');
    await page.goto(`${BASE_URL}/auth`);
    await expect(page.getByTestId('tab-signin')).toBeVisible();

    // Register through the UI
    await page.getByTestId('tab-signup').click();
    const signup = page.getByTestId('card-signup');
    await signup.getByTestId('input-username').fill(creds.username);
    await signup.getByTestId('input-email').fill(creds.email);
    await signup.getByTestId('input-password').fill(creds.password);
    await signup.getByTestId('input-confirm-password').fill(creds.password);
    await signup.getByTestId('button-submit').click();

    // Successful registration signs the user in and lands on the map
    await page.waitForURL(/\/map/, { timeout: 15000 });
    await expect(page.getByTestId('button-user-menu')).toBeVisible();

    // Logout and log back in
    await logoutViaUi(page);
    await expect(page.getByTestId('button-user-menu')).toBeHidden();
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
    await loginViaUi(page, creds);
    await expect(page.getByTestId('button-user-menu')).toBeVisible();
  });

  test('User ride booking workflow with cash payment', async ({ page, request }) => {
    const creds = freshCredentials('user');
    await registerViaApi(request, creds, 'user');
    await loginViaUi(page, creds);

    const rideId = await bookRideViaMap(page);
    expect(rideId).toBeTruthy();

    // Complete the booking with cash payment
    await page.getByTestId('tab-cash-payment').click();
    await page.getByTestId('button-confirm-cash-payment').click();

    // Successful payment returns to the map with the active ride
    await page.waitForURL(/\/map\?rideId=.*/, { timeout: 15000 });
    expect(page.url()).toContain(rideId);
  });

  test('User promise-to-pay workflow', async ({ page, request }) => {
    const creds = freshCredentials('user');
    await registerViaApi(request, creds, 'user');
    await loginViaUi(page, creds);

    const rideId = await bookRideViaMap(page);
    expect(rideId).toBeTruthy();

    await page.getByTestId('tab-promise-payment').click();
    await page.getByTestId('button-confirm-promise-payment').click();

    await page.waitForURL(/\/map\?rideId=.*/, { timeout: 15000 });
    expect(page.url()).toContain(rideId);
  });

  test('User dashboard and logout workflow', async ({ page, request }) => {
    const creds = freshCredentials('user');
    await registerViaApi(request, creds, 'user');
    await loginViaUi(page, creds);

    // The dashboard shows the user's eco snapshot
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.getByTestId('card-eco-points')).toBeVisible();
    await expect(page.getByTestId('card-recent-activity')).toBeVisible();

    // Logout returns to the signed-out site state
    await logoutViaUi(page);
    await expect(page.getByTestId('button-user-menu')).toBeHidden();
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });
});

test.describe('AirBear PWA - Driver Workflow E2E Tests', () => {
  test('Driver registration and login workflow', async ({ page }) => {
    const creds = freshCredentials('driver');
    await page.goto(`${BASE_URL}/auth`);
    await page.getByTestId('tab-signup').click();
    const signup = page.getByTestId('card-signup');
    await signup.getByTestId('input-username').fill(creds.username);
    await signup.getByTestId('input-email').fill(creds.email);
    await signup.getByTestId('input-password').fill(creds.password);
    await signup.getByTestId('input-confirm-password').fill(creds.password);
    await signup.getByTestId('select-role').selectOption('driver');
    await signup.getByTestId('button-submit').click();

    // Drivers land on the driver dashboard
    await page.waitForURL(/\/driver-dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /driver dashboard/i })).toBeVisible();
  });

  test('Driver claims a vehicle and sees telemetry', async ({ page, request }) => {
    const creds = freshCredentials('driver');
    await registerViaApi(request, creds, 'driver');
    await loginViaUi(page, creds, 'driver');

    const claim = page.getByTestId('button-claim-vehicle');
    await expect(claim).toBeVisible();
    await claim.click();

    // After claiming, the claim CTA is replaced by the vehicle card
    await expect(page.getByTestId('button-claim-vehicle')).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText('Vehicle ID')).toBeVisible();
  });

  test('Drivers cannot book passenger rides', async ({ page, request }) => {
    const creds = freshCredentials('driver');
    await registerViaApi(request, creds, 'driver');
    await loginViaUi(page, creds, 'driver');

    await page.goto(`${BASE_URL}/map`);
    const cards = page.locator('[data-testid^="card-spot-"]');
    await cards.nth(0).scrollIntoViewIfNeeded();
    await cards.nth(0).click();
    await cards.nth(1).click();

    // The booking CTA is disabled for driver accounts
    const bookButton = page.getByTestId('button-book-ride');
    await expect(bookButton).toBeVisible();
    await expect(bookButton).toBeDisabled();
    await expect(bookButton).toHaveText(/use driver dashboard/i);
  });

  test('Driver dashboard bounces passenger accounts', async ({ page, request }) => {
    const creds = freshCredentials('user');
    await registerViaApi(request, creds, 'user');
    await loginViaUi(page, creds);

    // RoleRoute redirects non-drivers away from the driver dashboard
    await page.goto(`${BASE_URL}/driver-dashboard`);
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  });
});

test.describe('AirBear PWA - Cross-Role Workflow', () => {
  test('Driver claims vehicle while user books a ride', async ({ browser, request }) => {
    // Two live sessions on a memory-tight CI box need a large budget; smaller
    // viewports keep Chromium rasterization cheap. Separate browser contexts
    // keep the two sessions' localStorage isolated.
    test.setTimeout(300000);
    const driverContext = await browser.newContext();
    const userContext = await browser.newContext();
    const driverPage = await driverContext.newPage();
    const userPage = await userContext.newPage();
    await driverPage.setViewportSize({ width: 900, height: 600 });
    await userPage.setViewportSize({ width: 900, height: 600 });
    const driverCreds = freshCredentials('driver');
    const userCreds = freshCredentials('user');
    await registerViaApi(request, driverCreds, 'driver');
    await registerViaApi(request, userCreds, 'user');

    // Driver claims an AirBear
    await loginViaUi(driverPage, driverCreds, 'driver');
    await driverPage.getByTestId('button-claim-vehicle').click();
    await expect(driverPage.getByTestId('button-claim-vehicle')).toHaveCount(0, { timeout: 15000 });
    await expect(driverPage.getByText('Vehicle ID')).toBeVisible();

    // Meanwhile a user books a ride on the fleet
    await loginViaUi(userPage, userCreds);
    const rideId = await bookRideViaMap(userPage);
    expect(rideId).toBeTruthy();
    await expect(userPage).toHaveURL(/\/checkout\?rideId=.*/);

    await driverPage.close();
    await userPage.close();
    await driverContext.close();
    await userContext.close();
  });
});
