/**
 * Web Push: subscription storage, delivery rules, and the HTTP routes.
 *
 * Kept out of index.js because the interesting part isn't sending — it's
 * deciding *not* to send. Four triggers on a handful of users is a spam
 * machine without the suppression rules below, and those rules are what the
 * tests exercise.
 *
 * Built as a factory so tests can inject a fake sender and a fake clock
 * instead of talking to a real push service.
 */
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

// A given kind of notification won't repeat inside this window...
const TYPE_COOLDOWN_MS = 30 * 60 * 1000;
// ...and no more than one push of ANY kind lands inside this one. Without
// it, "someone is waiting" and "someone came online" both fire for a single
// arrival, which is two buzzes for one event.
const GLOBAL_COOLDOWN_MS = 15 * 60 * 1000;

const DEFAULT_PREFERENCES = {
  enabled: true,
  partnerWaiting: true,
  someoneOnline: true,
  friendOnline: true,
  inviteOpened: true,
  quietHours: { enabled: true, start: 23, end: 8 },
};

function createPush({
  dataDir,
  getConnectedUserIds,
  sender,            // injectable for tests; defaults to web-push
  now = () => Date.now(),
  log = console,
} = {}) {
  const FILE = path.join(dataDir, 'pushSubscriptions.json');

  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:sskmusic7@gmail.com';
  const configured = !!(publicKey && privateKey);

  if (configured && !sender) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }
  const send = sender || ((subscription, payload) => webpush.sendNotification(subscription, payload));

  // { [userId]: { subscriptions: [...], timezone, preferences, lastSentAt: {}, lastAnySentAt } }
  let store = load();

  function load() {
    try {
      if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (err) {
      log.error('Could not read push subscriptions:', err.message);
    }
    return {};
  }

  function save() {
    try {
      fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
    } catch (err) {
      log.error('Could not save push subscriptions:', err.message);
    }
  }

  function record(userId) {
    if (!store[userId]) {
      store[userId] = {
        subscriptions: [],
        timezone: 'UTC',
        preferences: { ...DEFAULT_PREFERENCES },
        lastSentAt: {},
        lastAnySentAt: 0,
      };
    }
    // Older records won't have newer preference keys; fill the gaps so a
    // added trigger doesn't read as "off" for existing users.
    store[userId].preferences = {
      ...DEFAULT_PREFERENCES,
      ...store[userId].preferences,
      quietHours: { ...DEFAULT_PREFERENCES.quietHours, ...(store[userId].preferences || {}).quietHours },
    };
    return store[userId];
  }

  // Evaluated in the RECIPIENT's local time — the decision happens on the
  // server, so their timezone has to travel with the subscription.
  function inQuietHours(entry) {
    const quiet = entry.preferences.quietHours;
    if (!quiet || !quiet.enabled) return false;

    let hour;
    try {
      hour = parseInt(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: entry.timezone || 'UTC',
          hour: 'numeric',
          hour12: false,
        }).format(new Date(now())),
        10
      );
    } catch (err) {
      hour = new Date(now()).getUTCHours();
    }
    // The window normally wraps midnight (23:00 -> 08:00).
    return quiet.start > quiet.end
      ? hour >= quiet.start || hour < quiet.end
      : hour >= quiet.start && hour < quiet.end;
  }

  /** Why a given user would or wouldn't be notified. Exposed for testing. */
  function shouldNotify(userId, type, { excludeUserIds = [], connectedUserIds = new Set() } = {}) {
    if (!configured) return { send: false, reason: 'not-configured' };
    if (excludeUserIds.includes(userId)) return { send: false, reason: 'is-actor' };
    // Someone with the app open already sees this happen live.
    if (connectedUserIds.has(userId)) return { send: false, reason: 'already-connected' };

    const entry = store[userId];
    if (!entry || entry.subscriptions.length === 0) return { send: false, reason: 'no-subscription' };
    if (!entry.preferences.enabled) return { send: false, reason: 'disabled' };
    if (entry.preferences[type] === false) return { send: false, reason: 'type-disabled' };
    if (inQuietHours(entry)) return { send: false, reason: 'quiet-hours' };

    const at = now();
    if (at - (entry.lastSentAt[type] || 0) < TYPE_COOLDOWN_MS) return { send: false, reason: 'type-cooldown' };
    if (at - (entry.lastAnySentAt || 0) < GLOBAL_COOLDOWN_MS) return { send: false, reason: 'global-cooldown' };

    return { send: true, reason: 'ok' };
  }

  /**
   * Delivers to everyone eligible. Returns the userIds actually notified,
   * so callers (and tests) can see the outcome rather than guessing.
   */
  async function notify({ type, recipientIds, title, body, url = '/', tag, excludeUserIds = [] }) {
    const connectedUserIds = getConnectedUserIds ? getConnectedUserIds() : new Set();
    const payload = JSON.stringify({ title, body, url, tag: tag || type });
    const notified = [];
    let dirty = false;

    for (const userId of new Set(recipientIds)) {
      const verdict = shouldNotify(userId, type, { excludeUserIds, connectedUserIds });
      if (!verdict.send) continue;

      const entry = store[userId];
      const dead = [];
      let delivered = false;

      for (const subscription of entry.subscriptions) {
        try {
          await send(subscription, payload);
          delivered = true;
        } catch (err) {
          // 404/410 mean the browser threw the subscription away — it will
          // never work again, so stop keeping it.
          if (err && (err.statusCode === 404 || err.statusCode === 410)) {
            dead.push(subscription.endpoint);
          } else {
            log.error('Push failed:', (err && err.message) || err);
          }
        }
      }

      if (dead.length) {
        entry.subscriptions = entry.subscriptions.filter((s) => !dead.includes(s.endpoint));
        dirty = true;
      }
      if (delivered) {
        entry.lastSentAt[type] = now();
        entry.lastAnySentAt = now();
        notified.push(userId);
        dirty = true;
      }
    }

    if (dirty) save();
    return notified;
  }

  /** Everyone who could conceivably be notified (i.e. has a subscription). */
  function subscribedUserIds() {
    return Object.keys(store).filter((id) => store[id].subscriptions.length > 0);
  }

  function registerRoutes(app) {
    app.get('/api/push/config', (req, res) => {
      res.json({ configured, publicKey: configured ? publicKey : null });
    });

    app.post('/api/push/subscribe', (req, res) => {
      const { userId, subscription, timezone } = req.body || {};
      if (!userId || !subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'userId and subscription are required' });
      }

      const entry = record(userId);
      // Re-subscribing from the same device returns the same endpoint; keep
      // one entry per device rather than accumulating duplicates.
      entry.subscriptions = entry.subscriptions.filter((s) => s.endpoint !== subscription.endpoint);
      entry.subscriptions.push({ ...subscription, createdAt: now() });
      if (timezone) entry.timezone = timezone;
      save();

      res.json({ ok: true, preferences: entry.preferences });
    });

    app.post('/api/push/unsubscribe', (req, res) => {
      const { userId, endpoint } = req.body || {};
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const entry = store[userId];
      if (entry) {
        entry.subscriptions = endpoint
          ? entry.subscriptions.filter((s) => s.endpoint !== endpoint)
          : [];
        save();
      }
      res.json({ ok: true });
    });

    app.get('/api/push/preferences', (req, res) => {
      const entry = store[req.query.userId];
      res.json({ preferences: entry ? entry.preferences : { ...DEFAULT_PREFERENCES } });
    });

    app.post('/api/push/preferences', (req, res) => {
      const { userId, preferences } = req.body || {};
      if (!userId || !preferences) {
        return res.status(400).json({ error: 'userId and preferences are required' });
      }
      const entry = record(userId);
      entry.preferences = {
        ...entry.preferences,
        ...preferences,
        quietHours: { ...entry.preferences.quietHours, ...(preferences.quietHours || {}) },
      };
      save();
      res.json({ ok: true, preferences: entry.preferences });
    });
  }

  return {
    configured,
    registerRoutes,
    notify,
    save,
    subscribedUserIds,
    shouldNotify,
    DEFAULT_PREFERENCES,
    // Test seams.
    _store: () => store,
    _reset: (next = {}) => { store = next; },
  };
}

module.exports = { createPush, TYPE_COOLDOWN_MS, GLOBAL_COOLDOWN_MS, DEFAULT_PREFERENCES };
