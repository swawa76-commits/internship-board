// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { authenticateCredentials } from "@/lib/auth/credentials";
import { prisma } from "@/lib/db/client";

afterAll(async () => {
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

/**
 * These tests run against the actual configured database. They expect
 * `npm run db:seed` to have been executed at least once. If the seed
 * has not been run, the row-count assertions will fail and prompt the
 * developer to seed before running integration tests.
 *
 * The seed script is idempotent, so re-running it does not break these.
 */
describe.skipIf(skip)("seed data: row counts and core relations", () => {
  it("has the seeded admin", async () => {
    const admin = await prisma.user.findFirst({
      where: { email: "admin@example.test", role: "ADMIN", deletedAt: null },
    });
    expect(admin).not.toBeNull();
  });

  it("has 3 company profiles, one per approval status", async () => {
    const [approved, pending, suspended, total] = await Promise.all([
      prisma.companyProfile.count({
        where: { approvalStatus: "APPROVED", deletedAt: null },
      }),
      prisma.companyProfile.count({
        where: { approvalStatus: "PENDING", deletedAt: null },
      }),
      prisma.companyProfile.count({
        where: { approvalStatus: "SUSPENDED", deletedAt: null },
      }),
      prisma.companyProfile.count({ where: { deletedAt: null } }),
    ]);
    expect(total).toBeGreaterThanOrEqual(3);
    expect(approved).toBeGreaterThanOrEqual(1);
    expect(pending).toBeGreaterThanOrEqual(1);
    expect(suspended).toBeGreaterThanOrEqual(1);
  });

  it("has at least 10 student profiles", async () => {
    expect(await prisma.studentProfile.count()).toBeGreaterThanOrEqual(10);
  });

  it("has at least 12 job postings", async () => {
    expect(
      await prisma.jobPosting.count({ where: { deletedAt: null } }),
    ).toBeGreaterThanOrEqual(12);
  });

  it("has at least 15 applications", async () => {
    expect(await prisma.application.count()).toBeGreaterThanOrEqual(15);
  });

  it("has at least one message thread, and every message thread is tied to a real application", async () => {
    const threads = await prisma.messageThread.findMany({
      select: { id: true, applicationId: true },
    });
    expect(threads.length).toBeGreaterThan(0);

    const appIds = new Set(
      (await prisma.application.findMany({ select: { id: true } })).map(
        (a) => a.id,
      ),
    );
    const orphaned = threads.filter((t) => !appIds.has(t.applicationId));
    expect(orphaned).toHaveLength(0);
  });

  it("has messages, and every message references a real thread", async () => {
    const messages = await prisma.message.findMany({
      select: { id: true, threadId: true },
    });
    expect(messages.length).toBeGreaterThan(0);

    const threadIds = new Set(
      (await prisma.messageThread.findMany({ select: { id: true } })).map(
        (t) => t.id,
      ),
    );
    const orphaned = messages.filter((m) => !threadIds.has(m.threadId));
    expect(orphaned).toHaveLength(0);
  });

  it("every seeded message thread is initiated by a COMPANY user", async () => {
    // Per CLAUDE.md, students cannot initiate threads. Any message thread
    // created by the seed must be from a company-role user.
    const threads = await prisma.messageThread.findMany({
      select: { initiatedByUser: { select: { role: true } } },
    });
    expect(threads.length).toBeGreaterThan(0);
    for (const t of threads) {
      expect(t.initiatedByUser.role).toBe("COMPANY");
    }
  });

  it("has a mix of complete and incomplete student profiles", async () => {
    // Required by the admin "needs attention" widgets in Task 15.
    const [complete, incomplete] = await Promise.all([
      prisma.studentProfile.count({ where: { isProfileComplete: true } }),
      prisma.studentProfile.count({ where: { isProfileComplete: false } }),
    ]);
    expect(complete).toBeGreaterThan(0);
    expect(incomplete).toBeGreaterThan(0);
    // Concretely: the seed targets 7 complete and 3 incomplete out of 10.
    expect(complete + incomplete).toBeGreaterThanOrEqual(10);
  });

  it("staggers user createdAt across at least 30 days", async () => {
    // Required for the admin dashboard's 7/30/90-day filters in Task 15.
    const oldest = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const newest = await prisma.user.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const spreadDays =
      ((newest?.createdAt.getTime() ?? 0) -
        (oldest?.createdAt.getTime() ?? 0)) /
      (1000 * 60 * 60 * 24);
    expect(spreadDays).toBeGreaterThan(30);
  });

  it("staggers job posting createdAt across at least 30 days", async () => {
    const oldest = await prisma.jobPosting.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const newest = await prisma.jobPosting.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const spreadDays =
      ((newest?.createdAt.getTime() ?? 0) -
        (oldest?.createdAt.getTime() ?? 0)) /
      (1000 * 60 * 60 * 24);
    expect(spreadDays).toBeGreaterThan(30);
  });

  it("never sets a job posting publishedAt meaningfully before its createdAt", async () => {
    // The seed explicitly stamps createdAt and publishedAt with the same
    // staggered "N days ago" math, so seeded rows satisfy this strictly.
    // Live rows created via the service path can have a few ms of skew
    // between JS-clock publishedAt and DB-clock createdAt; the
    // invariant is about catching real inversions (seconds+), not
    // network jitter, so we tolerate up to 5 seconds.
    const TOLERANCE_MS = 5_000;
    const inverted = await prisma.jobPosting.findMany({
      where: { publishedAt: { not: null } },
      select: { createdAt: true, publishedAt: true, slug: true },
    });
    for (const jp of inverted) {
      const delta = jp.publishedAt!.getTime() - jp.createdAt.getTime();
      expect(delta).toBeGreaterThan(-TOLERANCE_MS);
    }
  });

  it("uses multiple distinct programTag values", async () => {
    const tags = await prisma.companyProfile.findMany({
      where: { programTag: { not: null }, deletedAt: null },
      select: { programTag: true },
      distinct: ["programTag"],
    });
    expect(tags.length).toBeGreaterThanOrEqual(2);
  });

  it("has activity events covering signups, approvals, postings, applications", async () => {
    const types = await prisma.activityEvent.findMany({
      select: { type: true },
      distinct: ["type"],
    });
    const set = new Set(types.map((t) => t.type));
    for (const required of [
      "STUDENT_SIGNUP",
      "COMPANY_SIGNUP",
      "JOB_POSTING_PUBLISHED",
      "APPLICATION_SUBMITTED",
    ] as const) {
      expect(set.has(required)).toBe(true);
    }
  });
});

describe.skipIf(skip)("seed data: seeded users can log in", () => {
  const PASSWORD = "Password123!";

  it("admin can authenticate", async () => {
    const r = await authenticateCredentials("admin@example.test", PASSWORD);
    expect(r).not.toBeNull();
    expect(r?.role).toBe("ADMIN");
  });

  it("approved company can authenticate", async () => {
    const r = await authenticateCredentials("acme@example.test", PASSWORD);
    expect(r).not.toBeNull();
    expect(r?.role).toBe("COMPANY");
  });

  it("pending company can authenticate (auth ≠ approval)", async () => {
    const r = await authenticateCredentials("globex@example.test", PASSWORD);
    expect(r).not.toBeNull();
    expect(r?.role).toBe("COMPANY");
  });

  it("suspended company can still authenticate at the auth layer", async () => {
    // Approval gating happens at the publish/visibility layer, not here.
    const r = await authenticateCredentials("initech@example.test", PASSWORD);
    expect(r).not.toBeNull();
    expect(r?.role).toBe("COMPANY");
  });

  it("a sample student can authenticate", async () => {
    const r = await authenticateCredentials("student01@example.test", PASSWORD);
    expect(r).not.toBeNull();
    expect(r?.role).toBe("STUDENT");
  });

  it("the wrong password is rejected", async () => {
    const r = await authenticateCredentials("admin@example.test", "wrong");
    expect(r).toBeNull();
  });
});
