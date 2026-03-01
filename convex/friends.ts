import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Add a friend. Creates a friendship between current user and the given friend (by appUser id).
 * Optimized: Validates friend exists and checks both directions efficiently.
 */
export const addFriend = mutation({
  args: { friendId: v.id("appUsers") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const appUser = await ctx.db
      .query("appUsers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", userId))
      .first();
    if (!appUser) throw new Error("App user not found");

    const myId = appUser._id;
    if (args.friendId === myId) {
      throw new Error("Cannot add yourself as a friend");
    }

    // Verify friend exists
    const friend = await ctx.db.get(args.friendId);
    if (!friend) {
      throw new Error("User not found");
    }

    // Check existing friendship in both directions (parallel queries)
    const [existing, reverse] = await Promise.all([
      ctx.db
        .query("friendships")
        .withIndex("by_user_and_friend", (q) =>
          q.eq("userId", myId).eq("friendId", args.friendId)
        )
        .first(),
      ctx.db
        .query("friendships")
        .withIndex("by_user_and_friend", (q) =>
          q.eq("userId", args.friendId).eq("friendId", myId)
        )
        .first(),
    ]);

    if (existing) {
      return existing._id;
    }

    if (reverse) {
      // Accept existing reverse friendship
      await ctx.db.patch(reverse._id, { status: "accepted" });
      return reverse._id;
    }

    // Create new friendship
    return await ctx.db.insert("friendships", {
      userId: myId,
      friendId: args.friendId,
      status: "accepted",
      createdAt: Date.now(),
    });
  },
});

/**
 * List friends for the current user.
 * Optimized: Uses index filtering and batches friend lookups.
 */
export const listFriends = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const appUser = await ctx.db
      .query("appUsers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", userId))
      .first();
    if (!appUser) return [];

    // Filter by accepted status using the optimized index
    const friendships = await ctx.db
      .query("friendships")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", appUser._id).eq("status", "accepted")
      )
      .collect();

    // Batch fetch all friends in parallel (more efficient than sequential)
    const friendIds = friendships.map((f) => f.friendId);
    if (friendIds.length === 0) return [];

    // Use Promise.all for parallel fetching - Convex handles batching internally
    const friends = await Promise.all(
      friendIds.map((id) => ctx.db.get(id))
    );

    // Filter out nulls and return with friendship metadata
    return friends
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .map((friend) => ({
        ...friend,
        // Include friendship metadata if needed
        friendshipId: friendships.find((f) => f.friendId === friend._id)?._id,
      }));
  },
});
