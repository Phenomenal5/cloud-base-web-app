import { env } from "../config/env.js";
import type { Role, UserStatus } from "../generated/prisma/enums.js";

// one definition of what a user looks like to the outside world. every endpoint
// that returns a user goes through here, which is what stops passwordHash ever
// leaking out by accident

export const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  emailVerified: true,
  avatarPath: true,
  createdAt: true,
} as const;

interface PublicUserRow {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  avatarPath: string | null;
  createdAt: Date;
}

export function toPublicUser(user: PublicUserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    // build the full URL here, so the client can put it straight in an <img src>
    // instead of every frontend having to know where uploads live
    avatarUrl: user.avatarPath ? `${env.publicBaseUrl}/uploads/avatars/${user.avatarPath}` : null,
    createdAt: user.createdAt,
  };
}
