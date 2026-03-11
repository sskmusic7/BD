import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Upsert a Google user when One Tap sign-in succeeds.
 * This is called immediately after Google returns the JWT credential.
 * No localStorage needed - Convex becomes the source of truth.
 */
export const upsertGoogleUser = mutation({
  args: {
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
    picture: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists by googleId
    const existing = await ctx.db
      .query("googleUsers")
      .withIndex("by_googleId", (q) => q.eq("googleId", args.googleId))
      .unique();

    if (existing) {
      // Update lastSeen and refresh profile data
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        picture: args.picture,
        lastSeen: Date.now(),
      });
      return existing._id;
    }

    // Create new Google user
    const userId = await ctx.db.insert("googleUsers", {
      googleId: args.googleId,
      email: args.email,
      name: args.name,
      picture: args.picture,
      lastSeen: Date.now(),
    });

    return userId;
  },
});

/**
 * Get a Google user by their Google ID.
 */
export const getGoogleUser = query({
  args: { googleId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleUsers")
      .withIndex("by_googleId", (q) => q.eq("googleId", args.googleId))
      .unique();
  },
});

/**
 * Get the appUser profile for a Google user.
 * This bridges the new Google auth with the existing appUsers table.
 */
export const getAppUser = query({
  args: { googleId: v.string() },
  handler: async (ctx, args) => {
    // First get the Google user
    const googleUser = await ctx.db
      .query("googleUsers")
      .withIndex("by_googleId", (q) => q.eq("googleId", args.googleId))
      .unique();

    if (!googleUser) {
      return null;
    }

    // Find appUser by email (used as normalizedUsername in some cases)
    // This is a simple bridge - in production you'd want a proper googleId field in appUsers
    const appUser = await ctx.db
      .query("appUsers")
      .filter((q) => q.eq(q.field("email"), googleUser.email))
      .first();

    return appUser;
  },
});
