const config = {
  development: {
    SERVER_URL: 'http://localhost:5003',
    CONVEX_URL: process.env.REACT_APP_CONVEX_URL || ''
  },
  production: {
    SERVER_URL: process.env.REACT_APP_SERVER_URL || 'https://your-backend-url.com',
    CONVEX_URL: process.env.REACT_APP_CONVEX_URL || ''
  }
};

const environment = process.env.NODE_ENV || 'development';

export default config[environment];
