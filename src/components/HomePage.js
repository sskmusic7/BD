import React, { useState, useEffect } from 'react';
import { Search, Users, Clock, Brain, Heart, Zap } from 'lucide-react';
import config from '../config/config';
import { useBackground } from '../context/BackgroundContext';
import { startSearchingLoop, stopSearchingLoop } from '../utils/sounds';

const HomePage = ({ socket, user, isSearching = false, onSearchingChange = () => {}, onCreateRoom = null, onRejoinRoom = null }) => {
  const { currentBackground } = useBackground();
  const [stats, setStats] = useState({ onlineUsers: 0, activeSessions: 0 });
  const lastRoomCode = typeof window !== 'undefined' ? localStorage.getItem('bd_last_room_code') : null;

  useEffect(() => {
    // Fetch stats
    fetch(`${config.SERVER_URL}/api/stats`)
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(console.error);

    // NOTE: Socket event handlers are now managed in App.js
    // to ensure they're attached before HomePage renders
    // This prevents race conditions where events are missed
  }, [socket]);

  useEffect(() => {
    if (isSearching) {
      startSearchingLoop();
    } else {
      stopSearchingLoop();
    }
    return () => stopSearchingLoop();
  }, [isSearching]);

  const handleFindPartner = () => {
    console.log('HomePage: Clicked Find a Partner, socket =', socket ? socket.id : 'null');
    if (socket) {
      socket.emit('find-partner');
    }
  };

  const handleCancelSearch = () => {
    if (socket) {
      socket.emit('cancel-search');
      onSearchingChange(false);
    }
  };

  const features = [
    {
      icon: Brain,
      title: 'ADHD-Friendly',
      description: 'Designed specifically for neurodivergent minds'
    },
    {
      icon: Zap,
      title: 'Instant Matching',
      description: 'Find a focus partner in seconds'
    },
    {
      icon: Heart,
      title: 'Save Friends',
      description: 'Build lasting body doubling relationships'
    },
    {
      icon: Clock,
      title: 'Flexible Sessions',
      description: 'Choose your ideal focus session length'
    }
  ];

  return (
    <div className="min-h-screen" style={{
      background: `url(${currentBackground}) no-repeat center center`,
      backgroundSize: 'cover',
      minHeight: '100vh'
    }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
          Find Your
          <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            {' '}Focus Partner
          </span>
        </h1>
        <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
          Connect with other ADHD individuals for body doubling sessions. 
          Work together, stay focused, and achieve your goals.
        </p>

        {/* Stats */}
        <div className="flex justify-center space-x-8 mb-8">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{stats.onlineUsers}</div>
            <div className="text-white/70 text-sm">Online Now</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{stats.activeSessions}</div>
            <div className="text-white/70 text-sm">Active Sessions</div>
          </div>
        </div>

        {/* Main Action */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl mb-12">
          {!isSearching ? (
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Ready to Focus?</h2>
              <p className="text-gray-600 mb-6">
                Get matched with someone who understands your focus style
              </p>
              <button
                onClick={handleFindPartner}
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 flex items-center space-x-2 mx-auto"
              >
                <Search className="w-5 h-5" />
                <span>Find a Partner</span>
              </button>
            </div>
          ) : (
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-40"></div>
                <div className="relative animate-pulse-slow">
                  <Users className="w-16 h-16 text-blue-500" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Finding Your Partner...</h2>
              <p className="text-gray-600 mb-6">
                We're matching you with someone who shares your focus style
              </p>
              <div className="flex justify-center space-x-4">
                <div className="bg-blue-100 rounded-full px-4 py-2">
                  <span className="text-blue-800 text-sm font-medium">{user.focusStyle}</span>
                </div>
                <div className="bg-purple-100 rounded-full px-4 py-2">
                  <span className="text-purple-800 text-sm font-medium">{user.workType}</span>
                </div>
              </div>
              <button
                onClick={handleCancelSearch}
                className="mt-6 text-gray-500 hover:text-gray-700 font-medium"
              >
                Cancel Search
              </button>
            </div>
          )}
        </div>

        {/* Direct invite (Zoom-style room link) — separate from random matching above */}
        {!isSearching && (onCreateRoom || (onRejoinRoom && lastRoomCode)) && (
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {onCreateRoom && (
              <button
                onClick={onCreateRoom}
                className="bg-white/90 hover:bg-white text-gray-800 px-6 py-3 rounded-xl font-medium transition-colors shadow-lg"
              >
                Invite someone directly
              </button>
            )}
            {onRejoinRoom && lastRoomCode && (
              <button
                onClick={() => onRejoinRoom(lastRoomCode)}
                className="bg-white/90 hover:bg-white text-gray-800 px-6 py-3 rounded-xl font-medium transition-colors shadow-lg"
              >
                Rejoin your last call
              </button>
            )}
          </div>
        )}
      </div>

      {/* Features */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <div key={index} className="bg-white/10 backdrop-blur-md rounded-xl p-6 text-center">
              <div className="bg-white rounded-lg p-3 w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <Icon className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-white font-semibold mb-2">{feature.title}</h3>
              <p className="text-white/80 text-sm">{feature.description}</p>
            </div>
          );
        })}
      </div>

      {/* How It Works */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8">
        <h2 className="text-2xl font-bold text-white text-center mb-8">How Body Doubling Works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="bg-blue-500 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">1</div>
            <h3 className="text-white font-semibold mb-2">Get Matched</h3>
            <p className="text-white/80 text-sm">Find someone with a compatible focus style and work type</p>
          </div>
          <div className="text-center">
            <div className="bg-purple-500 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">2</div>
            <h3 className="text-white font-semibold mb-2">Work Together</h3>
            <p className="text-white/80 text-sm">Share your goals and work alongside each other virtually</p>
          </div>
          <div className="text-center">
            <div className="bg-green-500 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">3</div>
            <h3 className="text-white font-semibold mb-2">Stay Accountable</h3>
            <p className="text-white/80 text-sm">Keep each other focused and celebrate progress together</p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default HomePage;
