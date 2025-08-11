import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import io from 'socket.io-client';
import config from './config/config';
import HomePage from './components/HomePage';
import SessionPage from './components/SessionPage';
import ProfileSetup from './components/ProfileSetup';
import FriendsPage from './components/FriendsPage';
import Navbar from './components/Navbar';

function App() {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(config.SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    newSocket.on('joined', (data) => {
      setUser(data.user);
    });

    newSocket.on('partner-found', (data) => {
      setCurrentSession({
        id: data.sessionId,
        partner: data.partner,
        startTime: new Date()
      });
    });

    newSocket.on('session-ended', () => {
      setCurrentSession(null);
    });

    newSocket.on('partner-disconnected', () => {
      setCurrentSession(null);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const handleProfileComplete = (profileData) => {
    if (socket) {
      socket.emit('join', profileData);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentSession(null);
    if (socket) {
      socket.disconnect();
      const newSocket = io(config.SERVER_URL);
      setSocket(newSocket);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 shadow-2xl">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 text-center">Connecting to BodyDouble...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <ProfileSetup onComplete={handleProfileComplete} />;
  }

  if (currentSession) {
    return (
      <SessionPage 
        socket={socket}
        session={currentSession}
        user={user}
        onEndSession={() => setCurrentSession(null)}
      />
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600">
        <Navbar user={user} onLogout={handleLogout} />
        <Routes>
          <Route 
            path="/" 
            element={
              <HomePage 
                socket={socket}
                user={user}
              />
            } 
          />
          <Route 
            path="/friends" 
            element={
              <FriendsPage 
                socket={socket}
                user={user}
              />
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
