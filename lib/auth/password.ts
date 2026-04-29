import bcrypt from "bcryptjs";

/**
 * Cost factor for bcrypt. 12 is a common 2026 default — slow enough to
 * resist brute force but fast enough for sign-in flows in serverless.
 */
const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
