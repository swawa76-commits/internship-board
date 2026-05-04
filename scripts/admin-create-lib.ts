/**
 * DB operation for the admin bootstrap CLI. Split from `admin-create.ts`
 * so integration tests can import `createAdminUser` without triggering
 * `main()`. Env parsing lives in `admin-create-env.ts` so it runs
 * before this module (and `lib/db/client.ts`'s DATABASE_URL check)
 * is loaded.
 */

import { hashPassword } from "../lib/auth/password";
import { prisma } from "../lib/db/client";
import type { UserRole } from "../lib/db/generated/enums";

export type CreateAdminResult =
  | { kind: "created"; userId: string }
  | { kind: "already_admin"; userId: string }
  | {
      kind: "email_taken_by_other_role";
      existingRole: Exclude<UserRole, "ADMIN">;
    };

/**
 * Pure DB operation. Caller is responsible for already having validated
 * email + password shape via `parseAdminBootstrapEnv` (or equivalent).
 * This function only handles the existence check + insert race.
 */
export async function createAdminUser(input: {
  email: string;
  password: string;
}): Promise<CreateAdminResult> {
  const existing = await findActiveUserByEmail(input.email);
  if (existing) {
    if (existing.role === "ADMIN") {
      return { kind: "already_admin", userId: existing.id };
    }
    return {
      kind: "email_taken_by_other_role",
      existingRole: existing.role as Exclude<UserRole, "ADMIN">,
    };
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const created = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: "ADMIN",
      },
      select: { id: true },
    });
    return { kind: "created", userId: created.id };
  } catch (err) {
    // P2002 = unique constraint violation. The active-email partial
    // unique index `User_email_active_key` (see migration) can fire
    // here if another process inserts between our precheck and our
    // create. Re-query and disambiguate by role.
    if (isPrismaUniqueViolation(err)) {
      const racedRow = await findActiveUserByEmail(input.email);
      if (racedRow?.role === "ADMIN") {
        return { kind: "already_admin", userId: racedRow.id };
      }
      if (racedRow) {
        return {
          kind: "email_taken_by_other_role",
          existingRole: racedRow.role as Exclude<UserRole, "ADMIN">,
        };
      }
    }
    throw err;
  }
}

async function findActiveUserByEmail(
  email: string,
): Promise<{ id: string; role: UserRole } | null> {
  return prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, role: true },
  });
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
