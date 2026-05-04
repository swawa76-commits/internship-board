import "server-only";

import { Resend } from "resend";

import type {
  EmailAdapter,
  EmailMessage,
  EmailSendResult,
} from "./email-adapter";

/**
 * Resend production adapter. Selected when `EMAIL_DRIVER=resend`.
 *
 * Required env:
 *   RESEND_API_KEY  — provider API key.
 *   EMAIL_FROM      — sender. Bare ("alerts@yourdomain.com") or
 *                     RFC-2822 ("InternshipBoard <alerts@yourdomain.com>").
 *
 * Optional env:
 *   EMAIL_REPLY_TO  — single address used as Reply-To.
 *
 * Failure semantics (matches the EmailAdapter contract):
 *  - Expected provider failures (Resend returns `{ error }`) → resolve
 *    with `{ ok: false, provider, error }` so callers + dispatchEmail
 *    treat them as soft failures.
 *  - Unexpected SDK exceptions (network, runtime) propagate as throws.
 *    `dispatchEmail` already wraps every send in try/catch and synthesizes
 *    `{ ok: false }` from a thrown error, so the primary mutation is
 *    never rolled back regardless of which path triggers.
 *  - Construction-time misconfiguration (missing required env) throws on
 *    boot. This is intentional — a misconfigured production deploy
 *    should fail loudly rather than silently drop notifications.
 */

export const REQUIRED_ENV = ["RESEND_API_KEY", "EMAIL_FROM"] as const;

export class ResendEmailAdapter implements EmailAdapter {
  readonly providerName = "resend";

  readonly from: string;
  readonly replyTo: string | undefined;

  private readonly client: Resend;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const missing = REQUIRED_ENV.filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `ResendEmailAdapter is missing required env: ${missing.join(", ")}. ` +
          `Set EMAIL_DRIVER=console for development, or provide all of: ${REQUIRED_ENV.join(", ")}.`,
      );
    }
    this.from = env.EMAIL_FROM as string;
    this.replyTo = env.EMAIL_REPLY_TO || undefined;
    this.client = new Resend(env.RESEND_API_KEY as string);
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const response = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
      ...(this.replyTo ? { replyTo: this.replyTo } : {}),
    });

    if (response.error) {
      return {
        ok: false,
        provider: this.providerName,
        error: response.error.message ?? String(response.error),
      };
    }

    return { ok: true, provider: this.providerName };
  }
}
