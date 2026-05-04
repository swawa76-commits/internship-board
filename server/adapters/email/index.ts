import "server-only";

import { ConsoleEmailAdapter } from "./console-adapter";
import type { EmailAdapter } from "./email-adapter";
import { ResendEmailAdapter } from "./resend-adapter";

export type {
  EmailAdapter,
  EmailMessage,
  EmailSendResult,
} from "./email-adapter";
export { ConsoleEmailAdapter, ResendEmailAdapter };

/**
 * Resolve the active email adapter based on env vars.
 *
 *   EMAIL_DRIVER=console   → ConsoleEmailAdapter (logs to stdout)
 *   EMAIL_DRIVER=resend    → ResendEmailAdapter (production)
 *   EMAIL_DRIVER=<other>   → unknown driver: warn + fall back to console
 *   (unset)                → ConsoleEmailAdapter
 *
 * Production safety: `resend` requires every env var listed in
 * `ResendEmailAdapter.REQUIRED_ENV`. If any is missing, construction
 * throws — by design. We do NOT silently fall back to console in that
 * case: a misconfigured production deploy should fail loudly on boot
 * rather than silently drop every notification.
 */
export function selectEmailAdapter(): EmailAdapter {
  const driver = (process.env.EMAIL_DRIVER ?? "console").toLowerCase();
  switch (driver) {
    case "console":
      return new ConsoleEmailAdapter();
    case "resend":
      return new ResendEmailAdapter();
    default:
      console.warn(
        `[email] unknown EMAIL_DRIVER="${driver}", falling back to console adapter`,
      );
      return new ConsoleEmailAdapter();
  }
}

export const email: EmailAdapter = selectEmailAdapter();
