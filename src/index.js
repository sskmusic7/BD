import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Demo/legacy matching path — no Convex Auth gate.
// ConvexAuthProvider can be re-enabled later for friends/invites.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
