/**
 * Production preflight checker.
 *
 * Usage:
 *   npm run preflight:prod
 *
 * Reads from the standard process env. Operators can either export
 * vars in the shell, source a file (`set -a; source .env.production; set +a`),
 * or wrap with their preferred loader (e.g. `tsx --env-file=.env.production`).
 *
 * Default behavior is read-only:
 *   - No DB writes.
 *   - No real emails sent.
 *   - No storage uploads.
 *
 * Optional opt-ins:
 *   PREFLIGHT_SEND_EMAIL=true     — send one Resend smoke email (requires
 *                                   EMAIL_DRIVER=resend and SMOKE_EMAIL_TO).
 *   PREFLIGHT_STORAGE_WRITE=true  — put/read/delete one tiny test object in
 *                                   the configured S3/R2 bucket. Limited to
 *                                   STORAGE_DRIVER=s3.
 *
 * Migration status is NOT auto-checked. Run separately:
 *   npx prisma migrate status
 *   npm run db:migrate:deploy   # if migrations are pending
 *
 * Exit codes:
 *   0 → no failures (warnings allowed)
 *   1 → at least one fatal check failed
 */

import {
  type CheckResult,
  describeDatabaseUrl,
  summarize,
  validateEnv,
} from "./preflight-checks-lib";

function ts(): string {
  return new Date().toISOString();
}

function printResult(r: CheckResult): void {
  const tag =
    r.severity === "ok" ? "ok  " : r.severity === "warn" ? "WARN" : "FAIL";
  console.log(`[preflight] [${tag}] ${r.name}: ${r.detail}`);
}

async function checkDbConnectivity(): Promise<CheckResult> {
  try {
    const { prisma } = await import("../lib/db/client");
    await prisma.$queryRaw`SELECT 1`;
    return {
      name: "DB connectivity",
      severity: "ok",
      detail: describeDatabaseUrl(process.env.DATABASE_URL),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: "DB connectivity",
      severity: "fail",
      detail: `failed: ${message}`,
    };
  }
}

