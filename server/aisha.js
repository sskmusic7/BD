/**
 * Talk-to-Agent: a server-side proxy to the Aisha mainframe.
 *
 * Aisha's brain already runs on this same droplet as a container listening
 * on localhost:8787, so BodyDouble talks to it directly over loopback. That
 * deliberately avoids her public Cloudflare tunnel
 * (aisha-api.sskmusic.com), which is currently returning 530 because no
 * cloudflared process is running — her backend is healthy, only the tunnel
 * is down.
 *
 * Everything sensitive stays here. Her access code and the JWT it buys are
 * never sent to the browser; the client only ever exchanges plain text with
 * BodyDouble's own socket.io connection. Aisha's own web app takes the
 * opposite approach and ships its keys to the client, which is why they're
 * extractable from its public bundle — not a pattern to copy.
 *
 * Protocol, confirmed by driving it directly against the live container:
 *   POST /api/auth/login { email, name, accessCode } -> { token }
 *   ws://localhost:8787/ws
 *     -> { type: 'auth', token }
 *     <- { type: 'authenticated', userId }
 *     -> { type: 'message', content, source }
 *     <- { type: 'new_message', message: { role: 'user', ... } }     (echo)
 *     <- { type: 'new_message', message: { role: 'assistant', ... } } (reply)
 * The echo of your own message arrives first — filter on role, or every
 * reply is just your own words handed back.
 */
const http = require('http');
const WebSocket = require('ws');

const MAINFRAME_URL = process.env.AISHA_MAINFRAME_URL || 'http://localhost:8787';
const ACCESS_CODE = process.env.AISHA_ACCESS_CODE || '';
const IDENTITY_EMAIL = process.env.AISHA_IDENTITY_EMAIL || 'bodydouble@local';

const REPLY_TIMEOUT_MS = 45000;
const RECONNECT_DELAY_MS = 3000;

function createAisha({ log = console } = {}) {
  const configured = !!ACCESS_CODE;

  let socket = null;
  let token = null;
  let connecting = null;
  // Replies aren't correlated by id, so requests are answered in order.
  let pending = [];

  function loginForToken() {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        email: IDENTITY_EMAIL,
        name: 'BodyDouble',
        accessCode: ACCESS_CODE,
      });
      const url = new URL('/api/auth/login', MAINFRAME_URL);
      const req = http.request(
        {
          host: url.hostname,
          port: url.port || 80,
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            if (res.statusCode !== 200) {
              return reject(new Error(`login failed (${res.statusCode})`));
            }
            try {
              const parsed = JSON.parse(data);
              parsed.token ? resolve(parsed.token) : reject(new Error('no token in login response'));
            } catch (err) {
              reject(new Error('login response was not JSON'));
            }
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  function connect() {
    if (connecting) return connecting;

    connecting = (async () => {
      token = await loginForToken();
      const wsUrl = MAINFRAME_URL.replace(/^http/, 'ws') + '/ws';

      await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const failed = (err) => reject(err instanceof Error ? err : new Error(String(err)));

        ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));

        ws.on('message', (raw) => {
          let msg;
          try { msg = JSON.parse(raw.toString()); } catch { return; }

          if (msg.type === 'authenticated') {
            socket = ws;
            log.log('Aisha: connected to mainframe');
            return resolve();
          }
          if (msg.type === 'error') {
            log.error('Aisha mainframe error:', msg.error || msg.message);
            return;
          }
          if (msg.type !== 'new_message') return;

          // The first new_message echoes what we just sent. Only the
          // assistant's turn is a reply.
          const role = msg.message?.role;
          if (role !== 'assistant') return;

          const text = msg.message?.content || '';
          const waiter = pending.shift();
          if (waiter) waiter.resolve(text);
        });

        ws.on('close', () => {
          if (socket === ws) {
            socket = null;
            log.log('Aisha: mainframe connection closed');
          }
          // Nothing is going to answer these now.
          pending.forEach(w => w.reject(new Error('connection closed')));
          pending = [];
        });

        ws.on('error', (err) => {
          if (socket !== ws) failed(err);
          else log.error('Aisha socket error:', err.message);
        });

        setTimeout(() => failed(new Error('timed out connecting to mainframe')), 15000);
      });
    })();

    connecting.catch(() => {}).finally(() => { connecting = null; });
    return connecting;
  }

  /** Sends one message and resolves with her reply text. */
  async function ask(text) {
    if (!configured) throw new Error('Aisha is not configured on this server');
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      await connect();
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      pending.push(waiter);

      const timer = setTimeout(() => {
        pending = pending.filter(w => w !== waiter);
        reject(new Error('Aisha took too long to reply'));
      }, REPLY_TIMEOUT_MS);

      const settle = (fn) => (value) => { clearTimeout(timer); fn(value); };
      waiter.resolve = settle(resolve);
      waiter.reject = settle(reject);

      try {
        socket.send(JSON.stringify({ type: 'message', content: text, source: 'bodydouble' }));
      } catch (err) {
        pending = pending.filter(w => w !== waiter);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /** Wires the per-socket handlers for a connected BodyDouble client. */
  function attach(clientSocket) {
    clientSocket.on('aisha-message', async ({ text, requestId } = {}) => {
      if (!text || typeof text !== 'string') return;
      if (!configured) {
        return clientSocket.emit('aisha-reply', {
          requestId,
          error: 'Talk to Agent is not available right now.',
        });
      }

      try {
        const reply = await ask(text.slice(0, 2000));
        clientSocket.emit('aisha-reply', { requestId, text: reply });
      } catch (err) {
        log.error('Aisha ask failed:', err.message);
        // One retry on a fresh connection — the mainframe has a long uptime
        // and its socket can go stale between calls.
        try {
          socket = null;
          const reply = await ask(text.slice(0, 2000));
          clientSocket.emit('aisha-reply', { requestId, text: reply });
        } catch (retryErr) {
          clientSocket.emit('aisha-reply', {
            requestId,
            error: "Aisha isn't responding right now.",
          });
        }
      }
    });
  }

  function registerRoutes(app) {
    app.get('/api/aisha/status', async (req, res) => {
      if (!configured) return res.json({ available: false, reason: 'not-configured' });
      try {
        await connect();
        res.json({ available: true });
      } catch (err) {
        res.json({ available: false, reason: err.message });
      }
    });
  }

  return { configured, attach, registerRoutes, ask, RECONNECT_DELAY_MS };
}

module.exports = { createAisha };
