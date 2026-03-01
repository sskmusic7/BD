import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convexApi';
import { useBackground } from '../context/BackgroundContext';
import AuthScreen from './AuthScreen';
import ProfileSetupConvex from './ProfileSetupConvex';

const InviteLanding = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { currentBackground } = useBackground();
  const invite = useQuery(api.invites.getInvite, token ? { token } : 'skip');
  const acceptInvite = useMutation(api.invites.acceptInvite);
  const appUser = useQuery(api.users.getCurrentUser);
  const isAuthenticated = useQuery(api.auth.isAuthenticated);
  const [status, setStatus] = useState('loading'); // loading | success | error | needAuth
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Invalid invite link');
      return;
    }

    if (invite === undefined) return;

    if (invite === null) {
      setStatus('error');
      setError('Invite not found or expired');
      return;
    }

    if (appUser === undefined || isAuthenticated === undefined) return;

    if (!isAuthenticated || appUser === null) {
      setStatus('needAuth');
      return;
    }

    if (accepted) return;

    setAccepted(true);
    acceptInvite({ token })
      .then(() => {
        setStatus('success');
        setTimeout(() => navigate('/friends'), 2000);
      })
      .catch((err) => {
        setStatus('error');
        setError(err.message || 'Failed to accept invite');
        setAccepted(false);
      });
  }, [token, invite, appUser, isAuthenticated, acceptInvite, navigate, accepted]);

  if (status === 'needAuth') {
    if (isAuthenticated && !appUser) {
      return (
        <ProfileSetupConvex
          onComplete={() => {
            /* After profile setup, appUser will exist and we'll accept the invite */
          }}
        />
      );
    }
    return <AuthScreen />;
  }

  if (status === 'loading') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: `url(${currentBackground}) no-repeat center center`,
          backgroundSize: 'cover',
        }}
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          background: `url(${currentBackground}) no-repeat center center`,
          backgroundSize: 'cover',
        }}
      >
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Oops</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-blue-500 text-white py-3 px-6 rounded-lg font-semibold"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: `url(${currentBackground}) no-repeat center center`,
        backgroundSize: 'cover',
      }}
    >
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md text-center">
        <h1 className="text-2xl font-bold text-green-600 mb-4">Friend added!</h1>
        <p className="text-gray-600 mb-6">
          You&apos;re now friends. Redirecting to your friends list...
        </p>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
      </div>
    </div>
  );
};

export default InviteLanding;
