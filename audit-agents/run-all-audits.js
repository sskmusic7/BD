#!/usr/bin/env node
/**
 * RUN ALL AUDITS
 * Starts all audit agents in parallel
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting All Audit Agents...\n');

const agents = [
  { name: 'Aesthetic', script: path.join(__dirname, 'aesthetic-audit.js') },
  { name: 'Functionality', script: path.join(__dirname, 'functionality-audit.js') },
  { name: 'Backend', script: path.join(__dirname, 'backend-audit.js') },
  { name: 'Perfection Detector', script: path.join(__dirname, 'perfection-detector.js') }
];

const processes = agents.map(agent => {
  console.log(`▶️  Starting ${agent.name} agent...`);
  const proc = spawn('node', [agent.script], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  proc.on('error', (error) => {
    console.error(`❌ ${agent.name} agent error:`, error);
  });
  
  proc.on('exit', (code) => {
    console.log(`⚠️  ${agent.name} agent exited with code ${code}`);
  });
  
  return { name: agent.name, process: proc };
});

console.log('\n✅ All agents started!\n');
console.log('Press Ctrl+C to stop all agents\n');

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping all agents...');
  processes.forEach(({ name, process }) => {
    console.log(`   Stopping ${name}...`);
    process.kill();
  });
  setTimeout(() => {
    console.log('✅ All agents stopped');
    process.exit(0);
  }, 2000);
});
