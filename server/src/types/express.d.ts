import type { Role } from "../generated/prisma/enums.js";

// Augment Express.User, not Request.user. @types/passport already declares
// `Request.user?: Express.User`, so this types req.user for passport and for
// our own protect/optionalAuth.
declare global {
  namespace Express {
    interface User {
      id: string;
      role: Role;
    }
  }
}

export {};
