import type { Role } from "../generated/prisma/enums.js";

// augment Express.User rather than Request.user. @types/passport already
// declares `Request.user?: Express.User`, so filling in Express.User types
// req.user for both passport and our own protect/optionalAuth middleware
declare global {
  namespace Express {
    interface User {
      id: string;
      role: Role;
    }
  }
}

export {};
