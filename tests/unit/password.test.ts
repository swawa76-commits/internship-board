import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("hashes a password to a different string", async () => {
    const hash = await hashPassword("hunter22");
    expect(hash).not.toEqual("hunter22");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true,
    );
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces different hashes for the same input (salt)", async () => {
    const a = await hashPassword("same-input");
    const b = await hashPassword("same-input");
    expect(a).not.toEqual(b);
    expect(await verifyPassword("same-input", a)).toBe(true);
    expect(await verifyPassword("same-input", b)).toBe(true);
  });
});
