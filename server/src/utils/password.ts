import bcrypt from "bcrypt";

// bcrypt silently truncates at 72 bytes, so the register and reset schemas cap
// length there. Without it, only the first 72 bytes would ever be checked.

const SALT_ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, SALT_ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
