// Web Push setup. Everything here degrades quietly: push is a nice-to-have,
// and nothing in the call flow should break if it's unavailable or refused.
import config from '../config/config';

const SW_URL = '/sw.js';

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

// iOS only delivers Web Push to an app installed to the home screen — not to
// a normal Safari tab — so the UI has to tell people to install first rather
// than showing an Enable button that can never work.
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports as a Mac; the touch check separates it from a real one.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isInstalled() {
  if (typeof window === 'undefined') return false;
  return window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
}

// True when we must ask the user to install before push can work at all.
export function needsInstallFirst() {
  return isIOS() && !isInstalled();
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register(SW_URL).catch((err) => {
    console.error('Service worker registration failed:', err.message);
    return null;
  });
}

// VAPID keys travel as base64url but the subscribe() call wants raw bytes.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function getPublicKey() {
  const res = await fetch(`${config.SERVER_URL}/api/push/config`);
  if (!res.ok) throw new Error('Could not load push configuration');
  const data = await res.json();
  if (!data.publicKey) throw new Error('Push is not configured on the server');
  return data.publicKey;
}

/**
 * Asks permission and subscribes. MUST be called from a user gesture — iOS
 * ignores requestPermission() otherwise, and Chrome may auto-deny.
 * Returns { ok, reason } rather than throwing, so the UI can explain itself.
 */
export async function enablePush(userId) {
  if (!pushSupported) return { ok: false, reason: 'unsupported' };
  if (needsInstallFirst()) return { ok: false, reason: 'needs-install' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  const registration = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      // Required to be true by every browser — silent push isn't permitted.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(await getPublicKey()),
    });
  }

  const res = await fetch(`${config.SERVER_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      subscription,
      // Sent so quiet hours can be evaluated in the recipient's own local
      // time on the server, where the notification decision is made.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!res.ok) return { ok: false, reason: 'server-rejected' };

  return { ok: true, subscription };
}

export async function disablePush(userId) {
  if (!pushSupported) return;
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  const subscription = registration && (await registration.pushManager.getSubscription());

  if (subscription) {
    await fetch(`${config.SERVER_URL}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, endpoint: subscription.endpoint }),
    }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }
}

export async function isPushEnabled() {
  if (!pushSupported || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!registration) return false;
  return !!(await registration.pushManager.getSubscription());
}

export async function savePreferences(userId, preferences) {
  return fetch(`${config.SERVER_URL}/api/push/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, preferences }),
  }).then((res) => res.ok);
}

export async function loadPreferences(userId) {
  const res = await fetch(`${config.SERVER_URL}/api/push/preferences?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return null;
  return (await res.json()).preferences || null;
}
