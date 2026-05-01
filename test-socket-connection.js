// Test script to debug socket connection with the deployed server
const io = require('socket.io-client');

const SERVER_URL = 'https://bodydouble-backend-x2x4tp5wra-uc.a.run.app';

console.log('=== Testing Socket Connection ===');
console.log('Server:', SERVER_URL);

// Create two socket connections
const socket1 = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true
});

const socket2 = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true
});

let socket1Ready = false;
let socket2Ready = false;
let socket1User = null;
let socket2User = null;

const EVENTS = [];

function logEvent(socketNum, event, data) {
  const entry = { socket: socketNum, event, data, time: Date.now() };
  EVENTS.push(entry);
  console.log(`[Socket ${socketNum}] ${event}:`, JSON.stringify(data).substring(0, 100));
}

socket1.on('connect', () => {
  console.log('\n=== Socket 1 Connected ===');
  logEvent(1, 'connect', { id: socket1.id });
  socket1Ready = true;

  // Join with profile
  socket1User = {
    name: 'Test User 1',
    focusStyle: 'Body Doubling',
    workType: 'Creative Work',
    sessionLength: '25 minutes',
    adhdType: 'Inattentive'
  };
  socket1.emit('join', socket1User);
});

socket1.on('joined', (data) => {
  console.log('[Socket 1] Joined:', data);
  logEvent(1, 'joined', data);
  socket1User = data.user;
});

socket1.on('waiting-for-partner', () => {
  console.log('[Socket 1] Waiting for partner...');
  logEvent(1, 'waiting-for-partner', null);

  // After User 1 is waiting, have User 2 click find-partner
  setTimeout(() => {
    console.log('\n=== User 2 clicking find-partner ===');
    socket2.emit('find-partner');
  }, 2000);
});

socket1.on('partner-found', (data) => {
  console.log('[Socket 1] Partner found!', data);
  logEvent(1, 'partner-found', data);
});

socket1.on('disconnect', () => {
  console.log('[Socket 1] Disconnected');
  logEvent(1, 'disconnect', null);
});

socket1.on('error', (error) => {
  console.error('[Socket 1] Error:', error);
  logEvent(1, 'error', error);
});

socket2.on('connect', () => {
  console.log('\n=== Socket 2 Connected ===');
  logEvent(2, 'connect', { id: socket2.id });
  socket2Ready = true;

  // Join with profile
  socket2User = {
    name: 'Test User 2',
    focusStyle: 'Body Doubling',
    workType: 'Creative Work',
    sessionLength: '25 minutes',
    adhdType: 'Inattentive'
  };
  socket2.emit('join', socket2User);
});

socket2.on('joined', (data) => {
  console.log('[Socket 2] Joined:', data);
  logEvent(2, 'joined', data);
  socket2User = data.user;
});

socket2.on('waiting-for-partner', () => {
  console.log('[Socket 2] Waiting for partner...');
  logEvent(2, 'waiting-for-partner', null);
});

socket2.on('partner-found', (data) => {
  console.log('[Socket 2] Partner found!', data);
  logEvent(2, 'partner-found', data);
});

socket2.on('disconnect', () => {
  console.log('[Socket 2] Disconnected');
  logEvent(2, 'disconnect', null);
});

socket2.on('error', (error) => {
  console.error('[Socket 2] Error:', error);
  logEvent(2, 'error', error);
});

// Wait for both sockets to connect, then have User 1 click find-partner
setTimeout(() => {
  if (socket1Ready && socket2Ready) {
    console.log('\n=== Both sockets ready, User 1 clicking find-partner ===');
    socket1.emit('find-partner');
  } else {
    console.log('\n=== Not all sockets ready ===');
    console.log('Socket 1 ready:', socket1Ready);
    console.log('Socket 2 ready:', socket2Ready);
  }
}, 5000);

// Print all events after 15 seconds
setTimeout(() => {
  console.log('\n=== All Events Summary ===');
  EVENTS.forEach((e, i) => {
    console.log(`${i}. [Socket ${e.socket}] ${e.event}`, e.data ? JSON.stringify(e.data).substring(0, 50) : '');
  });

  console.log('\n=== Test Complete ===');
  process.exit(0);
}, 15000);
