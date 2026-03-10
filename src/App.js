import React, { useState, useEffect } from 'react';
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
import AuthScreen from './components/AuthScreen';
import InviteLanding from './components/InviteLanding';
import { googleAuthService } from './services/googleAuthService';

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

  // Custom auth state for Google OAuth
  const [authUserId, setAuthUserId] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [googleProfile, setGoogleProfile] = useState(null);

  // Keep Convex queries
  const appUser = useQuery(api.users.getCurrentUser, authUserId ? { authUserId } : 'skip');
  const convexFriends = useQuery(api.friends.listFriends);
  const createInviteLink = useMutation(api.invites.createLink);

  // Initialize Google auth on mount
  useEffect(() => {
    const initAuth = async () => {
      console.log('🔐 Initializing auth...');

      try {
        await googleAuthService.initialize();

        // Check if user is already signed in
        if (googleAuthService.isUserSignedIn()) {
          console.log('✅ User already signed in with Google');
          setAuthUserId(googleAuthService.getAuthUserId());
          setGoogleProfile({
            email: googleAuthService.userProfile.email,
            name: googleAuthService.userProfile.name,
            picture: googleAuthService.userProfile.picture,
          });
        } else {
          console.log('ℹ️ No active Google session found');
        }

        setIsAuthLoading(false);
      } catch (error) {
        console.error('❌ Auth initialization error:', error);
        setIsAuthLoading(false);
      }
    };

    initAuth();
  }, []);

  // Handle auth completion from AuthScreen
  const handleAuthComplete = (authData) => {
    console.log('✅ Auth completed:', authData);
    setAuthUserId(authData.authUserId);
    setGoogleProfile({
      email: authData.email,
      name: authData.name,
      picture: authData.avatarUrl,
    });
  };

  // Handle logout
  const handleLogout = async () => {
    console.log('🚪 Logging out...');

    // Sign out from Google
    await googleAuthService.signOut();

    // Clear auth state
    setAuthUserId(null);
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

  // Waiting for auth to initialize
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    );
  }

  // Not authenticated → show sign-in screen
  if (!authUserId) {
    return <AuthScreen onAuthComplete={handleAuthComplete} />;
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
