import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Convex schema for BodyDouble.
 * - authTables: users, authSessions, authAccounts, etc. (from @convex-dev/auth)
 * - appUsers: BodyDouble app profiles linked to auth users
 * - friendships: between appUsers
 * - inviteLinks: shareable friend invites
 */
export default defineSchema({
  ...authTables,

  appUsers: defineTable({
    authUserId: v.id("users"),
    username: v.string(),
    normalizedUsername: v.string(),
    displayName: v.string(),
    email: v.optional(v.string()),
    authProvider: v.string(),
    avatarUrl: v.optional(v.string()),
    focusStyle: v.string(),
    workType: v.string(),
    sessionLength: v.string(),
    adhdType: v.string(),
    createdAt: v.number(),
  })
    .index("by_auth_user", ["authUserId"])
    .index("by_normalized_username", ["normalizedUsername"]),

  friendships: defineTable({
    userId: v.id("appUsers"),
    friendId: v.id("appUsers"),
    status: v.union(v.literal("accepted"), v.literal("pending")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_friend", ["friendId"])
    .index("by_user_and_friend", ["userId", "friendId"])
    .index("by_user_and_status", ["userId", "status"]), // For filtering accepted friends

  inviteLinks: defineTable({
    token: v.string(),
    inviterUserId: v.id("appUsers"),
    invitedUsernameOrEmail: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    friendshipId: v.optional(v.id("friendships")),
  })
    .index("by_token", ["token"])
    .index("by_inviter", ["inviterUserId"]), // For listing user's invites
});
