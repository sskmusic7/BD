import { test, expect } from '@playwright/test';

// Test the deployed version
const BASE_URL = process.env.BASE_URL || 'https://bodydoubleapp.com';

test.describe('Multi-User Connection Audit', () => {
  test('should connect two users together via Find a Partner', async ({ browser }) => {
    console.log('\n=== Starting Multi-User Connection Audit ===');
    console.log('Testing URL:', BASE_URL);

    // Create two separate browser contexts (simulating two different users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Collect logs from both pages
    const logs1 = [];
    const logs2 = [];
    const errors1 = [];
    const errors2 = [];
    const socketEvents1 = [];
    const socketEvents2 = [];

    page1.on('console', msg => {
      const text = msg.text();
      logs1.push(text);
      if (msg.type() === 'error') errors1.push(text);
      if (text.includes('Demo mode') || text.includes('Socket') || text.includes('partner') || text.includes('joined')) {
        socketEvents1.push(text);
      }
    });

    page2.on('console', msg => {
      const text = msg.text();
      logs2.push(text);
      if (msg.type() === 'error') errors2.push(text);
      if (text.includes('Demo mode') || text.includes('Socket') || text.includes('partner') || text.includes('joined')) {
        socketEvents2.push(text);
      }
    });

    // Track network requests
    const requests1 = [];
    const requests2 = [];

    page1.on('request', req => {
      if (req.url().includes('socket.io') || req.url().includes('api')) {
        requests1.push({ url: req.url(), method: req.method() });
      }
    });

    page2.on('request', req => {
      if (req.url().includes('socket.io') || req.url().includes('api')) {
        requests2.push({ url: req.url(), method: req.method() });
      }
    });

    console.log('\n--- Navigating User 1 ---');
    await page1.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page1.waitForTimeout(3000);

    console.log('\n--- Navigating User 2 ---');
    await page2.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(3000);

    console.log('\n--- User 1 Socket Events ---');
    console.log('Socket events:', socketEvents1);
    console.log('Socket requests made:', requests1.length);
    if (requests1.length > 0) {
      console.log('First socket request:', requests1[0].url);
    }

    console.log('\n--- User 2 Socket Events ---');
    console.log('Socket events:', socketEvents2);
    console.log('Socket requests made:', requests2.length);
    if (requests2.length > 0) {
      console.log('First socket request:', requests2[0].url);
    }

    // Check for errors
    console.log('\n--- Errors ---');
    console.log('User 1 errors:', errors1);
    console.log('User 2 errors:', errors2);

    // Verify the page loaded correctly
    const title1 = await page1.title();
    const title2 = await page2.title();
    console.log('\n--- Page Titles ---');
    console.log('User 1 page title:', title1);
    console.log('User 2 page title:', title2);

    // Check if "Find a Partner" button exists on both pages
    const findPartnerButton1 = page1.locator('button:has-text("Find a Partner")');
    const findPartnerButton2 = page2.locator('button:has-text("Find a Partner")');

    const button1Exists = await findPartnerButton1.count();
    const button2Exists = await findPartnerButton2.count();

    console.log('\n--- Find a Partner Buttons ---');
    console.log('User 1 button exists:', button1Exists > 0);
    console.log('User 2 button exists:', button2Exists > 0);

    if (button1Exists === 0 || button2Exists === 0) {
      console.log('ERROR: Find a Partner button not found!');
      await page1.screenshot({ path: 'test-results/user1-page.png' });
      await page2.screenshot({ path: 'test-results/user2-page.png' });
      throw new Error('Find a Partner button not found');
    }

    // Check socket connection status from browser
    const socketStatus1 = await page1.evaluate(() => {
      return window.__socketConnected || false;
    });
    const socketStatus2 = await page2.evaluate(() => {
      return window.__socketConnected || false;
    });

    console.log('\n--- Socket Connection Status ---');
    console.log('User 1 socket connected:', socketStatus1);
    console.log('User 2 socket connected:', socketStatus2);

    // Now click "Find a Partner" on both pages
    console.log('\n--- User 1 clicking Find a Partner ---');
    await findPartnerButton1.click();
    await page1.waitForTimeout(2000);

    console.log('\n--- User 2 clicking Find a Partner ---');
    await findPartnerButton2.click();
    await page2.waitForTimeout(5000); // Wait for matching to happen

    // Collect new socket events after clicking
    const newSocketEvents1 = [];
    const newSocketEvents2 = [];

    page1.on('console', msg => {
      const text = msg.text();
      if (text.includes('Demo mode') || text.includes('partner') || text.includes('session')) {
        newSocketEvents1.push(text);
      }
    });

    page2.on('console', msg => {
      const text = msg.text();
      if (text.includes('Demo mode') || text.includes('partner') || text.includes('session')) {
        newSocketEvents2.push(text);
      }
    });

    await page1.waitForTimeout(3000);
    await page2.waitForTimeout(3000);

    console.log('\n--- After Clicking Find a Partner ---');
    console.log('User 1 new events:', newSocketEvents1);
    console.log('User 2 new events:', newSocketEvents2);

    // Check if either user sees "Finding Your Partner..." text
    const searchingText1 = await page1.locator('text=Finding Your Partner').count();
    const searchingText2 = await page2.locator('text=Finding Your Partner').count();

    console.log('\n--- Searching State ---');
    console.log('User 1 shows searching:', searchingText1 > 0);
    console.log('User 2 shows searching:', searchingText2 > 0);

    // Check if SessionPage appeared (means they connected)
    const sessionPage1 = await page1.locator('text=Chat').count();
    const sessionPage2 = await page2.locator('text=Chat').count();

    console.log('\n--- Session Connection Results ---');
    console.log('User 1 session page visible:', sessionPage1 > 0);
    console.log('User 2 session page visible:', sessionPage2 > 0);

    // Take screenshots
    await page1.screenshot({ path: 'test-results/user1-final.png', fullPage: true });
    await page2.screenshot({ path: 'test-results/user2-final.png', fullPage: true });

    // Get final page content
    const content1 = await page1.content();
    const content2 = await page2.content();

    console.log('\n--- Final Page Analysis ---');
    console.log('User 1 page contains "Chat":', content1.includes('Chat'));
    console.log('User 1 page contains "Session":', content1.includes('Session'));
    console.log('User 2 page contains "Chat":', content2.includes('Chat'));
    console.log('User 2 page contains "Session":', content2.includes('Session'));

    // Check stats API
    console.log('\n--- Checking Server Stats ---');
    try {
      const statsResponse = await page1.evaluate(async (url) => {
        const response = await fetch(`${url}/api/stats`);
        return await response.json();
      }, BASE_URL);
      console.log('Server stats:', statsResponse);
    } catch (e) {
      console.log('Error fetching stats:', e.message);
    }

    // Close contexts
    await context1.close();
    await context2.close();

    console.log('\n=== Audit Complete ===\n');

    // Test assertions
    expect(button1Exists).toBeGreaterThan(0);
    expect(button2Exists).toBeGreaterThan(0);

    // At least one user should show searching state
    expect(searchingText1 + searchingText2).toBeGreaterThan(0);
  });

  test('debug socket connection in detail', async ({ page }) => {
    const allLogs = [];
    const socketLogs = [];

    page.on('console', msg => {
      const text = msg.text();
      allLogs.push({ type: msg.type(), text });
      if (text.includes('Socket') || text.includes('Demo') || text.includes('join') || text.includes('partner')) {
        socketLogs.push(text);
      }
    });

    const networkEvents = [];
    page.on('request', req => {
      networkEvents.push({ type: 'request', url: req.url(), method: req.method() });
    });
    page.on('response', res => {
      networkEvents.push({ type: 'response', url: res.url(), status: res.status() });
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Wait for socket initialization
    await page.waitForTimeout(5000);

    // Inject code to check socket status
    const socketInfo = await page.evaluate(() => {
      // Look for socket.io in the window
      const info = {
        hasIO: typeof window.io !== 'undefined',
        hasSocket: false,
        socketConnected: false,
        socketId: null
      };

      // Try to find socket in React internals
      const reactRoot = document.querySelector('#root');
      if (reactRoot && reactRoot._reactRootContainer) {
        info.hasReactRoot = true;
      }

      return info;
    });

    console.log('\n--- Socket Debug Info ---');
    console.log('Socket info:', socketInfo);
    console.log('Socket-related logs:', socketLogs);
    console.log('All errors:', allLogs.filter(l => l.type === 'error'));

    const socketRequests = networkEvents.filter(e =>
      e.url && e.url.includes('socket.io')
    );

    console.log('\n--- Socket Network Events ---');
    console.log('Socket requests:', socketRequests.length);
    if (socketRequests.length > 0) {
      console.log('First 5 socket events:', socketRequests.slice(0, 5));
    }

    // Check if button is clickable
    const button = page.locator('button:has-text("Find a Partner")');
    const buttonExists = await button.count();
    const buttonVisible = buttonExists > 0 ? await button.isVisible() : false;

    console.log('\n--- Button Status ---');
    console.log('Button exists:', buttonExists);
    console.log('Button visible:', buttonVisible);

    if (buttonVisible) {
      console.log('Clicking Find a Partner button...');
      await button.click();
      await page.waitForTimeout(5000);

      const searchingText = await page.locator('text=Finding Your Partner').count();
      console.log('Searching state active:', searchingText > 0);

      // Take screenshot
      await page.screenshot({ path: 'test-results/debug-after-click.png', fullPage: true });
    }

    await page.screenshot({ path: 'test-results/debug-final.png', fullPage: true });
  });
});
