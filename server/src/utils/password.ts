import bcrypt from "bcrypt";

// ─── Password hashing (bcrypt, FR-2) ──────────────────
// NOTE: bcrypt silently truncates input at 72 bytes — the register schema caps
// password length so users never hit that boundary unknowingly.

const SALT_ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, SALT_ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
