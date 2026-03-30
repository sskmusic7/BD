import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import io from 'socket.io-client';
// import { useQuery, useMutation } from 'convex/react';
// import { api } from './convexApi';
import config from './config/config';
import { BackgroundProvider, useBackground } from './context/BackgroundContext';
import HomePage from './components/HomePage';
import SessionPage from './components/SessionPage';
import ProfileSetup from './components/ProfileSetup';
// import ProfileSetupConvex from './components/ProfileSetupConvex';
import FriendsPage from './components/FriendsPage';
import Navbar from './components/Navbar';
import BackgroundSelector from './components/BackgroundSelector';
// import AuthScreen from './components/AuthScreen';
import InviteLanding from './components/InviteLanding';
// import { googleAuthService } from './services/googleAuthService';

// Background renderer component that handles both image/gif and video
const BackgroundRenderer = ({ children }) => {
  const { backgrounds, currentIndex } = useBackground();
  const currentBg = backgrounds[currentIndex];

  if (currentBg.type === 'video') {
    return (
      <div className="min-h-screen relative">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover -z-10"
          style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}
        >
          <source src={currentBg.path} type="video/mp4" />
        </video>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{
      background: `url(${currentBg.path}) no-repeat center center`,
      backgroundSize: 'cover',
      backgroundAttachment: 'fixed'
    }}>
      {children}
    </div>
  );
};

