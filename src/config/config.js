const config = {
  development: {
    SERVER_URL: 'http://localhost:5003',
    CONVEX_URL: process.env.REACT_APP_CONVEX_URL || ''
  },
  production: {
    SERVER_URL: process.env.REACT_APP_SERVER_URL || 'https://bodydouble-backend-x2x4tp5wra-uc.a.run.app',
    CONVEX_URL: process.env.REACT_APP_CONVEX_URL || ''
  }
};

const environment = process.env.NODE_ENV || 'development';

export default config[environment];
