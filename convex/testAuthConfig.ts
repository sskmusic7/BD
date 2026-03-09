import { mutation } from "./_generated/server";
import { auth } from "./auth";

export const testAuthConfig = mutation({
  handler: async (ctx) => {
    const clientId = process.env.AUTH_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.AUTH_GOOGLE_CLIENT_SECRET;

    console.log("[Auth Test] AUTH_GOOGLE_CLIENT_ID:", clientId ? `${clientId.substring(0, 20)}...` : "UNDEFINED");
    console.log("[Auth Test] AUTH_GOOGLE_CLIENT_SECRET:", clientSecret ? "SET" : "UNDEFINED");
    console.log("[Auth Test] SITE_URL:", process.env.SITE_URL || "UNDEFINED");

    return {
      clientId: clientId ? "SET" : "UNDEFINED",
      clientSecret: clientSecret ? "SET" : "UNDEFINED",
      siteUrl: process.env.SITE_URL || "UNDEFINED",
    };
  },
});
