import { env } from "../config/env.js";
import type { Role, UserStatus } from "../generated/prisma/enums.js";

// The single definition of what a user looks like to a client. Everything that
// returns a user goes through here, so passwordHash can never leak by accident.

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
    // Absolute, so the client can drop it straight into an <img src>.
    avatarUrl: user.avatarPath ? `${env.publicBaseUrl}/uploads/avatars/${user.avatarPath}` : null,
    createdAt: user.createdAt,
  };
}
