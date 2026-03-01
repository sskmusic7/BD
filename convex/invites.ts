import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const TOKEN_BYTES = 32;
const EXPIRY_DAYS = 30;

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomValues = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < TOKEN_BYTES; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

/**
 * Create an invite link. Returns the token.
 */
export const createLink = mutation({
  args: { invitedUsernameOrEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");

    const appUser = await ctx.db
      .query("appUsers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
      .first();
    if (!appUser) throw new Error("App user not found");

    const token = generateToken();
    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    await ctx.db.insert("inviteLinks", {
      token,
      inviterUserId: appUser._id,
      invitedUsernameOrEmail: args.invitedUsernameOrEmail,
      createdAt: now,
      expiresAt,
    });

    return token;
  },
});

/**
 * Get invite by token.
 * Optimized: Validates expiry before fetching inviter data.
 */
export const getInvite = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token || args.token.trim().length === 0) {
      return null;
    }

    const invite = await ctx.db
      .query("inviteLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!invite) return null;
    
    // Early return for used/expired invites (avoid unnecessary DB call)
    if (invite.usedAt) return null;
    
    const now = Date.now();
    if (now > invite.expiresAt) return null;

    // Fetch inviter in parallel (Convex optimizes this)
    const inviter = await ctx.db.get(invite.inviterUserId);
    
    if (!inviter) {
      // Inviter deleted - invalid invite
      return null;
    }

    return {
      ...invite,
      inviter: {
        _id: inviter._id,
        username: inviter.username,
        displayName: inviter.displayName,
        avatarUrl: inviter.avatarUrl,
      },
    };
  },
});

/**
 * Accept an invite (add as friend and mark used).
 */
export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");

    const invite = await ctx.db
      .query("inviteLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!invite) throw new Error("Invite not found");
    if (invite.usedAt) throw new Error("Invite already used");
    if (Date.now() > invite.expiresAt) throw new Error("Invite expired");

    const appUser = await ctx.db
      .query("appUsers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
      .first();
    if (!appUser) throw new Error("App user not found");

    const inviterId = invite.inviterUserId;
    if (inviterId === appUser._id) throw new Error("Cannot add yourself");

    const existing = await ctx.db
      .query("friendships")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", appUser._id).eq("friendId", inviterId)
      )
      .first();

    let friendshipId;
    if (existing) {
      friendshipId = existing._id;
    } else {
      friendshipId = await ctx.db.insert("friendships", {
        userId: appUser._id,
        friendId: inviterId,
        status: "accepted",
        createdAt: Date.now(),
      });
    }

    await ctx.db.patch(invite._id, {
      usedAt: Date.now(),
      friendshipId,
    });

    return { inviterId, friendshipId };
  },
});
