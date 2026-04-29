// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { authenticateCredentials } from "@/lib/auth/credentials";
import { getFreshCompanyApprovalStatus } from "@/lib/auth/company-approval";
import { prisma } from "@/lib/db/client";
import { createUserWithCredentials } from "@/server/services/auth-service";

const RUN_ID = `auth${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

describe.skipIf(skip)("createUserWithCredentials (signup service)", () => {
  it("creates a STUDENT user and stores a hashed password", async () => {
    const email = `${RUN_ID}-student@test.local`;
    const result = await createUserWithCredentials({
      email,
      password: "longenough",
      role: "STUDENT",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      createdUserIds.push(result.userId);
      const stored = await prisma.user.findUnique({
        where: { id: result.userId },
        select: { email: true, role: true, passwordHash: true },
      });
      expect(stored?.email).toBe(email);
      expect(stored?.role).toBe("STUDENT");
      expect(stored?.passwordHash).toBeTruthy();
      expect(stored?.passwordHash).not.toBe("longenough");
    }
  });

  it("rejects a duplicate active email", async () => {
    const email = `${RUN_ID}-dup@test.local`;
    const a = await createUserWithCredentials({
      email,
      password: "longenough",
      role: "STUDENT",
    });
    expect(a.ok).toBe(true);
    if (a.ok) createdUserIds.push(a.userId);

    const b = await createUserWithCredentials({
      email,
      password: "longenough",
      role: "COMPANY",
    });
    expect(b.ok).toBe(false);
    expect(b.ok || (b as any).reason).toBe("email_taken");
  });

  it("allows reusing an email after the prior user is soft-deleted", async () => {
    const email = `${RUN_ID}-reuse@test.local`;
    const a = await createUserWithCredentials({
      email,
      password: "longenough",
      role: "STUDENT",
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    createdUserIds.push(a.userId);

    await prisma.user.update({
      where: { id: a.userId },
      data: { deletedAt: new Date() },
    });

    const b = await createUserWithCredentials({
      email,
      password: "longenough",
      role: "COMPANY",
    });
    expect(b.ok).toBe(true);
    if (b.ok) createdUserIds.push(b.userId);
  });
});

describe.skipIf(skip)("Credentials authorize() lookup", () => {
  it("returns the user shape on a correct password", async () => {
    const email = `${RUN_ID}-login@test.local`;
    const r = await createUserWithCredentials({
      email,
      password: "longenough",
      role: "COMPANY",
    });
    if (r.ok) createdUserIds.push(r.userId);

    const authResult = await authenticateCredentials(
      email,
      "longenough",
    );
    expect(authResult).not.toBeNull();
    expect(authResult?.email).toBe(email);
    expect(authResult?.role).toBe("COMPANY");
  });

  it("returns null on a wrong password", async () => {
    const email = `${RUN_ID}-wrongpw@test.local`;
    const r = await createUserWithCredentials({
      email,
      password: "longenough",
      role: "STUDENT",
    });
    if (r.ok) createdUserIds.push(r.userId);

    const authResult = await authenticateCredentials(
      email,
      "not-the-password",
    );
    expect(authResult).toBeNull();
  });

  it("returns null for an unknown email", async () => {
    const authResult = await authenticateCredentials(
      `${RUN_ID}-no-such@test.local`,
      "anything",
    );
    expect(authResult).toBeNull();
  });

  it("returns null for a soft-deleted user (cannot log in)", async () => {
    const email = `${RUN_ID}-deleted@test.local`;
    const r = await createUserWithCredentials({
      email,
      password: "longenough",
      role: "STUDENT",
    });
    if (!r.ok) return;
    createdUserIds.push(r.userId);

    await prisma.user.update({
      where: { id: r.userId },
      data: { deletedAt: new Date() },
    });

    const authResult = await authenticateCredentials(
      email,
      "longenough",
    );
    expect(authResult).toBeNull();
  });
});

describe.skipIf(skip)("getFreshCompanyApprovalStatus", () => {
  it("returns null when the user has no company profile", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-no-co@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!r.ok) return;
    createdUserIds.push(r.userId);

    const status = await getFreshCompanyApprovalStatus(r.userId);
    expect(status).toBeNull();
  });

  it("reads the current approvalStatus from the database, not a cache", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-fresh@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!r.ok) return;
    createdUserIds.push(r.userId);

    await prisma.companyProfile.create({
      data: {
        userId: r.userId,
        companyName: "Fresh Co",
        slug: `${RUN_ID}-fresh-co`,
      },
    });
    expect(await getFreshCompanyApprovalStatus(r.userId)).toBe("PENDING");

    await prisma.companyProfile.update({
      where: { userId: r.userId },
      data: { approvalStatus: "APPROVED" },
    });
    expect(await getFreshCompanyApprovalStatus(r.userId)).toBe("APPROVED");

    await prisma.companyProfile.update({
      where: { userId: r.userId },
      data: { approvalStatus: "SUSPENDED" },
    });
    expect(await getFreshCompanyApprovalStatus(r.userId)).toBe("SUSPENDED");
  });
});
