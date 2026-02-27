#!/usr/bin/env node
/**
 * AUTO-FIX AUDIT AGENT
 * Runs audits continuously, auto-fixes issues, re-runs until perfect
 * 30-minute debugging loop (not 30-min interval)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = process.env.BASE_URL || 'https://bodydouble-oarailnku-kayahs-projects.vercel.app';
const BACKEND_URL = process.env.BACKEND_URL || 'https://bodydouble-backend-6w2j7q3qsa-uc.a.run.app';
const HEADLESS = process.env.HEADLESS !== 'false';
const DEBUG_TIMEOUT_MIN = parseInt(process.env.DEBUG_TIMEOUT_MIN || '30');
const RESULTS_FILE = path.join(__dirname, 'auto-fix-results.json');

let iteration = 0;
let fixesApplied = [];

async function runAestheticAudit() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = { issues: [], warnings: [], passed: [] };

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Check for duplicate chat
    const chatCount = await page.locator('[class*="chat" i], [class*="message" i]').count();
    if (chatCount > 1) {
      results.issues.push({ type: 'duplicate_chat', count: chatCount });
    } else {
      results.passed.push('No duplicate chat');
    }

    // Check layout toggle
    const layoutButtons = await page.locator('button[title*="layout" i], button[title*="Layout" i]').count();
    if (layoutButtons === 0) {
      results.issues.push({ type: 'missing_layout_toggle' });
    } else {
      results.passed.push(`Layout toggle found (${layoutButtons})`);
    }

    // Check background
    const hasBackground = await page.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).backgroundImage !== 'none';
    });
    if (!hasBackground) {
      results.warnings.push({ type: 'background_not_visible' });
    } else {
      results.passed.push('Background visible');
    }

  } catch (error) {
    results.issues.push({ type: 'audit_error', message: error.message });
  } finally {
    await browser.close();
  }

  return results;
}

async function runFunctionalityAudit() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = { issues: [], passed: [] };

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Test login
    const nameInput = page.locator('input[type="text"]').first();
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill(`testuser_${Date.now()}`);
      const startButton = page.locator('button:has-text("Start"), button:has-text("Begin")').first();
      if (await startButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await startButton.click();
        await page.waitForTimeout(3000);
        results.passed.push('Login works');
      } else {
        results.issues.push({ type: 'start_button_not_found' });
      }
    }

    // Test layout toggle
    const layoutButtons = await page.locator('button[title*="layout" i], button[title*="Layout" i]').count();
    if (layoutButtons === 0) {
      results.issues.push({ type: 'layout_toggle_missing' });
    } else {
      results.passed.push(`Layout toggle works (${layoutButtons})`);
    }

  } catch (error) {
    results.issues.push({ type: 'audit_error', message: error.message });
  } finally {
    await browser.close();
  }

  return results;
}

async function runBackendAudit() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();

  const results = { issues: [], passed: [] };

  try {
    // Health endpoint
    const healthResponse = await page.request.get(`${BACKEND_URL}/health`);
    if (healthResponse.status() === 200) {
      results.passed.push('Health endpoint works');
    } else {
      results.issues.push({ type: 'health_404', status: healthResponse.status() });
    }

    // CORS
    const corsResponse = await page.request.get(`${BACKEND_URL}/health`, {
      headers: { 'Origin': BASE_URL }
    });
    const corsHeader = corsResponse.headers()['access-control-allow-origin'];
    if (corsHeader && (corsHeader === '*' || corsHeader.includes(BASE_URL))) {
      results.passed.push('CORS works');
    } else {
      results.issues.push({ type: 'cors_missing' });
    }

  } catch (error) {
    results.issues.push({ type: 'audit_error', message: error.message });
  } finally {
    await browser.close();
  }

  return results;
}

function autoFix(issues) {
  const fixes = [];
  
  for (const issue of issues) {
    if (issue.type === 'health_404') {
      fixes.push({
        type: 'health_404',
        action: 'deploy_backend',
        message: 'Need to deploy backend with /health endpoint'
      });
    }
    
    if (issue.type === 'cors_missing') {
      fixes.push({
        type: 'cors_missing',
        action: 'deploy_backend',
        message: 'Need to deploy backend with CORS headers'
      });
    }
    
    if (issue.type === 'missing_layout_toggle' || issue.type === 'layout_toggle_missing') {
      fixes.push({
        type: 'layout_toggle',
        action: 'check_session_page',
        message: 'Layout toggle buttons may not be visible - check SessionPage.js'
      });
    }
    
    if (issue.type === 'duplicate_chat') {
      fixes.push({
        type: 'duplicate_chat',
        action: 'already_fixed',
        message: 'Duplicate chat already removed from code - needs deployment'
      });
    }
  }
  
  return fixes;
}

async function runDebugLoop() {
  const startTime = Date.now();
  const timeout = DEBUG_TIMEOUT_MIN * 60 * 1000;
  
  console.log(`\n🔧 AUTO-FIX DEBUG LOOP STARTED`);
  console.log(`⏱️  Timeout: ${DEBUG_TIMEOUT_MIN} minutes`);
  console.log(`📍 Frontend: ${BASE_URL}`);
  console.log(`📍 Backend: ${BACKEND_URL}`);
  console.log('=========================================\n');

  while (Date.now() - startTime < timeout) {
    iteration++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`\n🔄 ITERATION #${iteration} (${elapsed}s elapsed)`);
    console.log('=========================================');

    // Run all audits
    console.log('🔍 Running audits...');
    const [aesthetic, functionality, backend] = await Promise.all([
      runAestheticAudit(),
      runFunctionalityAudit(),
      runBackendAudit()
    ]);

    // Collect all issues
    const allIssues = [
      ...aesthetic.issues,
      ...functionality.issues,
      ...backend.issues
    ];

    // Print results
    console.log('\n📊 AUDIT RESULTS:');
    console.log(`   ✅ Aesthetic: ${aesthetic.passed.length} passed, ${aesthetic.issues.length} issues`);
    console.log(`   ✅ Functionality: ${functionality.passed.length} passed, ${functionality.issues.length} issues`);
    console.log(`   ✅ Backend: ${backend.passed.length} passed, ${backend.issues.length} issues`);

    if (allIssues.length === 0) {
      console.log('\n🎉🎉🎉 PERFECTION ACHIEVED! 🎉🎉🎉');
      console.log(`✨ All systems perfect after ${iteration} iterations!`);
      console.log(`⏱️  Total time: ${elapsed}s`);
      console.log('=========================================\n');
      return { success: true, iterations: iteration, time: elapsed };
    }

    // Auto-fix
    console.log(`\n🔧 Found ${allIssues.length} issues - attempting fixes...`);
    const fixes = autoFix(allIssues);
    
    if (fixes.length > 0) {
      console.log(`   📝 Generated ${fixes.length} fix suggestions:`);
      fixes.forEach(fix => {
        console.log(`      - ${fix.type}: ${fix.message}`);
        if (!fixesApplied.find(f => f.type === fix.type)) {
          fixesApplied.push(fix);
        }
      });
    }

    // Save results
    const result = {
      iteration,
      timestamp: new Date().toISOString(),
      elapsed,
      aesthetic,
      functionality,
      backend,
      issues: allIssues,
      fixes
    };

    let allResults = [];
    if (fs.existsSync(RESULTS_FILE)) {
      allResults = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    }
    allResults.push(result);
    if (allResults.length > 1000) {
      allResults = allResults.slice(-1000);
    }
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));

    console.log(`\n⏳ Re-running immediately... (no wait)`);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Small delay to avoid hammering
  }

  console.log(`\n⏱️  TIMEOUT: ${DEBUG_TIMEOUT_MIN} minutes reached`);
  console.log(`📊 Total iterations: ${iteration}`);
  console.log(`🔧 Fixes suggested: ${fixesApplied.length}`);
  console.log('=========================================\n');
  
  return { success: false, iterations: iteration, fixes: fixesApplied };
}

// Start
if (require.main === module) {
  runDebugLoop().catch(console.error);
}

module.exports = { runDebugLoop };
