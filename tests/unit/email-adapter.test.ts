import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConsoleEmailAdapter,
  selectEmailAdapter,
} from "@/server/adapters/email";

describe("Email adapter selection", () => {
  const originalEnv = process.env.EMAIL_DRIVER;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.EMAIL_DRIVER = originalEnv;
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("returns ConsoleEmailAdapter when EMAIL_DRIVER is unset", () => {
    delete process.env.EMAIL_DRIVER;
    const adapter = selectEmailAdapter();
    expect(adapter).toBeInstanceOf(ConsoleEmailAdapter);
    expect(adapter.providerName).toBe("console");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns ConsoleEmailAdapter when EMAIL_DRIVER=console", () => {
    process.env.EMAIL_DRIVER = "console";
    expect(selectEmailAdapter()).toBeInstanceOf(ConsoleEmailAdapter);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("falls back to console (with a warning) on unknown driver", () => {
    process.env.EMAIL_DRIVER = "definitely-not-a-real-provider";
    const adapter = selectEmailAdapter();
    expect(adapter).toBeInstanceOf(ConsoleEmailAdapter);
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

describe("ConsoleEmailAdapter.send", () => {
  it("logs a structured payload and resolves ok=true", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const adapter = new ConsoleEmailAdapter();
    const r = await adapter.send({
      to: "user@example.com",
      subject: "Hi",
      body: "Hello",
      metadata: { kind: "test" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.provider).toBe("console");

    const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("to:       user@example.com");
    expect(logged).toContain("subject:  Hi");
    expect(logged).toContain("Hello");
    expect(logged).toContain('"kind":"test"');
    logSpy.mockRestore();
  });
});
