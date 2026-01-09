const { io: ioClient } = require('socket.io-client');
const http = require('http');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Create a test server with Socket.IO
function createSocketTestServer() {
  const app = express();
  const server = http.createServer(app);
  
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
  const friendships = new Map();
  
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
    
    socket.on('find-partner', () => {
      const currentUser = users.get(socket.id);
      if (!currentUser) return;
      
      const existingIndex = waitingQueue.findIndex(u => u.id === socket.id);
      if (existingIndex > -1) {
        waitingQueue.splice(existingIndex, 1);
      }
      
      if (waitingQueue.length > 0) {
        const partner = waitingQueue.shift();
        const sessionId = uuidv4();
        
        const session = {
          id: sessionId,
          users: [currentUser, partner],
          startTime: new Date(),
          isActive: true
        };
        
        activeSessions.set(sessionId, session);
        currentUser.currentSession = sessionId;
        partner.currentSession = sessionId;
        
        socket.emit('partner-found', { partner, sessionId });
        io.to(partner.id).emit('partner-found', { partner: currentUser, sessionId });
        
        socket.join(sessionId);
        io.sockets.sockets.get(partner.id)?.join(sessionId);
      } else {
        waitingQueue.push(currentUser);
        socket.emit('waiting-for-partner');
      }
    });
    
    socket.on('cancel-search', () => {
      const index = waitingQueue.findIndex(u => u.id === socket.id);
      if (index > -1) {
        waitingQueue.splice(index, 1);
        socket.emit('search-cancelled');
      }
    });
    
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
    
    socket.on('end-session', () => {
      const user = users.get(socket.id);
      if (user && user.currentSession) {
        const session = activeSessions.get(user.currentSession);
        if (session) {
          socket.to(user.currentSession).emit('session-ended');
          session.users.forEach(u => u.currentSession = null);
          activeSessions.delete(user.currentSession);
          user.currentSession = null;
        }
      }
    });
    
    socket.on('add-friend', (friendId) => {
      const currentUser = users.get(socket.id);
      const friend = users.get(friendId);
      
      if (currentUser && friend) {
        if (!friendships.has(socket.id)) {
          friendships.set(socket.id, new Set());
        }
        if (!friendships.has(friendId)) {
          friendships.set(friendId, new Set());
        }
        
        friendships.get(socket.id).add(friendId);
        friendships.get(friendId).add(socket.id);
        
        socket.emit('friend-added', friend);
        io.to(friendId).emit('friend-added', currentUser);
      }
    });
    
    socket.on('get-friends', () => {
      const userFriends = friendships.get(socket.id) || new Set();
      const friendsList = Array.from(userFriends).map(friendId => {
        const friend = users.get(friendId);
        return friend ? { ...friend, isOnline: friend.isOnline } : null;
      }).filter(Boolean);
      
      socket.emit('friends-list', friendsList);
    });
    
    socket.on('disconnect', () => {
      const user = users.get(socket.id);
      if (user) {
        const queueIndex = waitingQueue.findIndex(u => u.id === socket.id);
        if (queueIndex > -1) {
          waitingQueue.splice(queueIndex, 1);
        }
        
        if (user.currentSession) {
          const session = activeSessions.get(user.currentSession);
          if (session) {
            socket.to(user.currentSession).emit('partner-disconnected');
            session.users.forEach(u => u.currentSession = null);
            activeSessions.delete(user.currentSession);
          }
        }
        
        user.isOnline = false;
        user.currentSession = null;
      }
    });
  });
  
  return { server, io, users, waitingQueue, activeSessions, friendships };
}

