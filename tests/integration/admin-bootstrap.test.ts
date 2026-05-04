// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/client";
import { parseAdminBootstrapEnv } from "../../scripts/admin-create-env";
import { createAdminUser } from "../../scripts/admin-create-lib";

/**
 * ⚠️  Integration tests — run against the dev DATABASE_URL only.
 *
 * NEVER run `npm run test:integration` (or `npm test`) with a
 * production DATABASE_URL exported in the shell. This file inserts
 * and deletes User rows directly. Doing so against production would
 * corrupt the live admin set.
 *
 * The tests are gated on `DATABASE_URL` so a CI run without one
 * silently skips them. They use the `@example.test` reserved domain
 * (RFC 6761) and a unique RUN_ID prefix so cleanup never touches
 * production data even if pointed at the wrong DB by accident.
 */

const RUN_ID = `admin${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];
const skip = !process.env.DATABASE_URL;

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

function emailFor(suffix: string): string {
  return `${RUN_ID}-${suffix}@example.test`;
}

const VALID_PASSWORD = "this-is-a-sufficiently-long-passphrase";

describe("parseAdminBootstrapEnv", () => {
  it("rejects missing ADMIN_EMAIL or ADMIN_PASSWORD", () => {
    expect(parseAdminBootstrapEnv({} as unknown as NodeJS.ProcessEnv).ok).toBe(false);
    expect(
      parseAdminBootstrapEnv({
        ADMIN_EMAIL: "x@example.test",
      } as unknown as NodeJS.ProcessEnv).ok,
    ).toBe(false);
    expect(
      parseAdminBootstrapEnv({
        ADMIN_PASSWORD: VALID_PASSWORD,
      } as unknown as NodeJS.ProcessEnv).ok,
    ).toBe(false);
  });

  it("rejects when CREATE_ADMIN_CONFIRM is missing", () => {
    const r = parseAdminBootstrapEnv({
      ADMIN_EMAIL: "admin@example.test",
      ADMIN_PASSWORD: VALID_PASSWORD,
    } as unknown as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/CREATE_ADMIN_CONFIRM/);
  });

  it("rejects when CREATE_ADMIN_CONFIRM does not match ADMIN_EMAIL", () => {
    const r = parseAdminBootstrapEnv({
      ADMIN_EMAIL: "admin@example.test",
      ADMIN_PASSWORD: VALID_PASSWORD,
      CREATE_ADMIN_CONFIRM: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/does not match/);
  });

  it("rejects malformed ADMIN_EMAIL", () => {
    const r = parseAdminBootstrapEnv({
      ADMIN_EMAIL: "not-an-email",
      ADMIN_PASSWORD: VALID_PASSWORD,
      CREATE_ADMIN_CONFIRM: "not-an-email",
    } as unknown as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/valid email/);
  });

  it("rejects passwords shorter than 16 characters", () => {
    const r = parseAdminBootstrapEnv({
      ADMIN_EMAIL: "admin@example.test",
      ADMIN_PASSWORD: "shortpass-15chrs",
      CREATE_ADMIN_CONFIRM: "admin@example.test",
    } as unknown as NodeJS.ProcessEnv);
    // exactly 16 chars passes; shorter fails:
    expect(r.ok).toBe(true);
    const r2 = parseAdminBootstrapEnv({
      ADMIN_EMAIL: "admin@example.test",
      ADMIN_PASSWORD: "shortpass-too-x", // 15
      CREATE_ADMIN_CONFIRM: "admin@example.test",
    } as unknown as NodeJS.ProcessEnv);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/at least 16/);
  });

  it("rejects passwords longer than 72 UTF-8 bytes", () => {
    const r = parseAdminBootstrapEnv({
      ADMIN_EMAIL: "admin@example.test",
      ADMIN_PASSWORD: "x".repeat(73),
      CREATE_ADMIN_CONFIRM: "admin@example.test",
    } as unknown as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/72-byte cap/);
  });

  it("normalizes ADMIN_EMAIL via trim/lowercase and matches against confirm", () => {
    const r = parseAdminBootstrapEnv({
      ADMIN_EMAIL: "  Admin@Example.Test  ",
      ADMIN_PASSWORD: VALID_PASSWORD,
      CREATE_ADMIN_CONFIRM: "admin@example.test",
    } as unknown as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.email).toBe("admin@example.test");
  });
});

describe.skipIf(skip)("createAdminUser", () => {
  it("creates a fresh ADMIN with a verifiable bcrypt hash", async () => {
    const email = emailFor("fresh");
    const result = await createAdminUser({
      email,
      password: VALID_PASSWORD,
    });
    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    createdUserIds.push(result.userId);

    const row = await prisma.user.findUnique({
      where: { id: result.userId },
      select: { email: true, role: true, deletedAt: true, passwordHash: true },
    });
    expect(row).not.toBeNull();
    expect(row?.email).toBe(email);
    expect(row?.role).toBe("ADMIN");
    expect(row?.deletedAt).toBeNull();
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toBe(VALID_PASSWORD);
    expect(await verifyPassword(VALID_PASSWORD, row!.passwordHash!)).toBe(true);
  });

  it("returns already_admin on re-run with the same email and does not rotate the password", async () => {
    const email = emailFor("idempotent");
    const first = await createAdminUser({
      email,
      password: VALID_PASSWORD,
    });
    expect(first.kind).toBe("created");
    if (first.kind !== "created") return;
    createdUserIds.push(first.userId);

    const originalHash = (
      await prisma.user.findUniqueOrThrow({
        where: { id: first.userId },
        select: { passwordHash: true },
      })
    ).passwordHash;

    // Same password — idempotent noop.
    const second = await createAdminUser({
      email,
      password: VALID_PASSWORD,
    });
    expect(second.kind).toBe("already_admin");
    if (second.kind === "already_admin") {
      expect(second.userId).toBe(first.userId);
    }

    // Different password — STILL idempotent noop. Hash unchanged.
    const third = await createAdminUser({
      email,
      password: "completely-different-passphrase",
    });
    expect(third.kind).toBe("already_admin");

    const finalHash = (
      await prisma.user.findUniqueOrThrow({
        where: { id: first.userId },
        select: { passwordHash: true },
      })
    ).passwordHash;
    expect(finalHash).toBe(originalHash);
  });

  it("refuses to mutate a STUDENT into an ADMIN", async () => {
    const email = emailFor("student-collision");
    const stud = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(VALID_PASSWORD),
        role: "STUDENT",
      },
      select: { id: true },
    });
    createdUserIds.push(stud.id);

    const result = await createAdminUser({
      email,
      password: VALID_PASSWORD,
    });
    expect(result.kind).toBe("email_taken_by_other_role");
    if (result.kind === "email_taken_by_other_role") {
      expect(result.existingRole).toBe("STUDENT");
    }

    // Verify the existing row is untouched.
    const stillStudent = await prisma.user.findUniqueOrThrow({
      where: { id: stud.id },
      select: { role: true },
    });
    expect(stillStudent.role).toBe("STUDENT");
  });

  it("refuses to mutate a COMPANY into an ADMIN", async () => {
    const email = emailFor("company-collision");
    const co = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(VALID_PASSWORD),
        role: "COMPANY",
      },
      select: { id: true },
    });
    createdUserIds.push(co.id);

    const result = await createAdminUser({
      email,
      password: VALID_PASSWORD,
    });
    expect(result.kind).toBe("email_taken_by_other_role");
    if (result.kind === "email_taken_by_other_role") {
      expect(result.existingRole).toBe("COMPANY");
    }
  });

  it("treats a soft-deleted same-email STUDENT as not-blocking", async () => {
    const email = emailFor("soft-deleted");
    const stud = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(VALID_PASSWORD),
        role: "STUDENT",
        deletedAt: new Date(),
      },
      select: { id: true },
    });
    createdUserIds.push(stud.id);

    const result = await createAdminUser({
      email,
      password: VALID_PASSWORD,
    });
    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      createdUserIds.push(result.userId);
      expect(result.userId).not.toBe(stud.id);
    }

    // Both rows now exist with the same email — only the new one is active.
    const active = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, role: true },
    });
    expect(active?.role).toBe("ADMIN");
  });
});
