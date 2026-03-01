import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import './index.css';
import App from './App';
import config from './config/config';

const convexUrl = config.CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {convex ? (
      <ConvexAuthProvider client={convex}>
        <App useConvexAuth />
      </ConvexAuthProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
