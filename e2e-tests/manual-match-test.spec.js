import { test } from '@playwright/test';
import { io } from 'socket.io-client';

const SERVER_URL = 'https://bodydouble-backend-x2x4tp5wra-uc.a.run.app';

test('Manual matching test - step by step', async () => {
  console.log('\n=== MANUAL MATCHING TEST ===');

  const socket1 = io(SERVER_URL, { reconnection: false });
  const socket2 = io(SERVER_URL, { reconnection: false });

  const events1 = { all: [] };
  const events2 = { all: [] };

  const log1 = (msg) => { console.log(`[User 1] ${msg}`); events1.all.push(msg); };
  const log2 = (msg) => { console.log(`[User 2] ${msg}`); events2.all.push(msg); };

  socket1.on('connect', () => log1('Connected'));
  socket2.on('connect', () => log2('Connected'));

  socket1.on('joined', (data) => log1(`Joined: ${data.user?.name}`));
  socket2.on('joined', (data) => log2(`Joined: ${data.user?.name}`));

  socket1.on('waiting-for-partner', () => log1('WAITING FOR PARTNER'));
  socket2.on('waiting-for-partner', () => log2('WAITING FOR PARTNER'));

  socket1.on('partner-found', (data) => log1(`PARTNER FOUND: ${data.partner?.name}`));
  socket2.on('partner-found', (data) => log2(`PARTNER FOUND: ${data.partner?.name}`));

  // Wait for both to connect
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n--- Both connected, joining ---');
  socket1.emit('join', { name: 'User 1', focusStyle: 'Body Doubling', workType: 'Work', sessionLength: '25', adhdType: 'Inattentive' });
  socket2.emit('join', { name: 'User 2', focusStyle: 'Body Doubling', workType: 'Work', sessionLength: '25', adhdType: 'Inattentive' });

  await new Promise(r => setTimeout(r, 2000));

  console.log('\n--- User 1 searching ---');
  socket1.emit('find-partner');

  await new Promise(r => setTimeout(r, 2000));

  console.log('\n--- User 2 searching (should match) ---');
  socket2.emit('find-partner');

  await new Promise(r => setTimeout(r, 5000));

  console.log('\n=== FINAL RESULTS ===');
  console.log('User 1 events:', events1.all);
  console.log('User 2 events:', events2.all);

  const user1Found = events1.all.some(e => e.includes('PARTNER FOUND'));
  const user2Found = events2.all.some(e => e.includes('PARTNER FOUND'));

  console.log(`\nUser 1 found partner: ${user1Found}`);
  console.log(`User 2 found partner: ${user2Found}`);

  socket1.disconnect();
  socket2.disconnect();

  expect(user1Found && user2Found).toBe(true);
});
