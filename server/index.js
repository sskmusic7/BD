const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Data persistence files
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const FRIENDSHIPS_FILE = path.join(DATA_DIR, 'friendships.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-app call recordings — stored under the same server/data path that's
// already the persistent Docker volume, so they survive a container
// restart during their 24h retention window like everything else does.
const RECORDINGS_DIR = path.join(DATA_DIR, 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

const MIN_FREE_DISK_BYTES = 1 * 1024 * 1024 * 1024; // 1GB — this box is shared with other live services
const RECORDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECORDING_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validates the id is a real UUID before it's ever used in a file path —
// blocks path traversal (e.g. "../../etc/passwd") entirely, not just
// filtered.
function recordingFilePath(id) {
  if (typeof id !== 'string' || !RECORDING_ID_RE.test(id)) {
    return null;
  }
  return path.join(RECORDINGS_DIR, `${id}.mp4`);
}

function getFreeDiskBytes() {
  try {
    const output = execSync(`df -k "${RECORDINGS_DIR}"`).toString();
    const lastLine = output.trim().split('\n').pop();
    const availableKb = parseInt(lastLine.trim().split(/\s+/)[3], 10);
    return availableKb * 1024;
  } catch (err) {
    console.error('Could not check disk space, failing open:', err.message);
    return Infinity;
  }
}

function cleanupExpiredRecordings() {
  fs.readdir(RECORDINGS_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach((file) => {
      const filePath = path.join(RECORDINGS_DIR, file);
      fs.stat(filePath, (statErr, stats) => {
        if (statErr) return;
        if (now - stats.mtimeMs > RECORDING_MAX_AGE_MS) {
          fs.unlink(filePath, (unlinkErr) => {
            if (!unlinkErr) console.log('Deleted expired recording:', file);
          });
        }
      });
    });
  });
}
setInterval(cleanupExpiredRecordings, 60 * 60 * 1000);
cleanupExpiredRecordings();

// Load persistent data
function loadPersistentData() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      return new Map(Object.entries(usersData));
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  return new Map();
}

function loadFriendships() {
  try {
    if (fs.existsSync(FRIENDSHIPS_FILE)) {
      const friendshipsData = JSON.parse(fs.readFileSync(FRIENDSHIPS_FILE, 'utf8'));
      return new Map(Object.entries(friendshipsData).map(([key, value]) => [key, new Set(value)]));
    }
  } catch (error) {
    console.error('Error loading friendships:', error);
  }
  return new Map();
}

// Save persistent data
function saveUsers(users) {
  try {
    const usersData = Object.fromEntries(users);
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

function saveFriendships(friendships) {
  try {
    const friendshipsData = Object.fromEntries(
      Array.from(friendships.entries()).map(([key, value]) => [key, Array.from(value)])
    );
    fs.writeFileSync(FRIENDSHIPS_FILE, JSON.stringify(friendshipsData, null, 2));
  } catch (error) {
    console.error('Error saving friendships:', error);
  }
}

// Force CORS headers on ALL responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Middleware
app.use(cors({
  origin: "*",
  credentials: true
}));

// In-app call recording — client streams chunks here as they're produced
// instead of holding the whole recording in browser memory (see
// src/hooks/useCallRecorder.js). Registered here, BEFORE the global
// express.json() below, because body-parsing middleware can only consume
// the request stream once — if express.json() ran first it would swallow
// the binary body (its default behavior even for non-JSON content-types
// leaves req.body as {}), and this route's own express.raw() would never
// see real bytes.
app.post('/api/recordings/:id/chunk', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  const filePath = recordingFilePath(req.params.id);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid recording id' });
  }
  if (getFreeDiskBytes() < MIN_FREE_DISK_BYTES) {
    return res.status(507).json({ error: 'Server storage is low — recording cannot continue.' });
  }
  fs.appendFile(filePath, req.body, (err) => {
    if (err) {
      console.error('Error writing recording chunk:', err);
      return res.status(500).json({ error: 'Failed to save chunk' });
    }
    res.status(204).end();
  });
});

app.post('/api/recordings/:id/finish', (req, res) => {
  const filePath = recordingFilePath(req.params.id);
  if (!filePath) {
    return res.status(400).json({ error: 'Invalid recording id' });
  }
  fs.stat(filePath, (err, stats) => {
    if (err) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    res.json({ ok: true, size: stats.size });
  });
});

