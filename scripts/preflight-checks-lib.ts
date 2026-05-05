/**
 * Pure env-validation helpers for the production preflight CLI.
 *
 * No Prisma, no storage adapter, no email adapter imports — this file
 * loads cleanly even when DATABASE_URL is unset, so unit tests don't
 * have to mock them. The CLI orchestrator is the only place that
 * imports runtime adapters and Prisma.
 */

import { z } from "zod";

export type Severity = "ok" | "warn" | "fail";

export type CheckResult = {
  name: string;
  severity: Severity;
  detail: string;
};

const KNOWN_STORAGE_DRIVERS = ["local", "local-fs", "noop", "s3"] as const;
const KNOWN_EMAIL_DRIVERS = ["console", "resend"] as const;

const bareEmailSchema = z.string().trim().toLowerCase().email();

/**
 * Accepts either a bare address ("alerts@example.com") or RFC-2822
 * "Display Name <addr@host>". Returns the parsed bare address on
 * success, or null on parse failure.
 */
function parseEmailFrom(raw: string): string | null {
  const trimmed = raw.trim();
  const angleMatch = trimmed.match(/<([^<>]+)>\s*$/);
  const candidate = angleMatch ? angleMatch[1] : trimmed;
  const parsed = bareEmailSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function maskLocal(local: string): string {
  if (local.length <= 1) return "*";
  return local.slice(0, 1) + "*".repeat(Math.max(local.length - 1, 1));
}

export function maskEmail(addr: string): string {
  const at = addr.indexOf("@");
  if (at < 1) return "***";
  return `${maskLocal(addr.slice(0, at))}${addr.slice(at)}`;
}

function ok(name: string, detail = "set"): CheckResult {
  return { name, severity: "ok", detail };
}
function warn(name: string, detail: string): CheckResult {
  return { name, severity: "warn", detail };
}
function fail(name: string, detail: string): CheckResult {
  return { name, severity: "fail", detail };
}

/**
 * Run every env-only check. Returns an ordered list of results.
 * Caller decides exit code based on whether any `fail` exists.
 */
export function validateEnv(env: NodeJS.ProcessEnv): CheckResult[] {
  const results: CheckResult[] = [];
  const isProduction = env.NODE_ENV === "production";

  // ---------- Required env ----------

  results.push(checkPresent(env, "DATABASE_URL"));
  results.push(checkAuthSecret(env));
  results.push(...checkAuthUrl(env, isProduction));

  // ---------- Storage driver ----------

  const storageDriver = (env.STORAGE_DRIVER ?? "").toLowerCase();
  if (!env.STORAGE_DRIVER) {
    results.push(fail("STORAGE_DRIVER", "missing"));
  } else if (
    !(KNOWN_STORAGE_DRIVERS as readonly string[]).includes(storageDriver)
  ) {
    results.push(
      fail(
        "STORAGE_DRIVER",
        `unknown value "${storageDriver}". Expected one of: ${KNOWN_STORAGE_DRIVERS.join(", ")}`,
      ),
    );
  } else {
    results.push(ok("STORAGE_DRIVER", storageDriver));
  }

  if (storageDriver === "s3") {
    results.push(...checkS3Env(env));
  } else if (
    (storageDriver === "local" || storageDriver === "local-fs") &&
    isProduction
  ) {
    results.push(
      warn(
        "STORAGE_DRIVER",
        `"${storageDriver}" in production: uploads write to ./storage-uploads, which is ephemeral on serverless platforms. Set STORAGE_DRIVER=s3 to persist resumes and logos.`,
      ),
    );
  }

  // ---------- Email driver ----------

  const emailDriver = (env.EMAIL_DRIVER ?? "").toLowerCase();
  if (!env.EMAIL_DRIVER) {
    results.push(fail("EMAIL_DRIVER", "missing"));
  } else if (
    !(KNOWN_EMAIL_DRIVERS as readonly string[]).includes(emailDriver)
  ) {
    results.push(
      fail(
        "EMAIL_DRIVER",
        `unknown value "${emailDriver}". Expected one of: ${KNOWN_EMAIL_DRIVERS.join(", ")}`,
      ),
    );
  } else {
    results.push(ok("EMAIL_DRIVER", emailDriver));
  }

  if (emailDriver === "resend") {
    results.push(...checkResendEnv(env));
  } else if (emailDriver === "console" && isProduction) {
    results.push(
      warn(
        "EMAIL_DRIVER",
        `"console" in production: notifications are logged to stdout and never delivered. Set EMAIL_DRIVER=resend before going live.`,
      ),
    );
  }

  return results;
}

function checkPresent(env: NodeJS.ProcessEnv, name: string): CheckResult {
  const v = env[name];
  if (!v || !v.trim()) return fail(name, "missing");
  return ok(name);
}

function checkAuthSecret(env: NodeJS.ProcessEnv): CheckResult {
  const v = env.AUTH_SECRET;
  if (!v) return fail("AUTH_SECRET", "missing");
  if (v.length < 32) {
    return fail(
      "AUTH_SECRET",
      `length=${v.length}: production AUTH_SECRET should be at least 32 characters as a security/config hygiene requirement. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return ok("AUTH_SECRET", `length=${v.length}`);
}

function checkAuthUrl(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
): CheckResult[] {
  const v = env.AUTH_URL;
  if (!v) return [fail("AUTH_URL", "missing")];
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return [fail("AUTH_URL", "not a valid URL")];
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return [fail("AUTH_URL", `unsupported protocol "${url.protocol}"`)];
  }
  if (url.protocol === "http:") {
    if (isProduction) {
      return [
        fail(
          "AUTH_URL",
          `host=${url.host} uses http: in production. Use a canonical https URL (e.g. https://${url.host}).`,
        ),
      ];
    }
    return [
      warn(
        "AUTH_URL",
        `host=${url.host} uses http:. Acceptable behind a TLS-terminating proxy; otherwise prefer https.`,
      ),
    ];
  }
  return [ok("AUTH_URL", `host=${url.host}`)];
}

