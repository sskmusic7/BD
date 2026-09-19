/**
 * Tests for the push *suppression* rules. Sending is the easy part; the
 * value is in not sending — four triggers across a handful of users is a
 * spam machine without these, and every rule here exists because of a
 * specific way it could annoy someone.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPush } = require('../push');

const SUBSCRIPTION = { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } };

// Midday UTC. Cooldown tests must sit OUTSIDE the default 23:00-08:00 quiet
// window, or quiet hours suppress everything and the test passes for the
// wrong reason.
const MIDDAY = Date.parse('2026-09-19T12:00:00Z');

function setup({ connected = [], now = () => Date.now(), senderImpl } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-push-'));
  process.env.VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';

  const sent = [];
  const sender = senderImpl || ((subscription, payload) => {
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
    return Promise.resolve();
  });

  const push = createPush({
    dataDir,
    getConnectedUserIds: () => new Set(connected),
    sender,
    now,
    log: { error: () => {}, log: () => {} },
  });

  return { push, sent, dataDir };
}

function subscribe(push, userId, timezone = 'UTC') {
  const routes = {};
  push.registerRoutes({
    get: (p, h) => { routes['GET ' + p] = h; },
    post: (p, h) => { routes['POST ' + p] = h; },
  });
  const res = { json: () => {}, status: () => ({ json: () => {} }) };
  routes['POST /api/push/subscribe']({ body: { userId, subscription: SUBSCRIPTION, timezone } }, res);
  return routes;
}

describe('push suppression rules', () => {
  test('notifies a subscribed user who is away', async () => {
    const { push, sent } = setup();
    subscribe(push, 'alice');

    const notified = await push.notify({
      type: 'partnerWaiting', recipientIds: ['alice'], title: 'T', body: 'B',
    });

    expect(notified).toEqual(['alice']);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.title).toBe('T');
  });

  test('never notifies the person who caused the event', async () => {
    const { push, sent } = setup();
    subscribe(push, 'alice');

    const notified = await push.notify({
      type: 'partnerWaiting', recipientIds: ['alice'], excludeUserIds: ['alice'],
      title: 'T', body: 'B',
    });

    expect(notified).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  test('skips someone who already has the app open', async () => {
    const { push, sent } = setup({ connected: ['alice'] });
    subscribe(push, 'alice');

    await push.notify({ type: 'partnerWaiting', recipientIds: ['alice'], title: 'T', body: 'B' });

    expect(sent).toHaveLength(0);
    expect(push.shouldNotify('alice', 'partnerWaiting', { connectedUserIds: new Set(['alice']) }).reason)
      .toBe('already-connected');
  });

  test('a second push of the same type is suppressed by the cooldown', async () => {
    let clock = MIDDAY;
    const { push, sent } = setup({ now: () => clock });
    subscribe(push, 'alice');

    await push.notify({ type: 'partnerWaiting', recipientIds: ['alice'], title: 'T', body: 'B' });
    clock += 60 * 1000; // a minute later
    await push.notify({ type: 'partnerWaiting', recipientIds: ['alice'], title: 'T2', body: 'B' });

    expect(sent).toHaveLength(1);

    clock += 31 * 60 * 1000; // past the 30 minute window
    await push.notify({ type: 'partnerWaiting', recipientIds: ['alice'], title: 'T3', body: 'B' });
    expect(sent).toHaveLength(2);
  });

  test('a different trigger is still suppressed by the global cooldown', async () => {
    // "someone is waiting" and "someone came online" both fire for a single
    // arrival — without this rule that's two buzzes for one event.
    let clock = MIDDAY;
    const { push, sent } = setup({ now: () => clock });
    subscribe(push, 'alice');

    await push.notify({ type: 'partnerWaiting', recipientIds: ['alice'], title: 'A', body: 'B' });
    clock += 2000;
    await push.notify({ type: 'someoneOnline', recipientIds: ['alice'], title: 'C', body: 'D' });

    expect(sent).toHaveLength(1);
    expect(sent[0].payload.title).toBe('A');
  });

  test('respects a per-trigger toggle', async () => {
    const { push, sent } = setup();
    const routes = subscribe(push, 'alice');
    routes['POST /api/push/preferences'](
      { body: { userId: 'alice', preferences: { partnerWaiting: false } } },
      { json: () => {}, status: () => ({ json: () => {} }) }
    );

    await push.notify({ type: 'partnerWaiting', recipientIds: ['alice'], title: 'T', body: 'B' });
    expect(sent).toHaveLength(0);

    // A different trigger still gets through.
    await push.notify({ type: 'inviteOpened', recipientIds: ['alice'], title: 'T', body: 'B' });
    expect(sent).toHaveLength(1);
  });

  test('quiet hours are evaluated in the recipient own timezone', async () => {
    // 03:00 UTC — the middle of the night in London, but 11am in Tokyo.
    const threeAmUtc = Date.parse('2026-09-19T03:00:00Z');
    const { push, sent } = setup({ now: () => threeAmUtc });

    subscribe(push, 'london', 'Europe/London');
    subscribe(push, 'tokyo', 'Asia/Tokyo');

    // Checked before sending — a delivery starts a cooldown that would mask
    // the reason we actually care about here.
    expect(push.shouldNotify('london', 'partnerWaiting').reason).toBe('quiet-hours');
    expect(push.shouldNotify('tokyo', 'partnerWaiting').reason).toBe('ok');

    const notified = await push.notify({
      type: 'partnerWaiting', recipientIds: ['london', 'tokyo'], title: 'T', body: 'B',
    });

    expect(notified).toEqual(['tokyo']);
    expect(sent).toHaveLength(1);
  });

  test('quiet hours can be turned off', async () => {
    const threeAmUtc = Date.parse('2026-09-19T03:00:00Z');
    const { push } = setup({ now: () => threeAmUtc });
    const routes = subscribe(push, 'london', 'Europe/London');

    expect(push.shouldNotify('london', 'partnerWaiting').reason).toBe('quiet-hours');

    routes['POST /api/push/preferences'](
      { body: { userId: 'london', preferences: { quietHours: { enabled: false } } } },
      { json: () => {}, status: () => ({ json: () => {} }) }
    );

    expect(push.shouldNotify('london', 'partnerWaiting').reason).toBe('ok');
  });

  test('a dead subscription is evicted after the push service rejects it', async () => {
    const gone = Object.assign(new Error('gone'), { statusCode: 410 });
    const { push } = setup({ senderImpl: () => Promise.reject(gone) });
    subscribe(push, 'alice');

    expect(push.subscribedUserIds()).toEqual(['alice']);

    await push.notify({ type: 'partnerWaiting', recipientIds: ['alice'], title: 'T', body: 'B' });

    // Dropped, so it isn't retried forever.
    expect(push.subscribedUserIds()).toEqual([]);
  });

  test('a transient failure does NOT evict the subscription', async () => {
    const boom = Object.assign(new Error('server error'), { statusCode: 500 });
    const { push } = setup({ senderImpl: () => Promise.reject(boom) });
    subscribe(push, 'alice');

    await push.notify({ type: 'partnerWaiting', recipientIds: ['alice'], title: 'T', body: 'B' });

    expect(push.subscribedUserIds()).toEqual(['alice']);
  });

  test('re-subscribing the same device does not duplicate it', async () => {
    const { push, sent } = setup();
    subscribe(push, 'alice');
    subscribe(push, 'alice');

    await push.notify({ type: 'partnerWaiting', recipientIds: ['alice'], title: 'T', body: 'B' });
    expect(sent).toHaveLength(1);
  });

  test('unsubscribing stops delivery', async () => {
    const { push, sent } = setup();
    const routes = subscribe(push, 'alice');
    routes['POST /api/push/unsubscribe'](
      { body: { userId: 'alice', endpoint: SUBSCRIPTION.endpoint } },
      { json: () => {} }
    );

    await push.notify({ type: 'partnerWaiting', recipientIds: ['alice'], title: 'T', body: 'B' });
    expect(sent).toHaveLength(0);
  });

  test('subscriptions survive a restart', async () => {
    const { push, dataDir } = setup();
    subscribe(push, 'alice');
    push.save();

    const revived = createPush({
      dataDir,
      getConnectedUserIds: () => new Set(),
      sender: () => Promise.resolve(),
      log: { error: () => {} },
    });
    expect(revived.subscribedUserIds()).toEqual(['alice']);
  });
});
