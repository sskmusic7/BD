const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const http = require('http');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');

// Create a full test server (API + Socket.IO)
function createFullTestServer() {
  const app = express();
  const server = http.createServer(app);
  
  app.use(cors({ origin: "*", credentials: true }));
  app.use(express.json());
  
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
  
  const users = new Map();
  const waitingQueue = [];
  const activeSessions = new Map();
  
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
  });
  
  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });
  
  app.get('/api/stats', (req, res) => {
    res.json({
      onlineUsers: users.size,
      activeSessions: activeSessions.size,
      waitingUsers: waitingQueue.length
    });
  });
  
  return { app, server, io, users, waitingQueue, activeSessions };
}

describe('Integration Tests', () => {
  let app, server, users;
  let clientSocket;
  
  beforeAll((done) => {
    const testServer = createFullTestServer();
    app = testServer.app;
    server = testServer.server;
    users = testServer.users;
    
    server.listen(0, () => {
      const port = server.address().port;
      clientSocket = ioClient(`http://localhost:${port}`, {
        transports: ['websocket']
      });
      clientSocket.on('connect', () => done());
    });
  });
  
  afterAll((done) => {
    if (clientSocket) clientSocket.close();
    if (server) server.close(done);
  });
  
  beforeEach(() => {
    users.clear();
  });
  
  describe('API and Socket.IO Integration', () => {
    test('stats endpoint should reflect socket connections', async () => {
      // Initially no users
      let response = await request(app).get('/api/stats');
      expect(response.body.onlineUsers).toBe(0);
      
      // Connect a user via socket
      await new Promise((resolve) => {
        clientSocket.once('joined', () => resolve());
        clientSocket.emit('join', { name: 'TestUser' });
      });
      
      // Stats should now show 1 user
      response = await request(app).get('/api/stats');
      expect(response.body.onlineUsers).toBe(1);
    });
    
    test('health endpoint should work while socket connections are active', async () => {
      // Connect a user
      await new Promise((resolve) => {
        clientSocket.once('joined', () => resolve());
        clientSocket.emit('join', { name: 'TestUser' });
      });
      
      // Health should still work
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });
  });
  
  describe('CORS Integration', () => {
    test('API endpoints should have CORS headers', async () => {
      const response = await request(app)
        .get('/api/stats')
        .set('Origin', 'https://example.com');
      
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
    
    test('Socket.IO should accept connections from any origin', (done) => {
      const socket = ioClient(`http://localhost:${server.address().port}`, {
        transports: ['websocket']
      });
      
      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        socket.close();
        done();
      });
    });
  });
  
  describe('Concurrent Operations', () => {
    test('should handle multiple simultaneous connections', async () => {
      const sockets = [];
      const connectionPromises = [];
      
      // Create 5 simultaneous connections
      for (let i = 0; i < 5; i++) {
        const socket = ioClient(`http://localhost:${server.address().port}`, {
          transports: ['websocket']
        });
        sockets.push(socket);
        
        connectionPromises.push(
          new Promise((resolve) => {
            socket.on('connect', () => {
              socket.emit('join', { name: `User${i}` });
              socket.once('joined', resolve);
            });
          })
        );
      }
      
      await Promise.all(connectionPromises);
      
      // Check stats
      const response = await request(app).get('/api/stats');
      expect(response.body.onlineUsers).toBe(5);
      
      // Cleanup
      sockets.forEach(s => s.close());
    });
  });
});

