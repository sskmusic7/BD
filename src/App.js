import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import io from 'socket.io-client';
import config from './config/config';
import { BackgroundProvider, useBackground } from './context/BackgroundContext';
import HomePage from './components/HomePage';
import SessionPage from './components/SessionPage';
import ProfileSetup from './components/ProfileSetup';
import FriendsPage from './components/FriendsPage';
import Navbar from './components/Navbar';
import BackgroundSelector from './components/BackgroundSelector';
import InviteLanding from './components/InviteLanding';
import { playConnectedChime, playDisconnectedTone } from './utils/sounds';
// AuthScreen parked — OAuth disabled; re-enable with ConvexAuthProvider later.
// import AuthScreen from './components/AuthScreen';
// import { Authenticated, Unauthenticated } from 'convex/react';

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

// Parked: name/profile path (no OAuth). Optional email/password for friends can plug in later via AuthScreen.
// eslint-disable-next-line no-unused-vars
function AppContentLegacy() {
  const { currentBackground } = useBackground();
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [isSocketReady, setIsSocketReady] = useState(false);

  useEffect(() => {
    // Initialize socket connection with autoConnect=false to prevent race condition
    // This ensures all event handlers are attached before connection occurs
    const newSocket = io(config.SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    // Define handlers BEFORE setting up events
    const handleConnect = () => {
      console.log('Connected to server');
      setIsSocketReady(true);
      setSocket(newSocket);
    };

    const handleDisconnect = () => {
      console.log('Disconnected from server');
    };

    const handleJoined = (data) => {
      setUser(data.user);
      console.log('Joined with user:', data.user);
    };

    const handlePartnerFound = (data) => {
      console.log('Partner found:', data);
      setCurrentSession({
        id: data.sessionId,
        partner: data.partner,
        startTime: new Date()
      });
    };

    const handleSessionEnded = () => {
      console.log('Session ended');
      setCurrentSession(null);
    };

    const handlePartnerDisconnected = () => {
      console.log('Partner disconnected');
      setCurrentSession(null);
    };

    // CRITICAL: Set up ALL event handlers BEFORE connecting
    // This is the proper pattern according to Socket.IO docs
    newSocket.on('connect', handleConnect);
    newSocket.on('disconnect', handleDisconnect);
    newSocket.on('joined', handleJoined);
    newSocket.on('partner-found', handlePartnerFound);
    newSocket.on('session-ended', handleSessionEnded);
    newSocket.on('partner-disconnected', handlePartnerDisconnected);

    // NOW connect after handlers are attached
    newSocket.connect();

    return () => {
      newSocket.off('connect', handleConnect);
      newSocket.off('disconnect', handleDisconnect);
      newSocket.off('joined', handleJoined);
      newSocket.off('partner-found', handlePartnerFound);
      newSocket.off('session-ended', handleSessionEnded);
      newSocket.off('partner-disconnected', handlePartnerDisconnected);
      newSocket.close();
    };
  }, []);

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

  // Show loading while socket is connecting
  if (!isSocketReady) {
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

// Simple username setup component for Omegle-style demo mode
function SimpleUserSetup({ onComplete }) {
  const { currentBackground } = useBackground();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    const savedName = localStorage.getItem('bd_username');
    const savedToken = localStorage.getItem('bd_session_token');
    if (savedName && savedToken) {
      onComplete({ name: savedName, sessionToken: savedToken });
    }
  }, [onComplete]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      setLoading(true);
      // Generate unique session token
      const sessionToken = 'bd_token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      // Save to localStorage
      localStorage.setItem('bd_username', username.trim());
      localStorage.setItem('bd_session_token', sessionToken);
      setLoading(false);
      onComplete({ name: username.trim(), sessionToken });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      background: `url(${currentBackground}) no-repeat center center`,
      backgroundSize: 'cover',
      position: 'relative',
      zIndex: 1
    }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md relative z-10">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome! Let's get started</h2>
          <p className="text-gray-600 text-sm">Enter your name to start body doubling</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name..."
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              autoFocus
              maxLength={30}
            />
          </div>
          <button
            type="submit"
            disabled={!username.trim() || loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Setting up...' : 'Start Body Doubling'}
          </button>
        </form>
        <p className="text-xs text-gray-500 text-center mt-4">
          Your session is saved locally. Come back anytime!
        </p>
      </div>
    </div>
  );
}

// Detects when a newer build has been deployed while this tab has been
// sitting open. A single-page app keeps running whatever JS it loaded at
// first paint, so a long-lived tab silently stays on old code — which is
// invisible and looks exactly like "the fix didn't work". Compares the
// main.js filename this page actually loaded against the deployed
// asset-manifest, which changes hash on every deploy.
function useNewBuildAvailable() {
  const [newBuildAvailable, setNewBuildAvailable] = useState(false);

  useEffect(() => {
    const loadedScript = Array.from(document.querySelectorAll('script[src]'))
      .map(s => s.src)
      .find(src => /\/static\/js\/main\.[a-f0-9]+\.js$/.test(src));
    if (!loadedScript) return;

    const check = async () => {
      try {
        const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
        if (!res.ok) return;
        const manifest = await res.json();
        const deployed = manifest?.files?.['main.js'];
        if (deployed && !loadedScript.endsWith(deployed)) {
          setNewBuildAvailable(true);
        }
      } catch {
        // Offline or a blip — just try again on the next tick.
      }
    };

    check();
    const id = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return newBuildAvailable;
}

// Landing spot for a direct-invite link (/room/:code). By the time this
// route can render, isSetup/isSocketReady are already guaranteed true (see
// AppContentDemo's early returns) — the socket is live, so this just needs
// to trigger the join once on mount.
function RoomJoin({ onJoin }) {
  const { code } = useParams();
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    if (hasJoinedRef.current || !code) return;
    hasJoinedRef.current = true;
    onJoin(code);
  }, [code, onJoin]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-sm rounded-lg p-8 shadow-2xl text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Joining call...</p>
      </div>
    </div>
  );
}

// DEMO MODE: Simple app without auth/Convex (default production path)
// eslint-disable-next-line no-unused-vars
function AppContentDemo() {
  // State for user setup
  const [isSetup, setIsSetup] = useState(false);

  // Check for existing session on mount. The token itself isn't held in
  // state — the user object below is seeded from localStorage directly, so
  // a separate sessionToken state would just be a second source of truth
  // that lags a render behind (which is what caused the identity bug).
  useEffect(() => {
    const savedName = localStorage.getItem('bd_username');
    const savedToken = localStorage.getItem('bd_session_token');
    if (savedName && savedToken) {
      setIsSetup(true);
    }
  }, []);

  // Generate user from saved session or defaults.
  //
  // Read the saved token straight from localStorage in a lazy initializer
  // rather than from the sessionToken state above: useState only ever uses
  // its argument on the FIRST render, and on that render sessionToken is
  // still null (it's populated by the mount effect above, which runs after).
  // So a returning user used to fall through to the random 'demo_user_...'
  // branch and got a BRAND NEW identity on every single page load, with the
  // saved token never actually applied. That broke every piece of logic
  // keyed on a stable user id — the server couldn't recognise a returning
  // user, so reopening an invite link made the server treat them as a
  // stranger: their own stale entry stayed in the room as a ghost, they'd
  // get "partner-found" matched against *themselves*, and the person they
  // actually sent the link to was then locked out with "This room is full."
  const [user, setUser] = useState(() => ({
    id: localStorage.getItem('bd_session_token') || ('demo_user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)),
    name: localStorage.getItem('bd_username') || 'Demo User',
    focusStyle: 'Body Doubling',
    workType: 'Creative Work',
    sessionLength: '25 minutes',
    adhdType: 'Inattentive'
  }));
  const [socket, setSocket] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [isSocketReady, setIsSocketReady] = useState(false);
  const [isSearching, setIsSearching] = useState(false); // Track searching state at App level
  const [activeRoomCode, setActiveRoomCode] = useState(null); // set while creating/waiting on a direct-invite room
  const [roomError, setRoomError] = useState(null);
  const [roomLinkCopied, setRoomLinkCopied] = useState(false);
  const newBuildAvailable = useNewBuildAvailable();

  // Tracks the live session id for handleConnect's closure below. A real
  // page reload resets currentSession (and this ref) back to null, while a
  // transport-level reconnect (same JS session, socket.io auto-reconnecting)
  // leaves it set — that distinction is what tells the server whether this
  // 'join' is resuming an in-progress call or starting fresh.
  const currentSessionRef = useRef(null);
  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  // Same staleness concern as currentSessionRef above — handlePartnerFound
  // lives inside the socket-setup effect (deps: [isSetup]), so it would
  // otherwise only ever see activeRoomCode's value from mount time.
  const activeRoomCodeRef = useRef(null);
  useEffect(() => {
    activeRoomCodeRef.current = activeRoomCode;
  }, [activeRoomCode]);

  // Whoever joined via a /room/:code link keeps that URL in the address bar
  // for the whole call (nothing ever navigates away from it). Once that
  // flow is over — the room errored out, the call ended, or the user hit
  // Cancel — the URL must stop pointing at /room/:code, or the next time
  // this component falls through to rendering <Router>, it re-matches the
  // same route, remounts RoomJoin, and fires ANOTHER 'join-room' for a link
  // that's now dead/finished. That loop is what made "Back to Home" look
  // broken and the screen freeze — every render bounced straight back into
  // another failed join attempt.
  const resetRoomUrlIfNeeded = () => {
    if (window.location.pathname.startsWith('/room/')) {
      window.history.replaceState(null, '', '/');
    }
  };

  // Handle setup completion
  const handleSetupComplete = ({ name, sessionToken: token }) => {
    setIsSetup(true);
    setUser(prev => ({
      ...prev,
      id: token,
      name: name
    }));
  };

  // Initialize socket connection for demo mode (only when setup is complete)
  useEffect(() => {
    // Don't initialize socket until setup is complete
    if (!isSetup) return;

    // CRITICAL FIX: Create socket with autoConnect=false to prevent race condition
    // This ensures all event handlers are attached before connection occurs
    // Also use explicit WebSocket transport for reliability
    const newSocket = io(config.SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
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
      playConnectedChime();
      // If we were creating/joining a direct-invite room, this session IS
      // that room — remember its code so "Rejoin your last call" works
      // later. Random matches don't persist anything here; there's nothing
      // meaningful to "rejoin" with a stranger.
      if (activeRoomCodeRef.current) {
        localStorage.setItem('bd_last_room_code', data.sessionId);
      }
      setActiveRoomCode(null);
      setRoomError(null);
      setCurrentSession({
        id: data.sessionId,
        partner: data.partner,
        startTime: new Date()
      });
    };

    const handleRoomWaiting = () => {
      console.log('Demo mode: Waiting in room (rejoining own empty room)');
    };

    const handleRoomError = (data) => {
      console.log('Demo mode: Room error', data);
      setActiveRoomCode(null);
      setRoomError(data?.error || 'Could not join that call.');
      resetRoomUrlIfNeeded();
    };

    // Clears the persisted "rejoin" link once a call is truly over — after
    // the (possibly 5-minute, for room calls) grace period genuinely
    // expires server-side, reusing the link would just fail anyway. Only
    // clears it if it matches the session that just ended, so it can't
    // wipe out a different room's saved code.
    const clearLastRoomCodeIfCurrent = () => {
      const endedSessionId = currentSessionRef.current?.id;
      if (endedSessionId && localStorage.getItem('bd_last_room_code') === endedSessionId) {
        localStorage.removeItem('bd_last_room_code');
      }
    };

    const handleSessionEnded = () => {
      console.log('Demo mode: Session ended');
      playDisconnectedTone();
      clearLastRoomCodeIfCurrent();
      setCurrentSession(null);
      resetRoomUrlIfNeeded();
    };

    const handlePartnerDisconnected = () => {
      console.log('Demo mode: Partner disconnected');
      playDisconnectedTone();
      clearLastRoomCodeIfCurrent();
      setCurrentSession(null);
      setIsSearching(false);
      resetRoomUrlIfNeeded();
    };

    const handleWaitingForPartner = () => {
      console.log('Demo mode: Waiting for partner...');
      setIsSearching(true);
    };

    const handleSearchCancelled = () => {
      console.log('Demo mode: Search cancelled');
      setIsSearching(false);
    };

    const handleConnect = () => {
      console.log('Demo mode: Socket connected, socket.id:', newSocket.id);
      // Set socket ready first
      setIsSocketReady(true);
      setSocket(newSocket);
      // Now emit join event with current user profile
      // Use ref to get latest user state
      newSocket.emit('join', {
        userId: user.id,
        name: user.name,
        focusStyle: user.focusStyle,
        workType: user.workType,
        sessionLength: user.sessionLength,
        adhdType: user.adhdType,
        // Only set on a transport-level reconnect (same JS session) — null
        // on a real page load, so the server can tell those apart.
        resumeSessionId: currentSessionRef.current?.id || null
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
    newSocket.on('waiting-for-partner', handleWaitingForPartner);
    newSocket.on('search-cancelled', handleSearchCancelled);
    newSocket.on('room-waiting', handleRoomWaiting);
    newSocket.on('room-error', handleRoomError);
    newSocket.on('connect', handleConnect);
    newSocket.on('disconnect', handleDisconnect);

    // NOW connect after handlers are attached
    newSocket.connect();

    return () => {
      newSocket.off('joined', handleJoined);
      newSocket.off('partner-found', handlePartnerFound);
      newSocket.off('session-ended', handleSessionEnded);
      newSocket.off('partner-disconnected', handlePartnerDisconnected);
      newSocket.off('waiting-for-partner', handleWaitingForPartner);
      newSocket.off('search-cancelled', handleSearchCancelled);
      newSocket.off('room-waiting', handleRoomWaiting);
      newSocket.off('room-error', handleRoomError);
      newSocket.off('connect', handleConnect);
      newSocket.off('disconnect', handleDisconnect);
      newSocket.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetup]); // Run when setup completes

  // Generates a shareable room code and starts waiting for someone to join
  // via that link — a direct, deliberate invite rather than random
  // matching. The server needs nothing back from this (fire-and-forget);
  // the UI just shows its own waiting state until 'partner-found' arrives.
  const createRoom = () => {
    if (!socket) return;
    const roomCode = crypto.randomUUID();
    setRoomError(null);
    setActiveRoomCode(roomCode);
    socket.emit('create-room', roomCode);
  };

  // Used both by the /room/:code route and the "Rejoin your last call"
  // button on HomePage — same server-side handler either way.
  const joinRoom = (roomCode) => {
    if (!socket) return;
    setRoomError(null);
    setActiveRoomCode(roomCode);
    socket.emit('join-room', roomCode);
  };

  // Sits above every screen below, including an in-progress call, since a
  // stale tab is exactly the situation where you can't tell whether a bug
  // is still real or you're just running yesterday's code.
  const updateBanner = newBuildAvailable ? (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-black px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium">
      <span>A newer version of BodyDouble is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="bg-black/80 hover:bg-black text-white px-3 py-1 rounded-md"
      >
        Reload
      </button>
    </div>
  ) : null;

  // Show setup screen if not completed
  if (!isSetup) {
    return (
      <>
        {updateBanner}
        <SimpleUserSetup onComplete={handleSetupComplete} />
      </>
    );
  }

  // Show loading while socket is connecting
  if (!isSocketReady) {
    return (
      <BackgroundRenderer>
        {updateBanner}
        <div className="min-h-screen flex items-center justify-center">
          <div className="bg-white/90 backdrop-blur-sm rounded-lg p-8 shadow-2xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 text-center">Connecting to BodyDouble...</p>
          </div>
        </div>
      </BackgroundRenderer>
    );
  }

  // Waiting on a direct-invite room — either just created one, or just
  // asked to join one (both set activeRoomCode; 'partner-found' clears it
  // and takes over via the currentSession branch below).
  if (activeRoomCode && !currentSession) {
    const inviteUrl = `${window.location.origin}/room/${activeRoomCode}`;
    return (
      <BackgroundRenderer>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white/90 backdrop-blur-sm rounded-lg p-8 shadow-2xl max-w-md w-full text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Waiting for them to join...</h2>
            <p className="text-gray-600 text-sm mb-4">
              Share this link — whoever opens it joins this call directly, no matching queue.
            </p>
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-2 mb-4">
              <input
                readOnly
                value={inviteUrl}
                onClick={(e) => e.target.select()}
                className="flex-1 bg-transparent text-sm text-gray-700 outline-none px-2"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl);
                  setRoomLinkCopied(true);
                  setTimeout(() => setRoomLinkCopied(false), 2000);
                }}
                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              >
                {roomLinkCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              onClick={() => {
                if (socket) socket.emit('leave-room', activeRoomCode);
                setActiveRoomCode(null);
                resetRoomUrlIfNeeded();
              }}
              className="text-gray-500 hover:text-gray-700 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </BackgroundRenderer>
    );
  }

  if (roomError) {
    return (
      <BackgroundRenderer>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white/90 backdrop-blur-sm rounded-lg p-8 shadow-2xl max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Couldn&apos;t join that call</h2>
            <p className="text-gray-600 text-sm mb-6">{roomError}</p>
            <button
              onClick={() => {
                setRoomError(null);
                resetRoomUrlIfNeeded();
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium"
            >
              Back to Home
            </button>
          </div>
        </div>
      </BackgroundRenderer>
    );
  }

  // If in an active session, show SessionPage
  if (currentSession) {
    return (
      <BackgroundRenderer>
        {updateBanner}
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
      <Router>
        {updateBanner}
        <Navbar user={user} onLogout={() => console.log('Demo mode - logout disabled')} />
        <BackgroundSelector />
        <Routes>
          <Route path="/invite/:token" element={<InviteLanding />} />
          <Route path="/room/:code" element={<RoomJoin onJoin={joinRoom} />} />
          {/* Add key to force remount when socket becomes ready */}
          <Route key={isSocketReady ? 'ready' : 'loading'} path="/" element={
            <HomePage
              socket={socket}
              user={user}
              isSearching={isSearching}
              onSearchingChange={setIsSearching}
              onCreateRoom={createRoom}
              onRejoinRoom={joinRoom}
            />
          } />
          <Route path="/friends" element={<FriendsPage socket={socket} user={user} convexFriends={[]} createInviteLink={null} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </BackgroundRenderer>
  );
}

// Parked: OAuth / Convex Authenticated gate removed from critical path.
// Optional later: email/password (AuthScreen) only for remembering friends — not required to match.

function App() {
  // Omegle-style: plug and play matching, no login gate. Layout/CSS untouched.
  return (
    <BackgroundProvider>
      <AppContentDemo />
    </BackgroundProvider>
  );
}

export default App;