function AppContentLegacy() {
  const { currentBackground } = useBackground();
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(config.SERVER_URL);
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Separate effect for socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      setIsConnected(true);
      console.log('Connected to server');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    };

    const handleJoined = (data) => {
      setUser(data.user);
    };

    const handlePartnerFound = (data) => {
      setCurrentSession({
        id: data.sessionId,
        partner: data.partner,
        startTime: new Date()
      });
    };

    const handleSessionEnded = () => {
      setCurrentSession(null);
    };

    const handlePartnerDisconnected = () => {
      setCurrentSession(null);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('joined', handleJoined);
    socket.on('partner-found', handlePartnerFound);
    socket.on('session-ended', handleSessionEnded);
    socket.on('partner-disconnected', handlePartnerDisconnected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('joined', handleJoined);
      socket.off('partner-found', handlePartnerFound);
      socket.off('session-ended', handleSessionEnded);
      socket.off('partner-disconnected', handlePartnerDisconnected);
    };
  }, [socket]);

  const handleProfileComplete = (profileData) => {
    if (socket) {
      socket.emit('join', profileData);
    }
  };

  const handleLogout = () => {
    // Clean up current session
    if (currentSession && socket) {
      socket.emit('end-session');
    }
    
    // Disconnect current socket
    if (socket) {
      socket.disconnect();
    }
    
    // Reset all state
    setUser(null);
    setCurrentSession(null);
    setSocket(null);
    
    // Create fresh socket connection
    const newSocket = io(config.SERVER_URL);
    setSocket(newSocket);
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg p-8 shadow-2xl">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 text-center">Connecting to BodyDouble...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <ProfileSetup onComplete={handleProfileComplete} />;
  }

  return (
    <Router>
      <div className="min-h-screen" style={{
        background: `url(${currentBackground}) no-repeat center center`,
        backgroundSize: 'cover'
      }}>
        <Navbar user={user} onLogout={handleLogout} />
        <BackgroundSelector />
        <Routes>
          <Route path="/" element={<HomePage socket={socket} user={user} />} />
          <Route path="/friends" element={<FriendsPage socket={socket} user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

// DEMO MODE: Simple app without auth/Convex
function AppContentDemo() {
  const initialUser = {
    id: 'demo_user_' + Date.now(),
    name: 'Demo User',
    focusStyle: 'Body Doubling',
    workType: 'Creative Work',
    sessionLength: '25 minutes',
    adhdType: 'Inattentive'
  };
  const [user, setUser] = useState(initialUser);
  const [socket, setSocket] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [isSocketReady, setIsSocketReady] = useState(false);

  // Initialize socket connection for demo mode
  useEffect(() => {
    // CRITICAL FIX: Create socket with autoConnect=false to prevent race condition
    // This ensures all event handlers are attached before connection occurs
    const newSocket = io(config.SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling']
    });

    // Define handlers BEFORE setting up events
    const handleJoined = (data) => {
      console.log('Demo mode: Joined queue', data);
      if (data.user) {
        // Update user with server-assigned data (like socket id)
        setUser(prevUser => ({
          ...prevUser,
          id: data.user.id || prevUser.id
        }));
      }
    };

    const handlePartnerFound = (data) => {
      console.log('Demo mode: Partner found!', data);
      setCurrentSession({
        id: data.sessionId,
        partner: data.partner,
        startTime: new Date()
      });
    };

    const handleSessionEnded = () => {
      console.log('Demo mode: Session ended');
      setCurrentSession(null);
    };

    const handlePartnerDisconnected = () => {
      console.log('Demo mode: Partner disconnected');
      setCurrentSession(null);
    };

    const handleConnect = () => {
      console.log('Demo mode: Socket connected, socket.id:', newSocket.id);
      // Set socket ready first
      setIsSocketReady(true);
      setSocket(newSocket);
      // Now emit join event with demo user profile
      newSocket.emit('join', {
        name: user.name,
        focusStyle: user.focusStyle,
        workType: user.workType,
        sessionLength: user.sessionLength,
        adhdType: user.adhdType
      });
    };

    const handleDisconnect = () => {
      console.log('Demo mode: Socket disconnected');
      setIsSocketReady(false);
    };

    // CRITICAL: Set up ALL event handlers BEFORE connecting
    // This is the proper pattern according to Socket.IO docs
    newSocket.on('joined', handleJoined);
    newSocket.on('partner-found', handlePartnerFound);
    newSocket.on('session-ended', handleSessionEnded);
    newSocket.on('partner-disconnected', handlePartnerDisconnected);
    newSocket.on('connect', handleConnect);
    newSocket.on('disconnect', handleDisconnect);

    // NOW connect after handlers are attached
    newSocket.connect();

    return () => {
      newSocket.off('joined', handleJoined);
      newSocket.off('partner-found', handlePartnerFound);
      newSocket.off('session-ended', handleSessionEnded);
      newSocket.off('partner-disconnected', handlePartnerDisconnected);
      newSocket.off('connect', handleConnect);
      newSocket.off('disconnect', handleDisconnect);
      newSocket.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - user properties are initial demo values

  // Show loading while socket is connecting
  if (!isSocketReady) {
    return (
      <BackgroundRenderer>
        <div className="min-h-screen flex items-center justify-center">
          <div className="bg-white/90 backdrop-blur-sm rounded-lg p-8 shadow-2xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 text-center">Connecting to BodyDouble...</p>
          </div>
        </div>
      </BackgroundRenderer>
    );
  }

  // If in an active session, show SessionPage
  if (currentSession) {
    return (
      <BackgroundRenderer>
        <SessionPage
          socket={socket}
          session={currentSession}
          user={user}
          onEndSession={() => setCurrentSession(null)}
        />
      </BackgroundRenderer>
    );
  }

  return (
    <BackgroundRenderer>
      <Navbar user={user} onLogout={() => console.log('Demo mode - logout disabled')} />
      <BackgroundSelector />
      <Routes>
        <Route path="/invite/:token" element={<InviteLanding />} />
        {/* Add key to force remount when socket becomes ready */}
        <Route key={isSocketReady ? 'ready' : 'loading'} path="/" element={<HomePage socket={socket} user={user} />} />
        <Route path="/friends" element={<FriendsPage socket={socket} user={user} convexFriends={[]} createInviteLink={null} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BackgroundRenderer>
  );
}

// UNUSED: Old Convex auth implementation - kept for reference
// function AppContentConvexInner() {
//   ... (removed for demo mode)
// }

function AppContentConvex() {
  // DEMO MODE: Use demo component instead of Convex auth
  return (
    <Router>
      <AppContentDemo />
    </Router>
  );
}

function App({ useConvexAuth }) {
  return (
    <BackgroundProvider>
      {useConvexAuth ? <AppContentConvex /> : <AppContentLegacy />}
    </BackgroundProvider>
  );
}

export default App;
