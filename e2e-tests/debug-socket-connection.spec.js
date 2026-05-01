import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://bodydoubleapp.com';

test('DEBUG: Detailed socket connection monitoring', async ({ browser }) => {
  console.log('\n=== DEBUG: Monitoring Socket Connections ===');
  console.log('Testing URL:', BASE_URL);

  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  // Capture ALL socket events with timestamps
  const events1 = [];
  const events2 = [];

  const captureEvent = (page, events, prefix) => {
    page.on('console', msg => {
      const text = msg.text();
      events.push({
        prefix,
        timestamp: Date.now(),
        type: msg.type(),
        text,
        args: msg.args().map(a => a.toString())
      });
      console.log(`[${prefix}] [${msg.type()}] ${text}`);
    });

    page.on('pageerror', error => {
      console.log(`[${prefix}] PAGE ERROR:`, error);
      events.push({
        prefix,
        timestamp: Date.now(),
        type: 'pageerror',
        text: error.toString()
      });
    });
  };

  captureEvent(page1, events1, 'USER1');
  captureEvent(page2, events2, 'USER2');

  // Navigate both pages
  console.log('\n--- Navigating both pages ---');
  await Promise.all([
    page1.goto(BASE_URL, { waitUntil: 'domcontentloaded' }),
    page2.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  ]);

  // Wait for socket initialization
  await Promise.all([
    page1.waitForTimeout(5000),
    page2.waitForTimeout(5000)
  ]);

  // Check page content
  const content1 = await page1.content();
  const content2 = await page2.content();

  console.log('\n--- Page 1 Check ---');
  console.log('Has Find a Partner:', content1.includes('Find a Partner'));
  console.log('Has Chat:', content1.includes('Chat'));

  console.log('\n--- Page 2 Check ---');
  console.log('Has Find a Partner:', content2.includes('Find a Partner'));
  console.log('Has Chat:', content2.includes('Chat'));

  // Find buttons
  const button1 = page1.locator('button:has-text("Find a Partner")');
  const button2 = page2.locator('button:has-text("Find a Partner")');

  const button1Visible = await button1.isVisible();
  const button2Visible = await button2.isVisible();

  console.log('\n--- Button Visibility ---');
  console.log('User 1 button visible:', button1Visible);
  console.log('User 2 button visible:', button2Visible);

  // Inject socket monitoring
  const monitorSocket = async (page, userNum) => {
    return await page.evaluate(() => {
      const logs = [];
      const originalEmit = window.socket?.emit;
      if (window.socket) {
        window.socket.emit = function(event, ...args) {
          logs.push(`EMIT: ${event} ${JSON.stringify(args)}`);
          return originalEmit.call(this, event, ...args);
        };

        window.socket.on('waiting-for-partner', () => {
          logs.push('RECEIVED: waiting-for-partner');
        });
        window.socket.on('partner-found', (data) => {
          logs.push(`RECEIVED: partner-found ${JSON.stringify(data)}`);
        });
        window.socket.on('joined', (data) => {
          logs.push(`RECEIVED: joined ${JSON.stringify(data)}`);
        });
      }
      return logs;
    });
  };

  await monitorSocket(page1, 1);
  await monitorSocket(page2, 2);

  // Click User 1's button first
  console.log('\n--- User 1 clicking Find a Partner ---');
  await button1.click();
  await page1.waitForTimeout(2000);

  // Click User 2's button
  console.log('--- User 2 clicking Find a Partner ---');
  await button2.click();
  await page2.waitForTimeout(3000);

  // Check state after clicking
  const searching1 = await page1.locator('text=Finding Your Partner').count();
  const searching2 = await page2.locator('text=Finding Your Partner').count();

  const chat1 = await page1.locator('text=Chat').count();
  const chat2 = await page2.locator('text=Chat').count();

  console.log('\n--- State After Clicks ---');
  console.log('User 1 searching:', searching1 > 0);
  console.log('User 2 searching:', searching2 > 0);
  console.log('User 1 in chat:', chat1 > 0);
  console.log('User 2 in chat:', chat2 > 0);

  // Get socket logs
  const socketLogs1 = await page1.evaluate(() => window.__socketLogs || []);
  const socketLogs2 = await page2.evaluate(() => window.__socketLogs || []);

  console.log('\n--- Socket Logs User 1 ---');
  (socketLogs1 || []).forEach(log => console.log('  ', log));

  console.log('\n--- Socket Logs User 2 ---');
  (socketLogs2 || []).forEach(log => console.log('  ', log));

  // Take screenshots
  await page1.screenshot({ path: 'test-results/debug-user1-final.png', fullPage: true });
  await page2.screenshot({ path: 'test-results/debug-user2-final.png', fullPage: true });

  // Wait a bit more for potential matching
  await page1.waitForTimeout(5000);
  await page2.waitForTimeout(5000);

  // Final check
  const finalSearching1 = await page1.locator('text=Finding Your Partner').count();
  const finalSearching2 = await page2.locator('text=Finding Your Partner').count();
  const finalChat1 = await page1.locator('text=Chat').count();
  const finalChat2 = await page2.locator('text=Chat').count();

  console.log('\n--- FINAL STATE ---');
  console.log('User 1 searching:', finalSearching1 > 0);
  console.log('User 2 searching:', finalSearching2 > 0);
  console.log('User 1 in chat:', finalChat1 > 0);
  console.log('User 2 in chat:', finalChat2 > 0);

  // Check if connected to session
  const inSession = (finalChat1 > 0 && finalChat2 > 0) ||
                   (finalSearching1 === 0 && finalSearching2 === 0 && (finalChat1 > 0 || finalChat2 > 0));

  console.log('\n--- Test Result ---');
  console.log('Users connected:', inSession);

  await context1.close();
  await context2.close();

  expect(inSession).toBe(true);
});
