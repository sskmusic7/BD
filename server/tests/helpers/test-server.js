// Helper to create a test server instance
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Use a separate data directory for tests
const TEST_DATA_DIR = path.join(__dirname, '../../data-test');

// Clean test data directory before each test
function cleanTestData() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

// Create a test server instance
function createTestServer() {
  cleanTestData();
  
  // Temporarily override the data directory
  const originalDataDir = path.join(__dirname, '../../data');
  const originalUsersFile = path.join(originalDataDir, 'users.json');
  const originalFriendshipsFile = path.join(originalDataDir, 'friendships.json');
  
  // Mock the data directory for tests
  const mockDataDir = TEST_DATA_DIR;
  const mockUsersFile = path.join(mockDataDir, 'users.json');
  const mockFriendshipsFile = path.join(mockDataDir, 'friendships.json');
  
  // Create a fresh server instance
  const app = express();
  const server = http.createServer(app);
  
  // Apply CORS
  app.use(cors({ origin: "*", credentials: true }));
  app.use(express.json());
  
  // CORS headers middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
  });
  
  app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(200);
  });
  
  const io = socketIo(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    }
  });
  
  // In-memory storage for tests
  const users = new Map();
  const waitingQueue = [];
  const activeSessions = new Map();
  const friendships = new Map();
  
  // Health endpoints
  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });
  
  app.get('/api/health', (req, res) => {
    res.status(200).send('OK');
  });
  
  app.get('/api/stats', (req, res) => {
    res.json({
      onlineUsers: users.size,
      activeSessions: activeSessions.size,
      waitingUsers: waitingQueue.length
    });
  });
  
  app.get('/api/cors-test', (req, res) => {
    res.json({ 
      message: 'CORS test successful', 
      cors: 'enabled',
      timestamp: new Date().toISOString()
    });
  });
  
  // Socket.IO handlers (simplified for testing)
  io.on('connection', (socket) => {
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
    
    socket.on('disconnect', () => {
      const user = users.get(socket.id);
      if (user) {
        user.isOnline = false;
        const queueIndex = waitingQueue.findIndex(u => u.id === socket.id);
        if (queueIndex > -1) {
          waitingQueue.splice(queueIndex, 1);
        }
      }
    });
  });
  
  return { app, server, io, users, waitingQueue, activeSessions, friendships, cleanTestData };
}

module.exports = { createTestServer, cleanTestData };

