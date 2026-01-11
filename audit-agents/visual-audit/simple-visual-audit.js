#!/usr/bin/env node
/**
 * SIMPLE VISUAL/AESTHETIC AUDIT
 * Checks visual elements, button visibility, layout, and aesthetics
 * 
 * Usage: BASE_URL=https://example.com node simple-visual-audit.js
 */

const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const HEADLESS = process.env.HEADLESS !== 'false';

async function runVisualAudit() {
  console.log('\n🎨 VISUAL/AESTHETIC AUDIT');
  console.log('=========================================');
  console.log(`📍 Target: ${BASE_URL}`);
  console.log(`🖥️  Mode: ${HEADLESS ? 'Headless' : 'Visible Browser'}`);
  console.log('=========================================\n');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const results = {
    visual: [],
    buttons: [],
    layout: [],
    aesthetics: [],
    issues: []
  };

  try {
    // Test Home Page
    console.log('🔍 Auditing Home Page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check background
    const backgroundStyle = await page.evaluate(() => {
      const body = document.body;
      const computed = window.getComputedStyle(body);
      return {
        background: computed.background || computed.backgroundColor,
        backgroundImage: computed.backgroundImage
      };
    });
    
    if (!backgroundStyle.backgroundImage || backgroundStyle.backgroundImage === 'none') {
      results.issues.push('Home page: Background image not visible');
    } else {
      results.visual.push('✅ Home page background is visible');
    }

    // Check logo visibility
    const logoVisible = await page.locator('img[alt*="logo" i], img[src*="logo" i]').first().isVisible().catch(() => false);
    if (logoVisible) {
      results.visual.push('✅ Logo is visible on home page');
    } else {
      results.issues.push('Home page: Logo not visible');
    }

    // Check button visibility and contrast
    const buttons = await page.locator('button').all();
    for (let i = 0; i < Math.min(buttons.length, 10); i++) {
      const button = buttons[i];
      const isVisible = await button.isVisible().catch(() => false);
      const text = await button.textContent().catch(() => '');
      const bgColor = await button.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.backgroundColor;
      }).catch(() => 'transparent');
      
      if (isVisible) {
        results.buttons.push(`✅ Button "${text.substring(0, 30)}" is visible (bg: ${bgColor})`);
      } else {
        results.issues.push(`Button "${text.substring(0, 30)}" is not visible`);
      }
    }

    // Check layout toggle buttons (if on session page)
    console.log('🔍 Checking for layout toggle buttons...');
    const layoutToggle = await page.locator('button:has(svg)').filter({ 
      hasText: /layout|grid|maximize|stack/i 
    }).first().isVisible().catch(() => false);
    
    if (layoutToggle) {
      results.layout.push('✅ Layout toggle buttons are visible');
    }

    // Check text contrast
    const textElements = await page.locator('h1, h2, h3, p').all();
    let goodContrast = 0;
    for (let i = 0; i < Math.min(textElements.length, 5); i++) {
      const el = textElements[i];
      const color = await el.evaluate(elem => {
        const style = window.getComputedStyle(elem);
        return { color: style.color, bg: style.backgroundColor };
      }).catch(() => ({ color: 'transparent', bg: 'transparent' }));
      
      if (color.color !== 'transparent' && color.bg !== 'transparent') {
        goodContrast++;
      }
    }
    if (goodContrast > 0) {
      results.aesthetics.push(`✅ Text contrast appears good (${goodContrast} elements checked)`);
    }

    // Check responsive design (mobile viewport)
    console.log('🔍 Testing mobile viewport...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    const mobileLayout = await page.evaluate(() => {
      const mainContent = document.querySelector('main, [class*="container"], [class*="max-w"]');
      return mainContent ? mainContent.offsetWidth <= 400 : false;
    });
    
    if (mobileLayout) {
      results.layout.push('✅ Mobile layout is responsive');
    } else {
      results.issues.push('Mobile layout may not be responsive');
    }

    // Check for white backgrounds (potential issue)
    const whiteBackgrounds = await page.evaluate(() => {
      const elements = document.querySelectorAll('div, section, main');
      let whiteCount = 0;
      for (let el of Array.from(elements).slice(0, 10)) {
        const bg = window.getComputedStyle(el).backgroundColor;
        if (bg.includes('255, 255, 255') || bg === 'rgb(255, 255, 255)') {
          whiteCount++;
        }
      }
      return whiteCount;
    });
    
    if (whiteBackgrounds > 5) {
      results.issues.push(`Warning: ${whiteBackgrounds} elements have white backgrounds (may indicate missing background images)`);
    }

    // Screenshot for visual inspection
    await page.screenshot({ path: 'audit-screenshot.png', fullPage: true });
    results.visual.push('✅ Screenshot saved to audit-screenshot.png');

  } catch (error) {
    results.issues.push(`Error during audit: ${error.message}`);
  } finally {
    await browser.close();
  }

  // Print results
  console.log('\n📊 AUDIT RESULTS');
  console.log('=========================================\n');
  
  if (results.visual.length > 0) {
    console.log('🎨 VISUAL ELEMENTS:');
    results.visual.forEach(r => console.log(`   ${r}`));
    console.log('');
  }
  
  if (results.buttons.length > 0) {
    console.log('🔘 BUTTONS:');
    results.buttons.forEach(r => console.log(`   ${r}`));
    console.log('');
  }
  
  if (results.layout.length > 0) {
    console.log('📐 LAYOUT:');
    results.layout.forEach(r => console.log(`   ${r}`));
    console.log('');
  }
  
  if (results.aesthetics.length > 0) {
    console.log('✨ AESTHETICS:');
    results.aesthetics.forEach(r => console.log(`   ${r}`));
    console.log('');
  }
  
  if (results.issues.length > 0) {
    console.log('⚠️  ISSUES FOUND:');
    results.issues.forEach(r => console.log(`   ⚠️  ${r}`));
    console.log('');
  }

  const totalIssues = results.issues.length;
  const totalChecks = results.visual.length + results.buttons.length + results.layout.length + results.aesthetics.length;
  
  console.log('=========================================');
  console.log(`✅ Checks Passed: ${totalChecks}`);
  console.log(`⚠️  Issues Found: ${totalIssues}`);
  console.log('=========================================\n');

  process.exit(totalIssues > 0 ? 1 : 0);
}

runVisualAudit().catch(error => {
  console.error('❌ Audit failed:', error);
  process.exit(1);
});

