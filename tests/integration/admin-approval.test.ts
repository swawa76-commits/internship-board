// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/client";
import { createUserDirect, createUserWithCredentials } from "@/server/services/auth-service";
import {
  listCompaniesForAdmin,
  setCompanyApprovalStatus,
} from "@/server/services/admin-service";
import { upsertCompanyProfile } from "@/server/services/company-service";
import {
  canCompanyPublishJobs,
  canCompanyPublishJobsByStatus,
  canCompanyPublishJobsByUserId,
  publicJobPostingVisibilityWhere,
} from "@/server/services/visibility-service";

const RUN_ID = `adm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const skip = !process.env.DATABASE_URL;

const COMPLETE_INPUT = {
  companyName: "",
  industry: "Software",
  companySize: "11-50",
  headquarters: "Remote",
  shortDescription: "Test co for admin approval suite.",
  description: "An imaginary company solely used for integration tests.",
  contactEmail: "talent@test.local",
  websiteUrl: null,
  programTag: null,
};

async function makeCompany(suffix: string) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-${suffix}@test.local`,
    password: "longenough",
    role: "COMPANY",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  const profile = await upsertCompanyProfile(r.userId, {
    ...COMPLETE_INPUT,
    companyName: `Co ${suffix}`,
  });
  if (!profile.ok) throw new Error("profile setup failed");
  return { userId: r.userId, companyProfileId: profile.companyProfileId };
}

async function makeAdmin(suffix: string) {
  const u = await createUserDirect({
    email: `${RUN_ID}-admin-${suffix}@test.local`,
    password: "longenough",
    role: "ADMIN",
  });
  createdUserIds.push(u.id);
  return u.id;
}

async function makeStudent(suffix: string) {
  const r = await createUserWithCredentials({
    email: `${RUN_ID}-stud-${suffix}@test.local`,
    password: "longenough",
    role: "STUDENT",
  });
  if (!r.ok) throw new Error("setup failed");
  createdUserIds.push(r.userId);
  return r.userId;
}

