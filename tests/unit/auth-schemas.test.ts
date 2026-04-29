import { describe, expect, it } from "vitest";

import { loginSchema, signupSchema } from "@/features/auth/schemas";

describe("signupSchema", () => {
  it("accepts valid student signup", () => {
    const r = signupSchema.safeParse({
      email: "Test@Example.com",
      password: "longenough",
      role: "STUDENT",
    });
    expect(r.success).toBe(true);
    // Email is lowercased and trimmed.
    expect(r.success && r.data.email).toBe("test@example.com");
  });

  it("rejects passwords shorter than 8 characters", () => {
    const r = signupSchema.safeParse({
      email: "x@y.com",
      password: "short",
      role: "STUDENT",
    });
    expect(r.success).toBe(false);
  });

  it("rejects ADMIN as a self-registration role", () => {
    const r = signupSchema.safeParse({
      email: "x@y.com",
      password: "longenough",
      role: "ADMIN",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed emails", () => {
    const r = signupSchema.safeParse({
      email: "not-an-email",
      password: "longenough",
      role: "STUDENT",
    });
    expect(r.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("normalizes email to lowercase + trimmed", () => {
    const r = loginSchema.safeParse({
      email: "  USER@Example.COM  ",
      password: "x",
    });
    expect(r.success && r.data.email).toBe("user@example.com");
  });

  it("rejects empty password", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(r.success).toBe(false);
  });
});
