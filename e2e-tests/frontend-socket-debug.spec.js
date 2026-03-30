import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://bodydoubleapp.com';

test.describe('Frontend Socket Event Flow Debug', () => {
  test('trace exact event flow when clicking Find a Partner', async ({ page }) => {
    console.log('\n=== Tracing Frontend Event Flow ===');

    const allEvents = [];

    // Set up console interception BEFORE navigation
    page.on('console', msg => {
      const text = msg.text();
      allEvents.push({ type: msg.type(), text, timestamp: Date.now() });

      // Log socket-related events
      if (text.includes('Socket') || text.includes('Demo') || text.includes('partner') ||
          text.includes('join') || text.includes('waiting') || text.includes('found')) {
        console.log(`[${msg.type()}]`, text);
      }
    });

    // Intercept fetch/XHR requests
    page.on('request', req => {
      const url = req.url();
      if (url.includes('socket.io') || url.includes('api/stats')) {
        console.log('[REQUEST]', req.method(), url);
      }
    });

    page.on('response', async res => {
      const url = res.url();
      if (url.includes('socket.io') || url.includes('api/stats')) {
        console.log('[RESPONSE]', res.status(), url);
        try {
          if (url.includes('api/stats')) {
            const body = await res.text();
            console.log('[RESPONSE BODY]', body);
          }
        } catch (e) {}
      }
    });

    // Navigate to page
    console.log('\n--- Navigating to page ---');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Wait for initial socket connection
    await page.waitForTimeout(5000);

    console.log('\n--- Initial page state ---');

    // Check page title and basic elements
    const title = await page.title();
    console.log('Page title:', title);

    // Check if Find a Partner button exists and is visible
    const button = page.locator('button:has-text("Find a Partner")');
    const buttonExists = await button.count();
    const buttonVisible = buttonExists > 0 ? await button.isVisible() : false;
    console.log('Find a Partner button - exists:', buttonExists, 'visible:', buttonVisible);

    // Inject JavaScript to directly inspect React state and socket
    const directState = await page.evaluate(() => {
      // Try to find socket in window
      const info = {
        windowKeys: Object.keys(window).filter(k => k.includes('socket') || k.includes('Socket') || k.includes('io')),
        reactRoot: !!document.querySelector('#root'),
        reactRootHTML: document.querySelector('#root')?.innerHTML.substring(0, 500)
      };
      return info;
    });

    console.log('Direct state check:', JSON.stringify(directState, null, 2));

    // Check stats
    const stats = await page.evaluate(async (baseUrl) => {
      try {
        const response = await fetch(`${baseUrl}/api/stats`);
        const data = await response.json();
        return { success: true, data };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }, BASE_URL);

    console.log('Server stats:', stats);

    // Now click Find a Partner
    console.log('\n--- Clicking Find a Partner button ---');
    await button.click();

    // Wait and watch for events
    await page.waitForTimeout(3000);

    // Check for UI changes
    const searchingText = await page.locator('text=Finding Your Partner').count();
    console.log('Searching text visible:', searchingText > 0);

    const partnerFoundText = await page.locator('text=Chat').count();
    console.log('Chat visible (partner found):', partnerFoundText > 0);

    // Take screenshot
    await page.screenshot({ path: 'test-results/frontend-debug.png', fullPage: true });

    // Get all console events
    console.log('\n--- All Console Events ---');
    allEvents.forEach((e, i) => {
      console.log(`${i}: [${e.type}] ${e.text}`);
    });

    // Check for errors
    const errors = allEvents.filter(e => e.type === 'error');
    console.log('\n--- Errors ---');
    errors.forEach(e => console.log('ERROR:', e.text));

    // Check for socket events specifically
    const socketEvents = allEvents.filter(e =>
      e.text.includes('Socket') || e.text.includes('Demo') ||
      e.text.includes('partner') || e.text.includes('join')
    );
    console.log('\n--- Socket Events ---');
    socketEvents.forEach(e => console.log(e.text));
  });

  test('measure page load performance', async ({ page }) => {
    console.log('\n=== Performance Audit ===');

    const metrics = [];

    // Track navigation start
    const navStart = Date.now();

    page.on('load', () => {
      metrics.push({ event: 'load', time: Date.now() - navStart });
    });

    page.on('domcontentloaded', () => {
      metrics.push({ event: 'DOMContentLoaded', time: Date.now() - navStart });
    });

    // Navigate
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const loadComplete = Date.now();
    metrics.push({ event: 'networkidle', time: loadComplete - navStart });

    // Get Web Vitals
    const vitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const perfData = performance.getEntriesByType('navigation')[0];
          resolve({
            domContentLoaded: perfData?.domContentLoadedEventEnd - perfData?.domContentLoadedEventStart,
            loadComplete: perfData?.loadEventEnd - perfData?.loadEventStart,
            domInteractive: perfData?.domInteractive - perfData?.domInteractive,
            totalLoadTime: perfData?.loadEventEnd - perfData?.fetchStart
          });
        }, 100);
      });
    });

    console.log('\n--- Performance Metrics ---');
    metrics.forEach(m => console.log(`${m.event}: ${m.time}ms`));
    console.log('\nWeb Vitals:', vitals);

    // Check for large resources
    const resources = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource');
      return entries
        .filter(e => e.transferSize > 100000) // > 100KB
        .map(e => ({
          name: e.name.substring(0, 100),
          size: Math.round(e.transferSize / 1024) + 'KB',
          duration: Math.round(e.duration) + 'ms'
        }))
        .sort((a, b) => b.size - a.size)
        .slice(0, 10);
    });

    console.log('\n--- Large Resources ---');
    resources.forEach(r => console.log(`${r.size} - ${r.name} (${r.duration})`));

    // Check for JavaScript errors
    const jsErrors = await page.evaluate(() => {
      return window.__errors || [];
    });

    if (jsErrors.length > 0) {
      console.log('\n--- JavaScript Errors ---');
      jsErrors.forEach(e => console.log(e));
    }
  });
});
