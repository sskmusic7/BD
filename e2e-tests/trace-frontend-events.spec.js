import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://bodydoubleapp.com';

test('trace frontend socket event flow', async ({ browser }) => {
  console.log('\n=== Tracing Frontend Socket Event Flow ===');

  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  // Collect all events from both pages
  const events1 = [];
  const events2 = [];

  page1.on('console', msg => {
    if (msg.type() === 'log') {
      events1.push(msg.text());
      console.log('[Page 1]', msg.text());
    }
  });

  page2.on('console', msg => {
    if (msg.type() === 'log') {
      events2.push(msg.text());
      console.log('[Page 2]', msg.text());
    }
  });

  // Navigate both pages
  console.log('\nNavigating both pages...');
  await Promise.all([
    page1.goto(BASE_URL),
    page2.goto(BASE_URL)
  ]);

  // Wait for both pages to fully load (socket ready)
  console.log('Waiting for socket readiness...');
  await page1.waitForTimeout(3000);
  await page2.waitForTimeout(3000);

  // Check if both pages show "Find a Partner" button
  const button1 = page1.locator('button:has-text("Find a Partner")');
  const button2 = page2.locator('button:has-text("Find a Partner")');

  const button1Visible = await button1.isVisible();
  const button2Visible = await button2.isVisible();

  console.log('\nButton 1 visible:', button1Visible);
  console.log('Button 2 visible:', button2Visible);

  if (!button1Visible || !button2Visible) {
    console.error('ERROR: One or both buttons not visible!');
    return;
  }

  // Click both buttons with a small delay
  console.log('\nClicking Find a Partner on Page 1...');
  await button1.click();
  await page1.waitForTimeout(2000);

  console.log('Clicking Find a Partner on Page 2...');
  await button2.click();
  await page2.waitForTimeout(2000);

  // Wait for match
  console.log('\nWaiting for match...');
  await page1.waitForTimeout(5000);
  await page2.waitForTimeout(5000);

  // Analyze events
  console.log('\n=== Event Analysis ===');

  const user1HasWaiting = events1.some(e => e.includes('Waiting for partner'));
  const user1HasPartner = events1.some(e => e.includes('Partner found'));
  const user2HasWaiting = events2.some(e => e.includes('Waiting for partner'));
  const user2HasPartner = events2.some(e => e.includes('Partner found'));

  console.log('User 1 received waiting-for-partner:', user1HasWaiting);
  console.log('User 1 received partner-found:', user1HasPartner);
  console.log('User 2 received waiting-for-partner:', user2HasWaiting);
  console.log('User 2 received partner-found:', user2HasPartner);

  // Check if SessionPage appeared
  const user1HasChat = await page1.locator('input[placeholder*="message"]').isVisible().catch(() => false);
  const user2HasChat = await page2.locator('input[placeholder*="message"]').isVisible().catch(() => false);

  console.log('\nUser 1 has chat input:', user1HasChat);
  console.log('User 2 has chat input:', user2HasChat);

  // Look for specific event patterns
  console.log('\n=== Detailed Event Logs ===');
  console.log('User 1 socket connected:', events1.some(e => e.includes('Socket connected')));
  console.log('User 1 joined queue:', events1.some(e => e.includes('Joined queue')));
  console.log('User 1 clicked find partner:', events1.some(e => e.includes('Clicked Find a Partner')));
  console.log('User 1 handlers ready:', events1.some(e => e.includes('Demo mode: Socket connected')));

  console.log('\nUser 2 socket connected:', events2.some(e => e.includes('Socket connected')));
  console.log('User 2 joined queue:', events2.some(e => e.includes('Joined queue')));
  console.log('User 2 clicked find partner:', events2.some(e => e.includes('Clicked Find a Partner')));
  console.log('User 2 handlers ready:', events2.some(e => e.includes('Demo mode: Socket connected')));

  // Check for mismatched event order
  const user1ConnectedIndex = events1.findIndex(e => e.includes('Socket connected'));
  const user1JoinedIndex = events1.findIndex(e => e.includes('Joined queue'));
  const user1ClickedIndex = events1.findIndex(e => e.includes('Clicked Find a Partner'));

  console.log('\n=== Event Order Analysis (User 1) ===');
  console.log('Socket connected at index:', user1ConnectedIndex);
  console.log('Joined queue at index:', user1JoinedIndex);
  console.log('Clicked Find a Partner at index:', user1ClickedIndex);

  // Test expectations
  expect(button1Visible).toBe(true);
  expect(button2Visible).toBe(true);

  // At least one user should have received the waiting event
  expect(user1HasWaiting || user2HasWaiting).toBe(true);

  await context1.close();
  await context2.close();
});
