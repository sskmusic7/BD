// Service Worker for BodyDouble
// Prevents extension errors from cluttering console

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  self.clients.claim();
});

// Suppress extension-related errors by handling messages gracefully
self.addEventListener('message', (event) => {
  // Silently handle extension messages to prevent console spam
  if (event.data && event.data.type) {
    // Only respond to our own app messages
    if (event.data.source === 'bodydouble-app') {
      event.ports[0].postMessage({ success: true });
    }
  }
});

