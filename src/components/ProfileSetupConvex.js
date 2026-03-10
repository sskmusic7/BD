import React, { useState, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../convexApi';
import { User, Brain, Target, Clock, Mail } from 'lucide-react';
import { useBackground } from '../context/BackgroundContext';

const ProfileSetupConvex = ({ onComplete, googleProfile }) => {
  const { currentBackground } = useBackground();
  const ensureUser = useMutation(api.users.ensureUser);
  const [profile, setProfile] = useState({
    username: '',
    displayName: '',
    email: '',
    focusStyle: 'silent',
    workType: 'study',
    sessionLength: '25',
    adhdType: 'combined',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill form with Google profile data
  useEffect(() => {
    if (googleProfile) {
      console.log('📝 Pre-filling profile with Google data:', googleProfile);
      setProfile(prev => ({
        ...prev,
        displayName: googleProfile.name || prev.displayName,
        email: googleProfile.email || prev.email,
      }));
    }
  }, [googleProfile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const username = profile.username.trim();
    const displayName = profile.displayName.trim() || username;
    if (!username) {
      setError('Username is required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await ensureUser({
        username,
        displayName,
        email: profile.email || undefined,
        focusStyle: profile.focusStyle,
        workType: profile.workType,
        sessionLength: profile.sessionLength,
        adhdType: profile.adhdType,
        authProvider: 'google',
        avatarUrl: googleProfile?.picture,
      });
      onComplete({
        name: displayName,
        focusStyle: profile.focusStyle,
        workType: profile.workType,
        sessionLength: profile.sessionLength,
        adhdType: profile.adhdType,
      });
    } catch (err) {
      setError(err.message || 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  const focusStyles = [
    { id: 'silent', label: 'Silent Focus', desc: 'Prefer quiet, minimal interaction' },
    { id: 'social', label: 'Social Focus', desc: 'Enjoy light chat and encouragement' },
    { id: 'accountability', label: 'Accountability', desc: 'Check-ins and progress sharing' },
  ];

  const workTypes = [
    { id: 'study', label: 'Study/Learning' },
    { id: 'work', label: 'Work Projects' },
    { id: 'creative', label: 'Creative Work' },
    { id: 'admin', label: 'Admin/Organization' },
    { id: 'exercise', label: 'Exercise/Movement' },
    { id: 'cleaning', label: 'Cleaning/Organizing' },
  ];

  const adhdTypes = [
    { id: 'inattentive', label: 'Primarily Inattentive' },
    { id: 'hyperactive', label: 'Primarily Hyperactive-Impulsive' },
    { id: 'combined', label: 'Combined Type' },
    { id: 'self-diagnosed', label: 'Self-Diagnosed/Suspected' },
    { id: 'neurotypical', label: 'Neurotypical Supporter' },
  ];

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: `url(${currentBackground}) no-repeat center center`,
        backgroundSize: 'cover',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <img
              src="/official logo.png"
              alt="BodyDouble Logo"
              className="max-w-32 max-h-32 w-auto h-auto"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Complete Your Profile</h1>
          <p className="text-gray-600">Choose a username and set your preferences</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="inline w-4 h-4 mr-1" />
              Username (unique)
            </label>
            <input
              type="text"
              value={profile.username}
              onChange={(e) => setProfile({ ...profile, username: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. focusbuddy"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Display Name</label>
            <input
              type="text"
              value={profile.displayName}
              onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="What should we call you?"
            />
          </div>

          {/* Email field (read-only for Google users) */}
          {googleProfile && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="inline w-4 h-4 mr-1" />
                Email (from Google)
              </label>
              <div className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                {googleProfile.email}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <Target className="inline w-4 h-4 mr-1" />
              Focus Style
            </label>
            <div className="space-y-2">
              {focusStyles.map((style) => (
                <label key={style.id} className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="focusStyle"
                    value={style.id}
                    checked={profile.focusStyle === style.id}
                    onChange={(e) => setProfile({ ...profile, focusStyle: e.target.value })}
                    className="mt-1 text-blue-600"
                  />
                  <div>
                    <div className="font-medium text-gray-800">{style.label}</div>
                    <div className="text-sm text-gray-600">{style.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Primary Work Type</label>
            <select
              value={profile.workType}
              onChange={(e) => setProfile({ ...profile, workType: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {workTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="inline w-4 h-4 mr-1" />
              Preferred Session Length (minutes)
            </label>
            <select
              value={profile.sessionLength}
              onChange={(e) => setProfile({ ...profile, sessionLength: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="15">15 minutes</option>
              <option value="25">25 minutes (Pomodoro)</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">90 minutes</option>
              <option value="120">2 hours</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Brain className="inline w-4 h-4 mr-1" />
              ADHD Type (Optional)
            </label>
            <select
              value={profile.adhdType}
              onChange={(e) => setProfile({ ...profile, adhdType: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {adhdTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Start Body Doubling'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProfileSetupConvex;
