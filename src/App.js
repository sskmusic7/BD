import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import { useQuery, useMutation } from 'convex/react';
import { api } from './convexApi';
import config from './config/config';
import { BackgroundProvider, useBackground } from './context/BackgroundContext';
import HomePage from './components/HomePage';
import SessionPage from './components/SessionPage';
import ProfileSetup from './components/ProfileSetup';
import ProfileSetupConvex from './components/ProfileSetupConvex';
import FriendsPage from './components/FriendsPage';
import Navbar from './components/Navbar';
import BackgroundSelector from './components/BackgroundSelector';
import InviteLanding from './components/InviteLanding';

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

function AppContentConvexInner() {
  const location = useLocation();
  const isInvitePage = location.pathname.startsWith('/invite/');

  const { currentBackground } = useBackground();
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  // CLEAN AUTH: Google ID stored in React state, persisted via Convex
  const [googleId, setGoogleId] = useState(null);
  const [googleProfile, setGoogleProfile] = useState(null);

  // Convex mutations for Google auth
  const upsertGoogleUser = useMutation(api.googleAuth.upsertGoogleUser);
  const upsertGoogleUserRef = useRef(upsertGoogleUser);
  upsertGoogleUserRef.current = upsertGoogleUser;

  // Keep Convex queries
  const appUser = useQuery(api.googleAuth.getAppUser, googleId ? { googleId } : 'skip');
  const convexFriends = useQuery(api.friends.listFriends);
  const createInviteLink = useMutation(api.invites.createLink);

  // Initialize Google One Tap on mount
  useEffect(() => {
    const initGoogle = () => {
      console.log('🔐 Initializing Google One Tap...');

      if (!window.google) {
        console.error('❌ Google Identity Services not loaded');
        return;
      }

      window.google.accounts.id.initialize({
        client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
        callback: async (response) => {
          // Decode the JWT credential from Google
          const payload = JSON.parse(
            atob(response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
          );

          console.log('✅ Google sign-in successful:', payload);

          // Upsert to Convex - this becomes your session
          await upsertGoogleUserRef.current({
            googleId: payload.sub,
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
          });

          setGoogleId(payload.sub);
          setGoogleProfile({
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
          });
        },
        auto_select: true, // Silently sign in returning users
      });

      // Render the sign-in button
      const buttonContainer = document.getElementById('google-signin-btn');
      if (buttonContainer) {
        window.google.accounts.id.renderButton(buttonContainer, {
          theme: 'outline',
          size: 'large',
        });
      }

      // Attempt silent sign-in for returning users
      window.google.accounts.id.prompt((notification) => {
        console.log('🔐 Google One Tap notification:', notification);
      });
    };

    // Wait for Google script to load
    if (window.google) {
      initGoogle();
    } else {
      window.onGoogleLibraryLoad = initGoogle;
    }

    // Cleanup
    return () => {
      window.onGoogleLibraryLoad = null;
    };
  }, []); // Empty dependency array - run once on mount

  // Handle logout
  const handleLogout = async () => {
    console.log('🚪 Logging out...');

    // Disable Google auto-select
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }

    // Clear auth state (no localStorage to clear!)
    setGoogleId(null);
    setGoogleProfile(null);

    // Clear session and socket
    if (currentSession && socket) socket.emit('end-session');
    if (socket) socket.disconnect();
    setUser(null);
    setCurrentSession(null);
    setHasJoined(false);
    setSocket(io(config.SERVER_URL));
  };

  useEffect(() => {
    const newSocket = io(config.SERVER_URL);
    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleJoined = (data) => setUser(data.user);
    const handlePartnerFound = (data) =>
      setCurrentSession({ id: data.sessionId, partner: data.partner, startTime: new Date() });
    const handleSessionEnded = () => setCurrentSession(null);
    const handlePartnerDisconnected = () => setCurrentSession(null);

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

  useEffect(() => {
    if (!user && appUser && socket && isConnected && !hasJoined) {
      setHasJoined(true);
      socket.emit('join', {
        name: appUser.displayName,
        focusStyle: appUser.focusStyle,
        workType: appUser.workType,
        sessionLength: appUser.sessionLength,
        adhdType: appUser.adhdType,
      });
    }
  }, [user, appUser, socket, isConnected, hasJoined]);

  const handleProfileComplete = (profileData) => {
    if (socket && isConnected) socket.emit('join', profileData);
  };

  // Invite pages bypass auth checks
  if (isInvitePage) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<InviteLanding />} />
      </Routes>
    );
  }

  // Not authenticated → show sign-in screen (NO loading screen, show immediately)
  if (!googleId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <h1 className="text-3xl font-bold mb-2 text-gray-800">BodyDouble</h1>
          <p className="text-gray-600 mb-6">Sign in to find your focus partner</p>
          <div id="google-signin-btn" className="flex justify-center"></div>
        </div>
      </div>
    );
  }

  // Authenticated but appUser profile not loaded yet
  if (appUser === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  // Authenticated but no BodyDouble profile yet → collect username/preferences
  if (appUser === null) {
    return <ProfileSetupConvex onComplete={handleProfileComplete} googleProfile={googleProfile} />;
  }

  // Waiting for socket connection
  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg p-8 shadow-2xl">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600 text-center">Connecting to BodyDouble...</p>
        </div>
      </div>
    );
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
    <div className="min-h-screen" style={{
      background: `url(${currentBackground}) no-repeat center center`,
      backgroundSize: 'cover'
    }}>
      <Navbar user={user} onLogout={handleLogout} />
      <BackgroundSelector />
      <Routes>
        <Route path="/invite/:token" element={<InviteLanding />} />
        <Route path="/" element={<HomePage socket={socket} user={user} />} />
        <Route path="/friends" element={<FriendsPage socket={socket} user={user} useConvex convexFriends={convexFriends} createInviteLink={createInviteLink} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function AppContentConvex() {
  return (
    <Router>
      <AppContentConvexInner />
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
