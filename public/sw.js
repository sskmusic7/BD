/* Service worker for BodyDouble.
 *
 * Its only real job is Web Push. There's no offline caching here on purpose:
 * the app is a live video-call client, so a stale cached shell would be worse
 * than no shell at all.
 */

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every tab to close — a
  // half-updated push handler is worse than a brief overlap.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // iOS does not allow silent pushes: if a push arrives and we don't show a
  // notification, Safari revokes the subscription. So every branch here,
  // including a malformed payload, must end in showNotification().
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {};
  }

  const title = payload.title || 'BodyDouble';
  const options = {
    body: payload.body || 'Someone is around to focus with.',
    icon: '/logo192.png',
    badge: '/logo192.png',
    // Replaces an earlier notification of the same kind instead of stacking
    // several "someone is waiting" alerts on the lock screen.
    tag: payload.tag || 'bodydouble',
    renotify: true,
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Prefer focusing a window that's already open — opening a second one
      // would start a duplicate socket connection and a second identity.
      for (const client of clientList) {
        if ('focus' in client) {
          if (target !== '/' && 'navigate' in client) {
            return client.navigate(target).then((c) => (c ? c.focus() : null));
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// Fired when the push service rotates or drops the subscription. The client
// re-subscribes on next load; this just stops the old one being used.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'push-subscription-changed' }));
    })
  );
});
