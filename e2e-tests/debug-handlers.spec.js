import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://bodydoubleapp.com';

test('debug event handler setup', async ({ page }) => {
  console.log('\n=== Debug Event Handler Setup ===');

  const allEvents = [];

  page.on('console', msg => {
    allEvents.push({ type: msg.type(), text: msg.text() });
    console.log(`[${msg.type()}] ${msg.text()}`);
  });

  // Navigate and wait for socket connection
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);

  // Check if page is ready
  const ready = await page.evaluate(() => {
    return document.body.innerText.includes('Find a Partner');
  });
  console.log('Page ready:', ready);

  // Inject code to check if socket event handlers are set up
  const handlerCheck = await page.evaluate(() => {
    return new Promise((resolve) => {
      // Try to access React internals to check socket state
      const root = document.querySelector('#root');
      if (!root) {
        resolve({ error: 'No root element' });
        return;
      }

      // Check if we can find the socket in window
      const result = {
        hasIo: typeof window.io !== 'undefined',
        rootExists: !!root,
        innerHTML: root.innerHTML.substring(0, 500)
      };

      resolve(result);
    });
  });

  console.log('Handler check:', handlerCheck);

  // Click Find a Partner
  const button = page.locator('button:has-text("Find a Partner")');
  await button.click();
  await page.waitForTimeout(5000);

  // Check if searching state changed
  const searching = await page.locator('text=Finding Your Partner').count();
  console.log('Searching state:', searching > 0);

  // Get final events
  console.log('\n=== Final Events ===');
  allEvents.forEach((e, i) => {
    console.log(`${i}: [${e.type}] ${e.text}`);
  });

  // Try to directly check if 'waiting-for-partner' was received
  const directCheck = await page.evaluate(() => {
    return new Promise((resolve) => {
      let receivedWaiting = false;
      let receivedPartnerFound = false;

      // Set up a temporary listener
      const checkInterval = setInterval(() => {
        const bodyText = document.body.innerText;
        if (bodyText.includes('Finding Your Partner')) {
          receivedWaiting = true;
        }
        if (bodyText.includes('Chat') || bodyText.includes('Session')) {
          receivedPartnerFound = true;
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve({ receivedWaiting, receivedPartnerFound });
      }, 2000);
    });
  });

  console.log('Direct check:', directCheck);
});
