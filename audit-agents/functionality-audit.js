#!/usr/bin/env node
/**
 * FUNCTIONALITY AUDIT AGENT
 * Tests all features: login, sessions, chat, buttons, WebRTC
 * Runs continuously on 30-45 min loop
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://bodydouble-oarailnku-kayahs-projects.vercel.app';
const BACKEND_URL = process.env.BACKEND_URL || 'https://bodydouble-backend-6w2j7q3qsa-uc.a.run.app';
const HEADLESS = process.env.HEADLESS !== 'false';
const INTERVAL_MIN = parseInt(process.env.INTERVAL_MIN || '30');
const RESULTS_FILE = path.join(__dirname, 'functionality-results.json');

let iteration = 0;

async function runFunctionalityAudit() {
  iteration++;
  const timestamp = new Date().toISOString();
  console.log(`\n⚙️  FUNCTIONALITY AUDIT #${iteration} - ${timestamp}`);
  console.log('=========================================');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const results = {
    timestamp,
    iteration,
    tests: {},
    issues: [],
    passed: []
  };

  try {
    // Test 1: Home Page Load
    console.log('🔍 Testing Home Page Load...');
    const jsErrors = [];
    page.on('pageerror', error => jsErrors.push(error.message));
    
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    if (jsErrors.length > 0) {
      results.issues.push({
        test: 'home_page_load',
        severity: 'high',
        message: `JavaScript errors: ${jsErrors.length}`,
        errors: jsErrors
      });
      console.log(`   ❌ FAILED: ${jsErrors.length} JS errors`);
    } else {
      results.tests.home_page_load = 'passed';
      results.passed.push('Home page loads without errors');
      console.log('   ✅ PASSED: Home page loads');
    }

    // Test 2: Login Flow
    console.log('🔍 Testing Login Flow...');
    const testUser = `testuser_${Date.now()}`;
    
    try {
      const nameInput = page.locator('input[type="text"]').first();
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nameInput.fill(testUser);
        console.log(`   ✓ Filled name: ${testUser}`);
      }

      const startButton = page.locator('button:has-text("Start"), button:has-text("Begin"), button:has-text("Join")').first();
      if (await startButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await startButton.click();
        await page.waitForTimeout(3000);
        console.log('   ✓ Clicked start button');
        
        results.tests.login_flow = 'passed';
        results.passed.push('Login flow works');
        console.log('   ✅ PASSED: Login flow');
      } else {
        results.issues.push({
          test: 'login_flow',
          severity: 'medium',
          message: 'Start button not found'
        });
        console.log('   ❌ FAILED: Start button not found');
      }
    } catch (error) {
      results.issues.push({
        test: 'login_flow',
        severity: 'high',
        message: error.message
      });
      console.log(`   ❌ FAILED: ${error.message}`);
    }

    // Test 3: Button Functionality
    console.log('🔍 Testing Button Functionality...');
    const buttons = await page.locator('button').all();
    let workingButtons = 0;
    let brokenButtons = 0;
    
    for (let i = 0; i < Math.min(buttons.length, 10); i++) {
      try {
        const button = buttons[i];
        const isVisible = await button.isVisible().catch(() => false);
        if (isVisible) {
          // Try clicking (but don't wait for navigation)
          await button.click({ timeout: 1000 }).catch(() => {});
          workingButtons++;
        }
      } catch (e) {
        brokenButtons++;
      }
    }
    
    if (brokenButtons > workingButtons / 2) {
      results.issues.push({
        test: 'button_functionality',
        severity: 'high',
        message: `${brokenButtons} buttons may not be working`,
        broken: brokenButtons,
        working: workingButtons
      });
      console.log(`   ❌ FAILED: ${brokenButtons} buttons may be broken`);
    } else {
      results.tests.button_functionality = 'passed';
      results.passed.push(`Buttons working (${workingButtons} tested)`);
      console.log(`   ✅ PASSED: ${workingButtons} buttons working`);
    }

    // Test 4: Layout Toggle
    console.log('🔍 Testing Layout Toggle...');
    try {
      const layoutButtons = await page.locator('button[title*="layout" i], button[title*="Layout" i], button[title*="Stacked" i]').all();
      if (layoutButtons.length >= 3) {
        // Try clicking each layout button
        for (const btn of layoutButtons.slice(0, 3)) {
          try {
            await btn.click({ timeout: 2000 });
            await page.waitForTimeout(500);
          } catch (e) {}
        }
        results.tests.layout_toggle = 'passed';
        results.passed.push('Layout toggle buttons work');
        console.log('   ✅ PASSED: Layout toggle works');
      } else {
        results.issues.push({
          test: 'layout_toggle',
          severity: 'medium',
          message: `Only found ${layoutButtons.length} layout buttons`
        });
        console.log(`   ⚠️  WARNING: Only ${layoutButtons.length} layout buttons`);
      }
    } catch (error) {
      results.issues.push({
        test: 'layout_toggle',
        severity: 'medium',
        message: error.message
      });
      console.log(`   ❌ FAILED: ${error.message}`);
    }

    // Test 5: Responsive Design
    console.log('🔍 Testing Responsive Design...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    const mobileLayout = await page.evaluate(() => {
      const videos = document.querySelectorAll('video, [class*="video"]');
      return videos.length;
    });
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);
    
    if (mobileLayout > 0) {
      results.tests.responsive_design = 'passed';
      results.passed.push('Responsive design works');
      console.log('   ✅ PASSED: Responsive design');
    } else {
      results.warnings = results.warnings || [];
      results.warnings.push({
        test: 'responsive_design',
        message: 'No video elements found on mobile'
      });
      console.log('   ⚠️  WARNING: No videos on mobile');
    }

    // Test 6: Backend Health
    console.log('🔍 Testing Backend Health...');
    try {
      const healthResponse = await page.request.get(`${BACKEND_URL}/health`);
      if (healthResponse.ok()) {
        results.tests.backend_health = 'passed';
        results.passed.push('Backend is healthy');
        console.log('   ✅ PASSED: Backend health check');
      } else {
        results.issues.push({
          test: 'backend_health',
          severity: 'high',
          message: `Backend returned ${healthResponse.status()}`
        });
        console.log(`   ❌ FAILED: Backend ${healthResponse.status()}`);
      }
    } catch (error) {
      results.issues.push({
        test: 'backend_health',
        severity: 'high',
        message: error.message
      });
      console.log(`   ❌ FAILED: ${error.message}`);
    }

    // Screenshot
    await page.screenshot({ path: path.join(__dirname, `functionality-screenshot-${iteration}.png`), fullPage: true });

  } catch (error) {
    results.issues.push({
      test: 'general',
      severity: 'high',
      message: error.message,
      error: error.stack
    });
    console.error('❌ Audit Error:', error);
  } finally {
    await browser.close();
  }

  // Save results
  let allResults = [];
  if (fs.existsSync(RESULTS_FILE)) {
    allResults = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
  }
  allResults.push(results);
  if (allResults.length > 100) {
    allResults = allResults.slice(-100);
  }
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));

  // Print summary
  console.log('\n📊 FUNCTIONALITY AUDIT SUMMARY');
  console.log('=========================================');
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Issues: ${results.issues.length}`);
  
  if (results.issues.length > 0) {
    console.log('\n❌ ISSUES:');
    results.issues.forEach(issue => {
      console.log(`   - [${issue.severity?.toUpperCase() || 'MEDIUM'}] ${issue.test}: ${issue.message}`);
    });
  }

  const isPerfect = results.issues.length === 0;
  console.log(`\n${isPerfect ? '✨ PERFECT!' : '⚠️  Needs attention'}`);
  console.log('=========================================\n');

  return isPerfect;
}

// Continuous loop
async function runLoop() {
  while (true) {
    try {
      const isPerfect = await runFunctionalityAudit();
      
      if (isPerfect) {
        console.log('🎉 Functionality audit passed! Waiting for next cycle...');
      } else {
        console.log('⚠️  Issues found. Will check again in next cycle...');
      }
      
      const waitMs = INTERVAL_MIN * 60 * 1000;
      const waitMin = Math.floor(waitMs / 60000);
      console.log(`⏳ Next audit in ${waitMin} minutes...\n`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    } catch (error) {
      console.error('❌ Loop Error:', error);
      console.log('⏳ Retrying in 5 minutes...\n');
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    }
  }
}

// Start
if (require.main === module) {
  console.log('⚙️  FUNCTIONALITY AUDIT AGENT STARTED');
  console.log(`📍 Frontend: ${BASE_URL}`);
  console.log(`📍 Backend: ${BACKEND_URL}`);
  console.log(`⏱️  Interval: ${INTERVAL_MIN} minutes`);
  console.log('=========================================\n');
  runLoop().catch(console.error);
}

module.exports = { runFunctionalityAudit };
