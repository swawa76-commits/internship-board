/**
 * Pure env parsing for the admin bootstrap CLI. No DB or app imports —
 * loads cleanly even when `DATABASE_URL` is unset, so the CLI can print
 * a friendly "missing env" error before `lib/db/client.ts` would
 * otherwise crash on its own DATABASE_URL check.
 */

import { z } from "zod";

export const PASSWORD_MIN = 16;
export const PASSWORD_MAX_BYTES = 72; // bcrypt's silent truncation point

const emailSchema = z.string().trim().toLowerCase().email();

export type EnvParseResult =
  | { ok: true; email: string; password: string }
  | { ok: false; error: string };

export function parseAdminBootstrapEnv(env: NodeJS.ProcessEnv): EnvParseResult {
  const rawEmail = env.ADMIN_EMAIL;
  const rawPassword = env.ADMIN_PASSWORD;
  const rawConfirm = env.CREATE_ADMIN_CONFIRM;

  if (!rawEmail || !rawPassword) {
    return {
      ok: false,
      error:
        "ADMIN_EMAIL and ADMIN_PASSWORD must both be set. " +
        "See DEPLOYMENT.md for the production admin bootstrap procedure.",
    };
  }
  if (!rawConfirm) {
    return {
      ok: false,
      error:
        "CREATE_ADMIN_CONFIRM must be set to the same value as ADMIN_EMAIL. " +
        "This forces you to retype the email and prevents accidental execution.",
    };
  }

  const parsedEmail = emailSchema.safeParse(rawEmail);
  if (!parsedEmail.success) {
    return { ok: false, error: "ADMIN_EMAIL is not a valid email address." };
  }
  const email = parsedEmail.data;

  const parsedConfirm = emailSchema.safeParse(rawConfirm);
  if (!parsedConfirm.success || parsedConfirm.data !== email) {
    return {
      ok: false,
      error:
        "CREATE_ADMIN_CONFIRM does not match ADMIN_EMAIL. " +
        "Set CREATE_ADMIN_CONFIRM to the exact same email address.",
    };
  }

  if (rawPassword.length < PASSWORD_MIN) {
    return {
      ok: false,
      error: `ADMIN_PASSWORD must be at least ${PASSWORD_MIN} characters. Use a password manager.`,
    };
  }
  if (Buffer.byteLength(rawPassword, "utf8") > PASSWORD_MAX_BYTES) {
    return {
      ok: false,
      error:
        `ADMIN_PASSWORD exceeds bcrypt's ${PASSWORD_MAX_BYTES}-byte cap and would be silently truncated. ` +
        `Use a shorter password.`,
    };
  }

  return { ok: true, email, password: rawPassword };
}

export function maskEmail(addr: string): string {
  const at = addr.indexOf("@");
  if (at <= 1) return "***";
  const head = addr.slice(0, 1);
  const local = addr.slice(0, at);
  const domain = addr.slice(at);
  return `${head}${"*".repeat(Math.max(local.length - 1, 1))}${domain}`;
}
