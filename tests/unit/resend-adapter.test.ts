// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resend adapter unit tests. Mocks the `resend` SDK so nothing hits the
 * network. Covers env validation, payload mapping, both failure paths
 * (SDK returns `{ error }` vs. SDK throws), and selector wiring.
 */

const sendMock = vi.fn();

vi.mock("resend", () => {
  class Resend {
    emails = { send: sendMock };
  }
  return { Resend };
});

const baseEnv = {
  RESEND_API_KEY: "re_test_abc",
  EMAIL_FROM: "InternshipBoard <alerts@example.com>",
} as unknown as NodeJS.ProcessEnv;

beforeEach(() => {
  sendMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ResendEmailAdapter — construction", () => {
  it("constructs successfully when every required env var is present", async () => {
    const { ResendEmailAdapter } =
      await import("@/server/adapters/email/resend-adapter");
    const adapter = new ResendEmailAdapter(baseEnv);
    expect(adapter.providerName).toBe("resend");
    expect(adapter.from).toBe("InternshipBoard <alerts@example.com>");
    expect(adapter.replyTo).toBeUndefined();
  });

  it("throws when RESEND_API_KEY is missing", async () => {
    const { ResendEmailAdapter } =
      await import("@/server/adapters/email/resend-adapter");
    expect(
      () =>
        new ResendEmailAdapter({
          EMAIL_FROM: "alerts@example.com",
        } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/missing required env.*RESEND_API_KEY/);
  });

  it("throws when EMAIL_FROM is missing", async () => {
    const { ResendEmailAdapter } =
      await import("@/server/adapters/email/resend-adapter");
    expect(
      () =>
        new ResendEmailAdapter({
          RESEND_API_KEY: "re_test",
        } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/missing required env.*EMAIL_FROM/);
  });

  it("captures EMAIL_REPLY_TO when set", async () => {
    const { ResendEmailAdapter } =
      await import("@/server/adapters/email/resend-adapter");
    const adapter = new ResendEmailAdapter({
      ...baseEnv,
      EMAIL_REPLY_TO: "support@example.com",
    } as unknown as NodeJS.ProcessEnv);
    expect(adapter.replyTo).toBe("support@example.com");
  });
});

describe("ResendEmailAdapter.send — payload mapping", () => {
  it("maps EmailMessage to the Resend payload (from/to/subject/text)", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg-1" }, error: null });
    const { ResendEmailAdapter } =
      await import("@/server/adapters/email/resend-adapter");
    const adapter = new ResendEmailAdapter(baseEnv);

    const result = await adapter.send({
      to: "user@example.com",
      subject: "Welcome",
      body: "Hello there",
      metadata: { kind: "student_welcome", userId: "u1" },
    });

    expect(result).toEqual({ ok: true, provider: "resend" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.from).toBe("InternshipBoard <alerts@example.com>");
    expect(payload.to).toBe("user@example.com");
    expect(payload.subject).toBe("Welcome");
    expect(payload.text).toBe("Hello there");
    // Plain text only — never sets html.
    expect(payload.html).toBeUndefined();
    expect(payload.replyTo).toBeUndefined();
  });

  it("includes replyTo only when EMAIL_REPLY_TO is configured", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg-2" }, error: null });
    const { ResendEmailAdapter } =
      await import("@/server/adapters/email/resend-adapter");
    const adapter = new ResendEmailAdapter({
      ...baseEnv,
      EMAIL_REPLY_TO: "support@example.com",
    } as unknown as NodeJS.ProcessEnv);

    await adapter.send({
      to: "user@example.com",
      subject: "Hi",
      body: "body",
    });

    expect(sendMock.mock.calls[0][0].replyTo).toBe("support@example.com");
  });
});

describe("ResendEmailAdapter.send — failure paths", () => {
  it("returns { ok: false } when Resend responds with an error object", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid `to` field" },
    });
    const { ResendEmailAdapter } =
      await import("@/server/adapters/email/resend-adapter");
    const adapter = new ResendEmailAdapter(baseEnv);

    const result = await adapter.send({
      to: "broken",
      subject: "x",
      body: "y",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.provider).toBe("resend");
    expect(result.error).toBe("Invalid `to` field");
  });

  it("propagates thrown SDK exceptions to the caller (dispatchEmail will absorb)", async () => {
    sendMock.mockRejectedValue(new Error("network down"));
    const { ResendEmailAdapter } =
      await import("@/server/adapters/email/resend-adapter");
    const adapter = new ResendEmailAdapter(baseEnv);

    await expect(
      adapter.send({ to: "user@example.com", subject: "x", body: "y" }),
    ).rejects.toThrow(/network down/);
  });

  it("dispatchEmail absorbs a thrown ResendEmailAdapter into ok=false", async () => {
    sendMock.mockRejectedValue(new Error("kaboom"));
    const { ResendEmailAdapter } =
      await import("@/server/adapters/email/resend-adapter");
    const { dispatchEmail, __setEmailAdapter, __resetEmailAdapter } =
      await import("@/server/services/email-service");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const adapter = new ResendEmailAdapter(baseEnv);
    __setEmailAdapter(adapter);
    try {
      const result = await dispatchEmail({
        to: "user@example.com",
        subject: "x",
        body: "y",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.provider).toBe("resend");
      expect(result.error).toMatch(/kaboom/);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      __resetEmailAdapter();
      errSpy.mockRestore();
    }
  });
});

describe("selectEmailAdapter — resend wiring", () => {
  it("returns ResendEmailAdapter when EMAIL_DRIVER=resend and env is present", async () => {
    vi.stubEnv("EMAIL_DRIVER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_abc");
    vi.stubEnv("EMAIL_FROM", "alerts@example.com");

    const { selectEmailAdapter, ResendEmailAdapter } =
      await import("@/server/adapters/email");
    const adapter = selectEmailAdapter();
    expect(adapter).toBeInstanceOf(ResendEmailAdapter);
    expect(adapter.providerName).toBe("resend");
  });

  it("propagates the missing-env error when EMAIL_DRIVER=resend without keys", async () => {
    vi.stubEnv("EMAIL_DRIVER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");

    const { selectEmailAdapter } = await import("@/server/adapters/email");
    expect(() => selectEmailAdapter()).toThrow(/missing required env/);
  });
});
