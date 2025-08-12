const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

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
    credentials: true
  }
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

// In-memory storage (replace with database in production)
const users = new Map();
const waitingQueue = [];
const activeSessions = new Map();
const friendships = new Map();

// Socket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins with profile info
  socket.on('join', (userData) => {
    const user = {
      id: socket.id,
      ...userData,
      isOnline: true,
      currentSession: null
    };
    users.set(socket.id, user);
    socket.emit('joined', { userId: socket.id, user });
  });

  // Find random partner
  socket.on('find-partner', () => {
    const currentUser = users.get(socket.id);
    if (!currentUser) return;

    // Remove from queue if already waiting
    const existingIndex = waitingQueue.findIndex(u => u.id === socket.id);
    if (existingIndex > -1) {
      waitingQueue.splice(existingIndex, 1);
    }

    // Find available partner from queue
    if (waitingQueue.length > 0) {
      const partner = waitingQueue.shift();
      const sessionId = uuidv4();
      
      // Create session
      const session = {
        id: sessionId,
        users: [currentUser, partner],
        startTime: new Date(),
        isActive: true
      };
      
      activeSessions.set(sessionId, session);
      
      // Update user sessions
      currentUser.currentSession = sessionId;
      partner.currentSession = sessionId;
      
      // Notify both users
      socket.emit('partner-found', { partner, sessionId });
      io.to(partner.id).emit('partner-found', { partner: currentUser, sessionId });
      
      // Join both to session room
      socket.join(sessionId);
      io.sockets.sockets.get(partner.id)?.join(sessionId);
      
    } else {
      // Add to waiting queue
      waitingQueue.push(currentUser);
      socket.emit('waiting-for-partner');
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
        
        // Clean up session
        session.users.forEach(u => u.currentSession = null);
        activeSessions.delete(user.currentSession);
        user.currentSession = null;
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
      
      // Notify both users
      socket.emit('friend-added', friend);
      io.to(friendId).emit('friend-added', currentUser);
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
      }
      
      // End active session
      if (user.currentSession) {
        const session = activeSessions.get(user.currentSession);
        if (session) {
          socket.to(user.currentSession).emit('partner-disconnected');
          session.users.forEach(u => u.currentSession = null);
          activeSessions.delete(user.currentSession);
        }
      }
      
      // Mark user as offline
      user.isOnline = false;
    }
    
    users.delete(socket.id);
  });
});

// REST API endpoints
app.get('/api/health', (req, res) => {
  // Railway healthcheck - return simple OK status
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

// Separate health endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).send('OK');
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
server.listen(PORT, () => {
  console.log(`Body Double server running on port ${PORT} - CORS enabled for all origins - v2.1`);
});
