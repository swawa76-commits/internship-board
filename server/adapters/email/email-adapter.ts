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
   * Best-effort send.
   *
   * Failure semantics:
   *  - For *expected* provider failures (rate limits, validation
   *    rejections, transient SDK error responses), adapters should
   *    resolve with `{ ok: false, provider, error }` so callers can
   *    log and move on without exception handling.
   *  - For *unexpected* runtime errors (network blow-ups, bugs in the
   *    SDK), adapters MAY throw. `dispatchEmail` wraps every send in
   *    try/catch and synthesizes `{ ok: false }` from a thrown error,
   *    so a primary mutation is never rolled back regardless of which
   *    path triggers.
   */
  send(message: EmailMessage): Promise<EmailSendResult>;

  /** Diagnostic — used by the admin status page if/when one ships. */
  readonly providerName: string;
}
