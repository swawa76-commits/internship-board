// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  describeDatabaseUrl,
  maskEmail,
  summarize,
  validateEnv,
} from "../../scripts/preflight-checks-lib";

const PROD_BASE = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:secret@db.example.com:5432/internship",
  AUTH_SECRET: "x".repeat(32),
  AUTH_URL: "https://app.example.com",
  STORAGE_DRIVER: "s3",
  S3_BUCKET: "internshipboard-uploads",
  S3_REGION: "auto",
  S3_ACCESS_KEY_ID: "AKIA-test",
  S3_SECRET_ACCESS_KEY: "secret-test",
  S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
  EMAIL_DRIVER: "resend",
  RESEND_API_KEY: "re_secret_test_key_value",
  EMAIL_FROM: "InternshipBoard <alerts@example.com>",
} as unknown as NodeJS.ProcessEnv;

function findByName(results: ReturnType<typeof validateEnv>, name: string) {
  return results.filter((r) => r.name === name);
}

describe("validateEnv — happy path", () => {
  it("passes with no failures and no warnings on a fully configured production env", () => {
    const r = validateEnv(PROD_BASE);
    const fails = r.filter((x) => x.severity === "fail");
    const warns = r.filter((x) => x.severity === "warn");
    expect(fails).toHaveLength(0);
    expect(warns).toHaveLength(0);
  });

  it("never echoes the RESEND_API_KEY value", () => {
    const r = validateEnv(PROD_BASE);
    const dump = JSON.stringify(r);
    expect(dump).not.toContain("re_secret_test_key_value");
  });

  it("never echoes AUTH_SECRET, S3_SECRET_ACCESS_KEY, or DATABASE_URL credentials", () => {
    const r = validateEnv(PROD_BASE);
    const dump = JSON.stringify(r);
    expect(dump).not.toContain("secret-test");
    expect(dump).not.toContain("user:secret");
    // AUTH_SECRET length is fine to surface; the value itself is not.
    expect(dump).not.toContain("x".repeat(32));
  });

  it("masks EMAIL_FROM when reporting it", () => {
    const r = validateEnv(PROD_BASE);
    const efrom = findByName(r, "EMAIL_FROM")[0];
    expect(efrom.severity).toBe("ok");
    expect(efrom.detail).not.toContain("alerts@example.com");
    expect(efrom.detail).toContain("@example.com");
    expect(efrom.detail).toMatch(/\*+/);
  });
});

describe("validateEnv — required env", () => {
  it.each([
    "DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_URL",
    "STORAGE_DRIVER",
    "EMAIL_DRIVER",
  ] as const)("flags missing %s as fail", (key) => {
    const env = { ...PROD_BASE, [key]: undefined } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, key);
    expect(hit.some((x) => x.severity === "fail")).toBe(true);
  });

  it("flags AUTH_SECRET shorter than 32 characters as fail", () => {
    const env = { ...PROD_BASE, AUTH_SECRET: "x".repeat(31) } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "AUTH_SECRET")[0];
    expect(hit.severity).toBe("fail");
    expect(hit.detail).toMatch(/at least 32 characters/);
  });

  it("AUTH_SECRET fail message does not claim Auth.js categorically refuses", () => {
    const env = { ...PROD_BASE, AUTH_SECRET: "short" } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "AUTH_SECRET")[0];
    expect(hit.detail).not.toMatch(/refus|sign tokens/i);
    expect(hit.detail).toMatch(/security|hygiene/i);
  });
});

