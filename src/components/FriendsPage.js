import React, { useState, useEffect } from 'react';
import { Users, UserPlus, MessageCircle, Clock, Search } from 'lucide-react';

const FriendsPage = ({ socket, user }) => {
  const [friends, setFriends] = useState([]);
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    if (socket) {
      // Request friends list
      socket.emit('get-friends');

      socket.on('friends-list', (friendsList) => {
        setFriends(friendsList);
      });

      socket.on('friend-added', (newFriend) => {
        setFriends(prev => {
          const exists = prev.find(f => f.id === newFriend.id);
          if (exists) return prev;
          return [...prev, newFriend];
        });
      });

      socket.on('session-invite', (invite) => {
        setInvites(prev => [...prev, invite]);
      });

      return () => {
        socket.off('friends-list');
        socket.off('friend-added');
        socket.off('session-invite');
      };
    }
  }, [socket]);

  const inviteFriend = (friendId) => {
    if (socket) {
      socket.emit('invite-friend', friendId);
    }
  };

  const acceptInvite = (invite) => {
    if (socket) {
      socket.emit('accept-invite', invite);
      setInvites(prev => prev.filter(i => i.inviteId !== invite.inviteId));
    }
  };

  const declineInvite = (inviteId) => {
    setInvites(prev => prev.filter(i => i.inviteId !== inviteId));
  };

  return (
    <div className="min-h-screen" style={{
      background: 'url(/Make_the_water_clearer_looping.gif) no-repeat center center',
      backgroundSize: 'cover'
    }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-4">Your Focus Friends</h1>
        <p className="text-white/80 text-lg">
          Connect with people you've had great body doubling sessions with
        </p>
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">Session Invites</h2>
          <div className="space-y-3">
            {invites.map((invite) => (
              <div key={invite.inviteId} className="bg-white/20 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="bg-yellow-500 rounded-full p-2 w-10 h-10 flex items-center justify-center">
                    <span className="text-white font-bold">{invite.from.name[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{invite.from.name}</p>
                    <p className="text-white/70 text-sm">wants to start a session</p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => acceptInvite(invite)}
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => declineInvite(invite.inviteId)}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <Users className="w-5 h-5 mr-2" />
            Your Friends ({friends.length})
          </h2>
        </div>

        {friends.length === 0 ? (
          <div className="text-center py-12">
            <UserPlus className="w-16 h-16 text-white/40 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No friends yet</h3>
            <p className="text-white/70 mb-6">
              Start a session and add people you work well with as friends!
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-200 flex items-center space-x-2 mx-auto"
            >
              <Search className="w-4 h-4" />
              <span>Find a Partner</span>
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {friends.map((friend) => (
              <div key={friend.id} className="bg-white/20 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <div className="bg-purple-500 rounded-full p-3 w-12 h-12 flex items-center justify-center">
                      <span className="text-white font-bold">{friend.name[0].toUpperCase()}</span>
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                      friend.isOnline ? 'bg-green-500' : 'bg-gray-400'
                    }`}></div>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{friend.name}</h3>
                    <div className="flex items-center space-x-3 text-sm text-white/70">
                      <span>{friend.focusStyle}</span>
                      <span>•</span>
                      <span>{friend.workType}</span>
                      <span>•</span>
                      <span className={friend.isOnline ? 'text-green-400' : 'text-gray-400'}>
                        {friend.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  {friend.isOnline && !friend.currentSession && (
                    <button
                      onClick={() => inviteFriend(friend.id)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1"
                    >
                      <Clock className="w-4 h-4" />
                      <span>Invite</span>
                    </button>
                  )}
                  <button className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    <MessageCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{friends.length}</div>
          <div className="text-white/70 text-sm">Friends</div>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{friends.filter(f => f.isOnline).length}</div>
          <div className="text-white/70 text-sm">Online</div>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{invites.length}</div>
          <div className="text-white/70 text-sm">Invites</div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default FriendsPage;
