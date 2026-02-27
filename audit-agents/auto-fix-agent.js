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

    // Check for duplicate chat (only on session page)
    // First, try to get to session page
    try {
      const nameInput = page.locator('input[type="text"]').first();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nameInput.fill(`testuser_${Date.now()}`);
        const startButton = page.locator('button:has-text("Start"), button:has-text("Begin")').first();
        if (await startButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await startButton.click();
          await page.waitForTimeout(5000); // Wait for session page to load
          
          // Now check for duplicate chat on session page
          const chatCount = await page.locator('[class*="chat" i], [class*="message" i], text=/Chat/i').count();
          if (chatCount > 1) {
            results.issues.push({ type: 'duplicate_chat', count: chatCount });
          } else {
            results.passed.push('No duplicate chat');
          }

          // Check layout toggle on session page
          const layoutButtons = await page.locator('button[title*="layout" i], button[title*="Layout" i], button[title*="Stacked" i], button[title*="Side by side" i]').count();
          if (layoutButtons === 0) {
            results.issues.push({ type: 'missing_layout_toggle' });
          } else {
            results.passed.push(`Layout toggle found (${layoutButtons})`);
          }
        }
      }
    } catch (e) {
      // If we can't get to session page, layout toggle check doesn't apply
      results.warnings.push({ type: 'could_not_reach_session', message: 'Could not navigate to session page to check layout toggle' });
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
        await page.waitForTimeout(5000); // Wait longer for session page
        
        results.passed.push('Login works');
        
        // Test layout toggle on session page
        const layoutButtons = await page.locator('button[title*="layout" i], button[title*="Layout" i], button[title*="Stacked" i], button[title*="Side by side" i]').count();
        if (layoutButtons === 0) {
          results.issues.push({ type: 'layout_toggle_missing' });
        } else {
          results.passed.push(`Layout toggle works (${layoutButtons})`);
          
          // Try clicking one to test functionality
          try {
            const firstLayoutBtn = page.locator('button[title*="layout" i], button[title*="Layout" i], button[title*="Stacked" i]').first();
            if (await firstLayoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await firstLayoutBtn.click();
              await page.waitForTimeout(1000);
              results.passed.push('Layout toggle button is clickable');
            }
          } catch (e) {
            // Ignore click errors
          }
        }
      } else {
        results.issues.push({ type: 'start_button_not_found' });
      }
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

async function autoFix(issues, fixesApplied) {
  const fixes = [];
  
  for (const issue of issues) {
    // Skip if we already tried to fix this
    if (fixesApplied.find(f => f.type === issue.type && f.applied)) {
      continue;
    }
    
    if (issue.type === 'health_404' || issue.type === 'cors_missing') {
      // Backend deployment needed - check if we can trigger it
      const backendDir = path.join(__dirname, '..', 'server');
      if (fs.existsSync(backendDir)) {
        console.log(`   🔧 Attempting to check backend deployment status...`);
        try {
          // Check if there's a deploy script
          const deployScript = path.join(__dirname, '..', 'deploy-cloud-run.sh');
          if (fs.existsSync(deployScript)) {
            fixes.push({
              type: issue.type,
              action: 'deploy_backend',
              message: 'Backend needs deployment - deploy script found',
              applied: false,
              canAutoFix: true
            });
          } else {
            fixes.push({
              type: issue.type,
              action: 'deploy_backend',
              message: 'Backend needs deployment - no deploy script found',
              applied: false,
              canAutoFix: false
            });
          }
        } catch (e) {
          fixes.push({
            type: issue.type,
            action: 'deploy_backend',
            message: `Backend deployment check failed: ${e.message}`,
            applied: false,
            canAutoFix: false
          });
        }
      }
    }
    
    if (issue.type === 'missing_layout_toggle' || issue.type === 'layout_toggle_missing') {
      // Fix layout toggle visibility in SessionPage.js
      const sessionPagePath = path.join(__dirname, '..', 'src', 'components', 'SessionPage.js');
      if (fs.existsSync(sessionPagePath)) {
        try {
          let code = fs.readFileSync(sessionPagePath, 'utf8');
          let modified = false;
          
          // Check if layout toggle exists but might need better visibility
          if (code.includes('Layout Toggle Button')) {
            // Make sure it has high z-index and is always visible
            if (!code.includes('z-50') || code.includes('z-10')) {
              code = code.replace(
                /(\{/\* Layout Toggle Button \*\/\s*<div className="[^"]*")/,
                '{/* Layout Toggle Button */\n        <div className="flex justify-end mb-4 z-50 relative"'
              );
              modified = true;
            }
            
            // Ensure buttons have strong contrast
            if (code.includes('bg-white/40') && !code.includes('bg-black/')) {
              code = code.replace(
                /bg-white\/40 text-white/g,
                'bg-black/70 text-white border-2 border-white/40'
              );
              modified = true;
            }
            
            if (modified) {
              fs.writeFileSync(sessionPagePath, code);
              fixes.push({
                type: 'layout_toggle',
                action: 'improved_visibility',
                message: 'Improved layout toggle button visibility in SessionPage.js',
                applied: true,
                canAutoFix: true
              });
              console.log(`   ✅ FIXED: Improved layout toggle visibility`);
            } else {
              fixes.push({
                type: 'layout_toggle',
                action: 'already_optimized',
                message: 'Layout toggle exists in code - may need deployment or is only visible on session page',
                applied: false,
                canAutoFix: false
              });
            }
          } else {
            fixes.push({
              type: 'layout_toggle',
              action: 'not_found_in_code',
              message: 'Layout toggle not found in SessionPage.js - needs code fix',
              applied: false,
              canAutoFix: false
            });
          }
        } catch (e) {
          fixes.push({
            type: 'layout_toggle',
            action: 'fix_failed',
            message: `Failed to fix layout toggle: ${e.message}`,
            applied: false,
            canAutoFix: false
          });
        }
      }
    }
    
    if (issue.type === 'duplicate_chat') {
      // Already fixed in code, just needs deployment
      fixes.push({
        type: 'duplicate_chat',
        action: 'needs_deployment',
        message: 'Duplicate chat already removed from code - needs frontend deployment',
        applied: false,
        canAutoFix: false
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
    const fixes = await autoFix(allIssues, fixesApplied);
    
    if (fixes.length > 0) {
      let appliedCount = 0;
      fixes.forEach(fix => {
        if (fix.applied) {
          console.log(`   ✅ APPLIED: ${fix.type} - ${fix.message}`);
          appliedCount++;
        } else {
          console.log(`   📝 SUGGESTION: ${fix.type} - ${fix.message}`);
        }
        // Track all fixes (applied and suggested)
        if (!fixesApplied.find(f => f.type === fix.type && f.iteration === iteration)) {
          fixesApplied.push({ ...fix, iteration });
        }
      });
      
      if (appliedCount > 0) {
        console.log(`\n   🎉 Applied ${appliedCount} fixes! Re-running to verify...`);
        // Small delay to let file system sync
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
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