describe("validateEnv — AUTH_URL", () => {
  it("fails if AUTH_URL is not a valid URL", () => {
    const env = { ...PROD_BASE, AUTH_URL: "not-a-url" } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "AUTH_URL")[0];
    expect(hit.severity).toBe("fail");
  });

  it("fails AUTH_URL=http: in production", () => {
    const env = {
      ...PROD_BASE,
      AUTH_URL: "http://app.example.com",
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "AUTH_URL")[0];
    expect(hit.severity).toBe("fail");
    expect(hit.detail).toMatch(/https/);
  });

  it("warns AUTH_URL=http: outside production", () => {
    const env = {
      ...PROD_BASE,
      NODE_ENV: "development",
      AUTH_URL: "http://localhost:3000",
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "AUTH_URL")[0];
    expect(hit.severity).toBe("warn");
  });

  it("never echoes AUTH_URL query strings; reports only host", () => {
    const env = {
      ...PROD_BASE,
      AUTH_URL: "https://app.example.com/cb?session=secret-token",
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "AUTH_URL")[0];
    expect(hit.detail).not.toContain("secret-token");
    expect(hit.detail).toContain("host=app.example.com");
  });
});

describe("validateEnv — STORAGE_DRIVER=s3 branch", () => {
  it.each([
    "S3_BUCKET",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ] as const)("fails when %s is missing", (key) => {
    const env = { ...PROD_BASE, [key]: undefined } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, key)[0];
    expect(hit.severity).toBe("fail");
  });

  it("warns when S3_REGION=auto and S3_ENDPOINT is unset", () => {
    const env = { ...PROD_BASE, S3_ENDPOINT: undefined } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "S3_ENDPOINT")[0];
    expect(hit.severity).toBe("warn");
    expect(hit.detail).toMatch(/R2/i);
  });

  it("does not warn when S3_REGION is a real AWS region and endpoint is unset", () => {
    const env = {
      ...PROD_BASE,
      S3_REGION: "us-east-1",
      S3_ENDPOINT: undefined,
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hits = findByName(r, "S3_ENDPOINT");
    expect(hits).toHaveLength(0);
  });

  it.each(["foo", "-1", "0", "12.5", "1e2"])(
    "fails malformed S3_SIGNED_URL_TTL_SECONDS=%s",
    (val) => {
      const env = {
        ...PROD_BASE,
        S3_SIGNED_URL_TTL_SECONDS: val,
      } as NodeJS.ProcessEnv;
      const r = validateEnv(env);
      const hit = findByName(r, "S3_SIGNED_URL_TTL_SECONDS")[0];
      expect(hit.severity).toBe("fail");
    },
  );

  it("accepts a positive integer S3_SIGNED_URL_TTL_SECONDS", () => {
    const env = {
      ...PROD_BASE,
      S3_SIGNED_URL_TTL_SECONDS: "600",
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "S3_SIGNED_URL_TTL_SECONDS")[0];
    expect(hit.severity).toBe("ok");
  });
});

describe("validateEnv — STORAGE_DRIVER=local in production", () => {
  it("warns (not fails) on STORAGE_DRIVER=local with NODE_ENV=production", () => {
    const env = {
      DATABASE_URL: PROD_BASE.DATABASE_URL,
      AUTH_SECRET: PROD_BASE.AUTH_SECRET,
      AUTH_URL: PROD_BASE.AUTH_URL,
      EMAIL_DRIVER: "console",
      STORAGE_DRIVER: "local",
      NODE_ENV: "production",
    } as unknown as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const warns = r.filter(
      (x) => x.name === "STORAGE_DRIVER" && x.severity === "warn",
    );
    expect(warns).toHaveLength(1);
    expect(warns[0].detail).toMatch(/ephemeral/i);
  });

  it("does not warn on STORAGE_DRIVER=local outside production", () => {
    const env = {
      DATABASE_URL: PROD_BASE.DATABASE_URL,
      AUTH_SECRET: PROD_BASE.AUTH_SECRET,
      AUTH_URL: "http://localhost:3000",
      EMAIL_DRIVER: "console",
      STORAGE_DRIVER: "local",
      NODE_ENV: "development",
    } as unknown as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const warns = r.filter(
      (x) => x.name === "STORAGE_DRIVER" && x.severity === "warn",
    );
    expect(warns).toHaveLength(0);
  });
});

