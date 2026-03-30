import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';

const BASE_URL = process.env.BASE_URL || 'https://bodydoubleapp.com';
// Extract server URL from BASE_URL or use default
const SERVER_URL = process.env.SERVER_URL || 'https://bodydouble-backend-x2x4tp5wra-uc.a.run.app';

test.describe('Direct Socket Connection Debug', () => {
  test('direct socket.io test - bypass frontend', async () => {
    console.log('\n=== Direct Socket Test ===');
    console.log('Server URL:', SERVER_URL);

    // Create two direct socket connections
    const socket1 = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: false
    });

    const socket2 = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: false
    });

    const events1 = [];
    const events2 = [];

    // Track all events on socket1
    socket1.on('connect', () => {
      console.log('Socket 1 connected:', socket1.id);
      events1.push('connect');
    });

    socket1.on('disconnect', () => {
      console.log('Socket 1 disconnected');
      events1.push('disconnect');
    });

    socket1.on('joined', (data) => {
      console.log('Socket 1 joined:', data);
      events1.push('joined');
    });

    socket1.on('waiting-for-partner', () => {
      console.log('Socket 1: waiting-for-partner');
      events1.push('waiting-for-partner');
    });

    socket1.on('partner-found', (data) => {
      console.log('Socket 1: PARTNER FOUND!', data);
      events1.push('partner-found');
    });

    socket1.on('search-cancelled', () => {
      console.log('Socket 1: search-cancelled');
      events1.push('search-cancelled');
    });

    socket1.on('error', (err) => {
      console.log('Socket 1 error:', err);
      events1.push('error: ' + err);
    });

    // Track all events on socket2
    socket2.on('connect', () => {
      console.log('Socket 2 connected:', socket2.id);
      events2.push('connect');
    });

    socket2.on('disconnect', () => {
      console.log('Socket 2 disconnected');
      events2.push('disconnect');
    });

    socket2.on('joined', (data) => {
      console.log('Socket 2 joined:', data);
      events2.push('joined');
    });

    socket2.on('waiting-for-partner', () => {
      console.log('Socket 2: waiting-for-partner');
      events2.push('waiting-for-partner');
    });

    socket2.on('partner-found', (data) => {
      console.log('Socket 2: PARTNER FOUND!', data);
      events2.push('partner-found');
    });

    socket2.on('search-cancelled', () => {
      console.log('Socket 2: search-cancelled');
      events2.push('search-cancelled');
    });

    socket2.on('error', (err) => {
      console.log('Socket 2 error:', err);
      events2.push('error: ' + err);
    });

    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n--- Both sockets should be connected now ---');
    console.log('Socket 1 connected:', socket1.connected);
    console.log('Socket 2 connected:', socket2.connected);

    // User 1 joins
    console.log('\n--- User 1 joining ---');
    socket1.emit('join', {
      name: 'Test User 1',
      focusStyle: 'Body Doubling',
      workType: 'Creative Work',
      sessionLength: '25 minutes',
      adhdType: 'Inattentive'
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // User 2 joins
    console.log('\n--- User 2 joining ---');
    socket2.emit('join', {
      name: 'Test User 2',
      focusStyle: 'Body Doubling',
      workType: 'Creative Work',
      sessionLength: '25 minutes',
      adhdType: 'Inattentive'
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n--- Events after join ---');
    console.log('Socket 1 events:', events1);
    console.log('Socket 2 events:', events2);

    // User 1 searches
    console.log('\n--- User 1 searching for partner ---');
    socket1.emit('find-partner');

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n--- Events after User 1 search ---');
    console.log('Socket 1 events:', events1);
    console.log('Socket 2 events:', events2);

    // User 2 searches (should trigger match)
    console.log('\n--- User 2 searching for partner (should match) ---');
    socket2.emit('find-partner');

    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\n--- Events after User 2 search ---');
    console.log('Socket 1 events:', events1);
    console.log('Socket 2 events:', events2);

    // Check final state
    const socket1HasPartner = events1.includes('partner-found');
    const socket2HasPartner = events2.includes('partner-found');

    console.log('\n=== Final Results ===');
    console.log('Socket 1 found partner:', socket1HasPartner);
    console.log('Socket 2 found partner:', socket2HasPartner);

    // Close sockets
    socket1.disconnect();
    socket2.disconnect();

    // Test assertions
    expect(events1).toContain('joined');
    expect(events2).toContain('joined');

    // At least one should have found a partner
    expect(socket1HasPartner || socket2HasPartner).toBe(true);

    // If they matched, both should have partner-found
    if (socket1HasPartner || socket2HasPartner) {
      expect(socket1HasPartner).toBe(true);
      expect(socket2HasPartner).toBe(true);
    }
  });

  test('check server stats', async () => {
    console.log('\n=== Server Stats Check ===');

    const response = await fetch(`${SERVER_URL}/api/stats`);
    const stats = await response.json();

    console.log('Server stats:', stats);
    console.log('Online users:', stats.onlineUsers);
    console.log('Active sessions:', stats.activeSessions);
    console.log('Waiting users:', stats.waitingUsers);

    expect(stats).toBeDefined();
  });
});
