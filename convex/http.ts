import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Route all auth endpoints (OAuth callbacks, sign in, sign out, etc.)
auth.addHttpRoutes(http);

export default http;
