import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:5000';

test.describe('AirBear PWA - Lighthouse Performance Tests', () => {
  test.beforeAll(async () => {
    // Start the development server
    try {
      execSync('npm run dev', { stdio: 'pipe', cwd: process.cwd() });
    } catch (error) {
      console.log('Server might already be running');
    }
  });

  test('Lighthouse performance audit for homepage', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Wait for dynamic content

    // Run Lighthouse audit
    const lighthouseResult = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Import and run Lighthouse
        import('lighthouse').then((lighthouse) => {
          const chromeLauncher = require('chrome-launcher');
          
          chromeLauncher.launch({ chromeFlags: ['--headless'] }).then((chrome) => {
            const options = {
              logLevel: 'info',
              output: 'json',
              onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
              port: chrome.port,
            };

            lighthouse.default(BASE_URL, options).then((results) => {
              chrome.kill();
              resolve(results);
            });
          });
        });
      });
    });

    // Check performance scores
    expect(lighthouseResult.lhr.categories.performance.score).toBeGreaterThan(0.8);
    expect(lighthouseResult.lhr.categories.accessibility.score).toBeGreaterThan(0.9);
    expect(lighthouseResult.lhr.categories['best-practices'].score).toBeGreaterThan(0.9);
    expect(lighthouseResult.lhr.categories.seo.score).toBeGreaterThan(0.9);

    console.log('Performance Scores:', {
      performance: lighthouseResult.lhr.categories.performance.score * 100,
      accessibility: lighthouseResult.lhr.categories.accessibility.score * 100,
      bestPractices: lighthouseResult.lhr.categories['best-practices'].score * 100,
      seo: lighthouseResult.lhr.categories.seo.score * 100,
    });
  });

  test('Core Web Vitals validation', async ({ page }) => {
    const metrics = await page.goto(BASE_URL).then(() => {
      return page.evaluate(() => {
        return new Promise((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const vitals = {};
            
            entries.forEach((entry) => {
              if (entry.entryType === 'largest-contentful-paint') {
                vitals.lcp = entry.startTime;
              } else if (entry.entryType === 'first-input') {
                vitals.fid = entry.processingStart - entry.startTime;
              } else if (entry.entryType === 'layout-shift') {
                vitals.cls = (vitals.cls || 0) + entry.value;
              }
            });
            
            resolve(vitals);
          });
          
          observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });
          
          // Fallback timeout
          setTimeout(() => resolve({}), 5000);
        });
      });
    });

    // Validate Core Web Vitals thresholds
    if (metrics.lcp) expect(metrics.lcp).toBeLessThan(2500); // Good: <2.5s
    if (metrics.fid) expect(metrics.fid).toBeLessThan(100);  // Good: <100ms
    if (metrics.cls) expect(metrics.cls).toBeLessThan(0.1);  // Good: <0.1

    console.log('Core Web Vitals:', metrics);
  });

  test('PWA functionality validation', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Check for service worker
    const swRegistration = await page.evaluate(() => {
      return navigator.serviceWorker.ready.then(registration => !!registration.active);
    });
    expect(swRegistration).toBe(true);

    // Check for manifest
    const manifest = await page.evaluate(() => {
      const link = document.querySelector('link[rel="manifest"]');
      return link ? link.getAttribute('href') : null;
    });
    expect(manifest).toBeTruthy();

    // Check for responsive design
    const viewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? meta.getAttribute('content') : null;
    });
    expect(viewport).toContain('width=device-width');
  });
});
