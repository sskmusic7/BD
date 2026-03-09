/**
 * Convex API - stub for React app.
 * Run `npx convex dev` to generate the real API in convex/_generated/.
 * This file mirrors the structure for useMutation/useQuery.
 */
export const api = {
  auth: {
    isAuthenticated: "auth:isAuthenticated",
  },
  users: {
    ensureUser: "users:ensureUser",
    getCurrentUser: "users:getCurrentUser",
    getByUsername: "users:getByUsername",
    getAuthProvider: "users:getAuthProvider",
  },
  friends: {
    addFriend: "friends:addFriend",
    listFriends: "friends:listFriends",
  },
  invites: {
    createLink: "invites:createLink",
    getInvite: "invites:getInvite",
    acceptInvite: "invites:acceptInvite",
  },
  testAuthConfig: {
    test: "testAuthConfig:test",
  },
};

