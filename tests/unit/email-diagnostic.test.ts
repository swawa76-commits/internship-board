// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  EmailAdapter,
  EmailMessage,
  EmailSendResult,
} from "@/server/adapters/email";
import {
  __resetEmailAdapter,
  __setEmailAdapter,
  maskEmailAddress,
  runEmailDiagnostic,
  sanitizeEmailDiagnosticError,
} from "@/server/services/email-service";

class CollectingAdapter implements EmailAdapter {
  readonly providerName = "test-collector";
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(message);
    return { ok: true, provider: this.providerName };
  }
}

class SoftFailAdapter implements EmailAdapter {
  readonly providerName = "test-softfail";
  constructor(private readonly error: string) {}
  async send(): Promise<EmailSendResult> {
    return { ok: false, provider: this.providerName, error: this.error };
  }
}

class ThrowingAdapter implements EmailAdapter {
  readonly providerName = "test-throwing";
  constructor(private readonly message: string) {}
  async send(): Promise<EmailSendResult> {
    throw new Error(this.message);
  }
}

const RECIPIENT = "admin@ventures.win";

beforeEach(() => {
  // Each test installs its own adapter explicitly.
});

afterEach(() => {
  __resetEmailAdapter();
});

describe("runEmailDiagnostic", () => {
  it("returns ok=true with masked recipient when the adapter accepts", async () => {
    const collector = new CollectingAdapter();
    __setEmailAdapter(collector);

    const result = await runEmailDiagnostic({ to: RECIPIENT });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("test-collector");
    expect(result.recipientMasked).toBe("a****@ventures.win");
    expect(result.error).toBeUndefined();

    expect(collector.sent).toHaveLength(1);
    expect(collector.sent[0].subject).toBe("PCI email diagnostic");
    expect(collector.sent[0].to).toBe(RECIPIENT);
    expect(collector.sent[0].body.length).toBeGreaterThan(20);
  });

  it("returns ok=false with the sanitized provider error", async () => {
    __setEmailAdapter(new SoftFailAdapter("rate-limited"));

    const result = await runEmailDiagnostic({ to: RECIPIENT });

    expect(result.ok).toBe(false);
    expect(result.provider).toBe("test-softfail");
    expect(result.error).toBe("rate-limited");
    expect(result.recipientMasked).toBe("a****@ventures.win");
  });

  it("returns ok=false when the adapter throws and dispatchEmail absorbs it", async () => {
    __setEmailAdapter(new ThrowingAdapter("network down"));

    const result = await runEmailDiagnostic({ to: RECIPIENT });

    expect(result.ok).toBe(false);
    expect(result.provider).toBe("test-throwing");
    expect(result.error).toMatch(/network down/);
    expect(result.recipientMasked).toBe("a****@ventures.win");
  });

  it("never echoes the raw recipient in the result", async () => {
    __setEmailAdapter(new CollectingAdapter());

    const result = await runEmailDiagnostic({ to: RECIPIENT });

    const dump = JSON.stringify(result);
    // The full local-part "admin" must not appear anywhere in the result.
    expect(dump).not.toContain("admin@ventures.win");
    expect(dump).not.toMatch(/"to"\s*:\s*"admin@ventures.win"/);
    // The masked form is still present.
    expect(dump).toContain("@ventures.win");
  });

  it("masks credential-shaped substrings in the error", async () => {
    __setEmailAdapter(
      new SoftFailAdapter(
        "API key re_secret_test_key_value_abc rejected; AKIA123456789ABCDEFG; postgres://user:pass@host/db",
      ),
    );

    const result = await runEmailDiagnostic({ to: RECIPIENT });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    const err = result.error!;
    expect(err).not.toContain("re_secret_test_key_value_abc");
    expect(err).toContain("re_***");
    expect(err).not.toContain("AKIA123456789ABCDEFG");
    expect(err).toContain("AKIA***");
    expect(err).not.toContain("user:pass@host");
    expect(err).toContain("***:***@");
  });

  it("clips long error strings", async () => {
    // Long but not secret-shaped: spaces break the alphanumeric-token regex
    // so the only thing being tested here is the length cap.
    const longError = ("error chunk number ".repeat(40)).trim();
    expect(longError.length).toBeGreaterThan(300);
    __setEmailAdapter(new SoftFailAdapter(longError));

    const result = await runEmailDiagnostic({ to: RECIPIENT });

    expect(result.ok).toBe(false);
    expect(result.error!.length).toBeLessThanOrEqual(301); // 300 + ellipsis
    expect(result.error!.endsWith("…")).toBe(true);
  });
});

describe("maskEmailAddress", () => {
  it("masks the local part and keeps the domain", () => {
    expect(maskEmailAddress("admin@ventures.win")).toBe("a****@ventures.win");
    expect(maskEmailAddress("a@b.com")).toBe("***");
    expect(maskEmailAddress("not-an-email")).toBe("***");
    expect(maskEmailAddress("ab@example.com")).toBe("a*@example.com");
  });
});

describe("sanitizeEmailDiagnosticError", () => {
  it("masks Resend-style API keys", () => {
    expect(
      sanitizeEmailDiagnosticError("invalid key re_abc123xyz789def"),
    ).toBe("invalid key re_***");
  });

  it("masks AWS access keys", () => {
    expect(sanitizeEmailDiagnosticError("AKIAABCDEFGHIJKLMNOP rejected")).toBe(
      "AKIA*** rejected",
    );
  });

  it("masks credentials embedded in URLs", () => {
    expect(
      sanitizeEmailDiagnosticError(
        "connection failed at postgres://alice:hunter2@db.example.com:5432/app",
      ),
    ).toBe("connection failed at postgres://***:***@db.example.com:5432/app");
  });

  it("passes through innocuous error text unchanged", () => {
    expect(sanitizeEmailDiagnosticError("rate-limited")).toBe("rate-limited");
    expect(sanitizeEmailDiagnosticError("timeout after 5000ms")).toBe(
      "timeout after 5000ms",
    );
  });
});