app.get('/api/recordings/:id/download', (req, res) => {
  const filePath = recordingFilePath(req.params.id);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('Recording not found');
  }
  res.setHeader('Content-Disposition', `attachment; filename="bodydouble-call-${req.params.id}.mp4"`);
  res.setHeader('Content-Type', 'video/mp4');
  fs.createReadStream(filePath).pipe(res);
});

app.use(express.json());

// Handle preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

// Health endpoint for Cloud Run - must be first!
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// In-memory storage with persistence
const users = loadPersistentData();
const waitingQueue = [];
const activeSessions = new Map();
const friendships = loadFriendships();

// Grace period (ms) before a disconnected user's active session is torn
// down. Socket.IO reconnects (mobile network blips, tab backgrounding,
// transport upgrades) fire 'disconnect' on the old socket even though the
// client reconnects moments later — without this window, every such blip
// during a call kills the session and looks like "partner disconnected".
const DISCONNECT_GRACE_MS = 10000;
// Room sessions (deliberate, invite-link calls — see create-room/join-room)
// get a much longer grace window than random-matched ones. A stranger
// disconnecting should be detected quickly so their partner isn't left
// waiting; someone you deliberately invited is worth actually waiting for.
const ROOM_DISCONNECT_GRACE_MS = 5 * 60 * 1000;
// Keyed by stable user id (userData.userId), value: { timeout, sessionId }
const pendingSessionDisconnects = new Map();
const ROOM_CODE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Solo rooms survive a creator disconnect (see the disconnect handler) so a
// link that's already been sent keeps working — this bounds how long a room
// nobody ever opened can sit around once its creator is genuinely gone.
const ROOM_IDLE_MAX_AGE_MS = 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of activeSessions) {
    if (!session.isRoomSession || session.users.length !== 1) continue;
    const creator = session.users[0];
    if (creator.isOnline) continue;
    if (now - new Date(session.startTime).getTime() <= ROOM_IDLE_MAX_AGE_MS) continue;
    if (creator.currentSession === id) creator.currentSession = null;
    activeSessions.delete(id);
    console.log('Swept idle abandoned room:', id);
  }
}, 10 * 60 * 1000);

// Helper: find a live invite-link room this user is still a member of.
function findLiveRoomSessionFor(userId) {
  for (const session of activeSessions.values()) {
    if (session.isRoomSession && session.users.some(u => u.id === userId)) {
      return session;
    }
  }
  return null;
}

// Helper: find a user by their userId (since users Map is keyed by socketId)
function findUserByUserId(userId) {
  for (const user of users.values()) {
    if (user.id === userId) return user;
  }
  return null;
}

// Auto-save data every 30 seconds
setInterval(() => {
  saveUsers(users);
  saveFriendships(friendships);
}, 30000);

