import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Ensure the current auth user has an appUser record.
 * Called after sign-in to create/update BodyDouble profile.
 * Optimized: Validates input and reduces redundant queries.
 */
export const ensureUser = mutation({
  args: {
    username: v.string(),
    displayName: v.string(),
    focusStyle: v.string(),
    workType: v.string(),
    sessionLength: v.string(),
    adhdType: v.string(),
    email: v.optional(v.string()),
    authProvider: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return null;

    // Input validation
    const trimmedUsername = args.username.trim();
    if (trimmedUsername.length === 0) {
      throw new Error("Username cannot be empty");
    }
    if (trimmedUsername.length > 30) {
      throw new Error("Username must be 30 characters or less");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
      throw new Error("Username can only contain letters, numbers, underscores, and hyphens");
    }

    const normalizedUsername = trimmedUsername.toLowerCase().replace(/\s+/g, "_");

    // Check existing user first (most common case)
    const existing = await ctx.db
      .query("appUsers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
      .first();

    if (existing) {
      // Only update if username changed or if updating profile
      const usernameChanged = existing.normalizedUsername !== normalizedUsername;
      
      if (usernameChanged) {
        // Check if new username is taken
        const taken = await ctx.db
          .query("appUsers")
          .withIndex("by_normalized_username", (q) => q.eq("normalizedUsername", normalizedUsername))
          .first();
        if (taken && taken._id !== existing._id) {
          throw new Error("Username already taken");
        }
      }

      await ctx.db.patch(existing._id, {
        username: trimmedUsername,
        normalizedUsername,
        displayName: args.displayName.trim(),
        email: args.email?.trim() || undefined,
        authProvider: args.authProvider,
        avatarUrl: args.avatarUrl || undefined,
        focusStyle: args.focusStyle,
        workType: args.workType,
        sessionLength: args.sessionLength,
        adhdType: args.adhdType,
      });
      return (await ctx.db.get(existing._id)) ?? null;
    }

    // New user - check username availability
    const taken = await ctx.db
      .query("appUsers")
      .withIndex("by_normalized_username", (q) => q.eq("normalizedUsername", normalizedUsername))
      .first();
    if (taken) throw new Error("Username already taken");

    const id = await ctx.db.insert("appUsers", {
      authUserId,
      username: trimmedUsername,
      normalizedUsername,
      displayName: args.displayName.trim(),
      email: args.email?.trim() || undefined,
      authProvider: args.authProvider,
      avatarUrl: args.avatarUrl || undefined,
      focusStyle: args.focusStyle,
      workType: args.workType,
      sessionLength: args.sessionLength,
      adhdType: args.adhdType,
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

/**
 * Get the current user's appUser profile.
 * Optimized: Uses index lookup for fast retrieval.
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return null;
    
    // Index lookup is already optimized by Convex
    return await ctx.db
      .query("appUsers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
      .first();
  },
});

/**
 * Get the current auth user's provider (e.g. "password", "google").
 */
export const getAuthProvider = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return "password";
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", authUserId))
      .first();
    return account?.provider ?? "password";
  },
});

/**
 * Get appUser by username.
 * Optimized: Normalizes username before querying.
 */
export const getByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    if (!args.username || args.username.trim().length === 0) {
      return null;
    }
    
    const normalized = args.username.toLowerCase().trim().replace(/\s+/g, "_");
    return await ctx.db
      .query("appUsers")
      .withIndex("by_normalized_username", (q) => q.eq("normalizedUsername", normalized))
      .first();
  },
});
