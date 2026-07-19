import { env } from "../config/env.js";
import type { Role, UserStatus } from "../generated/prisma/enums.js";

// ─── Public user serialization ────────────────────────
//
// The single source of truth for what a user looks like to clients. Never
// exposes passwordHash. `avatarPath` is turned into an absolute URL the client
// can drop straight into an <img src>.

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
    avatarUrl: user.avatarPath ? `${env.publicBaseUrl}/uploads/avatars/${user.avatarPath}` : null,
    createdAt: user.createdAt,
  };
}
