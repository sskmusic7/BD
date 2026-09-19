import React, { useState, useEffect, useCallback } from 'react';
import { Bell, X, Share, PlusSquare } from 'lucide-react';
import {
  pushSupported,
  needsInstallFirst,
  isIOS,
  enablePush,
  disablePush,
  isPushEnabled,
  savePreferences,
  loadPreferences,
} from '../utils/push';

const TRIGGERS = [
  { key: 'partnerWaiting', label: 'Someone is waiting for a partner', hint: 'The one you can act on straight away' },
  { key: 'someoneOnline', label: 'Other people come online', hint: 'When the app has company' },
  { key: 'friendOnline', label: 'A friend comes online', hint: 'People you have added as friends' },
  { key: 'inviteOpened', label: 'Someone opens your invite link', hint: 'So you know to jump back in' },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const formatHour = (h) => `${String(h).padStart(2, '0')}:00`;

const NotificationSettings = ({ user, onClose }) => {
  const [enabled, setEnabled] = useState(false);
  const [preferences, setPreferences] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const installFirst = needsInstallFirst();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const on = await isPushEnabled();
      if (cancelled) return;
      setEnabled(on);
      const prefs = await loadPreferences(user.id);
      if (!cancelled && prefs) setPreferences(prefs);
    })();
    return () => { cancelled = true; };
  }, [user.id]);

  const persist = useCallback((next) => {
    setPreferences(next);
    savePreferences(user.id, next);
  }, [user.id]);

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    // Called straight out of the click — iOS ignores a permission request
    // that isn't tied to a user gesture.
    const result = await enablePush(user.id);
    setBusy(false);

    if (result.ok) {
      setEnabled(true);
      const prefs = await loadPreferences(user.id);
      if (prefs) setPreferences(prefs);
      return;
    }
    setError(
      result.reason === 'denied'
        ? 'Notifications are blocked for this site. You can re-allow them in your browser settings.'
        : result.reason === 'needs-install'
          ? 'Add BodyDouble to your home screen first.'
          : 'Could not turn notifications on. Please try again.'
    );
  };

  const handleDisable = async () => {
    setBusy(true);
    await disablePush(user.id);
    setEnabled(false);
    setBusy(false);
  };

  const quiet = preferences?.quietHours || { enabled: true, start: 23, end: 8 };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Bell className="w-5 h-5" /> Notifications
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {!pushSupported && (
            <p className="text-gray-600 text-sm">
              This browser doesn&apos;t support notifications. Try Chrome, or Safari on iOS 16.4 or newer.
            </p>
          )}

          {/* iOS refuses push from a normal Safari tab, so explain the
              install step rather than showing a button that cannot work. */}
          {pushSupported && installFirst && (
            <div className="space-y-3">
              <p className="text-gray-700 text-sm">
                On iPhone, notifications only work once BodyDouble is on your home screen. It takes a second:
              </p>
              <ol className="text-sm text-gray-600 space-y-2">
                <li className="flex items-start gap-2">
                  <Share className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                  <span>Tap the <b>Share</b> button in Safari&apos;s toolbar</span>
                </li>
                <li className="flex items-start gap-2">
                  <PlusSquare className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                  <span>Choose <b>Add to Home Screen</b></span>
                </li>
                <li className="flex items-start gap-2">
                  <Bell className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                  <span>Open BodyDouble from your home screen, then come back here</span>
                </li>
              </ol>
            </div>
          )}

          {pushSupported && !installFirst && !enabled && (
            <div className="space-y-3">
              <p className="text-gray-700 text-sm">
                Get a notification when there&apos;s someone to focus with — even with the app closed.
              </p>
              <button
                onClick={handleEnable}
                disabled={busy}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-3 rounded-xl font-semibold transition-colors"
              >
                {busy ? 'Turning on…' : 'Turn on notifications'}
              </button>
              {isIOS() && (
                <p className="text-xs text-gray-500">
                  iOS 16.4 or newer is required.
                </p>
              )}
            </div>
          )}

          {enabled && preferences && (
            <>
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Tell me when</p>
                {TRIGGERS.map(({ key, label, hint }) => (
                  <label key={key} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences[key] !== false}
                      onChange={(e) => persist({ ...preferences, [key]: e.target.checked })}
                      className="mt-1 w-4 h-4 accent-blue-500"
                    />
                    <span>
                      <span className="block text-sm text-gray-800">{label}</span>
                      <span className="block text-xs text-gray-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="space-y-3 pt-2 border-t border-gray-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quiet.enabled !== false}
                    onChange={(e) => persist({ ...preferences, quietHours: { ...quiet, enabled: e.target.checked } })}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <span className="text-sm text-gray-800">Stay quiet overnight</span>
                </label>

                {quiet.enabled !== false && (
                  <div className="flex items-center gap-2 text-sm text-gray-700 pl-7">
                    <select
                      value={quiet.start}
                      onChange={(e) => persist({ ...preferences, quietHours: { ...quiet, start: Number(e.target.value) } })}
                      className="border border-gray-300 rounded-lg px-2 py-1"
                    >
                      {HOURS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                    <span>to</span>
                    <select
                      value={quiet.end}
                      onChange={(e) => persist({ ...preferences, quietHours: { ...quiet, end: Number(e.target.value) } })}
                      className="border border-gray-300 rounded-lg px-2 py-1"
                    >
                      {HOURS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                    </select>
                  </div>
                )}
                <p className="text-xs text-gray-500 pl-7">Uses your device&apos;s local time.</p>
              </div>

              <button
                onClick={handleDisable}
                disabled={busy}
                className="w-full text-gray-500 hover:text-gray-700 text-sm font-medium pt-2"
              >
                Turn off notifications
              </button>
            </>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;
