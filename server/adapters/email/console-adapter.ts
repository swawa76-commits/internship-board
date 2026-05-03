import "server-only";

import type {
  EmailAdapter,
  EmailMessage,
  EmailSendResult,
} from "./email-adapter";

/**
 * Console transport. Used in local development and as the safety
 * fallback whenever production provider env vars are missing. Logs a
 * structured payload so a developer scanning the server console can
 * tell at a glance who would have received what.
 *
 * Format is one block per send:
 *   --- email ---
 *   to:       student@example.com
 *   subject:  Welcome to InternshipBoard
 *   meta:     { kind: 'welcome', userId: '...' }
 *   body:     Hi Sam, …
 *   --- /email ---
 */
export class ConsoleEmailAdapter implements EmailAdapter {
  readonly providerName = "console";

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const lines = [
      "--- email ---",
      `to:       ${message.to}`,
      `subject:  ${message.subject}`,
    ];
    if (message.metadata) {
      lines.push(`meta:     ${JSON.stringify(message.metadata)}`);
    }
    lines.push("body:");
    lines.push(message.body);
    lines.push("--- /email ---");
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
    return { ok: true, provider: this.providerName };
  }
}
