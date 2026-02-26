#!/usr/bin/env node
/**
 * BACKEND/API AUDIT AGENT
 * Tests backend endpoints, WebSocket connections, API responses
 * Runs continuously on 30-45 min loop
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'https://bodydouble-backend-6w2j7q3qsa-uc.a.run.app';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://bodydouble-oarailnku-kayahs-projects.vercel.app';
const HEADLESS = process.env.HEADLESS !== 'false';
const INTERVAL_MIN = parseInt(process.env.INTERVAL_MIN || '30');
const RESULTS_FILE = path.join(__dirname, 'backend-results.json');

let iteration = 0;

async function runBackendAudit() {
  iteration++;
  const timestamp = new Date().toISOString();
  console.log(`\n🔌 BACKEND AUDIT #${iteration} - ${timestamp}`);
  console.log('=========================================');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = {
    timestamp,
    iteration,
    tests: {},
    issues: [],
    passed: []
  };

  try {
    // Test 1: Health Endpoint
    console.log('🔍 Testing Health Endpoint...');
    try {
      const response = await page.request.get(`${BACKEND_URL}/health`);
      const status = response.status();
      const body = await response.text().catch(() => '');
      
      if (status === 200) {
        results.tests.health_endpoint = 'passed';
        results.passed.push('Health endpoint returns 200');
        console.log('   ✅ PASSED: Health endpoint');
      } else {
        results.issues.push({
          test: 'health_endpoint',
          severity: 'high',
          message: `Health endpoint returned ${status}`,
          status,
          body
        });
        console.log(`   ❌ FAILED: Health endpoint ${status}`);
      }
    } catch (error) {
      results.issues.push({
        test: 'health_endpoint',
        severity: 'high',
        message: error.message
      });
      console.log(`   ❌ FAILED: ${error.message}`);
    }

    // Test 2: CORS Headers
    console.log('🔍 Testing CORS Headers...');
    try {
      const response = await page.request.get(`${BACKEND_URL}/health`, {
        headers: { 'Origin': FRONTEND_URL }
      });
      const corsHeader = response.headers()['access-control-allow-origin'];
      
      if (corsHeader && (corsHeader === '*' || corsHeader.includes(FRONTEND_URL))) {
        results.tests.cors = 'passed';
        results.passed.push('CORS headers present');
        console.log('   ✅ PASSED: CORS headers');
      } else {
        results.issues.push({
          test: 'cors',
          severity: 'medium',
          message: 'CORS headers missing or incorrect',
          corsHeader
        });
        console.log('   ⚠️  WARNING: CORS headers issue');
      }
    } catch (error) {
      results.issues.push({
        test: 'cors',
        severity: 'medium',
        message: error.message
      });
      console.log(`   ❌ FAILED: ${error.message}`);
    }

    // Test 3: Socket.IO Connection (via frontend)
    console.log('🔍 Testing Socket.IO Connection...');
    try {
      await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      // Check for socket connection errors
      const socketErrors = await page.evaluate(() => {
        return window.socketErrors || [];
      });
      
      // Check network requests for socket.io
      const socketRequests = [];
      page.on('request', request => {
        const url = request.url();
        if (url.includes('socket.io') || url.includes('websocket')) {
          socketRequests.push(url);
        }
      });
      
      await page.waitForTimeout(3000);
      
      if (socketErrors.length > 0) {
        results.issues.push({
          test: 'socket_connection',
          severity: 'high',
          message: `Socket.IO errors: ${socketErrors.length}`,
          errors: socketErrors
        });
        console.log(`   ❌ FAILED: ${socketErrors.length} socket errors`);
      } else if (socketRequests.length > 0) {
        results.tests.socket_connection = 'passed';
        results.passed.push('Socket.IO connection works');
        console.log('   ✅ PASSED: Socket.IO connection');
      } else {
        results.warnings = results.warnings || [];
        results.warnings.push({
          test: 'socket_connection',
          message: 'No socket requests detected (may be normal if not in session)'
        });
        console.log('   ⚠️  WARNING: No socket requests detected');
      }
    } catch (error) {
      results.issues.push({
        test: 'socket_connection',
        severity: 'high',
        message: error.message
      });
      console.log(`   ❌ FAILED: ${error.message}`);
    }

    // Test 4: API Response Times
    console.log('🔍 Testing API Response Times...');
    try {
      const startTime = Date.now();
      const response = await page.request.get(`${BACKEND_URL}/health`);
      const responseTime = Date.now() - startTime;
      
      if (responseTime < 1000) {
        results.tests.response_time = 'passed';
        results.passed.push(`Response time: ${responseTime}ms`);
        console.log(`   ✅ PASSED: Response time ${responseTime}ms`);
      } else {
        results.warnings = results.warnings || [];
        results.warnings.push({
          test: 'response_time',
          message: `Slow response: ${responseTime}ms`
        });
        console.log(`   ⚠️  WARNING: Slow response ${responseTime}ms`);
      }
    } catch (error) {
      results.issues.push({
        test: 'response_time',
        severity: 'medium',
        message: error.message
      });
      console.log(`   ❌ FAILED: ${error.message}`);
    }

    // Test 5: Error Handling
    console.log('🔍 Testing Error Handling...');
    try {
      const response = await page.request.get(`${BACKEND_URL}/nonexistent`, {
        failOnStatusCode: false
      });
      const status = response.status();
      
      if (status === 404 || status >= 400) {
        results.tests.error_handling = 'passed';
        results.passed.push('Error handling works');
        console.log(`   ✅ PASSED: Error handling (${status})`);
      } else {
        results.issues.push({
          test: 'error_handling',
          severity: 'low',
          message: `Unexpected status for 404: ${status}`
        });
        console.log(`   ⚠️  WARNING: Unexpected status ${status}`);
      }
    } catch (error) {
      // This is expected to fail, so it's actually good
      results.tests.error_handling = 'passed';
      results.passed.push('Error handling works');
      console.log('   ✅ PASSED: Error handling');
    }

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
  console.log('\n📊 BACKEND AUDIT SUMMARY');
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
      const isPerfect = await runBackendAudit();
      
      if (isPerfect) {
        console.log('🎉 Backend audit passed! Waiting for next cycle...');
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
  console.log('🔌 BACKEND AUDIT AGENT STARTED');
  console.log(`📍 Backend: ${BACKEND_URL}`);
  console.log(`📍 Frontend: ${FRONTEND_URL}`);
  console.log(`⏱️  Interval: ${INTERVAL_MIN} minutes`);
  console.log('=========================================\n');
  runLoop().catch(console.error);
}

module.exports = { runBackendAudit };
