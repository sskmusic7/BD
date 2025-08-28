import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  MessageCircle, 
  Clock, 
  Target,
  CheckCircle,
  XCircle,
  UserPlus,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';
import useWebRTC from '../hooks/useWebRTC';

const SessionPage = ({ socket, session, user, onEndSession }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [goals, setGoals] = useState({ user: '', partner: '' });
  const [newGoal, setNewGoal] = useState('');
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showChat, setShowChat] = useState(false);
  
  const messagesEndRef = useRef(null);
  const timerRef = useRef(null);

  // WebRTC hook for video/audio
  const {
    localVideoRef,
    remoteVideoRef,
    localStream,
    remoteStream,
    isVideoEnabled,
    isAudioEnabled,
    toggleVideo,
    toggleAudio,
    cleanup
  } = useWebRTC(socket, session.id, user.id < session.partner.id);

  useEffect(() => {
    if (socket) {
      socket.on('session-message', (message) => {
        setMessages(prev => [...prev, message]);
      });

      socket.on('goal-update', (data) => {
        setGoals(prev => ({
          ...prev,
          [data.from === user.id ? 'user' : 'partner']: data.goal
        }));
      });

      socket.on('timer-sync', (timerData) => {
        setTimer(timerData.time);
        setIsTimerRunning(timerData.isRunning);
      });

      return () => {
        socket.off('session-message');
        socket.off('goal-update');
        socket.off('timer-sync');
      };
    }
  }, [socket, user.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [isTimerRunning]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      const message = {
        text: newMessage,
        type: 'chat'
      };
      socket.emit('session-message', message);
      setMessages(prev => [...prev, {
        ...message,
        from: user,
        timestamp: new Date()
      }]);
      setNewMessage('');
    }
  };

  const setGoal = (e) => {
    e.preventDefault();
    if (newGoal.trim()) {
      setGoals(prev => ({ ...prev, user: newGoal }));
      if (socket) {
        socket.emit('goal-update', { goal: newGoal });
        socket.emit('session-message', {
          type: 'goal',
          text: `Set goal: ${newGoal}`
        });
      }
      setNewGoal('');
    }
  };

  const addFriend = () => {
    if (socket && session.partner) {
      socket.emit('add-friend', session.partner.id);
    }
  };

  const endSession = () => {
    cleanup(); // Clean up WebRTC resources
    if (socket) {
      socket.emit('end-session');
    }
    onEndSession();
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen" style={{
      background: 'url(./Make_the_water_clearer looping.gif) no-repeat center center fixed',
      backgroundSize: 'cover'
    }}>
      <div className="max-w-6xl mx-auto p-4">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img 
                src="/official logo.png" 
                alt="BodyDouble Logo" 
                className="max-w-12 max-h-12 w-auto h-auto"
              />
              <div>
                <h1 className="text-2xl font-bold text-white">Body Doubling Session</h1>
                <p className="text-white/80">with {session.partner.name}</p>
              </div>
            </div>
            
            {/* Timer */}
            <div className="flex items-center space-x-4">
              <div className="bg-white/20 rounded-lg px-4 py-2">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-white" />
                  <span className="text-white font-mono text-xl">{formatTime(timer)}</span>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    const newRunning = !isTimerRunning;
                    setIsTimerRunning(newRunning);
                    if (socket) {
                      socket.emit('timer-sync', { time: timer, isRunning: newRunning });
                    }
                  }}
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors"
                >
                  {isTimerRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => {
                    setTimer(0);
                    setIsTimerRunning(false);
                    if (socket) {
                      socket.emit('timer-sync', { time: 0, isRunning: false });
                    }
                  }}
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Session Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Area */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* User Video */}
                <div className="relative bg-gray-800 rounded-xl aspect-video overflow-hidden">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {!localStream && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-white text-center">
                        <div className="bg-blue-500 rounded-full p-4 w-16 h-16 mx-auto mb-2 flex items-center justify-center">
                          <span className="font-bold text-xl">{user.name[0].toUpperCase()}</span>
                        </div>
                        <p className="font-medium">{user.name} (You)</p>
                      </div>
                    </div>
                  )}
                  {!isVideoEnabled && localStream && (
                    <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                      <div className="text-white text-center">
                        <div className="bg-blue-500 rounded-full p-4 w-16 h-16 mx-auto mb-2 flex items-center justify-center">
                          <span className="font-bold text-xl">{user.name[0].toUpperCase()}</span>
                        </div>
                        <p className="font-medium">{user.name} (You)</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 bg-black/50 rounded px-2 py-1">
                    <span className="text-white text-xs font-medium">You</span>
                  </div>
                  {!isVideoEnabled && (
                    <div className="absolute top-2 right-2 bg-red-500 rounded-full p-1">
                      <VideoOff className="w-4 h-4 text-white" />
                    </div>
                  )}
                  {!isAudioEnabled && (
                    <div className="absolute bottom-2 right-2 bg-red-500 rounded-full p-1">
                      <MicOff className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>

                {/* Partner Video */}
                <div className="relative bg-gray-800 rounded-xl aspect-video overflow-hidden">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {!remoteStream && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-white text-center">
                        <div className="bg-purple-500 rounded-full p-4 w-16 h-16 mx-auto mb-2 flex items-center justify-center">
                          <span className="font-bold text-xl">{session.partner.name[0].toUpperCase()}</span>
                        </div>
                        <p className="font-medium">{session.partner.name}</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 bg-black/50 rounded px-2 py-1">
                    <span className="text-white text-xs font-medium">{session.partner.name}</span>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex justify-center space-x-4">
                <button
                  onClick={toggleVideo}
                  className={`p-3 rounded-full transition-colors ${
                    isVideoEnabled 
                      ? 'bg-green-500 hover:bg-green-600' 
                      : 'bg-red-500 hover:bg-red-600'
                  }`}
                  title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                >
                  {isVideoEnabled ? 
                    <Video className="w-5 h-5 text-white" /> : 
                    <VideoOff className="w-5 h-5 text-white" />
                  }
                </button>
                <button
                  onClick={toggleAudio}
                  className={`p-3 rounded-full transition-colors ${
                    isAudioEnabled 
                      ? 'bg-green-500 hover:bg-green-600' 
                      : 'bg-red-500 hover:bg-red-600'
                  }`}
                  title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {isAudioEnabled ? 
                    <Mic className="w-5 h-5 text-white" /> : 
                    <MicOff className="w-5 h-5 text-white" />
                  }
                </button>
                <button
                  onClick={() => setShowChat(!showChat)}
                  className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors lg:hidden"
                >
                  <MessageCircle className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={addFriend}
                  className="p-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors"
                  title="Add as friend"
                >
                  <UserPlus className="w-5 h-5 text-white" />
                </button>
                <button
                  onClick={endSession}
                  className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                >
                  <XCircle className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Goals Section */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <Target className="w-5 h-5 mr-2" />
                Session Goals
              </h3>
              
              <div className="space-y-4">
                {/* Your Goal */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">Your Goal</label>
                  {goals.user ? (
                    <div className="bg-white/20 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-white">{goals.user}</span>
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    </div>
                  ) : (
                    <form onSubmit={setGoal} className="flex space-x-2">
                      <input
                        type="text"
                        value={newGoal}
                        onChange={(e) => setNewGoal(e.target.value)}
                        placeholder="What will you focus on?"
                        className="flex-1 px-4 py-2 rounded-lg bg-white/20 text-white placeholder-white/60 border border-white/30 focus:border-white/50 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
                      >
                        Set
                      </button>
                    </form>
                  )}
                </div>

                {/* Partner Goal */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">Partner's Goal</label>
                  <div className="bg-white/20 rounded-lg p-3">
                    <span className="text-white">
                      {goals.partner || 'Waiting for partner to set their goal...'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chat Sidebar */}
          <div className={`${showChat ? 'block' : 'hidden'} lg:block`}>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 h-96 flex flex-col">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <MessageCircle className="w-5 h-5 mr-2" />
                Chat
              </h3>
              
              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                {messages.map((message, index) => (
                  <div key={index} className={`flex ${message.from.id === user.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs px-3 py-2 rounded-lg ${
                      message.from.id === user.id 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-white/20 text-white'
                    }`}>
                      {message.type === 'goal' && (
                        <Target className="w-4 h-4 inline mr-1" />
                      )}
                      <p className="text-sm">{message.text}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={sendMessage} className="flex space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 rounded-lg bg-white/20 text-white placeholder-white/60 border border-white/30 focus:border-white/50 focus:outline-none text-sm"
                />
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Session Info */}
        <div className="mt-6 bg-white/10 backdrop-blur-md rounded-2xl p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Session Info</h3>
              <div className="space-y-2 text-white/80">
                <p><strong>Started:</strong> {new Date(session.startTime).toLocaleTimeString()}</p>
                <p><strong>Focus Style:</strong> {session.partner.focusStyle}</p>
                <p><strong>Work Type:</strong> {session.partner.workType}</p>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Tips for Body Doubling</h3>
              <ul className="space-y-1 text-white/80 text-sm">
                <li>• Share what you're working on</li>
                <li>• Take breaks together</li>
                <li>• Celebrate small wins</li>
                <li>• Be supportive and understanding</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionPage;
