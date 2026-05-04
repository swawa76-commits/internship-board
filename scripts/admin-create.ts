/**
 * One-shot production admin bootstrap.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@yourdomain.com \
 *   ADMIN_PASSWORD='use-a-password-manager-1234' \
 *   CREATE_ADMIN_CONFIRM=admin@yourdomain.com \
 *   npm run admin:create
 *
 * Reads from the standard process env. Operators can either export
 * vars in the shell, source a file (`set -a; source .env; set +a`),
 * or wrap with their preferred loader (e.g. `tsx --env-file=.env`).
 *
 * Required env:
 *   ADMIN_EMAIL              — admin email address.
 *   ADMIN_PASSWORD           — at least 16 characters, at most 72 UTF-8 bytes.
 *   CREATE_ADMIN_CONFIRM     — must equal ADMIN_EMAIL (after trim/lowercase).
 *                              Forces the operator to retype the email and
 *                              prevents accidental execution.
 *
 * Behavior:
 *   - Refuses to run unless CREATE_ADMIN_CONFIRM matches ADMIN_EMAIL.
 *   - Validates email format and password length/byte-cap.
 *   - If an active ADMIN with that email already exists, returns
 *     idempotent success and exits 0. Does NOT rotate the password.
 *   - If an active STUDENT or COMPANY with that email exists, refuses
 *     loudly (no role mutation).
 *   - Otherwise creates the User row with a bcrypt-hashed password.
 *   - Catches Prisma P2002 (partial-unique race on `User_email_active_key`)
 *     and re-queries to disambiguate.
 *   - Never logs the password, the hash, or any secret.
 *   - Does NOT create profiles, demo data, or send any email.
 *   - Does NOT write an ActivityEvent. The `ActivityEventType` enum
 *     has no system/bootstrap entry; adding one would require a
 *     migration, which is out of scope for this task. The script's
 *     stdout line is the audit trail.
 */

import { maskEmail, parseAdminBootstrapEnv } from "./admin-create-env";

async function main(): Promise<void> {
  // Validate env BEFORE any module that reads DATABASE_URL is loaded.
  // `admin-create-lib` (transitively) imports `lib/db/client.ts`,
  // which throws on missing DATABASE_URL at import time. Surfacing a
  // friendly env error first makes the failure mode clear.
  const parsed = parseAdminBootstrapEnv(process.env);
  if (!parsed.ok) {
    console.error(`[admin:create] refusing to run: ${parsed.error}`);
    process.exit(1);
  }
  const { email, password } = parsed;
  const masked = maskEmail(email);

  console.log(`[admin:create] creating ADMIN userEmail=${masked}`);

  const { createAdminUser } = await import("./admin-create-lib");
  const { prisma } = await import("../lib/db/client");

  try {
    const result = await createAdminUser({ email, password });
    switch (result.kind) {
      case "created":
        console.log(
          `[admin:create] ok created ADMIN userId=${result.userId} email=${masked}`,
        );
        break;
      case "already_admin":
        console.log(
          `[admin:create] noop: an ADMIN with that email already exists ` +
            `userId=${result.userId} email=${masked}. ` +
            `Password is unchanged — run a separate password-reset flow if you need to rotate.`,
        );
        break;
      case "email_taken_by_other_role":
        console.error(
          `[admin:create] FAILED: email=${masked} is already in use by ` +
            `role=${result.existingRole}. Refusing to mutate that user's role. ` +
            `Pick a different ADMIN_EMAIL or remove the conflicting account through admin UI.`,
        );
        await prisma.$disconnect();
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[admin:create] FAILED: ${message}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[admin:create] FAILED: unexpected: ${message}`);
  process.exit(1);
});
