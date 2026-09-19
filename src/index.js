import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { registerServiceWorker } from './utils/push';

// Demo/legacy matching path — no Convex Auth gate.
// ConvexAuthProvider can be re-enabled later for friends/invites.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registered up front so the worker is installed and ready by the time
// someone taps Enable — subscribing is only permitted from a user gesture,
// and waiting for registration inside that gesture can lose it. Registration
// alone shows no prompt and asks for nothing.
registerServiceWorker();