function checkS3Env(env: NodeJS.ProcessEnv): CheckResult[] {
  const out: CheckResult[] = [];

  for (const name of [
    "S3_BUCKET",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ] as const) {
    const v = env[name];
    if (!v || !v.trim()) {
      out.push(fail(name, "required when STORAGE_DRIVER=s3"));
      continue;
    }
    if (name === "S3_BUCKET" || name === "S3_REGION") {
      out.push(ok(name, v));
    } else {
      out.push(ok(name, "present"));
    }
  }

  if (env.S3_SIGNED_URL_TTL_SECONDS != null && env.S3_SIGNED_URL_TTL_SECONDS !== "") {
    const n = Number.parseInt(env.S3_SIGNED_URL_TTL_SECONDS, 10);
    if (!Number.isFinite(n) || n <= 0 || `${n}` !== env.S3_SIGNED_URL_TTL_SECONDS.trim()) {
      out.push(
        fail(
          "S3_SIGNED_URL_TTL_SECONDS",
          `expected a positive integer, got "${env.S3_SIGNED_URL_TTL_SECONDS}"`,
        ),
      );
    } else {
      out.push(ok("S3_SIGNED_URL_TTL_SECONDS", `${n}s`));
    }
  }

  const region = (env.S3_REGION ?? "").toLowerCase();
  const endpoint = env.S3_ENDPOINT?.trim();
  if (region === "auto" && !endpoint) {
    out.push(
      warn(
        "S3_ENDPOINT",
        `S3_REGION=auto suggests Cloudflare R2, but S3_ENDPOINT is unset. R2 needs a custom endpoint, e.g. https://<account>.r2.cloudflarestorage.com.`,
      ),
    );
  } else if (endpoint) {
    try {
      const u = new URL(endpoint);
      out.push(ok("S3_ENDPOINT", `host=${u.host}`));
    } catch {
      out.push(fail("S3_ENDPOINT", `not a valid URL: "${endpoint}"`));
    }
  }

  return out;
}

function checkResendEnv(env: NodeJS.ProcessEnv): CheckResult[] {
  const out: CheckResult[] = [];

  if (!env.RESEND_API_KEY?.trim()) {
    out.push(fail("RESEND_API_KEY", "required when EMAIL_DRIVER=resend"));
  } else {
    out.push(ok("RESEND_API_KEY", "present"));
  }

  if (!env.EMAIL_FROM?.trim()) {
    out.push(fail("EMAIL_FROM", "required when EMAIL_DRIVER=resend"));
  } else {
    const parsed = parseEmailFrom(env.EMAIL_FROM);
    if (!parsed) {
      out.push(
        fail(
          "EMAIL_FROM",
          `expected a bare address or "Display Name <addr@host>"`,
        ),
      );
    } else {
      out.push(ok("EMAIL_FROM", maskEmail(parsed)));
    }
  }

  if (env.EMAIL_REPLY_TO != null && env.EMAIL_REPLY_TO.trim() !== "") {
    const parsed = bareEmailSchema.safeParse(env.EMAIL_REPLY_TO.trim());
    if (!parsed.success) {
      out.push(fail("EMAIL_REPLY_TO", "not a valid email address"));
    } else {
      out.push(ok("EMAIL_REPLY_TO", maskEmail(parsed.data)));
    }
  }

  return out;
}

/**
 * Mask a Postgres URL down to host + database for safe logging. Never
 * surfaces user, password, or query parameters (which may include
 * tokens on some providers).
 */
export function describeDatabaseUrl(raw: string | undefined): string {
  if (!raw) return "missing";
  try {
    const u = new URL(raw);
    const dbname = u.pathname.replace(/^\//, "") || "(no db)";
    return `host=${u.hostname} db=${dbname}`;
  } catch {
    return "unparseable";
  }
}

export function summarize(results: CheckResult[]): {
  passed: number;
  warnings: number;
  failures: number;
} {
  let passed = 0;
  let warnings = 0;
  let failures = 0;
  for (const r of results) {
    if (r.severity === "ok") passed++;
    else if (r.severity === "warn") warnings++;
    else failures++;
  }
  return { passed, warnings, failures };
}
