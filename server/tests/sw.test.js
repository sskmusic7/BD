/**
 * Tests public/sw.js by loading it with a fake `self`.
 *
 * The critical property: EVERY push must end in showNotification(). iOS
 * revokes the push subscription if a push arrives and nothing is displayed,
 * so a malformed or empty payload silently doing nothing would break
 * notifications permanently for that device — and only on iOS, which is the
 * hardest place to notice.
 *
 * Playwright's Chromium has no push service, so pushManager.subscribe()
 * can't be driven headlessly; this covers the handler logic instead.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadServiceWorker() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
  const listeners = {};
  const shown = [];
  const opened = [];

  const self = {
    addEventListener: (type, handler) => { listeners[type] = handler; },
    skipWaiting: () => {},
    registration: {
      showNotification: (title, options) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve([]),
      openWindow: (url) => { opened.push(url); return Promise.resolve(); },
    },
  };

  vm.createContext(self);
  vm.runInContext(source, vm.createContext({ self, console }));
  return { listeners, shown, opened, self };
}

// Minimal stand-in for a PushEvent.
function pushEvent(data) {
  const waits = [];
  return {
    data,
    waitUntil: (p) => waits.push(p),
    _settled: () => Promise.all(waits),
  };
}

describe('service worker push handling', () => {
  test('shows a notification from a well-formed payload', async () => {
    const { listeners, shown } = loadServiceWorker();
    const event = pushEvent({
      json: () => ({ title: 'Someone joined your call', body: 'Alice is waiting.', url: '/room/abc', tag: 'invite-abc' }),
    });

    listeners.push(event);
    await event._settled();

    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('Someone joined your call');
    expect(shown[0].options.body).toBe('Alice is waiting.');
    expect(shown[0].options.data.url).toBe('/room/abc');
    expect(shown[0].options.tag).toBe('invite-abc');
  });

  test('still shows one when the payload is malformed', async () => {
    // iOS revokes the subscription if a push shows nothing, so a broken
    // payload must NOT result in silence.
    const { listeners, shown } = loadServiceWorker();
    const event = pushEvent({ json: () => { throw new Error('not json'); } });

    listeners.push(event);
    await event._settled();

    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('BodyDouble');
    expect(typeof shown[0].options.body).toBe('string');
  });

  test('still shows one when there is no payload at all', async () => {
    const { listeners, shown } = loadServiceWorker();
    const event = pushEvent(null);

    listeners.push(event);
    await event._settled();

    expect(shown).toHaveLength(1);
    expect(shown[0].options.data.url).toBe('/');
  });

  test('clicking opens the payload URL when no window is open', async () => {
    const { listeners, opened } = loadServiceWorker();
    const waits = [];
    const event = {
      notification: { close: () => {}, data: { url: '/room/xyz' } },
      waitUntil: (p) => waits.push(p),
    };

    listeners.notificationclick(event);
    await Promise.all(waits);

    expect(opened).toEqual(['/room/xyz']);
  });

  test('clicking focuses an existing window instead of opening a second', async () => {
    // Two windows would mean two socket connections and a duplicate identity.
    const { listeners, self, opened } = loadServiceWorker();
    let focused = false;
    let navigatedTo = null;
    self.clients.matchAll = () => Promise.resolve([
      {
        focus: () => { focused = true; return Promise.resolve(); },
        navigate: (url) => { navigatedTo = url; return Promise.resolve({ focus: () => { focused = true; } }); },
      },
    ]);

    const waits = [];
    listeners.notificationclick({
      notification: { close: () => {}, data: { url: '/room/xyz' } },
      waitUntil: (p) => waits.push(p),
    });
    await Promise.all(waits);

    expect(opened).toEqual([]);
    expect(navigatedTo).toBe('/room/xyz');
    expect(focused).toBe(true);
  });
});
