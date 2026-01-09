const request = require('supertest');
const http = require('http');
const express = require('express');
const socketIo = require('socket.io');
const cors = require('cors');

// Create a minimal test server
function createTestApp() {
  const app = express();
  const server = http.createServer(app);
  
  // CORS middleware
  app.use(cors({ origin: "*", credentials: true }));
  app.use(express.json());
  
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
  
  // Health endpoints
  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });
  
  app.get('/api/health', (req, res) => {
    res.status(200).send('OK');
  });
  
  // Stats endpoint
  app.get('/api/stats', (req, res) => {
    res.json({
      onlineUsers: 0,
      activeSessions: 0,
      waitingUsers: 0
    });
  });
  
  // CORS test endpoint
  app.get('/api/cors-test', (req, res) => {
    res.json({ 
      message: 'CORS test successful', 
      cors: 'enabled',
      timestamp: new Date().toISOString()
    });
  });
  
  return { app, server };
}

describe('REST API Endpoints', () => {
  let app, server;
  
  beforeAll(() => {
    const testApp = createTestApp();
    app = testApp.app;
    server = testApp.server;
  });
  
  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });
  
  describe('GET /health', () => {
    test('should return 200 OK', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });
    
    test('should have CORS headers', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });
  
  describe('GET /api/health', () => {
    test('should return 200 OK', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });
  });
  
  describe('GET /api/stats', () => {
    test('should return stats object', async () => {
      const response = await request(app).get('/api/stats');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('onlineUsers');
      expect(response.body).toHaveProperty('activeSessions');
      expect(response.body).toHaveProperty('waitingUsers');
      expect(typeof response.body.onlineUsers).toBe('number');
      expect(typeof response.body.activeSessions).toBe('number');
      expect(typeof response.body.waitingUsers).toBe('number');
    });
    
    test('should have CORS headers', async () => {
      const response = await request(app).get('/api/stats');
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });
  
  describe('GET /api/cors-test', () => {
    test('should return CORS test response', async () => {
      const response = await request(app).get('/api/cors-test');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('cors');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.message).toBe('CORS test successful');
      expect(response.body.cors).toBe('enabled');
    });
  });
  
  describe('OPTIONS (CORS Preflight)', () => {
    test('should handle OPTIONS request', async () => {
      const response = await request(app).options('/api/stats');
      // OPTIONS requests typically return 204 (No Content) or 200
      expect([200, 204]).toContain(response.status);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
    
    test('should allow all origins', async () => {
      const response = await request(app)
        .options('/api/stats')
        .set('Origin', 'https://example.com');
      // OPTIONS requests typically return 204 (No Content) or 200
      expect([200, 204]).toContain(response.status);
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });
  
  describe('404 Handling', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/unknown');
      expect(response.status).toBe(404);
    });
  });
});