async function checkActiveAdmin(): Promise<CheckResult> {
  try {
    const { prisma } = await import("../lib/db/client");
    const count = await prisma.user.count({
      where: { role: "ADMIN", deletedAt: null },
    });
    if (count === 0) {
      return {
        name: "Active ADMIN user",
        severity: "fail",
        detail:
          "no active ADMIN found. Run `npm run admin:create` to bootstrap one.",
      };
    }
    return {
      name: "Active ADMIN user",
      severity: "ok",
      detail: `count=${count}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: "Active ADMIN user",
      severity: "fail",
      detail: `query failed: ${message}`,
    };
  }
}

async function maybeSmokeEmail(): Promise<CheckResult | null> {
  if (process.env.PREFLIGHT_SEND_EMAIL !== "true") return null;
  if ((process.env.EMAIL_DRIVER ?? "").toLowerCase() !== "resend") {
    return {
      name: "PREFLIGHT_SEND_EMAIL",
      severity: "fail",
      detail: "set, but EMAIL_DRIVER is not resend",
    };
  }
  const to = process.env.SMOKE_EMAIL_TO;
  if (!to) {
    return {
      name: "PREFLIGHT_SEND_EMAIL",
      severity: "fail",
      detail: "set, but SMOKE_EMAIL_TO is not set",
    };
  }

  try {
    const { ResendEmailAdapter } = await import(
      "../server/adapters/email/resend-adapter"
    );
    const adapter = new ResendEmailAdapter();
    const result = await adapter.send({
      to,
      subject: "InternshipBoard — production preflight smoke",
      body: `Sent at ${ts()} by scripts/preflight-production.ts.\n\nIf you received this, EMAIL_DRIVER=resend works end-to-end.`,
    });
    if (!result.ok) {
      return {
        name: "PREFLIGHT_SEND_EMAIL",
        severity: "fail",
        detail: `provider=${result.provider} error=${result.error}`,
      };
    }
    return {
      name: "PREFLIGHT_SEND_EMAIL",
      severity: "ok",
      detail: `sent to ${maskRecipient(to)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: "PREFLIGHT_SEND_EMAIL",
      severity: "fail",
      detail: `adapter threw: ${message}`,
    };
  }
}

async function maybeStorageRoundTrip(): Promise<CheckResult | null> {
  if (process.env.PREFLIGHT_STORAGE_WRITE !== "true") return null;
  const driver = (process.env.STORAGE_DRIVER ?? "").toLowerCase();
  if (driver !== "s3") {
    return {
      name: "PREFLIGHT_STORAGE_WRITE",
      severity: "fail",
      detail: "set, but STORAGE_DRIVER is not s3 (limited to s3 by design)",
    };
  }

  let storageKey: string | null = null;
  try {
    const { S3StorageAdapter } = await import(
      "../server/adapters/storage/s3-adapter"
    );
    const adapter = new S3StorageAdapter();

    // PNG content type so the shared content-type allowlist accepts it.
    // The bytes are deliberately tiny — a 1×1 transparent PNG would be
    // overkill; the round-trip cares only that put/read/delete succeed.
    const bytes = Buffer.from("preflight-test", "utf8");
    const put = await adapter.put({
      prefix: "logos",
      filename: "preflight.png",
      contentType: "image/png",
      bytes,
    });
    storageKey = put.storageKey;

    const read = await adapter.read(put.storageKey);
    if (read.kind !== "redirect") {
      // Local adapter would return stream, but we already gated to s3.
      throw new Error(`unexpected read kind: ${read.kind}`);
    }
    if (!read.url.startsWith("http")) {
      throw new Error(`presigned URL malformed`);
    }

    return {
      name: "PREFLIGHT_STORAGE_WRITE",
      severity: "ok",
      detail: `put + read (presigned) round-trip succeeded`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: "PREFLIGHT_STORAGE_WRITE",
      severity: "fail",
      detail: `failed: ${message}`,
    };
  } finally {
    if (storageKey) {
      try {
        const { S3StorageAdapter } = await import(
          "../server/adapters/storage/s3-adapter"
        );
        const adapter = new S3StorageAdapter();
        await adapter.delete(storageKey);
      } catch {
        // best-effort cleanup; don't mask the primary result
      }
    }
  }
}

function maskRecipient(addr: string): string {
  const at = addr.indexOf("@");
  if (at < 1) return "***";
  const head = addr.slice(0, 1);
  const local = addr.slice(0, at);
  const domain = addr.slice(at);
  return `${head}${"*".repeat(Math.max(local.length - 1, 1))}${domain}`;
}

async function main(): Promise<void> {
  console.log(`[preflight] starting at ${ts()}`);

  const results: CheckResult[] = [];

  // 1) Pure env validation. Has no side effects, no imports of Prisma
  //    or adapters, so this runs even with DATABASE_URL unset.
  results.push(...validateEnv(process.env));

  // 2) DB-touching read-only checks. Skip if DATABASE_URL is missing —
  //    no point trying to connect.
  if (process.env.DATABASE_URL) {
    results.push(await checkDbConnectivity());
    // Only attempt the admin-count query if connectivity was OK; otherwise
    // we'd just print a duplicate connection error.
    if (results[results.length - 1].severity === "ok") {
      results.push(await checkActiveAdmin());
    }
  }

  // 3) Optional opt-in checks.
  const smoke = await maybeSmokeEmail();
  if (smoke) results.push(smoke);

  const storage = await maybeStorageRoundTrip();
  if (storage) results.push(storage);

  // 4) Print every result.
  for (const r of results) printResult(r);

  // 5) Summary + manual migration nudge.
  const { passed, warnings, failures } = summarize(results);
  console.log(
    `[preflight] ${passed} passed, ${warnings} warning${warnings === 1 ? "" : "s"}, ${failures} failure${failures === 1 ? "" : "s"}`,
  );
  console.log(
    `[preflight] migrations: this script does NOT verify migration status. Run separately:`,
  );
  console.log(`[preflight]   npx prisma migrate status`);
  console.log(
    `[preflight]   npm run db:migrate:deploy   # if migrations are pending`,
  );

  if (failures > 0) {
    console.error(
      `[preflight] FAILED: ${failures} blocking issue${failures === 1 ? "" : "s"}. See [FAIL] lines above.`,
    );
    await disconnectQuiet();
    process.exit(1);
  }
  if (warnings > 0) {
    console.log(
      `[preflight] passed with ${warnings} warning${warnings === 1 ? "" : "s"}. Review [WARN] lines above.`,
    );
  } else {
    console.log(`[preflight] all clear.`);
  }
  await disconnectQuiet();
}

async function disconnectQuiet(): Promise<void> {
  try {
    const { prisma } = await import("../lib/db/client");
    await prisma.$disconnect();
  } catch {
    // best-effort
  }
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[preflight] FAILED: unexpected: ${message}`);
  await disconnectQuiet();
  process.exit(1);
});