describe("validateEnv — EMAIL_DRIVER branches", () => {
  it("fails on missing RESEND_API_KEY when EMAIL_DRIVER=resend", () => {
    const env = {
      ...PROD_BASE,
      RESEND_API_KEY: undefined,
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "RESEND_API_KEY")[0];
    expect(hit.severity).toBe("fail");
  });

  it("fails on missing EMAIL_FROM when EMAIL_DRIVER=resend", () => {
    const env = { ...PROD_BASE, EMAIL_FROM: undefined } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "EMAIL_FROM")[0];
    expect(hit.severity).toBe("fail");
  });

  it("fails malformed EMAIL_FROM", () => {
    const env = {
      ...PROD_BASE,
      EMAIL_FROM: "not an email <broken@",
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "EMAIL_FROM")[0];
    expect(hit.severity).toBe("fail");
  });

  it("accepts bare EMAIL_FROM and angle-bracket EMAIL_FROM", () => {
    for (const v of [
      "alerts@example.com",
      "InternshipBoard <alerts@example.com>",
      "  Admin User  <admin@yourdomain.com>",
    ]) {
      const env = { ...PROD_BASE, EMAIL_FROM: v } as NodeJS.ProcessEnv;
      const r = validateEnv(env);
      const hit = findByName(r, "EMAIL_FROM")[0];
      expect(hit.severity).toBe("ok");
    }
  });

  it("fails malformed EMAIL_REPLY_TO", () => {
    const env = {
      ...PROD_BASE,
      EMAIL_REPLY_TO: "not-an-email",
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "EMAIL_REPLY_TO")[0];
    expect(hit.severity).toBe("fail");
  });

  it("warns on EMAIL_DRIVER=console in production", () => {
    const env = {
      ...PROD_BASE,
      EMAIL_DRIVER: "console",
      RESEND_API_KEY: undefined,
      EMAIL_FROM: undefined,
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "EMAIL_DRIVER").find((x) => x.severity === "warn");
    expect(hit).toBeDefined();
  });

  it("does not warn on EMAIL_DRIVER=console outside production", () => {
    const env = {
      ...PROD_BASE,
      NODE_ENV: "development",
      AUTH_URL: "http://localhost:3000",
      EMAIL_DRIVER: "console",
      RESEND_API_KEY: undefined,
      EMAIL_FROM: undefined,
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "EMAIL_DRIVER").find((x) => x.severity === "warn");
    expect(hit).toBeUndefined();
  });
});

describe("validateEnv — unknown drivers", () => {
  it("fails on unknown STORAGE_DRIVER", () => {
    const env = {
      ...PROD_BASE,
      STORAGE_DRIVER: "made-up",
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "STORAGE_DRIVER")[0];
    expect(hit.severity).toBe("fail");
  });

  it("fails on unknown EMAIL_DRIVER", () => {
    const env = {
      ...PROD_BASE,
      EMAIL_DRIVER: "smoke-signal",
    } as NodeJS.ProcessEnv;
    const r = validateEnv(env);
    const hit = findByName(r, "EMAIL_DRIVER")[0];
    expect(hit.severity).toBe("fail");
  });
});

describe("summarize + helpers", () => {
  it("counts severities correctly", () => {
    const s = summarize([
      { name: "a", severity: "ok", detail: "" },
      { name: "b", severity: "warn", detail: "" },
      { name: "c", severity: "fail", detail: "" },
      { name: "d", severity: "ok", detail: "" },
    ]);
    expect(s).toEqual({ passed: 2, warnings: 1, failures: 1 });
  });

  it("describeDatabaseUrl masks credentials", () => {
    const desc = describeDatabaseUrl(
      "postgresql://user:secret@db.example.com:5432/internship?sslmode=require",
    );
    expect(desc).not.toContain("secret");
    expect(desc).not.toContain("user");
    expect(desc).toContain("host=db.example.com");
    expect(desc).toContain("db=internship");
  });

  it("describeDatabaseUrl handles missing/unparseable", () => {
    expect(describeDatabaseUrl(undefined)).toBe("missing");
    expect(describeDatabaseUrl("not-a-url")).toBe("unparseable");
  });

  it("maskEmail keeps the domain visible", () => {
    expect(maskEmail("admin@example.com")).toBe("a****@example.com");
  });
});
