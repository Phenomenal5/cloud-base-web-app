import type { Role } from "../generated/prisma/enums.js";

// Shape of the authenticated principal on `req.user`.
//
// We augment Express.User (not Request.user) because @types/passport already
// declares `Request.user?: Express.User`. Filling in Express.User here makes
// req.user typed for both passport (OAuth callback) and our own protect/optionalAuth
// middleware. The full Prisma user we pass to passport's done() is structurally
// compatible (it has id + role, plus extras).
declare global {
  namespace Express {
    interface User {
      id: string;
      role: Role;
    }
  }
}

export {};
