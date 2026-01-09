# Backend Test Suite

Comprehensive test suite for the BodyDouble backend server.

## Test Structure

- **`api.test.js`** - REST API endpoint tests
- **`socket.test.js`** - Socket.IO event tests
- **`integration.test.js`** - Integration tests for API + Socket.IO
- **`helpers/test-server.js`** - Test server helper utilities

## Running Tests

### Run all tests
```bash
npm run test:server
```

### Run tests in watch mode
```bash
npm run test:server:watch
```

### Run specific test file
```bash
npx jest server/tests/api.test.js
```

### Run with coverage
```bash
npm run test:server -- --coverage
```

## Test Coverage

### API Endpoints
- ✅ GET /health
- ✅ GET /api/health
- ✅ GET /api/stats
- ✅ GET /api/cors-test
- ✅ OPTIONS (CORS preflight)
- ✅ 404 handling

### Socket.IO Events
- ✅ Connection
- ✅ join
- ✅ find-partner
- ✅ cancel-search
- ✅ session-message
- ✅ end-session
- ✅ add-friend
- ✅ get-friends
- ✅ disconnect

### Integration
- ✅ API + Socket.IO integration
- ✅ CORS across all endpoints
- ✅ Concurrent connections
- ✅ Stats accuracy

## Test Environment

Tests use a separate data directory (`data-test`) to avoid interfering with production data.

## Adding New Tests

1. Create test file in `server/tests/`
2. Follow existing test patterns
3. Use `beforeAll`/`afterAll` for setup/teardown
4. Use `beforeEach` to reset state between tests
5. Run tests before committing

## Continuous Integration

These tests should be run:
- Before committing code
- In CI/CD pipeline
- Before deploying to production