// Save data on graceful shutdown
process.on('SIGINT', () => {
  console.log('Saving data before shutdown...');
  saveUsers(users);
  saveFriendships(friendships);
  process.exit(0);
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins with profile info
  socket.on('join', (userData) => {
    // Check if user already exists by userId (for reconnection)
    let existingUser = null;
    let oldSocketId = null;
    for (const [socketId, user] of users) {
      // First try to match by userId, fallback to name for backwards compatibility
      if (userData.userId && user.userId === userData.userId) {
        existingUser = user;
        oldSocketId = socketId;
        break;
      }
      if (user.name === userData.name && !userData.userId) {
        existingUser = user;
        oldSocketId = socketId;
        break;
      }
    }

    if (existingUser && oldSocketId) {
      // Only reattach to the old session if the CLIENT explicitly claims to
      // still be in it via resumeSessionId. That value only survives a
      // transport-level reconnect (same JS session, socket.io reconnecting
      // on its own) — a real page reload resets the client's session state
      // to null, so it can never send a stale resumeSessionId. Relying on
      // server-side state alone (e.g. "is there a pending disconnect
      // timer?") can't tell a genuine blip apart from a deliberate reload
      // shortly after a session ended, which was silently resuming stale
      // sessions and looked like an instant, unexplained "session ended".
      const liveSession = (userData.resumeSessionId && userData.resumeSessionId === existingUser.currentSession)
        ? activeSessions.get(existingUser.currentSession)
        : null;

      if (liveSession) {
        // Genuinely resuming — safe to cancel the pending teardown timer
        // now. (Left alone otherwise: if this ISN'T a resume, the timer
        // must still fire later to clean up the session and notify the
        // actual partner — cancelling it unconditionally would leave that
        // partner stuck in a dead session forever.)
        const pending = pendingSessionDisconnects.get(existingUser.id);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingSessionDisconnects.delete(existingUser.id);
        }

        // Reattach this socket to it instead of tearing it down, and
        // refresh the stale socketId the session stores for this user
        // (used by end-session/disconnect cleanup).
        socket.join(existingUser.currentSession);
        liveSession.users.forEach(u => {
          if (u.id === existingUser.id) {
            u.socketId = socket.id;
          }
        });
        console.log('User reconnected into live session:', existingUser.name, existingUser.currentSession);
      } else if (existingUser.currentSession) {
        // Not resuming — this user is free to start fresh immediately.
        // Note: a pending timer for the OLD session (if any) is deliberately
        // left running so the real partner still gets cleaned up/notified.
        existingUser.currentSession = null;
      }

      // Remove from waiting queue if present
      const queueIndex = waitingQueue.findIndex(u => u.socketId === oldSocketId);
      if (queueIndex > -1) {
        waitingQueue.splice(queueIndex, 1);
      }

      // Remove old user entry
      users.delete(oldSocketId);

      // Update existing user with new socket ID
      existingUser.socketId = socket.id;
      existingUser.isOnline = true;
      users.set(socket.id, existingUser);

      // Invite-link rooms are durable by design — unlike a random match,
      // the whole point is that the link keeps working. Re-attach this
      // socket to any live room the user is still a member of, even with
      // no resumeSessionId. A creator WAITING in their own room never has
      // one (they have activeRoomCode but no currentSession yet), so a
      // plain transport blip while they were texting the link out used to
      // leave them a member of the room but OUTSIDE its socket.io room —
      // every webrtc-offer/answer/ice is delivered with socket.to(room),
      // so all signaling was silently dropped. Both sides still showed
      // "partner found" and rendered the call UI, but no video or audio
      // could ever flow. Verified directly with a signaling repro test.
      if (!liveSession) {
        const liveRoom = findLiveRoomSessionFor(existingUser.id);
        if (liveRoom) {
          const pendingRoom = pendingSessionDisconnects.get(existingUser.id);
          if (pendingRoom && pendingRoom.sessionId === liveRoom.id) {
            clearTimeout(pendingRoom.timeout);
            pendingSessionDisconnects.delete(existingUser.id);
          }

          existingUser.currentSession = liveRoom.id;
          liveRoom.users.forEach(u => {
            if (u.id === existingUser.id) u.socketId = socket.id;
          });
          socket.join(liveRoom.id);

          const roomPartner = liveRoom.users.find(u => u.id !== existingUser.id);
          if (roomPartner) {
            // Also covers a full page reload mid-call: the client lost its
            // session state, so re-deliver it instead of stranding them.
            socket.emit('partner-found', { partner: roomPartner, sessionId: liveRoom.id });
          }
          console.log('Re-attached to live room:', existingUser.name, liveRoom.id);
        }
      }

      socket.emit('joined', { userId: existingUser.id, user: existingUser });
      console.log('User reconnected:', existingUser.name, 'from', oldSocketId, 'to', socket.id);
    } else {
      // Create new user
      const user = {
        id: userData.userId || socket.id, // Use client's userId if provided
        socketId: socket.id, // Track actual socket ID for emitting
        ...userData,
        isOnline: true,
        currentSession: null
      };
      users.set(socket.id, user);
      socket.emit('joined', { userId: user.id, user });
      console.log('New user joined:', user.name, 'with ID:', user.id);
    }
    
    // Save users after modification
    saveUsers(users);
  });

  // Find random partner
  socket.on('find-partner', () => {
    const currentUser = users.get(socket.id);
    if (!currentUser) {
      console.log('find-partner: User not found for socket', socket.id);
      return;
    }

    console.log(`\n=== FIND-PARTNER: ${currentUser.name} (${socket.id}) ===`);
    console.log('Waiting queue before:', waitingQueue.map(u => `${u.name} (${u.id})`));

    // Don't allow matching if user already in a session
    if (currentUser.currentSession) {
      console.log('find-partner: User already in session', currentUser.name);
      socket.emit('waiting-for-partner'); // Still show waiting to avoid UI confusion
      return;
    }

    // Remove from queue if already waiting
    const existingIndex = waitingQueue.findIndex(u => u.socketId === socket.id);
    if (existingIndex > -1) {
      waitingQueue.splice(existingIndex, 1);
      console.log('Removed existing entry from queue');
    }

    // Filter queue to only include users who are online and not in sessions
    // Note: waitingQueue stores full user objects, so we can check fields directly
    const availablePartners = waitingQueue.filter(u => {
      // User object is stored directly in queue, check its status
      return u && u.isOnline && !u.currentSession;
    });

    console.log('Available partners:', availablePartners.length);

    // Update queue to only valid users
    waitingQueue.length = 0;
    waitingQueue.push(...availablePartners);

    // Find available partner from queue
    if (availablePartners.length > 0) {
      const partner = availablePartners.shift();
      const partnerUser = partner; // Queue stores full user objects

      console.log(`Found partner: ${partnerUser.name} (${partnerUser.id})`);

      // Double-check partner is still available
      if (!partnerUser || !partnerUser.isOnline || partnerUser.currentSession) {
        console.log('Partner no longer available, adding to queue');
        // Partner no longer available, add current user to queue
        waitingQueue.push(currentUser);
        socket.emit('waiting-for-partner');
        return;
      }

      const sessionId = uuidv4();

      // Create session
      const session = {
        id: sessionId,
        users: [currentUser, partnerUser],
        startTime: new Date(),
        isActive: true
      };

      activeSessions.set(sessionId, session);

      // Update user sessions
      currentUser.currentSession = sessionId;
      partnerUser.currentSession = sessionId;

      // Update queue
      waitingQueue.length = 0;
      waitingQueue.push(...availablePartners);

      // Notify both users
      console.log(`Emitting partner-found to current user (${socket.id}) and partner (${partnerUser.socketId})`);
      socket.emit('partner-found', { partner: partnerUser, sessionId });

      // Get the partner's socket and emit directly
      const partnerSocket = io.sockets.sockets.get(partnerUser.socketId);
      if (partnerSocket) {
        partnerSocket.emit('partner-found', { partner: currentUser, sessionId });
        console.log(`Successfully emitted to partner socket`);
      } else {
        console.error(`Partner socket not found for id: ${partnerUser.socketId}`);
      }

      // Join both to session room
      socket.join(sessionId);
      if (partnerSocket) {
        partnerSocket.join(sessionId);
      }
      
      console.log(`Matched: ${currentUser.name} <-> ${partnerUser.name} (session: ${sessionId})`);
      
    } else {
      // Add to waiting queue
      waitingQueue.push(currentUser);
      socket.emit('waiting-for-partner');
      console.log(`User ${currentUser.name} added to waiting queue (${waitingQueue.length} waiting)`);
      console.log('Waiting queue after:', waitingQueue.map(u => `${u.name} (${u.id})`));
    }
  });

  // Cancel search
  socket.on('cancel-search', () => {
    const index = waitingQueue.findIndex(u => u.socketId === socket.id);
    if (index > -1) {
      waitingQueue.splice(index, 1);
      socket.emit('search-cancelled');
    }
  });

  // Session messages
  socket.on('session-message', (data) => {
    const user = users.get(socket.id);
    if (user && user.currentSession) {
      socket.to(user.currentSession).emit('session-message', {
        ...data,
        from: user,
        timestamp: new Date()
      });
    }
  });

  // Goal updates
  socket.on('goal-update', (goalData) => {
    const user = users.get(socket.id);
    if (user && user.currentSession) {
      socket.to(user.currentSession).emit('goal-update', {
        ...goalData,
        from: socket.id
      });
    }
  });

  // Timer sync
  socket.on('timer-sync', (timerData) => {
    const user = users.get(socket.id);
    if (user && user.currentSession) {
      socket.to(user.currentSession).emit('timer-sync', timerData);
    }
  });

  // WebRTC signaling
  socket.on('webrtc-offer', (data) => {
    socket.to(data.sessionId).emit('webrtc-offer', data);
  });

  socket.on('webrtc-answer', (data) => {
    socket.to(data.sessionId).emit('webrtc-answer', data);
  });

  socket.on('webrtc-ice-candidate', (data) => {
    socket.to(data.sessionId).emit('webrtc-ice-candidate', data);
  });

  // Asks the call's initiator to send a fresh ICE-restart offer. Only the
  // initiator generates offers, so the other side routes the request
  // through here rather than offering itself and causing glare.
  socket.on('webrtc-restart-request', (data) => {
    socket.to(data.sessionId).emit('webrtc-restart-request', data);
  });

  // End session
  socket.on('end-session', () => {
    const user = users.get(socket.id);
    if (user && user.currentSession) {
      const session = activeSessions.get(user.currentSession);
      if (session) {
        // Notify other user
        socket.to(user.currentSession).emit('session-ended');
        
        // Leave session room
        socket.leave(user.currentSession);

        // Clean up session - update all users in session
        session.users.forEach(u => {
          // u is the user object stored in session, update its state directly
          u.currentSession = null;
          // Leave room for other user
          const otherSocket = io.sockets.sockets.get(u.socketId);
          if (otherSocket && u.socketId !== socket.id) {
            otherSocket.leave(user.currentSession);
          }
        });
        
        activeSessions.delete(user.currentSession);
        user.currentSession = null;
        
        console.log(`Session ${session.id} ended by ${user.name}`);
        
        // Save users after modification
        saveUsers(users);
      }
    }
  });

  // Add friend
  socket.on('add-friend', (friendId) => {
    const currentUser = users.get(socket.id);
    const friend = users.get(friendId);
    
    if (currentUser && friend) {
      // Add to friendships
      if (!friendships.has(socket.id)) {
        friendships.set(socket.id, new Set());
      }
      if (!friendships.has(friendId)) {
        friendships.set(friendId, new Set());
      }
      
      friendships.get(socket.id).add(friendId);
      friendships.get(friendId).add(socket.id);
      
      // Save friendships after modification
      saveFriendships(friendships);
      
      // Notify both users
      socket.emit('friend-added', friend);
      io.to(friendId).emit('friend-added', currentUser);
      
      console.log(`Friendship added: ${currentUser.name} <-> ${friend.name}`);
    }
  });

  // Get friends list
  socket.on('get-friends', () => {
    const userFriends = friendships.get(socket.id) || new Set();
    const friendsList = Array.from(userFriends).map(friendId => {
      const friend = users.get(friendId);
      return friend ? { ...friend, isOnline: friend.isOnline } : null;
    }).filter(Boolean);
    
    socket.emit('friends-list', friendsList);
    console.log(`Friends list sent to ${users.get(socket.id)?.name}:`, friendsList.length, 'friends');
  });

  // Invite friend to session
  socket.on('invite-friend', (friendId) => {
    const currentUser = users.get(socket.id);
    const friend = findUserByUserId(friendId);

    if (currentUser && friend && friend.isOnline && !friend.currentSession) {
      io.to(friend.socketId).emit('session-invite', {
        from: currentUser,
        inviteId: uuidv4()
      });
    }
  });

  // Accept friend invitation
  socket.on('accept-invite', (inviteData) => {
    const currentUser = users.get(socket.id);
    const inviter = findUserByUserId(inviteData.from.id);

    if (currentUser && inviter && !inviter.currentSession) {
      const sessionId = uuidv4();

      const session = {
        id: sessionId,
        users: [currentUser, inviter],
        startTime: new Date(),
        isActive: true
      };

      activeSessions.set(sessionId, session);

      currentUser.currentSession = sessionId;
      inviter.currentSession = sessionId;

      socket.emit('partner-found', { partner: inviter, sessionId });
      io.to(inviter.socketId).emit('partner-found', { partner: currentUser, sessionId });

      socket.join(sessionId);
      io.sockets.sockets.get(inviter.socketId)?.join(sessionId);
    }
  });

  // Direct call invite (Zoom-style link) — client generates the room code
  // itself and already shows its own "waiting" UI, so this is fire-and-
  // forget; no response event needed on success.
  socket.on('create-room', (roomCode) => {
    const currentUser = users.get(socket.id);
    if (!currentUser || !ROOM_CODE_RE.test(roomCode)) return;

    if (currentUser.currentSession) {
      const oldSession = activeSessions.get(currentUser.currentSession);
      // A still-unjoined room this same user created earlier (e.g. browser
      // back button instead of the Cancel button, or a reload) — safe to
      // silently replace with the new one instead of leaving it orphaned
      // AND leaving this create-room call a no-op. Anything else (a real
      // two-person call already in progress) is left alone.
      const isOwnAbandonedRoom = oldSession?.isRoomSession
        && oldSession.users.length === 1
        && oldSession.users[0].id === currentUser.id;
      if (isOwnAbandonedRoom) {
        activeSessions.delete(currentUser.currentSession);
        socket.leave(currentUser.currentSession);
      } else {
        return;
      }
    }

    const session = {
      id: roomCode,
      users: [currentUser],
      startTime: new Date(),
      isActive: true,
      isRoomSession: true
    };

    activeSessions.set(roomCode, session);
    currentUser.currentSession = roomCode;
    socket.join(roomCode);
  });

  socket.on('join-room', (roomCode) => {
    const currentUser = users.get(socket.id);
    if (!currentUser) return;
    if (!ROOM_CODE_RE.test(roomCode)) {
      socket.emit('room-error', { error: 'This invite link is invalid or has expired.' });
      return;
    }

    const session = activeSessions.get(roomCode);
    if (!session) {
      socket.emit('room-error', { error: 'This invite link is invalid or has expired.' });
      return;
    }

    const existingEntry = session.users.find(u => u.id === currentUser.id);

    if (existingEntry) {
      // Rejoin — same participant coming back (grace-period reconnect, or
      // reopening their own still-empty room). Matched by stable id, not
      // currentSession, since a fresh page load never sends resumeSessionId
      // and the generic 'join' handler will already have nulled it.
      const pending = pendingSessionDisconnects.get(currentUser.id);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingSessionDisconnects.delete(currentUser.id);
      }

      existingEntry.socketId = socket.id;
      currentUser.currentSession = roomCode;
      socket.join(roomCode);

      const partner = session.users.find(u => u.id !== currentUser.id);
      if (partner) {
        socket.emit('partner-found', { partner, sessionId: roomCode });
      } else {
        socket.emit('room-waiting', { roomCode });
      }
      return;
    }

    if (session.users.length >= 2) {
      socket.emit('room-error', { error: 'This room is full.' });
      return;
    }

    if (currentUser.currentSession && currentUser.currentSession !== roomCode) {
      socket.emit('room-error', { error: 'You are already in another session.' });
      return;
    }

    // Genuinely a new second participant joining.
    const creator = session.users[0];
    session.users.push(currentUser);
    currentUser.currentSession = roomCode;
    socket.join(roomCode);

    socket.emit('partner-found', { partner: creator, sessionId: roomCode });
    const creatorSocket = io.sockets.sockets.get(creator.socketId);
    if (creatorSocket) {
      creatorSocket.emit('partner-found', { partner: currentUser, sessionId: roomCode });
    }
  });

  // Deliberately abandons a room (the "Cancel" button on the waiting
  // screen) — without this, create-room's own currentSession guard means
  // the room silently lingers forever, and the client's next "Invite
  // someone directly" click generates a link the server refuses to back
  // (currentSession already points at the old, uncancelled room), while
  // the old room is *still* live enough to later deliver a real
  // 'partner-found' for a call this user already walked away from.
  socket.on('leave-room', (roomCode) => {
    const currentUser = users.get(socket.id);
    if (!currentUser || !ROOM_CODE_RE.test(roomCode)) return;

    const session = activeSessions.get(roomCode);
    if (!session) return;

    const idx = session.users.findIndex(u => u.id === currentUser.id);
    if (idx === -1) return;

    session.users.splice(idx, 1);
    if (currentUser.currentSession === roomCode) {
      currentUser.currentSession = null;
    }
    socket.leave(roomCode);

    if (session.users.length > 0) {
      // A partner had already joined when this user left — tell them
      // rather than leaving them stuck waiting on someone who's gone.
      io.to(roomCode).emit('partner-disconnected');
      session.users.forEach(u => { u.currentSession = null; });
    }
    activeSessions.delete(roomCode);
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const user = users.get(socket.id);
    if (user) {
      // Remove from waiting queue
      const queueIndex = waitingQueue.findIndex(u => u.socketId === socket.id);
      if (queueIndex > -1) {
        waitingQueue.splice(queueIndex, 1);
        console.log(`Removed ${user.name} from waiting queue`);
      }
      
      // Don't tear down an active session immediately — the client may be
      // mid-reconnect (Socket.IO transport blip, common on mobile). Give it
      // a grace window; the 'join' handler cancels this if the same user
      // (matched by stable userId) reconnects before it fires.
      if (user.currentSession) {
        const sessionId = user.currentSession;
        const graceMs = activeSessions.get(sessionId)?.isRoomSession
          ? ROOM_DISCONNECT_GRACE_MS
          : DISCONNECT_GRACE_MS;
        const timeout = setTimeout(() => {
          pendingSessionDisconnects.delete(user.id);
          const session = activeSessions.get(sessionId);
          // A room whose creator is still alone in it is just an invite
          // link nobody has opened yet. Tearing it down here would kill a
          // link they've already sent out (and there's no partner to
          // notify anyway) — that's the "this invite link is invalid or
          // has expired" you'd hit just by backgrounding the tab while
          // waiting. Left to the idle sweeper below instead.
          if (session && session.isRoomSession && session.users.length === 1) {
            console.log(`Solo room ${sessionId} kept alive after creator disconnect`);
            return;
          }
          if (session) {
            io.to(sessionId).emit('partner-disconnected');
            session.users.forEach(u => {
              // Only clear it if it's still THIS session — if the user
              // already reconnected and matched into a new one during the
              // grace window, this stale timer must not wipe that out.
              if (u.currentSession === sessionId) {
                u.currentSession = null;
              }
              const otherSocket = io.sockets.sockets.get(u.socketId);
              if (otherSocket) {
                otherSocket.leave(sessionId);
              }
            });
            activeSessions.delete(sessionId);
            console.log(`Session ${sessionId} cleaned up after disconnect grace period`);
          }
        }, graceMs);

        pendingSessionDisconnects.set(user.id, { timeout, sessionId });
      }

      // Mark user as offline but keep in users map for reconnection
      user.isOnline = false;

      // Save users after modification
      saveUsers(users);
      
      console.log(`User marked offline: ${user.name}`);
    }
  });
});

