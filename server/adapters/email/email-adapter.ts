import "server-only";

/**
 * Email adapter contract — all transports (console, SMTP, SES, etc.)
 * implement this. Keep it intentionally minimal: nothing about
 * templates, retries, or scheduling lives here. Those concerns belong
 * in `email-service`, which composes payloads then hands them off.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body. Real providers can choose to wrap as HTML if needed. */
  body: string;
  /** Free-form structured metadata for logs and provider tags. */
  metadata?: Record<string, unknown>;
};

export type EmailSendResult =
  | { ok: true; provider: string }
  | { ok: false; provider: string; error: string };

export interface EmailAdapter {
  /**
   * Best-effort send. Adapters should NOT throw — they always resolve
   * with a Result so the caller can decide whether to swallow or
   * surface the failure. The email-service caller wraps every send in
   * a safe-fire helper anyway, but adapter authors should still
   * follow this contract for predictability.
   */
  send(message: EmailMessage): Promise<EmailSendResult>;

  /** Diagnostic — used by the admin status page if/when one ships. */
  readonly providerName: string;
}
