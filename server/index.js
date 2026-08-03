const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

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
// Keyed by stable user id (userData.userId), value: { timeout, sessionId }
const pendingSessionDisconnects = new Map();

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
        const timeout = setTimeout(() => {
          pendingSessionDisconnects.delete(user.id);
          const session = activeSessions.get(sessionId);
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
        }, DISCONNECT_GRACE_MS);

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

app.get('/api/stats', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.json({
    onlineUsers: users.size,
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
