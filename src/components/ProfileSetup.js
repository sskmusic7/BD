import React, { useState } from 'react';
import { User, Brain, Target, Clock } from 'lucide-react';

const ProfileSetup = ({ onComplete }) => {
  const [profile, setProfile] = useState({
    name: '',
    focusStyle: 'silent',
    workType: 'study',
    sessionLength: '25',
    adhdType: 'combined'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (profile.name.trim()) {
      onComplete(profile);
    }
  };

  const focusStyles = [
    { id: 'silent', label: 'Silent Focus', desc: 'Prefer quiet, minimal interaction' },
    { id: 'social', label: 'Social Focus', desc: 'Enjoy light chat and encouragement' },
    { id: 'accountability', label: 'Accountability', desc: 'Check-ins and progress sharing' }
  ];

  const workTypes = [
    { id: 'study', label: 'Study/Learning' },
    { id: 'work', label: 'Work Projects' },
    { id: 'creative', label: 'Creative Work' },
    { id: 'admin', label: 'Admin/Organization' },
    { id: 'exercise', label: 'Exercise/Movement' },
    { id: 'cleaning', label: 'Cleaning/Organizing' }
  ];

  const adhdTypes = [
    { id: 'inattentive', label: 'Primarily Inattentive' },
    { id: 'hyperactive', label: 'Primarily Hyperactive-Impulsive' },
    { id: 'combined', label: 'Combined Type' },
    { id: 'self-diagnosed', label: 'Self-Diagnosed/Suspected' },
    { id: 'neurotypical', label: 'Neurotypical Supporter' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-full p-3 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <img 
              src="/official logo.png" 
              alt="BodyDouble Logo" 
              className="w-11 h-11"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Welcome!</h1>
          <p className="text-gray-600">Let's set up your profile to find the perfect focus partner</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="inline w-4 h-4 mr-1" />
              Display Name
            </label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile({...profile, name: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="What should we call you?"
              required
            />
          </div>

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
                    onChange={(e) => setProfile({...profile, focusStyle: e.target.value})}
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Primary Work Type
            </label>
            <select
              value={profile.workType}
              onChange={(e) => setProfile({...profile, workType: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {workTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
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
              onChange={(e) => setProfile({...profile, sessionLength: e.target.value})}
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
              onChange={(e) => setProfile({...profile, adhdType: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {adhdTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105"
          >
            Start Body Doubling
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Body doubling helps with focus through virtual co-working</p>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetup;
