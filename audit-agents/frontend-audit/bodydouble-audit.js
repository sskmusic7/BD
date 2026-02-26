#!/usr/bin/env node
/**
 * BodyDouble Comprehensive Audit
 * Tests frontend, backend, UI, and functionality
 */

const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'https://bodydouble-oarailnku-kayahs-projects.vercel.app';
const BACKEND_URL = process.env.BACKEND_URL || 'https://bodydouble-backend-6w2j7q3qsa-uc.a.run.app';
const HEADLESS = process.env.HEADLESS !== 'false';

const results = {
  frontend: { passed: [], failed: [], warnings: [] },
  backend: { passed: [], failed: [], warnings: [] },
  ui: { passed: [], failed: [], warnings: [] },
  functionality: { passed: [], failed: [], warnings: [] }
};

async function runAudit() {
  console.log('\n🔍 BODYDOUBLE COMPREHENSIVE AUDIT');
  console.log('=========================================');
  console.log(`📍 Frontend: ${BASE_URL}`);
  console.log(`📍 Backend: ${BACKEND_URL}`);
  console.log(`🖥️  Mode: ${HEADLESS ? 'Headless' : 'Visible Browser'}`);
  console.log('=========================================\n');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });

  try {
    // Test 1: Home Page Load
    console.log('📄 Testing Home Page...');
    const page = await context.newPage();
    const jsErrors = [];
    const consoleErrors = [];
    
    page.on('pageerror', error => jsErrors.push(error.message));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check for errors
    if (jsErrors.length > 0) {
      results.frontend.failed.push({ test: 'Home Page', errors: jsErrors });
      console.log(`   ❌ FAILED: ${jsErrors.length} JS error(s)`);
    } else {
      results.frontend.passed.push('Home Page loads without errors');
      console.log('   ✅ PASSED: Home Page loads');
    }

    // Test 2: Login Flow
    console.log('\n👤 Testing Login Flow...');
    const testUser1 = `testuser_${Date.now()}`;
    const testUser2 = `testuser2_${Date.now()}`;

    // Fill in name
    const nameInput = page.locator('input[type="text"], input[placeholder*="name" i], input[placeholder*="Name" i]').first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill(testUser1);
      console.log(`   ✓ Filled name: ${testUser1}`);
    }

    // Click start button
    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin"), button:has-text("Join")').first();
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click();
      await page.waitForTimeout(2000);
      console.log('   ✓ Clicked start button');
    }

    // Check if we're on profile setup or session page
    const currentUrl = page.url();
    if (currentUrl.includes('profile') || currentUrl.includes('setup')) {
      console.log('   ✓ On profile setup page');
      // Fill profile if needed
      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
      if (await continueButton.isVisible().catch(() => false)) {
        await continueButton.click();
        await page.waitForTimeout(2000);
      }
    }

    // Test 3: Check for Session Page
    console.log('\n🎥 Testing Session Page...');
    await page.waitForTimeout(3000);

    // Check for duplicate chat boxes
    const chatBoxes = await page.locator('[class*="chat" i], [class*="message" i], text=Chat').count();
    if (chatBoxes > 1) {
      results.ui.failed.push({ test: 'Chat Box Duplication', issue: `Found ${chatBoxes} chat elements` });
      console.log(`   ⚠️  WARNING: Found ${chatBoxes} chat elements (possible duplication)`);
    } else {
      results.ui.passed.push('No duplicate chat boxes');
      console.log('   ✅ PASSED: Chat box appears once');
    }

    // Test 4: Layout Toggle Buttons
    console.log('\n🎛️  Testing Layout Toggle...');
    const layoutButtons = await page.locator('button[title*="layout" i], button[title*="Layout" i], button:has(svg)').all();
    const layoutButtonCount = layoutButtons.length;
    
    if (layoutButtonCount >= 3) {
      results.ui.passed.push('Layout toggle buttons visible');
      console.log(`   ✅ PASSED: Found ${layoutButtonCount} layout buttons`);
      
      // Try clicking stacked layout
      const stackedButton = page.locator('button[title*="Stacked" i], button[title*="stacked" i]').first();
      if (await stackedButton.isVisible().catch(() => false)) {
        await stackedButton.click();
        await page.waitForTimeout(1000);
        console.log('   ✓ Clicked stacked layout button');
        
        // Check if layout changed
        const videoContainers = await page.locator('video, [class*="video" i]').count();
        console.log(`   ✓ Found ${videoContainers} video elements`);
      }
    } else {
      results.ui.failed.push({ test: 'Layout Toggle', issue: `Only found ${layoutButtonCount} buttons` });
      console.log(`   ⚠️  WARNING: Only found ${layoutButtonCount} layout buttons`);
    }

    // Test 5: Mobile Viewport (Responsive)
    console.log('\n📱 Testing Mobile Viewport...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    // Check if layout adapts
    const mobileLayout = await page.evaluate(() => {
      const videos = document.querySelectorAll('video, [class*="video"]');
      const containers = Array.from(videos).map(v => {
        const parent = v.closest('[class*="grid"], [class*="flex"]');
        return parent ? window.getComputedStyle(parent).flexDirection : null;
      });
      return containers;
    });
    
    console.log(`   ✓ Mobile viewport set (375x667)`);
    console.log(`   ✓ Video containers: ${mobileLayout.length}`);

    // Test 6: Desktop Viewport
    console.log('\n🖥️  Testing Desktop Viewport...');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);
    console.log('   ✓ Desktop viewport restored');

    // Test 7: Backend Health Check
    console.log('\n🔌 Testing Backend Connection...');
    try {
      const healthResponse = await page.request.get(`${BACKEND_URL}/health`);
      if (healthResponse.ok()) {
        results.backend.passed.push('Backend health check passed');
        console.log('   ✅ PASSED: Backend is healthy');
      } else {
        results.backend.failed.push({ test: 'Health Check', status: healthResponse.status() });
        console.log(`   ❌ FAILED: Backend returned ${healthResponse.status()}`);
      }
    } catch (error) {
      results.backend.failed.push({ test: 'Health Check', error: error.message });
      console.log(`   ❌ FAILED: ${error.message}`);
    }

    // Test 8: Screenshot
    console.log('\n📸 Taking Screenshot...');
    await page.screenshot({ path: 'audit-screenshot-full.png', fullPage: true });
    console.log('   ✅ Screenshot saved: audit-screenshot-full.png');

    // Test 9: Check for Background
    console.log('\n🎨 Testing Background...');
    const hasBackground = await page.evaluate(() => {
      const body = document.body;
      const style = window.getComputedStyle(body);
      return style.backgroundImage !== 'none' && style.backgroundImage !== '';
    });
    
    if (hasBackground) {
      results.ui.passed.push('Background is visible');
      console.log('   ✅ PASSED: Background is visible');
    } else {
      results.ui.warnings.push('Background may not be visible');
      console.log('   ⚠️  WARNING: Background may not be visible');
    }

  } catch (error) {
    console.error('❌ Audit Error:', error);
    results.frontend.failed.push({ test: 'General', error: error.message });
  } finally {
    await browser.close();
  }

  // Print Summary
  console.log('\n\n📊 AUDIT SUMMARY');
  console.log('=========================================\n');
  
  console.log('🎨 FRONTEND:');
  console.log(`   ✅ Passed: ${results.frontend.passed.length}`);
  console.log(`   ❌ Failed: ${results.frontend.failed.length}`);
  results.frontend.failed.forEach(f => console.log(`      → ${f.test || f}`));
  
  console.log('\n🔌 BACKEND:');
  console.log(`   ✅ Passed: ${results.backend.passed.length}`);
  console.log(`   ❌ Failed: ${results.backend.failed.length}`);
  results.backend.failed.forEach(f => console.log(`      → ${f.test || f}`));
  
  console.log('\n🎨 UI:');
  console.log(`   ✅ Passed: ${results.ui.passed.length}`);
  console.log(`   ❌ Failed: ${results.ui.failed.length}`);
  console.log(`   ⚠️  Warnings: ${results.ui.warnings.length}`);
  results.ui.failed.forEach(f => console.log(`      → ${f.test || f.issue || f}`));
  
  console.log('\n=========================================');
  const totalIssues = results.frontend.failed.length + results.backend.failed.length + results.ui.failed.length;
  console.log(`Total Issues: ${totalIssues}`);
  console.log('=========================================\n');

  process.exit(totalIssues > 0 ? 1 : 0);
}

runAudit().catch(error => {
  console.error('❌ Audit failed:', error);
  process.exit(1);
});