describe('Socket.IO Events', () => {
  let server, io, users, waitingQueue, activeSessions, friendships;
  let clientSocket1, clientSocket2;
  
  beforeAll((done) => {
    const testServer = createSocketTestServer();
    server = testServer.server;
    io = testServer.io;
    users = testServer.users;
    waitingQueue = testServer.waitingQueue;
    activeSessions = testServer.activeSessions;
    friendships = testServer.friendships;
    
    server.listen(0, () => {
      const port = server.address().port;
      clientSocket1 = ioClient(`http://localhost:${port}`, {
        transports: ['websocket']
      });
      clientSocket2 = ioClient(`http://localhost:${port}`, {
        transports: ['websocket']
      });
      
      // Wait for connections
      Promise.all([
        new Promise(resolve => clientSocket1.on('connect', resolve)),
        new Promise(resolve => clientSocket2.on('connect', resolve))
      ]).then(() => done());
    });
  });
  
  afterAll((done) => {
    if (clientSocket1) clientSocket1.close();
    if (clientSocket2) clientSocket2.close();
    if (server) server.close(done);
  });
  
  beforeEach(() => {
    users.clear();
    waitingQueue.length = 0;
    activeSessions.clear();
    friendships.clear();
  });
  
  describe('Connection', () => {
    test('should connect successfully', (done) => {
      const socket = ioClient(`http://localhost:${server.address().port}`);
      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        socket.close();
        done();
      });
    });
  });
  
  describe('join event', () => {
    test('should join with user data', (done) => {
      const userData = { name: 'TestUser', preferences: {} };
      clientSocket1.once('joined', (data) => {
        expect(data).toHaveProperty('userId');
        expect(data).toHaveProperty('user');
        expect(data.user.name).toBe('TestUser');
        expect(users.has(data.userId)).toBe(true);
        done();
      });
      clientSocket1.emit('join', userData);
    });
    
    test('should set user as online', (done) => {
      const userData = { name: 'TestUser2' };
      clientSocket1.once('joined', (data) => {
        const user = users.get(data.userId);
        expect(user.isOnline).toBe(true);
        done();
      });
      clientSocket1.emit('join', userData);
    });
  });
  
  describe('find-partner event', () => {
    test('should add user to waiting queue when no partners available', (done) => {
      clientSocket1.once('joined', () => {
        clientSocket1.once('waiting-for-partner', () => {
          expect(waitingQueue.length).toBe(1);
          expect(waitingQueue[0].id).toBe(clientSocket1.id);
          done();
        });
        clientSocket1.emit('find-partner');
      });
      clientSocket1.emit('join', { name: 'User1' });
    });
    
    test('should match two users when both are waiting', (done) => {
      let partnerFoundCount = 0;
      
      const checkDone = () => {
        partnerFoundCount++;
        if (partnerFoundCount === 2) {
          expect(activeSessions.size).toBe(1);
          const session = Array.from(activeSessions.values())[0];
          expect(session.users.length).toBe(2);
          done();
        }
      };
      
      clientSocket1.once('joined', () => {
        clientSocket1.once('partner-found', (data) => {
          expect(data).toHaveProperty('partner');
          expect(data).toHaveProperty('sessionId');
          checkDone();
        });
        clientSocket1.emit('find-partner');
      });
      
      clientSocket2.once('joined', () => {
        clientSocket2.once('partner-found', (data) => {
          expect(data).toHaveProperty('partner');
          expect(data).toHaveProperty('sessionId');
          checkDone();
        });
        clientSocket2.emit('find-partner');
      });
      
      clientSocket1.emit('join', { name: 'User1' });
      clientSocket2.emit('join', { name: 'User2' });
    });
  });
  
  describe('cancel-search event', () => {
    test('should remove user from waiting queue', (done) => {
      clientSocket1.once('joined', () => {
        clientSocket1.once('waiting-for-partner', () => {
          expect(waitingQueue.length).toBe(1);
          clientSocket1.once('search-cancelled', () => {
            expect(waitingQueue.length).toBe(0);
            done();
          });
          clientSocket1.emit('cancel-search');
        });
        clientSocket1.emit('find-partner');
      });
      clientSocket1.emit('join', { name: 'User1' });
    });
  });
  
  describe('session-message event', () => {
    test('should broadcast message to session partner', (done) => {
      let sessionId;
      
      clientSocket1.once('joined', () => {
        clientSocket1.once('partner-found', (data) => {
          sessionId = data.sessionId;
          clientSocket2.once('session-message', (data) => {
            expect(data).toHaveProperty('from');
            expect(data).toHaveProperty('timestamp');
            done();
          });
          clientSocket1.emit('session-message', { text: 'Hello' });
        });
        clientSocket1.emit('find-partner');
      });
      
      clientSocket2.once('joined', () => {
        clientSocket2.once('partner-found', () => {
          // Wait for message
        });
        clientSocket2.emit('find-partner');
      });
      
      clientSocket1.emit('join', { name: 'User1' });
      clientSocket2.emit('join', { name: 'User2' });
    });
  });
  
  describe('end-session event', () => {
    test('should emit session-ended to partner when session is ended', (done) => {
      // Wait for both users to join and match
      Promise.all([
        new Promise(resolve => {
          clientSocket1.once('joined', () => {
            clientSocket1.once('partner-found', resolve);
            clientSocket1.emit('find-partner');
          });
          clientSocket1.emit('join', { name: 'User1' });
        }),
        new Promise(resolve => {
          clientSocket2.once('joined', () => {
            clientSocket2.once('partner-found', resolve);
            clientSocket2.emit('find-partner');
          });
          clientSocket2.emit('join', { name: 'User2' });
        })
      ]).then(() => {
        // Both matched, now test end-session
        clientSocket2.once('session-ended', () => {
          // Event was received, test passes
          done();
        });
        // Small delay to ensure both are ready
        setTimeout(() => {
          clientSocket1.emit('end-session');
        }, 200);
      });
    }, 15000);
  });
  
  describe('add-friend event', () => {
    test('should add friendship between two users', (done) => {
      let user1Id, user2Id;
      
      clientSocket1.once('joined', (data) => {
        user1Id = data.userId;
        clientSocket2.once('joined', (data) => {
          user2Id = data.userId;
          clientSocket1.once('friend-added', (friend) => {
            expect(friendships.has(user1Id)).toBe(true);
            expect(friendships.has(user2Id)).toBe(true);
            expect(friendships.get(user1Id).has(user2Id)).toBe(true);
            expect(friendships.get(user2Id).has(user1Id)).toBe(true);
            done();
          });
          clientSocket1.emit('add-friend', user2Id);
        });
        clientSocket2.emit('join', { name: 'User2' });
      });
      clientSocket1.emit('join', { name: 'User1' });
    });
  });
  
  describe('get-friends event', () => {
    test('should return friends list', (done) => {
      let user1Id, user2Id;
      
      clientSocket1.once('joined', (data) => {
        user1Id = data.userId;
        clientSocket2.once('joined', (data) => {
          user2Id = data.userId;
          clientSocket1.once('friend-added', () => {
            clientSocket1.once('friends-list', (friends) => {
              expect(Array.isArray(friends)).toBe(true);
              expect(friends.length).toBe(1);
              expect(friends[0].id).toBe(user2Id);
              done();
            });
            clientSocket1.emit('get-friends');
          });
          clientSocket1.emit('add-friend', user2Id);
        });
        clientSocket2.emit('join', { name: 'User2' });
      });
      clientSocket1.emit('join', { name: 'User1' });
    });
  });
  
  describe('disconnect event', () => {
    test('should mark user as offline on disconnect', (done) => {
      clientSocket1.once('joined', (data) => {
        const userId = data.userId;
        expect(users.get(userId).isOnline).toBe(true);
        clientSocket1.disconnect();
        
        setTimeout(() => {
          const user = users.get(userId);
          if (user) {
            expect(user.isOnline).toBe(false);
          }
          done();
        }, 200);
      });
      clientSocket1.emit('join', { name: 'User1' });
    }, 10000);
    
    test('should remove user from waiting queue on disconnect', (done) => {
      // Create a fresh socket for this test
      const testSocket = ioClient(`http://localhost:${server.address().port}`, {
        transports: ['websocket']
      });
      
      testSocket.on('connect', () => {
        testSocket.once('joined', () => {
          testSocket.once('waiting-for-partner', () => {
            expect(waitingQueue.length).toBe(1);
            testSocket.disconnect();
            
            // Check queue after disconnect
            setTimeout(() => {
              expect(waitingQueue.length).toBe(0);
              testSocket.close();
              done();
            }, 300);
          });
          testSocket.emit('find-partner');
        });
        testSocket.emit('join', { name: 'TestUser' });
      });
    }, 10000);
  });
});

