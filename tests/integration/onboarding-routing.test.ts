// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import { createUserWithCredentials } from "@/server/services/auth-service";
import {
  decideLandingFor,
  needsCompanyOnboarding,
  needsStudentOnboarding,
} from "@/server/services/onboarding-service";

const RUN_ID = `onboard${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

let seededAdminId: string;
let seededStudentCompleteId: string; // student01 — complete profile
let seededStudentIncompleteId: string; // student08 — incomplete profile
let seededApprovedCompanyId: string; // acme
let seededPendingCompanyId: string; // globex
let seededSuspendedCompanyId: string; // initech

beforeAll(async () => {
  if (skip) return;
  // Pull IDs from the seeded dataset. These tests assume `npm run db:seed`
  // has been executed (Task 4 contract).
  const admin = await prisma.user.findFirstOrThrow({
    where: { email: "admin@example.test", deletedAt: null },
    select: { id: true },
  });
  const studentComplete = await prisma.user.findFirstOrThrow({
    where: { email: "student01@example.test", deletedAt: null },
    select: { id: true },
  });
  const studentIncomplete = await prisma.user.findFirstOrThrow({
    where: { email: "student08@example.test", deletedAt: null },
    select: { id: true },
  });
  const approvedCompany = await prisma.user.findFirstOrThrow({
    where: { email: "acme@example.test", deletedAt: null },
    select: { id: true },
  });
  const pendingCompany = await prisma.user.findFirstOrThrow({
    where: { email: "globex@example.test", deletedAt: null },
    select: { id: true },
  });
  const suspendedCompany = await prisma.user.findFirstOrThrow({
    where: { email: "initech@example.test", deletedAt: null },
    select: { id: true },
  });

  seededAdminId = admin.id;
  seededStudentCompleteId = studentComplete.id;
  seededStudentIncompleteId = studentIncomplete.id;
  seededApprovedCompanyId = approvedCompany.id;
  seededPendingCompanyId = pendingCompany.id;
  seededSuspendedCompanyId = suspendedCompany.id;
});

describe.skipIf(skip)("needsStudentOnboarding", () => {
  it("returns true for a fresh student with no profile row", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-fresh-student@test.local`,
      password: "longenough",
      role: "STUDENT",
    });
    if (!r.ok) throw new Error("setup failed");
    createdUserIds.push(r.userId);

    expect(await needsStudentOnboarding(r.userId)).toBe(true);
  });

  it("returns true for a student with isProfileComplete = false", async () => {
    expect(await needsStudentOnboarding(seededStudentIncompleteId)).toBe(true);
  });

  it("returns false for a student with isProfileComplete = true", async () => {
    expect(await needsStudentOnboarding(seededStudentCompleteId)).toBe(false);
  });
});

describe.skipIf(skip)("needsCompanyOnboarding", () => {
  it("returns true for a fresh company with no profile row", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-fresh-company@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!r.ok) throw new Error("setup failed");
    createdUserIds.push(r.userId);

    expect(await needsCompanyOnboarding(r.userId)).toBe(true);
  });

  it("returns true when companyName is blank", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-blank-co@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!r.ok) throw new Error("setup failed");
    createdUserIds.push(r.userId);

    await prisma.companyProfile.create({
      data: {
        userId: r.userId,
        companyName: "   ", // whitespace-only counts as not done
        slug: `${RUN_ID}-blank-slug`,
      },
    });

    expect(await needsCompanyOnboarding(r.userId)).toBe(true);
  });

  it("returns false for a fully-onboarded APPROVED company", async () => {
    expect(await needsCompanyOnboarding(seededApprovedCompanyId)).toBe(false);
  });

  it("returns false for a fully-onboarded PENDING company (approval is separate)", async () => {
    // PENDING != "still onboarding". A pending company has finished the
    // form; they're just waiting for admin review.
    expect(await needsCompanyOnboarding(seededPendingCompanyId)).toBe(false);
  });

  it("returns false for a fully-onboarded SUSPENDED company", async () => {
    expect(await needsCompanyOnboarding(seededSuspendedCompanyId)).toBe(false);
  });
});

describe.skipIf(skip)("decideLandingFor — post-signup / post-login routing", () => {
  it("routes ADMIN to /admin (admins skip onboarding entirely)", async () => {
    expect(await decideLandingFor("ADMIN", seededAdminId)).toBe("/admin");
  });

  it("routes a fresh STUDENT signup to /student/onboarding", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-route-student@test.local`,
      password: "longenough",
      role: "STUDENT",
    });
    if (!r.ok) throw new Error("setup failed");
    createdUserIds.push(r.userId);

    expect(await decideLandingFor("STUDENT", r.userId)).toBe(
      "/student/onboarding",
    );
  });

  it("routes a returning complete STUDENT to /student/dashboard", async () => {
    expect(await decideLandingFor("STUDENT", seededStudentCompleteId)).toBe(
      "/student/dashboard",
    );
  });

  it("routes a returning incomplete STUDENT to /student/onboarding", async () => {
    expect(await decideLandingFor("STUDENT", seededStudentIncompleteId)).toBe(
      "/student/onboarding",
    );
  });

  it("routes a fresh COMPANY signup to /company/onboarding", async () => {
    const r = await createUserWithCredentials({
      email: `${RUN_ID}-route-company@test.local`,
      password: "longenough",
      role: "COMPANY",
    });
    if (!r.ok) throw new Error("setup failed");
    createdUserIds.push(r.userId);

    expect(await decideLandingFor("COMPANY", r.userId)).toBe(
      "/company/onboarding",
    );
  });

  it("routes a returning APPROVED COMPANY to /company/dashboard", async () => {
    expect(await decideLandingFor("COMPANY", seededApprovedCompanyId)).toBe(
      "/company/dashboard",
    );
  });

  it("routes a returning PENDING COMPANY to /company/dashboard (not onboarding)", async () => {
    expect(await decideLandingFor("COMPANY", seededPendingCompanyId)).toBe(
      "/company/dashboard",
    );
  });

  it("routes a returning SUSPENDED COMPANY to /company/dashboard", async () => {
    expect(await decideLandingFor("COMPANY", seededSuspendedCompanyId)).toBe(
      "/company/dashboard",
    );
  });
});
