import bcrypt from "bcrypt";

// bcrypt quietly cuts input off at 72 bytes, which is why the register and reset
// schemas cap password length there. without the cap someone sets a long
// password and only the first 72 bytes are ever actually checked

const SALT_ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, SALT_ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
