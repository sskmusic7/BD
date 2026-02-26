#!/usr/bin/env node
/**
 * PERFECTION DETECTOR
 * Monitors all audit agents and reports when everything is perfect
 * Runs continuously, checking results from other agents
 */

const fs = require('fs');
const path = require('path');

const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '5'); // minutes
const AESTHETIC_RESULTS = path.join(__dirname, 'aesthetic-results.json');
const FUNCTIONALITY_RESULTS = path.join(__dirname, 'functionality-results.json');
const BACKEND_RESULTS = path.join(__dirname, 'backend-results.json');

let lastPerfectTime = null;
let consecutivePerfect = 0;

function checkPerfection() {
  const timestamp = new Date().toISOString();
  console.log(`\n✨ PERFECTION DETECTOR - ${timestamp}`);
  console.log('=========================================');

  const results = {
    timestamp,
    aesthetic: { status: 'unknown', lastCheck: null },
    functionality: { status: 'unknown', lastCheck: null },
    backend: { status: 'unknown', lastCheck: null },
    overall: 'unknown'
  };

  // Check Aesthetic Audit
  if (fs.existsSync(AESTHETIC_RESULTS)) {
    try {
      const aestheticData = JSON.parse(fs.readFileSync(AESTHETIC_RESULTS, 'utf8'));
      const latest = aestheticData[aestheticData.length - 1];
      if (latest) {
        results.aesthetic.status = (latest.issues.length === 0 && (latest.warnings?.length || 0) === 0) ? 'perfect' : 'issues';
        results.aesthetic.lastCheck = latest.timestamp;
        results.aesthetic.issues = latest.issues.length;
        results.aesthetic.warnings = latest.warnings?.length || 0;
        console.log(`🎨 Aesthetic: ${results.aesthetic.status === 'perfect' ? '✅ PERFECT' : '⚠️  ISSUES'} (${latest.issues.length} issues, ${latest.warnings?.length || 0} warnings)`);
      }
    } catch (e) {
      console.log('🎨 Aesthetic: ❌ No data');
    }
  } else {
    console.log('🎨 Aesthetic: ⏳ Waiting for results...');
  }

  // Check Functionality Audit
  if (fs.existsSync(FUNCTIONALITY_RESULTS)) {
    try {
      const functionalityData = JSON.parse(fs.readFileSync(FUNCTIONALITY_RESULTS, 'utf8'));
      const latest = functionalityData[functionalityData.length - 1];
      if (latest) {
        results.functionality.status = latest.issues.length === 0 ? 'perfect' : 'issues';
        results.functionality.lastCheck = latest.timestamp;
        results.functionality.issues = latest.issues.length;
        console.log(`⚙️  Functionality: ${results.functionality.status === 'perfect' ? '✅ PERFECT' : '⚠️  ISSUES'} (${latest.issues.length} issues)`);
      }
    } catch (e) {
      console.log('⚙️  Functionality: ❌ No data');
    }
  } else {
    console.log('⚙️  Functionality: ⏳ Waiting for results...');
  }

  // Check Backend Audit
  if (fs.existsSync(BACKEND_RESULTS)) {
    try {
      const backendData = JSON.parse(fs.readFileSync(BACKEND_RESULTS, 'utf8'));
      const latest = backendData[backendData.length - 1];
      if (latest) {
        results.backend.status = latest.issues.length === 0 ? 'perfect' : 'issues';
        results.backend.lastCheck = latest.timestamp;
        results.backend.issues = latest.issues.length;
        console.log(`🔌 Backend: ${results.backend.status === 'perfect' ? '✅ PERFECT' : '⚠️  ISSUES'} (${latest.issues.length} issues)`);
      }
    } catch (e) {
      console.log('🔌 Backend: ❌ No data');
    }
  } else {
    console.log('🔌 Backend: ⏳ Waiting for results...');
  }

  // Determine overall status
  const allPerfect = 
    results.aesthetic.status === 'perfect' &&
    results.functionality.status === 'perfect' &&
    results.backend.status === 'perfect';

  if (allPerfect) {
    results.overall = 'perfect';
    consecutivePerfect++;
    
    if (!lastPerfectTime) {
      lastPerfectTime = new Date();
    }
    
    const perfectDuration = Math.floor((Date.now() - lastPerfectTime.getTime()) / 1000 / 60);
    console.log('\n🎉🎉🎉 PERFECTION ACHIEVED! 🎉🎉🎉');
    console.log(`✨ All systems perfect!`);
    console.log(`📊 Consecutive perfect checks: ${consecutivePerfect}`);
    console.log(`⏱️  Perfect for: ${perfectDuration} minutes`);
    console.log('=========================================\n');
  } else {
    results.overall = 'issues';
    consecutivePerfect = 0;
    lastPerfectTime = null;
    
    console.log('\n⚠️  NOT PERFECT YET');
    console.log('Issues detected. Waiting for fixes...');
    console.log('=========================================\n');
  }

  // Save perfection log
  const logFile = path.join(__dirname, 'perfection-log.json');
  let log = [];
  if (fs.existsSync(logFile)) {
    log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  }
  log.push(results);
  if (log.length > 1000) {
    log = log.slice(-1000);
  }
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2));

  return allPerfect;
}

// Continuous monitoring
async function runMonitor() {
  while (true) {
    try {
      checkPerfection();
      
      const waitMs = CHECK_INTERVAL * 60 * 1000;
      const waitMin = Math.floor(waitMs / 60000);
      console.log(`⏳ Next check in ${waitMin} minutes...\n`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    } catch (error) {
      console.error('❌ Monitor Error:', error);
      console.log('⏳ Retrying in 1 minute...\n');
      await new Promise(resolve => setTimeout(resolve, 60 * 1000));
    }
  }
}

// Start
if (require.main === module) {
  console.log('✨ PERFECTION DETECTOR STARTED');
  console.log(`⏱️  Check Interval: ${CHECK_INTERVAL} minutes`);
  console.log('=========================================\n');
  runMonitor().catch(console.error);
}

module.exports = { checkPerfection };
