import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5000';

// PWA installability, SEO, and accessibility smoke checks.
// These replace the previous Lighthouse wrapper, which could never run:
// it called require() inside page.evaluate (browser context), depended on
// packages that are not in the repo, and blocked beforeAll on execSync('npm run dev').
test.describe('AirBear PWA - Lighthouse-style Quality Gates', () => {
  test('PWA manifest is valid and installable metadata present', async ({ page }) => {
    await page.goto(BASE_URL);

    const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestUrl).toBeTruthy();

    const manifest = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return res.json();
    }, manifestUrl as string);

    expect(manifest.name).toMatch(/airbear/i);
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toMatch(/standalone|minimal-ui|fullscreen/);
    expect(manifest.icons).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThan(0);
    // Maskable icon required for full installability
    expect(manifest.icons.some((icon: any) => (icon.purpose || '').includes('maskable'))).toBe(true);

    // Theme/browser colors for installed display
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /\S+/);
    await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="mobile-web-app-capable"]')).toHaveCount(1);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveCount(1);
  });

  test('Service worker registers for offline support', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const swState = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 10000)),
      ]);
      if (registration === 'timeout') return 'timeout';
      return (registration as ServiceWorkerRegistration).active ? 'active' : 'inactive';
    });

    expect(swState).toBe('active');
  });

  test('SEO metadata on the homepage', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page).toHaveTitle(/AirBear/i);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S+/);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:description"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"], meta[property="og:url"]')).not.toHaveCount(0);
  });

  test('Accessibility basics on main user flows', async ({ page }) => {
    // Homepage
    await page.goto(BASE_URL);
    await expect(page.locator('main, [role="main"]')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('nav').first()).toBeVisible();
    // All images must carry alternative text
    const imagesWithoutAlt = await page.locator('img:not([alt])').count();
    expect(imagesWithoutAlt).toBe(0);

    // Map/booking page keeps landmarks and heading order
    await page.goto(`${BASE_URL}/map`);
    await expect(page.locator('main, [role="main"]')).toHaveCount(1);
    const mapImagesWithoutAlt = await page.locator('img:not([alt])').count();
    expect(mapImagesWithoutAlt).toBe(0);

    // Auth form inputs are labeled
    await page.goto(`${BASE_URL}/auth`);
    const emailInput = page.getByTestId('input-email');
    await expect(emailInput).toHaveAttribute('id', /\S+/);
    const emailId = await emailInput.getAttribute('id');
    await expect(page.locator(`label[for="${emailId}"]`)).toHaveCount(1);
  });

  test('Mobile viewport configured for PWA flows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL);
    const viewport = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '');
    expect(viewport).toContain('width=device-width');
    // Header stays usable on a phone-sized viewport
    await expect(page.getByTestId('button-mobile-menu')).toBeVisible();
  });
});
