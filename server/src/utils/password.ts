import bcrypt from "bcrypt";

// NOTE: bcrypt silently truncates input at 72 bytes, which is why the register
// and reset schemas cap password length there. Without the cap, users could set
// a long password and only the first 72 bytes would ever be checked.

const SALT_ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, SALT_ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
