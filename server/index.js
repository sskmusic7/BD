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
    // Check if user already exists by name (for reconnection)
    let existingUser = null;
    let oldSocketId = null;
    for (const [socketId, user] of users) {
      if (user.name === userData.name) {
        existingUser = user;
        oldSocketId = socketId;
        break;
      }
    }

    if (existingUser && oldSocketId) {
      // Clean up old session if user had one
      if (existingUser.currentSession) {
        const oldSession = activeSessions.get(existingUser.currentSession);
        if (oldSession) {
          // Remove old socket from room
          const oldSocket = io.sockets.sockets.get(oldSocketId);
          if (oldSocket) {
            oldSocket.leave(existingUser.currentSession);
            oldSocket.to(existingUser.currentSession).emit('partner-disconnected');
          }
          // Clean up session
          oldSession.users.forEach(u => {
            if (u.id === oldSocketId) {
              u.currentSession = null;
            }
          });
          activeSessions.delete(existingUser.currentSession);
        }
      }
      
      // Remove from waiting queue if present
      const queueIndex = waitingQueue.findIndex(u => u.id === oldSocketId);
      if (queueIndex > -1) {
        waitingQueue.splice(queueIndex, 1);
      }
      
      // Remove old user entry
      users.delete(oldSocketId);
      
      // Update existing user with new socket ID
      existingUser.id = socket.id;
      existingUser.isOnline = true;
      existingUser.currentSession = null;
      users.set(socket.id, existingUser);
      socket.emit('joined', { userId: socket.id, user: existingUser });
      console.log('User reconnected:', existingUser.name, 'from', oldSocketId, 'to', socket.id);
    } else {
      // Create new user
      const user = {
        id: socket.id,
        ...userData,
        isOnline: true,
        currentSession: null
      };
      users.set(socket.id, user);
      socket.emit('joined', { userId: socket.id, user });
      console.log('New user joined:', user.name);
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

    // Don't allow matching if user already in a session
    if (currentUser.currentSession) {
      console.log('find-partner: User already in session', currentUser.name);
      socket.emit('waiting-for-partner'); // Still show waiting to avoid UI confusion
      return;
    }

    // Remove from queue if already waiting
    const existingIndex = waitingQueue.findIndex(u => u.id === socket.id);
    if (existingIndex > -1) {
      waitingQueue.splice(existingIndex, 1);
    }

    // Filter queue to only include users who are online and not in sessions
    const availablePartners = waitingQueue.filter(u => {
      const user = users.get(u.id);
      return user && user.isOnline && !user.currentSession;
    });
    
    // Update queue to only valid users
    waitingQueue.length = 0;
    waitingQueue.push(...availablePartners);

    // Find available partner from queue
    if (availablePartners.length > 0) {
      const partner = availablePartners.shift();
      const partnerUser = users.get(partner.id);
      
      // Double-check partner is still available
      if (!partnerUser || !partnerUser.isOnline || partnerUser.currentSession) {
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
      socket.emit('partner-found', { partner: partnerUser, sessionId });
      io.to(partner.id).emit('partner-found', { partner: currentUser, sessionId });
      
      // Join both to session room
      socket.join(sessionId);
      const partnerSocket = io.sockets.sockets.get(partner.id);
      if (partnerSocket) {
        partnerSocket.join(sessionId);
      }
      
      console.log(`Matched: ${currentUser.name} <-> ${partnerUser.name} (session: ${sessionId})`);
      
    } else {
      // Add to waiting queue
      waitingQueue.push(currentUser);
      socket.emit('waiting-for-partner');
      console.log(`User ${currentUser.name} added to waiting queue (${waitingQueue.length} waiting)`);
    }
  });

  // Cancel search
  socket.on('cancel-search', () => {
    const index = waitingQueue.findIndex(u => u.id === socket.id);
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
          const sessionUser = users.get(u.id);
          if (sessionUser) {
            sessionUser.currentSession = null;
          }
          // Leave room for other user
          const otherSocket = io.sockets.sockets.get(u.id);
          if (otherSocket && u.id !== socket.id) {
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
    const friend = users.get(friendId);
    
    if (currentUser && friend && friend.isOnline && !friend.currentSession) {
      io.to(friendId).emit('session-invite', {
        from: currentUser,
        inviteId: uuidv4()
      });
    }
  });

  // Accept friend invitation
  socket.on('accept-invite', (inviteData) => {
    const currentUser = users.get(socket.id);
    const inviter = users.get(inviteData.from.id);
    
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
      io.to(inviter.id).emit('partner-found', { partner: currentUser, sessionId });
      
      socket.join(sessionId);
      io.sockets.sockets.get(inviter.id)?.join(sessionId);
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const user = users.get(socket.id);
    if (user) {
      // Remove from waiting queue
      const queueIndex = waitingQueue.findIndex(u => u.id === socket.id);
      if (queueIndex > -1) {
        waitingQueue.splice(queueIndex, 1);
        console.log(`Removed ${user.name} from waiting queue`);
      }
      
      // End active session
      if (user.currentSession) {
        const session = activeSessions.get(user.currentSession);
        if (session) {
          // Notify partner
          socket.to(user.currentSession).emit('partner-disconnected');
          
          // Leave session room
          socket.leave(user.currentSession);
          
          // Clean up session - update all users in session
          session.users.forEach(u => {
            const sessionUser = users.get(u.id);
            if (sessionUser) {
              sessionUser.currentSession = null;
            }
            // Leave room for other user
            const otherSocket = io.sockets.sockets.get(u.id);
            if (otherSocket && u.id !== socket.id) {
              otherSocket.leave(user.currentSession);
            }
          });
          
          activeSessions.delete(user.currentSession);
          console.log(`Session ${session.id} cleaned up due to disconnect`);
        }
      }
      
      // Mark user as offline but keep in users map for reconnection
      user.isOnline = false;
      user.currentSession = null;
      
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
