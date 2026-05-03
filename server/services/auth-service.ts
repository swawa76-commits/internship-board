import "server-only";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/client";
import type { UserRole } from "@/lib/db/generated/enums";

export type CreateUserInput = {
  email: string;
  password: string;
  role: Extract<UserRole, "STUDENT" | "COMPANY">;
};

export type CreateUserResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "email_taken" };

/**
 * Sign-up service. Validates uniqueness against active users, hashes the
 * password, and creates the User row. Profiles (Student/Company) are
 * created in their respective onboarding flows (Tasks 6, 7).
 *
 * Note: only STUDENT and COMPANY roles can self-register. ADMIN is seeded.
 */
export async function createUserWithCredentials(
  input: CreateUserInput,
): Promise<CreateUserResult> {
  const existing = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, reason: "email_taken" };
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: input.role,
    },
    select: { id: true },
  });

  // Audit trail: distinct event per role makes the admin feed
  // immediately readable without metadata lookups.
  await prisma.activityEvent.create({
    data: {
      type: input.role === "STUDENT" ? "STUDENT_SIGNUP" : "COMPANY_SIGNUP",
      actorUserId: user.id,
      entityType: "User",
      entityId: user.id,
      metadataJson: { email: input.email },
    },
  });

  return { ok: true, userId: user.id };
}

/**
 * Convenience used by tests and seed scripts to provision a user with a
 * known password. Identical to `createUserWithCredentials` but bypasses
 * the email-taken check (intended for fresh databases / fixtures).
 */
export async function createUserDirect(input: {
  email: string;
  password: string;
  role: UserRole;
}): Promise<{ id: string; email: string; role: UserRole }> {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: input.role,
    },
    select: { id: true, email: true, role: true },
  });
}
