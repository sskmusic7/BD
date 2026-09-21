/* Service worker for BodyDouble.
 *
 * Its only real job is Web Push. There's no offline caching here on purpose:
 * the app is a live video-call client, so a stale cached shell would be worse
 * than no shell at all.
 */

// The background-blur model and its WebAssembly runtime: ~2.6MB over the
// wire, fetched only when someone first turns blur on. Cached here so it's
// a one-time cost per device rather than per visit. Nothing else is cached
// — a stale app shell would be worse than no shell for a live call client.
const BLUR_CACHE = 'bodydouble-blur-v1';
const BLUR_ASSETS = /\/mediapipe\/.*\.(wasm|tflite|js)$/;

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every tab to close — a
  // half-updated push handler is worse than a brief overlap.
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !BLUR_ASSETS.test(new URL(event.request.url).pathname)) {
    return;
  }
  event.respondWith(
    caches.open(BLUR_CACHE).then((cache) =>
      cache.match(event.request).then((hit) => {
        if (hit) return hit;
        return fetch(event.request).then((response) => {
          // Only cache a complete, successful response — a partial or failed
          // fetch cached here would break blur permanently on this device.
          if (response.ok && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    )
  );
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
