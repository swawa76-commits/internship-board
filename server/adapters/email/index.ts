import "server-only";

import { ConsoleEmailAdapter } from "./console-adapter";
import type { EmailAdapter } from "./email-adapter";

export type { EmailAdapter, EmailMessage, EmailSendResult } from "./email-adapter";
export { ConsoleEmailAdapter };

/**
 * Resolve the active email adapter based on env vars.
 *
 *   EMAIL_DRIVER=console   → ConsoleEmailAdapter (logs to stdout)
 *   EMAIL_DRIVER=<other>   → unknown driver: warn + fall back to console
 *   (unset)                → ConsoleEmailAdapter
 *
 * No real SMTP/SES adapter ships in V1; the brief is explicit that a
 * real provider can be wired in later through the same interface
 * without touching call sites. The ONLY hard requirement here is that
 * a missing/misconfigured driver MUST NOT crash — fall back, log a
 * one-line warning, and keep the app booting.
 */
export function selectEmailAdapter(): EmailAdapter {
  const driver = (process.env.EMAIL_DRIVER ?? "console").toLowerCase();
  switch (driver) {
    case "console":
      return new ConsoleEmailAdapter();
    default:
      console.warn(
        `[email] unknown EMAIL_DRIVER="${driver}", falling back to console adapter`,
      );
      return new ConsoleEmailAdapter();
  }
}

export const email: EmailAdapter = selectEmailAdapter();