// REST API endpoints
app.get('/api/health', (req, res) => {
  // Healthcheck endpoint for Cloud Run/Railway - return simple OK status
  res.status(200).send('OK');
});

// Short-lived TURN credentials for the relay server.
//
// STUN only tells each peer its public address; it can't help when both
// sides sit behind NATs that refuse a direct path (ICE goes
// "checking" -> "disconnected" and the call connects with no media). TURN
// relays the packets instead. Media stays end-to-end encrypted
// (DTLS-SRTP) — the relay forwards encrypted packets and cannot read them.
//
// Credentials are derived from a shared secret with an expiry baked into
// the username (coturn's use-auth-secret scheme), so nothing long-lived
// ships in the client bundle and a leaked credential dies within hours.
const TURN_SECRET = process.env.TURN_SECRET || '';
const TURN_URLS = (process.env.TURN_URLS || '').split(',').map(u => u.trim()).filter(Boolean);
const TURN_TTL_SECONDS = 12 * 60 * 60;

app.get('/api/turn-credentials', (req, res) => {
  if (!TURN_SECRET || TURN_URLS.length === 0) {
    // Not configured — the client falls back to STUN-only, which still
    // works for most networks.
    return res.json({ iceServers: [] });
  }

  const username = `${Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS}:bodydouble`;
  const credential = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');

  res.json({
    iceServers: [{ urls: TURN_URLS, username, credential }],
    ttl: TURN_TTL_SECONDS
  });
});

app.get('/api/stats', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  let onlineUsers = 0;
  for (const user of users.values()) {
    if (user.isOnline) onlineUsers++;
  }
  res.json({
    onlineUsers,
    activeSessions: activeSessions.size,
    waitingUsers: waitingQueue.length
  });
});



// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.json({ 
    message: 'CORS test successful', 
    cors: 'enabled',
    timestamp: new Date().toISOString()
  });
});

const PORT = parseInt(process.env.PORT) || 5003;

// Add error handling for server startup
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Body Double server running on port ${PORT} - CORS enabled for all origins - v2.6`);
  console.log(`Health endpoint available at: http://localhost:${PORT}/health`);
});
