#!/usr/bin/env node
/**
 * AESTHETIC AUDIT AGENT
 * Checks for visual issues: duplicate elements, layout problems, styling issues
 * Runs continuously on 30-45 min loop
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://bodydouble-oarailnku-kayahs-projects.vercel.app';
const HEADLESS = process.env.HEADLESS !== 'false';
const INTERVAL_MIN = parseInt(process.env.INTERVAL_MIN || '30');
const RESULTS_FILE = path.join(__dirname, 'aesthetic-results.json');

let iteration = 0;

async function runAestheticAudit() {
  iteration++;
  const timestamp = new Date().toISOString();
  console.log(`\n🎨 AESTHETIC AUDIT #${iteration} - ${timestamp}`);
  console.log('=========================================');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const results = {
    timestamp,
    iteration,
    issues: [],
    warnings: [],
    passed: []
  };

  try {
    // Navigate to home
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Test 1: Check for duplicate chat boxes
    console.log('🔍 Checking for duplicate chat boxes...');
    const chatSelectors = [
      '[class*="chat" i]',
      '[class*="message" i]',
      'text=/Chat/i'
    ];
    
    let chatCount = 0;
    for (const selector of chatSelectors) {
      try {
        const count = await page.locator(selector).count();
        chatCount = Math.max(chatCount, count);
      } catch (e) {
        // Ignore selector errors
      }
    }
    
    if (chatCount > 1) {
      results.issues.push({
        type: 'duplicate_chat',
        severity: 'high',
        message: `Found ${chatCount} chat elements (possible duplication)`,
        count: chatCount
      });
      console.log(`   ❌ ISSUE: Found ${chatCount} chat elements`);
    } else {
      results.passed.push('No duplicate chat boxes');
      console.log('   ✅ PASSED: Chat appears once');
    }

    // Test 2: Check for duplicate buttons
    console.log('🔍 Checking for duplicate buttons...');
    const buttonTexts = await page.locator('button').allTextContents();
    const buttonCounts = {};
    buttonTexts.forEach(text => {
      const key = text.trim().toLowerCase();
      buttonCounts[key] = (buttonCounts[key] || 0) + 1;
    });
    
    const duplicates = Object.entries(buttonCounts).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      results.warnings.push({
        type: 'duplicate_buttons',
        message: `Found duplicate buttons: ${duplicates.map(([text]) => text).join(', ')}`,
        duplicates
      });
      console.log(`   ⚠️  WARNING: Duplicate buttons found`);
    } else {
      results.passed.push('No duplicate buttons');
      console.log('   ✅ PASSED: No duplicate buttons');
    }

    // Test 3: Check for duplicate images
    console.log('🔍 Checking for duplicate images...');
    const images = await page.locator('img').all();
    const imageSrcs = [];
    for (const img of images) {
      try {
        const src = await img.getAttribute('src');
        if (src) imageSrcs.push(src);
      } catch (e) {}
    }
    
    const imageCounts = {};
    imageSrcs.forEach(src => {
      imageCounts[src] = (imageCounts[src] || 0) + 1;
    });
    
    const duplicateImages = Object.entries(imageCounts).filter(([_, count]) => count > 1);
    if (duplicateImages.length > 0) {
      results.warnings.push({
        type: 'duplicate_images',
        message: `Found duplicate images: ${duplicateImages.length} sources repeated`,
        duplicates: duplicateImages
      });
      console.log(`   ⚠️  WARNING: ${duplicateImages.length} duplicate image sources`);
    } else {
      results.passed.push('No duplicate images');
      console.log('   ✅ PASSED: No duplicate images');
    }

    // Test 4: Check layout toggle visibility
    console.log('🔍 Checking layout toggle visibility...');
    const layoutButtons = await page.locator('button[title*="layout" i], button[title*="Layout" i]').count();
    if (layoutButtons === 0) {
      results.issues.push({
        type: 'missing_layout_toggle',
        severity: 'medium',
        message: 'Layout toggle buttons not found'
      });
      console.log('   ❌ ISSUE: Layout toggle buttons not visible');
    } else {
      results.passed.push(`Layout toggle buttons visible (${layoutButtons} found)`);
      console.log(`   ✅ PASSED: ${layoutButtons} layout buttons found`);
    }

    // Test 5: Check background visibility
    console.log('🔍 Checking background visibility...');
    const hasBackground = await page.evaluate(() => {
      const body = document.body;
      const style = window.getComputedStyle(body);
      return style.backgroundImage !== 'none' && style.backgroundImage !== '';
    });
    
    if (!hasBackground) {
      results.warnings.push({
        type: 'background_not_visible',
        message: 'Background may not be visible on body'
      });
      console.log('   ⚠️  WARNING: Background may not be visible');
    } else {
      results.passed.push('Background is visible');
      console.log('   ✅ PASSED: Background is visible');
    }

    // Test 6: Check for overlapping elements
    console.log('🔍 Checking for overlapping elements...');
    const overlapping = await page.evaluate(() => {
      const elements = document.querySelectorAll('div, section, main');
      const overlaps = [];
      for (let i = 0; i < Math.min(elements.length, 20); i++) {
        for (let j = i + 1; j < Math.min(elements.length, 20); j++) {
          const rect1 = elements[i].getBoundingClientRect();
          const rect2 = elements[j].getBoundingClientRect();
          if (rect1.top < rect2.bottom && rect1.bottom > rect2.top &&
              rect1.left < rect2.right && rect1.right > rect2.left) {
            overlaps.push({ el1: elements[i].className, el2: elements[j].className });
          }
        }
      }
      return overlaps;
    });
    
    if (overlapping.length > 10) {
      results.warnings.push({
        type: 'overlapping_elements',
        message: `Found ${overlapping.length} potential overlapping elements`,
        count: overlapping.length
      });
      console.log(`   ⚠️  WARNING: ${overlapping.length} overlapping elements`);
    } else {
      results.passed.push('No significant overlapping elements');
      console.log('   ✅ PASSED: No overlapping issues');
    }

    // Screenshot
    await page.screenshot({ path: path.join(__dirname, `aesthetic-screenshot-${iteration}.png`), fullPage: true });

  } catch (error) {
    results.issues.push({
      type: 'audit_error',
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
  // Keep only last 100 results
  if (allResults.length > 100) {
    allResults = allResults.slice(-100);
  }
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));

  // Print summary
  console.log('\n📊 AESTHETIC AUDIT SUMMARY');
  console.log('=========================================');
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);
  console.log(`❌ Issues: ${results.issues.length}`);
  
  if (results.issues.length > 0) {
    console.log('\n❌ ISSUES:');
    results.issues.forEach(issue => {
      console.log(`   - [${issue.severity?.toUpperCase() || 'MEDIUM'}] ${issue.message}`);
    });
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(warning => {
      console.log(`   - ${warning.message}`);
    });
  }

  const isPerfect = results.issues.length === 0 && results.warnings.length === 0;
  console.log(`\n${isPerfect ? '✨ PERFECT!' : '⚠️  Needs attention'}`);
  console.log('=========================================\n');

  return isPerfect;
}

// Continuous loop
async function runLoop() {
  while (true) {
    try {
      const isPerfect = await runAestheticAudit();
      
      if (isPerfect) {
        console.log('🎉 Aesthetic audit passed! Waiting for next cycle...');
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
  console.log('🎨 AESTHETIC AUDIT AGENT STARTED');
  console.log(`📍 Target: ${BASE_URL}`);
  console.log(`⏱️  Interval: ${INTERVAL_MIN} minutes`);
  console.log('=========================================\n');
  runLoop().catch(console.error);
}

module.exports = { runAestheticAudit };
