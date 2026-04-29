import "server-only";

import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/client";
import type { UserRole } from "@/lib/db/generated/enums";

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
};

/**
 * Look up a non-soft-deleted user by email and verify their password.
 * Returns the auth-friendly user shape on success, `null` on failure.
 *
 * Lives in its own module (free of NextAuth imports) so it can be unit-
 * tested without dragging the whole Auth.js wiring through ESM.
 */
export async function authenticateCredentials(
  email: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, email: true, role: true, passwordHash: true },
  });
  if (!user || !user.passwordHash) return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  return { id: user.id, email: user.email, role: user.role };
}
