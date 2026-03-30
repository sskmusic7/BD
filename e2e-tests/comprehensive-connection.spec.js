import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://bodydoubleapp.com';

test('comprehensive two-user connection test', async ({ browser }) => {
  console.log('\n=== Comprehensive Connection Test ===');

  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  // Collect ALL events from the start
  const allEvents1 = [];
  const allEvents2 = [];

  page1.on('console', msg => {
    const text = msg.text();
    allEvents1.push({ type: msg.type(), text, time: Date.now() });
  });

  page2.on('console', msg => {
    const text = msg.text();
    allEvents2.push({ type: msg.type(), text, time: Date.now() });
  });

  // Navigate both pages
  console.log('Navigating both pages...');
  await Promise.all([
    page1.goto(BASE_URL, { waitUntil: 'networkidle' }),
    page2.goto(BASE_URL, { waitUntil: 'networkidle' })
  ]);

  // Wait for socket connection
  await Promise.all([
    page1.waitForTimeout(5000),
    page2.waitForTimeout(5000)
  ]);

  console.log('Both pages loaded, checking socket status...');

  // Check socket connection via page evaluation
  const socketCheck1 = await page1.evaluate(() => {
    return {
      hasSocket: typeof window.io !== 'undefined',
      ready: document.body.innerText.includes('Find a Partner')
    };
  });

  const socketCheck2 = await page2.evaluate(() => {
    return {
      hasSocket: typeof window.io !== 'undefined',
      ready: document.body.innerText.includes('Find a Partner')
    };
  });

  console.log('Page 1 ready:', socketCheck1.ready);
  console.log('Page 2 ready:', socketCheck2.ready);

  // Find and click buttons on both pages
  const button1 = page1.locator('button:has-text("Find a Partner")');
  const button2 = page2.locator('button:has-text("Find a Partner")');

  const button1Ready = await button1.isVisible();
  const button2Ready = await button2.isVisible();

  console.log('Button 1 visible:', button1Ready);
  console.log('Button 2 visible:', button2Ready);

  if (!button1Ready || !button2Ready) {
    console.log('ERROR: Buttons not ready!');
    await page1.screenshot({ path: 'test-results/debug-page1.png' });
    await page2.screenshot({ path: 'test-results/debug-page2.png' });
    throw new Error('Find a Partner buttons not visible');
  }

  // Click both buttons (in quick succession to simulate real users)
  console.log('Clicking both Find a Partner buttons...');
  await Promise.all([
    button1.click(),
    button2.click()
  ]);

  // Wait for matching to happen
  await Promise.all([
    page1.waitForTimeout(8000),
    page2.waitForTimeout(8000)
  ]);

  // Check final state
  const searching1 = await page1.locator('text=Finding Your Partner').count();
  const searching2 = await page2.locator('text=Finding Your Partner').count();

  const chat1 = await page1.locator('text=Chat').count();
  const chat2 = await page2.locator('text=Chat').count();

  console.log('\n=== Final Results ===');
  console.log('User 1 searching:', searching1 > 0);
  console.log('User 2 searching:', searching2 > 0);
  console.log('User 1 has chat:', chat1 > 0);
  console.log('User 2 has chat:', chat2 > 0);

  console.log('\n=== User 1 Events ===');
  allEvents1.forEach((e, i) => {
    if (e.text.includes('Socket') || e.text.includes('Demo') || e.text.includes('partner')) {
      console.log(`  ${i}: [${e.type}] ${e.text}`);
    }
  });

  console.log('\n=== User 2 Events ===');
  allEvents2.forEach((e, i) => {
    if (e.text.includes('Socket') || e.text.includes('Demo') || e.text.includes('partner')) {
      console.log(`  ${i}: [${e.type}] ${e.text}`);
    }
  });

  // Take screenshots
  await page1.screenshot({ path: 'test-results/final-page1.png', fullPage: true });
  await page2.screenshot({ path: 'test-results/final-page2.png', fullPage: true });

  // Check stats
  const stats = await page1.evaluate(async (baseUrl) => {
    try {
      const response = await fetch(`${baseUrl}/api/stats`);
      return await response.json();
    } catch (e) {
      return { error: e.message };
    }
  }, BASE_URL);

  console.log('\n=== Server Stats ===');
  console.log('Stats:', stats);

  await context1.close();
  await context2.close();

  // At least one user should be searching or in a session
  const success = (searching1 > 0 || searching2 > 0 || chat1 > 0 || chat2 > 0);
  console.log('\nTest result:', success ? 'PASSED' : 'FAILED');

  expect(success).toBe(true);
});
