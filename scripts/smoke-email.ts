/**
 * One-shot Resend smoke test.
 *
 * Usage:
 *   SMOKE_EMAIL_TO=you@example.com npm run smoke:email
 *
 * Reads from the standard process env. Operators can either export
 * vars in the shell, source a file (`set -a; source .env; set +a`),
 * or wrap with their preferred loader (e.g. `tsx --env-file=.env`,
 * `dotenv -e .env --`).
 *
 * Required env:
 *   RESEND_API_KEY   — provider API key (validated by ResendEmailAdapter)
 *   EMAIL_FROM       — sender (validated by ResendEmailAdapter)
 *   SMOKE_EMAIL_TO   — recipient. Hard-refuses if unset.
 *
 * Optional env:
 *   EMAIL_REPLY_TO   — applied if set.
 *
 * Behavior:
 *   - Sends exactly one plain-text email.
 *   - Bypasses dispatchEmail's absorption wrapper on purpose so a
 *     provider failure surfaces as a non-zero exit code.
 *   - Never prints API keys, the raw EMAIL_FROM value, or the message
 *     body. The recipient address is masked in stdout.
 */

import { ResendEmailAdapter } from "../server/adapters/email/resend-adapter";

function maskEmail(addr: string): string {
  const at = addr.indexOf("@");
  if (at <= 1) return "***";
  const local = addr.slice(0, at);
  const domain = addr.slice(at);
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(local.length - 1, 1))}${domain}`;
}

async function main(): Promise<void> {
  const to = process.env.SMOKE_EMAIL_TO;
  if (!to) {
    console.error(
      "[smoke:email] refusing to run: SMOKE_EMAIL_TO is not set. " +
        "Set it to a recipient address, e.g. SMOKE_EMAIL_TO=you@example.com",
    );
    process.exit(1);
  }

  const adapter = new ResendEmailAdapter();

  const stamp = new Date().toISOString();
  const host =
    process.env.HOSTNAME ?? process.env.COMPUTERNAME ?? "unknown-host";
  const subject = "InternshipBoard — Resend smoke test";
  const body =
    `This is a smoke test of the Resend email integration.\n\n` +
    `Sent at: ${stamp}\n` +
    `From host: ${host}\n\n` +
    `If you received this, the production EMAIL_DRIVER=resend path works.`;

  const masked = maskEmail(to);
  console.log(
    `[smoke:email] sending one test message to=${masked} provider=resend`,
  );

  let result;
  try {
    result = await adapter.send({ to, subject, body });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[smoke:email] FAILED: adapter threw: ${message}`);
    process.exit(1);
  }

  if (!result.ok) {
    console.error(
      `[smoke:email] FAILED: provider=${result.provider} error=${result.error}`,
    );
    process.exit(1);
  }

  console.log(`[smoke:email] ok provider=${result.provider} to=${masked}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[smoke:email] FAILED: unexpected: ${message}`);
  process.exit(1);
});
