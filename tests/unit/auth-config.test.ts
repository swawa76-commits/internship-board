import { describe, expect, it } from "vitest";

import { authConfig } from "@/lib/auth/config";

const callbacks = authConfig.callbacks!;

function makeReq(pathname: string): { auth: any; request: { nextUrl: URL } } {
  return {
    auth: null,
    request: { nextUrl: new URL(`http://localhost${pathname}`) },
  };
}

describe("authConfig.session", () => {
  it("uses JWT session strategy with a 30-day max age", () => {
    expect(authConfig.session?.strategy).toBe("jwt");
    expect(authConfig.session?.maxAge).toBe(60 * 60 * 24 * 30);
  });

  it("points unauthenticated redirects at /login", () => {
    expect(authConfig.pages?.signIn).toBe("/login");
  });
});

describe("authConfig.callbacks.jwt", () => {
  it("copies id and role from the user onto the token at sign-in", () => {
    const out = callbacks.jwt!({
      token: {} as any,
      user: { id: "u_1", role: "STUDENT" } as any,
      account: null,
    } as any);
    expect(out).toMatchObject({ id: "u_1", role: "STUDENT" });
  });

  it("does not embed approvalStatus on the token", () => {
    const out = callbacks.jwt!({
      token: {} as any,
      user: { id: "u_1", role: "COMPANY", approvalStatus: "APPROVED" } as any,
      account: null,
    } as any) as Record<string, unknown>;
    expect(out.approvalStatus).toBeUndefined();
  });

  it("preserves an existing token across refreshes (no user)", () => {
    const out = callbacks.jwt!({
      token: { id: "u_1", role: "ADMIN" } as any,
      user: undefined as any,
      account: null,
    } as any);
    expect(out).toMatchObject({ id: "u_1", role: "ADMIN" });
  });
});

describe("authConfig.callbacks.session", () => {
  it("copies id and role from token onto session.user", () => {
    const out = callbacks.session!({
      session: { user: {} } as any,
      token: { id: "u_1", role: "STUDENT" } as any,
    } as any);
    expect(out.user.id).toBe("u_1");
    expect(out.user.role).toBe("STUDENT");
  });
});

describe("authConfig.callbacks.authorized (middleware gate)", () => {
  it("allows public pages even when unauthenticated", () => {
    const result = callbacks.authorized!({
      ...makeReq("/job-postings"),
    } as any);
    expect(result).toBe(true);
  });

  it("blocks /student when unauthenticated", () => {
    const result = callbacks.authorized!({
      ...makeReq("/student/dashboard"),
    } as any);
    expect(result).toBe(false);
  });

  it("blocks /company when unauthenticated", () => {
    const result = callbacks.authorized!({
      ...makeReq("/company/dashboard"),
    } as any);
    expect(result).toBe(false);
  });

  it("blocks /admin when unauthenticated", () => {
    const result = callbacks.authorized!({
      ...makeReq("/admin"),
    } as any);
    expect(result).toBe(false);
  });

  it("allows a STUDENT into /student", () => {
    const result = callbacks.authorized!({
      auth: { user: { id: "u", role: "STUDENT" } },
      request: { nextUrl: new URL("http://localhost/student/dashboard") },
    } as any);
    expect(result).toBe(true);
  });

  it("redirects a COMPANY trying to access /student to /", () => {
    const result = callbacks.authorized!({
      auth: { user: { id: "u", role: "COMPANY" } },
      request: { nextUrl: new URL("http://localhost/student/dashboard") },
    } as any);
    expect(result).toBeInstanceOf(Response);
    // `Response.redirect` defaults to 302.
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("location")).toBe(
      "http://localhost/",
    );
  });

  it("redirects a STUDENT trying to access /admin to /", () => {
    const result = callbacks.authorized!({
      auth: { user: { id: "u", role: "STUDENT" } },
      request: { nextUrl: new URL("http://localhost/admin") },
    } as any);
    expect(result).toBeInstanceOf(Response);
  });

  it("allows an ADMIN into /admin", () => {
    const result = callbacks.authorized!({
      auth: { user: { id: "u", role: "ADMIN" } },
      request: { nextUrl: new URL("http://localhost/admin") },
    } as any);
    expect(result).toBe(true);
  });
});