describe.skipIf(skip)("admin-service · setCompanyApprovalStatus", () => {
  it("an admin can flip PENDING -> APPROVED", async () => {
    const adminId = await makeAdmin("approve-pending");
    const co = await makeCompany("approve-pending");
    expect(
      (await prisma.companyProfile.findUniqueOrThrow({
        where: { id: co.companyProfileId },
        select: { approvalStatus: true },
      })).approvalStatus,
    ).toBe("PENDING");

    const result = await setCompanyApprovalStatus(
      adminId,
      co.companyProfileId,
      "APPROVED",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.from).toBe("PENDING");
    expect(result.to).toBe("APPROVED");
    expect(result.noChange).toBe(false);

    const fresh = await prisma.companyProfile.findUniqueOrThrow({
      where: { id: co.companyProfileId },
      select: { approvalStatus: true },
    });
    expect(fresh.approvalStatus).toBe("APPROVED");
  });

  it("an admin can flip APPROVED -> SUSPENDED", async () => {
    const adminId = await makeAdmin("suspend");
    const co = await makeCompany("suspend");
    await setCompanyApprovalStatus(adminId, co.companyProfileId, "APPROVED");
    const result = await setCompanyApprovalStatus(
      adminId,
      co.companyProfileId,
      "SUSPENDED",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.from).toBe("APPROVED");
    expect(result.to).toBe("SUSPENDED");
  });

  it("a no-op (same status) does not write or log", async () => {
    const adminId = await makeAdmin("noop");
    const co = await makeCompany("noop");
    const eventsBefore = await prisma.activityEvent.count({
      where: { entityType: "CompanyProfile", entityId: co.companyProfileId },
    });

    const result = await setCompanyApprovalStatus(
      adminId,
      co.companyProfileId,
      "PENDING", // already PENDING
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noChange).toBe(true);

    const eventsAfter = await prisma.activityEvent.count({
      where: { entityType: "CompanyProfile", entityId: co.companyProfileId },
    });
    expect(eventsAfter).toBe(eventsBefore);
  });

  it("logs a COMPANY_APPROVAL_CHANGED activity event with from/to metadata", async () => {
    const adminId = await makeAdmin("log");
    const co = await makeCompany("log");
    await setCompanyApprovalStatus(adminId, co.companyProfileId, "APPROVED");

    const event = await prisma.activityEvent.findFirst({
      where: {
        type: "COMPANY_APPROVAL_CHANGED",
        entityType: "CompanyProfile",
        entityId: co.companyProfileId,
        actorUserId: adminId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(event).not.toBeNull();
    expect(event?.metadataJson).toMatchObject({
      from: "PENDING",
      to: "APPROVED",
    });
  });

  it("returns company_not_found for an unknown id", async () => {
    const adminId = await makeAdmin("missing");
    const result = await setCompanyApprovalStatus(
      adminId,
      "ckXXXXXXXXXXXXXXXXXXXXXXX", // valid-shape cuid that doesn't exist
      "APPROVED",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("company_not_found");
  });

  it("returns company_not_found for a soft-deleted company", async () => {
    const adminId = await makeAdmin("soft-deleted");
    const co = await makeCompany("soft-deleted");
    await prisma.companyProfile.update({
      where: { id: co.companyProfileId },
      data: { deletedAt: new Date() },
    });
    const result = await setCompanyApprovalStatus(
      adminId,
      co.companyProfileId,
      "APPROVED",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("company_not_found");
  });
});

describe.skipIf(skip)("admin-service · authorization", () => {
  it("rejects a STUDENT actor at the service layer", async () => {
    const studentId = await makeStudent("reject");
    const co = await makeCompany("reject-by-student");
    const result = await setCompanyApprovalStatus(
      studentId,
      co.companyProfileId,
      "APPROVED",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_admin");

    // And the row is unchanged.
    const fresh = await prisma.companyProfile.findUniqueOrThrow({
      where: { id: co.companyProfileId },
      select: { approvalStatus: true },
    });
    expect(fresh.approvalStatus).toBe("PENDING");
  });

  it("rejects a COMPANY actor (the target company's own user) at the service layer", async () => {
    const co = await makeCompany("self-approve");
    // The company tries to approve itself.
    const result = await setCompanyApprovalStatus(
      co.userId,
      co.companyProfileId,
      "APPROVED",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_admin");

    const fresh = await prisma.companyProfile.findUniqueOrThrow({
      where: { id: co.companyProfileId },
      select: { approvalStatus: true },
    });
    expect(fresh.approvalStatus).toBe("PENDING");
  });

  it("rejects a soft-deleted admin", async () => {
    const adminId = await makeAdmin("deleted");
    const co = await makeCompany("deleted-admin-target");
    await prisma.user.update({
      where: { id: adminId },
      data: { deletedAt: new Date() },
    });
    const result = await setCompanyApprovalStatus(
      adminId,
      co.companyProfileId,
      "APPROVED",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_admin");
  });
});

describe.skipIf(skip)("invariant: company-service.upsertCompanyProfile never writes approvalStatus", () => {
  it("a company saving its own profile cannot self-approve via the company-service path", async () => {
    const co = await makeCompany("invariant");
    // Force a known starting state so we can detect any bleed-through.
    await prisma.companyProfile.update({
      where: { id: co.companyProfileId },
      data: { approvalStatus: "SUSPENDED" },
    });

    // Even with a payload that *would* contain approvalStatus if the
    // service were sloppy, the service ignores it: the schema doesn't
    // include the field, so there's nothing to spread. We pass it as
    // an extra property to prove it gets dropped.
    await upsertCompanyProfile(co.userId, {
      ...COMPLETE_INPUT,
      companyName: "Renamed Co",
      // @ts-expect-error — explicitly verifying the service drops unknown fields
      approvalStatus: "APPROVED",
    });

    const fresh = await prisma.companyProfile.findUniqueOrThrow({
      where: { id: co.companyProfileId },
      select: { approvalStatus: true, companyName: true },
    });
    expect(fresh.companyName).toBe("Renamed Co");
    expect(fresh.approvalStatus).toBe("SUSPENDED"); // unchanged
  });
});

describe.skipIf(skip)("listCompaniesForAdmin", () => {
  it("returns all non-soft-deleted companies", async () => {
    const co = await makeCompany("list-include");
    const list = await listCompaniesForAdmin();
    expect(list.some((row) => row.id === co.companyProfileId)).toBe(true);
  });

  it("excludes soft-deleted companies", async () => {
    const co = await makeCompany("list-exclude");
    await prisma.companyProfile.update({
      where: { id: co.companyProfileId },
      data: { deletedAt: new Date() },
    });
    const list = await listCompaniesForAdmin();
    expect(list.some((row) => row.id === co.companyProfileId)).toBe(false);
  });
});

describe.skipIf(skip)("visibility-service · canCompanyPublishJobs*", () => {
  it("pure status check: only APPROVED returns true", () => {
    expect(canCompanyPublishJobsByStatus("APPROVED")).toBe(true);
    expect(canCompanyPublishJobsByStatus("PENDING")).toBe(false);
    expect(canCompanyPublishJobsByStatus("SUSPENDED")).toBe(false);
  });

  it("DB-backed check returns true for an APPROVED company, false for others", async () => {
    const adminId = await makeAdmin("vis");
    const co = await makeCompany("vis");

    // Initially PENDING.
    expect(await canCompanyPublishJobs(co.companyProfileId)).toBe(false);
    expect(await canCompanyPublishJobsByUserId(co.userId)).toBe(false);

    // Approve via the admin path.
    await setCompanyApprovalStatus(adminId, co.companyProfileId, "APPROVED");
    expect(await canCompanyPublishJobs(co.companyProfileId)).toBe(true);
    expect(await canCompanyPublishJobsByUserId(co.userId)).toBe(true);

    // Suspend.
    await setCompanyApprovalStatus(adminId, co.companyProfileId, "SUSPENDED");
    expect(await canCompanyPublishJobs(co.companyProfileId)).toBe(false);
    expect(await canCompanyPublishJobsByUserId(co.userId)).toBe(false);
  });

  it("returns false for a missing company", async () => {
    expect(await canCompanyPublishJobs("ckXXXXXXXXXXXXXXXXXXXXXXX")).toBe(
      false,
    );
  });

  it("returns false for a soft-deleted company even if its row is APPROVED", async () => {
    const adminId = await makeAdmin("vis-soft");
    const co = await makeCompany("vis-soft");
    await setCompanyApprovalStatus(adminId, co.companyProfileId, "APPROVED");
    await prisma.companyProfile.update({
      where: { id: co.companyProfileId },
      data: { deletedAt: new Date() },
    });
    expect(await canCompanyPublishJobs(co.companyProfileId)).toBe(false);
  });
});

describe.skipIf(skip)("visibility-service · publicJobPostingVisibilityWhere", () => {
  it("filters out postings owned by PENDING / SUSPENDED companies", async () => {
    const adminId = await makeAdmin("posting-filter");
    const approved = await makeCompany("posting-approved");
    const pending = await makeCompany("posting-pending");
    const suspended = await makeCompany("posting-suspended");

    await setCompanyApprovalStatus(
      adminId,
      approved.companyProfileId,
      "APPROVED",
    );
    await setCompanyApprovalStatus(
      adminId,
      suspended.companyProfileId,
      "SUSPENDED",
    );
    // pending is left at PENDING.

    // One PUBLISHED posting per company; only the APPROVED one should be visible.
    const slugBase = `${RUN_ID}-vis-where`;
    const a = await prisma.jobPosting.create({
      data: {
        companyProfileId: approved.companyProfileId,
        slug: `${slugBase}-a`,
        title: "Approved-co posting",
        workplaceType: "REMOTE",
        description: "x",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    const p = await prisma.jobPosting.create({
      data: {
        companyProfileId: pending.companyProfileId,
        slug: `${slugBase}-p`,
        title: "Pending-co posting",
        workplaceType: "REMOTE",
        description: "x",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    const s = await prisma.jobPosting.create({
      data: {
        companyProfileId: suspended.companyProfileId,
        slug: `${slugBase}-s`,
        title: "Suspended-co posting",
        workplaceType: "REMOTE",
        description: "x",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    const visibleIds = new Set(
      (
        await prisma.jobPosting.findMany({
          where: publicJobPostingVisibilityWhere(),
          select: { id: true },
        })
      ).map((r) => r.id),
    );
    expect(visibleIds.has(a.id)).toBe(true);
    expect(visibleIds.has(p.id)).toBe(false);
    expect(visibleIds.has(s.id)).toBe(false);
  });

  it("filters out non-PUBLISHED postings even from APPROVED companies", async () => {
    const adminId = await makeAdmin("status-filter");
    const co = await makeCompany("status-filter");
    await setCompanyApprovalStatus(adminId, co.companyProfileId, "APPROVED");

    const draft = await prisma.jobPosting.create({
      data: {
        companyProfileId: co.companyProfileId,
        slug: `${RUN_ID}-draft`,
        title: "Draft posting",
        workplaceType: "REMOTE",
        description: "x",
        status: "DRAFT",
      },
    });
    const closed = await prisma.jobPosting.create({
      data: {
        companyProfileId: co.companyProfileId,
        slug: `${RUN_ID}-closed`,
        title: "Closed posting",
        workplaceType: "REMOTE",
        description: "x",
        status: "CLOSED",
      },
    });
    const published = await prisma.jobPosting.create({
      data: {
        companyProfileId: co.companyProfileId,
        slug: `${RUN_ID}-published`,
        title: "Published posting",
        workplaceType: "REMOTE",
        description: "x",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    const visibleIds = new Set(
      (
        await prisma.jobPosting.findMany({
          where: publicJobPostingVisibilityWhere(),
          select: { id: true },
        })
      ).map((r) => r.id),
    );
    expect(visibleIds.has(published.id)).toBe(true);
    expect(visibleIds.has(draft.id)).toBe(false);
    expect(visibleIds.has(closed.id)).toBe(false);
  });
});
