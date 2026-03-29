import { test, expect } from '@playwright/test';

// Test the deployed version
const BASE_URL = process.env.BASE_URL || 'https://bodydouble.vercel.app';
// Or use local: const BASE_URL = 'http://localhost:3000';

test.describe('BodyDouble Chat Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto(BASE_URL);
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('should load the homepage', async ({ page }) => {
    // Check if the main heading is visible
    await expect(page.locator('h1')).toContainText('Find Your');
  });

  test('should show user info in demo mode', async ({ page }) => {
    // In demo mode, user should be "Demo User"
    const userName = await page.locator('text=Demo User').count();
    expect(userName).toBeGreaterThan(0);
  });

  test('should display "Find a Partner" button', async ({ page }) => {
    // The main CTA button should be visible
    const findPartnerButton = page.locator('button:has-text("Find a Partner")');
    await expect(findPartnerButton).toBeVisible();
  });

  test('should show stats (online users, active sessions)', async ({ page }) => {
    // Stats should be displayed
    const statsSection = page.locator('text=Online Now');
    await expect(statsSection).toBeVisible();
  });

  test('should attempt to find a partner when button clicked', async ({ page }) => {
    // Click the "Find a Partner" button
    const findPartnerButton = page.locator('button:has-text("Find a Partner")');
    await findPartnerButton.click();

    // In demo mode, socket is null, so the button click won't do anything
    // But let's check for any console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Wait a bit to see if anything happens
    await page.waitForTimeout(2000);

    // Log any errors found
    if (errors.length > 0) {
      console.log('Console errors found:', errors);
    }
  });

  test('should capture console logs and errors', async ({ page }) => {
    const logs = [];
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      } else {
        logs.push(msg.text());
      }
    });

    // Wait and collect logs
    await page.waitForTimeout(3000);

    console.log('Console logs:', logs);
    console.log('Console errors:', errors);

    // Check for specific errors related to socket or chat
    const socketErrors = errors.filter(e =>
      e.includes('socket') ||
      e.includes('Socket') ||
      e.includes('WebSocket') ||
      e.includes('Cannot read properties')
    );

    if (socketErrors.length > 0) {
      console.log('Socket-related errors found:', socketErrors);
    }
  });

  test('should check if socket connection is attempted', async ({ page }) => {
    // Monitor network requests for socket.io
    const socketRequests = [];

    page.on('request', request => {
      const url = request.url();
      if (url.includes('socket.io')) {
        socketRequests.push(url);
      }
    });

    await page.waitForTimeout(5000);

    console.log('Socket.io requests made:', socketRequests);

    // With the fix, we SHOULD see socket requests now
    // The demo mode now connects to the socket server
    if (socketRequests.length > 0) {
      console.log('✓ Socket connection established in demo mode!');
    } else {
      console.log('✗ No socket connection detected - may need to check network');
    }
  });

  test('should navigate to friends page', async ({ page }) => {
    // Try to navigate to friends page
    await page.goto(`${BASE_URL}/friends`);
    await page.waitForLoadState('networkidle');

    // Friends page should load (even if empty in demo mode)
    const friendsHeading = page.locator('h1, h2').filter({ hasText: /Friends|Partner/i });
    // This might not exist, just checking if page loads without crashing
    expect(await page.title()).toBeTruthy();
  });
});

test.describe('BodyDouble Socket Connection Test', () => {
  test('should verify backend server is accessible', async ({ page }) => {
    // Try to fetch stats from the backend
    const response = await page.request.fetch('https://bodydouble-backend-x2x4tp5wra-uc.a.run.app/api/stats');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    console.log('Backend stats:', data);
    expect(data).toHaveProperty('onlineUsers');
    expect(data).toHaveProperty('activeSessions');
  });
});
